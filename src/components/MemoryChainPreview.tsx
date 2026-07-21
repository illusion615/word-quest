import { useState, type CSSProperties } from 'react';
import { ArrowRight, CheckCircle2, Volume2 } from '../icons';
import type { AdaptiveStudyItem } from '../domain/models';
import { primarySense } from '../domain/wordText';

interface MemoryChainPreviewProps {
  items: AdaptiveStudyItem[];
  assessmentWordIds: Set<string>;
  isSpeechSupported: boolean;
  onStart: () => void;
  onSpeak: (text: string) => void;
  onToggleAssessment: (wordId: string) => void;
}

function contextualMeaning(item: AdaptiveStudyItem): string {
  return item.chainPassage.contextualMeanings?.[item.word.id]
    ?? item.chainPassage.contextualMeanings?.[item.word.word.toLowerCase()]
    ?? primarySense(item.word.definitionZh);
}

interface WordChainCardProps {
  item: AdaptiveStudyItem;
  position: number;
  assessmentSelected: boolean;
  isSpeechSupported: boolean;
  onSpeak: (text: string) => void;
  onToggleAssessment: (wordId: string) => void;
}

function WordChainCard({
  item,
  position,
  assessmentSelected,
  isSpeechSupported,
  onSpeak,
  onToggleAssessment,
}: WordChainCardProps) {
  const [flipped, setFlipped] = useState(false);

  return (
    <li className={`memory-card ${assessmentSelected ? 'is-assessment' : ''} ${flipped ? 'is-flipped' : ''}`}>
      <span className="memory-card-index">{String(position).padStart(2, '0')}</span>
      <button
        type="button"
        className="memory-card-flip"
        onClick={() => setFlipped((current) => !current)}
        aria-pressed={flipped}
        aria-label={flipped
          ? `${item.word.word}，返回单词`
          : `${item.word.word}，查看释义`}
      >
        <span className="memory-card-inner">
          <span className="memory-card-face memory-card-front">
            <span className="memory-card-type">{item.word.partOfSpeech || 'word'}</span>
            <strong>{item.word.word}</strong>
            <small>{item.word.phonetic}</small>
          </span>
          <span className="memory-card-face memory-card-back">
            <small>词义</small>
            <p>{contextualMeaning(item)}</p>
          </span>
        </span>
      </button>

      {assessmentSelected && <span className="memory-card-badge">直接考核</span>}

      <div className="memory-card-actions">
        <button
          type="button"
          className="memory-card-action"
          onClick={() => onSpeak(item.word.word)}
          disabled={!isSpeechSupported}
          aria-label={`播放 ${item.word.word} 的发音`}
          title="播放发音"
        >
          <Volume2 aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`memory-card-action ${assessmentSelected ? 'is-active' : ''}`}
          onClick={() => onToggleAssessment(item.word.id)}
          aria-pressed={assessmentSelected}
          aria-label={assessmentSelected
            ? `取消 ${item.word.word} 的直接考核`
            : `${item.word.word} 直接进入考核`}
          title={assessmentSelected ? '取消直接考核' : '直接考核'}
        >
          <CheckCircle2 aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

export function MemoryChainPreview({
  items,
  assessmentWordIds,
  isSpeechSupported,
  onStart,
  onSpeak,
  onToggleAssessment,
}: MemoryChainPreviewProps) {
  return (
    <div className="memory-chain-preview" aria-label="本组单词卡牌">
      <ul
        className="memory-card-grid"
        aria-label="本组目标词"
        style={{ '--memory-card-count': items.length } as CSSProperties}
      >
        {items.map((item, index) => (
          <WordChainCard
            key={item.word.id}
            item={item}
            position={index + 1}
            assessmentSelected={assessmentWordIds.has(item.word.id)}
            isSpeechSupported={isSpeechSupported}
            onSpeak={onSpeak}
            onToggleAssessment={onToggleAssessment}
          />
        ))}
      </ul>

      <button type="button" className="primary-button memory-chain-start" onClick={onStart}>
        开始挑战 <ArrowRight aria-hidden="true" />
      </button>
    </div>
  );
}