import { useEffect, useState } from 'react';
import { Volume2 } from '../../icons';
import type { WordEntry } from '../../domain/models';

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
}: ListeningQuestionProps) {
  const [response, setResponse] = useState('');

  useEffect(() => {
    if (autoPlay && isSpeechSupported) onSpeak(word.word);
  }, [autoPlay, isSpeechSupported, onSpeak, word.word]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const answer = response.trim();
    if (!answer) return;
    onSubmit(answer.toLowerCase() === word.word.toLowerCase(), answer, word.word);
  }

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
      <p className="question-kicker">听到什么，就写下什么</p>
      <button type="button" className="voice-settings-button" onClick={onOpenSettings}>
        音色 · {voiceName}
      </button>
      {speechError && <p className="speech-error" role="alert">{speechError}</p>}
      <form className="answer-form" onSubmit={handleSubmit}>
        <label htmlFor="listening-answer">单词拼写</label>
        <input
          id="listening-answer"
          value={response}
          onChange={(event) => setResponse(event.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
        />
        <button className="primary-button" type="submit" disabled={!response.trim()}>
          提交答案
        </button>
      </form>
    </div>
  );
}