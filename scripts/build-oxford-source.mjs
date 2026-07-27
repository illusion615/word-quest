import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { Inflectors, infinitives } from 'en-inflectors';
import {
  aliasOxfordResult,
  parseOxfordRecord,
  parseOxfordRecords,
  projectOxfordResult,
} from './lib/oxfordEntry.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argumentsMap = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (!argument.startsWith('--')) continue;
  const next = process.argv[index + 1];
  argumentsMap.set(argument, next && !next.startsWith('--') ? next : true);
  if (next && !next.startsWith('--')) index += 1;
}
const outputPath = resolve(
  projectRoot,
  String(argumentsMap.get('--output') ?? '.lexicon-cache/oxford-source.json'),
);
const limit = Number(argumentsMap.get('--limit') ?? Number.POSITIVE_INFINITY);
const VERIFIED_SOURCE_ALIASES = {
  Olympics: {
    word: 'Olympic',
    partOfSpeech: ['noun', 'plural noun'],
    evidence: 'official-family-inflection',
  },
  'apt.': { word: 'apartment', evidence: 'official-abbreviation' },
  credential: { word: 'credentials', evidence: 'Oxford-plural-headword' },
  datum: { word: 'data', evidence: 'official-irregular-plural' },
  dating: {
    word: 'date',
    homograph: '1',
    partOfSpeech: ['transitive verb', 'intransitive verb'],
    evidence: 'official-family-gerund',
  },
  esthetics: { word: 'aesthetics', evidence: 'official-spelling-variant' },
  microwavable: { word: 'microwaveable', evidence: 'Oxford-spelling-variant' },
  northeastern: { word: 'north-eastern', evidence: 'Oxford-hyphenation' },
  northwestern: { word: 'north-western', evidence: 'Oxford-hyphenation' },
  oftentimes: { word: 'often', evidence: 'official-equivalent-form' },
  southeastern: { word: 'south-eastern', evidence: 'Oxford-hyphenation' },
  southwestern: { word: 'south-western', evidence: 'Oxford-hyphenation' },
  willpower: { word: 'will power', evidence: 'Oxford-spacing' },
};

function normalize(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

async function sha256(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

async function loadQueries() {
  const highSchool = JSON.parse(await readFile(
    resolve(projectRoot, 'scripts/data/official-membership/high-school.json'),
    'utf8',
  ));
  const cet = JSON.parse(await readFile(
    resolve(projectRoot, 'scripts/data/official-membership/cet.json'),
    'utf8',
  ));
  const legacyMembership = JSON.parse(await readFile(
    resolve(projectRoot, 'scripts/data/legacy-membership-order.json'),
    'utf8',
  ));
  const queries = new Set();
  const aliases = new Map();
  const connectAliases = (forms) => {
    const normalized = [...new Set(forms.map(normalize).filter(Boolean))];
    for (const form of normalized) {
      const candidates = aliases.get(form) ?? new Set();
      normalized.filter((candidate) => candidate !== form).forEach((candidate) => {
        candidates.add(candidate);
      });
      aliases.set(form, candidates);
    }
  };
  for (const entry of highSchool.entries) {
    for (const form of entry.forms) queries.add(normalize(form.word));
    connectAliases(entry.forms.filter((form) => (
      form.relation !== 'parallel'
    )).map((form) => form.word));
  }
  for (const entry of cet.entries) {
    for (const form of entry.forms) queries.add(normalize(form.word));
    const formsByToken = Map.groupBy(entry.forms, (form) => form.sourceToken);
    for (const forms of formsByToken.values()) {
      connectAliases(forms.filter((form) => form.relation !== 'parallel').map((form) => form.word));
    }
  }
  for (const bankId of ['ielts', 'toefl']) {
    for (const entry of legacyMembership.banks[bankId] ?? []) queries.add(normalize(entry.word));
  }
  queries.delete('');
  return {
    queries: [...queries].slice(0, limit),
    aliases,
    membershipSources: [
      { ...highSchool.source, path: 'scripts/data/official-membership/high-school.json' },
      { ...cet.source, path: 'scripts/data/official-membership/cet.json' },
      {
        name: 'Legacy curated IELTS/TOEFL membership bridge',
        path: 'scripts/data/legacy-membership-order.json',
        lexicalAuthority: false,
      },
    ],
  };
}

async function exportRecords(queries) {
  if (queries.length === 0) return new Map();
  const child = spawn('swift', [resolve(projectRoot, 'scripts/export-oxford.swift')], {
    cwd: projectRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let standardError = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { standardError += chunk; });
  const records = new Map();
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let processed = 0;
  const reading = (async () => {
    for await (const line of lines) {
      if (!line.trim()) continue;
      const exported = JSON.parse(line);
      records.set(exported.query, exported.records);
      processed += 1;
      if (processed % 500 === 0) console.log(`Oxford records: ${processed}/${queries.length}`);
    }
  })();
  for (const query of queries) child.stdin.write(`${query}\n`);
  child.stdin.end();
  const exitCode = await new Promise((resolveExit, reject) => {
    child.on('error', reject);
    child.on('close', resolveExit);
  });
  await reading;
  if (exitCode !== 0) {
    throw new Error(`Oxford exporter failed (${exitCode}): ${standardError.trim()}`);
  }
  if (records.size !== queries.length) {
    throw new Error(`Oxford exporter returned ${records.size}/${queries.length} queries.`);
  }
  return records;
}

function firstToken(value) {
  return normalize(value).split(/[\s-]+/, 1)[0];
}

function matchingCandidates(query, rawRecords, mode) {
  return rawRecords.map(parseOxfordRecord).filter((entry) => {
    if (!entry) return false;
    if (mode === 'orthographic') return orthographicKey(entry.word) === orthographicKey(query);
    return sourceListsInflection(entry, query)
      || inflectionForms(entry.word).has(query.toLocaleLowerCase('en-US'));
  });
}

function supportQueriesFor(query, result, aliases, rawRecords) {
  const support = [];
  if (/\s/.test(query)) support.push(firstToken(query));
  support.push(...(aliases.get(query) ?? []));
  if (VERIFIED_SOURCE_ALIASES[query]) support.push(VERIFIED_SOURCE_ALIASES[query].word);
  support.push(...result.crossReferences);
  support.push(...matchingCandidates(query, rawRecords, 'orthographic')
    .flatMap((entry) => entry.references ?? [])
    .map((reference) => reference.word));
  support.push(...matchingCandidates(query, rawRecords, 'inflection')
    .flatMap((entry) => entry.references ?? [])
    .map((reference) => reference.word));
  return support.map(normalize).filter(Boolean);
}

function compactResult(result, resolution) {
  const entries = result.entries.map(({ senses: _senses, phrases, ...entry }) => ({
    ...entry,
    phrases: phrases.map(({ senses: _phraseSenses, ...phrase }) => phrase),
  }));
  return {
    word: result.word,
    resolution,
    entries,
    references: result.references,
    crossReferences: result.crossReferences,
  };
}

function resultFromEntries(word, entries) {
  return {
    word,
    entries,
    senses: entries.flatMap((entry) => entry.senses),
    phrases: entries.flatMap((entry) => entry.phrases),
    references: entries.flatMap((entry) => entry.references ?? []),
    crossReferences: [...new Set(entries.flatMap((entry) => entry.crossReferences ?? []))],
  };
}

function orthographicKey(value) {
  return normalize(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]/g, '');
}

function inflectionForms(value) {
  const word = normalize(value).toLocaleLowerCase('en-US');
  if (!word || /\s/.test(word)) return new Set();
  const inflector = new Inflectors(word);
  return new Set([
    word,
    ...(infinitives[word] ?? []),
    inflector.toPresent(),
    inflector.toPast(),
    inflector.toPastParticiple(),
    inflector.toPresentS(),
    inflector.toGerund(),
    inflector.toSingular(),
    inflector.toPlural(),
    inflector.comparative(),
    inflector.superlative(),
  ].map((form) => String(form).toLocaleLowerCase('en-US')));
}

function sourceListsInflection(entry, query) {
  const normalized = normalize(query).toLocaleLowerCase('en-US');
  return entry.groups.some((group) => group.inflections?.some((inflection) => (
    [...new Intl.Segmenter('en', { granularity: 'word' }).segment(inflection)]
      .some((segment) => segment.isWordLike && segment.segment.toLocaleLowerCase('en-US') === normalized)
  )));
}

function candidateResult(query, rawRecords, mode) {
  const matches = matchingCandidates(query, rawRecords, mode)
    .filter((entry) => entry.senses.length > 0);
  if (matches.length === 0) return null;
  return projectOxfordResult(query, resultFromEntries(query, matches));
}

const { queries, aliases, membershipSources } = await loadQueries();
console.log(`Oxford queries: ${queries.length}`);
const records = await exportRecords(queries);
const direct = new Map(queries.map((query) => [
  query,
  parseOxfordRecords(query, records.get(query) ?? []),
]));
const supportQueries = new Set();
for (const [query, result] of direct) {
  if (result.senses.length > 0) continue;
  for (const support of supportQueriesFor(query, result, aliases, records.get(query) ?? [])) {
    if (!records.has(support)) supportQueries.add(support);
  }
}
const supportRecords = await exportRecords([...supportQueries]);
for (const [query, value] of supportRecords) records.set(query, value);

const entries = {};
const coverage = {
  direct: 0,
  variant: 0,
  sourceAlias: 0,
  orthographic: 0,
  inflection: 0,
  phrase: 0,
  redirect: 0,
  missing: 0,
  totalSenses: 0,
  totalPhrases: 0,
  missingWords: [],
};
for (const query of queries) {
  let result = direct.get(query);
  let resolution = { type: 'direct' };
  if (result.senses.length === 0) {
    for (const alias of aliases.get(query) ?? []) {
      const aliasResult = parseOxfordRecords(alias, records.get(alias) ?? []);
      if (aliasResult.senses.length === 0) continue;
      result = aliasOxfordResult(query, aliasResult);
      resolution = { type: 'variant', via: alias };
      break;
    }
  }
  if (result.senses.length === 0 && VERIFIED_SOURCE_ALIASES[query]) {
    const sourceAlias = VERIFIED_SOURCE_ALIASES[query];
    const targetResult = parseOxfordRecords(
      sourceAlias.word,
      records.get(sourceAlias.word) ?? [],
    );
    const projected = projectOxfordResult(query, targetResult, sourceAlias);
    if (projected.senses.length > 0) {
      result = projected;
      resolution = { type: 'sourceAlias', via: sourceAlias };
    }
  }
  if (result.senses.length === 0) {
    const projected = candidateResult(query, records.get(query) ?? [], 'orthographic');
    if (projected?.senses.length > 0) {
      result = projected;
      resolution = { type: 'orthographic' };
    }
  }
  if (result.senses.length === 0) {
    const projected = candidateResult(query, records.get(query) ?? [], 'inflection');
    if (projected?.senses.length > 0) {
      result = projected;
      resolution = { type: 'inflection' };
    }
  }
  if (result.senses.length === 0 && /\s/.test(query)) {
    const baseWord = firstToken(query);
    const projected = parseOxfordRecords(query, records.get(baseWord) ?? []);
    if (projected.senses.length > 0) {
      result = projected;
      resolution = { type: 'phrase', via: baseWord };
    }
    if (result.senses.length === 0 && query === `${baseWord} to`) {
      const baseResult = parseOxfordRecords(baseWord, records.get(baseWord) ?? []);
      if (baseResult.entries.some((entry) => entry.groups.some((group) => (
        group.partOfSpeech === 'modal verb'
      )))) {
        result = projectOxfordResult(query, baseResult);
        resolution = { type: 'phrase', via: baseWord };
      }
    }
  }
  if (result.senses.length === 0) {
    const candidateReferences = [
      ...result.references,
      ...matchingCandidates(query, records.get(query) ?? [], 'orthographic')
        .flatMap((entry) => entry.references ?? []),
      ...matchingCandidates(query, records.get(query) ?? [], 'inflection')
        .flatMap((entry) => entry.references ?? []),
    ];
    for (const reference of candidateReferences) {
      const targetResult = parseOxfordRecords(
        reference.word,
        records.get(reference.word) ?? [],
      );
      if (targetResult.senses.length === 0) continue;
      const projected = projectOxfordResult(query, targetResult, reference);
      if (projected.senses.length === 0) continue;
      result = projected;
      resolution = { type: 'redirect', via: reference };
      break;
    }
  }
  if (result.senses.length === 0) {
    resolution = { type: 'missing' };
    coverage.missingWords.push(query);
  }
  coverage[resolution.type] += 1;
  coverage.totalSenses += result.senses.length;
  coverage.totalPhrases += result.phrases.length;
  entries[query] = compactResult(result, resolution);
}

const output = {
  schemaVersion: 1,
  source: {
    name: 'Oxford Chinese Dictionary',
    nativeName: '牛津英汉汉英词典',
    bundleIdentifier: 'com.apple.dictionary.zh_CN-en.OCD',
    bundleVersion: '1.1',
    contentCopyright: 'Copyright © 2010, 2025 Oxford University Press and Foreign Language Teaching and Research Publishing Co., Ltd.',
    extraction: 'macOS DictionaryServices exact-record XML',
  },
  membershipSources,
  queryCount: queries.length,
  coverage,
  entries,
};
await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(output)}\n`, 'utf8');
await rename(temporaryPath, outputPath);
console.table({
  queries: queries.length,
  direct: coverage.direct,
  variant: coverage.variant,
  sourceAlias: coverage.sourceAlias,
  orthographic: coverage.orthographic,
  inflection: coverage.inflection,
  phrase: coverage.phrase,
  redirect: coverage.redirect,
  missing: coverage.missing,
  senses: coverage.totalSenses,
  phrases: coverage.totalPhrases,
});
console.log(`Oxford source: ${outputPath} (${await sha256(outputPath)})`);