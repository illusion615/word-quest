import type { StaticWordCoachRecord, WordEntry, WordExplanation } from './models';
import { parseDefinitionSenses } from './wordText';

export const WORD_COACH_SCHEMA_VERSION = 1;
export const WORD_COACH_PROMPT_VERSION = 18;
export const WORD_COACH_REVIEW_VERSION = 1;
export const WORD_COACH_SHARD_COUNT = 256;

export type WordCoachQualitySeverity = 'error' | 'warning';
export type WordCoachQualityMode = 'unreviewed' | 'balanced' | 'strict';

export interface WordCoachQualityIssue {
  code: string;
  severity: WordCoachQualitySeverity;
  message: string;
}

export interface WordCoachSenseSection {
  distinction: string;
  patternLabel: string;
  pattern: string;
}

export interface WordCoachGeneralGuidance {
  label: string;
  text: string;
}

export interface WordCoachSections {
  memoryHeading: string;
  memoryHook: string;
  senseHeading: string;
  senses: WordCoachSenseSection[];
  guidanceHeading: string;
  generalGuidance: WordCoachGeneralGuidance[];
}

function unescapeCoachText(value: string): string {
  return value.replace(/\\([\\`*_[\]<>])/g, '$1').trim();
}

export function parseWordCoachSections(
  markdown: string,
  expectedSenseCount?: number,
): WordCoachSections | null {
  const headings = [...markdown.matchAll(/^###\s+(.+)$/gm)];
  if (headings.length !== 3) return null;
  const section = (index: number): string => {
    const start = (headings[index].index ?? 0) + headings[index][0].length;
    const end = headings[index + 1]?.index ?? markdown.length;
    return markdown.slice(start, end).trim();
  };

  const senseLines = section(1).split('\n').map((line) => line.trim()).filter(Boolean);
  if (expectedSenseCount !== undefined && senseLines.length !== expectedSenseCount) return null;
  const senses = senseLines.map((line): WordCoachSenseSection | null => {
    const match = line.match(/^- \*\*(.+?)\*\*:\s*(.*?)\s+\*\*(.+?):\*\*\s*(.+)$/);
    if (!match) return null;
    return {
      distinction: unescapeCoachText(match[2]),
      patternLabel: unescapeCoachText(match[3]),
      pattern: unescapeCoachText(match[4]),
    };
  });
  if (senses.some((sense) => sense === null)) return null;

  const guidanceLines = section(2).split('\n').map((line) => line.trim()).filter(Boolean);
  const generalGuidance = guidanceLines.map((line): WordCoachGeneralGuidance | null => {
    const match = line.match(/^- \*\*(.+?)\*\*:\s*(.+)$/);
    if (!match) return null;
    return {
      label: unescapeCoachText(match[1]),
      text: unescapeCoachText(match[2]),
    };
  });
  if (generalGuidance.some((item) => item === null)) return null;

  return {
    memoryHeading: unescapeCoachText(headings[0][1]),
    memoryHook: unescapeCoachText(section(0)),
    senseHeading: unescapeCoachText(headings[1][1]),
    senses: senses as WordCoachSenseSection[],
    guidanceHeading: unescapeCoachText(headings[2][1]),
    generalGuidance: generalGuidance as WordCoachGeneralGuidance[],
  };
}

export function wordCoachRequiresSemanticReview(
  word: WordEntry,
  qualityMode: WordCoachQualityMode,
): boolean {
  if (qualityMode === 'strict') return true;
  if (qualityMode === 'unreviewed') return false;
  const hasTechnicalTag = /\[[^\]]+\]/.test(word.definitionZh);
  const looksLikeShortTechnicalTerm = /^[A-Za-z]{1,4}$/.test(word.word)
    && hasTechnicalTag;
  const hasSuspiciousSourceMarker = /(?:交直流.{0,4}两用|简写|简称)/u
    .test(word.definitionZh);
  return parseDefinitionSenses(word.definitionZh).length >= 5
    || looksLikeShortTechnicalTerm
    || hasSuspiciousSourceMarker;
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function wordCoachShardId(wordId: string): string {
  return (fnv1a(wordId) & (WORD_COACH_SHARD_COUNT - 1))
    .toString(16)
    .padStart(2, '0');
}

export function wordCoachSourceHash(word: WordEntry): string {
  return fnv1a(JSON.stringify([
    word.id,
    word.word,
    word.phonetic,
    word.partOfSpeech,
    word.definition,
    word.definitionZh,
  ])).toString(16).padStart(8, '0');
}

export function wordCoachContentHash(explanation: WordExplanation): string {
  return fnv1a(JSON.stringify([
    explanation.markdown,
    explanation.senseExamples,
  ])).toString(16).padStart(8, '0');
}

export function wordCoachRecordHasSourceConflict(
  word: WordEntry,
  record: StaticWordCoachRecord | null | undefined,
): boolean {
  return Boolean(record
    && record.sourceHash === wordCoachSourceHash(word)
    && record.qualityReview?.verdict === 'fail'
    && record.qualityReview.issues.some((issue) => (
      issue.severity === 'error' && issue.code === 'source_conflict'
    )));
}

export function assessWordCoachQuality(
  word: WordEntry,
  explanation: WordExplanation,
  outputLanguage = 'Simplified Chinese',
): WordCoachQualityIssue[] {
  const issues: WordCoachQualityIssue[] = [];
  const chineseSenseCount = parseDefinitionSenses(word.definitionZh).length;
  const headings = explanation.markdown.match(/^###\s+.+$/gm) ?? [];
  const bullets = explanation.markdown.match(/^-\s+/gm) ?? [];

  if (headings.length !== 3) {
    issues.push({
      code: 'markdown-headings',
      severity: 'error',
      message: `讲解需要 3 个段落标题，当前为 ${headings.length} 个。`,
    });
  }
  if (bullets.length !== chineseSenseCount + 3) {
    issues.push({
      code: 'markdown-bullets',
      severity: 'error',
      message: `讲解需要 ${chineseSenseCount + 3} 个列表项，当前为 ${bullets.length} 个。`,
    });
  }
  if (explanation.markdown.length < 120) {
    issues.push({
      code: 'coach-too-short',
      severity: 'warning',
      message: '讲解过短，可能缺少有效辨析。',
    });
  }
  if (explanation.markdown.length > 5000) {
    issues.push({
      code: 'coach-too-long',
      severity: 'warning',
      message: '讲解超过 5,000 字符，需要人工检查是否冗长。',
    });
  }

  const sentences = explanation.senseExamples.map((example) => example.sentence.toLowerCase());
  if (new Set(sentences).size !== sentences.length) {
    issues.push({
      code: 'duplicate-examples',
      severity: 'warning',
      message: '多个义项使用了相同例句。',
    });
  }
  explanation.senseExamples.forEach((example, senseIndex) => {
    const wordCount = example.sentence.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0;
    if (wordCount > 36) {
      issues.push({
        code: `long-example-${senseIndex}`,
        severity: 'warning',
        message: `第 ${senseIndex + 1} 个义项例句有 ${wordCount} 个词，可能过长。`,
      });
    }
    if (/Chinese/i.test(outputLanguage)
      && !/[\u3400-\u9fff]/u.test(example.translation)) {
      issues.push({
        code: `translation-language-${senseIndex}`,
        severity: 'error',
        message: `第 ${senseIndex + 1} 个义项缺少中文翻译。`,
      });
    }
  });

  return issues;
}