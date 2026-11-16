// Build a small shell plus opt-in, per-game offline packs from Vite's real output.
import {createHash} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const directory='dist';
const vite=JSON.parse(await readFile(join(directory,'.vite/manifest.json'),'utf8'));
const idsSource=await readFile('src/core/types.ts','utf8');
const gameIds=[...idsSource.split('as const')[0].matchAll(/'([a-z][a-z0-9-]+)'/g)].map(match=>match[1]);
if(gameIds.length<20||new Set(gameIds).size!==gameIds.length)throw new Error('Unable to read the complete game catalogue');

const allFiles=[];
async function walk(path=''){
 for(const item of await readdir(join(directory,path),{withFileTypes:true})){
  const relative=[path,item.name].filter(Boolean).join('/');
  if(relative==='.vite'||relative==='movies'||relative==='offline-packs.json'||relative==='offline-sw.js')continue;
  if(item.isDirectory())await walk(relative);
  else if(item.isFile()&&!item.name.endsWith('.map')&&!item.name.startsWith('.'))allFiles.push(relative);
 }
}
await walk();
allFiles.sort();
const known=new Set(allFiles);
const contents=new Map();
const shell=new Set(['./','icon.svg','manifest.webmanifest','offline-packs.json']);
function addGraph(key,files,includeDynamic=false,visited=new Set()){
 if(visited.has(key))return;
 visited.add(key);
 const entry=vite[key];
 if(!entry)throw new Error('Missing built Vite module: '+key+'; available game keys: '+Object.keys(vite).filter(x=>x.includes('game')||x.includes('index.ts')).slice(0,50).join(' | '));
 for(const name of [entry.file,...(entry.css||[]),...(entry.assets||[])].filter(Boolean)){
  if(!known.has(name))throw new Error('Missing emitted file: '+name);
  files.add(name);
 }
 for(const key of entry.imports||[])addGraph(key,files,includeDynamic,visited);
 if(includeDynamic)for(const key of entry.dynamicImports||[])addGraph(key,files,true,visited);
}
addGraph('index.html',shell);
for(const file of allFiles)if(/^assets\/.*\.(?:woff2?|ttf|otf)$/.test(file))shell.add(file);
const games={};
for(const id of gameIds){
 const pack=new Set();
 const gameEntry='src/games/'+id+'/index.ts';
 if(vite[gameEntry])addGraph(gameEntry,pack,true);
 else{
  // Rollup can inline a dynamic game entry into a shared chunk. In that case
  // the manifest has no source-keyed entry. Include every emitted JS/CSS file
  // for this one pack rather than silently producing a broken offline game.
  for(const file of allFiles)if(/^assets\/.*\.(?:m?js|css)$/.test(file))pack.add(file);
 }
 for(const file of allFiles){
  if(file.startsWith('game-art/'+id+'/')||file.startsWith('audio/'+id+'/')||(id==='chess'&&file.startsWith('chess-engines/')))
   pack.add(file);
 }
 const files=[...pack].sort();
 let bytes=0;
 for(const file of files){
  if(!contents.has(file))contents.set(file,(await readFile(join(directory,file))).byteLength);
  bytes+=contents.get(file);
 }
 games[id]={files,bytes};
}
// Built assets are content-hashed by Vite; include public asset bytes as well.
const hash=createHash('sha256');
hash.update(JSON.stringify(vite));
for(const file of allFiles){
 if(file.startsWith('assets/'))continue;
 hash.update(file);hash.update(await readFile(join(directory,file)));
}
const version=hash.digest('hex').slice(0,16);
const result={version,shell:[...shell].sort(),games};
await writeFile(join(directory,'offline-packs.json'),JSON.stringify(result));
const worker=await readFile('public/offline-sw.js','utf8');
if(!worker.includes('__QCC_VERSION__'))throw new Error('Missing offline worker version token');
await writeFile(join(directory,'offline-sw.js'),worker.replaceAll('__QCC_VERSION__',version));
console.log('Opt-in offline packs:',gameIds.length,'games, shell',shell.size,'files, version',version);
