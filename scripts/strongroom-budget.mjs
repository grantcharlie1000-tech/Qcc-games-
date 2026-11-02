// Run after npm run build. Count shared JS/CSS and the worst-case potato first load, including both weapon LODs.
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
const manifest=JSON.parse(readFileSync('dist/.vite/manifest.json','utf8'));
const root='src/games/strongroom/index.ts',seen=new Set(),files=new Set(),staticFiles=new Set(['game-art/strongroom/cover.svg','icon.svg','game-assets/strongroom/fonts/BarlowCondensed-Bold.ttf','game-assets/strongroom/fonts/BarlowCondensed-SemiBold.ttf']);
function visit(id){if(seen.has(id))return;seen.add(id);const entry=manifest[id];if(!entry)throw new Error(`Missing manifest entry: ${id}`);files.add(entry.file);for(const css of entry.css??[])files.add(css);for(const asset of entry.assets??[])staticFiles.add(asset);for(const dep of entry.imports??[])visit(dep);}
visit(root);let code=0,models=0,other=0;
for(const file of files)code+=gzipSync(readFileSync('dist/'+file)).length;
const weapons=['ak47','m4a1','mp5','smg','awp','glock','usp','deagle'];
for(const file of ['soldier_ct','soldier_t','viewmodels/arms_attack','viewmodels/arms_defend',...weapons.flatMap(id=>[`weapons/${id}-held`,`weapons/${id}-low`])])models+=gzipSync(readFileSync(`dist/game-assets/strongroom/models/${file}.glb`)).length;
for(const file of staticFiles)other+=gzipSync(readFileSync('dist/'+file)).length;
console.log(`Strongroom first load: JS/CSS ${code} B gzip (limit 900000); models ${models} B gzip (limit 900000); font/icon/cover ${other} B gzip; total ${code+models+other} B gzip (limit 2000000).`);
if(code>900000||models>900000||code+models+other>2000000)process.exitCode=1;
