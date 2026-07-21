import type {
  ChainBlueprint,
  ChainPassage,
  WordBankManifest,
  WordEntry,
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
import { primarySense } from '../domain/wordText';

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

function parseJsonResponse(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
  try {
    return JSON.parse(fenced ?? trimmed);
  } catch {
    throw new Error('AI 没有返回有效的句子数据，已切换到离线串联。');
  }
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

export async function explainWord(
  config: AiConnectionConfig,
  word: WordEntry,
): Promise<string> {
  const outputLanguage = config.outputLanguage.trim() || 'Simplified Chinese';
  const systemPrompt = [
    'You are a concise English vocabulary coach.',
    'Use only the supplied vocabulary entry as factual context.',
    'Format the response as concise GitHub-flavored Markdown with exactly three level-3 headings for: memory cue, usage contrast, and one new example.',
    'Use bold text sparingly, do not output raw HTML or Markdown tables, and do not exceed 180 words.',
    `Respond in ${outputLanguage}.`,
  ].join(' ');

  return requestCompletion(config, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: JSON.stringify(word) },
  ]);
}