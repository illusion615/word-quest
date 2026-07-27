import type {
  ChainBlueprint,
  ChainPassage,
  DefinitionLanguage,
  WordBankManifest,
  WordEntry,
  WordExplanation,
  WordSenseLearningContent,
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
  parseWordSenses,
  primarySense,
  type DefinitionSense,
} from '../domain/wordText';
import { Inflectors, infinitives } from 'en-inflectors';

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
  senseId?: unknown;
  mnemonic?: unknown;
  usageTip?: unknown;
  englishSentence?: unknown;
  localizedTranslation?: unknown;
}

export class PartialWordExplanationError extends Error {
  readonly partialSenseContent: Record<string, WordSenseLearningContent>;
  readonly failedSenseIds: string[];

  constructor(
    message: string,
    partialSenseContent: Record<string, WordSenseLearningContent>,
    failedSenseIds: string[],
  ) {
    super(message);
    this.name = 'PartialWordExplanationError';
    this.partialSenseContent = partialSenseContent;
    this.failedSenseIds = failedSenseIds;
  }
}

const WORD_COACH_TEXT_LIMITS = {
  memoryHook: 1000,
  usageGuide: 500,
  sentence: 180,
  translation: 220,
} as const;

export interface CoachSenseInput extends DefinitionSense {
  id?: string;
  sourceIndex?: number;
  /** Authoritative dictionary example reused instead of generating one. */
  dictionaryExample?: { english: string; chinese: string };
}

function resolvedSenseId(sense: CoachSenseInput, index: number, targetWord: string): string {
  return sense.id ?? `${targetWord.toLowerCase()}:s${index}`;
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
  chineseSenses: readonly DefinitionSense[],
  targetWord: string,
): WordSenseExample[] {
  const chineseSenseCount = chineseSenses.length;
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
    if (!sentenceUsesTargetWord(sentence, targetWord, chineseSenses[senseIndex]?.label)) {
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

type InflectionFamily = 'verb' | 'noun' | 'adjective' | 'all';

function inflectionFamily(partOfSpeechLabel?: string): InflectionFamily {
  const normalized = partOfSpeechLabel?.trim().toLowerCase() ?? '';
  if (['v.', 'vi.', 'vt.', 'aux.'].includes(normalized)) return 'verb';
  if (normalized === 'n.') return 'noun';
  if (['a.', 'adj.'].includes(normalized)) return 'adjective';
  return 'all';
}

export function sentenceUsesTargetWord(
  sentence: string,
  targetWord: string,
  partOfSpeechLabel?: string,
): boolean {
  const target = targetWord.trim().toLowerCase();
  if (!target) return false;
  const family = inflectionFamily(partOfSpeechLabel);
  const inflector = new Inflectors(target);
  const verbForms = target === 'be'
    ? ['am', 'is', 'are', 'was', 'were', 'been', 'being']
    : [
    ...(infinitives[target] ?? []),
    inflector.toPresent(),
    inflector.toPast(),
    inflector.toPastParticiple(),
    inflector.toPresentS(),
    inflector.toGerund(),
  ];
  const nounForms = [
    inflector.toSingular(),
    inflector.toPlural(),
  ];
  const adjectiveForms = [
    inflector.comparative(),
    inflector.superlative(),
  ];
  const forms = new Set([
    target,
    ...(family === 'verb' || family === 'all' ? verbForms : []),
    ...(family === 'noun' || family === 'all' ? nounForms : []),
    ...(family === 'adjective' || family === 'all' ? adjectiveForms : []),
  ].map((form) => form.toLowerCase()));
  const words = [...new Intl.Segmenter('en', { granularity: 'word' }).segment(sentence)]
    .filter((segment) => segment.isWordLike)
    .map((segment) => segment.segment.toLowerCase());
  return words.some((word) => forms.has(word));
}

export function parseStoredWordExplanation(
  value: unknown,
  chineseSenses: readonly CoachSenseInput[],
  targetWord: string,
): WordExplanation {
  if (!value || typeof value !== 'object') throw new Error('静态词汇讲解内容无效。');
  const record = value as {
    coachMarkdown?: unknown;
    senseExamples?: unknown;
    senseContent?: unknown;
  };
  if (record.senseContent && typeof record.senseContent === 'object') {
    return explanationFromSenseContent(record.senseContent, chineseSenses, targetWord);
  }
  const markdown = typeof record.coachMarkdown === 'string'
    ? record.coachMarkdown.trim()
    : '';
  if (!markdown) throw new Error('静态词汇讲解缺少正文。');
  return {
    markdown,
    senseExamples: parseChineseSenseExamples(
      record.senseExamples,
      chineseSenses,
      targetWord,
    ),
  };
}

export function parseWordExplanation(
  content: string,
  chineseSenses: readonly CoachSenseInput[],
  targetWord: string,
): WordExplanation {
  const parsed = parseJsonResponse(content, 'AI 没有返回有效的词汇讲解数据。');
  const payload = Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : parsed;
  const record = payload && typeof payload === 'object'
    ? payload as { senses?: unknown }
    : null;
  if (!record || !Array.isArray(record.senses)) {
    throw new Error('AI 词汇讲解内容不完整。');
  }
  const expectedById = new Map(chineseSenses.map((sense, position) => (
    [resolvedSenseId(sense, position, targetWord), { sense, position }]
  )));
  const failedSenseIds = new Set(expectedById.keys());
  const contentById: Record<string, WordSenseLearningContent> = {};
  const errors: string[] = record.senses.length === chineseSenses.length
    ? []
    : ['AI 返回的义项讲解数量不正确。'];

  record.senses.forEach((value, position) => {
    if (!value || typeof value !== 'object') {
      errors.push(`AI 返回的第 ${position + 1} 条义项讲解无效。`);
      return;
    }
    const sense = value as CoachSensePayload;
    try {
      const senseId = plainText(sense.senseId, 'senseId', 120);
      const expectedEntry = expectedById.get(senseId);
      if (!expectedEntry) throw new Error('AI 返回了错误的 senseId。');
      const expected = expectedEntry.sense;
      const dictionaryExample = expected.dictionaryExample;
      const candidate = {
        senseId,
        mnemonic: safeMemoryHook(
          plainText(sense.mnemonic, '助记技巧', WORD_COACH_TEXT_LIMITS.memoryHook),
          targetWord,
          [expected],
        ),
        example: dictionaryExample ? dictionaryExample.english : sense.englishSentence,
        translation: dictionaryExample ? dictionaryExample.chinese : sense.localizedTranslation,
        exampleSource: dictionaryExample ? 'dictionary' as const : 'ai' as const,
        usageTip: completeCoachText(
          sense.usageTip,
          '使用技巧',
          WORD_COACH_TEXT_LIMITS.usageGuide,
        ),
      };
      const validated = explanationFromSenseContent(
        { [senseId]: candidate },
        [{ ...expected, id: senseId }],
        targetWord,
      );
      contentById[senseId] = validated.senseContent![senseId];
      failedSenseIds.delete(senseId);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  });

  if (errors.length > 0 || failedSenseIds.size > 0) {
    throw new PartialWordExplanationError(
      errors[0] ?? `AI 未返回 ${[...failedSenseIds][0]} 的学习内容。`,
      contentById,
      [...failedSenseIds],
    );
  }
  return explanationFromSenseContent(contentById, chineseSenses, targetWord);
}

function validateGeneratedExample(
  sentence: string,
  senseIndex: number,
  sense: CoachSenseInput,
  targetWord: string,
): void {
  const displayIndex = sense.sourceIndex ?? senseIndex;
  const latinWords = sentence.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? [];
  if (latinWords.length < 3 || /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(sentence)) {
    throw new Error(`AI 为中文第 ${displayIndex + 1} 个义项返回的不是英文例句。`);
  }
  if (!sentenceUsesTargetWord(sentence, targetWord, sense?.label)) {
    throw new Error(`AI 为中文第 ${displayIndex + 1} 个义项的例句未使用目标词。`);
  }
}

function explanationFromSenseContent(
  value: unknown,
  senses: readonly CoachSenseInput[],
  targetWord: string,
): WordExplanation {
  if (!value || typeof value !== 'object') throw new Error('逐义学习内容无效。');
  const candidate = value as Record<string, Partial<WordSenseLearningContent>>;
  const senseContent = Object.fromEntries(senses.map((sense, senseIndex) => {
    const senseId = resolvedSenseId(sense, senseIndex, targetWord);
    const item = candidate[senseId];
    if (!item || item.senseId !== senseId) throw new Error(`缺少 ${senseId} 的学习内容。`);
    const exampleSource = item.exampleSource === 'dictionary' ? 'dictionary' : 'ai';
    const example = plainText(item.example, `${senseId} 例句`, WORD_COACH_TEXT_LIMITS.sentence);
    if (exampleSource === 'ai') {
      validateGeneratedExample(example, senseIndex, sense, targetWord);
    }
    return [senseId, {
      senseId,
      mnemonic: plainText(item.mnemonic, `${senseId} 助记技巧`, WORD_COACH_TEXT_LIMITS.memoryHook),
      example,
      translation: plainText(item.translation, `${senseId} 翻译`, WORD_COACH_TEXT_LIMITS.translation),
      usageTip: completeCoachText(item.usageTip, `${senseId} 使用技巧`, WORD_COACH_TEXT_LIMITS.usageGuide),
      exampleSource,
    } satisfies WordSenseLearningContent];
  }));
  const senseExamples: WordSenseExample[] = senses.map((sense, senseIndex) => {
    const content = senseContent[resolvedSenseId(sense, senseIndex, targetWord)];
    return {
      language: 'zh' as DefinitionLanguage,
      senseIndex,
      sentence: content.example,
      translation: content.translation,
    };
  });
  const markdown = [
    '### 逐义助记',
    '',
    senses.map((sense, index) => {
      const content = senseContent[resolvedSenseId(sense, index, targetWord)];
      return `- **${escapeMarkdownInline([sense.label, sense.text].filter(Boolean).join(' '))}**: ${escapeMarkdownInline(content.mnemonic)} **使用技巧:** ${escapeMarkdownInline(content.usageTip)}`;
    }).join('\n'),
  ].join('\n');
  return { markdown, senseExamples, senseContent };
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

export function wordExplanationMaxTokens(
  generatedExampleCount: number,
  senseCount: number = generatedExampleCount,
): number {
  const senses = Math.max(0, senseCount);
  const examples = Math.max(0, Math.min(generatedExampleCount, senses));
  return Math.min(6000, Math.max(1600, 900 + (senses * 180) + (examples * 160)));
}

export async function explainWord(
  config: AiConnectionConfig,
  word: WordEntry,
  options: {
    repairFeedback?: string;
    senseIds?: string[];
    lexicalSenses?: Array<{
      id: string;
      glossesEn?: string[];
      labels?: Record<string, string[]>;
      contexts?: string[];
      patterns?: string[];
      examples?: Array<{ english: string; chinese: string }>;
    }>;
  } = {},
): Promise<WordExplanation> {
  const outputLanguage = config.outputLanguage.trim() || 'Simplified Chinese';
  const englishSenses = parseDefinitionSenses(word.definition);
  const lexicalSenses = new Map((options.lexicalSenses ?? []).map((sense) => [sense.id, sense]));
  const allChineseSenses: CoachSenseInput[] = parseWordSenses(word).map((sense, sourceIndex) => {
    const dictionaryExample = lexicalSenses.get(sense.id)?.examples?.[0];
    return dictionaryExample?.english && dictionaryExample.chinese
      ? {
        ...sense,
        sourceIndex,
        dictionaryExample: {
          english: dictionaryExample.english,
          chinese: dictionaryExample.chinese,
        },
      }
        : { ...sense, sourceIndex };
  });
  const requestedSenseIds = options.senseIds?.length ? new Set(options.senseIds) : null;
  const chineseSenses = requestedSenseIds
    ? allChineseSenses.filter((sense) => sense.id && requestedSenseIds.has(sense.id))
    : allChineseSenses;
  if (requestedSenseIds && chineseSenses.length !== requestedSenseIds.size) {
    throw new Error('请求包含当前词条不存在的义项 ID。');
  }
  const missingExampleIds = chineseSenses
    .filter((sense) => !sense.dictionaryExample)
    .map((sense) => sense.id);
  const systemPrompt = [
    'You are an expert English vocabulary coach helping a learner truly understand one word so they can recall it and use it correctly.',
    'Treat every supplied Oxford-derived Chinese sense and its sourceReference as authoritative lexical facts. Do not evaluate, reject, correct, merge, split, relabel, or add dictionary senses.',
    'Use sourceReference glosses, labels, contexts, and patterns as read-only evidence for the matching sense.',
    'Return only one flat JSON object with exactly this shape: {"senses":[{"senseId":"copy the supplied stable ID exactly","mnemonic":"content","usageTip":"content","englishSentence":"only when requested","localizedTranslation":"only when requested"}]}. Return exactly one object for every supplied senseId, in the same order, with no extra keys or commentary. Every field must be plain text without Markdown or HTML.',
    'Write mnemonic and usageTip for every sense. A sense whose dictionaryExample is not null already has an authoritative Oxford example: omit englishSentence and localizedTranslation for it, and never rewrite that example.',
    'Only for a sense listed in sensesNeedingExample (dictionaryExample is null) must you add englishSentence and localizedTranslation.',
    'For each sense, mnemonic is a concise memorable technique for THAT sense. Prefer a vivid scene or reliable spelling association. Use morphology only for an unmistakable productive affix visibly attached to a standalone base; never invent roots, etymology, pronunciation claims, or historical origins.',
    'usageTip is one complete, concrete learner-facing usage rule for THAT sense: a collocation, construction, register limit, countability rule, complementation rule, or common confusion. Prefer the supplied contexts, patterns, and labels as the factual basis. Write it entirely in the requested output language except for the headword or a short standard construction. Do not put illustrative English examples in usageTip because an example already accompanies the sense. Never finish with a dangling lead-in such as "for example", "such as", "错误地说", or "例如".',
    'The English reference may contain senses absent from the approved senseIds. Never generate content for those extra senses.',
    'If a sense is a grammar or technical term, explain what it means, its standard form or pattern, when it is used, and one common mistake or limitation. Do not merely restate the dictionary label.',
    'Each englishSentence you do write must be natural contemporary English of 6 to 18 words, clearly demonstrate that exact sense and part of speech, and use the target word or its natural inflected form. Never force the base form when standard grammar requires an inflection, and never distort grammar merely to preserve the dictionary label. localizedTranslation must faithfully translate that sentence into the requested output language.',
    'When the target is an activity verb, prefer using it as the finite main verb. If it follows a verb that selects a gerund, use the -ing form: enjoy, avoid, finish, and mind take gerunds, never a to-infinitive (for example, "enjoys birding", never "enjoys to bird").',
    'For a grammar or technical-term sense, write a teaching example that makes the concept understandable in context rather than merely naming the term.',
    'Before returning the JSON, silently check every English sentence you wrote for verb complementation, transitivity, articles, prepositions, countability, inflection, collocation, and agreement. Replace any doubtful sentence with a simpler idiomatic one. Then verify that every translation says exactly what its English sentence says.',
    'Finally check that every senseId is copied exactly and each mnemonic and usageTip stays aligned to that one supplied sense.',
    'Localize mnemonic, translation, and usageTip into the requested output language. Keep every field concise enough to scan.',
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
        requiredSenseIds: chineseSenses.map((sense) => sense.id),
        sensesNeedingExample: missingExampleIds,
        chineseSenses: chineseSenses.map((sense) => ({
          senseId: sense.id,
          ...sense,
          glossChecklist: sense.text.split(/[,，、]/).map((gloss) => gloss.trim()).filter(Boolean),
          sourceReference: lexicalSenses.get(sense.id ?? '') ?? null,
        })),
        englishSenses: englishSenses.map((sense, senseIndex) => ({ senseIndex, ...sense })),
      }),
    },
  ], fetch, {
    temperature: 0.35,
    maxTokens: wordExplanationMaxTokens(missingExampleIds.length, chineseSenses.length),
    responseFormat: wordExplanationResponseFormat(),
  });
  return parseWordExplanation(content, chineseSenses, word.word);
}
