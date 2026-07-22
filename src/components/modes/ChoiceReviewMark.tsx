import { CheckCircle2 } from '../../icons';

export type ChoiceReviewState =
  | 'selected-correct'
  | 'selected-wrong'
  | 'correct-answer';

export function resolveChoiceReviewState(
  correct: boolean,
  selected: boolean,
  reviewed: boolean,
): ChoiceReviewState | null {
  if (!reviewed) return null;
  if (correct && selected) return 'selected-correct';
  if (!correct && selected) return 'selected-wrong';
  if (correct) return 'correct-answer';
  return null;
}

export function ChoiceReviewMark({ state }: { state: ChoiceReviewState | null }) {
  if (state !== 'selected-correct' && state !== 'correct-answer') return null;
  return (
    <span className="choice-verdict" aria-label="正确答案" title="正确答案">
      <CheckCircle2 aria-hidden="true" />
    </span>
  );
}