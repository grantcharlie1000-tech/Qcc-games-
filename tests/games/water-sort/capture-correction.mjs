import {chromium} from '@playwright/test';
import {mkdir,writeFile,rm} from 'node:fs/promises';
const out='tests/games/water-sort/evidence';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const url=process.env.ARCADE_URL||'http://127.0.0.1:4176';
const measurements=[];
for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1366,height:768}]){
 const record=viewport.width===390;
 const context=await browser.newContext({viewport,hasTouch:record,isMobile:record,recordVideo:record?{dir:out,size:viewport}:undefined});
 await context.addInitScript(()=>sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading'));
 const page=await context.newPage();
 await page.goto(url+'/#/game/water-sort');await page.locator('.ws-game[data-phase="ready"]').waitFor();
 if(record){
  await page.locator('[data-tube="0"]').tap();await page.locator('[data-tube="2"]').tap();
  await page.waitForFunction(()=>document.querySelector('.ws-game')?.dataset.pourPhase==='flow');
  await page.waitForTimeout(170);
  await page.screenshot({path:out+'/correction-flow-390x844.png'});
  await page.locator('.ws-game[data-phase="ready"][data-moves="1"]').waitFor();
  await page.waitForTimeout(350);
  await page.screenshot({path:out+'/correction-return-390x844.png'});
 }
 await page.getByRole('combobox',{name:'Level',exact:true}).selectOption('7');
 await page.waitForTimeout(150);
 await page.screenshot({path:`${out}/correction-${viewport.width}x${viewport.height}.png`});
 const tube=await page.locator('.ws-glass').first().evaluate(el=>el.outerHTML);
 if(record)await writeFile(out+'/correction-tube.svg',tube);
 measurements.push(await page.evaluate(()=>({viewport:{width:innerWidth,height:innerHeight},root:(()=>{const r=document.querySelector('.ws-game').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};})(),scroll:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},tubes:Array.from(document.querySelectorAll('.ws-tube')).map(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};})})));
 const video=page.video();await context.close();if(record&&video){const originalPath=await video.path();await video.saveAs(out+'/correction-pour-390x844.webm');await rm(originalPath);}
}
await writeFile(out+'/correction-measurements.json',JSON.stringify(measurements,null,2)+'\n');
await browser.close();console.log(JSON.stringify(measurements,null,2));
