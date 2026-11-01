import {chromium} from '@playwright/test';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';

const [kind,state,base='http://127.0.0.1:4173']=process.argv.slice(2);
if(!['bar','account','movies'].includes(kind)||!['before','after'].includes(state))throw new Error('Usage: capture-safari-followups.mjs bar|account|movies before|after [preview URL]');
const directory=`/workspace/qcc-liquid-glass/${kind==='movies'?'round-13b':'round-13'}`;
await mkdir(directory,{recursive:true});
const manifestPath=`${directory}/manifest.json`;
let manifest=[];try{manifest=JSON.parse(await readFile(manifestPath,'utf8'));}catch{}
const geometry=[];
const browser=await chromium.launch({channel:'chromium',executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
async function save(page,id,name){
  const path=`${directory}/${name}.png`;
  await page.screenshot({path,animations:'allow'});
  manifest=manifest.filter(row=>row.id!==id||row.state!==state);manifest.push({id,state,path});
  geometry.push({id,...await page.evaluate(()=>{
    const nav=document.querySelector('.app-navigation'),bar=document.querySelector('.app-tabbar');
    const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};
    return{minimized:bar?.getAttribute('data-minimized'),bar:bar?rect(bar):null,filters:[...(nav?.querySelectorAll('*')??[])].flatMap(e=>{const s=getComputedStyle(e);return s.backdropFilter!=='none'?[{class:e.className,filter:s.backdropFilter,opacity:s.opacity,rect:rect(e)}]:[];})};
  })});
  console.log(`${state}: ${id}`);
}
try{
  for(const format of kind==='movies'?['mobile','pc']:['mobile']){
    const mobile=format==='mobile';
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:768},deviceScaleFactor:mobile?3:1,hasTouch:mobile,isMobile:mobile});
    await context.addInitScript(()=>{
      localStorage.setItem('pocket-arcade:v1:accounts:guest','true');
      localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');
      sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
      Object.defineProperty(navigator,'userAgentData',{configurable:true,value:undefined});
    });
    const page=await context.newPage();
    if(kind==='movies'){
      for(const [id,route] of [['movies','movies/browse/movie'],['tv','movies/browse/tv']]){
        await page.goto(`${base}/?glass=fallback#/${route}`);
        await page.locator('.movies-browse').waitFor();await page.evaluate(()=>document.fonts.ready);
        await save(page,`${id}-${format}`,`${id}-${state}-${format}`);
      }
    }else{
      await page.goto(`${base}/?glass=fallback#/collection`);
      await page.locator('.game-card').first().waitFor();await page.locator('.app-tabbar[data-glass=frost]').waitFor();await page.evaluate(()=>document.fonts.ready);
      if(kind==='account'){
        await page.getByRole('button',{name:'Open menu',exact:true}).click();
        await page.getByRole('button',{name:'Log in / Sign up',exact:true}).click();
        await page.locator('#accounts-dialog').waitFor();
        await page.waitForFunction(()=>document.querySelector('#accounts-dialog').getAnimations({subtree:true}).length===0);
        await save(page,'account-sheet',`account-sheet-${state}`);
      }else{
        await save(page,'bar-expanded',`bar-collapse-${state}-expanded`);
        await page.evaluate(()=>scrollTo(0,180));
        await page.waitForFunction(()=>document.querySelector('.app-tabbar').hasAttribute('data-minimized'));
        await page.locator('.app-navigation').evaluate(el=>{for(const a of el.getAnimations({subtree:true})){a.pause();a.currentTime=110;}});
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        await save(page,'bar-mid-collapse',`bar-collapse-${state}-mid`);
        await page.locator('.app-navigation').evaluate(el=>{for(const a of el.getAnimations({subtree:true}))a.finish();});
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        await save(page,'bar-collapsed',`bar-collapse-${state}-collapsed`);
        await page.evaluate(()=>scrollTo(0,80));
        await page.waitForFunction(()=>!document.querySelector('.app-tabbar').hasAttribute('data-minimized'));
        await page.locator('.app-navigation').evaluate(el=>{for(const a of el.getAnimations({subtree:true}))a.finish();});
        await save(page,'bar-restored',`bar-collapse-${state}-restored`);
      }
    }
    await context.close();
  }
}finally{
  await browser.close();
  await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  await writeFile(`${directory}/${kind}-${state}-geometry.json`,JSON.stringify(geometry,null,2)+'\n');
}
