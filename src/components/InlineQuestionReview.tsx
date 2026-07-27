import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  BookOpenCheck,
  Info,
  Layers3,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Volume2,
  X,
} from '../icons';
import type {
  WordCoachInsight,
  WordEntry,
  WordProgress,
  WordSenseExample,
  WordSenseLearningContent,
} from '../domain/models';
import { parseWordCoachSections } from '../domain/wordCoach';
import { parseDefinitionSenses, parseWordSenses } from '../domain/wordText';
import { SenseList } from './WordDefinitions';

const MarkdownContent = lazy(() => import('./MarkdownContent'));

interface InlineQuestionReviewProps {
  word: WordEntry;
  isLastQuestion: boolean;
  autoAdvancePercent: number;
  autoAdvanceEnabled: boolean;
  onCoachOpenChange: (open: boolean) => void;
  onNext: () => void;
  aiConfigured: boolean;
  coachInsight: WordCoachInsight | null;
  onOpenCoach: (word: WordEntry) => void;
  onRegenerateCoach: (word: WordEntry) => void;
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

interface GroupedCoachContentProps {
  word: WordEntry;
  markdown: string;
  examples: WordSenseExample[];
  senseContent?: Record<string, WordSenseLearningContent>;
}

export function GroupedCoachContent({ word, markdown, examples, senseContent }: GroupedCoachContentProps) {
  const identifiedSenses = parseWordSenses(word);
  if (senseContent && identifiedSenses.every((sense) => senseContent[sense.id])) {
    return (
      <div className="word-coach-content">
        <section className="word-coach-sense-stack" aria-labelledby={`word-coach-content-${word.id}-senses`}>
          <div className="word-coach-section-heading">
            <h4 id={`word-coach-content-${word.id}-senses`}><BookOpenCheck aria-hidden="true" /> 逐义学习</h4>
            <span>{identifiedSenses.length} 个义项</span>
          </div>
          <ol>
            {identifiedSenses.map((sense, senseIndex) => {
              const content = senseContent[sense.id];
              return (
                <li key={sense.id}>
                  <div className="word-coach-sense-title">
                    <span>{String(senseIndex + 1).padStart(2, '0')}</span>
                    <div>
                      {sense.label && <b>{sense.label}</b>}
                      <strong>{sense.text}</strong>
                    </div>
                  </div>
                  <p className="word-coach-distinction"><b>助记：</b>{content.mnemonic}</p>
                  <div className="word-coach-pattern">
                    <span>使用技巧</span>
                    <p>{content.usageTip}</p>
                  </div>
                  <blockquote className="word-coach-example">
                    <p lang="en">{content.example}</p>
                    <footer>{content.translation}</footer>
                  </blockquote>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    );
  }
  const senses = parseDefinitionSenses(word.definitionZh);
  const sections = parseWordCoachSections(markdown, senses.length);
  const sectionIdPrefix = `word-coach-content-${word.id}`;
  if (!sections) {
    return (
      <>
        <MarkdownContent content={markdown} />
        <AiCoachSenseExamples word={word} examples={examples} />
      </>
    );
  }

  return (
    <div className="word-coach-content">
      <section className="word-coach-guidance" aria-labelledby={`${sectionIdPrefix}-guidance`}>
        <h4 id={`${sectionIdPrefix}-guidance`}>
          <span>通用</span>
          {sections.guidanceHeading}
        </h4>
        <dl>
          {sections.generalGuidance.map((item, index) => (
            <div key={`${item.label}-${index}`}>
              <dt>{item.label}</dt>
              <dd>{item.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="word-coach-sense-stack" aria-labelledby={`${sectionIdPrefix}-senses`}>
        <div className="word-coach-section-heading">
          <h4 id={`${sectionIdPrefix}-senses`}><BookOpenCheck aria-hidden="true" /> {sections.senseHeading}</h4>
          <span>{senses.length} 个义项</span>
        </div>
        <ol>
          {senses.map((sense, senseIndex) => {
            const coachSense = sections.senses[senseIndex];
            const example = examples.find((candidate) => (
              candidate.language === 'zh' && candidate.senseIndex === senseIndex
            ));
            return (
              <li key={`${sense.label}-${sense.text}-${senseIndex}`}>
                <div className="word-coach-sense-title">
                  <span>{String(senseIndex + 1).padStart(2, '0')}</span>
                  <div>
                    {sense.label && <b>{sense.label}</b>}
                    <strong>{sense.text}</strong>
                  </div>
                </div>
                <p className="word-coach-distinction">{coachSense.distinction}</p>
                <div className="word-coach-pattern">
                  <span>{coachSense.patternLabel}</span>
                  <code>{coachSense.pattern}</code>
                </div>
                {example && (
                  <blockquote className="word-coach-example">
                    <p lang="en">{example.sentence}</p>
                    <footer>{example.translation}</footer>
                  </blockquote>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="word-coach-memory" aria-labelledby={`${sectionIdPrefix}-memory`}>
        <h4 id={`${sectionIdPrefix}-memory`}><Sparkles aria-hidden="true" /> {sections.memoryHeading}</h4>
        <p>{sections.memoryHook}</p>
      </section>
    </div>
  );
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
  autoAdvanceEnabled,
  onCoachOpenChange,
  onNext,
  aiConfigured,
  coachInsight,
  onOpenCoach,
  onRegenerateCoach,
  relatedBankNames,
  wordMastered,
  wordProgress,
  speechSupported,
  speechSpeaking,
  onSpeak,
}: InlineQuestionReviewProps) {
  const [coachOpen, setCoachOpen] = useState(false);
  const currentCoach = coachInsight?.wordId === word.id ? coachInsight : null;
  const timerProgress = Math.min(100, Math.max(0, autoAdvancePercent));
  const coachPanelId = `word-coach-panel-${word.id}`;
  const coachHeadingId = `word-coach-heading-${word.id}`;

  const closeCoach = useCallback(() => {
    setCoachOpen(false);
    onCoachOpenChange(false);
  }, [onCoachOpenChange]);

  useEffect(() => {
    if (!coachOpen) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') closeCoach();
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [closeCoach, coachOpen]);

  useEffect(() => {
    return () => onCoachOpenChange(false);
  }, [onCoachOpenChange]);

  function toggleCoach() {
    if (coachOpen) {
      closeCoach();
      return;
    }
    setCoachOpen(true);
    onCoachOpenChange(true);
    if (!currentCoach || currentCoach.status === 'error') onOpenCoach(word);
  }

  const coachPanel = typeof document === 'undefined' ? null : createPortal(
    <div
      className={`word-coach-layer ${coachOpen ? 'is-open' : ''}`}
      aria-hidden={!coachOpen}
      inert={!coachOpen}
    >
      <button
        type="button"
        className="word-coach-backdrop"
        onClick={closeCoach}
        aria-label="收起 AI 词汇教练"
        tabIndex={coachOpen ? 0 : -1}
      />
      <aside
        id={coachPanelId}
        className="word-coach-drawer"
        aria-labelledby={coachHeadingId}
      >
        <header className="word-coach-drawer-head">
          <div className="word-coach-identity">
            <span className="word-coach-signal" aria-hidden="true"><Sparkles /></span>
            <div>
              <span>AI 词汇教练</span>
              <h3 id={coachHeadingId}>{word.word}</h3>
              <small>{word.phonetic}{word.partOfSpeech ? ` · ${word.partOfSpeech}` : ''}</small>
            </div>
          </div>
          <button
            type="button"
            className="word-coach-close"
            onClick={closeCoach}
            aria-label="收起 AI 词汇教练"
            title="收起"
            tabIndex={coachOpen ? 0 : -1}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="word-coach-drawer-body">
          {currentCoach?.status === 'success' && (
            <Suspense fallback={<p className="markdown-loading">正在排版讲解…</p>}>
              <GroupedCoachContent
                word={word}
                markdown={currentCoach.text}
                examples={currentCoach.senseExamples}
                senseContent={currentCoach.senseContent}
              />
            </Suspense>
          )}
          {currentCoach?.status === 'error' && (
            <p className="answer-ai-hint is-error" aria-live="polite">{currentCoach.text}</p>
          )}
          {(currentCoach?.status === 'loading' || !currentCoach) && (
            <p className="answer-ai-hint" aria-live="polite">
              <LoaderCircle aria-hidden="true" className="spin-icon" />
              {currentCoach?.source === 'ai' ? '正在生成词汇讲解…' : '正在加载词库讲解…'}
            </p>
          )}
        </div>

        <footer className="word-coach-drawer-foot">
          <span>{currentCoach?.source === 'ai' ? '本地 AI 讲解' : '预生成词库讲解'}</span>
          <button
            type="button"
            className="word-coach-generate"
            onClick={() => onRegenerateCoach(word)}
            disabled={currentCoach?.status === 'loading'}
            tabIndex={coachOpen ? 0 : -1}
          >
            <RefreshCw
              aria-hidden="true"
              className={currentCoach?.status === 'loading' ? 'spin-icon' : ''}
            />
            {!aiConfigured
              ? '配置并生成'
              : currentCoach?.status === 'error'
                ? '生成讲解'
                : '重新生成'}
          </button>
        </footer>
      </aside>
    </div>,
    document.body,
  );

  return (
    <>
    <section className="inline-question-review" data-coach-open={coachOpen}>
      <div className="inline-review-toolbar">
        <div className="inline-review-word-summary">
          <div className="inline-review-word-title">
            <strong>{word.word}</strong>
            <button
              type="button"
              className={`word-detail-toggle ${coachOpen ? 'is-open' : ''}`}
              onClick={toggleCoach}
              aria-expanded={coachOpen}
              aria-controls={coachPanelId}
              aria-label={`查看 ${word.word} 词汇详情`}
              title="查看词汇详情"
            >
              <Info aria-hidden="true" />
            </button>
          </div>
          <div className="inline-review-pronunciation">
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
            <span>{word.phonetic}{word.partOfSpeech ? ` · ${word.partOfSpeech}` : ''}</span>
          </div>
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
        <div className="inline-review-actions">
          <div
            className={`inline-review-next-progress ${autoAdvanceEnabled ? 'is-enabled' : ''}`}
            style={{ '--auto-advance-progress': `${timerProgress}%` } as CSSProperties}
          >
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
      </div>
    </section>
    {coachPanel}
    </>
  );
}