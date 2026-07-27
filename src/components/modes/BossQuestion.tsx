import { useState } from 'react';
import { Swords } from '../../icons';
import type { SessionAnswer, WordEntry } from '../../domain/models';
import { parseWordSenses, primarySense } from '../../domain/wordText';

interface BossQuestionProps {
  word: WordEntry;
  onSubmit: (
    correct: boolean,
    response: string,
    correctAnswer: string,
    choiceFeedback?: SessionAnswer['choiceFeedback'],
    senseResults?: SessionAnswer['senseResults'],
  ) => void;
  onDraftChange?: (draft: SessionAnswer | null) => void;
  reviewAnswer?: SessionAnswer | null;
  targetSenseId?: string;
}

export function BossQuestion({
  word,
  onSubmit,
  onDraftChange,
  reviewAnswer = null,
  targetSenseId,
}: BossQuestionProps) {
  const [response, setResponse] = useState('');
  const senses = parseWordSenses(word);
  const targetSense = senses.find((sense) => sense.id === targetSenseId);
  const resolvedSenseId = targetSense?.id;
  const targetDefinition = targetSense
    ? `${targetSense.label}${targetSense.label ? ' ' : ''}${targetSense.text}`
    : primarySense(word.definitionZh);
  const senseResults = (correct: boolean) => (
    resolvedSenseId ? [{ senseId: resolvedSenseId, correct }] : undefined
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reviewAnswer) return;
    const answer = response.trim();
    if (!answer) return;
    const correct = answer.toLowerCase() === word.word.toLowerCase();
    onSubmit(correct, answer, word.word, undefined, senseResults(correct));
  }

  return (
    <div className="question-layout boss-question">
      <Swords className="boss-icon" aria-hidden="true" />
      <p className="question-kicker">根据释义反拼单词</p>
      <strong className="boss-definition">{targetDefinition}</strong>
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
              senseResults: senseResults(answer.toLowerCase() === word.word.toLowerCase()),
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