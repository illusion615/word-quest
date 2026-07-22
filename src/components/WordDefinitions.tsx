import type {
  DefinitionLanguage,
  WordEntry,
  WordSenseExample,
} from '../domain/models';
import { parseDefinitionSenses, type DefinitionSense } from '../domain/wordText';

interface WordDefinitionsProps {
  word: WordEntry;
  senseExamples?: WordSenseExample[];
  exampleStatus?: SenseListProps['exampleStatus'];
}

interface SenseListProps {
  senses: DefinitionSense[];
  language?: DefinitionLanguage;
  examples?: WordSenseExample[];
  exampleStatus?: 'loading' | 'success' | 'error' | 'unavailable';
}

function exampleStatusLabel(status: SenseListProps['exampleStatus']): string {
  if (status === 'loading') return '正在生成此义项的例句…';
  if (status === 'error') return '例句生成失败，可在 AI 词汇教练中重新生成。';
  if (status === 'unavailable') return '连接 AI 后生成此义项的用法例句。';
  return '此义项暂缺例句。';
}

export function SenseList({
  senses,
  language = 'zh',
  examples = [],
  exampleStatus,
}: SenseListProps) {
  return (
    <ol className="definition-senses">
      {senses.map((sense, index) => {
        const example = examples.find((candidate) => (
          candidate.language === language && candidate.senseIndex === index
        ));
        return (
          <li key={`${sense.label}-${sense.text}-${index}`}>
            <div>
              {sense.label && <span className="sense-label">{sense.label}</span>}
              <span>{sense.text}</span>
            </div>
            {example ? (
              <blockquote className="sense-example">
                <p lang="en">{example.sentence}</p>
                <footer>{example.translation}</footer>
              </blockquote>
            ) : exampleStatus ? (
              <p className={`sense-example-status is-${exampleStatus}`}>
                {exampleStatusLabel(exampleStatus)}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

interface DefinitionColumnProps {
  id: string;
  title: string;
  countLabel: string;
  senses: DefinitionSense[];
  lang?: string;
  language?: DefinitionLanguage;
  examples?: WordSenseExample[];
  exampleStatus?: SenseListProps['exampleStatus'];
}

export function DefinitionColumn({
  id,
  title,
  countLabel,
  senses,
  lang,
  language,
  examples,
  exampleStatus,
}: DefinitionColumnProps) {
  return (
    <section className="definition-section" lang={lang} aria-labelledby={id}>
      <div className="definition-heading">
        <h3 id={id}>{title}</h3>
        <span>{countLabel}</span>
      </div>
      <SenseList
        senses={senses}
        language={language}
        examples={examples}
        exampleStatus={exampleStatus}
      />
    </section>
  );
}

export function WordDefinitions({ word, senseExamples, exampleStatus }: WordDefinitionsProps) {
  const chineseSenses = parseDefinitionSenses(word.definitionZh);
  const englishSenses = parseDefinitionSenses(word.definition);

  return (
    <div className="word-definitions">
      <DefinitionColumn
        id="definition-zh-heading"
        title="中文释义"
        countLabel={`${chineseSenses.length} 个义项`}
        senses={chineseSenses}
        language="zh"
        examples={senseExamples}
        exampleStatus={exampleStatus}
      />

      {englishSenses.length > 0 && (
        <DefinitionColumn
          id="definition-en-heading"
          title="English definitions"
          countLabel={`${englishSenses.length} senses`}
          senses={englishSenses}
          lang="en"
          language="en"
          examples={senseExamples}
          exampleStatus={exampleStatus}
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