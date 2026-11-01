// Standing pre-push check. Evidence is deliberately written outside the repository.
import {chromium,webkit,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';

const base=process.env.ARCADE_URL??'http://127.0.0.1:4195';
if(!['4195','4196'].includes(new URL(base).port))throw new Error('Tetris audit uses ports 4195/4196 only.');
const output=process.env.QF_AUDIT_DIR??'/workspace/qcc-liquid-glass/tetris/polish-audit';
const phase=process.argv.includes('--before')?'before':'after';
await mkdir(output,{recursive:true});
const records=[];
const palette=['dark','light'];
for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch(engine==='chromium'?{headless:true,executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox']}:{});
 for(const [width,height] of [[390,844],[1366,768],[320,568]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:width<700?3:1,hasTouch:true,colorScheme:'dark'});
  await context.addInitScript(()=>{
   localStorage.setItem('pocket-arcade:v1:accounts:guest','true');
   localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');
   sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
   localStorage.setItem('pocket-arcade:v1:best:quadfall','98765');
  });
  const page=await context.newPage(),stem=`${phase}-${engine}-${width}x${height}`,checks=[];
  const check=(surface,rule,pass,detail)=>checks.push({surface,rule,pass,detail});
  const settle=selector=>page.locator(selector).evaluate(el=>Promise.all(el.getAnimations({subtree:true}).filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
  const shot=async(surface,selector)=>{
   await page.locator(selector).screenshot({path:path.join(output,`${stem}-${surface}.png`),animations:'disabled'});
  };
  const style=selector=>page.locator(selector).evaluate(el=>{
   const s=getComputedStyle(el),r=el.getBoundingClientRect();
   return {fontSize:s.fontSize,fontWeight:s.fontWeight,color:s.color,lineHeight:s.lineHeight,fontFamily:s.fontFamily,background:s.background,backdrop:s.backdropFilter,opacity:s.opacity,bounds:{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};
  });
  const focus=async(selector)=>{
   await page.keyboard.press('Tab');await page.locator(selector).focus();
   return page.locator(selector).evaluate(el=>{
    const s=getComputedStyle(el),r=el.getBoundingClientRect(),spread=Math.max(0,parseFloat(s.outlineWidth)+parseFloat(s.outlineOffset)),clipped=[];
    for(let parent=el.parentElement;parent;parent=parent.parentElement){
     const p=getComputedStyle(parent),box=parent.getBoundingClientRect();
     if(['hidden','clip','auto','scroll'].includes(p.overflowY)&&(r.y-spread<box.y-.5||r.bottom+spread>box.bottom+.5))clipped.push(parent.className+' vertical');
     if(['hidden','clip','auto','scroll'].includes(p.overflowX)&&(r.x-spread<box.x-.5||r.right+spread>box.right+.5))clipped.push(parent.className+' horizontal');
    }
    return {visible:el.matches(':focus-visible')&&s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>=1,clipped,outline:s.outline,offset:s.outlineOffset};
   });
  };
  await page.goto(base+'/#/game/quadfall');await expect(page.getByRole('button',{name:'Tap to play',exact:true})).toBeVisible();
  const modes=[];
  for(const colorScheme of palette){await page.emulateMedia({colorScheme});modes.push({preference:colorScheme,tone:await page.locator('.game-view').getAttribute('data-glass-tone'),background:await page.locator('.qf-game').evaluate(el=>getComputedStyle(el).backgroundColor)});}
  await page.emulateMedia({colorScheme:'dark'});
  const start=await style('.qf-start'),startFocus=await focus('.qf-start');
  check('Hold','ready state is actually disabled',await page.getByRole('button',{name:'Hold',exact:true}).isDisabled(),await style('.qf-hold'));
  check('Start','44 px target',start.bounds.width>=44&&start.bounds.height>=44,start.bounds);
  check('Start','visible unclipped focus',startFocus.visible&&!startFocus.clipped.length,startFocus);
  await shot('start','.qf-start');await page.screenshot({path:path.join(output,`${stem}-start-full.png`),animations:'disabled'});
  const boardFocus=await focus('.qf-canvas');check('Board','visible unclipped keyboard focus',boardFocus.visible&&!boardFocus.clipped.length,boardFocus);
  await page.screenshot({path:path.join(output,`${stem}-board-focus.png`),animations:'disabled'});
  const dock=await style('.game-dock');await shot('dock','.game-dock');
  await shot('back','.game-dock > a');await shot('hud','.game-hud');await shot('pause','#game-menu');
  const hud=await page.locator('.game-hud-item').evaluateAll(items=>items.map(item=>({label:item.querySelector('small')?.textContent,value:item.querySelector('strong')?.textContent,labelFont:getComputedStyle(item.querySelector('small')).font,valueFont:getComputedStyle(item.querySelector('strong')).font})));
  check('HUD','three live fields',hud.length===3&&hud.map(v=>v.label).join(',')==='Score,Level,Lines',hud);
  const dockTargets=await page.locator('.game-dock > a,.game-dock > button').evaluateAll(items=>items.map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})));
  check('Dock','44 px controls',dockTargets.every(r=>r.width>=44&&r.height>=44),dockTargets);
  await page.getByRole('button',{name:'Tap to play',exact:true}).click();
  const hold=await style('.qf-hold > span:first-child'),next=await style('.qf-next > span:first-child'),holdFocus=await focus('.qf-hold');
  const holdTarget=await style('.qf-hold');check('Hold','44 px enabled target',await page.getByRole('button',{name:'Hold',exact:true}).isEnabled()&&holdTarget.bounds.width>=44&&holdTarget.bounds.height>=44,holdTarget);
  check('Hold/Next','same label role',hold.fontSize===next.fontSize&&hold.fontWeight===next.fontWeight&&hold.lineHeight===next.lineHeight&&hold.color===next.color,{hold,next});
  check('Hold','visible unclipped focus',holdFocus.visible&&!holdFocus.clipped.length,holdFocus);
  await shot('chips','.qf-previews');await shot('hold','.qf-hold');await shot('next','.qf-next');
  const fits=()=>page.evaluate(()=>{
   const board=document.querySelector('.qf-board').getBoundingClientRect(),dock=document.querySelector('.game-dock').getBoundingClientRect();
   return {board:{x:board.x,y:board.y,width:board.width,height:board.height,right:board.right,bottom:board.bottom},dock:{x:dock.x,y:dock.y,width:dock.width,height:dock.height,right:dock.right,bottom:dock.bottom},fits:board.x>=0&&board.right<=innerWidth&&board.y>=0&&board.bottom<=innerHeight&&(board.bottom<=dock.y+.5||board.y>=dock.bottom-.5)};
  });
  const original=await fits();check('Layout','board avoids current dock',original.fits,original);
  const resizeStyle=await page.addStyleTag({content:'.game-view[data-game-id=quadfall] .game-dock{height:88px;flex-basis:88px}'});
  await expect.poll(async()=>{const r=await fits();return r.fits&&r.board.height<original.board.height;}).toBe(true);
  const taller=await fits();check('Layout','responds to dock height',taller.fits&&taller.board.height<original.board.height,{original,taller});await resizeStyle.evaluate(el=>el.remove());
  await page.getByRole('button',{name:'Menu',exact:true}).click();await expect(page.locator('#game-options')).toHaveJSProperty('open',true);
  await shot('menu','#game-options');
  const menuTitle=await style('#game-title'),menuMaterial=await style('#game-options');
  const sharedStats=await page.locator('.game-metrics').evaluate(el=>({text:el.textContent,font:getComputedStyle(el).font,levelFont:getComputedStyle(el.querySelector('#game-level')).font,valueFonts:[...el.querySelectorAll('strong')].map(v=>getComputedStyle(v).font),textBottoms:[...el.querySelectorAll('.metric-label,strong,#game-level')].map(v=>{const r=document.createRange();r.selectNodeContents(v);return{text:v.textContent,bottom:r.getBoundingClientRect().bottom};})}));
  const duplicateStar=await page.evaluate(()=>document.querySelector('#favourite-game svg').innerHTML===document.querySelector('#game-rankings svg').innerHTML);
  const handle=await page.locator('#game-options').evaluate(el=>{const s=getComputedStyle(el,'::before');return{display:s.display,width:s.width,height:s.height,content:s.content};});
  if(handle.display!=='none'){
   const box=(await page.locator('#game-options').boundingBox());
   await page.mouse.move(box.x+box.width/2,box.y+18);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+158,{steps:8});await page.mouse.up();
   handle.dismissedByDrag=await page.locator('#game-options').evaluate(el=>!el.open);
  }
  const menuTargets=await page.locator('#game-options button').evaluateAll(items=>items.filter(el=>el.getClientRects().length).map(el=>({name:el.getAttribute('aria-label')??el.textContent,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})));
  await page.addInitScript(()=>{
   const data={version:1,seed:1,board:Array.from({length:22},()=>Array(10).fill(null)),active:{id:'T',x:3,y:2,r:0},queue:['I','O','S','Z','J','L'],bag:[],held:null,holdUsed:false,score:12345,lines:12,phase:'lost',fall:0,lock:0,resets:0,locks:0,lowest:3};
   localStorage.setItem('pocket-arcade:v1:save:quadfall',JSON.stringify({version:1,data,updated:Date.now()}));
  });
  await page.reload();await expect(page.getByRole('dialog',{name:'Game over',exact:true})).toBeVisible();
  await settle('.qf-over');
  const endingHud=await page.locator('.game-hud-item').evaluateAll(items=>items.map(item=>item.querySelector('strong')?.textContent));
  check('HUD','reported score, level and lines update',endingHud.join(',')==='12345,2,12',endingHud);
  const over=await style('.qf-over'),overTitle=await style('#qf-over-title');
  const stats=await page.locator('.qf-result').evaluate(el=>{
   const parts=[...el.querySelectorAll('dt,dd')].map(part=>{const s=getComputedStyle(part),range=document.createRange();range.selectNodeContents(part);const box=range.getBoundingClientRect();return{text:part.textContent,tag:part.tagName,bottom:box.bottom,fontSize:s.fontSize,weight:s.fontWeight,color:s.color,lineHeight:s.lineHeight};});
   const r=el.getBoundingClientRect(),pairs=[...el.children].map(v=>v.getBoundingClientRect());
   return{parts,baselineSpread:Math.max(...parts.map(p=>p.bottom))-Math.min(...parts.map(p=>p.bottom)),overflow:el.scrollWidth>el.clientWidth,insetDifference:Math.abs(pairs[0].x-r.x-(r.right-pairs.at(-1).right))};
  });
  check('Results','label/value baseline <= 1 px',stats.baselineSpread<=1,stats);
  check('Results','same label/value size and line-height',new Set(stats.parts.map(p=>p.fontSize+'/'+p.lineHeight)).size===1,stats.parts);
  check('Results','no overflow at 320/390/desktop',!stats.overflow,stats);
  check('Results','symmetric row insets <= 1 px',stats.insetDifference<=1,stats);
  check('Results','sheet heading role matches game menu',['fontSize','fontWeight','lineHeight'].every(key=>overTitle[key]===menuTitle[key]),{overTitle,menuTitle});
  const buttons=await page.locator('.qf-over button').evaluateAll(items=>items.map(el=>({text:el.getAttribute('aria-label')??el.textContent,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})));
  check('Results','44 px targets',buttons.every(r=>r.width>=44&&r.height>=44),buttons);
  const replayFocus=await focus('.qf-replay');check('Results','visible unclipped replay focus',replayFocus.visible&&!replayFocus.clipped.length,replayFocus);
  await shot('over','.qf-over');await shot('stats','.qf-result');await page.screenshot({path:path.join(output,`${stem}-over-full.png`),animations:'disabled'});
  const visibleText=await page.locator('.game-view').innerText();
  check('All Tetris surfaces','no fluff',!(/\b(fictional|example|demo|advertisement|sponsored)\b/i.test(visibleText)),visibleText);
  records.push({engine,width,height,dpr:width<700?3:1,phase,modes,dock,hud,over,checks,shared:{stats:sharedStats,duplicateStar,handle,menuTitle,menuMaterial,menuTargets}});
  console.log(`${stem}: ${checks.filter(c=>!c.pass).map(c=>c.surface+' / '+c.rule).join('; ')||'PASS'}`);
  await context.close();
 }
 await browser.close();
}
await writeFile(path.join(output,`${phase}-metrics.json`),JSON.stringify(records,null,2));
const failures=records.flatMap(record=>record.checks.filter(c=>!c.pass).map(c=>`${record.engine} ${record.width}x${record.height}: ${c.surface} / ${c.rule}`));
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log('All Tetris-owned polish checks passed. Shared findings are recorded separately.');
