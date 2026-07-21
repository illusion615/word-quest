import { useEffect, useMemo, useState } from 'react';
import { Volume2 } from '../../icons';
import type { WordEntry } from '../../domain/models';
import {
  buildMeaningOptions,
  correctMeaningIds,
  gradeMeaningSelection,
} from '../../domain/challenge';

interface MatchMeaningQuestionProps {
  word: WordEntry;
  entries: WordEntry[];
  isSpeechSupported: boolean;
  isSpeaking: boolean;
  onSpeak: (text: string) => void;
  onSubmit: (correct: boolean, response: string, correctAnswer: string) => void;
  hideAnswerCount?: boolean;
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
  hideAnswerCount = false,
}: MatchMeaningQuestionProps) {
  const options = useMemo(() => buildMeaningOptions(word, entries), [word, entries]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setSelected(new Set());
    if (isSpeechSupported) onSpeak(word.word);
  }, [isSpeechSupported, onSpeak, word.word]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit() {
    const correct = gradeMeaningSelection(options, selected);
    const chosen = options
      .filter((option) => selected.has(option.id))
      .map((option) => option.text)
      .join('、') || '未选择';
    const answer = options.filter((option) => option.correct).map((option) => option.text).join('、');
    onSubmit(correct, chosen, answer);
  }

  const correctCount = correctMeaningIds(options).length;

  return (
    <div className="question-layout">
      <button
        type="button"
        className="sound-button"
        onClick={() => onSpeak(word.word)}
        disabled={!isSpeechSupported || isSpeaking}
        aria-label="播放单词发音"
      >
        <Volume2 aria-hidden="true" />
      </button>
      <div className="word-prompt">
        <strong>{word.word}</strong>
        <span>{word.phonetic} · {word.partOfSpeech}</span>
      </div>
      <p className="question-kicker">
        {hideAnswerCount ? '选出全部正确释义' : `选出全部正确释义（共 ${correctCount} 项）`}
      </p>
      <div className="choice-grid" role="group" aria-label="选择正确释义">
        {options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            className={`choice-button ${selected.has(option.id) ? 'is-selected' : ''}`}
            aria-pressed={selected.has(option.id)}
            onClick={() => toggle(option.id)}
          >
            <span>{String.fromCharCode(65 + index)}</span>
            {option.text}
          </button>
        ))}
      </div>
      <button
        className="primary-button"
        type="button"
        onClick={handleSubmit}
        disabled={selected.size === 0}
      >
        提交答案
      </button>
    </div>
  );
}
