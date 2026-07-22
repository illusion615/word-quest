import { useState } from 'react';
import type { SessionAnswer, WordEntry } from '../../domain/models';
import { primarySense } from '../../domain/wordText';

interface SentenceQuestionProps {
  word: WordEntry;
  onSubmit: (correct: boolean, response: string, correctAnswer: string) => void;
  onDraftChange?: (draft: SessionAnswer | null) => void;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function SentenceQuestion({ word, onSubmit, onDraftChange }: SentenceQuestionProps) {
  const [response, setResponse] = useState('');
  const sentence = word.example
    ? word.example.replace(
        new RegExp(`\\b${escapeRegExp(word.word)}\\b`, 'i'),
        '________',
      )
    : `________: ${primarySense(word.definition, primarySense(word.definitionZh))}`;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const answer = response.trim();
    if (!answer) return;
    onSubmit(answer.toLowerCase() === word.word.toLowerCase(), answer, word.word);
  }

  return (
    <div className="question-layout">
      <blockquote className="sentence-prompt">{sentence}</blockquote>
      <p className="sentence-translation">
        {word.exampleZh || `中文释义：${primarySense(word.definitionZh)}`}
      </p>
      <form className="answer-form" onSubmit={handleSubmit}>
        <label htmlFor="sentence-answer">填入缺少的单词</label>
        <input
          id="sentence-answer"
          value={response}
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
          autoFocus
        />
        <button className="primary-button" type="submit" disabled={!response.trim()}>
          检查句子
        </button>
      </form>
    </div>
  );
}