import { ExternalLink, Info, RefreshCw } from '../icons';
import type { BankCoverageMap } from '../domain/coverage';
import type { BankId, WordBankManifest } from '../domain/models';
import { CoverageRings } from './CoverageRings';

interface BattleRecordProps {
  banks: WordBankManifest[];
  selectedBank: BankId;
  coverage: BankCoverageMap | null;
  coverageLoading: boolean;
  coverageError: string | null;
  sessionPreparing: boolean;
  onSelectBank: (bankId: BankId) => void;
  onRetryCoverage: () => void;
}

export function BattleRecord({
  banks,
  selectedBank,
  coverage,
  coverageLoading,
  coverageError,
  sessionPreparing,
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
            <span>{currentBank.count.toLocaleString()} 只词怪</span>
          </div>
          <CoverageRings
            learningPercentage={learningPercentage}
            masteryPercentage={masteryPercentage}
            label={currentBank.name}
          />
        </div>

        <div className="battle-coverage" aria-label={`${currentBank.name}覆盖率`}>
          <div>
            <span>学习覆盖</span>
            <strong>{coverageLoading ? '计算中' : `${learningPercentage}%`}</strong>
            <div className="battle-progress is-learning"><span style={{ width: `${learningPercentage}%` }} /></div>
            <small>{currentCoverage?.learned ?? 0} / {currentBank.count.toLocaleString()} 个词</small>
          </div>
          <div>
            <span>稳定掌握</span>
            <strong>{coverageLoading ? '计算中' : `${masteryPercentage}%`}</strong>
            <div className="battle-progress is-mastery"><span style={{ width: `${masteryPercentage}%` }} /></div>
            <small>{currentCoverage?.mastered ?? 0} / {currentBank.count.toLocaleString()} 个词</small>
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

      <div className="source-note battle-record-source">
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
