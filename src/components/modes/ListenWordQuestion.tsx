import { useEffect, useMemo } from 'react';
import { Volume2 } from '../../icons';
import type { WordEntry } from '../../domain/models';
import { buildWordOptions } from '../../domain/challenge';

interface ListenWordQuestionProps {
  word: WordEntry;
  entries: WordEntry[];
  isSpeechSupported: boolean;
  isSpeaking: boolean;
  speechError: string;
  voiceName: string;
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
  onSpeak,
  onOpenSettings,
  onSubmit,
}: ListenWordQuestionProps) {
  const options = useMemo(() => buildWordOptions(word, entries), [word, entries]);

  useEffect(() => {
    if (isSpeechSupported) onSpeak(word.word);
  }, [isSpeechSupported, onSpeak, word.word]);

  return (
    <div className="question-layout">
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
      <button type="button" className="voice-settings-button" onClick={onOpenSettings}>
        音色 · {voiceName}
      </button>
      {speechError && <p className="speech-error" role="alert">{speechError}</p>}
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
