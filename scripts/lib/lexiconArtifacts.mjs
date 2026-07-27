export const LEXICON_SCHEMA_VERSION = 3;
export const BANK_INDEX_SCHEMA_VERSION = 1;

function parseSenseText(value) {
  return String(value ?? '')
    .split(/；|\\n|\r?\n/)
    .map((sense) => sense.trim())
    .filter(Boolean)
    .map((sense) => {
      const partOfSpeech = sense.match(
        /^((?:adj|adv|art|aux|conj|int|n|num|prep|pron|vi|vt|v|s|a|ad)\.)(\s*)(.+)$/i,
      );
      if (partOfSpeech) {
        return { label: partOfSpeech[1], separator: partOfSpeech[2], text: partOfSpeech[3] };
      }
      const domain = sense.match(/^(\[[^\]]+\])(\s*)(.+)$/);
      if (domain) return { label: domain[1], separator: domain[2], text: domain[3] };
      return { label: '', separator: '', text: sense };
    });
}

export function serializeCanonicalSenses(senses) {
  return senses.map((sense) => (
    sense.label
      ? `${sense.label}${sense.separator ?? ' '}${String(sense.text).replace(/；|\\n|\r?\n/g, '、')}`
      : String(sense.text).replace(/；|\\n|\r?\n/g, '、')
  )).join('；');
}

function nextSenseId(wordId, usedIds) {
  let index = 0;
  while (usedIds.has(`${wordId}:s${index}`)) index += 1;
  return `${wordId}:s${index}`;
}

export function updateCanonicalDefinition(word, definitionZh) {
  const previous = Array.isArray(word.senses) ? word.senses : [];
  const parsed = parseSenseText(definitionZh);
  const exactIds = parsed.map(() => null);
  const usedIds = new Set();

  parsed.forEach((sense, index) => {
    const exact = previous.find((candidate) => (
      !usedIds.has(candidate.id)
      && candidate.label === sense.label
      && candidate.separator === sense.separator
      && candidate.text === sense.text
    ));
    if (!exact) return;
    exactIds[index] = exact.id;
    usedIds.add(exact.id);
  });

  const senses = parsed.map((sense, index) => {
    if (exactIds[index]) return { id: exactIds[index], ...sense };
    const positional = previous[index] && !usedIds.has(previous[index].id)
      ? previous[index]
      : null;
    const id = positional?.id ?? nextSenseId(word.id, new Set([
      ...previous.map((candidate) => candidate.id),
      ...usedIds,
    ]));
    usedIds.add(id);
    return { id, ...sense };
  });
  return { ...word, senses };
}

export function canonicalWord(entry) {
  const {
    banks: _banks,
    senseIds: _senseIds,
    frequencyRank: _frequencyRank,
    frequencyPercentile: _frequencyPercentile,
    definitionZh,
    ...fields
  } = entry;
  return updateCanonicalDefinition({ ...fields, senses: [] }, definitionZh);
}

export function materializeCanonicalWord(word) {
  const {
    senses,
    id,
    word: headword,
    phonetic,
    partOfSpeech,
    definition,
    example,
    exampleZh,
    sourceTags,
    lexicalSourceHash,
  } = word;
  return {
    id,
    word: headword,
    phonetic,
    partOfSpeech,
    definition,
    definitionZh: serializeCanonicalSenses(senses),
    senseIds: senses.map((sense) => sense.id),
    ...(lexicalSourceHash !== undefined ? { lexicalSourceHash } : {}),
    ...(example !== undefined ? { example } : {}),
    ...(exampleZh !== undefined ? { exampleZh } : {}),
    ...(sourceTags !== undefined ? { sourceTags } : {}),
  };
}

export function buildLexiconArtifacts(bankEntries, source) {
  const words = new Map();
  const banks = {};

  for (const [bankId, entries] of bankEntries) {
    const seen = new Set();
    banks[bankId] = entries.map((entry) => {
      if (!entry?.id || seen.has(entry.id)) {
        throw new Error(`${bankId} contains an invalid or duplicate word ID: ${entry?.id ?? ''}`);
      }
      seen.add(entry.id);
      const canonical = canonicalWord(entry);
      const existing = words.get(entry.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(canonical)) {
        throw new Error(`${entry.id} has conflicting canonical data across exam banks.`);
      }
      words.set(entry.id, canonical);
      return entry.id;
    });
  }

  return {
    lexicon: {
      schemaVersion: LEXICON_SCHEMA_VERSION,
      source,
      words: Object.fromEntries(
        [...words.entries()].sort(([left], [right]) => left.localeCompare(right, 'en')),
      ),
    },
    bankIndex: {
      schemaVersion: BANK_INDEX_SCHEMA_VERSION,
      banks,
    },
  };
}

export function projectBank(lexicon, bankIndex, bankId) {
  const ids = bankIndex.banks?.[bankId];
  if (!Array.isArray(ids)) throw new Error(`Missing word index for ${bankId}.`);
  return ids.map((wordId) => {
    const word = lexicon.words?.[wordId];
    if (!word) throw new Error(`${bankId} references missing canonical word ${wordId}.`);
    return { ...materializeCanonicalWord(word), banks: [bankId] };
  });
}

export function buildCoverageIndex(bankOrder, bankIndex) {
  const memberships = {};
  bankOrder.forEach((bankId, position) => {
    const ids = bankIndex.banks?.[bankId];
    if (!Array.isArray(ids)) throw new Error(`Missing word index for ${bankId}.`);
    ids.forEach((wordId) => {
      memberships[wordId] = (memberships[wordId] ?? 0) | (1 << position);
    });
  });
  return {
    schemaVersion: 1,
    bankOrder,
    bankCounts: Object.fromEntries(bankOrder.map((bankId) => [bankId, bankIndex.banks[bankId].length])),
    memberships: Object.fromEntries(
      Object.entries(memberships).sort(([left], [right]) => left.localeCompare(right, 'en')),
    ),
  };
}