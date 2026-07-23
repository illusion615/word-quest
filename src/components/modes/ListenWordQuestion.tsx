import { useEffect, useMemo, useState } from 'react';
import { Volume2 } from '../../icons';
import type { WordEntry } from '../../domain/models';
import { buildWordOptions } from '../../domain/challenge';
import { ChoiceReviewMark, resolveChoiceReviewState } from './ChoiceReviewMark';

interface ListenWordQuestionProps {
  word: WordEntry;
  entries: WordEntry[];
  isSpeechSupported: boolean;
  isSpeaking: boolean;
  speechError: string;
  voiceName: string;
  extraOptionCount?: number;
  preferSimilarDistractors?: boolean;
  reviewed?: boolean;
  onSpeak: (text: string) => void;
  onOpenSettings: () => void;
  onSubmit: (correct: boolean, response: string, correctAnswer: string) => void;
}

/** Play the word (never shown); the learner picks it from spoken recall. */
export function ListenWordQuestion({
  word,
  entries,
  isSpeechSupported,
  isSpeaking,
  speechError,
  voiceName,
  extraOptionCount = 0,
  preferSimilarDistractors = false,
  reviewed = false,
  onSpeak,
  onOpenSettings,
  onSubmit,
}: ListenWordQuestionProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const options = useMemo(() => buildWordOptions(word, entries, {
    extraOptionCount,
    preferSimilarPronunciations: preferSimilarDistractors,
  }), [entries, extraOptionCount, preferSimilarDistractors, word]);

  useEffect(() => {
    if (isSpeechSupported) onSpeak(word.word);
  }, [isSpeechSupported, onSpeak, word.word]);

  return (
    <div className="question-layout">
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
        <p className="question-kicker">听发音，选出正确单词</p>
      </div>
      <button type="button" className="voice-settings-button" onClick={onOpenSettings}>
        音色 · {voiceName}
      </button>
      {speechError && <p className="speech-error" role="alert">{speechError}</p>}
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
