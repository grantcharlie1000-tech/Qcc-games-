import {it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import {parseCatalog} from '../../src/movies/model';
it('ships a complete same-origin catalog with no approved playback by default',()=>{
 const raw=JSON.parse(readFileSync('public/movies/catalog.json','utf8'));const catalog=parseCatalog(raw);
 expect(catalog.titles).toHaveLength(raw.titles.length);expect(catalog.titles.length).toBeGreaterThanOrEqual(6);
 for(const title of catalog.titles){expect(readFileSync('public/'+title.poster).length).toBeGreaterThan(0);}
 expect(catalog.titles.some(t=>t.seasons.some(s=>s.episodes.length>1))).toBe(true);
 expect(JSON.parse(readFileSync('public/movies/licenses.json','utf8'))).toEqual([]);
});
it('has no runtime provider integration, tracking, frames, DNS hints or proxy endpoint',()=>{
 const code=readdirSync('src/movies').filter(p=>/\.(ts|css)$/.test(p)).map(p=>readFileSync('src/movies/'+p,'utf8')).join('\n');
 expect(code).not.toMatch(/framextv|https?:\/\/|<iframe|sendBeacon|WebSocket|RTCPeerConnection|dns-prefetch|preconnect|postMessage/i);
 expect(readFileSync('public/sw.js','utf8')).toContain("url.pathname.startsWith(new URL('movies/',SCOPE).pathname)");
 expect(readFileSync('scripts/offline-manifest.mjs','utf8')).toContain("path!=='dist/movies'");
});
it('restricts media, frames and scripts on both static and Netlify hosts',()=>{
 for(const path of ['index.html','netlify.toml']){
  const text=readFileSync(path,'utf8');
  for(const policy of ["media-src 'self'","frame-src 'none'","script-src 'self'","object-src 'none'"])expect(text).toContain(policy);
  expect(text).not.toMatch(/framextv|unsafe-eval/);
 }
});
