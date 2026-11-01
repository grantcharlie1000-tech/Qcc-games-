import {afterEach,expect,it,vi} from 'vitest';
import {existsSync} from 'node:fs';
import {studyArticles} from '../../src/study/articles';
import {studyTopics} from '../../src/study/topics';
import {readingNotes} from '../../src/study/editorial';
import {renderVariant} from '../../src/study/variant-view';

const clutter=/\bfictional\b|\bdemo\b|sponsored|sponsor block|advertisement|invented (?:example|scene|passage|story|fragment)|Ari Rowan|Mina Vale|Leo Finch|Nell Moss/i;
afterEach(()=>vi.unstubAllGlobals());

it('removes the fake advertising and contributor asset pipelines',()=>{
  for(const path of ['src/study/fictional-ads.ts','src/study/fictional-ads.css','src/study/fictional-ads-manifest.json','public/study/fictional-ads','public/study/contributors'])expect(existsSync(path),path).toBe(false);
});

it.each(studyTopics)('$id has substantive study content without fiction or disclaimer labels',topic=>{
  const content=[topic.title,topic.subtitle,topic.objective,...topic.sections.flatMap(section=>[section.heading,...section.paragraphs]),...readingNotes[topic.id],topic.example.title,topic.example.question,...topic.example.steps,topic.example.result,topic.check.question,topic.check.answer].join(' ');
  expect(content).not.toMatch(clutter);
  expect([topic.title,...topic.sections.map(section=>section.heading),topic.example.title].join(' ')).not.toMatch(/\b(?:example|demo|ad)\b/i);
});

it.each(studyArticles.filter(article=>article.style!=='qcc'))('$id renders a neutral, sectioned reference article without ads or fake identity',article=>{
  vi.stubGlobal('window',{location:{hash:'#/'}});
  const topic=studyTopics.find(topic=>topic.id===article.topicId)!;
  const markup=renderVariant(article,topic,'');
  expect(markup).not.toMatch(clutter);
  expect(markup).not.toMatch(/fictional-ad|ad-rail|inline-ad|<iframe|<script|contributors\//i);
  expect(markup).toContain('Mauri Study Notes');
  expect(markup).toMatch(/<article\b[^>]*aria-labelledby="study-title"/);
  expect((markup.match(/class="variant-text-section"/g)??[])).toHaveLength(3);
  for(const paragraph of article.paragraphs)expect(markup).toContain(paragraph.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)));
});
