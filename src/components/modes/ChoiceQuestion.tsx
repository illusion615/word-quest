import { useState } from 'react';
import type { WordEntry } from '../../domain/models';
import { shuffleEntries } from '../../domain/session';
import { primarySense } from '../../domain/wordText';

interface ChoiceQuestionProps {
  word: WordEntry;
  entries: WordEntry[];
  onSubmit: (correct: boolean, response: string, correctAnswer: string) => void;
}

export function ChoiceQuestion({ word, entries, onSubmit }: ChoiceQuestionProps) {
  const [options] = useState(() => {
    const candidates = entries.filter((entry) => entry.id !== word.id);
    const distractors: WordEntry[] = [];
    const start = Math.floor(Math.random() * Math.max(candidates.length, 1));
    for (let offset = 0; offset < candidates.length && distractors.length < 3; offset += 1) {
      const candidate = candidates[(start + offset) % candidates.length];
      if (primarySense(candidate.definitionZh) !== primarySense(word.definitionZh)) distractors.push(candidate);
    }
    return shuffleEntries([word, ...distractors]);
  });

  return (
    <div className="question-layout">
      <div className="word-prompt">
        <strong>{word.word}</strong>
        <span>{word.phonetic} · {word.partOfSpeech}</span>
      </div>
      <div className="choice-grid" role="group" aria-label="选择正确释义">
        {options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            className="choice-button"
            onClick={() => onSubmit(
              option.id === word.id,
              primarySense(option.definitionZh),
              primarySense(word.definitionZh),
            )}
          >
            <span>{String.fromCharCode(65 + index)}</span>
            {primarySense(option.definitionZh)}
          </button>
        ))}
      </div>
    </div>
  );
}