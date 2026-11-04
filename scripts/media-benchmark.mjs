// Times processImage on two generated fixtures. Usage: node scripts/media-benchmark.mjs
import {build} from 'esbuild';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {cpus,platform,arch} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import sharp from 'sharp';
const root=resolve(import.meta.dirname,'..');await mkdir(join(root,'node_modules/.cache'),{recursive:true});const dir=await mkdtemp(join(root,'node_modules/.cache/media-bench-'));
try{
 const outfile=join(dir,'process.mjs');
 await build({entryPoints:[join(root,'src/media/process.ts')],bundle:true,platform:'node',format:'esm',outfile,external:['sharp'],logLevel:'silent'});
 const {processImage}=await import(pathToFileURL(outfile).href);
 const noisy=new Uint8Array(await sharp(randomBytes(4000*3000*3),{raw:{width:4000,height:3000,channels:3}}).blur(2).jpeg({quality:90}).toBuffer());
 // Screenshot-like: flat panels, grid lines and sparse text-like blocks, in portrait.
 const shot=(()=>{const w=3000,h=4000,raw=Buffer.alloc(w*h*3,245);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*3;
   let v=245;if(y<220)v=40;else if(x%300<3||y%200<2)v=210;else if(((x>>5)*7+(y>>5)*13)%11===0&&(y%40)<24)v=30;
   raw[i]=raw[i+1]=v;raw[i+2]=Math.min(255,v+(y<220?60:0));}
  return raw;})();
 const png=new Uint8Array(await sharp(shot,{raw:{width:3000,height:4000,channels:3}}).png().toBuffer());
 const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
 const rows=[];
 for(const [name,input] of [['4000x3000 noisy JPEG',noisy],['3000x4000 screenshot-like PNG',png]]){
  const times=[];let result;
  for(let run=0;run<3;run++){const start=performance.now();result=await processImage(input,'post');times.push(performance.now()-start);}
  rows.push({name,inputBytes:input.byteLength,fullBytes:result.full.byteLength,thumbBytes:result.thumb?.byteLength??0,size:`${result.width}x${result.height}`,runs:times.map(t=>Math.round(t)),median:Math.round(median(times))});
 }
 console.log(JSON.stringify({node:process.version,sharp:sharp.versions.sharp,cpus:cpus().length,platform:`${platform()}-${arch()}`,rows},null,1));
}finally{await rm(dir,{recursive:true,force:true});}
