import { useMemo, useState } from 'react';
import { buildWordOptions } from '../../domain/challenge';
import type { WordEntry, WordProgress } from '../../domain/models';
import { primarySense } from '../../domain/wordText';
import { ChoiceSenseDetail } from '../ChoiceSenseDetail';
import { resolveChoiceReviewState } from './ChoiceReviewMark';
import { ReviewableChoice, useReviewedChoiceInspection } from './ReviewableChoice';

interface ChoiceQuestionProps {
  word: WordEntry;
  entries: WordEntry[];
  extraOptionCount?: number;
  preferSimilarDistractors?: boolean;
  reviewed?: boolean;
  wordProgress?: WordProgress;
  onReviewInspectionChange?: (inspecting: boolean) => void;
  onSubmit: (correct: boolean, response: string, correctAnswer: string) => void;
}

export function ChoiceQuestion({
  word,
  entries,
  extraOptionCount = 0,
  preferSimilarDistractors = false,
  reviewed = false,
  wordProgress,
  onReviewInspectionChange,
  onSubmit,
}: ChoiceQuestionProps) {
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
      <div className="word-prompt-row">
        <div className="word-prompt">
          <strong>{word.word}</strong>
          <span>{word.phonetic} · {word.partOfSpeech}</span>
        </div>
        {wordProgress && (
          <dl className="answer-stats-inline" aria-label="本词学习进度">
            <div><dt>练习</dt><dd>{wordProgress.attempts}</dd></div>
            <div><dt>答对</dt><dd>{wordProgress.correct}</dd></div>
            <div><dt>正确率</dt><dd>{wordProgress.mastery}%</dd></div>
          </dl>
        )}
      </div>
      <p className="question-kicker">选择正确释义</p>
      <div
        className="choice-grid"
        role="group"
        aria-label="选择正确释义"
        data-option-count={options.length}
      >
        {options.map((option, index) => {
          const selected = selectedId === option.id;
          const reviewState = resolveChoiceReviewState(option.correct, selected, reviewed);
          return (
            <ReviewableChoice
              key={option.id}
              index={index}
              text={primarySense(option.word.definitionZh)}
              correct={option.correct}
              selected={selected}
              reviewState={reviewState}
              reviewed={reviewed}
              inspecting={inspectedId === option.id}
              onClick={() => handleChoiceClick(option.id, option.correct, () => {
                setSelectedId(option.id);
                onSubmit(
                  option.correct,
                  primarySense(option.word.definitionZh),
                  primarySense(word.definitionZh),
                );
              })}
              detail={<ChoiceSenseDetail word={option.word} senseIndex={0} />}
            />
          );
        })}
      </div>
    </div>
  );
}