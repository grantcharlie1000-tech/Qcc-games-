// Usage: node work/last-light/shot.mjs out-dir stage:x:y[:clock[:w:h[:name]]] ...
// Draws the real Scene with the courier placed at (x,y) on a native canvas and saves a 2x nearest-neighbour PNG.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const [out,...specs]=process.argv.slice(2);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:800,height:600}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto('http://127.0.0.1:5173/');
for(const spec of specs){
 const [stage,x,y,clock='1',w='640',h='360',name,cine]=spec.split(':');
 const data=await page.evaluate(async({stage,x,y,clock,w,h,cine})=>{
  const [{Scene},{createRun,respawn},{LEVELS}]=await Promise.all([import('/src/games/last-light/render.ts'),import('/src/games/last-light/model.ts'),import('/src/games/last-light/levels.ts')]);
  try{await (await import('/src/games/last-light/generated-art.ts')).artReady;}catch{}
  const canvas=document.createElement('canvas');const scene=new Scene(canvas);
  scene.resize(w,h);
  const s=createRun();s.stage=stage;s.cleared=stage;respawn(s,false);
  Object.assign(s,{x,y,clock,grounded:true,vx:0,vy:0});
  if(cine>=0){const {clearDuration}=await import('/src/games/last-light/departure.ts');const l=LEVELS[stage];s.phase='cleared';s.cleared=stage+1;s.cinematic=clearDuration(l)-cine;scene.draw(s,false);scene.step(s,{clear:true},1/60);for(let i=0;i<90;i++)scene.step(s,{},1/60);}
  // Let the camera settle on the courier.
  scene.draw(s,cine<0);
  const big=document.createElement('canvas');big.width=canvas.width*2;big.height=canvas.height*2;const bc=big.getContext('2d');bc.imageSmoothingEnabled=false;bc.drawImage(canvas,0,0,big.width,big.height);
  return big.toDataURL('image/png').split(',')[1];
 },{stage:+stage,x:+x,y:+y,clock:+clock,w:+w,h:+h,cine:cine===undefined?-1:+cine});
 const file=`${out}/${name??`l${+stage+1}-${x}-${y}`}.png`;await writeFile(file,Buffer.from(data,'base64'));console.log(file);
}
if(errors.length)console.log('ERRORS',errors);
await browser.close();
