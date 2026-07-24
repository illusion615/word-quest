import { useMemo, useState } from 'react';
import type { WordEntry } from '../../domain/models';
import { buildWordOptions } from '../../domain/challenge';
import { primarySense } from '../../domain/wordText';
import { ChoiceSenseDetail } from '../ChoiceSenseDetail';
import { resolveChoiceReviewState } from './ChoiceReviewMark';
import { ReviewableChoice, useReviewedChoiceInspection } from './ReviewableChoice';

interface MatchWordQuestionProps {
  word: WordEntry;
  entries: WordEntry[];
  extraOptionCount?: number;
  preferSimilarDistractors?: boolean;
  reviewed?: boolean;
  onReviewInspectionChange?: (inspecting: boolean) => void;
  onSubmit: (correct: boolean, response: string, correctAnswer: string) => void;
}

/** Show the Chinese meaning; the learner picks the matching word. */
export function MatchWordQuestion({
  word,
  entries,
  extraOptionCount = 0,
  preferSimilarDistractors = false,
  reviewed = false,
  onReviewInspectionChange,
  onSubmit,
}: MatchWordQuestionProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const options = useMemo(() => buildWordOptions(word, entries, {
    extraOptionCount,
    preferSimilarDistractors,
  }), [entries, extraOptionCount, preferSimilarDistractors, word]);
  const { inspectedId, handleChoiceClick } = useReviewedChoiceInspection({
    reviewed,
    onInspectionChange: onReviewInspectionChange,
  });

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
            <ReviewableChoice
              key={option.id}
              index={index}
              text={option.word.word}
              correct={option.correct}
              selected={selected}
              reviewState={reviewState}
              reviewed={reviewed}
              inspecting={inspectedId === option.id}
              onClick={() => handleChoiceClick(option.id, option.correct, () => {
                setSelectedId(option.id);
                onSubmit(option.correct, option.word.word, word.word);
              })}
              detail={<ChoiceSenseDetail word={option.word} senseIndex={0} />}
            />
          );
        })}
      </div>
    </div>
  );
}
