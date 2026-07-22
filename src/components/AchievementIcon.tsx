import type { ComponentType, SVGProps } from 'react';
import type { AchievementId } from '../domain/achievements';
import {
  BookOpenCheck,
  CalendarCheck,
  Crown,
  Flame,
  Star,
  Swords,
  Target,
  Trophy,
} from '../icons';

const ICONS: Record<AchievementId, ComponentType<SVGProps<SVGSVGElement>>> = {
  'first-victory': Swords,
  'three-stars': Star,
  'combo-five': Flame,
  'boss-breaker': Crown,
  'ten-levels': Target,
  'hundred-words': BookOpenCheck,
  'three-day-streak': CalendarCheck,
  'word-king': Trophy,
};

export function AchievementIcon({ id }: { id: AchievementId }) {
  const Icon = ICONS[id];
  return <Icon aria-hidden="true" />;
}
