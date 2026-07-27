import { useEffect, useState } from 'react';
import { BookOpenCheck, LoaderCircle } from '../icons';
import { loadDictionarySenses } from '../data/senseDetailRepository';
import { loadStaticWordExplanation } from '../data/wordCoachRepository';
import type { DictionarySense, WordEntry, WordExplanation } from '../domain/models';
import { localizeUsageLabel } from '../domain/dictionaryLabels';
import { parseWordCoachSections } from '../domain/wordCoach';
import { parseWordSenses } from '../domain/wordText';

interface ChoiceSenseDetailProps {
  word: WordEntry;
  senseIndex: number;
}

interface DetailState {
  status: 'loading' | 'loaded' | 'error';
  explanation: WordExplanation | null;
  dictionarySense: DictionarySense | null;
}

const INITIAL_STATE: DetailState = {
  status: 'loading',
  explanation: null,
  dictionarySense: null,
};

export function ChoiceSenseDetail({
  word,
  senseIndex,
}: ChoiceSenseDetailProps) {
  const [state, setState] = useState<DetailState>(INITIAL_STATE);
  const senses = parseWordSenses(word);
  const sense = senses[senseIndex] ?? senses[0];
  const senseId = sense?.id;

  useEffect(() => {
    let active = true;
    setState(INITIAL_STATE);
    void Promise.allSettled([
      loadDictionarySenses(word.id),
      loadStaticWordExplanation(word),
    ]).then(([dictionary, coach]) => {
      if (!active) return;
      if (dictionary.status === 'rejected' && coach.status === 'rejected') {
        setState({ status: 'error', explanation: null, dictionarySense: null });
        return;
      }
      const senseList = dictionary.status === 'fulfilled' ? dictionary.value?.senses ?? [] : [];
      setState({
        status: 'loaded',
        explanation: coach.status === 'fulfilled' ? coach.value : null,
        dictionarySense: senseList.find((candidate) => candidate.id === senseId)
          ?? senseList[senseIndex]
          ?? null,
      });
    });
    return () => {
      active = false;
    };
  }, [senseId, senseIndex, word]);

  if (!sense) return null;

  const sections = state.explanation
    ? parseWordCoachSections(state.explanation.markdown, senses.length)
    : null;
  const coachSense = sections?.senses[senseIndex];
  const stableContent = state.explanation?.senseContent?.[sense.id];
  const coachExample = state.explanation?.senseExamples.find((candidate) => (
    candidate.language === 'zh' && candidate.senseIndex === senseIndex
  ));
  const dictionary = state.dictionarySense;
  const displayLabel = dictionary?.label || sense.label;
  const displayDefinition = dictionary?.definitionZh || sense.text;
  const usageLabels = [
    ...(dictionary?.registers ?? []).map(localizeUsageLabel),
    ...(dictionary?.domains ?? []),
  ];
  const hasDictionaryDetail = Boolean(
    dictionary && (
      dictionary.glossesEn?.length
      || usageLabels.length
      || dictionary.contexts?.length
      || dictionary.patterns?.length
      || dictionary.examples?.length
    ),
  );

  return (
    <section className="choice-sense-detail" aria-label={`${word.word} · ${displayDefinition} 释义详情`}>
      <div className="choice-sense-card-banner" aria-hidden="true">
        <span>词义卡</span>
      </div>
      <header>
        <span className="choice-sense-card-number" aria-hidden="true">
          {String(senseIndex + 1).padStart(2, '0')}
        </span>
        <div className="choice-sense-card-title">
          <div>
            <span>{displayLabel || '释义'}</span>
            <small>{word.word}</small>
          </div>
          <strong>{displayDefinition}</strong>
        </div>
      </header>

      {hasDictionaryDetail || stableContent || coachSense ? (
        <div className="choice-sense-detail-content">
          {dictionary?.glossesEn?.length ? (
            <div className="choice-sense-detail-explanation">
              <span>英文辨析</span>
              <p lang="en">{dictionary.glossesEn.join('; ')}</p>
            </div>
          ) : null}

          {stableContent ? (
            <div className="choice-sense-detail-explanation">
              <span>助记</span>
              <p>{stableContent.mnemonic}</p>
            </div>
          ) : coachSense ? (
            <div className="choice-sense-detail-explanation">
              <span>辨析</span>
              <p>{coachSense.distinction}</p>
            </div>
          ) : null}

          {usageLabels.length > 0 && (
            <div className="choice-sense-detail-pattern">
              <span>用法</span>
              <code>{usageLabels.join('、')}</code>
            </div>
          )}

          {dictionary?.contexts?.length ? (
            <div className="choice-sense-detail-pattern">
              <span>搭配</span>
              <code lang="en">{dictionary.contexts.join('、')}</code>
            </div>
          ) : null}

          {dictionary?.patterns?.length ? (
            <div className="choice-sense-detail-pattern">
              <span>句型</span>
              <code lang="en">{dictionary.patterns.join('；')}</code>
            </div>
          ) : null}

          {stableContent ? (
            <div className="choice-sense-detail-pattern">
              <span>使用技巧</span>
              <p>{stableContent.usageTip}</p>
            </div>
          ) : coachSense ? (
            <div className="choice-sense-detail-pattern">
              <span>{coachSense.patternLabel}</span>
              <code>{coachSense.pattern}</code>
            </div>
          ) : null}

          {dictionary?.examples?.length ? (
            dictionary.examples.map((example) => (
              <blockquote key={example.english}>
                <p lang="en">{example.english}</p>
                <footer>{example.chinese}</footer>
              </blockquote>
            ))
          ) : stableContent ? (
            <blockquote>
              <p lang="en">{stableContent.example}</p>
              <footer>{stableContent.translation}</footer>
            </blockquote>
          ) : coachExample ? (
            <blockquote>
              <p lang="en">{coachExample.sentence}</p>
              <footer>{coachExample.translation}</footer>
            </blockquote>
          ) : null}
        </div>
      ) : state.status === 'loading' ? (
        <p className="choice-sense-detail-status">
          <LoaderCircle className="spin-icon" aria-hidden="true" /> 正在读取该释义详情…
        </p>
      ) : (
        <div className="choice-sense-detail-fallback">
          <BookOpenCheck aria-hidden="true" />
          <p>{state.status === 'error'
            ? '释义详情读取失败。收起卡片后再次打开即可重试。'
            : '这条释义暂无更多词典信息，先结合题目语境记住它。'}</p>
        </div>
      )}
    </section>
  );
}
