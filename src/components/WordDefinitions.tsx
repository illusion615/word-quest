import type { WordEntry } from '../domain/models';
import { parseDefinitionSenses, type DefinitionSense } from '../domain/wordText';

interface WordDefinitionsProps {
  word: WordEntry;
}

interface SenseListProps {
  senses: DefinitionSense[];
}

export function SenseList({ senses }: SenseListProps) {
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

interface DefinitionColumnProps {
  id: string;
  title: string;
  countLabel: string;
  senses: DefinitionSense[];
  lang?: string;
}

export function DefinitionColumn({ id, title, countLabel, senses, lang }: DefinitionColumnProps) {
  return (
    <section className="definition-section" lang={lang} aria-labelledby={id}>
      <div className="definition-heading">
        <h3 id={id}>{title}</h3>
        <span>{countLabel}</span>
      </div>
      <SenseList senses={senses} />
    </section>
  );
}

export function WordDefinitions({ word }: WordDefinitionsProps) {
  const chineseSenses = parseDefinitionSenses(word.definitionZh);
  const englishSenses = parseDefinitionSenses(word.definition);

  return (
    <div className="word-definitions">
      <DefinitionColumn
        id="definition-zh-heading"
        title="中文释义"
        countLabel={`${chineseSenses.length} 个义项`}
        senses={chineseSenses}
      />

      {englishSenses.length > 0 && (
        <DefinitionColumn
          id="definition-en-heading"
          title="English definitions"
          countLabel={`${englishSenses.length} senses`}
          senses={englishSenses}
          lang="en"
        />
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