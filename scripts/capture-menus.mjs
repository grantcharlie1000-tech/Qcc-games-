import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';

const round=process.argv[2]??'round-12';
if(!/^[a-zA-Z0-9_-]+$/.test(round))throw new Error('Use a plain round name');
const directory=`/workspace/qcc-liquid-glass/${round}`;
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({channel:'chromium',executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const manifest=[];
try{
  for(const format of ['mobile','pc']){
    const mobile=format==='mobile';
    for(const id of ['home','snake','fruit-merge','pool','minesweeper','fivefold']){
      const views=id==='home'?['menu','accounts','leaderboards']:id==='fivefold'?['stats']:['menu','rules','settings','leaderboards',...(id==='minesweeper'?['options']:id==='pool'?['multiplayer']:[])];
      for(const view of views){
        const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:768},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:mobile?2:1});
        await context.addInitScript(()=>{
          localStorage.setItem('pocket-arcade:v1:accounts:guest','true');
          localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');
          sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
        });
        const page=await context.newPage();
        const errors=[];page.on('pageerror',error=>errors.push(error.message));
        const click=async locator=>mobile?locator.tap():locator.click();
        try{
          // A fresh document prevents a previous modal's route-independent lifetime
          // from carrying into the next capture. No saved game state is injected.
          await page.goto(`${process.env.ARCADE_URL??'http://127.0.0.1:4173'}/?capture=${id}-${view}#/${id==='home'?'collection':`game/${id}`}`);
          if(id!=='home'){
            await page.locator('#game-stage > *').first().waitFor({state:'visible'});
            await page.locator('.loading').waitFor({state:'detached'});
            await page.locator('.game-hud strong').first().waitFor({state:'visible'});
          }else await page.locator('.game-card').first().waitFor({state:'visible'});
          await click(page.locator(id==='home'?'.app-menu':'#game-menu'));
          let selector=id==='home'?'#menu':'#game-options';
          const routes={
            accounts:['Log in / Sign up','#accounts-dialog'],
            rules:['Game rules','#rules-dialog'],settings:['Settings','#menu'],
            leaderboards:['Leaderboards','#leaderboard-dialog'],options:['Game options','.ms-settings'],
            multiplayer:['Multiplayer','.mp-card'],stats:['Stats','.ff-dialog']
          };
          if(view!=='menu'){
            const [name,next]=routes[view];
            await click(page.locator(selector).getByRole('button',{name,exact:true}));selector=next;
          }
          const panel=page.locator(selector);await panel.waitFor({state:'visible'});
          await page.evaluate(()=>document.fonts.ready);
          // Wait for finite entry motion without suppressing reduced-motion behavior.
          await panel.evaluate(e=>Promise.all(e.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
          await panel.evaluate(e=>{e.scrollTop=0;});
          const path=`${directory}/${id}-${format}-${view}.png`;
          await page.screenshot({path,animations:'disabled'});
          manifest.push({id,format,view,path});
          if(errors.length)throw new Error(errors.join('\n'));
          console.log(`${id} ${format} ${view}`);
        }finally{await context.close();}
      }
    }
  }
  await writeFile(`${directory}/menus-manifest.json`,JSON.stringify(manifest,null,2)+'\n');
}finally{await browser.close();}
