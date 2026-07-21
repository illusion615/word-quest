export interface DefinitionSense {
  label: string;
  text: string;
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

export function parseDefinitionSenses(value: string): DefinitionSense[] {
  return splitDefinitionSenses(value).map((sense) => {
    const partOfSpeech = sense.match(
      /^(adj|adv|aux|conj|int|n|num|prep|pron|vi|vt|v|a|ad)\.\s*(.+)$/i,
    );
    if (partOfSpeech) {
      return { label: `${partOfSpeech[1]}.`, text: partOfSpeech[2] };
    }

    const domain = sense.match(/^(\[[^\]]+\])\s*(.+)$/);
    if (domain) return { label: domain[1], text: domain[2] };

    return { label: '', text: sense };
  });
}