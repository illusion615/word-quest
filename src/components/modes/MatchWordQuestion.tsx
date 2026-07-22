import { useMemo, useState } from 'react';
import type { WordEntry } from '../../domain/models';
import { buildWordOptions } from '../../domain/challenge';
import { primarySense } from '../../domain/wordText';
import { ChoiceReviewMark, resolveChoiceReviewState } from './ChoiceReviewMark';

interface MatchWordQuestionProps {
  word: WordEntry;
  entries: WordEntry[];
  extraOptionCount?: number;
  preferSimilarDistractors?: boolean;
  reviewed?: boolean;
  onSubmit: (correct: boolean, response: string, correctAnswer: string) => void;
}

/** Show the Chinese meaning; the learner picks the matching word. */
export function MatchWordQuestion({
  word,
  entries,
  extraOptionCount = 0,
  preferSimilarDistractors = false,
  reviewed = false,
  onSubmit,
}: MatchWordQuestionProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const options = useMemo(() => buildWordOptions(word, entries, {
    extraOptionCount,
    preferSimilarDistractors,
  }), [entries, extraOptionCount, preferSimilarDistractors, word]);

  return (
    <div className="question-layout">
      <p className="question-kicker">选出与释义匹配的单词</p>
      <p className="boss-definition">{primarySense(word.definitionZh)}</p>
      <div
        className="choice-grid"
        role="group"
        aria-label="选择匹配单词"
        data-option-count={options.length}
      >
        {options.map((option, index) => {
          const selected = selectedId === option.id;
          const reviewState = resolveChoiceReviewState(option.correct, selected, reviewed);
          return (
            <button
              key={option.id}
              type="button"
              className={[
                'choice-button',
                selected ? 'is-selected' : '',
                reviewState ? `is-${reviewState}` : '',
              ].filter(Boolean).join(' ')}
              aria-pressed={selected}
              data-review-state={reviewState ?? undefined}
              disabled={reviewed}
              onClick={() => {
                setSelectedId(option.id);
                onSubmit(option.correct, option.word.word, word.word);
              }}
            >
              <span className="choice-letter">{String.fromCharCode(65 + index)}</span>
              <span className="choice-text">{option.word.word}</span>
              <ChoiceReviewMark state={reviewState} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
