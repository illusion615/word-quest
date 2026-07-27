import { useEffect, useMemo, useState } from 'react';
import { Volume2 } from '../../icons';
import type { SessionAnswer, WordEntry, WordProgress } from '../../domain/models';
import type { MeaningOption } from '../../domain/challenge';
import {
  buildMeaningOptions,
  buildMeaningSelectionFeedback,
  buildMeaningSenseResults,
  correctMeaningIds,
  gradeMeaningSelection,
} from '../../domain/challenge';
import { parseWordSenses } from '../../domain/wordText';
import { ChoiceSenseDetail } from '../ChoiceSenseDetail';
import { resolveChoiceReviewState } from './ChoiceReviewMark';
import { ReviewableChoice, useReviewedChoiceInspection } from './ReviewableChoice';

interface MatchMeaningQuestionProps {
  word: WordEntry;
  entries: WordEntry[];
  isSpeechSupported: boolean;
  isSpeaking: boolean;
  onSpeak: (text: string) => void;
  onOpenSettings?: () => void;
  onSubmit: (
    correct: boolean,
    response: string,
    correctAnswer: string,
    choiceFeedback?: SessionAnswer['choiceFeedback'],
    senseResults?: SessionAnswer['senseResults'],
  ) => void;
  onDraftChange?: (draft: SessionAnswer | null) => void;
  hideAnswerCount?: boolean;
  extraOptionCount?: number;
  preferSimilarDistractors?: boolean;
  reviewed?: boolean;
  wordProgress?: WordProgress;
  targetSenseIds?: readonly string[];
  onReviewInspectionChange?: (inspecting: boolean) => void;
  audioOnly?: boolean;
  speechError?: string;
  voiceName?: string;
}

/**
 * Show the word (and read it aloud); the learner selects every correct meaning
 * in this planned semantic batch. Later reviews rotate through later senses.
 */
export function MatchMeaningQuestion({
  word,
  entries,
  isSpeechSupported,
  isSpeaking,
  onSpeak,
  onOpenSettings,
  onSubmit,
  onDraftChange,
  hideAnswerCount = false,
  extraOptionCount = 0,
  preferSimilarDistractors = false,
  reviewed = false,
  wordProgress,
  targetSenseIds,
  onReviewInspectionChange,
  audioOnly = false,
  speechError = '',
  voiceName = '自动选择',
}: MatchMeaningQuestionProps) {
  const options = useMemo(() => buildMeaningOptions(word, entries, {
    extraOptionCount,
    preferSimilarDistractors,
    targetSenseIds,
  }), [entries, extraOptionCount, preferSimilarDistractors, targetSenseIds, word]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const { inspectedId, handleChoiceClick } = useReviewedChoiceInspection({
    reviewed,
    onInspectionChange: onReviewInspectionChange,
  });

  useEffect(() => {
    const emptySelection = new Set<string>();
    setSelected(emptySelection);
    onDraftChange?.(submissionFor(emptySelection));
    if (isSpeechSupported) onSpeak(word.word);
  }, [isSpeechSupported, onDraftChange, onSpeak, options, word.word]);

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
      senseResults: buildMeaningSenseResults(options, selection),
    };
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    onDraftChange?.(submissionFor(next));
  }

  function handleSubmit() {
    const submission = submissionFor(selected);
    onSubmit(
      submission.correct,
      submission.response,
      submission.correctAnswer,
      submission.choiceFeedback,
      submission.senseResults,
    );
  }

  const correctCount = correctMeaningIds(options).length;
  const totalSenseCount = parseWordSenses(word).length;
  const meaningPrompt = hideAnswerCount
    ? '选出本轮全部正确释义'
    : totalSenseCount > correctCount
      ? `本轮考查 ${correctCount} / ${totalSenseCount} 个义项，选出全部正确项`
      : `选出全部正确释义（共 ${correctCount} 项）`;

  return (
    <div className="question-layout">
      {audioOnly ? (
        <>
          <div className="audio-prompt-row">
            <button
              type="button"
              className="sound-button"
              onClick={() => onSpeak(word.word)}
              disabled={!isSpeechSupported || isSpeaking}
              aria-label={isSpeaking ? '正在播放发音' : '播放单词发音'}
            >
              <Volume2 aria-hidden="true" />
            </button>
            <p className="question-kicker">听发音，{meaningPrompt}</p>
          </div>
          {onOpenSettings && (
            <button type="button" className="voice-settings-button" onClick={onOpenSettings}>
              音色 · {voiceName}
            </button>
          )}
          {speechError && <p className="speech-error" role="alert">{speechError}</p>}
          {reviewed && (
            <div className="word-prompt">
              <strong>{word.word}</strong>
              <span>{word.phonetic}{word.partOfSpeech ? ` · ${word.partOfSpeech}` : ''}</span>
            </div>
          )}
        </>
      ) : (
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
      )}
      {!audioOnly && <p className="question-kicker">{meaningPrompt}</p>}
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
            <ReviewableChoice
              key={option.id}
              index={index}
              text={option.text}
              correct={option.correct}
              selected={selectedOption}
              reviewState={reviewState}
              reviewed={reviewed}
              inspecting={inspectedId === option.id}
              onClick={() => handleChoiceClick(option.id, option.correct, () => toggle(option.id))}
              detail={<ChoiceSenseDetail word={option.word} senseIndex={option.senseIndex} />}
            />
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
