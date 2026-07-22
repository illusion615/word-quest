import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Flame,
  CheckCircle2,
  Crown,
  ExternalLink,
  Info,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Swords,
  Star,
} from '../icons';
import type { BankCoverageMap } from '../domain/coverage';
import {
  getClearedLevelNumberSet,
  levelResultKey,
  type GameProgressV1,
} from '../domain/gameProgress';
import {
  buildBankJourney,
} from '../domain/journey';
import type { LearningState, WordBankManifest, WordEntry } from '../domain/models';

interface DashboardProps {
  currentBank: WordBankManifest;
  entries: WordEntry[];
  learningState: LearningState;
  gameProgress: GameProgressV1;
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

export function Dashboard({
  currentBank,
  entries,
  learningState,
  gameProgress,
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
  const journey = buildBankJourney(
    entries,
    learningState,
    currentBank.id,
    getClearedLevelNumberSet(gameProgress, currentBank.id),
  );
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(journey.activeChapterIndex);
  const selectedChapter = journey.chapters[selectedChapterIndex] ?? journey.chapters[0];
  const statusLabel = currentBank.status === 'curated'
    ? '备考词表 · 官方无固定全集'
    : '考试大纲标签汇编 · 非官方发布';

  useEffect(() => {
    setSelectedChapterIndex(journey.activeChapterIndex);
  }, [currentBank.id, journey.activeChapterIndex]);

  const previousChapter = Math.max(0, selectedChapterIndex - 1);
  const nextChapter = Math.min(journey.chapters.length - 1, selectedChapterIndex + 1);

  return (
    <main className="dashboard page-width">
      <section className="journey-section" aria-labelledby="journey-heading">
        <div className="section-heading journey-heading">
          <div>
            <p className="section-index">卷王征途 · {journey.totalLevels} 关</p>
            <h2 id="journey-heading">
              {currentBank.name} · 第 {selectedChapterIndex + 1} 章「{selectedChapter?.title ?? '加载中'}」
            </h2>
          </div>
          <span>全库稳定掌握 {masteryPercentage}% · FSRS 按遗忘风险安排复习</span>
        </div>

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

        <ol className="journey-map level-map">
          {selectedChapter?.levels.map((level) => (
            <li
              key={level.id}
              className={`journey-level is-${level.status}`}
              data-level-kind={level.kind}
            >
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
                    ? `${level.newCount} 新词 · ${level.dueCount} 到期；并复核前序薄弱词。`
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
                  aria-label={`第 ${level.number} 关稳定掌握度`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={level.progressPercentage}
                >
                  <span style={{ width: `${level.progressPercentage}%` }} />
                </div>
                <div className="journey-level-footer">
                  <strong>{level.progressPercentage}%</strong>
                  {level.status === 'completed' && (
                    <button
                      type="button"
                      className="secondary-button journey-action"
                      onClick={() => onStartLevel(level.globalIndex)}
                      disabled={bankLoading || sessionPreparing || (level.dueCount === 0 && level.newCount === 0)}
                    >
                      {level.dueCount > 0
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
                          || (level.dueCount === 0 && level.newCount === 0)
                        }
                      >
                        {sessionPreparing ? (
                          <><LoaderCircle className="spin-icon" aria-hidden="true" /> 构建战场中</>
                        ) : bankLoading ? (
                          <><LoaderCircle className="spin-icon" aria-hidden="true" /> 加载词库中</>
                        ) : level.dueCount === 0 && level.newCount === 0 ? (
                          <>下次 {nextReviewLabel(level.nextReviewAt)}</>
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

        {bankError && <p className="bank-error" role="alert">{bankError}</p>}
        <div className="source-note">
          <Info aria-hidden="true" />
          <div>
            <strong>{statusLabel}</strong>
            <p>{currentBank.basis} · {currentBank.sourceVersion}</p>
          </div>
          {currentBank.sourceUrl && (
            <a href={currentBank.sourceUrl} target="_blank" rel="noreferrer">
              {currentBank.sourceName} <ExternalLink aria-hidden="true" />
            </a>
          )}
        </div>
        <p className="journey-ai-note">
          {aiConfigured
            ? '每轮先复习到期词，再引入最多 8 个新词；未到期词不会重复出现。'
            : '每轮先复习到期词，再引入最多 8 个新词；配置 AI 后生成专属阅读战场。'}
        </p>
      </section>
    </main>
  );
}
