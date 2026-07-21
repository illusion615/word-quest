interface CoverageRingsProps {
  learningPercentage: number;
  masteryPercentage: number;
  label: string;
}

export function CoverageRings({
  learningPercentage,
  masteryPercentage,
  label,
}: CoverageRingsProps) {
  return (
    <div className="coverage-rings" aria-label={`${label}：学习覆盖 ${learningPercentage}%，稳定掌握 ${masteryPercentage}%`}>
      <svg viewBox="0 0 72 72" role="img" aria-hidden="true">
        <circle className="ring-track" cx="36" cy="36" r="29" />
        <circle
          className="ring-value ring-learning"
          cx="36"
          cy="36"
          r="29"
          pathLength="100"
          strokeDasharray={`${learningPercentage} 100`}
        />
        <circle className="ring-track" cx="36" cy="36" r="21" />
        <circle
          className="ring-value ring-mastery"
          cx="36"
          cy="36"
          r="21"
          pathLength="100"
          strokeDasharray={`${masteryPercentage} 100`}
        />
      </svg>
      <div className="coverage-rings-center">
        <strong>{learningPercentage}%</strong>
        <span>学习</span>
      </div>
    </div>
  );
}