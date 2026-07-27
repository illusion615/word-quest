import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';

const PART_OF_SPEECH = [
  'adjective phrase',
  'phrasal verb',
  'auxiliary verb',
  'transitive verb',
  'intransitive verb',
  'modal verb',
  'proper noun',
  'determiner',
  'preposition',
  'conjunction',
  'exclamation',
  'adjective',
  'adverb',
  'pronoun',
  'article',
  'number',
  'noun',
  'verb',
];

const POS_PATTERN = new RegExp(
  `(?:^|\\s)(?:[A-Z]\\.\\s+)?(${PART_OF_SPEECH.join('|')})(?=\\s|$)`,
  'gi',
);
const SENSE_MARKER = /[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/g;
const PINYIN_SYLLABLE = /\b[a-zü]+(?:ā|á|ǎ|à|ē|é|ě|è|ī|í|ǐ|ì|ō|ó|ǒ|ò|ū|ú|ǔ|ù|ǖ|ǘ|ǚ|ǜ)[a-zü]*\b/giu;

const POS_LABELS = {
  'adjective phrase': 'adj. phr.',
  'adverb phrase': 'adv. phr.',
  'conjunction phrase': 'conj. phr.',
  'preposition phrase': 'prep. phr.',
  'pronoun phrase': 'pron. phr.',
  'phrasal verb': 'phr. v.',
  'auxiliary verb': 'aux.',
  'transitive verb': 'vt.',
  'intransitive verb': 'vi.',
  'transitive or intransitive verb': 'vt. & vi.',
  'intransitive or transitive verb': 'vi. & vt.',
  'reflexive verb': 'v. refl.',
  'impersonal verb': 'v. impers.',
  'copular verb': 'v. link.',
  'modal verb': 'modal.',
  'proper noun': 'prop. n.',
  'plural noun': 'n. pl.',
  'plural proper noun': 'prop. n. pl.',
  'relative pronoun': 'rel. pron.',
  'definite article': 'def. art.',
  'indefinite article': 'indef. art.',
  'infinitive particle': 'inf. part.',
  'combining form': 'comb. form',
  'past participle': 'p.p.',
  abbreviation: 'abbr.',
  phrase: 'phr.',
  determiner: 'det.',
  preposition: 'prep.',
  conjunction: 'conj.',
  exclamation: 'int.',
  adjective: 'adj.',
  adverb: 'adv.',
  pronoun: 'pron.',
  article: 'art.',
  number: 'num.',
  noun: 'n.',
  verb: 'v.',
};

function normalizePartOfSpeech(value) {
  return normalizeSpace(value).replace(/[,，;；]+$/u, '').trim().toLowerCase();
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: false,
  parseTagValue: false,
  processEntities: false,
  isArray: (name) => name === 'span',
});

function normalizeSpace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function stableSenseId(word, partOfSpeech, definitionZh) {
  const digest = createHash('sha256')
    .update(JSON.stringify([word.toLowerCase(), partOfSpeech, definitionZh]))
    .digest('hex')
    .slice(0, 12);
  return `${word.toLowerCase()}:${digest}`;
}

function sourceSenseId(word, sourceId, sourceKey, definitionZh) {
  const digest = createHash('sha256')
    .update(JSON.stringify([sourceId, sourceKey, definitionZh]))
    .digest('hex')
    .slice(0, 12);
  return `${word.toLowerCase()}:o:${digest}`;
}

function classTokens(node) {
  return new Set(String(node?.['@_class'] ?? '').split(/\s+/).filter(Boolean));
}

function hasClass(node, name) {
  return classTokens(node).has(name);
}

function spanChildren(node) {
  return Array.isArray(node?.span) ? node.span : [];
}

function descendants(node, predicate, skipChildren = () => false) {
  const matches = [];
  for (const child of spanChildren(node)) {
    if (predicate(child)) matches.push(child);
    if (!skipChildren(child)) matches.push(...descendants(child, predicate, skipChildren));
  }
  return matches;
}

function elementChildren(node) {
  if (!node || typeof node !== 'object') return [];
  return Object.entries(node).flatMap(([key, value]) => {
    if (key === '#text' || key.startsWith('@_')) return [];
    if (Array.isArray(value)) return value.filter((item) => item && typeof item === 'object');
    return value && typeof value === 'object' ? [value] : [];
  });
}

function allDescendants(node, predicate) {
  const matches = [];
  for (const child of elementChildren(node)) {
    if (predicate(child)) matches.push(child);
    matches.push(...allDescendants(child, predicate));
  }
  return matches;
}

function textContent(node) {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  const values = [];
  if (typeof node['#text'] === 'string') values.push(node['#text']);
  for (const [key, value] of Object.entries(node)) {
    if (key === '#text' || key.startsWith('@_')) continue;
    values.push(textContent(value));
  }
  return normalizeSpace(values.join(' '));
}

function unique(values) {
  return [...new Set(values.map(normalizeSpace).filter(Boolean))];
}

function classText(node, name) {
  return unique(descendants(node, (candidate) => hasClass(candidate, name)).map(textContent));
}

function definitionContainers(node) {
  const direct = spanChildren(node).filter((candidate) => hasClass(candidate, 'trg'));
  const grouped = spanChildren(node)
    .filter((candidate) => hasClass(candidate, 'trgg'))
    .flatMap((group) => spanChildren(group).filter((candidate) => hasClass(candidate, 'trg')));
  const containers = [...direct, ...grouped];
  if (containers.length > 0) return containers;
  const usageOnly = spanChildren(node)
    .filter((candidate) => hasClass(candidate, 'exg'))
    .flatMap((example) => spanChildren(example).filter((candidate) => hasClass(candidate, 'trg')))
    .filter((container) => classText(container, 'gl').some((value) => (
      /[\u3400-\u9fff]/u.test(value)
    )));
  return usageOnly.length > 0 ? usageOnly : [node];
}

function usageGlossText(node) {
  return unique(classText(node, 'gl')
    .map((value) => value.replace(/[[\]【】]/g, '').trim())
    .filter((value) => /[\u3400-\u9fff]/u.test(value))).join('；');
}

function definitionText(node) {
  const usageGlosses = usageGlossText(node);
  if (usageGlosses) return usageGlosses;
  const explicit = descendants(node, (candidate) => candidate['@_d:def'] === '1')
    .map(textContent)
    .filter((value) => /[\u3400-\u9fff]/u.test(value));
  if (explicit.length > 0) return unique(explicit).join('；');
  const translations = definitionContainers(node).flatMap((container) => (
    descendants(container, (candidate) => (
      hasClass(candidate, 'trans') && !hasClass(candidate, 'ty_pinyin')
    )).map(textContent)
  ));
  return unique(translations).filter((value) => /[\u3400-\u9fff]/u.test(value)).join('；');
}

function examples(node) {
  return descendants(node, (candidate) => hasClass(candidate, 'exg')).flatMap((exampleNode) => {
    const english = classText(exampleNode, 'ex')[0] ?? '';
    const translations = descendants(exampleNode, (candidate) => hasClass(candidate, 'trg'))
      .map((translationNode) => {
        const chinese = unique(descendants(translationNode, (candidate) => (
          hasClass(candidate, 'trans') && !hasClass(candidate, 'ty_pinyin')
        )).map(textContent)).join('；');
        const label = unique([
          ...classText(translationNode, 'lev'),
          ...classText(translationNode, 'reg'),
        ]).join('；');
        return chinese ? { chinese, ...(label ? { label } : {}) } : null;
      })
      .filter(Boolean);
    if (!english || translations.length === 0) return [];
    return [{
      english,
      chinese: translations.map((translation) => translation.chinese).join('；'),
      translations,
    }];
  });
}

function cleanMarkup(value) {
  return normalizeSpace(String(value ?? '')
    .replace(/[‹›«»\[\]【】]/g, ' ')
    .replace(/\s*([,，;；/])\s*/g, '$1 '))
    .replace(/^[\s,，;；]+|[\s,，;；]+$/g, '')
    .trim();
}

function parseStructuredSense(
  word,
  recordId,
  partOfSpeech,
  senseNode,
  definitionNode,
  sourceKey,
  parentSourceKey,
  subsenseIndex,
  senseExamples,
) {
  const definitionZh = definitionText(definitionNode);
  if (!/[\u3400-\u9fff]/u.test(definitionZh)) return null;
  const indicators = classText(definitionNode, 'ind')
    .map((value) => value.replace(/[()（）]/g, '').trim());
  const labels = {
    register: unique(classText(definitionNode, 'reg').map(cleanMarkup)),
    domain: unique(classText(definitionNode, 'fld').map(cleanMarkup)),
    level: unique(classText(definitionNode, 'lev').map(cleanMarkup)),
  };
  const contexts = unique([
    ...classText(definitionNode, 'cs'),
    ...classText(definitionNode, 'co'),
  ].map(cleanMarkup));
  const patterns = unique(classText(senseNode, 'pgr').map(cleanMarkup));
  const senseNumber = spanChildren(senseNode)
    .filter((candidate) => hasClass(candidate, 'sn') && hasClass(candidate, 'ty_label'))
    .map(textContent)[0]?.trim();
  return {
    id: sourceSenseId(word, recordId, sourceKey, definitionZh),
    label: POS_LABELS[partOfSpeech] ?? partOfSpeech,
    separator: ' ',
    text: definitionZh,
    partOfSpeech,
    definitionZh,
    ...(indicators.length > 0 ? { glossesEn: indicators } : {}),
    ...(Object.values(labels).some((values) => values.length > 0) ? { labels } : {}),
    ...(contexts.length > 0 ? { contexts } : {}),
    ...(patterns.length > 0 ? { patterns } : {}),
    examples: senseExamples,
    source: {
      dictionary: 'Oxford Chinese Dictionary',
      recordId,
      senseId: parentSourceKey,
      ...(sourceKey !== parentSourceKey ? { subsenseId: sourceKey } : {}),
      ...(subsenseIndex !== null ? { subsenseIndex } : {}),
      ...(senseNumber ? { number: senseNumber } : {}),
    },
  };
}

function parseStructuredSenses(word, recordId, partOfSpeech, node, fallbackKey) {
  const parentSourceKey = node['@_lexid'] ?? fallbackKey;
  const containers = definitionContainers(node);
  const split = containers.length > 1;
  const senseExamples = examples(node);
  return containers.map((container, index) => parseStructuredSense(
    word,
    recordId,
    partOfSpeech,
    node,
    container,
    split ? `${parentSourceKey}:${index}` : parentSourceKey,
    parentSourceKey,
    split ? index : null,
    split && index > 0 ? [] : senseExamples,
  )).filter(Boolean);
}

function parseGrammarBlock(word, recordId, node, fallbackKey) {
  const partOfSpeech = normalizePartOfSpeech(classText(node, 'ps')[0] ?? '');
  const form = classText(node, 'frm')[0] ?? '';
  const section = spanChildren(node)
    .filter((candidate) => hasClass(candidate, 'x_xdh'))
    .flatMap((header) => spanChildren(header))
    .filter((candidate) => hasClass(candidate, 'sn') && hasClass(candidate, 'ty_label'))
    .map(textContent)[0]?.replace(/\.$/, '').trim();
  const senseNodes = spanChildren(node).filter((candidate) => hasClass(candidate, 'semb'));
  const candidates = senseNodes.length > 0 ? senseNodes : [node];
  const senses = candidates.flatMap((senseNode, index) => parseStructuredSenses(
    word,
    recordId,
    partOfSpeech,
    senseNode,
    `${fallbackKey}:${index}`,
  ));
  const inflections = classText(node, 'infg');
  return {
    partOfSpeech,
    label: POS_LABELS[partOfSpeech] ?? partOfSpeech,
    ...(form ? { form } : {}),
    ...(section ? { section } : {}),
    ...(inflections.length > 0 ? { inflections } : {}),
    senses,
  };
}

function parsePronunciations(entry) {
  const pronunciations = {};
  for (const pronunciation of descendants(entry, (node) => hasClass(node, 'prx'))) {
    const dialect = pronunciation['@_dialect'];
    const values = classText(pronunciation, 'ph');
    if (!dialect || values.length === 0) continue;
    pronunciations[dialect === 'BrE' ? 'british' : dialect === 'AmE' ? 'american' : dialect]
      = values;
  }
  return pronunciations;
}

function parsePhrases(word, recordId, entry) {
  return descendants(entry, (node) => hasClass(node, 'pvsec')).flatMap((section, index) => {
    const phrase = classText(section, 'pv')[0] ?? '';
    if (!phrase) return [];
    const groups = descendants(section, (node) => hasClass(node, 'gramb'))
      .map((group, groupIndex) => parseGrammarBlock(
        word,
        recordId,
        group,
        `phrase:${index}:${groupIndex}`,
      ));
    return [{
      id: section['@_id'] ?? `${recordId}:phrase:${index}`,
      phrase,
      groups,
      senses: groups.flatMap((group) => group.senses),
    }];
  });
}

function parseReferences(entry) {
  return allDescendants(entry, (node) => hasClass(node, 'xr')).flatMap((reference) => {
    const link = allDescendants(reference, (node) => typeof node['@_title'] === 'string')[0];
    const word = normalizeSpace(link?.['@_title'] ?? textContent(reference));
    if (!word) return [];
    const labels = allDescendants(reference, (node) => hasClass(node, 'xrlabel'))
      .map(textContent)
      .map((value) => value.trim())
      .filter(Boolean);
    const homograph = allDescendants(reference, (node) => hasClass(node, 'hm'))
      .map(textContent)[0]?.trim();
    const section = labels.find((label) => /^[A-Z]$/.test(label));
    const sense = labels.find((label) => /^\d+$/.test(label));
    return [{
      word,
      ...(homograph ? { homograph } : {}),
      ...(section ? { section } : {}),
      ...(sense ? { sense: Number(sense) } : {}),
    }];
  });
}

export function parseOxfordRecord(record) {
  if (!record?.html || !record?.sourceId) return null;
  // Oxford wraps inline connectors such as "or" in a typographic span. Unwrapping them
  // before parsing keeps example wording in reading order.
  const document = xmlParser.parse(
    record.html.replace(/<span class="underline">([^<]*)<\/span>/g, '$1'),
  );
  const entry = document?.html?.body?.['d:entry'] ?? document?.['d:entry'];
  if (!entry) return null;
  const word = normalizeSpace(entry['@_d:title'] ?? record.headword);
  const grammarBlocks = descendants(
    entry,
    (node) => hasClass(node, 'gramb'),
    (node) => hasClass(node, 'pvsec'),
  );
  const groups = grammarBlocks.map((group, index) => parseGrammarBlock(
    word,
    record.sourceId,
    group,
    `group:${index}`,
  )).filter((group) => group.senses.length > 0);
  const references = parseReferences(entry);
  return {
    sourceId: record.sourceId,
    word,
    headwords: classText(entry, 'hw'),
    variants: classText(entry, 'hv'),
    homograph: descendants(entry, (node) => hasClass(node, 'hw'))[0]?.['@_hm'] ?? null,
    pronunciations: parsePronunciations(entry),
    groups,
    senses: groups.flatMap((group) => group.senses),
    phrases: parsePhrases(word, record.sourceId, entry),
    ...(references.length > 0 ? {
      references,
      crossReferences: references.map((reference) => reference.word),
    } : {}),
  };
}

function rekeySense(sense, word) {
  const sourceKey = sense.source.subsenseId ?? sense.source.senseId;
  return {
    ...sense,
    id: sourceSenseId(word, sense.source.recordId, sourceKey, sense.definitionZh),
  };
}

function rekeyGroup(group, word) {
  return { ...group, senses: group.senses.map((sense) => rekeySense(sense, word)) };
}

function rekeyPhrase(phrase, word) {
  const groups = phrase.groups.map((group) => rekeyGroup(group, word));
  return { ...phrase, groups, senses: groups.flatMap((group) => group.senses) };
}

function rekeyEntry(entry, word, selectedGroups = entry.groups) {
  const groups = selectedGroups.map((group) => rekeyGroup(group, word));
  const phrases = entry.phrases.map((phrase) => rekeyPhrase(phrase, word));
  return {
    ...entry,
    sourceWord: entry.word,
    word,
    groups,
    senses: groups.flatMap((group) => group.senses),
    phrases,
  };
}

function circledNumber(value) {
  return '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'.indexOf(value) + 1;
}

function lexicalForms(entry) {
  return unique([entry.word, ...entry.headwords, ...entry.variants])
    .map((form) => form.replace(/^[,;\s]+|[,;\s]+$/g, ''));
}

export function parseOxfordRecords(word, records) {
  const requestedWord = normalizeSpace(word);
  const normalized = requestedWord.toLocaleLowerCase('en-US');
  const parsed = records.map(parseOxfordRecord).filter(Boolean);
  const exactCase = parsed.filter((entry) => lexicalForms(entry).includes(requestedWord));
  const caseInsensitive = parsed.filter((entry) => lexicalForms(entry).some((form) => (
    form.toLocaleLowerCase('en-US') === normalized
  )));
  let selected = exactCase.length > 0 ? exactCase : caseInsensitive;
  let entries = selected.map((entry) => rekeyEntry(entry, requestedWord));
  if (entries.length === 0) {
    selected = parsed.filter((entry) => entry.groups.some((group) => (
      group.form?.toLocaleLowerCase('en-US') === normalized
    )));
    entries = selected.map((entry) => rekeyEntry(
      entry,
      requestedWord,
      entry.groups.filter((group) => group.form?.toLocaleLowerCase('en-US') === normalized),
    ));
  }
  return {
    word: requestedWord,
    entries,
    senses: entries.flatMap((entry) => entry.senses),
    phrases: entries.flatMap((entry) => entry.phrases),
    references: entries.flatMap((entry) => entry.references ?? []),
    crossReferences: unique(entries.flatMap((entry) => entry.crossReferences ?? [])),
  };
}

export function aliasOxfordResult(word, result) {
  return projectOxfordResult(word, result);
}

export function projectOxfordResult(word, result, reference = {}) {
  const requestedWord = normalizeSpace(word);
  const entries = result.entries.flatMap((entry) => {
    if (reference.homograph && String(entry.homograph) !== String(reference.homograph)) {
      return [];
    }
    let groups = entry.groups;
    if (reference.section) {
      groups = groups.filter((group) => group.section === reference.section);
    }
    if (reference.partOfSpeech) {
      const accepted = Array.isArray(reference.partOfSpeech)
        ? reference.partOfSpeech
        : [reference.partOfSpeech];
      groups = groups.filter((group) => accepted.includes(group.partOfSpeech));
    }
    if (reference.sense) {
      groups = groups.map((group) => ({
        ...group,
        senses: group.senses.filter((sense) => (
          circledNumber(sense.source.number) === reference.sense
        )),
      })).filter((group) => group.senses.length > 0);
    }
    return groups.length > 0 ? [rekeyEntry(entry, requestedWord, groups)] : [];
  });
  return {
    word: requestedWord,
    entries,
    senses: entries.flatMap((entry) => entry.senses),
    phrases: entries.flatMap((entry) => entry.phrases),
    references: result.references,
    crossReferences: result.crossReferences,
  };
}

function stripPinyin(value) {
  return value
    .replace(PINYIN_SYLLABLE, '')
    .replace(/\b(?:de|le|shi|ge|yu|he|huo|zai|ba|bei)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function chineseDefinition(value) {
  const beforeExamples = value.split('▸', 1)[0];
  const withoutEnglishLabels = beforeExamples
    .replace(/\([^)]*[A-Za-z][^)]*\)/g, ' ')
    .replace(/^(?:formal|informal|figurative|humorous|literary|dated|archaic|euphemistic|technical|trademark|offensive|slang)\s+/i, '')
    .replace(/^[^\u3400-\u9fff]+/u, '');
  const normalized = stripPinyin(withoutEnglishLabels);
  const matches = normalized.match(/[\u3400-\u9fff][\u3400-\u9fff（）()、，,；;·…的了地得为于与或把被在之]+/gu);
  return normalizeSpace(matches?.join('；') ?? normalized)
    .replace(/[;,，；]+$/u, '');
}

function examplesForSense(value) {
  return value.split('▸').slice(1).flatMap((segment) => {
    const text = normalizeSpace(segment);
    if (!text) return [];
    const firstChinese = text.search(/[\u3400-\u9fff]/u);
    if (firstChinese <= 0) return [];
    const sentence = text.slice(0, firstChinese).trim();
    const translation = text.slice(firstChinese).trim();
    return sentence && translation ? [{ sentence, translation }] : [];
  });
}

function splitParts(rawEntry, word) {
  const headerPattern = new RegExp(`^${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|[^|]*\\|\\s*`, 'i');
  const body = normalizeSpace(rawEntry).replace(headerPattern, '');
  const matches = [...body.matchAll(POS_PATTERN)];
  if (matches.length === 0) return [];
  return matches.map((match, index) => ({
    partOfSpeech: match[1].toLowerCase(),
    text: body.slice((match.index ?? 0) + match[0].length, matches[index + 1]?.index ?? body.length).trim(),
  }));
}

function splitSenses(text) {
  const markers = [...text.matchAll(SENSE_MARKER)];
  if (markers.length === 0) return [text];
  return markers.map((marker, index) => (
    text.slice((marker.index ?? 0) + marker[0].length, markers[index + 1]?.index ?? text.length).trim()
  ));
}

export function parseOxfordEntry(word, rawEntry) {
  const normalizedWord = normalizeSpace(word);
  const raw = normalizeSpace(rawEntry);
  if (!normalizedWord || !raw) return null;
  const pronunciation = raw.match(/^[^|]+\|\s*(.*?)\s*\|/)?.[1] ?? '';
  const groups = splitParts(raw, normalizedWord).map((group) => {
    const label = POS_LABELS[group.partOfSpeech] ?? group.partOfSpeech;
    const senses = splitSenses(group.text).flatMap((segment) => {
      const definitionZh = chineseDefinition(segment);
      if (!/[\u3400-\u9fff]/u.test(definitionZh)) return [];
      return [{
        id: stableSenseId(normalizedWord, group.partOfSpeech, definitionZh),
        partOfSpeech: group.partOfSpeech,
        label,
        definitionZh,
        examples: examplesForSense(segment),
        sourceText: segment,
      }];
    });
    return { partOfSpeech: group.partOfSpeech, label, senses };
  }).filter((group) => group.senses.length > 0);
  if (groups.length === 0) return null;
  return {
    word: normalizedWord,
    pronunciation,
    groups,
    senses: groups.flatMap((group) => group.senses),
    rawEntry: raw,
  };
}

export function serializeOxfordSenses(entry) {
  return entry.senses.map((sense) => `${sense.label} ${sense.definitionZh}`).join('；');
}