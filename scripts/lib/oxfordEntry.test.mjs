import { describe, expect, it } from 'vitest';
import {
  aliasOxfordResult,
  parseOxfordEntry,
  parseOxfordRecord,
  parseOxfordRecords,
  projectOxfordResult,
  serializeOxfordSenses,
} from './oxfordEntry.mjs';

describe('Oxford bilingual entry parser', () => {
  it('creates one stable sense for a possessive determiner', () => {
    const parsed = parseOxfordEntry('its', 'its | BrE ɪts, AmE ɪts | determiner ① (of thing, animal) 它的 tā de▸ turn the camera on its side 把相机侧过来');

    expect(parsed?.pronunciation).toBe('BrE ɪts, AmE ɪts');
    expect(parsed?.senses).toHaveLength(1);
    expect(parsed?.senses[0]).toMatchObject({
      partOfSpeech: 'determiner',
      label: 'det.',
      definitionZh: '它的',
      examples: [{ sentence: 'turn the camera on its side', translation: '把相机侧过来' }],
    });
    expect(parsed?.senses[0].id).toMatch(/^its:[a-f0-9]{12}$/);
  });

  it('keeps numbered Oxford meanings as independent sense records', () => {
    const parsed = parseOxfordEntry('accept', 'accept | BrE əkˈsɛpt, AmE əkˈsɛpt | transitive verb ① (take, receive) 接受 jiēshòu ② (take as suitable) 采用 cǎiyòng ③ (recognize as true) 相信 xiāngxìn');

    expect(parsed?.senses.map((sense) => sense.definitionZh)).toEqual(['接受', '采用', '相信']);
    expect(new Set(parsed?.senses.map((sense) => sense.id)).size).toBe(3);
    expect(serializeOxfordSenses(parsed)).toBe('vt. 接受；vt. 采用；vt. 相信');
  });

  it('separates parts of speech and excludes phrase sections without Chinese meanings', () => {
    const parsed = parseOxfordEntry('well', 'well | BrE wɛl, AmE wɛl | adverb ① 好地 hǎo de ② 充分地 chōngfèn de adjective ① 健康的 jiànkāng de noun 井 jǐng');

    expect(parsed?.groups.map((group) => group.partOfSpeech)).toEqual(['adverb', 'adjective', 'noun']);
    expect(parsed?.senses.map((sense) => sense.definitionZh)).toEqual(['好地', '充分地', '健康的', '井']);
  });

  it('keeps sense IDs stable when Oxford reorders senses', () => {
    const first = parseOxfordEntry('sample', 'sample | BrE sɑːmpəl | noun ① 样品 yàngpǐn ② 例子 lìzi');
    const reordered = parseOxfordEntry('sample', 'sample | BrE sɑːmpəl | noun ① 例子 lìzi ② 样品 yàngpǐn');

    expect(new Set(first?.senses.map((sense) => sense.id)))
      .toEqual(new Set(reordered?.senses.map((sense) => sense.id)));
  });

  it('parses main XML senses and examples without mixing in phrasal verbs', () => {
    const record = {
      sourceId: 'e_accept',
      headword: 'accept',
      html: `<?xml version="1.0"?><html xmlns:d="dictionary"><body>
        <d:entry id="e_accept" d:title="accept">
          <span class="hwg"><span class="prx" dialect="BrE"><span class="ph">əkˈsɛpt</span></span></span>
          <span class="gramb" lexid="g1"><span class="ps">transitive verb</span>
            <span class="semb" lexid="s1"><span class="trg"><span class="ind">(take, receive)</span><span d:def="1" class="trans">接受</span></span>
              <span class="exg"><span class="ex">to accept an offer</span><span class="trg"><span class="trans">接受提议</span></span></span>
            </span>
            <span class="semb" lexid="s2"><span class="trgg">
              <span class="trg"><span class="reg">formal</span><span d:def="1" class="trans">相信</span></span>
              <span class="trg"><span class="ind">(take on)</span><span class="trans">聘用</span></span>
            </span></span>
          </span>
          <span class="pvsec" id="p1"><span class="pvg"><span class="pv">accept of</span></span>
            <span class="gramb" lexid="pg1"><span class="ps">phrasal verb</span><span class="semb" lexid="ps1"><span class="trg"><span d:def="1" class="trans">允许</span></span></span></span>
          </span>
        </d:entry></body></html>`,
    };

    const parsed = parseOxfordRecord(record);

    expect(parsed?.pronunciations).toEqual({ british: ['əkˈsɛpt'] });
    expect(parsed?.senses.map((sense) => sense.definitionZh)).toEqual(['接受', '相信', '聘用']);
    expect(parsed?.senses[0].examples[0]).toMatchObject({
      english: 'to accept an offer',
      chinese: '接受提议',
    });
    expect(parsed?.senses[1].labels.register).toEqual(['formal']);
    expect(parsed?.senses[2]).toMatchObject({
      definitionZh: '聘用',
      glossesEn: ['take on'],
      source: { senseId: 's2', subsenseId: 's2:1', subsenseIndex: 1 },
    });
    expect(parsed?.phrases[0].phrase).toBe('accept of');
    expect(parsed?.phrases[0].senses[0].definitionZh).toBe('允许');
  });

  it('selects exact English titles and preserves homographs', () => {
    const xml = (sourceId, title, definition) => ({
      sourceId,
      headword: title,
      html: `<html xmlns:d="dictionary"><body><d:entry id="${sourceId}" d:title="${title}"><span class="gramb"><span class="ps">noun</span><span class="semb" lexid="${sourceId}:s1"><span class="trg"><span d:def="1" class="trans">${definition}</span></span></span></span></d:entry></body></html>`,
    });
    const parsed = parseOxfordRecords('may', [
      xml('e_month', 'May', '五月'),
      xml('e_plant', 'may', '山楂花'),
      xml('e_alias', 'maybe', '也许'),
    ]);

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.senses.map((sense) => sense.definitionZh)).toEqual(['山楂花']);

    const proper = parseOxfordRecords('May', [
      xml('e_month', 'May', '五月'),
      xml('e_plant', 'may', '山楂花'),
    ]);
    expect(proper.senses.map((sense) => sense.definitionZh)).toEqual(['五月']);
  });

  it('projects explicit variants and phrase-form grammar groups', () => {
    const variant = {
      sourceId: 'e_afterwards',
      headword: 'afterward',
      html: `<html xmlns:d="dictionary"><body><d:entry id="e_afterwards" d:title="afterwards">
        <span class="hwg"><span class="hw">afterwards</span><span class="hvg"><span class="hv">afterward</span></span></span>
        <span class="gramb" lexid="g1"><span class="ps">adverb</span><span class="semb" lexid="s1"><span class="trg"><span d:def="1" class="trans">以后</span></span></span></span>
      </d:entry></body></html>`,
    };
    const phrase = {
      sourceId: 'e_according',
      headword: 'according',
      html: `<html xmlns:d="dictionary"><body><d:entry id="e_according" d:title="according">
        <span class="hwg"><span class="hw">according</span></span>
        <span class="gramb" lexid="g1"><span class="frmg"><span class="frm">according to</span></span><span class="ps">preposition phrase</span><span class="semb" lexid="s1"><span class="trg"><span d:def="1" class="trans">根据</span></span></span></span>
        <span class="gramb" lexid="g2"><span class="frmg"><span class="frm">according as</span></span><span class="ps">conjunction phrase</span><span class="semb" lexid="s2"><span class="trg"><span d:def="1" class="trans">取决于</span></span></span></span>
      </d:entry></body></html>`,
    };

    const alias = parseOxfordRecords('afterward', [variant]);
    expect(alias.entries[0]).toMatchObject({ word: 'afterward', sourceWord: 'afterwards' });
    expect(alias.senses[0].id).toMatch(/^afterward:o:/);

    const projectedPhrase = parseOxfordRecords('according to', [phrase]);
    expect(projectedPhrase.senses.map((sense) => sense.definitionZh)).toEqual(['根据']);
    expect(projectedPhrase.entries[0].groups[0]).toMatchObject({
      form: 'according to',
      partOfSpeech: 'preposition phrase',
    });

    const redirected = aliasOxfordResult('are', parseOxfordRecords('afterwards', [variant]));
    expect(redirected.word).toBe('are');
    expect(redirected.senses[0].id).toMatch(/^are:o:/);
  });

  it('uses Chinese usage glosses instead of example translations for grammatical senses', () => {
    const record = {
      sourceId: 'e_the',
      headword: 'the',
      html: `<html xmlns:d="dictionary"><body><d:entry id="e_the" d:title="the">
        <span class="gramb" lexid="g1"><span class="ps">definite article</span>
          <span class="semb" lexid="s1"><span class="exg"><span class="x_xdh"><span class="ind">(with family name)</span><span class="ex">the Hapsburgs</span></span>
            <span class="trg"><span class="gl">[用于姓氏前]</span><span d:def="1" class="trans">哈布斯堡一家</span></span>
          </span></span>
        </span>
      </d:entry></body></html>`,
    };

    const parsed = parseOxfordRecords('the', [record]);

    expect(parsed.senses).toHaveLength(1);
    expect(parsed.senses[0].definitionZh).toBe('用于姓氏前');
    expect(parsed.senses[0].examples).toEqual([{
      english: 'the Hapsburgs',
      chinese: '哈布斯堡一家',
      translations: [{ chinese: '哈布斯堡一家' }],
    }]);
  });

  it('uses inline Chinese glosses and targets structured references', () => {
    const referenceRecord = {
      sourceId: 'e_onto',
      headword: 'onto',
      html: `<html xmlns:d="dictionary"><body><d:entry id="e_onto" d:title="onto">
        <span class="gramb" lexid="g1"><span class="ps">preposition</span><span class="semb" lexid="s1"><span class="trg"><span class="gl">[on的更正式用法]</span></span><span d:def="1" class="xrg"><span class="xr"><a title="on">on<span class="xrlabelGroup"><span class="xrlabel"> D</span><span class="xrlabel">2</span></span></a></span></span></span></span>
      </d:entry></body></html>`,
    };
    const parsedReference = parseOxfordRecords('onto', [referenceRecord]);
    expect(parsedReference.senses[0].definitionZh).toBe('on的更正式用法');
    expect(parsedReference.references).toEqual([{ word: 'on', section: 'D', sense: 2 }]);

    const targetRecord = {
      sourceId: 'e_can',
      headword: 'can',
      html: `<html xmlns:d="dictionary"><body><d:entry id="e_can" d:title="can"><span class="hw" hm="1">can</span><span class="gramb" lexid="g1"><span class="ps">modal verb</span><span class="semb" lexid="s1"><span class="trg"><span d:def="1" class="trans">可以</span></span></span></span></d:entry></body></html>`,
    };
    const target = parseOxfordRecords('can', [targetRecord]);
    const projected = projectOxfordResult('could', target, { homograph: '1' });
    expect(projected.senses[0]).toMatchObject({ definitionZh: '可以' });
    expect(projected.senses[0].id).toMatch(/^could:o:/);
  });
});