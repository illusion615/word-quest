import type { WordEntry } from './models';

export interface DefinitionSense {
  label: string;
  text: string;
}

export interface IdentifiedDefinitionSense extends DefinitionSense {
  id: string;
}

export function splitDefinitionSenses(value: string): string[] {
  return value
    .split(/；|\\n|\r?\n/)
    .map((sense) => sense.trim())
    .filter(Boolean);
}

export function primarySense(value: string, fallback = ''): string {
  return splitDefinitionSenses(value)[0] ?? fallback;
}

/**
 * Part-of-speech labels emitted by the Oxford dictionary build, longest first so that
 * compound labels such as "def. art." win over their "art." suffix. The legacy single
 * letter labels stay supported for previously generated data.
 */
const SENSE_LABELS = [
  'prop. n. pl.',
  'vt. & vi.',
  'vi. & vt.',
  'indef. art.',
  'inf. part.',
  'comb. form',
  'rel. pron.',
  'adj. phr.',
  'adv. phr.',
  'conj. phr.',
  'prep. phr.',
  'pron. phr.',
  'def. art.',
  'prop. n.',
  'v. impers.',
  'v. refl.',
  'v. link.',
  'phr. v.',
  'n. pl.',
  'modal.',
  'abbr.',
  'conj.',
  'prep.',
  'pron.',
  'phr.',
  'adj.',
  'adv.',
  'art.',
  'aux.',
  'det.',
  'int.',
  'num.',
  'p.p.',
  'vt.',
  'vi.',
  'ad.',
  'n.',
  'v.',
  'a.',
  's.',
];

function escapeLabel(label: string): string {
  return label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SENSE_LABEL_PATTERN = new RegExp(
  `^(${SENSE_LABELS.map(escapeLabel).join('|')})\\s+(.+)$`,
  'i',
);

export function parseDefinitionSenses(value: string): DefinitionSense[] {
  return splitDefinitionSenses(value).map((sense) => {
    const partOfSpeech = sense.match(SENSE_LABEL_PATTERN);
    if (partOfSpeech) {
      return { label: partOfSpeech[1], text: partOfSpeech[2] };
    }

    const domain = sense.match(/^(\[[^\]]+\])\s*(.+)$/);
    if (domain) return { label: domain[1], text: domain[2] };

    return { label: '', text: sense };
  });
}

export function parseWordSenses(
  word: Pick<WordEntry, 'id' | 'definitionZh' | 'senseIds'>,
): IdentifiedDefinitionSense[] {
  return parseDefinitionSenses(word.definitionZh).map((sense, index) => ({
    id: word.senseIds?.[index] ?? `${word.id}:s${index}`,
    ...sense,
  }));
}