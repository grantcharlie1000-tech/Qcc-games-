import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import {applyFestiveTheme,christmas,FESTIVE_KEY,setFestiveTheme,storedFestiveTheme} from '../../src/festive/festive';
import {hash,mix} from '../../src/festive/art';

let storage:Map<string,string>;
beforeEach(()=>{
  storage=new Map();
  vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>void storage.set(k,v),removeItem:(k:string)=>void storage.delete(k)});
  vi.stubGlobal('location',{search:''});
  vi.stubGlobal('document',{documentElement:{dataset:{} as Record<string,string>}});
});
afterEach(()=>vi.unstubAllGlobals());

test('Christmas is the default and the switch is stored outside the synced save namespace',()=>{
  expect(storedFestiveTheme()).toBe('christmas');
  applyFestiveTheme();expect(christmas()).toBe(true);
  setFestiveTheme('off');
  expect(storage.get(FESTIVE_KEY)).toBe('off');expect(FESTIVE_KEY.startsWith('pocket-arcade:')).toBe(false);
  expect(christmas()).toBe(false);expect(storedFestiveTheme()).toBe('off');
  setFestiveTheme('christmas');expect(storage.has(FESTIVE_KEY)).toBe(false);expect(christmas()).toBe(true);
});

test('a URL parameter overrides the stored choice, and blocked storage keeps the default',()=>{
  storage.set(FESTIVE_KEY,'off');vi.stubGlobal('location',{search:'?festive=christmas'});expect(storedFestiveTheme()).toBe('christmas');
  vi.stubGlobal('location',{search:'?festive=off'});storage.clear();expect(storedFestiveTheme()).toBe('off');
  vi.stubGlobal('location',{search:''});vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('blocked');}});expect(storedFestiveTheme()).toBe('christmas');
});

test('without a document (unit tests, workers) games see the original theme',()=>{
  vi.stubGlobal('document',undefined);expect(christmas()).toBe(false);
  vi.stubGlobal('document',{createElement:()=>({})});expect(christmas()).toBe(false);
});

test('decoration helpers are deterministic',()=>{
  expect(mix('#000000','#ffffff',0.5)).toBe('#808080');expect(mix('#d8263a','#d8263a',0.3)).toBe('#d8263a');
  expect(hash(7)).toBe(hash(7));expect(hash(7)).toBeGreaterThanOrEqual(0);expect(hash(7)).toBeLessThan(1);
});

test('every Christmas CSS override is scoped to the festive attribute, so turning it off restores the original',()=>{
  const files=['src/festive/christmas.css',...readdirSync('src/games',{recursive:true,encoding:'utf8'}).filter(f=>f.endsWith('christmas.css')).map(f=>'src/games/'+f)];
  for(const file of files){
    const css=readFileSync(file,'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
    // Top-level selectors (outside @keyframes) must carry the festive scope.
    const body=css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g,'');
    for(const match of body.matchAll(/(^|})\s*([^{}@]+)\{/g)){
      const selector=match[2]!.trim();if(!selector)continue;
      // Split on top-level commas only, so :is(a,b) and :not(a,b) stay inside their selector.
      const parts:string[]=[];let depth=0,current='';
      for(const ch of selector){if(ch==='('||ch==='[')depth++;if(ch===')'||ch===']')depth--;if(ch===','&&depth===0){parts.push(current);current='';}else current+=ch;}
      parts.push(current);
      for(const part of parts)expect(part.trim(),`${file}: ${part}`).toMatch(/^:root\[data-festive="christmas"\]|^:root:not\(\[data-festive="christmas"\]\)/);
    }
  }
});

test('Crossy Road, Blockcraft and Quad Clash do not use the shared festive layer',()=>{
  for(const id of ['crossy-road','blockcraft','quad-clash']){
    const files=readdirSync(`src/games/${id}`,{recursive:true,encoding:'utf8'}).filter(f=>/\.(ts|css)$/.test(f));
    for(const f of files){const text=readFileSync(`src/games/${id}/${f}`,'utf8');expect(text,`${id}/${f}`).not.toMatch(/festive|christmas\.css/);}
  }
});
