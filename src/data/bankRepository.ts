import type { BankId, WordBankManifest, WordEntry } from '../domain/models';
import type { CoverageIndexData } from '../domain/coverage';
import { EXAM_BANK_MANIFEST } from './exam-bank-metadata.generated';

const examDescriptions: Record<string, { description: string; level: string }> = {
  gaokao: { description: '教育部高中英语课程标准 3,000 词范围', level: '高中课标' },
  cet4: { description: '大学英语四级大纲标注词汇', level: 'CET-4' },
  cet6: { description: '四级基础加六级增量的完整范围', level: 'CET-6' },
  ielts: { description: '面向雅思备考的综合词汇范围', level: 'IELTS 备考' },
  toefl: { description: '面向托福备考的学术词汇范围', level: 'TOEFL 备考' },
};

export const WORD_BANKS: WordBankManifest[] = EXAM_BANK_MANIFEST.banks.map((bank) => ({
    id: bank.id as BankId,
    name: bank.name,
    description: examDescriptions[bank.id].description,
    level: examDescriptions[bank.id].level,
    count: bank.count,
    basis: bank.basis,
    status: bank.status,
    sourceName: bank.sourceName,
    sourceUrl: bank.sourceUrl,
    sourceVersion: bank.sourceVersion,
    dataFile: bank.file,
  } satisfies WordBankManifest));

const bankMap = new Map(WORD_BANKS.map((bank) => [bank.id, bank]));
const bankPromises = new Map<BankId, Promise<WordEntry[]>>();
let coverageIndexPromise: Promise<CoverageIndexData> | null = null;

function validateEntries(value: unknown, bank: WordBankManifest): WordEntry[] {
  if (!Array.isArray(value) || value.length !== bank.count) {
    throw new Error(`${bank.name} 数据数量与 manifest 不一致。`);
  }

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') throw new Error(`${bank.name} 包含无效词条。`);
    const candidate = entry as Partial<WordEntry>;
    if (!candidate.id || !candidate.word || !candidate.definitionZh) {
      throw new Error(`${bank.name} 包含缺少核心字段的词条。`);
    }
  }
  return value as WordEntry[];
}

export function getBank(bankId: BankId): WordBankManifest {
  const bank = bankMap.get(bankId);
  if (!bank) throw new Error(`Unknown word bank: ${bankId}`);
  return bank;
}

export function loadWordBank(bankId: BankId): Promise<WordEntry[]> {
  const cached = bankPromises.get(bankId);
  if (cached) return cached;

  const bank = getBank(bankId);
  const request = fetch(`${import.meta.env.BASE_URL}data/exam-banks/${bank.dataFile}`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`${bank.name} 加载失败 (${response.status})。`);
      return validateEntries(await response.json(), bank);
    })
    .catch((error) => {
      bankPromises.delete(bankId);
      throw error;
    });
  bankPromises.set(bankId, request);
  return request;
}

function validateCoverageIndex(value: unknown): CoverageIndexData {
  if (!value || typeof value !== 'object') throw new Error('覆盖率索引格式无效。');
  const candidate = value as Partial<CoverageIndexData>;
  const expectedOrder = WORD_BANKS.map((bank) => bank.id);
  if (candidate.schemaVersion !== 1
    || !Array.isArray(candidate.bankOrder)
    || candidate.bankOrder.join(',') !== expectedOrder.join(',')
    || !candidate.bankCounts
    || !candidate.memberships) {
    throw new Error('覆盖率索引与当前词库版本不匹配。');
  }
  for (const bank of WORD_BANKS) {
    if (candidate.bankCounts[bank.id] !== bank.count) {
      throw new Error(`${bank.name} 覆盖率总数不匹配。`);
    }
  }
  return candidate as CoverageIndexData;
}

export function loadCoverageIndex(): Promise<CoverageIndexData> {
  if (coverageIndexPromise) return coverageIndexPromise;

  coverageIndexPromise = fetch(`${import.meta.env.BASE_URL}data/exam-banks/coverage-index.json`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`覆盖率索引加载失败 (${response.status})。`);
      return validateCoverageIndex(await response.json());
    })
    .catch((error) => {
      coverageIndexPromise = null;
      throw error;
    });
  return coverageIndexPromise;
}