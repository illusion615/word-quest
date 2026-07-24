import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChoiceReviewMark, type ChoiceReviewState } from './ChoiceReviewMark';

interface UseReviewedChoiceInspectionOptions {
  reviewed: boolean;
  onInspectionChange?: (inspecting: boolean) => void;
}

export function useReviewedChoiceInspection({
  reviewed,
  onInspectionChange,
}: UseReviewedChoiceInspectionOptions) {
  const [inspectedId, setInspectedId] = useState<string | null>(null);

  useEffect(() => {
    if (reviewed || inspectedId === null) return;
    setInspectedId(null);
    onInspectionChange?.(false);
  }, [inspectedId, onInspectionChange, reviewed]);

  function handleChoiceClick(id: string, correct: boolean, onAnswer: () => void) {
    if (!reviewed) {
      onAnswer();
      return;
    }
    if (!correct) return;
    const nextId = inspectedId === id ? null : id;
    setInspectedId(nextId);
    onInspectionChange?.(nextId !== null);
  }

  return { inspectedId, handleChoiceClick };
}

interface ReviewableChoiceProps {
  index: number;
  text: string;
  correct: boolean;
  selected: boolean;
  reviewState: ChoiceReviewState | null;
  reviewed: boolean;
  inspecting: boolean;
  onClick: () => void;
  detail: ReactNode;
}

type CardPhase = 'measuring' | 'opening' | 'open' | 'closing';

interface ChoiceCardOverlayProps {
  origin: DOMRect;
  label: string;
  onClose: () => void;
  children: ReactNode;
}

function ChoiceCardOverlay({ origin, label, onClose, children }: ChoiceCardOverlayProps) {
  const [phase, setPhase] = useState<CardPhase>('measuring');
  const cardRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const target = card.getBoundingClientRect();
    const originCenterX = origin.left + origin.width / 2;
    const originCenterY = origin.top + origin.height / 2;
    const targetCenterX = target.left + target.width / 2;
    const targetCenterY = target.top + target.height / 2;
    const originScale = Math.max(0.18, Math.min(0.9, origin.width / target.width));
    card.style.setProperty('--choice-card-origin-x', `${originCenterX - targetCenterX}px`);
    card.style.setProperty('--choice-card-origin-y', `${originCenterY - targetCenterY}px`);
    card.style.setProperty('--choice-card-origin-scale', String(originScale));

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase('open');
      card.focus();
      return;
    }
    setPhase('opening');
    card.focus();
  }, [origin]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const appRoot = document.getElementById('root');
    const rootWasInert = appRoot?.inert ?? false;
    document.body.style.overflow = 'hidden';
    if (appRoot) appRoot.inert = true;
    return () => {
      document.body.style.overflow = previousOverflow;
      if (appRoot) appRoot.inert = rootWasInert;
    };
  }, []);

  useLayoutEffect(() => {
    if (phase !== 'opening' && phase !== 'closing') return;
    let active = true;
    const completePhase = () => {
      if (!active) return;
      if (phase === 'opening') setPhase('open');
      else onCloseRef.current();
    };
    const animation = cardRef.current?.getAnimations()[0];
    void animation?.finished.then(completePhase, () => undefined);
    const timer = window.setTimeout(() => {
      completePhase();
    }, phase === 'opening' ? 700 : 550);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [phase]);

  useEffect(() => {
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') requestClose();
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  });

  function requestClose() {
    if (phase === 'closing') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose();
      return;
    }
    setPhase('closing');
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    requestClose();
  }

  return createPortal(
    <div className={`choice-card-layer is-${phase}`}>
      <button
        type="button"
        className="choice-card-backdrop"
        onClick={requestClose}
        aria-label="收起释义卡"
        tabIndex={-1}
      />
      <div
        ref={cardRef}
        className="choice-card-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${label} 释义卡`}
        title="点击收起"
        tabIndex={0}
        onClick={requestClose}
        onKeyDown={handleCardKeyDown}
        onAnimationEnd={(event) => {
          if (event.target !== event.currentTarget) return;
          if (phase === 'opening') setPhase('open');
          if (phase === 'closing') onCloseRef.current();
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ReviewableChoice({
  index,
  text,
  correct,
  selected,
  reviewState,
  reviewed,
  inspecting,
  onClick,
  detail,
}: ReviewableChoiceProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasInspectingRef = useRef(false);
  const [origin, setOrigin] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (wasInspectingRef.current && !inspecting) {
      setOrigin(null);
      buttonRef.current?.focus();
    }
    wasInspectingRef.current = inspecting;
  }, [inspecting]);

  return (
    <div className="choice-option">
      <button
        ref={buttonRef}
        type="button"
        className={[
          'choice-button',
          selected ? 'is-selected' : '',
          reviewState ? `is-${reviewState}` : '',
          inspecting ? 'is-card-open' : '',
        ].filter(Boolean).join(' ')}
        aria-pressed={selected}
        aria-expanded={reviewed && correct ? inspecting : undefined}
        data-review-state={reviewState ?? undefined}
        disabled={reviewed && !correct}
        onClick={() => {
          if (reviewed && correct && !inspecting && buttonRef.current) {
            setOrigin(buttonRef.current.getBoundingClientRect());
          }
          onClick();
        }}
      >
        <span className="choice-letter">{String.fromCharCode(65 + index)}</span>
        <span className="choice-text">{text}</span>
        <ChoiceReviewMark state={reviewState} />
      </button>
      {inspecting && origin && typeof document !== 'undefined' && (
        <ChoiceCardOverlay origin={origin} label={text} onClose={onClick}>
          {detail}
        </ChoiceCardOverlay>
      )}
    </div>
  );
}
