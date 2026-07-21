import { useMemo } from 'react';
import type { WordEntry } from '../../domain/models';
import { buildWordOptions } from '../../domain/challenge';
import { primarySense } from '../../domain/wordText';

interface MatchWordQuestionProps {
  word: WordEntry;
  entries: WordEntry[];
  onSubmit: (correct: boolean, response: string, correctAnswer: string) => void;
}

/** Show the Chinese meaning; the learner picks the matching word. */
export function MatchWordQuestion({ word, entries, onSubmit }: MatchWordQuestionProps) {
  const options = useMemo(() => buildWordOptions(word, entries), [word, entries]);

  return (
    <div className="question-layout">
      <p className="question-kicker">选出与释义匹配的单词</p>
      <p className="boss-definition">{primarySense(word.definitionZh)}</p>
      <div className="choice-grid" role="group" aria-label="选择匹配单词">
        {options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            className="choice-button"
            onClick={() => onSubmit(option.correct, option.word.word, word.word)}
          >
            <span>{String.fromCharCode(65 + index)}</span>
            {option.word.word}
          </button>
        ))}
      </div>
    </div>
  );
}
