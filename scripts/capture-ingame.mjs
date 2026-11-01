import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';

const round=process.argv[2]??'round-1';
if(!/^[a-zA-Z0-9_-]+$/.test(round))throw new Error('Use a plain round name');
const ids=['home','fruit-merge','water-sort','color-blocks','tower','snake','neon-coil','minesweeper','solitaire','block-fill','color-connect','ball-run','pool','animal-stack','flappy-bird','globle','blockcraft','maze-muncher','corn-clicker','slipline','quadfall','fivefold'];
const selected=process.argv.slice(3);
const directory=`/workspace/qcc-liquid-glass/${round}`;
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({channel:'chromium',executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const results=[];
async function capture(page,id,format,errors){
  if(id!=='home'){
    const clipped=await page.locator('.game-hud').evaluate(hud=>{
      const box=hud.getBoundingClientRect();
      return [...hud.querySelectorAll('small,strong')].filter(e=>e.textContent?.trim()).flatMap(e=>{
        const range=document.createRange();range.selectNodeContents(e);const r=range.getBoundingClientRect();
        return r.left<box.left+2||r.right>box.right-2||r.top<box.top+2||r.bottom>box.bottom-2?[e.textContent]:[];
      });
    });
    if(clipped.length)throw new Error(`HUD text escapes its capsule: ${clipped.join(', ')}`);
  }
  const geometry=await page.evaluate(home=>{
    const box=selector=>{const e=document.querySelector(selector);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
    return {dock:box(home?'.app-navigation':'.game-dock'),stage:box('.stage-wrap'),root:box('#game-stage > :first-child'),tone:document.querySelector(home?'.app-tabbar':'.game-view')?.getAttribute('data-glass-tone'),scroll:{x:scrollX,y:scrollY,width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}};
  },id==='home');
  const path=`${directory}/${id}-${format}.png`,dockPath=`${directory}/${id}-${format}-dock.png`;
  await page.screenshot({path,animations:'disabled'});
  const d=geometry.dock,v=page.viewportSize();
  if(!d)throw new Error('Dock has no capture rectangle');
  const x=Math.max(0,d.x-24),y=Math.max(0,d.y-24);
  const clip={x,y,width:Math.min(v.width,d.x+d.width+24)-x,height:Math.min(v.height,d.y+d.height+24)-y};
  await page.screenshot({path:dockPath,clip,animations:'disabled'});
  let press;
  if(format==='mobile'&&['neon-coil','fruit-merge'].includes(id)){
    const menu=page.locator('#game-menu'),box=await menu.boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
    const pressPath=`${directory}/press-${geometry.tone}.png`;
    // Finish the finite CSS transition while keeping the pointer held. Releasing
    // outside the control cancels the press without opening the game menu.
    await page.screenshot({path:pressPath,clip,animations:'disabled'});
    press={path:pressPath,...await menu.evaluate(e=>({scale:getComputedStyle(e).scale,held:e.hasAttribute('data-pressing'),filter:getComputedStyle(e.querySelector('.ui-glass-lens')).backdropFilter}))};
    await page.mouse.move(0,0);await page.mouse.up();
    const scale=Number(press.scale);
    if(!press.held||!Number.isFinite(scale)||scale<1.08)throw new Error('Pressed capture did not hold a lifted control');
  }
  results.push({id,format,path,dockPath,press,errors,...geometry});
  console.log(`${id} ${format}: captured full view + dock${errors.length?' — '+errors.join('; '):''}`);
}
try{
  for(const format of ['mobile','pc'])for(const id of ids.filter(id=>!selected.length||selected.includes(id))){
    const mobile=format==='mobile';
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:768},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:mobile?2:1});
    await context.addInitScript(()=>{
      localStorage.setItem('pocket-arcade:v1:accounts:guest','true');
      localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');
      sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
    });
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    try{
      await page.goto(`${process.env.ARCADE_URL??'http://127.0.0.1:4173'}/${id==='home'?'#/collection':`#/game/${id}`}`);
      if(id==='home'){
        await page.locator('.game-card').first().waitFor({state:'visible'});
        await page.locator('.app-tabbar.is-refracting').waitFor({state:'visible'});
        await page.locator('.app-menu.is-refracting').waitFor({state:'visible'});
        await page.evaluate(()=>document.fonts.ready);
        await capture(page,id,format,errors);
        continue;
      }
      await page.locator('#game-stage > *').first().waitFor({state:'visible'});
      await page.locator('.loading').waitFor({state:'detached'});
      await page.locator('.game-hud strong').first().waitFor({state:'visible'});
      await page.evaluate(()=>document.fonts.ready);
      // Let native ResizeObservers settle the play surface before freezing timed games.
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const click=async locator=>mobile?locator.tap():locator.click();
      const timed=['tower','snake','neon-coil','flappy-bird','quadfall','maze-muncher','ball-run'].includes(id);
      if(timed){await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+100));}
      switch(id){
        case 'fruit-merge':await click(page.locator('.fm-drop'));await page.waitForFunction(()=>!document.querySelector('.fm-drop')?.disabled);break;
        case 'water-sort':{
          const tubes=page.locator('.ws-tube');await click(tubes.first());await click(tubes.last());
          await page.waitForFunction(()=>document.querySelector('.ws-game')?.getAttribute('data-phase')!=='pouring');break;
        }
        case 'color-blocks':await page.locator('.cb-board').focus();await page.keyboard.press('1');await page.keyboard.press('Enter');break;
        case 'tower':await click(page.locator('#game-menu'));await click(page.locator('#restart-game'));await page.clock.runFor(1526);await click(page.locator('.tower-drop'));await page.clock.runFor(300);break;
        case 'snake':await click(page.locator('.snake-start'));await page.clock.runFor(450);break;
        case 'neon-coil':await click(page.locator('.nc-start'));await page.clock.runFor(650);break;
        case 'minesweeper':{
          await click(page.locator('.ms-tile[data-index="40"]'));
          const covered=page.locator('.ms-tile[data-state="hidden"]').first();
          if(mobile){await click(page.locator('.ms-mode'));await covered.tap();await click(page.locator('.ms-reveal-mode'));}
          else await covered.click({button:'right'});
          await page.waitForFunction(()=>!document.querySelector('.ms-mode-switch button:active'));break;
        }
        case 'solitaire':await click(page.locator('[data-action="draw"]'));break;
        case 'block-fill':await page.locator('.bf-board').focus();await page.keyboard.press('ArrowRight');break;
        case 'color-connect':await page.locator('.cc-cell[aria-label*="C aqua square endpoint"]').first().focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowLeft');break;
        case 'ball-run':await click(page.locator('.br-play'));await page.clock.runFor(600);break;
        case 'pool':await page.locator('.pool-table').focus();await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');break;
        case 'animal-stack':await click(page.locator('.animal-stack__drop'));await page.waitForFunction(()=>!document.querySelector('.animal-stack__drop')?.disabled);break;
        case 'flappy-bird':await click(page.locator('.fb-start'));await page.clock.runFor(250);await click(page.locator('.fb-flap'));await page.clock.runFor(250);break;
        case 'globle':await page.locator('.gl-globe[data-land="ready"]').waitFor({timeout:60000});await page.getByLabel('Country name',{exact:true}).fill('Australia');await click(page.locator('.gl-submit'));await page.locator('.gl-guess').first().waitFor();await page.locator('.gl-globe[data-rendering="false"]').waitFor();break;
        case 'blockcraft':{
          await page.waitForFunction(()=>document.querySelector('.blockcraft')?.getAttribute('data-ready')==='true',null,{timeout:60000});
          await click(page.getByRole('button',{name:'Play',exact:true}));
          await page.waitForFunction(()=>document.querySelector('.blockcraft')?.getAttribute('data-phase')==='playing');
          // Look down using the real controls so terrain, rather than uniform
          // sky, crosses the top dock and exposes its edge refraction.
          if(mobile){
            const cdp=await context.newCDPSession(page);
            await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:280,y:280,id:1}]});
            for(let n=1;n<=10;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:280,y:280+n*20,id:1}]});
            await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
          }else{
            await page.mouse.move(683,384);
            for(let n=1;n<=12;n++)await page.mouse.move(683,384+n*28);
          }
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          break;
        }
        case 'maze-muncher':await click(page.locator('.mm-start'));await page.clock.runFor(2500);break;
        case 'corn-clicker':for(let n=0;n<3;n++)await click(page.locator('.cc-cob'));if(await page.locator('.cc-tip-done').isVisible())await click(page.locator('.cc-tip-done'));break;
        case 'slipline':{
          const point=await page.locator('.sl-board g[data-free="true"] polyline').first().evaluate(node=>{const p=node.getPointAtLength(node.getTotalLength()/2),m=node.getScreenCTM();return {x:p.x*m.a+p.y*m.c+m.e,y:p.x*m.b+p.y*m.d+m.f};});
          if(mobile)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);break;
        }
        case 'quadfall':await click(page.locator('.qf-card button'));await page.keyboard.press('Space');await page.keyboard.press('Space');await page.clock.runFor(100);break;
        case 'fivefold':for(const key of 'crane')await click(page.locator(`[data-key="${key}"]`));await click(page.locator('[data-key="↵"]'));break;
      }
      if(!timed)await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      if(id==='fivefold')await page.waitForFunction(()=>document.querySelectorAll('.ff-reveal .ff-tile').length===5);
      await page.waitForFunction(()=>[...document.querySelectorAll('.game-dock > .arcade-glass')].every(e=>e.classList.contains('is-refracting')||e.getAttribute('data-glass')!=='backdrop'));
      await capture(page,id,format,errors);
    }catch(error){results.push({id,format,error:String(error),errors});console.error(`${id} ${format}: ${error}`);}
    finally{await context.close();}
  }
}finally{await browser.close();await writeFile(`${directory}/manifest.json`,JSON.stringify(results,null,2)+'\n');}
if(results.some(result=>result.error||result.errors.length))process.exitCode=1;
