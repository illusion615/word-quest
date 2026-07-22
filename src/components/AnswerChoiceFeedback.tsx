import type { AnswerChoiceFeedback as ChoiceFeedback } from '../domain/models';

interface AnswerChoiceFeedbackProps {
  choices: ChoiceFeedback[];
}

const STATUS_LABELS: Record<ChoiceFeedback['status'], string> = {
  correct: '选对',
  incorrect: '选错',
  missed: '漏选',
};

export function AnswerChoiceFeedback({ choices }: AnswerChoiceFeedbackProps) {
  return (
    <ul className="answer-choice-feedback" aria-label="选项判定">
      {choices.map((choice, index) => (
        <li className={`is-${choice.status}`} key={`${choice.status}-${choice.text}-${index}`}>
          <strong>{STATUS_LABELS[choice.status]}</strong>
          <span>{choice.text}</span>
        </li>
      ))}
    </ul>
  );
}