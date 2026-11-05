// Captures real desktop (1440x900) and phone (390x844) screenshots of games in
// active play for the Christmas evidence record.
//
//   node scripts/festive-evidence.mjs <before|after> [game-id ...]
//
// "before" switches the festive theme off (qcc:festive=off), which is the
// original presentation; "after" leaves the Christmas default on. Output goes
// to docs/evidence/christmas/<game-id>/<phase>-<desktop|mobile>.png.
// Needs a running dev server: ARCADE_URL (default http://127.0.0.1:4600).
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
import {existsSync} from 'node:fs';

const base=process.env.ARCADE_URL||'http://127.0.0.1:4600';
const [phase='after',...requested]=process.argv.slice(2);
const out=process.env.EVIDENCE_DIR||'docs/evidence/christmas';
const executablePath=existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined;

const wait=ms=>new Promise(r=>setTimeout(r,ms));
const click=async(page,name)=>{const b=page.getByRole('button',{name,exact:true});if(await b.count())await b.first().click({timeout:3000}).catch(()=>{});};
async function restart(page){await page.locator('#game-menu').click();await page.locator('#game-options').getByRole('button',{name:'Restart game',exact:true}).click();await wait(60);}
const stageBox=async page=>(await page.locator('#game-stage').boundingBox());
async function tapStage(page,fx,fy){const b=await stageBox(page);await page.mouse.click(b.x+b.width*fx,b.y+b.height*fy);}
async function keys(page,list,gap=120){for(const k of list){await page.keyboard.press(k);await wait(gap);}}

// Puts each game into representative active play. Interactions only use the
// player's own controls; nothing reaches into game state.
const actions={
  'fruit-merge':async page=>{for(const f of [.3,.5,.62,.45,.38,.55,.5,.7,.3,.4,.6,.35,.65,.5,.3,.7,.45,.55,.4,.6,.5,.35,.65,.5,.45,.55,.3,.7]){await tapStage(page,f,.25);await wait(1300);}await wait(1400);},
  'water-sort':async page=>{const tubes=page.locator('.ws-tube, [class*=tube]');if(await tubes.count()>1){await tubes.nth(0).click().catch(()=>{});await wait(300);await tubes.nth(1).click().catch(()=>{});}await wait(900);},
  'color-blocks':async page=>{
    // Drag each tray piece onto a different part of the board.
    const spots=[[.2,.2],[.7,.25],[.3,.7]];
    for(let i=0;i<3;i++){const piece=page.locator('.cb-piece').nth(i),board=await page.locator('.cb-board').boundingBox(),p=await piece.boundingBox();if(!p||!board)continue;
      await page.mouse.move(p.x+p.width/2,p.y+p.height/2);await page.mouse.down();await page.mouse.move(board.x+board.width*spots[i][0],board.y+board.height*spots[i][1],{steps:8});await page.mouse.up();await wait(400);}
    await wait(400);},
  // Drop when the slab passes over the tower: 0.2 s settle, then 145 units at 95+4h units/s.
  tower:async page=>{await restart(page);await wait(1000*145/95-60);for(let h=0;h<6;h++){await tapStage(page,.5,.5);await wait(200+1000*145/(95+4*(h+1)));}},
  snake:async page=>{await click(page,'Start slithering');await wait(900);},
  'neon-coil':async page=>{await click(page,'Play');await wait(4200);},
  // Reveal the centre, then flag three covered tiles: right-click on desktop, Flag mode + tap on touch.
  minesweeper:async page=>{const touch=await page.evaluate(()=>navigator.maxTouchPoints>0),tile=page.locator('.ms-tile[data-index="40"]');if(touch)await tile.tap();else await tile.click();await wait(500);if(touch)await page.getByRole('button',{name:'Flag mode',exact:true}).tap();for(const n of [1,6,12]){const t=page.locator('.ms-tile[data-state=hidden]').nth(n);if(touch)await t.tap().catch(()=>{});else await t.click({button:'right'}).catch(()=>{});await wait(250);}await wait(400);},
  // Follow four hints (move or draw), as a player would, then draw twice so the waste shows a card.
  solitaire:async page=>{for(let i=0;i<4;i++){await click(page,'Hint');await wait(250);const to=page.locator('.solitaire .sol-hint-target').first();if(await to.count())await to.click({position:{x:12,y:12}}).catch(()=>{});else await page.locator('.solitaire [data-key="stock"]').click().catch(()=>{});await wait(350);}for(let i=0;i<2;i++){await page.locator('.solitaire [data-key="stock"]').click().catch(()=>{});await wait(250);}await wait(300);},
  'block-fill':async page=>{await page.locator('.bf-board').focus();await keys(page,['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','ArrowRight','ArrowDown','ArrowLeft'],150);await page.locator('[data-action=hint]').click();await wait(500);},
  // Puzzle 1 (4x4): drag A and B home and lay most of C, leaving the board unfinished.
  'color-connect':async page=>{const at=async c=>{const b=await page.locator(`[data-cc-cell="${c}"]`).boundingBox();return [b.x+b.width/2,b.y+b.height/2];};for(const path of [[9,10,11,15],[12,13,14],[8,4,0,1,5]]){const [x,y]=await at(path[0]);await page.mouse.move(x,y);await page.mouse.down();for(const c of path.slice(1)){const [px,py]=await at(c);await page.mouse.move(px,py,{steps:4});await wait(40);}await page.mouse.up();await wait(250);}await wait(300);},
  'ball-run':async page=>{await click(page,'Play');await wait(3000);for(const k of ['ArrowLeft','ArrowRight']){await page.keyboard.down(k);await wait(250);await page.keyboard.up(k);await wait(500);}await wait(600);},
  pool:async page=>{await wait(800);await page.locator('.pool-table').focus();for(let i=0;i<10;i++){await page.keyboard.press('ArrowUp');await wait(40);}await page.keyboard.press('Enter');await wait(1100);},
  'animal-stack':async page=>{for(let i=0;i<5;i++){await page.locator('.animal-stack__drop:not([disabled])').waitFor({timeout:15000}).catch(()=>{});await page.locator('.animal-stack__drop').click({timeout:3000}).catch(()=>{});await wait(900);}await wait(400);},
  // Flap like a player watching the next opening: beat whenever the bird sinks below it.
  'flappy-bird':async page=>{await click(page,'Take flight');const end=Date.now()+6800;while(Date.now()<end){const s=await page.locator('.flappy-bird').evaluate(el=>({y:+el.dataset.y,vy:+el.dataset.vy,t:+el.dataset.target}));if(s.y>s.t+12&&s.vy>0)await page.keyboard.press('Space');await wait(30);}},
  globle:async page=>{await wait(2500);for(const c of ['France','Brazil','India']){const box=page.locator('.globle input:not([type=checkbox])').first();await box.fill(c);await box.press('Enter');await wait(900);}await wait(1500);},
  // Run left along the start row, turn down at the corner (read from the board's spoken label) and eat the bauble.
  'maze-muncher':async page=>{await page.getByRole('button',{name:'Start',exact:true}).click({timeout:20000});const label=()=>page.locator('.mm-svg').getAttribute('aria-label');let end=Date.now()+20000;while(Date.now()<end&&!/column [1-3],/.test(await label()))await wait(40);await page.keyboard.press('ArrowDown');end=Date.now()+8000;while(Date.now()<end&&!/frightened/.test(await label()))await wait(40);await wait(500);},
  'corn-clicker':async page=>{const cob=page.locator('.cc-cob');for(let i=0;i<40;i++){await cob.click({timeout:3000}).catch(()=>{});await wait(40);}for(let i=0;i<2;i++){await page.locator('.cc-prod:not(.cc-poor):not(.cc-mystery)').first().click({timeout:1500}).catch(()=>{});await wait(150);}for(let i=0;i<12;i++){await cob.click({timeout:3000}).catch(()=>{});await wait(60);}await wait(300);},
  slipline:async page=>{const tap=async sel=>{const g=page.locator(sel).first();if(await g.count()){const b=await g.locator('polygon').boundingBox();if(b)await page.mouse.click(b.x+b.width/2,b.y+b.height/2);}};await tap('.sl-board g[data-free=true]');await wait(900);await tap('.sl-board g[data-free=false]');await wait(500);},
  quadfall:async page=>{await click(page,'Start');await wait(400);const plan=[['ArrowLeft','ArrowLeft','ArrowLeft','ArrowLeft'],['ArrowRight','ArrowRight','ArrowRight','ArrowRight'],['ArrowUp'],['ArrowLeft','ArrowLeft'],['ArrowRight','ArrowRight','ArrowUp'],[]];for(const moves of plan){await keys(page,moves,60);await page.keyboard.press('Space');await wait(380);}await wait(700);},
  fivefold:async page=>{await page.keyboard.type('crane',{delay:60});await page.keyboard.press('Enter');await wait(1400);},
  // One closed loop (a capture), then a second loop left open so a live trail shows.
  claimline:async page=>{await page.getByRole('button',{name:'Play',exact:true}).click({timeout:20000});await wait(300);const hold=async(k,ms)=>{await page.keyboard.down(k);await wait(ms);await page.keyboard.up(k);};for(const [k,ms] of [['ArrowUp',900],['ArrowRight',900],['ArrowDown',900],['ArrowLeft',1100],['ArrowUp',700],['ArrowLeft',900],['ArrowDown',600]])await hold(k,ms);},
};
const ids=requested.length?requested:Object.keys(actions);
const browser=await chromium.launch({executablePath,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
for(const id of ids){
  mkdirSync(`${out}/${id}`,{recursive:true});
  for(const [label,viewport,mobile] of [['desktop',{width:1440,height:900},false],['mobile',{width:390,height:844},true]]){
    const context=await browser.newContext({viewport,deviceScaleFactor:1,hasTouch:mobile,isMobile:mobile,reducedMotion:'no-preference'});
    await context.addInitScript(festive=>{
      if(window!==window.top)return;
      localStorage.setItem('pocket-arcade:v1:accounts:guest','true');
      localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');
      sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
      if(festive==='off')localStorage.setItem('qcc:festive','off');else localStorage.removeItem('qcc:festive');
    },phase==='before'?'off':'on');
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}/#/game/${id}`);
    await page.locator('#game-stage').waitFor();await wait(1500);
    await page.locator('#game-stage').focus().catch(()=>{});
    await actions[id]?.(page);
    const file=`${out}/${id}/${phase}-${label}.png`;
    await page.screenshot({path:file});
    console.log(`${file}${errors.length?'  ERRORS: '+errors.join(' | '):''}`);
    await context.close();
  }
}
await browser.close();
