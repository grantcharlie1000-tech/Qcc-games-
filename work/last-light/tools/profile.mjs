// Usage: node work/last-light/tools/profile.mjs <stage>  — prints each sector's first id, x and the y of every landing in it.
import {build} from 'esbuild';import {fileURLToPath} from 'node:url';
const root=new URL('../../../',import.meta.url),out=new URL('work/last-light/journey-recording/profile.mjs',root);
await build({stdin:{contents:"export * from './src/games/last-light/levels.ts';",resolveDir:fileURLToPath(root)},bundle:true,platform:'node',format:'esm',outfile:fileURLToPath(out),logLevel:'error'});
const {LEVELS}=await import(out.href+'?'+Date.now());const l=LEVELS[+process.argv[2]];
const secs=l.sectors;for(let i=0;i<secs.length;i++){const a=secs[i].platform,b=(secs[i+1]?.platform??l.mainCount)-1;console.log(`${String(a).padStart(3)} x${String(l.platforms[a].x).padStart(6)} ${secs[i].name.padEnd(24)} ${l.platforms.slice(a,b+1).map(p=>p.y+(p.kind==='moving'?'~':p.kind==='grate'?'g':p.kind==='crumble'?'c':'')).join(' ')}`);}
console.log('min y',Math.min(...l.platforms.map(p=>p.y)),'max y',Math.max(...l.platforms.map(p=>p.y)),'width',l.width,'height',l.height,'main',l.mainCount);
