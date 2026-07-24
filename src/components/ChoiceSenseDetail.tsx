import { useEffect, useState } from 'react';
import { BookOpenCheck, LoaderCircle } from '../icons';
import { loadStaticWordExplanation } from '../data/wordCoachRepository';
import type { WordEntry, WordExplanation } from '../domain/models';
import { parseWordCoachSections } from '../domain/wordCoach';
import { parseDefinitionSenses } from '../domain/wordText';

interface ChoiceSenseDetailProps {
  word: WordEntry;
  senseIndex: number;
}

interface DetailState {
  status: 'loading' | 'success' | 'unavailable' | 'error';
  explanation: WordExplanation | null;
}

export function ChoiceSenseDetail({
  word,
  senseIndex,
}: ChoiceSenseDetailProps) {
  const [state, setState] = useState<DetailState>({ status: 'loading', explanation: null });
  const senses = parseDefinitionSenses(word.definitionZh);
  const sense = senses[senseIndex] ?? senses[0];

  useEffect(() => {
    let active = true;
    setState({ status: 'loading', explanation: null });
    void loadStaticWordExplanation(word)
      .then((explanation) => {
        if (!active) return;
        setState({
          status: explanation ? 'success' : 'unavailable',
          explanation,
        });
      })
      .catch(() => {
        if (active) setState({ status: 'error', explanation: null });
      });
    return () => {
      active = false;
    };
  }, [word]);

  if (!sense) return null;

  const sections = state.explanation
    ? parseWordCoachSections(state.explanation.markdown, senses.length)
    : null;
  const coachSense = sections?.senses[senseIndex];
  const example = state.explanation?.senseExamples.find((candidate) => (
    candidate.language === 'zh' && candidate.senseIndex === senseIndex
  ));

  return (
    <section className="choice-sense-detail" aria-label={`${word.word} · ${sense.text} 释义详情`}>
      <div className="choice-sense-card-banner" aria-hidden="true">
        <span>词义卡</span>
      </div>
      <header>
        <span className="choice-sense-card-number" aria-hidden="true">
          {String(senseIndex + 1).padStart(2, '0')}
        </span>
        <div className="choice-sense-card-title">
          <div>
            <span>{sense.label || '释义'}</span>
            <small>{word.word}</small>
          </div>
          <strong>{sense.text}</strong>
        </div>
      </header>

      {coachSense ? (
        <div className="choice-sense-detail-content">
          <div className="choice-sense-detail-explanation">
            <span>辨析</span>
            <p>{coachSense.distinction}</p>
          </div>
          <div className="choice-sense-detail-pattern">
            <span>{coachSense.patternLabel}</span>
            <code>{coachSense.pattern}</code>
          </div>
          {example && (
            <blockquote>
              <p lang="en">{example.sentence}</p>
              <footer>{example.translation}</footer>
            </blockquote>
          )}
        </div>
      ) : state.status === 'loading' ? (
        <p className="choice-sense-detail-status"><LoaderCircle className="spin-icon" aria-hidden="true" /> 正在读取该释义讲解…</p>
      ) : (
        <div className="choice-sense-detail-fallback">
          <BookOpenCheck aria-hidden="true" />
          <p>{state.status === 'error'
            ? '专项讲解读取失败。收起卡片后再次打开即可重试。'
            : '该释义的专项讲解尚未收录，先结合题目语境记住这条词典释义。'}</p>
        </div>
      )}
    </section>
  );
}
