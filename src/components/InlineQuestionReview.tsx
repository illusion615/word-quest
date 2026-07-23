import {
  lazy,
  Suspense,
  useState,
  type CSSProperties,
} from 'react';
import {
  ArrowRight,
  BookOpenCheck,
  Layers3,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
} from '../icons';
import type {
  WordEntry,
  WordSenseExample,
} from '../domain/models';
import { parseDefinitionSenses } from '../domain/wordText';
import { SenseList } from './WordDefinitions';

const MarkdownContent = lazy(() => import('./MarkdownContent'));

interface AiInsight {
  wordId: string;
  status: 'loading' | 'success' | 'error';
  text: string;
  senseExamples: WordSenseExample[];
}

interface InlineQuestionReviewProps {
  word: WordEntry;
  isLastQuestion: boolean;
  autoAdvancePercent: number;
  autoAdvancePaused: boolean;
  onToggleAutoAdvance: () => void;
  onNext: () => void;
  aiConfigured: boolean;
  aiInsight: AiInsight | null;
  onAskAi: (word: WordEntry, pauseReview?: boolean) => void;
  relatedBankNames: string[];
  wordMastered: boolean;
}

interface AiCoachSenseExamplesProps {
  word: WordEntry;
  examples: WordSenseExample[];
}

export function AiCoachSenseExamples({ word, examples }: AiCoachSenseExamplesProps) {
  const senses = parseDefinitionSenses(word.definitionZh);
  if (senses.length === 0 || examples.length === 0) return null;

  return (
    <section className="inline-ai-sense-examples" aria-labelledby="inline-ai-examples-heading">
      <div className="inline-ai-examples-heading">
        <h4 id="inline-ai-examples-heading">
          <BookOpenCheck aria-hidden="true" /> 逐义例句
        </h4>
        <span>{senses.length} 个义项</span>
      </div>
      <SenseList senses={senses} language="zh" examples={examples} />
    </section>
  );
}

export function InlineQuestionReview({
  word,
  isLastQuestion,
  autoAdvancePercent,
  autoAdvancePaused,
  onToggleAutoAdvance,
  onNext,
  aiConfigured,
  aiInsight,
  onAskAi,
  relatedBankNames,
  wordMastered,
}: InlineQuestionReviewProps) {
  const [coachOpen, setCoachOpen] = useState(false);
  const currentAi = aiInsight?.wordId === word.id ? aiInsight : null;

  function toggleCoach() {
    if (!aiConfigured) {
      onAskAi(word, true);
      return;
    }
    if (!coachOpen && !autoAdvancePaused) onToggleAutoAdvance();
    setCoachOpen((current) => !current);
  }

  return (
    <section className="inline-question-review">
      <div className="inline-review-controls">
        <button
          type="button"
          className="secondary-button"
          onClick={onToggleAutoAdvance}
          aria-pressed={autoAdvancePaused}
        >
          {autoAdvancePaused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
          {autoAdvancePaused ? '继续自动计时' : '暂停自动计时'}
        </button>
        <button
          type="button"
          className="primary-button answer-advance-next"
          onClick={onNext}
          style={{ ['--advance']: autoAdvancePercent } as CSSProperties}
        >
          {isLastQuestion ? '查看结果' : '下一题'}
          <ArrowRight aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`secondary-button inline-ai-toggle ${coachOpen ? 'is-open' : ''}`}
          onClick={toggleCoach}
          aria-expanded={coachOpen}
        >
          <Sparkles aria-hidden="true" />
          AI 词汇教练
        </button>
        <span className="inline-review-timer" aria-live="polite">
          {autoAdvancePaused ? '自动前进已暂停' : '自动前进中'}
        </span>
      </div>

      {relatedBankNames.length > 0 && (
        <p className={`answer-bank-note ${wordMastered ? 'is-mastered' : ''}`}>
          <Layers3 aria-hidden="true" />
          <span>
            {wordMastered ? '已进入稳定掌握' : '本次作答已更新复习计划'}
            <em>收录于 {relatedBankNames.join(' · ')}</em>
          </span>
        </p>
      )}

      {coachOpen && aiConfigured && (
        <section className="inline-ai-coach" aria-labelledby="inline-ai-heading">
          <div className="answer-ai-head">
            <h3 id="inline-ai-heading"><Sparkles aria-hidden="true" /> AI 词汇教练</h3>
            <button
              type="button"
              className="answer-ai-regen"
              onClick={() => onAskAi(word, true)}
              disabled={currentAi?.status === 'loading'}
              aria-label="重新生成讲解"
              title="重新生成讲解"
            >
              <RefreshCw
                aria-hidden="true"
                className={currentAi?.status === 'loading' ? 'spin-icon' : ''}
              />
            </button>
          </div>
          <div className="answer-ai-body">
            {currentAi?.status === 'success' && (
              <>
                <Suspense fallback={<p className="markdown-loading">正在排版讲解…</p>}>
                  <MarkdownContent content={currentAi.text} />
                </Suspense>
                <AiCoachSenseExamples word={word} examples={currentAi.senseExamples} />
              </>
            )}
            {currentAi?.status === 'error' && (
              <p className="answer-ai-hint is-error" aria-live="polite">{currentAi.text}</p>
            )}
            {(currentAi?.status === 'loading' || !currentAi) && (
              <p className="answer-ai-hint" aria-live="polite">
                <LoaderCircle aria-hidden="true" className="spin-icon" /> 正在生成讲解…
              </p>
            )}
          </div>
        </section>
      )}
    </section>
  );
}