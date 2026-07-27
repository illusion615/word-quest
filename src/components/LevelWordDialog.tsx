import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpenCheck, ListChecks, Target, X } from '../icons';
import {
  calculateLevelLearningMetrics,
  calculateWordLearningMetrics,
} from '../domain/learningMetrics';
import type { JourneyLevel } from '../domain/journey';
import type { LearningState, WordEntry } from '../domain/models';

interface LevelWordDialogProps {
  level: JourneyLevel;
  bankName: string;
  words: readonly WordEntry[];
  learningState: LearningState;
  loading: boolean;
  onClose: () => void;
}

function percentageLabel(value: number | null): string {
  if (value === null) return '—';
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value)}%`;
}

function reviewDateLabel(timestamp: string | null): string {
  if (!timestamp) return '尚未练习';
  return new Date(timestamp).toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  });
}

export function LevelWordDialog({
  level,
  bankName,
  words,
  learningState,
  loading,
  onClose,
}: LevelWordDialogProps) {
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const wordMetrics = useMemo(() => new Map(words.map((word) => [
    word.id,
    calculateWordLearningMetrics(word, learningState.progress[word.id]),
  ])), [learningState.progress, words]);
  const levelMetrics = useMemo(
    () => calculateLevelLearningMetrics(words, learningState),
    [learningState, words],
  );
  const selectedWord = words.find((word) => word.id === selectedWordId) ?? null;
  const selectedMetrics = selectedWord ? wordMetrics.get(selectedWord.id) : null;

  useEffect(() => {
    setSelectedWordId(null);
  }, [level.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const selectWord = (wordId: string) => {
    setSelectedWordId(wordId);
    window.requestAnimationFrame(() => {
      if (window.matchMedia('(max-width: 760px)').matches) {
        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  };

  return (
    <div
      className="dialog-backdrop level-word-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="settings-dialog level-word-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="level-word-dialog-title"
      >
        <header className="level-word-dialog-header">
          <div className="level-word-dialog-title">
            <span className="level-word-dialog-mark"><ListChecks aria-hidden="true" /></span>
            <div>
              <p>{bankName} · {level.kind === 'boss' ? '综合复盘词池' : '本关词群'}</p>
              <h2 id="level-word-dialog-title">第 {level.number} 关单词列表</h2>
            </div>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭关卡词表">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="level-word-overview" aria-label="本关学习概览">
          <div>
            <span>义项覆盖率</span>
            <strong>{percentageLabel(levelMetrics.coveragePercentage)}</strong>
            <small>{levelMetrics.coveredSenseCount} / {levelMetrics.totalSenseCount} 个义项</small>
          </div>
          <div>
            <span>正确率</span>
            <strong>{percentageLabel(levelMetrics.accuracyPercentage)}</strong>
            <small>{levelMetrics.correct} / {levelMetrics.attempts} 次作答</small>
          </div>
          <div>
            <span>词怪数量</span>
            <strong>{levelMetrics.wordCount}</strong>
            <small>{level.kind === 'boss' ? '前置关卡复盘池' : '本关固定词群'}</small>
          </div>
        </div>

        <div className={`level-word-workspace ${selectedWord ? 'has-selection' : ''}`}>
          <section className="level-word-list-panel" aria-labelledby="level-word-list-title">
            <div className="level-word-panel-heading">
              <div>
                <span>WORD ROSTER</span>
                <h3 id="level-word-list-title">单词与学习表现</h3>
              </div>
              <small>点击单词查看全部释义 <ArrowRight aria-hidden="true" /></small>
            </div>

            {loading && words.length === 0 ? (
              <div className="level-word-empty" role="status">完整词条加载中…</div>
            ) : words.length === 0 ? (
              <div className="level-word-empty">本关词条暂不可用，请关闭后重试加载。</div>
            ) : (
              <div className="level-word-list">
                {words.map((word, index) => {
                  const metrics = wordMetrics.get(word.id);
                  if (!metrics) return null;
                  return (
                    <button
                      key={word.id}
                      type="button"
                      className={`level-word-row ${selectedWordId === word.id ? 'is-selected' : ''}`}
                      aria-pressed={selectedWordId === word.id}
                      onClick={() => selectWord(word.id)}
                    >
                      <span className="level-word-order">{String(index + 1).padStart(2, '0')}</span>
                      <span className="level-word-identity">
                        <strong>{word.word}</strong>
                        <small>{word.phonetic || word.partOfSpeech || '词条'}</small>
                      </span>
                      <span className="level-word-stat">
                        <small>覆盖率</small>
                        <strong>{percentageLabel(metrics.coveragePercentage)}</strong>
                        <i><span style={{ width: `${metrics.coveragePercentage}%` }} /></i>
                      </span>
                      <span className="level-word-stat">
                        <small>正确率</small>
                        <strong>{percentageLabel(metrics.accuracyPercentage)}</strong>
                        <i><span style={{ width: `${metrics.accuracyPercentage ?? 0}%` }} /></i>
                      </span>
                      <ArrowRight className="level-word-row-arrow" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <aside
            ref={detailRef}
            className="level-word-detail-panel"
            aria-label={selectedWord ? `${selectedWord.word} 的全部释义` : '单词释义详情'}
          >
            {selectedWord && selectedMetrics ? (
              <>
                <header className="level-word-detail-header">
                  <div>
                    <span>{selectedWord.partOfSpeech || 'WORD DETAIL'}</span>
                    <h3>{selectedWord.word}</h3>
                    {selectedWord.phonetic && <p>{selectedWord.phonetic}</p>}
                  </div>
                  <div className="level-word-detail-score">
                    <span>{selectedMetrics.coveredSenseCount} / {selectedMetrics.totalSenseCount} 义已覆盖</span>
                    <strong>{percentageLabel(selectedMetrics.accuracyPercentage)} 正确率</strong>
                  </div>
                </header>

                <div className="level-word-senses">
                  {selectedMetrics.senses.map((sense, index) => (
                    <article key={sense.id} className={`level-word-sense ${sense.covered ? 'is-covered' : ''}`}>
                      <div className="level-word-sense-copy">
                        <span>义项 {String(index + 1).padStart(2, '0')}</span>
                        <p>{sense.label && <><b>{sense.label}</b>{' '}</>}{sense.text}</p>
                        <small>{reviewDateLabel(sense.lastReviewedAt)} · {sense.attempts} 次作答</small>
                      </div>
                      <div className="level-word-sense-metrics">
                        <span>
                          <small>覆盖率</small>
                          <strong>{sense.coveragePercentage}%</strong>
                        </span>
                        <span>
                          <small>准确率</small>
                          <strong>{percentageLabel(sense.accuracyPercentage)}</strong>
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <div className="level-word-detail-empty">
                <span><BookOpenCheck aria-hidden="true" /></span>
                <h3>选择一个单词</h3>
                <p>这里会列出它的全部释义，以及每个义项是否练过、练习次数和准确率。</p>
                <div><Target aria-hidden="true" /> 未练习的义项会显示为 0% 覆盖</div>
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}