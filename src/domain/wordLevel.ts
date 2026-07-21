import type { BankId, WordEntry } from './models';

/**
 * ECDICT scope tags that sit strictly above each bank's own level. A word whose
 * source scope never reaches any of these tags is treated as a sub-level basic
 * for that bank (e.g. the / be / and / of inside the 高考 syllabus): it is common
 * enough to already be known and only wastes the learner's time. Such words are
 * deprioritized so practice focuses on the vocabulary that differentiates the
 * selected bank from lower-level scopes.
 *
 * IELTS and TOEFL are the top preparation banks and every member already carries
 * their own scope tag, so there is no reliable "above" signal to differentiate
 * against — they intentionally map to an empty set and the rule is a no-op there.
 */
const BANK_ABOVE_TAGS: Record<BankId, readonly string[]> = {
  gaokao: ['cet4', 'cet6', 'ky', 'gre'],
  cet4: ['cet6', 'ky', 'gre'],
  cet6: ['ky', 'gre'],
  ielts: [],
  toefl: [],
};

/**
 * A word is below the bank's level when its source scope does not reach any tag
 * above that bank. Words without scope tags are treated as below level so they
 * never crowd out level-appropriate vocabulary.
 */
export function isBelowBankLevel(word: WordEntry, bankId: BankId): boolean {
  const aboveTags = BANK_ABOVE_TAGS[bankId];
  if (!aboveTags || aboveTags.length === 0) return false;
  const tags = word.sourceTags;
  if (!tags || tags.length === 0) return true;
  return !aboveTags.some((tag) => tags.includes(tag));
}
