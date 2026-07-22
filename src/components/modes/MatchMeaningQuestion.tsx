import { useEffect, useMemo, useState } from 'react';
import { Volume2 } from '../../icons';
import type { SessionAnswer, WordEntry, WordProgress } from '../../domain/models';
import type { MeaningOption } from '../../domain/challenge';
import {
  buildMeaningOptions,
  buildMeaningSelectionFeedback,
  correctMeaningIds,
  gradeMeaningSelection,
} from '../../domain/challenge';
import { ChoiceReviewMark, resolveChoiceReviewState } from './ChoiceReviewMark';

interface MatchMeaningQuestionProps {
  word: WordEntry;
  entries: WordEntry[];
  isSpeechSupported: boolean;
  isSpeaking: boolean;
  onSpeak: (text: string) => void;
  onSubmit: (
    correct: boolean,
    response: string,
    correctAnswer: string,
    choiceFeedback?: SessionAnswer['choiceFeedback'],
  ) => void;
  onDraftChange?: (draft: SessionAnswer | null) => void;
  hideAnswerCount?: boolean;
  extraOptionCount?: number;
  preferSimilarDistractors?: boolean;
  reviewed?: boolean;
  wordProgress?: WordProgress;
}

/**
 * Show the word (and read it aloud); the learner selects ALL of its meanings.
 * Single-sense words become a one-answer question via the option builder.
 */
export function MatchMeaningQuestion({
  word,
  entries,
  isSpeechSupported,
  isSpeaking,
  onSpeak,
  onSubmit,
  onDraftChange,
  hideAnswerCount = false,
  extraOptionCount = 0,
  preferSimilarDistractors = false,
  reviewed = false,
  wordProgress,
}: MatchMeaningQuestionProps) {
  const options = useMemo(() => buildMeaningOptions(word, entries, {
    extraOptionCount,
    preferSimilarDistractors,
  }), [entries, extraOptionCount, preferSimilarDistractors, word]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setSelected(new Set());
    onDraftChange?.(null);
    if (isSpeechSupported) onSpeak(word.word);
  }, [isSpeechSupported, onDraftChange, onSpeak, word.word]);

  function submissionFor(selection: Set<string>): SessionAnswer {
    const correct = gradeMeaningSelection(options, selection);
    const chosen = options
      .filter((option: MeaningOption) => selection.has(option.id))
      .map((option: MeaningOption) => option.text)
      .join('、') || '未选择';
    const answer = options
      .filter((option: MeaningOption) => option.correct)
      .map((option: MeaningOption) => option.text)
      .join('、');
    return {
      correct,
      response: chosen,
      correctAnswer: answer,
      choiceFeedback: buildMeaningSelectionFeedback(options, selection),
    };
  }

  function toggle(id: string) {
    if (reviewed) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    onDraftChange?.(next.size > 0 ? submissionFor(next) : null);
  }

  function handleSubmit() {
    const submission = submissionFor(selected);
    onSubmit(
      submission.correct,
      submission.response,
      submission.correctAnswer,
      submission.choiceFeedback,
    );
  }

  const correctCount = correctMeaningIds(options).length;

  return (
    <div className="question-layout">
      <div className="word-prompt-row">
        <div className="word-prompt">
          <strong>{word.word}</strong>
          <span className="word-phonetic">
            <button
              type="button"
              className="word-audio"
              onClick={() => onSpeak(word.word)}
              disabled={!isSpeechSupported || isSpeaking}
              aria-label="播放单词发音"
            >
              <Volume2 aria-hidden="true" />
            </button>
            {word.phonetic}{word.partOfSpeech ? ` · ${word.partOfSpeech}` : ''}
          </span>
        </div>
        {wordProgress && (
          <dl className="answer-stats-inline" aria-label="本词学习进度">
            <div><dt>练习</dt><dd>{wordProgress.attempts}</dd></div>
            <div><dt>答对</dt><dd>{wordProgress.correct}</dd></div>
            <div><dt>正确率</dt><dd>{wordProgress.mastery}%</dd></div>
          </dl>
        )}
      </div>
      <p className="question-kicker">
        {hideAnswerCount ? '选出全部正确释义' : `选出全部正确释义（共 ${correctCount} 项）`}
      </p>
      <div
        className="choice-grid"
        role="group"
        aria-label="选择正确释义"
        data-option-count={options.length}
      >
        {options.map((option, index) => {
          const selectedOption = selected.has(option.id);
          const reviewState = resolveChoiceReviewState(option.correct, selectedOption, reviewed);
          return (
            <button
              key={option.id}
              type="button"
              className={[
                'choice-button',
                selectedOption ? 'is-selected' : '',
                reviewState ? `is-${reviewState}` : '',
              ].filter(Boolean).join(' ')}
              aria-pressed={selectedOption}
              data-review-state={reviewState ?? undefined}
              onClick={() => toggle(option.id)}
              disabled={reviewed}
            >
              <span className="choice-letter">{String.fromCharCode(65 + index)}</span>
              <span className="choice-text">{option.text}</span>
              <ChoiceReviewMark state={reviewState} />
            </button>
          );
        })}
      </div>
      {!reviewed && (
        <button
          className="primary-button"
          type="button"
          onClick={handleSubmit}
          disabled={selected.size === 0}
        >
          提交答案
        </button>
      )}
    </div>
  );
}
