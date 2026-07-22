import type { GameMode, SessionResult } from '../domain/models';

interface MistakeReviewProps {
  results: SessionResult[];
}

const MODE_LABELS: Record<GameMode, string> = {
  listening: '听音拼写',
  choice: '释义选择',
  sentence: '语境填空',
  boss: '极限挑战',
  'match-meaning': '识义选择',
  'match-word': '中文辨形',
  'listen-word': '听音辨词',
};

export function MistakeReview({ results }: MistakeReviewProps) {
  const mistakes = results.filter((result) => !result.answer.correct);
  if (mistakes.length === 0) return null;

  return (
    <section className="mistake-review" aria-labelledby="mistake-review-heading">
      <header className="mistake-review-heading">
        <div>
          <p className="eyebrow">本轮复盘</p>
          <h2 id="mistake-review-heading">错题巩固</h2>
        </div>
        <strong>{mistakes.length} 题</strong>
      </header>

      <div className="mistake-review-list">
        {mistakes.map((result, index) => {
          const response = result.answer.response.trim() || '未作答';
          const standardAnswer = result.answer.correctAnswer.trim();
          const showStandardAnswer = standardAnswer
            && standardAnswer !== result.word.definitionZh.trim();

          return (
            <article className="mistake-review-item" key={`${result.word.id}-${index}`}>
              <header>
                <div className="mistake-review-word">
                  <strong>{result.word.word}</strong>
                  {result.word.phonetic && <span>{result.word.phonetic}</span>}
                  {result.word.partOfSpeech && <small>{result.word.partOfSpeech}</small>}
                </div>
                <span className="mistake-mode">{MODE_LABELS[result.mode]}</span>
              </header>

              <div className="mistake-answer-comparison">
                <div className="is-correct">
                  <span>正确释义</span>
                  <p>{result.word.definitionZh}</p>
                  {showStandardAnswer && <small>本题标准答案：{standardAnswer}</small>}
                </div>
                <div className="is-player">
                  <span>你的答案</span>
                  <p>{response}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
