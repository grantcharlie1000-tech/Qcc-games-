// Times processImage on generated fixtures. Usage: node scripts/media-benchmark.mjs
// Method follows the Whetū photo benchmark (kiakura docs/benchmarks/tutor-photo-pipeline.json, 9208032): several
// phone-like scenarios, header validation timed apart from processing, and each row reports the quality step,
// edge and whether the copy met the target and the hard maximum. QCC reports the median of three process runs.
import {build} from 'esbuild';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {cpus,platform,arch} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import sharp from 'sharp';
const root=resolve(import.meta.dirname,'..');await mkdir(join(root,'node_modules/.cache'),{recursive:true});const dir=await mkdtemp(join(root,'node_modules/.cache/media-bench-'));
try{
 await build({entryPoints:{process:join(root,'src/media/process.ts'),sniff:join(root,'src/media/sniff.ts'),policy:join(root,'src/media/policy.ts')},bundle:true,platform:'node',format:'esm',outdir:dir,outExtension:{'.js':'.mjs'},external:['sharp'],logLevel:'silent'});
 const {processImage}=await import(pathToFileURL(join(dir,'process.mjs')).href);
 const {sniffFormat}=await import(pathToFileURL(join(dir,'sniff.mjs')).href);
 const {POLICIES,MAX_INPUT_PIXELS}=await import(pathToFileURL(join(dir,'policy.mjs')).href);
 const policy=POLICIES.post;
 // A page: off-white paper, ruled lines of dark text-like blocks. `grain` is the paper-noise amplitude: a little for a clean page, more for a textured one.
 const page=(w,h,grain)=>{const raw=Buffer.alloc(w*h*3,244),noise=randomBytes(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*3;
   let v=244;if(((x>>4)*7+(y>>5)*13)%5===0&&(y%64)<28&&y>h*0.08)v=40;
   v=Math.max(0,Math.min(255,v+Math.round((noise[y*w+x]/255-0.5)*grain)));
   raw[i]=v;raw[i+1]=v;raw[i+2]=Math.max(0,v-(v>200?8:0));}
  return raw;};
 const shot=(()=>{const w=3000,h=4000,raw=Buffer.alloc(w*h*3,245);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*3;
   let v=245;if(y<220)v=40;else if(x%300<3||y%200<2)v=210;else if(((x>>5)*7+(y>>5)*13)%11===0&&(y%40)<24)v=30;
   raw[i]=raw[i+1]=v;raw[i+2]=Math.min(255,v+(y<220?60:0));}
  return raw;})();
 const jpeg=async(raw,w,h,quality=90,blur=0)=>{let s=sharp(raw,{raw:{width:w,height:h,channels:3}});if(blur)s=s.blur(blur);return new Uint8Array(await s.jpeg({quality}).toBuffer());};
 const scenarios=[
  ['12 MP phone JPEG, clean page','4032x3024',await jpeg(page(4032,3024,6),4032,3024)],
  ['12 MP phone JPEG, textured page','4032x3024',await jpeg(page(4032,3024,28),4032,3024)],
  ['12 MP phone PNG, clean page','4032x3024',new Uint8Array(await sharp(page(4032,3024,6),{raw:{width:4032,height:3024,channels:3}}).png().toBuffer())],
  ['1920x1440 JPEG, clean page','1920x1440',await jpeg(page(1920,1440,6),1920,1440)],
  ['800x600 JPEG, clean page','800x600',await jpeg(page(800,600,6),800,600)],
  ['4000x3000 noisy JPEG (blurred random noise, q90)','4000x3000',await jpeg(randomBytes(4000*3000*3),4000,3000,90,2)],
  ['3000x4000 screenshot-like PNG','3000x4000',new Uint8Array(await sharp(shot,{raw:{width:3000,height:4000,channels:3}}).png().toBuffer())]
 ];
 const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
 const rows=[];
 for(const [scenario,originalDims,input] of scenarios){
  const validate=[];
  for(let run=0;run<3;run++){const start=performance.now();sniffFormat(input);await sharp(input,{limitInputPixels:MAX_INPUT_PIXELS}).metadata();validate.push(performance.now()-start);}
  const times=[];let result;
  for(let run=0;run<3;run++){const start=performance.now();result=await processImage(input,'post');times.push(performance.now()-start);}
  rows.push({scenario,originalBytes:input.byteLength,originalDims,validateMs:+median(validate).toFixed(2),processMs:Math.round(median(times)),runsMs:times.map(Math.round),fullBytes:result.full.byteLength,thumbBytes:result.thumb?.byteLength??0,fullDims:`${result.width}x${result.height}`,quality:result.quality,edgePx:result.edgePx,withinTarget:result.full.byteLength<=policy.targetBytes,withinMax:result.full.byteLength<=policy.maxBytes});
 }
 console.log(JSON.stringify({measuredAt:new Date().toISOString(),node:process.version,sharp:sharp.versions.sharp,cpus:cpus().length,platform:`${platform()}-${arch()}`,environment:'cloud container, not a phone',rows},null,1));
}finally{await rm(dir,{recursive:true,force:true});}
