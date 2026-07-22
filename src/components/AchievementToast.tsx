import { useEffect } from 'react';
import type { AchievementDefinition } from '../domain/achievements';
import { X } from '../icons';
import { AchievementIcon } from './AchievementIcon';

interface AchievementToastProps {
  achievement: AchievementDefinition | null;
  onDismiss: () => void;
}

export function AchievementToast({ achievement, onDismiss }: AchievementToastProps) {
  useEffect(() => {
    if (!achievement) return undefined;
    let active = true;
    const timers: number[] = [];
    let showerInterval: number | null = null;
    let resetCelebration: (() => void) | null = null;

    void import('canvas-confetti').then(({ default: confetti }) => {
      if (!active || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const celebrate = confetti.create(undefined, {
        resize: true,
        useWorker: true,
        disableForReducedMotion: true,
      });
      resetCelebration = () => celebrate.reset();
      const common = {
        disableForReducedMotion: true,
        colors: ['#e5383b', '#f6ad0f', '#ffd166', '#2ea44f', '#2f6bff', '#ffffff'],
        zIndex: 120,
      };

      // Opening cannon: a dense, high-energy burst behind the achievement.
      celebrate({
        ...common,
        particleCount: 160,
        spread: 105,
        startVelocity: 52,
        gravity: 0.85,
        scalar: 1.08,
        ticks: 260,
        shapes: ['square', 'circle', 'star'],
        origin: { x: 0.5, y: 0.58 },
      });

      // Twin stage cannons cross over the viewport.
      timers.push(window.setTimeout(() => {
        celebrate({
          ...common,
          particleCount: 90,
          angle: 58,
          spread: 68,
          startVelocity: 48,
          gravity: 0.9,
          ticks: 250,
          origin: { x: 0, y: 0.74 },
        });
        celebrate({
          ...common,
          particleCount: 90,
          angle: 122,
          spread: 68,
          startVelocity: 48,
          gravity: 0.9,
          ticks: 250,
          origin: { x: 1, y: 0.74 },
        });
      }, 180));

      // Oversized trophy and star pieces make the achievement feel specific.
      timers.push(window.setTimeout(() => {
        const trophy = confetti.shapeFromText({ text: '🏆', scalar: 2 });
        const star = confetti.shapeFromText({ text: '⭐', scalar: 2 });
        celebrate({
          ...common,
          particleCount: 18,
          spread: 92,
          startVelocity: 34,
          gravity: 0.65,
          scalar: 1.45,
          ticks: 300,
          shapes: [trophy, star],
          origin: { x: 0.5, y: 0.42 },
        });
      }, 620));

      // A sustained gold-heavy shower keeps the whole screen festive.
      const showerEndsAt = Date.now() + 3300;
      showerInterval = window.setInterval(() => {
        if (!active || Date.now() >= showerEndsAt) {
          if (showerInterval !== null) window.clearInterval(showerInterval);
          showerInterval = null;
          return;
        }
        celebrate({
          ...common,
          particleCount: 12,
          spread: 145,
          startVelocity: 9,
          decay: 0.92,
          gravity: 0.55,
          drift: (Math.random() - 0.5) * 0.8,
          scalar: 0.85,
          ticks: 320,
          colors: ['#f6ad0f', '#ffd166', '#fff3b0', '#e5383b', '#ffffff'],
          origin: { x: Math.random(), y: -0.05 },
        });
      }, 130);

      // Finale: one last full-width burst before the notification leaves.
      timers.push(window.setTimeout(() => {
        celebrate({
          ...common,
          particleCount: 180,
          spread: 150,
          startVelocity: 42,
          gravity: 0.75,
          scalar: 1.05,
          ticks: 280,
          shapes: ['star', 'circle', 'square'],
          origin: { x: 0.5, y: 0.55 },
        });
      }, 3450));

      timers.push(window.setTimeout(() => resetCelebration?.(), 6800));
    });

    timers.push(window.setTimeout(onDismiss, 7000));
    return () => {
      active = false;
      for (const timer of timers) window.clearTimeout(timer);
      if (showerInterval !== null) window.clearInterval(showerInterval);
      resetCelebration?.();
    };
  }, [achievement, onDismiss]);

  if (!achievement) return null;
  return (
    <aside className={`achievement-toast tier-${achievement.tier}`} role="status" aria-live="polite">
      <span className="achievement-toast-icon"><AchievementIcon id={achievement.id} /></span>
      <div>
        <small>成就达成</small>
        <strong>{achievement.title}</strong>
        <p>{achievement.description}</p>
      </div>
      <button type="button" onClick={onDismiss} aria-label="关闭成就通知">
        <X aria-hidden="true" />
      </button>
    </aside>
  );
}
