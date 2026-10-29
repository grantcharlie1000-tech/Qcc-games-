import {afterEach,describe,expect,it,vi} from 'vitest';
import {studyArticles} from '../../src/study/articles';
import {studyTopics} from '../../src/study/topics';
import {renderVariant} from '../../src/study/variant-view';
import {fictionalAds,selectFictionalAd,renderFictionalAd} from '../../src/study/fictional-ads';
import {existsSync,statSync} from 'node:fs';

afterEach(()=>vi.unstubAllGlobals());
it('serves 50 distinct generated creatives with all five formats from local lightweight assets',()=>{
  expect(fictionalAds).toHaveLength(50);
  expect(new Set(fictionalAds.map(a=>a.file)).size).toBe(50);
  for(const format of ['banner','square','portrait','tall','landscape'])expect(fictionalAds.filter(a=>a.format===format)).toHaveLength(10);
  let bytes=0;
  for(const ad of fictionalAds){const path=`public/study/fictional-ads/${ad.file}`;expect(existsSync(path)).toBe(true);bytes+=statSync(path).size;expect(ad.width).toBeGreaterThan(0);expect(ad.height).toBeGreaterThan(0);}
  expect(bytes).toBeLessThan(6_000_000);
});
it('uses stable article-local selections and distinct slots without consulting user storage',()=>{
  vi.stubGlobal('window',new Proxy({},{get(){throw Error('No user storage or browser state permitted');}}));
  expect(selectFictionalAd('forces',0,'banner')).toEqual(selectFictionalAd('forces',0,'banner'));
  expect(new Set(Array.from({length:10},(_,i)=>selectFictionalAd('forces',i,'banner').id)).size).toBe(10);
  const rendered=renderFictionalAd('forces',0,'banner');
  expect(rendered).toContain('width="');expect(rendered).toContain('height="');
  expect(rendered).not.toMatch(/<a\b|<button\b|https?:|onclick|iframe|script/);
});
describe('fictional adverts in article variants',()=>{
  for(const style of ['quanta','aeon','essay']) it(`${style} includes labelled local image ads without external ad scripts`,()=>{
    vi.stubGlobal('window',{location:{hash:'#/'}});
    const article=studyArticles.find(a=>a.style===style)!;
    const topic=studyTopics.find(t=>t.id===article.topicId)!;
    const markup=renderVariant(article,topic,'');
    expect((markup.match(/class="fictional-ad /g)||[]).length).toBeGreaterThanOrEqual(5);
    expect(markup).toContain('Fictional advertisement');
    expect(markup).toContain('loading="lazy"');
    expect(markup).not.toMatch(/<iframe|<script/i);
  });
});
