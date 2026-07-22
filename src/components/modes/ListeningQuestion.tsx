import { useEffect, useState } from 'react';
import { Volume2 } from '../../icons';
import type { SessionAnswer, WordEntry } from '../../domain/models';

interface ListeningQuestionProps {
  word: WordEntry;
  autoPlay: boolean;
  isSpeechSupported: boolean;
  isSpeaking: boolean;
  speechError: string;
  voiceName: string;
  onSpeak: (text: string) => void;
  onOpenSettings: () => void;
  onSubmit: (correct: boolean, response: string, correctAnswer: string) => void;
  onDraftChange?: (draft: SessionAnswer | null) => void;
  reviewAnswer?: SessionAnswer | null;
}

export function ListeningQuestion({
  word,
  autoPlay,
  isSpeechSupported,
  isSpeaking,
  speechError,
  voiceName,
  onSpeak,
  onOpenSettings,
  onSubmit,
  onDraftChange,
  reviewAnswer = null,
}: ListeningQuestionProps) {
  const [response, setResponse] = useState('');

  useEffect(() => {
    if (!reviewAnswer && autoPlay && isSpeechSupported) onSpeak(word.word);
  }, [autoPlay, isSpeechSupported, onSpeak, reviewAnswer, word.word]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reviewAnswer) return;
    const answer = response.trim();
    if (!answer) return;
    onSubmit(answer.toLowerCase() === word.word.toLowerCase(), answer, word.word);
  }

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
        <p className="question-kicker">听到什么，就写下什么</p>
      </div>
      <button type="button" className="voice-settings-button" onClick={onOpenSettings}>
        音色 · {voiceName}
      </button>
      {speechError && <p className="speech-error" role="alert">{speechError}</p>}
      <form className="answer-form" onSubmit={handleSubmit}>
        <label htmlFor="listening-answer">单词拼写</label>
        <input
          id="listening-answer"
          value={response}
          className={reviewAnswer ? (reviewAnswer.correct ? 'is-reviewed-correct' : 'is-reviewed-wrong') : ''}
          disabled={Boolean(reviewAnswer)}
          onChange={(event) => {
            const next = event.target.value;
            const answer = next.trim();
            setResponse(next);
            onDraftChange?.(answer ? {
              correct: answer.toLowerCase() === word.word.toLowerCase(),
              response: answer,
              correctAnswer: word.word,
            } : null);
          }}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus={!reviewAnswer}
        />
        {reviewAnswer ? (
          <div className={`written-answer-review ${reviewAnswer.correct ? 'is-correct' : 'is-wrong'}`}>
            <span>你的答案：{reviewAnswer.response || '未作答'}</span>
            {!reviewAnswer.correct && <strong>正确答案：{reviewAnswer.correctAnswer}</strong>}
          </div>
        ) : (
          <button className="primary-button" type="submit" disabled={!response.trim()}>
            提交答案
          </button>
        )}
      </form>
    </div>
  );
}