import { ExternalLink, RefreshCw } from '../icons';
import type { BankCoverageMap } from '../domain/coverage';
import type { BankId, WordBankManifest } from '../domain/models';

interface BattleRecordProps {
  banks: WordBankManifest[];
  selectedBank: BankId;
  coverage: BankCoverageMap | null;
  coverageLoading: boolean;
  coverageError: string | null;
  sessionPreparing: boolean;
  todayCompleted: number;
  lastChallengeAt: string | null;
  onSelectBank: (bankId: BankId) => void;
  onRetryCoverage: () => void;
}

function formatChallengeTime(timestamp: string): string {
  const challengeTime = new Date(timestamp);
  if (Number.isNaN(challengeTime.getTime())) return '尚未挑战';
  return challengeTime.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function BattleRecord({
  banks,
  selectedBank,
  coverage,
  coverageLoading,
  coverageError,
  sessionPreparing,
  todayCompleted,
  lastChallengeAt,
  onSelectBank,
  onRetryCoverage,
}: BattleRecordProps) {
  const currentBank = banks.find((bank) => bank.id === selectedBank) ?? banks[0];
  const currentCoverage = coverage?.[currentBank.id];
  const learningPercentage = currentCoverage?.learningPercentage ?? 0;
  const masteryPercentage = currentCoverage?.masteryPercentage ?? 0;
  const statusLabel = currentBank.status === 'curated'
    ? '备考词表 · 官方无固定全集'
    : '官方考试大纲词表';

  return (
    <section className="battle-record" aria-labelledby="battle-record-heading">
      <div className="battle-record-main">
        <div className="battle-record-heading">
          <div>
            <p className="section-index">词库战绩</p>
            <h1 id="battle-record-heading">{currentBank.name}</h1>
            <span className="battle-record-meta">
              {currentBank.count.toLocaleString()} 只词怪 · {statusLabel}
            </span>
            {currentBank.sourceUrl ? (
              <a
                className="battle-record-origin"
                href={currentBank.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                {currentBank.basis} · {currentBank.sourceVersion}
                <ExternalLink aria-hidden="true" />
              </a>
            ) : (
              <span className="battle-record-origin">
                {currentBank.basis} · {currentBank.sourceVersion}
              </span>
            )}
          </div>
        </div>

        <div className="battle-overview" aria-label={`${currentBank.name}学习概览`}>
          <div className="battle-overview-stat is-progress">
            <span>学习覆盖</span>
            <strong>{coverageLoading ? '计算中' : `${learningPercentage}%`}</strong>
            <div className="battle-progress is-learning"><span style={{ width: `${learningPercentage}%` }} /></div>
            <small>{currentCoverage?.learned ?? 0} / {currentBank.count.toLocaleString()} 个词</small>
          </div>
          <div className="battle-overview-stat is-progress">
            <span>稳定掌握</span>
            <strong>{coverageLoading ? '计算中' : `${masteryPercentage}%`}</strong>
            <div className="battle-progress is-mastery"><span style={{ width: `${masteryPercentage}%` }} /></div>
            <small>{currentCoverage?.mastered ?? 0} / {currentBank.count.toLocaleString()} 个词</small>
          </div>
          <div className="battle-overview-stat is-motivation">
            <span>今日完成</span>
            <strong>{todayCompleted.toLocaleString()} 题</strong>
          </div>
          <div className="battle-overview-stat is-motivation">
            <span>最近挑战</span>
            <strong>
              {lastChallengeAt ? (
                <time dateTime={lastChallengeAt}>{formatChallengeTime(lastChallengeAt)}</time>
              ) : '尚未挑战'}
            </strong>
          </div>
        </div>
      </div>

      <div className="bank-switcher" role="group" aria-label="切换词库关卡">
        {banks.map((bank) => {
          const bankCoverage = coverage?.[bank.id];
          return (
            <button
              key={bank.id}
              type="button"
              className={bank.id === selectedBank ? 'is-selected' : ''}
              onClick={() => onSelectBank(bank.id)}
              disabled={sessionPreparing}
              aria-pressed={bank.id === selectedBank}
            >
              <strong>{bank.name}</strong>
              <span>{coverageLoading ? '计算中' : `稳定 ${bankCoverage?.masteryPercentage ?? 0}%`}</span>
            </button>
          );
        })}
      </div>

      {coverageError && (
        <div className="coverage-error" role="alert">
          <span>{coverageError}</span>
          <button type="button" onClick={onRetryCoverage}>
            <RefreshCw aria-hidden="true" /> 重试覆盖率
          </button>
        </div>
      )}
    </section>
  );
}
