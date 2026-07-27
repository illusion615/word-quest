import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Flame,
  CheckCircle2,
  Crown,
  LoaderCircle,
  ListChecks,
  LockKeyhole,
  RefreshCw,
  Swords,
  Star,
} from '../icons';
import type { BankCoverageMap } from '../domain/coverage';
import { BOSS_QUESTION_COUNT, bossPassingScore } from '../domain/boss';
import {
  getBossLevelEntries,
  getJourneyLevelEntries,
} from '../domain/journey';
import { levelResultKey, type GameProgressV1 } from '../domain/gameProgress';
import type { BankJourney } from '../domain/journey';
import type {
  LearningState,
  ResourceLoadProgress,
  WordBankManifest,
  WordEntry,
} from '../domain/models';
import { LevelWordDialog } from './LevelWordDialog';

interface DashboardProps {
  currentBank: WordBankManifest;
  journey: BankJourney;
  journeyLoading: boolean;
  journeyLoadProgress: ResourceLoadProgress | null;
  gameProgress: GameProgressV1;
  entries: WordEntry[];
  learningState: LearningState;
  coverage: BankCoverageMap | null;
  bankLoading: boolean;
  sessionPreparing: boolean;
  aiConfigured: boolean;
  bankError: string | null;
  onStartLevel: (levelIndex: number) => void;
  onRetryBank: () => void;
}

function nextReviewLabel(nextReviewAt: string | null): string {
  if (!nextReviewAt) return '暂无待复习词';
  const due = new Date(nextReviewAt);
  const today = new Date();
  if (due.toDateString() === today.toDateString()) {
    return `今天 ${due.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return due.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function newWordBatchLabel(newCount: number): string {
  const batchSize = Math.min(8, newCount);
  return newCount > batchSize
    ? `学习最多 ${batchSize} 新词`
    : `学习 ${batchSize} 新词`;
}

function fileSizeLabel(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(bytes / 1_024)} KB`;
}

function journeyLoadLabel(progress: ResourceLoadProgress | null): string {
  if (!progress) return '正在加载完整词库…';
  if (progress.phase === 'connecting') return '正在连接关卡索引…';
  if (progress.phase === 'processing') return '下载完成，正在编排关卡…';
  if (progress.phase === 'complete') return '关卡编排完成';
  return progress.totalBytes
    ? `已下载 ${fileSizeLabel(progress.loadedBytes)} / ${fileSizeLabel(progress.totalBytes)}`
    : `已接收 ${fileSizeLabel(progress.loadedBytes)}`;
}

export function Dashboard({
  currentBank,
  journey,
  journeyLoading,
  journeyLoadProgress,
  gameProgress,
  entries,
  learningState,
  coverage,
  bankLoading,
  sessionPreparing,
  aiConfigured,
  bankError,
  onStartLevel,
  onRetryBank,
}: DashboardProps) {
  const currentCoverage = coverage?.[currentBank.id];
  const masteryPercentage = currentCoverage?.masteryPercentage ?? 0;
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(journey.activeChapterIndex);
  const [inspectedLevelIndex, setInspectedLevelIndex] = useState<number | null>(null);
  const selectedChapter = journey.chapters[selectedChapterIndex] ?? journey.chapters[0];
  const inspectedLevel = useMemo(() => journey.chapters
    .flatMap((chapter) => chapter.levels)
    .find((level) => level.globalIndex === inspectedLevelIndex) ?? null,
  [inspectedLevelIndex, journey.chapters]);
  const inspectedLevelWords = useMemo(() => {
    if (!inspectedLevel) return [];
    return inspectedLevel.kind === 'boss'
      ? getBossLevelEntries(entries, learningState, inspectedLevel.globalIndex, currentBank.id)
      : getJourneyLevelEntries(entries, inspectedLevel.globalIndex, currentBank.id);
  }, [currentBank.id, entries, inspectedLevel, learningState]);

  useEffect(() => {
    setSelectedChapterIndex(journey.activeChapterIndex);
    setInspectedLevelIndex(null);
  }, [currentBank.id, journey.activeChapterIndex]);

  const previousChapter = Math.max(0, selectedChapterIndex - 1);
  const nextChapter = Math.min(journey.chapters.length - 1, selectedChapterIndex + 1);
  const loadPercentage = journeyLoadProgress?.percentage ?? null;
  const loadLabel = journeyLoadLabel(journeyLoadProgress);

  return (
    <main className="dashboard page-width">
      <section className="journey-section" aria-labelledby="journey-heading">
        <div className="section-heading journey-heading">
          <div>
            <p className="section-index">
              {journeyLoading && !selectedChapter
                ? '卷王征途 · 关卡准备中'
                : `卷王征途 · ${journey.totalLevels} 关`}
            </p>
            <h2 id="journey-heading">
              {selectedChapter
                ? `${currentBank.name} · 第 ${selectedChapterIndex + 1} 章「${selectedChapter.title}」`
                : `${currentBank.name} · 关卡地图准备中`}
            </h2>
          </div>
          <span>全库稳定掌握 {masteryPercentage}% · FSRS 按遗忘风险安排复习</span>
        </div>

        {journeyLoading && journey.chapters.length === 0 && (
          <div className="journey-loading" role="status" aria-live="polite">
            <div className="journey-loading-copy">
              <LoaderCircle className="spin-icon" aria-hidden="true" />
              <div>
                <strong>词怪正在列队</strong>
                <span>{journeyLoadProgress?.phase === 'processing'
                  ? '正在生成关卡地图…'
                  : '关卡地图加载中…'}</span>
              </div>
            </div>
            <div className="journey-loading-progress">
              <div className="journey-loading-progress-copy">
                <span>{loadLabel}</span>
                {loadPercentage !== null && <strong>{loadPercentage}%</strong>}
              </div>
              <div
                className={`journey-loading-track ${loadPercentage === null ? 'is-indeterminate' : ''}`}
                role="progressbar"
                aria-label="关卡地图加载进度"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={loadPercentage ?? undefined}
                aria-valuetext={loadLabel}
              >
                <span style={{ width: loadPercentage === null ? undefined : `${loadPercentage}%` }} />
              </div>
            </div>
            <div className="journey-loading-grid" aria-hidden="true">
              <span /><span /><span />
            </div>
          </div>
        )}

        {!journeyLoading && bankError && journey.chapters.length === 0 && (
          <div className="journey-load-error" role="alert">
            <div>
              <strong>词怪列队失败</strong>
              <span>{bankError}</span>
            </div>
            <button type="button" className="secondary-button" onClick={onRetryBank}>
              <RefreshCw aria-hidden="true" /> 重新加载
            </button>
          </div>
        )}

        {journey.chapters.length > 0 && (
          <div className="chapter-navigation" aria-label="章节导航">
            <button
              type="button"
              className="chapter-arrow"
              onClick={() => setSelectedChapterIndex(previousChapter)}
              disabled={selectedChapterIndex === 0}
              aria-label="上一章"
            >
              <ArrowLeft aria-hidden="true" />
            </button>
            <div className="chapter-tabs" role="tablist" aria-label="选择章节">
              {journey.chapters.map((chapter) => (
                <button
                  key={chapter.id}
                  type="button"
                  role="tab"
                  className={`chapter-tab is-${chapter.status}`}
                  aria-selected={chapter.index === selectedChapterIndex}
                  onClick={() => setSelectedChapterIndex(chapter.index)}
                >
                  <span>第 {chapter.index + 1} 章</span>
                  <strong>{chapter.title}</strong>
                  <small>{chapter.progressPercentage}%</small>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="chapter-arrow"
              onClick={() => setSelectedChapterIndex(nextChapter)}
              disabled={selectedChapterIndex >= journey.chapters.length - 1}
              aria-label="下一章"
            >
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        )}

        {selectedChapter && (
          <div className={`chapter-summary is-${selectedChapter.status}`}>
            <div>
              <span>关卡 {selectedChapter.levelStart}–{selectedChapter.levelEnd}</span>
              <strong>{selectedChapter.masteredWords} / {selectedChapter.totalWords} 词稳定掌握</strong>
            </div>
            <div className="chapter-progress"><span style={{ width: `${selectedChapter.progressPercentage}%` }} /></div>
            <b>{selectedChapter.progressPercentage}%</b>
          </div>
        )}

        {selectedChapter && (
          <ol className="journey-map level-map">
            {selectedChapter.levels.map((level) => (
            <li
              key={level.id}
              className={`journey-level is-${level.status}`}
              data-level-kind={level.kind}
            >
              <button
                type="button"
                className="journey-level-details-trigger"
                aria-label={`查看第 ${level.number} 关单词列表`}
                onClick={() => setInspectedLevelIndex(level.globalIndex)}
              />
              <div className="journey-level-index">
                <span>第 {String(level.number).padStart(3, '0')} 关</span>
                {level.perfect && <Crown aria-label="完美通关" />}
              </div>
              <div className="journey-level-body">
                <div className="level-stars" aria-label={`第 ${level.number} 关历史星级`}>
                  {[1, 2, 3].map((star) => {
                    const earned = gameProgress.levelResults[
                      levelResultKey(currentBank.id, level.number)
                    ]?.stars ?? 0;
                    return <Star key={star} className={star <= earned ? 'is-earned' : ''} aria-hidden="true" />;
                  })}
                </div>
                <div className="journey-level-title">
                  <div>
                    <span>{level.frequencyLabel}</span>
                    <h3>{level.kind === 'boss' ? 'Boss 决战' : '词群挑战'}</h3>
                  </div>
                  {level.status === 'completed'
                    ? <CheckCircle2 aria-label="已通关" />
                    : level.status === 'locked'
                      ? <LockKeyhole aria-label="未解锁" />
                      : <Swords aria-label="当前关卡" />}
                </div>
                <p>
                  {level.kind === 'boss'
                    ? `固定 ${BOSS_QUESTION_COUNT} 题 · 三阶段答满；至少答对 ${bossPassingScore()} 题通过。`
                    : `${level.masteredCount} 稳定掌握 · ${level.dueCount} 到期 · ${level.newCount} 新词`}
                </p>
                {level.kind === 'boss' && (
                  <div className="boss-badge" aria-label="Boss 关说明">
                    <Flame aria-hidden="true" /> 高压复盘节点
                  </div>
                )}
                <div
                  className="journey-progress"
                  role="progressbar"
                  aria-label={level.kind === 'boss'
                    ? `第 ${level.number} 关 Boss 通关进度`
                    : `第 ${level.number} 关稳定掌握度`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={level.progressPercentage}
                >
                  <span style={{ width: `${level.progressPercentage}%` }} />
                </div>
                <div className="journey-level-footer">
                  <div className="journey-level-metric">
                    <strong>{level.kind === 'boss' ? `${BOSS_QUESTION_COUNT} 题` : `${level.progressPercentage}%`}</strong>
                    <span><ListChecks aria-hidden="true" /> 查看词表</span>
                  </div>
                  {level.status === 'completed' && (
                    <button
                      type="button"
                      className="secondary-button journey-action"
                      onClick={() => onStartLevel(level.globalIndex)}
                      disabled={bankLoading || sessionPreparing || (
                        level.kind !== 'boss' && level.dueCount === 0 && level.newCount === 0
                      )}
                    >
                      {level.kind === 'boss'
                        ? `再次挑战 ${BOSS_QUESTION_COUNT} 题`
                        : level.dueCount > 0
                        ? `复习 ${level.dueCount} 词`
                        : level.newCount > 0
                          ? newWordBatchLabel(level.newCount)
                          : `下次 ${nextReviewLabel(level.nextReviewAt)}`}
                    </button>
                  )}
                  {level.status === 'locked' && <span>完成上一关后解锁</span>}
                  {level.status === 'active' && (
                    bankError ? (
                      <button type="button" className="secondary-button journey-action" onClick={onRetryBank}>
                        <RefreshCw aria-hidden="true" /> 重试加载
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="primary-button journey-action"
                        onClick={() => onStartLevel(level.globalIndex)}
                        disabled={
                          bankLoading
                          || sessionPreparing
                        }
                      >
                        {sessionPreparing ? (
                          <><LoaderCircle className="spin-icon" aria-hidden="true" /> 构建战场中</>
                        ) : bankLoading ? (
                          <><LoaderCircle className="spin-icon" aria-hidden="true" /> 加载词库中</>
                        ) : level.kind === 'boss' ? (
                          <>开始 {BOSS_QUESTION_COUNT} 题决战 <ArrowRight aria-hidden="true" /></>
                        ) : level.dueCount === 0 && level.newCount === 0 ? (
                          <>重新挑战通关 <ArrowRight aria-hidden="true" /></>
                        ) : level.dueCount > 0 ? (
                          <>复习 {level.dueCount} 词 <ArrowRight aria-hidden="true" /></>
                        ) : (
                          <>{newWordBatchLabel(level.newCount)} <ArrowRight aria-hidden="true" /></>
                        )}
                      </button>
                    )
                  )}
                </div>
              </div>
            </li>
            ))}
          </ol>
        )}

        {bankError && journey.chapters.length > 0 && (
          <p className="bank-error" role="alert">{bankError}</p>
        )}
        <p className="journey-ai-note">
          {aiConfigured
            ? '每轮先复习到期词，再引入最多 8 个新词；未到期词不会重复出现。'
            : '每轮先复习到期词，再引入最多 8 个新词；配置 AI 后生成专属阅读战场。'}
        </p>
      </section>
      {inspectedLevel && (
        <LevelWordDialog
          level={inspectedLevel}
          bankName={currentBank.name}
          words={inspectedLevelWords}
          learningState={learningState}
          loading={bankLoading}
          onClose={() => setInspectedLevelIndex(null)}
        />
      )}
    </main>
  );
}
