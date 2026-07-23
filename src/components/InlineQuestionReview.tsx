import {
  lazy,
  Suspense,
  useState,
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
  Volume2,
} from '../icons';
import type {
  WordEntry,
  WordProgress,
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
  wordProgress?: Pick<WordProgress, 'attempts' | 'correct' | 'mastery'>;
  speechSupported: boolean;
  speechSpeaking: boolean;
  onSpeak: (text: string) => void;
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
  wordProgress,
  speechSupported,
  speechSpeaking,
  onSpeak,
}: InlineQuestionReviewProps) {
  const [coachOpen, setCoachOpen] = useState(false);
  const currentAi = aiInsight?.wordId === word.id ? aiInsight : null;
  const timerProgress = Math.min(100, Math.max(0, autoAdvancePercent));
  const autoAdvanceLabel = autoAdvancePaused ? '继续自动计时' : '暂停自动计时';

  function toggleCoach() {
    if (!aiConfigured) {
      onAskAi(word, true);
      return;
    }
    if (!coachOpen && !autoAdvancePaused) onToggleAutoAdvance();
    setCoachOpen((current) => !current);
  }

  return (
    <section className="inline-question-review" data-coach-open={coachOpen}>
      <div className="inline-review-toolbar">
        <button
          type="button"
          className={`secondary-button inline-ai-toggle ${coachOpen ? 'is-open' : ''}`}
          onClick={toggleCoach}
          aria-expanded={coachOpen}
          aria-label="AI 词汇教练"
          title="AI 词汇教练"
        >
          <Sparkles aria-hidden="true" />
          <span>AI 词汇教练</span>
        </button>
        <div className="inline-review-word-summary">
          <div className="inline-review-word-main">
            <button
              type="button"
              className="word-audio inline-review-audio"
              onClick={() => onSpeak(word.word)}
              disabled={!speechSupported || speechSpeaking}
              aria-label={speechSpeaking ? '正在播放发音' : '播放单词发音'}
              title={speechSupported ? '播放单词发音' : '当前浏览器不支持发音'}
            >
              <Volume2 aria-hidden="true" />
            </button>
            <div className="inline-review-lexeme">
              <strong>{word.word}</strong>
              <span>{word.phonetic}{word.partOfSpeech ? ` · ${word.partOfSpeech}` : ''}</span>
            </div>
          </div>
          <div className="inline-review-word-context">
            <span
              className={`inline-review-banks ${wordMastered ? 'is-mastered' : ''}`}
              title={relatedBankNames.join(' · ')}
            >
              <Layers3 aria-hidden="true" />
              <span>{relatedBankNames.length > 0 ? relatedBankNames.join(' · ') : '当前词库'}</span>
            </span>
            <dl className="answer-stats-inline inline-review-kpis" aria-label="本词学习进度">
              <div><dt>练习</dt><dd>{wordProgress?.attempts ?? 0}</dd></div>
              <div><dt>答对</dt><dd>{wordProgress?.correct ?? 0}</dd></div>
              <div><dt>正确率</dt><dd>{wordProgress?.mastery ?? 0}%</dd></div>
            </dl>
          </div>
        </div>
        <div className="inline-review-actions">
          <button
            type="button"
            className="inline-auto-toggle"
            onClick={onToggleAutoAdvance}
            aria-label={autoAdvanceLabel}
            aria-pressed={autoAdvancePaused}
            title={autoAdvanceLabel}
          >
            <svg className="inline-auto-progress" viewBox="0 0 44 44" aria-hidden="true">
              <circle className="inline-auto-track" cx="22" cy="22" r="19" pathLength="100" />
              <circle
                className="inline-auto-value"
                cx="22"
                cy="22"
                r="19"
                pathLength="100"
                style={{ strokeDashoffset: 100 - timerProgress }}
              />
            </svg>
            {autoAdvancePaused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="primary-button inline-review-next"
            onClick={onNext}
          >
            {isLastQuestion ? '查看结果' : '下一题'}
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
      </div>

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