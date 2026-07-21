import type { AdaptiveStudyItem } from '../domain/models';
import { candidateLemmas } from '../domain/sentencePolicy';

interface ChainPassageBarProps {
  items: AdaptiveStudyItem[];
  currentWordId: string;
  revealedWordIds: ReadonlySet<string>;
  missedWordIds?: ReadonlySet<string>;
  compact?: boolean;
}

export function ChainSentenceBar({
  items,
  currentWordId,
  revealedWordIds,
  missedWordIds,
  compact = false,
}: ChainPassageBarProps) {
  const passage = items[0]?.chainPassage;
  if (!passage) return null;

  const targets = items.map((item) => ({
    id: item.word.id,
    lemma: item.word.word.toLowerCase(),
  }));
  const matchTargetId = (token: string): string | undefined => {
    const lower = token.toLowerCase();
    const lemmas = candidateLemmas(lower);
    return targets.find((target) => (
      lower === target.lemma || lemmas.includes(target.lemma)
    ))?.id;
  };

  const parts = passage.text.split(/([A-Za-z]+(?:['-][A-Za-z]+)*)/);
  let currentMarked = false;
  const rendered = parts.map((part, index) => {
    if (!/[A-Za-z]/.test(part)) return <span key={`${part}-${index}`}>{part}</span>;
    const wordId = matchTargetId(part);
    if (!wordId) return <span key={`${part}-${index}`}>{part}</span>;
    if (!revealedWordIds.has(wordId)) {
      return <mark key={`${part}-${index}`} className="chain-sentence-hidden" aria-label="尚未考核的目标词已隐藏">＿＿＿</mark>;
    }
    if (wordId === currentWordId && !currentMarked) {
      currentMarked = true;
      return <mark key={`${part}-${index}`} aria-current="true">{part}</mark>;
    }
    const missed = missedWordIds?.has(wordId) ? ' is-missed' : '';
    return <span key={`${part}-${index}`} className={`chain-target-word${missed}`}>{part}</span>;
  });
  const hiddenWordCount = new Set(
    targets.filter((target) => !revealedWordIds.has(target.id)).map((target) => target.id),
  ).size;
  const chainComplete = hiddenWordCount === 0;

  return (
    <aside className="chain-sentence-bar" aria-label="本组语境段落">
      <div className="chain-sentence-meta">
        <span>
          {compact
            ? '阅读战场'
            : passage.source === 'ai' ? 'AI 阅读理解' : '离线目标词序'}
          {!compact && passage.levelLabel && ` · ${passage.levelLabel}词汇与语法`}
        </span>
        {!compact && (
          <small>{chainComplete ? '本组目标词已全部解锁' : `${hiddenWordCount} 个待考词已隐藏`}</small>
        )}
      </div>
      <p className="chain-sentence-text">{rendered}</p>
      {chainComplete ? (
        <p className="chain-sentence-translation">{passage.translation}</p>
      ) : !compact ? (
        <p className="chain-sentence-translation is-locked">完成本组考核后解锁译文</p>
      ) : null}
      {!compact && passage.note && <p className="chain-sentence-note">{passage.note}</p>}
    </aside>
  );
}