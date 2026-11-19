/**
 * Stage only compiled runtime/frontend files from the upstream browser port.
 * Example: node scripts/stage-re3.mjs ../GTA3-WASM/web
 */
import {access,copyFile,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const source=resolve(process.argv[2]??'../GTA3-WASM/web');
const target=join(projectRoot,'public/ports/re3');
const required=[
  'index.html','styles.css','asset-manifest.json','vfs.js','saves.js',
  'input.js','perf.js','boot.js','launcher.js',
  'build/re3_wasm.js','build/re3_wasm.wasm'
];
const optional=['rendertest.html','rendertest.js','rendertest.css'];
const inside=(base,path)=>{
  const rel=relative(base,path);
  return rel===''||(!rel.startsWith('..')&&!isAbsolute(rel));
};
if(inside(target,source)||inside(source,target))throw new Error('Source and target directories must be different.');
for(const path of required){
  try{await access(join(source,path));}
  catch{throw new Error('Missing '+path+'. Compile the upstream WASM build first.');}
}
const html=await readFile(join(source,'index.html'),'utf8');
if(!html.includes('build/re3_wasm.js'))throw new Error('Unexpected upstream HTML; audit this staging script before copying.');
// Never copy packaged proprietary game assets, gamefiles, or other build extras.
await rm(target,{recursive:true,force:true});
await mkdir(target,{recursive:true});
for(const path of [...required,...optional]){
  try{
    await access(join(source,path));
    const dest=join(target,path);
    await mkdir(dirname(dest),{recursive:true});
    await copyFile(join(source,path),dest);
  }catch(error){if(required.includes(path))throw error;}
}
await writeFile(join(target,'runtime-ready.json'),JSON.stringify({runtime:'re3-wasm',assetsIncluded:false},null,2)+'\n');
console.log('Staged the browser runtime to '+target+'. No GTA III game data was copied.');
