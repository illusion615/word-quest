import { useState } from 'react';
import { Swords } from '../../icons';
import type { SessionAnswer, WordEntry } from '../../domain/models';
import { primarySense } from '../../domain/wordText';

interface BossQuestionProps {
  word: WordEntry;
  onSubmit: (correct: boolean, response: string, correctAnswer: string) => void;
  onDraftChange?: (draft: SessionAnswer | null) => void;
  reviewAnswer?: SessionAnswer | null;
}

export function BossQuestion({
  word,
  onSubmit,
  onDraftChange,
  reviewAnswer = null,
}: BossQuestionProps) {
  const [response, setResponse] = useState('');

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reviewAnswer) return;
    const answer = response.trim();
    if (!answer) return;
    onSubmit(answer.toLowerCase() === word.word.toLowerCase(), answer, word.word);
  }

  return (
    <div className="question-layout boss-question">
      <Swords className="boss-icon" aria-hidden="true" />
      <p className="question-kicker">根据释义反拼单词</p>
      <strong className="boss-definition">{primarySense(word.definitionZh)}</strong>
      <span className="part-of-speech">{word.partOfSpeech}</span>
      <form className="answer-form" onSubmit={handleSubmit}>
        <label htmlFor="boss-answer">目标单词</label>
        <input
          id="boss-answer"
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
            发起攻击
          </button>
        )}
      </form>
    </div>
  );
}