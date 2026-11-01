// Run after npm run build. Count the first game load once, including shared JS/CSS dependencies and all five runtime GLBs.
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
const manifest=JSON.parse(readFileSync('dist/.vite/manifest.json','utf8'));
const root='src/games/strongroom/index.ts',seen=new Set(),files=new Set();
function visit(id){if(seen.has(id))return;seen.add(id);const entry=manifest[id];if(!entry)throw new Error(`Missing manifest entry: ${id}`);files.add(entry.file);for(const css of entry.css??[])files.add(css);for(const dep of entry.imports??[])visit(dep);}
visit(root);let code=0,models=0;
for(const file of files)code+=gzipSync(readFileSync('dist/'+file)).length;
for(const file of ['soldier_ct','soldier_t','viewmodels/m4a1','viewmodels/usp','viewmodels/npc-arms-ct'])models+=gzipSync(readFileSync(`dist/game-assets/strongroom/models/${file}.glb`)).length;
console.log(`Strongroom first load: JS/CSS ${code} B gzip (limit 900000); models ${models} B gzip (limit 900000); total ${code+models} B gzip (limit 2000000).`);
if(code>900000||models>900000||code+models>2000000)process.exitCode=1;
