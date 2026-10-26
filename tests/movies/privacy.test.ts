import {it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
// @ts-expect-error Node-only verification helper has no browser declaration.
import {isLibraryMovieArtwork} from '../../scripts/movies-network-policy.mjs';
import {parseCatalog,imageAsset} from '../../src/movies/model';
it('ships real TMDB artwork rather than generated substitutes',()=>{
 const raw=JSON.parse(readFileSync('public/movies/catalog.json','utf8'));const catalog=parseCatalog(raw);
 expect(catalog.titles).toHaveLength(raw.titles.length);expect(catalog.titles.length).toBeGreaterThanOrEqual(6);
 for(const title of catalog.titles)expect(imageAsset(title.poster)).toMatch(/^https:\/\/image\.tmdb\.org\//);
 expect(catalog.titles.some(t=>t.seasons.some(s=>s.episodes.length>1))).toBe(true);
 expect(JSON.parse(readFileSync('public/movies/licenses.json','utf8'))).toEqual([]);
 expect(readdirSync('public/movies/art').filter(name=>!name.startsWith('.'))).toEqual([]);
});
it('adds no tracking, extraction, proxy endpoint or parent-page provider script',()=>{
 const code=readdirSync('src/movies').filter(p=>/\.(ts|css)$/.test(p)).map(p=>readFileSync('src/movies/'+p,'utf8')).join('\n');
 expect(code).not.toMatch(/sendBeacon|WebSocket|RTCPeerConnection|dns-prefetch|preconnect|<script|eval\(/i);
 expect(readFileSync('public/sw.js','utf8')).toContain("url.pathname.startsWith(new URL('movies/',SCOPE).pathname)");
 expect(readFileSync('public/sw.js','utf8')).toContain("url.pathname===new URL('api/movies',SCOPE).pathname");
 expect(readFileSync('scripts/offline-manifest.mjs','utf8')).toContain("path!=='dist/movies'");
});
it('permits only approved image/frame origins and narrowly scopes the offline thumbnail exception',()=>{
 expect(isLibraryMovieArtwork('https://image.tmdb.org/t/p/w185/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg')).toBe(true);
 for(const url of ['https://framextv.xyz/embed/1','https://image.tmdb.org/t/p/w500/a.jpg','https://image.tmdb.org/t/p/w185/a.jpg?track=1','https://image.tmdb.org.evil.test/t/p/w185/a.jpg'])expect(isLibraryMovieArtwork(url)).toBe(false);
 const html=readFileSync('index.html','utf8');expect(html).not.toContain('Content-Security-Policy');
 for(const path of ['netlify.toml','vite.config.ts','public/_headers']){
  const text=readFileSync(path,'utf8');
  for(const policy of ["media-src 'self'","frame-src https://framextv.xyz https://framextv.cc","script-src 'self'","object-src 'none'","https://image.tmdb.org"])expect(text).toContain(policy);
  expect(text).not.toContain('unsafe-eval');
 }
});
