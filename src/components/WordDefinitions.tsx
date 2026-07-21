import type { WordEntry } from '../domain/models';
import { parseDefinitionSenses, type DefinitionSense } from '../domain/wordText';

interface WordDefinitionsProps {
  word: WordEntry;
}

interface SenseListProps {
  senses: DefinitionSense[];
}

function SenseList({ senses }: SenseListProps) {
  return (
    <ol className="definition-senses">
      {senses.map((sense, index) => (
        <li key={`${sense.label}-${sense.text}-${index}`}>
          <div>
            {sense.label && <span className="sense-label">{sense.label}</span>}
            <span>{sense.text}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function WordDefinitions({ word }: WordDefinitionsProps) {
  const chineseSenses = parseDefinitionSenses(word.definitionZh);
  const englishSenses = parseDefinitionSenses(word.definition);

  return (
    <div className="word-definitions">
      <section className="definition-section" aria-labelledby="definition-zh-heading">
        <div className="definition-heading">
          <h3 id="definition-zh-heading">中文释义</h3>
          <span>{chineseSenses.length} 个义项</span>
        </div>
        <SenseList senses={chineseSenses} />
      </section>

      {englishSenses.length > 0 && (
        <section className="definition-section" lang="en" aria-labelledby="definition-en-heading">
          <div className="definition-heading">
            <h3 id="definition-en-heading">English definitions</h3>
            <span>{englishSenses.length} senses</span>
          </div>
          <SenseList senses={englishSenses} />
        </section>
      )}

      {word.example && (
        <section className="word-example" aria-labelledby="word-example-heading">
          <div className="definition-heading">
            <h3 id="word-example-heading">例句</h3>
          </div>
          <blockquote>
            <p lang="en">{word.example}</p>
            {word.exampleZh && <footer>{word.exampleZh}</footer>}
          </blockquote>
        </section>
      )}
    </div>
  );
}

export default WordDefinitions;