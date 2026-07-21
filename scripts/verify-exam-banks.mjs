import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve('public/data/exam-banks');
const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
const coverageIndex = JSON.parse(await readFile(resolve(directory, 'coverage-index.json'), 'utf8'));
const expectedBanks = ['gaokao', 'cet4', 'cet6', 'ielts', 'toefl'];
const expectedCommit = '82c9872576b23118d7c42e920c11beb77f510ae2';
const expectedCounts = { gaokao: 3677, cet4: 3849, cet6: 5805, ielts: 5040, toefl: 6974 };

if (manifest.schemaVersion !== 1) throw new Error('Unsupported exam-bank manifest version');
if (manifest.source?.license !== 'MIT') throw new Error('Exam-bank source license is not recorded as MIT');
if (manifest.source?.commit !== expectedCommit) throw new Error('Exam-bank source commit changed unexpectedly');
if (!(await readFile(resolve(directory, 'LICENSE-ECDICT.txt'), 'utf8')).includes('Copyright (c) 2025 Linwei')) {
  throw new Error('ECDICT license attribution is missing or incomplete');
}
if (manifest.banks.map((bank) => bank.id).join(',') !== expectedBanks.join(',')) {
  throw new Error('Exam-bank manifest does not contain the required banks in canonical order');
}
if (coverageIndex.schemaVersion !== 1) throw new Error('Unsupported coverage-index version');
if (coverageIndex.bankOrder.join(',') !== expectedBanks.join(',')) {
  throw new Error('Coverage-index bank order does not match the canonical order');
}
if (Object.values(coverageIndex.memberships).some((membership) => !Number.isInteger(membership) || membership <= 0 || membership >= (1 << expectedBanks.length))) {
  throw new Error('Coverage index contains an invalid membership mask');
}

for (const [position, bank] of manifest.banks.entries()) {
  if (bank.count !== expectedCounts[bank.id]) {
    throw new Error(`${bank.id} changed from the reviewed count ${expectedCounts[bank.id]} to ${bank.count}`);
  }
  if (bank.missingChinese !== 0) throw new Error(`${bank.id} contains entries without Chinese definitions`);
  const entries = JSON.parse(await readFile(resolve(directory, bank.file), 'utf8'));
  if (entries.length !== bank.count) {
    throw new Error(`${bank.id} count mismatch: manifest=${bank.count}, file=${entries.length}`);
  }
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) {
    throw new Error(`${bank.id} contains duplicate IDs`);
  }
  if (entries.some((entry) => !entry.definitionZh)) {
    throw new Error(`${bank.id} contains a blank Chinese definition`);
  }
  if (coverageIndex.bankCounts[bank.id] !== bank.count) {
    throw new Error(`${bank.id} coverage total does not match the manifest`);
  }
  const coverageMembers = Object.values(coverageIndex.memberships)
    .filter((membership) => (membership & (1 << position)) !== 0).length;
  if (coverageMembers !== bank.count) {
    throw new Error(`${bank.id} coverage membership count ${coverageMembers} does not match ${bank.count}`);
  }
  for (const entry of entries) {
    if (!entry.id || !entry.word || !Array.isArray(entry.banks) || entry.banks[0] !== bank.id) {
      throw new Error(`${bank.id} contains an invalid entry`);
    }
    if ((coverageIndex.memberships[entry.id] & (1 << position)) === 0) {
      throw new Error(`${entry.id} is missing ${bank.id} coverage membership`);
    }
  }
}

console.log(`Verified ${manifest.banks.length} exam banks, ${manifest.banks.reduce((sum, bank) => sum + bank.count, 0)} bank entries, and ${Object.keys(coverageIndex.memberships).length} shared word identities.`);