import {chromium} from '@playwright/test';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';

const [state,base='http://127.0.0.1:4173']=process.argv.slice(2);
if(!['before','after'].includes(state))throw new Error('Usage: capture-white-bar.mjs before|after [preview URL]');
const directory='/workspace/qcc-liquid-glass/round-13';await mkdir(directory,{recursive:true});
const manifestPath=`${directory}/manifest.json`;let manifest=[];
try{manifest=JSON.parse(await readFile(manifestPath,'utf8'));}catch{}
const browser=await chromium.launch({channel:'chromium',executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
const observations=[];
try{
  const context=await browser.newContext({viewport:{width:1024,height:577}});
  await context.addInitScript(()=>{
    localStorage.setItem('pocket-arcade:v1:accounts:guest','true');
    localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');
    sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
  });
  const page=await context.newPage();
  async function save(suffix=''){
    const id=`white-bar${suffix}`,path=`${directory}/white-bar-${state}${suffix}.png`;
    await page.screenshot({path,animations:'allow'});
    manifest=manifest.filter(row=>row.id!==id||row.state!==state);manifest.push({id,state,path});
    observations.push({id,...await page.evaluate(()=>{
      const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};
      const read=selector=>{const e=document.querySelector(selector),s=getComputedStyle(e);return{rect:rect(e),display:s.display,opacity:s.opacity,filter:s.backdropFilter,background:s.background,contain:s.contain};};
      return {route:location.hash,body:document.body.className,accountOpen:document.querySelector('#accounts-dialog').open,account:read('#accounts-dialog'),submit:read('.account-submit'),mini:read('.app-navigation .ui-tabbar-mini'),bottomTargets:[310,510,720].map(x=>({x,element:document.elementFromPoint(x,574)?.outerHTML.slice(0,160)}))};
    })});console.log(id);
  }
  await page.goto(`${base}/#/collection`);await page.locator('.game-card').first().waitFor();await page.evaluate(()=>document.fonts.ready);
  await save();
  await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'Log in / Sign up',exact:true}).click();
  const dialog=page.locator('#accounts-dialog');await dialog.waitFor();
  await page.waitForFunction(()=>document.querySelector('#accounts-dialog').getAnimations({subtree:true}).length===0);
  await save('-open');
  await dialog.getByRole('button',{name:'Play as guest',exact:true}).click();
  await dialog.evaluate(e=>{for(const a of e.getAnimations()){a.pause();a.currentTime=90;}});
  await save('-mid-close');
  await dialog.evaluate(e=>{for(const a of e.getAnimations())a.finish();});
  await page.locator('.game-card').first().waitFor();await save('-guest');
  await page.reload();await page.locator('.game-card').first().waitFor();await save('-reload');
  await context.close();
}finally{
  await browser.close();await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  await writeFile(`${directory}/white-bar-${state}-geometry.json`,JSON.stringify(observations,null,2)+'\n');
}
