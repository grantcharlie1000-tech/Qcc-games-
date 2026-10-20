import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const files=[];
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=dir+'/'+entry.name;if(entry.isDirectory()){if(entry.name!=='.vite')await walk(path);}else if(!entry.name.endsWith('.map')&&entry.name!=='offline-manifest.json'&&entry.name!=='_headers'){files.push(path.slice(5));}}}
await walk('dist');files.sort();const hash=createHash('sha256');for(const file of files)hash.update(await readFile('dist/'+file));const version=hash.digest('hex').slice(0,12);
const vite=JSON.parse(await readFile('dist/.vite/manifest.json','utf8'));const entry=vite['index.html'];
const initial=['./','index.html','icon.svg','manifest.webmanifest','offline-manifest.json',entry.file,...(entry.css||[]),...files.filter(file=>/^assets\/.*\.(?:m?js|css)$/.test(file)&&file!==entry.file&&!(entry.css||[]).includes(file)),...files.filter(file=>file.startsWith('game-art/')||/\.(ttf|woff2?)$/.test(file))];
const worker=await readFile('public/sw.js','utf8');await writeFile('dist/sw.js',worker.replace('__ARCADE_VERSION__',version).replace('__ARCADE_PRECACHE__',JSON.stringify(initial)));
await writeFile('dist/offline-manifest.json',JSON.stringify({version,files:['./',...files,'offline-manifest.json']}));console.log(`Offline pack: ${files.length+2} files, version ${version}`);
