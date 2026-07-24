import type {
  ChainBlueprint,
  ChainPassage,
  DefinitionLanguage,
  WordBankManifest,
  WordEntry,
  WordExplanation,
  WordCoachReviewVerdict,
  WordCoachSemanticIssue,
  WordSenseExample,
} from '../domain/models';
import {
  CHAIN_MAX_SIZE,
  CHAIN_TARGET_SIZE,
} from '../domain/adaptive';
import {
  SENTENCE_LEVEL_POLICIES,
  countTargetOccurrences,
  type SentenceLevelPolicy,
} from '../domain/sentencePolicy';
import {
  parseDefinitionSenses,
  primarySense,
  type DefinitionSense,
} from '../domain/wordText';

export type AiAuthMode = 'bearer' | 'api-key';

export interface AiConnectionConfig {
  endpoint: string;
  model: string;
  apiKey: string;
  authMode: AiAuthMode;
  outputLanguage: string;
}

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface CompletionRequestOptions {
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: Record<string, unknown>;
}

export interface ChainReading {
  chainIndex: number;
  passage: ChainPassage;
  words: WordEntry[];
}

interface ChainSenseHintPayload {
  word: string;
  meaningZh: string;
}

interface ChainReadingPayload {
  passage: string;
  translation: string;
  usedWords: string[];
  senseHints: ChainSenseHintPayload[];
}

export const DEFAULT_AI_CONFIG: AiConnectionConfig = {
  endpoint: 'https://api.openai.com/v1',
  model: '',
  apiKey: '',
  authMode: 'bearer',
  outputLanguage: 'Simplified Chinese',
};

export function isAiConfigured(config: AiConnectionConfig): boolean {
  return Boolean(config.endpoint.trim() && config.apiKey.trim());
}

export function resolveCompletionUrl(endpoint: string): string {
  const value = endpoint.trim();
  if (!value) throw new Error('请填写接口地址。');

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('接口地址不是有效 URL。');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('接口地址必须使用 HTTP 或 HTTPS。');
  }

  if (!url.pathname.replace(/\/$/, '').endsWith('/chat/completions')) {
    url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/completions`;
  }
  return url.toString();
}

/**
 * Builds guidance for a failed fetch (a TypeError, which the browser also raises
 * for connection-refused, mixed-content and blocked private-network requests).
 * Loopback endpoints called from a deployed HTTPS page are the common trap, so
 * that case gets specific, actionable steps instead of a generic message.
 */
function connectionFailureMessage(endpoint: string): string {
  let host = '';
  let endpointIsHttp = false;
  try {
    const url = new URL(resolveCompletionUrl(endpoint));
    host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    endpointIsHttp = url.protocol === 'http:';
  } catch {
    return '浏览器无法连接该接口。请检查地址、HTTPS 与 CORS 设置。';
  }

  const isLoopback = host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    || host === '0.0.0.0';
  const pageIsHttps = typeof globalThis.location !== 'undefined'
    && globalThis.location.protocol === 'https:';

  if (isLoopback) {
    if (pageIsHttps && endpointIsHttp) {
      return '无法连接本地模型：本站以 HTTPS 打开，却要访问本机 http:// 服务，浏览器会拦截或拒绝。'
        + '请确认①本地模型已启动并监听该端口（localhost 与 127.0.0.1 可互换再试）；'
        + '②本地服务已开启 CORS 并放行本站来源。'
        + '要用本地模型，最稳妥的是本地运行本应用（npm run dev）后再连本地模型，或用 HTTPS 隧道把模型暴露出来。';
    }
    return '无法连接本地模型：请确认服务已启动、端口正确（localhost 与 127.0.0.1 可互换再试），并已开启 CORS 放行本站来源。';
  }

  return '浏览器无法连接该接口。请检查地址、HTTPS 与 CORS 设置。';
}

function responseError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return fallback;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' ? message : fallback;
}

function responseContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return '';
  const message = choices[0]?.message;
  if (!message || typeof message !== 'object') return '';
  const content = (message as { content?: unknown }).content;
  return typeof content === 'string' ? content.trim() : '';
}

export async function requestCompletion(
  config: AiConnectionConfig,
  messages: ChatMessage[],
  fetcher: typeof fetch = fetch,
  options: CompletionRequestOptions = {},
): Promise<string> {
  if (!isAiConfigured(config)) throw new Error('AI 连接尚未配置完整。');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.authMode === 'api-key') {
    headers['api-key'] = config.apiKey;
  } else {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const body: Record<string, unknown> = {
    messages,
    temperature: options.temperature ?? 0.35,
  };
  if (config.model.trim()) body.model = config.model.trim();
  if (options.maxTokens) body.max_tokens = options.maxTokens;
  if (options.responseFormat) body.response_format = options.responseFormat;

  try {
    const response = await fetcher(resolveCompletionUrl(config.endpoint), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: options.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(responseError(payload, `AI 请求失败 (${response.status})`));
    }
    const content = responseContent(payload);
    if (!content) throw new Error('AI 返回了空内容。');
    return content;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('AI 句子生成超时，已切换到离线串联。');
    }
    if (error instanceof TypeError) {
      throw new Error(connectionFailureMessage(config.endpoint));
    }
    throw error;
  }
}

function parseJsonResponse(
  content: string,
  errorMessage = 'AI 没有返回有效的句子数据，已切换到离线串联。',
): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
  try {
    return JSON.parse(fenced ?? trimmed);
  } catch {
    throw new Error(errorMessage);
  }
}

interface SenseExamplePayload {
  language?: unknown;
  senseIndex?: unknown;
  sentence?: unknown;
  translation?: unknown;
  englishSentence?: unknown;
  localizedTranslation?: unknown;
}

interface ValidSenseExamplePayload {
  language: DefinitionLanguage;
  senseIndex: number;
  sentence: string;
  translation: string;
}

interface CoachSensePayload {
  sourceStatus?: unknown;
  distinction?: unknown;
  pattern?: unknown;
  englishSentence?: unknown;
  localizedTranslation?: unknown;
}

const WORD_COACH_TEXT_LIMITS = {
  label: 48,
  memoryHook: 1000,
  distinction: 600,
  pattern: 200,
  usageGuide: 500,
  sentence: 180,
  translation: 220,
} as const;

const QUALITY_ISSUE_CODES = [
  'source_conflict',
  'sense_mismatch',
  'unnatural_example',
  'translation_error',
  'unsupported_claim',
  'missing_gloss',
  'misleading_usage',
  'other',
] as const;

export interface WordExplanationQualityReview {
  verdict: WordCoachReviewVerdict;
  issues: WordCoachSemanticIssue[];
}

function plainText(value: unknown, field: string, maxLength?: number): string {
  if (typeof value !== 'string') throw new Error(`AI 词汇讲解缺少 ${field}。`);
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) throw new Error(`AI 词汇讲解缺少 ${field}。`);
  if (/\*\*|__|`|<\/?[A-Za-z][^>]*>/.test(text)) {
    throw new Error(`AI 词汇讲解的 ${field} 必须是纯文本。`);
  }
  if (maxLength && text.length > maxLength) {
    throw new Error(`AI 词汇讲解的 ${field} 不得超过 ${maxLength} 个字符。`);
  }
  return text;
}

function escapeMarkdownInline(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/([`*_[\]<>])/g, '\\$1');
}

function validateCoachLabels(labels: readonly string[], targetWord: string): void {
  const normalizedTarget = targetWord.trim().toLowerCase();
  if (new Set(labels).size !== labels.length
    || labels.some((label) => (
      label.length > WORD_COACH_TEXT_LIMITS.label
      || (normalizedTarget && sentenceUsesTargetWord(label, normalizedTarget))
    ))) {
    throw new Error('AI 词汇讲解的栏目标签必须是简短、通用且互不重复的名称。');
  }
}

function hasInvalidSpellingCue(memoryHook: string, targetWord: string): boolean {
  const expected = targetWord.replace(/[^A-Za-z]/g, '').toLowerCase();
  if (expected.length < 2) return false;
  const cues = memoryHook.match(/\b[A-Za-z](?:[\s.-]+[A-Za-z]){1,}\b/g) ?? [];
  return cues.some((cue) => (
    cue.replace(/[^A-Za-z]/g, '').toLowerCase() !== expected
  ));
}

function hasPhoneticClaim(memoryHook: string): boolean {
  return /\/[^/\n]+\/|(?:发音|读音|音标|重音|pronunciation|phonetic|stress)/iu
    .test(memoryHook);
}

function hasInvalidMorphologyClaim(memoryHook: string, targetWord: string): boolean {
  if (!/(?:词根|词缀|前缀|后缀|\broot\b|\baffix\b|\bprefix\b|\bsuffix\b)/iu.test(memoryHook)) {
    return false;
  }
  const target = targetWord.toLowerCase();
  const allowedPrefixes = ['anti', 'auto', 'dis', 'inter', 'mis', 'non', 'over', 'post', 'pre', 're', 'sub', 'super', 'trans', 'un', 'under'];
  const allowedSuffixes = ['able', 'al', 'er', 'ful', 'less', 'ly', 'ment', 'ness', 'tion'];
  const hasVisibleProductiveAffix = allowedPrefixes.some((prefix) => (
    target.startsWith(prefix) && target.length >= prefix.length + 3
  )) || allowedSuffixes.some((suffix) => (
    target.endsWith(suffix) && target.length >= suffix.length + 3
  ));
  return !hasVisibleProductiveAffix;
}

function safeMemoryHook(
  memoryHook: string,
  targetWord: string,
  chineseSenses: readonly DefinitionSense[],
): string {
  if (!hasInvalidSpellingCue(memoryHook, targetWord)
    && !hasPhoneticClaim(memoryHook)
    && !hasInvalidMorphologyClaim(memoryHook, targetWord)) return memoryHook;
  const primaryMeaning = chineseSenses[0]?.text ?? targetWord;
  return `把 “${targetWord}” 和「${primaryMeaning}」放进一个清晰、具体的场景中记忆。`;
}

function completeCoachText(value: unknown, field: string, maxLength: number): string {
  const text = plainText(value, field, maxLength);
  if (/(?:例如|比如|举例|错误地说|正确说法(?:是)?|such as|for example|e\.g\.)[：:,，、\s]*$/iu
    .test(text)) {
    throw new Error(`AI 词汇讲解的 ${field} 以未完成的举例引导语结束。`);
  }
  return text;
}

function parseChineseSenseExamples(
  value: unknown,
  chineseSenseCount: number,
  targetWord: string,
): WordSenseExample[] {
  if (!Array.isArray(value)) throw new Error('AI 词汇讲解内容不完整。');
  const examples = value.flatMap((raw): ValidSenseExamplePayload[] => {
    if (!raw || typeof raw !== 'object') return [];
    const example = raw as SenseExamplePayload;
    const sentence = typeof example.englishSentence === 'string'
      ? example.englishSentence
      : example.sentence;
    const translation = typeof example.localizedTranslation === 'string'
      ? example.localizedTranslation
      : example.translation;
    if (example.language !== 'zh'
      || typeof example.senseIndex !== 'number'
      || !Number.isInteger(example.senseIndex)
      || typeof sentence !== 'string'
      || !sentence.trim()
      || typeof translation !== 'string'
      || !translation.trim()) return [];
    return [{
      language: 'zh',
      senseIndex: example.senseIndex,
      sentence,
      translation,
    }];
  });
  const relevantExamples = examples.filter((example) => (
    example.senseIndex >= 0 && example.senseIndex < chineseSenseCount
  ));
  if (new Set(relevantExamples.map((example) => example.senseIndex)).size
      !== relevantExamples.length) {
    throw new Error('AI 返回的义项例句数量不正确。');
  }
  return Array.from({ length: chineseSenseCount }, (_, senseIndex) => {
    const match = relevantExamples.find((example) => example.senseIndex === senseIndex);
    if (!match) throw new Error(`AI 未给出中文第 ${senseIndex + 1} 个义项的例句。`);
    const sentence = match.sentence.trim();
    const latinWords = sentence.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? [];
    if (latinWords.length < 3 || /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(sentence)) {
      throw new Error(`AI 为中文第 ${senseIndex + 1} 个义项返回的不是英文例句。`);
    }
    if (!sentenceUsesTargetWord(sentence, targetWord)) {
      throw new Error(`AI 为中文第 ${senseIndex + 1} 个义项的例句未使用目标词。`);
    }
    return {
      language: 'zh' as DefinitionLanguage,
      senseIndex,
      sentence: plainText(sentence, `中文第 ${senseIndex + 1} 个义项的英文例句`, WORD_COACH_TEXT_LIMITS.sentence),
      translation: plainText(
        match.translation,
        `中文第 ${senseIndex + 1} 个义项的翻译`,
        WORD_COACH_TEXT_LIMITS.translation,
      ),
    };
  });
}

export function sentenceUsesTargetWord(sentence: string, targetWord: string): boolean {
  const target = targetWord.trim().toLowerCase();
  if (!target) return false;
  const forms = new Set([target]);
  const irregularForms: Record<string, string[]> = {
    be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
    do: ['does', 'did', 'done', 'doing'],
    go: ['goes', 'went', 'gone', 'going'],
    have: ['has', 'had', 'having'],
    make: ['made', 'making'],
    run: ['ran', 'running'],
    say: ['says', 'said', 'saying'],
    see: ['saw', 'seen', 'seeing'],
    take: ['took', 'taken', 'taking'],
    write: ['wrote', 'written', 'writing'],
  };
  irregularForms[target]?.forEach((form) => forms.add(form));
  if (/^[a-z]+$/.test(target)) {
    forms.add(`${target}s`);
    forms.add(`${target}es`);
    forms.add(`${target}ed`);
    forms.add(`${target}ing`);
    if (target.endsWith('e') && target.length > 2) {
      forms.add(`${target}d`);
      forms.add(`${target.slice(0, -1)}ing`);
    }
    if (/[^aeiou]y$/.test(target)) {
      forms.add(`${target.slice(0, -1)}ies`);
      forms.add(`${target.slice(0, -1)}ied`);
    }
    if (target.endsWith('ie')) forms.add(`${target.slice(0, -2)}ying`);
    if (/[^aeiou][aeiou][^aeiouwxy]$/.test(target)) {
      const finalLetter = target.at(-1);
      forms.add(`${target}${finalLetter}ed`);
      forms.add(`${target}${finalLetter}ing`);
    }
  }
  const tokens = sentence.toLowerCase().match(/[a-z]+(?:['’-][a-z]+)*/g) ?? [];
  return tokens.some((token) => forms.has(token));
}

export function parseStoredWordExplanation(
  value: unknown,
  chineseSenseCount: number,
  targetWord: string,
): WordExplanation {
  if (!value || typeof value !== 'object') throw new Error('静态词汇讲解内容无效。');
  const record = value as { coachMarkdown?: unknown; senseExamples?: unknown };
  const markdown = typeof record.coachMarkdown === 'string'
    ? record.coachMarkdown.trim()
    : '';
  if (!markdown) throw new Error('静态词汇讲解缺少正文。');
  return {
    markdown,
    senseExamples: parseChineseSenseExamples(
      record.senseExamples,
      chineseSenseCount,
      targetWord,
    ),
  };
}

export function parseWordExplanation(
  content: string,
  chineseSenses: readonly DefinitionSense[],
  targetWord: string,
): WordExplanation {
  const parsed = parseJsonResponse(content, 'AI 没有返回有效的词汇讲解数据。');
  const payload = Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : parsed;
  const record = payload && typeof payload === 'object'
    ? payload as {
        labels?: unknown;
        memoryHook?: unknown;
        senses?: unknown;
        senseContrast?: unknown;
        commonConfusion?: unknown;
        caution?: unknown;
      }
    : null;
  const labels = record?.labels && typeof record.labels === 'object'
    ? record.labels as {
        memoryHook?: unknown;
        senseMap?: unknown;
        usageGuide?: unknown;
        pattern?: unknown;
        senseContrast?: unknown;
        commonConfusion?: unknown;
        caution?: unknown;
      }
    : null;
  if (!record || !labels || !Array.isArray(record.senses)) {
    throw new Error('AI 词汇讲解内容不完整。');
  }

  const parsedLabels = {
    memoryHook: plainText(labels.memoryHook, '记忆钩子标题', WORD_COACH_TEXT_LIMITS.label),
    senseMap: plainText(labels.senseMap, '义项地图标题', WORD_COACH_TEXT_LIMITS.label),
    usageGuide: plainText(labels.usageGuide, '使用指南标题', WORD_COACH_TEXT_LIMITS.label),
    pattern: plainText(labels.pattern, '搭配标签', WORD_COACH_TEXT_LIMITS.label),
    senseContrast: plainText(labels.senseContrast, '义项对比标签', WORD_COACH_TEXT_LIMITS.label),
    commonConfusion: plainText(labels.commonConfusion, '常见混淆标签', WORD_COACH_TEXT_LIMITS.label),
    caution: plainText(labels.caution, '使用警告标签', WORD_COACH_TEXT_LIMITS.label),
  };
  validateCoachLabels(Object.values(parsedLabels), targetWord);

  const rawMemoryHook = plainText(
    record.memoryHook,
    '记忆钩子',
    WORD_COACH_TEXT_LIMITS.memoryHook,
  );
  const memoryHook = safeMemoryHook(rawMemoryHook, targetWord, chineseSenses);
  if (record.senses.length !== chineseSenses.length) {
    throw new Error('AI 返回的义项讲解数量不正确。');
  }
  const parsedSenses = record.senses.map((value, position) => {
    if (!value || typeof value !== 'object') {
      throw new Error(`AI 返回的第 ${position + 1} 条义项讲解无效。`);
    }
    const sense = value as CoachSensePayload;
    return {
      senseIndex: position,
      sourceStatus: sense.sourceStatus === 'questionable' ? 'questionable' : 'standard',
      distinction: plainText(
        sense.distinction,
        '义项辨析',
        WORD_COACH_TEXT_LIMITS.distinction,
      ),
      pattern: plainText(sense.pattern, '搭配或结构', WORD_COACH_TEXT_LIMITS.pattern),
      englishSentence: sense.englishSentence,
      localizedTranslation: sense.localizedTranslation,
    };
  });
  const usageGuide = {
    senseContrast: completeCoachText(
      record.senseContrast,
      '义项对比',
      WORD_COACH_TEXT_LIMITS.usageGuide,
    ),
    commonConfusion: completeCoachText(
      record.commonConfusion,
      '常见混淆',
      WORD_COACH_TEXT_LIMITS.usageGuide,
    ),
    caution: completeCoachText(
      record.caution,
      '使用警告',
      WORD_COACH_TEXT_LIMITS.usageGuide,
    ),
  };

  const senseExamples = parseChineseSenseExamples(
    parsedSenses.map((sense) => ({
      language: 'zh',
      senseIndex: sense.senseIndex,
      englishSentence: sense.englishSentence,
      localizedTranslation: sense.localizedTranslation,
    })),
    chineseSenses.length,
    targetWord,
  );
  const questionableSenseIndexes = new Set(parsedSenses
    .filter((sense) => sense.sourceStatus === 'questionable')
    .map((sense) => sense.senseIndex));
  for (const example of senseExamples) {
    if (!questionableSenseIndexes.has(example.senseIndex)) continue;
    const lowerSentence = example.sentence.toLowerCase();
    const isMetalinguistic = /\b(?:word|term|usage|sense|meaning)\b/.test(lowerSentence)
      || lowerSentence.includes('standard english');
    if (!lowerSentence.includes(targetWord.toLowerCase()) || !isMetalinguistic) {
      throw new Error(`AI 为可疑源义项 ${example.senseIndex + 1} 提供了误导性的实例，而非纠错说明。`);
    }
  }

  const noteByIndex = new Map(parsedSenses.map((sense) => [sense.senseIndex, sense]));
  const senseLines = chineseSenses.map((sense, senseIndex) => {
    const note = noteByIndex.get(senseIndex)!;
    const title = [sense.label, sense.text].filter(Boolean).join(' ');
    return `- **${escapeMarkdownInline(title)}**: ${escapeMarkdownInline(note.distinction)} `
      + `**${escapeMarkdownInline(parsedLabels.pattern)}:** ${escapeMarkdownInline(note.pattern)}`;
  });
  const usageLines = [
    `- **${escapeMarkdownInline(parsedLabels.senseContrast)}**: ${escapeMarkdownInline(usageGuide.senseContrast)}`,
    `- **${escapeMarkdownInline(parsedLabels.commonConfusion)}**: ${escapeMarkdownInline(usageGuide.commonConfusion)}`,
    `- **${escapeMarkdownInline(parsedLabels.caution)}**: ${escapeMarkdownInline(usageGuide.caution)}`,
  ];
  const markdown = [
    `### ${escapeMarkdownInline(parsedLabels.memoryHook)}`,
    '',
    escapeMarkdownInline(memoryHook),
    '',
    `### ${escapeMarkdownInline(parsedLabels.senseMap)}`,
    '',
    ...senseLines,
    '',
    `### ${escapeMarkdownInline(parsedLabels.usageGuide)}`,
    '',
    ...usageLines,
  ].join('\n');

  return { markdown, senseExamples };
}

export function parseWordExplanationQualityReview(
  content: string,
  chineseSenseCount: number,
): WordExplanationQualityReview {
  const payload = parseJsonResponse(content, 'AI 没有返回有效的词汇讲解审校数据。');
  if (!payload || typeof payload !== 'object') throw new Error('AI 词汇讲解审校内容不完整。');
  const candidate = payload as { verdict?: unknown; issues?: unknown };
  if ((candidate.verdict !== 'pass'
      && candidate.verdict !== 'warning'
      && candidate.verdict !== 'fail')
    || !Array.isArray(candidate.issues)) {
    throw new Error('AI 词汇讲解审校内容不完整。');
  }
  const issues: WordCoachSemanticIssue[] = candidate.issues.map((value, index) => {
    if (!value || typeof value !== 'object') throw new Error(`AI 第 ${index + 1} 条审校问题无效。`);
    const issue = value as {
      severity?: unknown;
      code?: unknown;
      senseIndex?: unknown;
      message?: unknown;
    };
    if ((issue.severity !== 'warning' && issue.severity !== 'error')
      || typeof issue.code !== 'string'
      || !QUALITY_ISSUE_CODES.includes(issue.code as typeof QUALITY_ISSUE_CODES[number])
      || !Number.isInteger(issue.senseIndex)
      || Number(issue.senseIndex) < -1
      || Number(issue.senseIndex) >= chineseSenseCount
      || typeof issue.message !== 'string'
      || !issue.message.trim()) {
      throw new Error(`AI 第 ${index + 1} 条审校问题无效。`);
    }
    return {
      severity: issue.severity,
      code: issue.code as WordCoachSemanticIssue['code'],
      senseIndex: Number(issue.senseIndex),
      message: issue.message.trim(),
    };
  });
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  if ((candidate.verdict === 'pass' && issues.length > 0)
    || (candidate.verdict === 'warning' && (issues.length === 0 || errorCount > 0))
    || (candidate.verdict === 'fail' && errorCount === 0)) {
    throw new Error('AI 词汇讲解审校结论与问题列表不一致。');
  }
  return { verdict: candidate.verdict, issues };
}

function wordExplanationQualityResponseFormat(): Record<string, unknown> {
  return { type: 'json_object' };
}

function wordExplanationResponseFormat(): Record<string, unknown> {
  return { type: 'json_object' };
}

function normalizeWord(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Resolves which supplied words the passage actually contains. Presence in the
 * text is authoritative — the app counts what the model really used — while the
 * model's self-reported usedWords list only narrows the choice when provided.
 * Mandatory seeds that appear are always practised even if the model forgot to
 * list them, and results are ordered by first appearance and capped.
 */
export function resolveUsedWords(
  passage: string,
  reported: string[],
  blueprint: ChainBlueprint,
): WordEntry[] {
  const seedIds = new Set(blueprint.seeds.map((word) => word.id));
  const candidates = [
    ...blueprint.seeds,
    ...blueprint.pool.filter((word) => !seedIds.has(word.id)),
  ];
  const present = candidates.filter((word) => countTargetOccurrences(passage, word.word) >= 1);

  const reportedSet = new Set(reported.map(normalizeWord).filter(Boolean));
  const chosen = reportedSet.size > 0
    ? present.filter((word) => (
      reportedSet.has(normalizeWord(word.word))
      || [...reportedSet].some((token) => countTargetOccurrences(token, word.word) >= 1)
    ))
    : [...present];

  const chosenIds = new Set(chosen.map((word) => word.id));
  present
    .filter((word) => seedIds.has(word.id) && !chosenIds.has(word.id))
    .forEach((word) => chosen.push(word));

  const firstIndex = (word: WordEntry): number => {
    const at = passage.toLowerCase().indexOf(word.word.toLowerCase());
    return at < 0 ? Number.MAX_SAFE_INTEGER : at;
  };
  return chosen
    .sort((left, right) => firstIndex(left) - firstIndex(right))
    .slice(0, CHAIN_MAX_SIZE);
}

export function parseChainReading(
  content: string,
  blueprint: ChainBlueprint,
  policy: SentenceLevelPolicy,
  options: { minWords?: number } = {},
): ChainReading {
  const payload = parseJsonResponse(content);
  const record = payload && typeof payload === 'object'
    ? payload as Partial<ChainReadingPayload>
    : null;
  const passage = typeof record?.passage === 'string' ? record.passage.trim() : '';
  const translation = typeof record?.translation === 'string' ? record.translation.trim() : '';
  if (!passage || !translation) {
    throw new Error('AI 阅读段落内容不完整，已切换到离线串联。');
  }

  const missingSeed = blueprint.seeds.find((word) => countTargetOccurrences(passage, word.word) < 1);
  if (missingSeed) {
    throw new Error(`AI 阅读段落缺少必练词 “${missingSeed.word}”。`);
  }

  const reported = Array.isArray(record?.usedWords)
    ? record.usedWords.filter((value): value is string => typeof value === 'string')
    : [];
  const words = resolveUsedWords(passage, reported, blueprint);
  const hints = Array.isArray(record?.senseHints)
    ? record.senseHints.filter((value): value is ChainSenseHintPayload => (
      Boolean(value)
      && typeof value === 'object'
      && typeof (value as Partial<ChainSenseHintPayload>).word === 'string'
      && typeof (value as Partial<ChainSenseHintPayload>).meaningZh === 'string'
    ))
    : [];
  const contextualMeanings: Record<string, string> = {};
  words.forEach((word) => {
    const hint = hints.find((item) => (
      normalizeWord(item.word) === normalizeWord(word.word)
      || countTargetOccurrences(item.word, word.word) > 0
    ));
    const meaning = hint?.meaningZh?.trim();
    if (meaning) contextualMeanings[word.id] = meaning;
  });
  const missingContext = words
    .filter((word) => !contextualMeanings[word.id])
    .map((word) => word.word);
  if (missingContext.length > 0) {
    throw new Error(`AI 未给出这些词在段落中的语境义：${missingContext.slice(0, 4).join('、')}`);
  }
  if (options.minWords && words.length < options.minWords) {
    throw new Error(`AI 阅读段落只自然用到 ${words.length} 个目标词，希望更丰富一些。`);
  }

  return {
    chainIndex: blueprint.chainIndex,
    passage: {
      text: passage,
      translation,
      source: 'ai',
      levelLabel: policy.levelLabel,
      ...(Object.keys(contextualMeanings).length > 0 ? { contextualMeanings } : {}),
    },
    words,
  };
}

function chainReadingResponseFormat(): Record<string, unknown> {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'wordbuddy_chain_reading',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          passage: { type: 'string' },
          translation: { type: 'string' },
          usedWords: { type: 'array', items: { type: 'string' } },
          senseHints: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                word: { type: 'string' },
                meaningZh: { type: 'string' },
              },
              required: ['word', 'meaningZh'],
              additionalProperties: false,
            },
          },
        },
        required: ['passage', 'translation', 'usedWords', 'senseHints'],
        additionalProperties: false,
      },
    },
  };
}

function chainReadingSystemPrompt(
  bank: WordBankManifest,
  policy: SentenceLevelPolicy,
  outputLanguage: string,
  targetSize: number,
): string {
  return [
    'You are an English reading-comprehension author for a vocabulary trainer.',
    'Write ONE natural, coherent reading passage of about 4 to 6 sentences on a single everyday topic — real prose a native speaker would write, never a word list or disconnected example sentences.',
    `Write at ${policy.levelLabel} level (${bank.name}).`,
    policy.promptRule,
    'Naturalness and coherence are the top priority.',
    'You MUST use each word in "mustInclude" at least once.',
    `From "mayInclude", choose the words that best fit ONE coherent topic and weave in about ${targetSize} supplied words in total (aim for 5 to 8). The list is roughly ordered by review priority, so include higher-priority words when they fit, but pick overall for a natural, coherent passage.`,
    'If a supplied word does not fit your topic, leave it out (except mustInclude words). Never force an awkward collocation, invent an odd phrase, or add filler just to include a word.',
    'Each supplied word lists several dictionary senses; use only the single most common, natural sense and part of speech, and never use a rare or contrived sense to shoehorn a word in.',
    'You may freely add ordinary words outside the lists to keep the prose fluent.',
    'Do not quote, define, gloss, or list the supplied words inside the passage; use them exactly as an ordinary writer would.',
    'Return only one valid JSON object.',
    '"passage" holds the reading text. "translation" is a full, natural translation of the whole passage.',
    '"usedWords" lists exactly which supplied words you actually used, each copied with the supplied spelling.',
    '"senseHints" must include one item for every word in "usedWords", using {"word": suppliedWord, "meaningZh": concise Chinese meaning for this exact passage usage}.',
    'For polysemous words, meaningZh must match the contextual sense in the passage (for example, "even" in "even the shyest students..." should map to "甚至").',
    `Translate the whole passage naturally into ${outputLanguage}.`,
    'Do not add Markdown, commentary, or extra keys.',
  ].join(' ');
}

/**
 * Generates one AI-led reading passage for a chain blueprint. The model writes a
 * natural level-appropriate paragraph around the mandatory seed words, and the
 * chain's practised words are the supplied words it actually used. Throws after a
 * single repair attempt so callers can fall back to an offline chain.
 */
export async function generateChainReading(
  config: AiConnectionConfig,
  blueprint: ChainBlueprint,
  bank: WordBankManifest,
  fetcher: typeof fetch = fetch,
): Promise<ChainReading> {
  const policy = SENTENCE_LEVEL_POLICIES[bank.id];
  const outputLanguage = config.outputLanguage.trim() || 'Simplified Chinese';
  const targetSize = CHAIN_TARGET_SIZE;
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 30_000);
  const responseFormat = chainReadingResponseFormat();
  const systemPrompt = chainReadingSystemPrompt(bank, policy, outputLanguage, targetSize);

  const describe = (word: WordEntry) => ({
    word: word.word,
    partOfSpeech: word.partOfSpeech,
    definition: primarySense(word.definition).slice(0, 160),
    definitionZh: primarySense(word.definitionZh).slice(0, 100),
  });
  const seedIds = new Set(blueprint.seeds.map((word) => word.id));
  const userPayload = {
    chainIndex: blueprint.chainIndex,
    selectedBank: { id: bank.id, name: bank.name, level: policy.levelLabel },
    targetWordCount: targetSize,
    mustInclude: blueprint.seeds.map(describe),
    mayInclude: blueprint.pool.filter((word) => !seedIds.has(word.id)).map(describe),
  };

  try {
    const content = await requestCompletion(config, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(userPayload) },
    ], fetcher, {
      signal: controller.signal,
      temperature: 0.45,
      maxTokens: 900,
      responseFormat,
    });
    const richnessMin = Math.min(4, blueprint.pool.length);
    try {
      return parseChainReading(content, blueprint, policy, { minWords: richnessMin });
    } catch (error) {
      const validationError = error instanceof Error ? error.message : 'Unknown validation error';
      const mandatory = blueprint.seeds.map((word) => word.word).join(' | ');
      const repaired = await requestCompletion(config, [
        {
          role: 'system',
          content: `${systemPrompt} The previous attempt fell short: ${validationError} Rewrite it as a fuller, natural paragraph of 4 to 6 sentences on ONE coherent everyday topic that smoothly works in more of the supplied words, including ${mandatory}, each in its most common sense. Keep every sentence fluent and idiomatic; never force awkward phrasing to include a word.`,
        },
        { role: 'user', content: JSON.stringify({ ...userPayload, rejectedOutput: content }) },
      ], fetcher, {
        signal: controller.signal,
        temperature: 0.5,
        maxTokens: 900,
        responseFormat,
      });
      return parseChainReading(repaired, blueprint, policy);
    }
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function testAiConnection(config: AiConnectionConfig): Promise<string> {
  return requestCompletion(config, [
    { role: 'system', content: 'Return exactly the text OK.' },
    { role: 'user', content: 'Connection test.' },
  ]);
}

export function wordExplanationMaxTokens(senseCount: number): number {
  return Math.min(6000, Math.max(2200, 1200 + (Math.max(0, senseCount) * 300)));
}

export async function explainWord(
  config: AiConnectionConfig,
  word: WordEntry,
  options: { repairFeedback?: string } = {},
): Promise<WordExplanation> {
  const outputLanguage = config.outputLanguage.trim() || 'Simplified Chinese';
  const chineseSenses = parseDefinitionSenses(word.definitionZh);
  const englishSenses = parseDefinitionSenses(word.definition);
  const systemPrompt = [
    'You are an expert English vocabulary coach helping a learner truly understand one word so they can recall it and use it correctly.',
    'Treat the supplied Chinese senses as the coverage checklist and the English senses as reference evidence. Use reliable standard-English knowledge to explain the word, but never invent an extra sense.',
    'Cross-check each supplied Chinese sense against the English reference and standard contemporary usage. If a gloss or part-of-speech label appears dubious, obsolete, or contradictory, do not force an unnatural claim or example; explain the discrepancy cautiously in that sense item and in Caution, then demonstrate the nearest truthful standard usage.',
    'Return only one flat JSON object with exactly this shape: {"labels":{"memoryHook":"short localized label","senseMap":"short localized label","usageGuide":"short localized label","pattern":"short localized label","senseContrast":"short localized label","commonConfusion":"short localized label","caution":"short localized label"},"memoryHook":"content","senses":[{"sourceStatus":"standard|questionable","distinction":"content","pattern":"content","englishSentence":"content","localizedTranslation":"content"}],"senseContrast":"content","commonConfusion":"content","caution":"content"}. Do not put senseIndex inside a sense object: array position is the index. Do not nest a coach object, do not create a separate senseExamples array, and do not add commentary or extra keys. Every string field must be plain text without Markdown or HTML.',
    'labels must contain concise, distinct localized equivalents of "Memory Hook", "Sense Map", "Usage Guide", "Pattern", "Sense Contrast", "Common Confusion", and "Caution". Labels are generic UI names only: never put the target word, a collocation, mnemonic content, or sense content in any label. labels.pattern is the translation of the UI label "Pattern", not an example pattern.',
    'memoryHook must be one memorable paragraph focused on the exact supplied headword and its primary standard meaning. Use morphology only for an unmistakable productive affix visibly attached to a standalone base (such as un- + happy, re- + write, cord + -less); never propose a root, prefix, or suffix analysis for an opaque word such as rigid or bird. Otherwise prefer a vivid mental image or spelling cue. If you spell the word letter by letter, copy every letter from word.word in the exact order and silently compare the result character by character before returning it. Never omit, replace, or reorder a letter. The source does not provide historical etymology, so never claim that a word "comes from" an older language or old form, and never invent a root meaning. Pronunciation is already displayed and taught elsewhere in the UI: do not include phonetic transcription, pronunciation variants, stress rules, or sound claims in memoryHook. Never present a mnemonic as factual word history.',
    'senses must contain exactly one object for each index in requiredSenseIndexes, no more and no fewer, in that order. Do not output senseIndex because the array position is authoritative. Keeping distinction, pattern, englishSentence, and localizedTranslation in the SAME object is mandatory: all four fields must teach that array position’s Chinese sense and supplied part of speech. Never substitute a noun meaning into a verb item, move content between positions, or import an English-only sense. Each Chinese sense includes glossChecklist; distinction must explicitly account for EVERY checklist item, either by teaching that meaning or by clearly marking that item questionable and giving the standard replacement.',
    'Set sourceStatus to standard when the supplied gloss can be taught truthfully in contemporary English. Set it to questionable only when the gloss or part-of-speech assignment is an unrelated abbreviation, malformed, or demonstrably nonstandard. distinction should clearly separate that indexed sense from the others and preserve every material gloss grouped inside it. For a questionable source, explicitly say what is wrong and give the nearest truthful contemporary usage with the SAME part of speech. pattern gives one real, idiomatic collocation or construction for that same indexed sense; for questionable sources, give the correct replacement wording rather than an invented pattern. Never split comma-separated synonyms into extra objects.',
    'senseContrast, commonConfusion, and caution are three concrete, non-redundant, complete usage notes. Each must end as a complete sentence. Never finish a field with a dangling lead-in such as "for example", "such as", "错误地说", or "例如". Use caution to flag a questionable source gloss or a usage that is rare, dated, regional, or technical.',
    'The English reference may contain senses absent from requiredSenseIndexes. Never turn those extra English senses into Sense Map items or senseExamples; mention one only in the Usage Guide when it prevents confusion.',
    'If a sense is a grammar or technical term, explain what it means, its standard form or pattern, when it is used, and one common mistake or limitation. Do not merely restate the dictionary label.',
    'Each senses[i].englishSentence must be natural contemporary English of 6 to 18 words, clearly demonstrate that exact sense and part of speech, and use the target word or its natural inflected form. Never force the base form when standard grammar requires an inflection, and never distort grammar merely to preserve the dictionary label. localizedTranslation must faithfully translate that sentence into the requested output language.',
    'When the target is an activity verb, prefer using it as the finite main verb. If it follows a verb that selects a gerund, use the -ing form: enjoy, avoid, finish, and mind take gerunds, never a to-infinitive (for example, "enjoys birding", never "enjoys to bird").',
    'For a valid grammar or technical-term sense, write a teaching example that makes the concept understandable in context rather than merely naming the term. For every senses[i] whose sourceStatus is questionable, its englishSentence MUST be a simple metalinguistic correction containing the lowercase headword exactly, for example "The word be does not mean backend in standard English." Never demonstrate an unrelated acronym or fabricate an ordinary usage for a questionable source.',
    'Before returning the JSON, silently check every English sentence for verb complementation, transitivity, articles, prepositions, countability, inflection, collocation, and agreement. Replace any doubtful sentence with a simpler idiomatic one. Then verify that every translation says exactly what its English sentence says.',
    'Finally run a consistency check: memoryHook spells word.word exactly and contains no pronunciation advice; each senses[i] keeps its distinction, pattern, sentence, and translation aligned to requiredSenseIndexes[i] and one part of speech; every questionable source has a metalinguistic correction example; every label is a generic UI label; and no field contradicts another field.',
    'Localize all labels, explanations, and translations into the requested output language. Do not leave labels in English unless the requested output language is English. Keep the complete coach concise enough to scan, but include the distinctions a learner needs to avoid misuse.',
    options.repairFeedback
      ? `A previous response failed validation: ${options.repairFeedback} Correct that problem in this response.`
      : '',
    `Respond in ${outputLanguage}.`,
  ].filter(Boolean).join(' ');

  const content = await requestCompletion(config, [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: JSON.stringify({
        word,
        requiredSenseCount: chineseSenses.length,
        requiredSenseIndexes: chineseSenses.map((_, senseIndex) => senseIndex),
        chineseSenses: chineseSenses.map((sense, senseIndex) => ({
          senseIndex,
          ...sense,
          glossChecklist: sense.text.split(/[,，、]/).map((gloss) => gloss.trim()).filter(Boolean),
        })),
        englishSenses: englishSenses.map((sense, senseIndex) => ({ senseIndex, ...sense })),
      }),
    },
  ], fetch, {
    temperature: 0.35,
    maxTokens: wordExplanationMaxTokens(chineseSenses.length),
    responseFormat: wordExplanationResponseFormat(),
  });
  return parseWordExplanation(content, chineseSenses, word.word);
}

export async function evaluateWordExplanation(
  config: AiConnectionConfig,
  word: WordEntry,
  explanation: WordExplanation,
): Promise<WordExplanationQualityReview> {
  const outputLanguage = config.outputLanguage.trim() || 'Simplified Chinese';
  const chineseSenses = parseDefinitionSenses(word.definitionZh);
  const systemPrompt = [
    'You are a strict but fair bilingual vocabulary-content reviewer.',
    'Return only one JSON object with exactly this shape: {"verdict":"pass|warning|fail","issues":[{"severity":"warning|error","code":"source_conflict|sense_mismatch|unnatural_example|translation_error|unsupported_claim|missing_gloss|misleading_usage|other","senseIndex":-1,"message":"..."}]}. Do not add keys.',
    'Treat the supplied dictionary entry and its indexed Chinese senses as authoritative, even when the source groups several comma-separated glosses into one indexed sense.',
    'Review the candidate explanation and every indexed English example. Do not rewrite the content.',
    'Return fail with error issues if an example is unnatural, ungrammatical, mistranslated, or does not clearly demonstrate its exact indexed Chinese sense; if the explanation drops or changes a material supplied gloss; if a usage rule is misleading; or if it makes an unsupported factual, etymological, or acronym claim.',
    'If the supplied dictionary sense itself is clearly malformed, contradictory, nonstandard, or assigned to the wrong headword so no truthful explanation can preserve it, use code source_conflict with error severity. Do not force the candidate to teach a source gloss that is demonstrably wrong.',
    'Synonymous comma-separated glosses may be summarized together when their shared meaning is preserved. Do not demand a separate note or example for each comma-separated synonym.',
    'Return warning only for a questionable but non-harmful mnemonic, a mild overgeneralization, or wording that deserves human review. Return pass only when no issues exist.',
    'Use senseIndex -1 for an issue about the whole explanation. Otherwise use the zero-based Chinese sense index.',
    'For pass, issues must be empty. For warning, every issue must have warning severity. For fail, include at least one error issue.',
    `Write every issue.message in ${outputLanguage}.`,
  ].join(' ');
  const content = await requestCompletion(config, [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: JSON.stringify({
        word: {
          id: word.id,
          word: word.word,
          phonetic: word.phonetic,
          partOfSpeech: word.partOfSpeech,
          definition: word.definition,
          definitionZh: word.definitionZh,
        },
        chineseSenses: chineseSenses.map((sense, senseIndex) => ({
          senseIndex,
          ...sense,
        })),
        candidate: {
          coachMarkdown: explanation.markdown,
          senseExamples: explanation.senseExamples,
        },
      }),
    },
  ], fetch, {
    temperature: 0,
    maxTokens: Math.min(1800, Math.max(500, 300 + (chineseSenses.length * 180))),
    responseFormat: wordExplanationQualityResponseFormat(),
  });
  return parseWordExplanationQualityReview(content, chineseSenses.length);
}