import {describe,expect,it} from 'vitest';
import {escapeHtml,relativeTime,clockTime,dayLabel,codePoints,tokenizeRichText} from '../../src/apps/text';
import {fitWithin} from '../../src/apps/image';

const NOW=new Date(2026,10,4,15,58,0).getTime();
const ago=(ms:number)=>new Date(NOW-ms).toISOString();
describe('escapeHtml',()=>{
 it('escapes markup characters',()=>{expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe('&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');});
});
describe('codePoints',()=>{it('counts emoji as one',()=>{expect(codePoints('😀'.repeat(3)+'a')).toBe(4);});});
describe('tokenizeRichText',()=>{
 it('links http(s) and trims trailing punctuation',()=>{
  expect(tokenizeRichText('see https://a.nz/x?y=1, ok')).toEqual([{type:'text',text:'see '},{type:'link',text:'https://a.nz/x?y=1',href:'https://a.nz/x?y=1'},{type:'text',text:', ok'}]);
  expect(tokenizeRichText('(http://a.nz/b).')[1]).toMatchObject({type:'link',text:'http://a.nz/b'});
 });
 it('never produces a non-http href',()=>{
  for(const text of ['javascript:alert(1)','[x](javascript:alert(1))','data:text/html,x','https://','http://.','JAVASCRIPT:alert(1) https:///x']){
   for(const token of tokenizeRichText(text))if(token.type!=='text')expect(token.href).toMatch(/^(https?:\/\/|#\/social\/)/);
  }
  expect(tokenizeRichText('javascript:alert(1)')).toEqual([{type:'text',text:'javascript:alert(1)'}]);
 });
 it('keeps html as plain text',()=>{const tokens=tokenizeRichText('<img src=x onerror=alert(1)>');expect(tokens).toEqual([{type:'text',text:'<img src=x onerror=alert(1)>'}]);});
 it('finds mentions and tags only at word start',()=>{
  expect(tokenizeRichText('hi @sam_1 and #kiwi!')).toEqual([{type:'text',text:'hi '},{type:'mention',text:'@sam_1',href:'#/social/u/sam_1'},{type:'text',text:' and '},{type:'tag',text:'#kiwi',href:'#/social/search?q=%23kiwi'},{type:'text',text:'!'}]);
  expect(tokenizeRichText('mail a@bcd.com x#tag @ab')).toEqual([{type:'text',text:'mail a@bcd.com x#tag @ab'}]);
  expect(tokenizeRichText('#ōtākou')[0]).toMatchObject({type:'tag',href:'#/social/search?q=%23%C5%8Dt%C4%81kou'});
 });
 it('does not link mentions inside urls',()=>{const tokens=tokenizeRichText('https://x.nz/@sam #a');expect(tokens.map(t=>t.type)).toEqual(['link','text','tag']);});
});
describe('trimming',()=>{
 it('leaves trailing dots and dashes of a mention as text',()=>{
  expect(tokenizeRichText('hi @sam.')).toEqual([{type:'text',text:'hi '},{type:'mention',text:'@sam',href:'#/social/u/sam'},{type:'text',text:'.'}]);
  expect(tokenizeRichText('@sam-- hi')[0]).toMatchObject({type:'mention',text:'@sam'});
  expect(tokenizeRichText('@ab.')).toEqual([{type:'text',text:'@ab.'}]);
 });
 it('keeps balanced parentheses in urls only',()=>{
  expect(tokenizeRichText('https://en.wikipedia.org/wiki/Foo_(bar).')[0]).toMatchObject({text:'https://en.wikipedia.org/wiki/Foo_(bar)'});
  expect(tokenizeRichText('(https://a.nz/b)')[1]).toMatchObject({text:'https://a.nz/b'});
 });
 it('is linear on long punctuation runs',()=>{
  const start=Date.now();tokenizeRichText('https://a'+'.'.repeat(50000)+'x');tokenizeRichText('https://a'+')'.repeat(50000));
  expect(Date.now()-start).toBeLessThan(500);
 });
});
describe('relativeTime',()=>{
 it('uses boundaries',()=>{
  expect(relativeTime(ago(44_000),NOW)).toBe('now');
  expect(relativeTime(ago(45_000),NOW)).toBe('1m');
  expect(relativeTime(ago(12*60_000),NOW)).toBe('12m');
  expect(relativeTime(ago(59*60_000+59_000),NOW)).toBe('59m');
  expect(relativeTime(ago(3600_000),NOW)).toBe('1h');
  expect(relativeTime(ago(23*3600_000),NOW)).toBe('23h');
  expect(relativeTime(ago(24*3600_000),NOW)).toBe('1d');
  expect(relativeTime(ago(6*86400_000),NOW)).toBe('6d');
  expect(relativeTime(ago(-5000),NOW)).toBe('now');
 });
 it('formats older dates with the year only when it differs',()=>{
  expect(relativeTime(new Date(2026,9,20,12).toISOString(),NOW)).toBe('20 Oct');
  expect(relativeTime(new Date(2025,10,4,12).toISOString(),NOW)).toBe('4 Nov 2025');
  expect(relativeTime('nope',NOW)).toBe('');
 });
});
describe('clockTime and dayLabel',()=>{
 it('formats 12-hour time',()=>{
  expect(clockTime(new Date(2026,10,4,15,58).toISOString())).toBe('3:58 pm');
  expect(clockTime(new Date(2026,10,4,0,5).toISOString())).toBe('12:05 am');
  expect(clockTime(new Date(2026,10,4,12,0).toISOString())).toBe('12:00 pm');
 });
 it('labels days',()=>{
  expect(dayLabel(new Date(2026,10,4,1).toISOString(),NOW)).toBe('Today');
  expect(dayLabel(new Date(2026,10,3,23).toISOString(),NOW)).toBe('Yesterday');
  expect(dayLabel(new Date(2026,10,2,9).toISOString(),NOW)).toBe('Mon 2 Nov');
 });
});
describe('fitWithin',()=>{
 it('never upscales and keeps aspect',()=>{
  expect(fitWithin(800,600,1600)).toEqual({width:800,height:600});
  expect(fitWithin(4000,3000,1600)).toEqual({width:1600,height:1200});
  expect(fitWithin(3000,4001,1600)).toEqual({width:1200,height:1600});
  expect(fitWithin(10000,1,1600)).toEqual({width:1600,height:1});
 });
});
