import {test,expect,type Page} from '../../fixtures';
import {openGameMenu} from '../../game-menu';
import {powerShot,poolState,poolAim,seedPool,tableToScreen} from './helpers';
import {createGame,type PoolState} from '../../../src/games/pool/game';
import {R,L,W,POCKETS} from '../../../src/games/pool/physics';

const root=(page:Page)=>page.locator('.pool-game');
async function settle(page:Page){await expect(root(page)).not.toHaveAttribute('data-phase','moving',{timeout:30000});}

/** Player 1 has potted every solid; the 8 sits in front of the top-right corner. */
function onTheEight(mode:'ai'|'two'='ai'):PoolState{
  const s=createGame(mode,'medium',5);
  s.breakShot=false;s.hand=null;s.groups=['solids','stripes'];s.shots=12;
  for(let id=1;id<=7;id++){s.balls[id].on=false;s.potted.push(id);}
  Object.assign(s.balls[8],{x:1.72,y:.28});Object.assign(s.balls[0],{x:1.25,y:.52});
  const spots:[number,number][]=[[1.5,.75],[1.3,.2],[.6,.5],[.9,.8],[1.7,.8],[.4,.2],[1.0,.3]];
  [9,10,11,12,13,14,15].forEach((id,i)=>Object.assign(s.balls[id],{x:spots[i][0],y:spots[i][1]}));
  return s;
}
const ghostAngle=(s:PoolState,pocket:number)=>{
  const e=s.balls[8],c=s.balls[0],p=POCKETS[pocket],tx=p.mx-e.x,ty=p.my-e.y,n=Math.hypot(tx,ty);
  return Math.atan2(e.y-ty/n*2*R-c.y,e.x-tx/n*2*R-c.x);
};

test.describe('Pool',()=>{
  test('breaks from the keyboard and the rack plays on',async({page})=>{
    // A fresh game shuffles its rack from the clock, and some racks make the default break illegal (re-racked below),
    // so this test fixes a rack whose default break is legal.
    await seedPool(page,createGame('ai','medium',5));
    await page.setViewportSize({width:1366,height:768});await page.goto('/#/game/pool');
    await expect(root(page)).toHaveAttribute('data-hand','kitchen');
    await page.locator('.pool-table').focus();await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');
    await expect(root(page)).toHaveAttribute('data-phase','moving');await expect(root(page)).toHaveAttribute('data-shots','1');
    await settle(page);
    const s=await poolState(page);
    expect(s.breakShot).toBe(false);
    expect(s.balls.filter(b=>b.on).every(b=>b.x>=R-1e-6&&b.x<=L-R+1e-6&&b.y>=R-1e-6&&b.y<=W-R+1e-6)).toBe(true);
    await expect(page.locator('.pool-message')).not.toBeEmpty();
  });

  test('an illegal break re-racks for the opponent, who breaks again',async({page})=>{
    // With this rack the default keyboard break sends fewer than four balls to a cushion and pots nothing.
    // Two players, so the computer does not take the re-break before the result is read.
    const before=createGame('two','medium',101);await seedPool(page,before);
    await page.setViewportSize({width:1366,height:768});await page.goto('/#/game/pool');
    await expect(root(page)).toHaveAttribute('data-hand','kitchen');
    await page.locator('.pool-table').focus();await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');
    await expect(root(page)).toHaveAttribute('data-phase','moving');await settle(page);
    const s=await poolState(page);
    expect(s.breakShot).toBe(true);expect(s.hand).toBe('kitchen');expect(s.turn).toBe(1-before.turn);
    expect(s.balls.every(b=>b.on)).toBe(true);
    expect(s.foul).toBe('Illegal break');
  });

  test('the power cue shoots on release and cancels when pushed back to the top',async({page})=>{
    await page.setViewportSize({width:1366,height:768});await page.goto('/#/game/pool');
    const bar=(await page.locator('.pool-power').boundingBox())!,x=bar.x+bar.width/2,y=bar.y+bar.height*.12;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+bar.height*.5,{steps:6});
    await expect(page.locator('.pool-power')).not.toHaveAttribute('aria-valuenow','0');
    await page.mouse.move(x,y-10,{steps:6});await page.mouse.up();
    await expect(root(page)).toHaveAttribute('data-shots','0');await expect(root(page)).toHaveAttribute('data-phase','aim');
    await powerShot(page,.7);
    await expect(root(page)).toHaveAttribute('data-shots','1');await expect(root(page)).toHaveAttribute('data-phase','moving');
  });

  test('dragging on the cloth points the cue at the finger, and the fine wheel nudges it',async({page})=>{
    await page.setViewportSize({width:1366,height:768});await page.goto('/#/game/pool');
    const s=await poolState(page),cue=s.balls[0];
    const target=await tableToScreen(page,cue.x+.3,cue.y-.3);
    await page.mouse.move(target.x+40,target.y);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:5});await page.mouse.up();
    const aimed=(await poolState(page)).aim.angle;expect(aimed).toBeCloseTo(-Math.PI/4,1);
    const fine=(await page.locator('.pool-fine').boundingBox())!;
    await page.mouse.move(fine.x+fine.width/2,fine.y+fine.height/2);await page.mouse.down();await page.mouse.move(fine.x+fine.width/2,fine.y+fine.height/2+40,{steps:5});await page.mouse.up();
    const nudged=(await poolState(page)).aim.angle;
    expect(Math.abs(nudged-aimed)).toBeGreaterThan(.005);expect(Math.abs(nudged-aimed)).toBeLessThan(.08);
    expect(await poolState(page)).toMatchObject({shots:0});
  });

  test('ball in hand: drag the cue ball to a clear spot; a spot on another ball is refused',async({page})=>{
    const s=createGame('two','medium',2);s.breakShot=false;s.hand='table';s.foul='Scratch';s.turn=1;
    Object.assign(s.balls[0],{x:L/2,y:W/2});
    await seedPool(page,s);await page.setViewportSize({width:1366,height:768});await page.goto('/#/game/pool');
    await expect(root(page)).toHaveAttribute('data-hand','table');
    const from=await tableToScreen(page,L/2,W/2),to=await tableToScreen(page,.5,.3);
    await page.mouse.move(from.x,from.y);await page.mouse.down();await expect(root(page)).toHaveAttribute('data-gesture','place');
    await page.mouse.move(to.x,to.y,{steps:8});await page.mouse.up();
    let cue=(await poolState(page)).balls[0];expect(cue.x).toBeCloseTo(.5,1);expect(cue.y).toBeCloseTo(.3,1);
    const other=(await poolState(page)).balls[5],start=await tableToScreen(page,cue.x,cue.y),onto=await tableToScreen(page,other.x,other.y);
    await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(onto.x,onto.y,{steps:8});await page.mouse.up();
    cue=(await poolState(page)).balls[0];expect(cue.x).toBeCloseTo(.5,1);
    // Keyboard placement: H, arrows, Enter.
    await page.locator('.pool-table').focus();await page.keyboard.press('h');for(let i=0;i<5;i++)await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
    expect((await poolState(page)).balls[0].x).toBeGreaterThan(.55);
  });

  test('on the 8: tap a pocket to call it, sink it there, then rack again',async({page})=>{
    const s=onTheEight();await seedPool(page,s);await page.setViewportSize({width:1366,height:768});await page.goto('/#/game/pool');
    await expect(page.locator('.pool-sub')).toContainText('call a pocket');
    const corner=await tableToScreen(page,POCKETS[2].x,POCKETS[2].y);await page.mouse.click(corner.x,corner.y);
    expect((await poolState(page)).called).toBe(2);
    expect(await poolAim(page,ghostAngle(s,2),.4)).toBe(true);
    await page.locator('.pool-table').focus();await page.keyboard.press('Enter');
    await expect(page.locator('.pool-result')).toBeVisible({timeout:30000});
    await expect(page.locator('.pool-result h2')).toHaveText('You win!');
    await expect(page.locator('.pool-result-score')).toContainText('1 – 0');
    await page.locator('.pool-again').click();
    await expect(page.locator('.pool-result')).toBeHidden();
    const next=await poolState(page);expect(next.rack).toBe(2);expect(next.breaker).toBe(1);expect(next.wins).toEqual([1,0]);
  });

  test('the 8 in an uncalled pocket loses the rack',async({page})=>{
    const s=onTheEight('two');await seedPool(page,s);await page.setViewportSize({width:1366,height:768});await page.goto('/#/game/pool');
    // Call the far bottom-left corner, then pot the 8 in the top-right.
    await page.locator('.pool-table').focus();
    for(let i=0;i<6&&(await poolState(page)).called!==3;i++)await page.keyboard.press('p');
    expect((await poolState(page)).called).toBe(3);
    await poolAim(page,ghostAngle(s,2),.4);await page.keyboard.press('Enter');
    await expect(page.locator('.pool-result')).toBeVisible({timeout:30000});
    await expect(page.locator('.pool-result h2')).toHaveText('Player 2 wins');
    await expect(page.locator('.pool-result-why')).toContainText('wrong pocket');
  });

  test('spin picker sets follow and draw, and closes with Done',async({page})=>{
    await page.setViewportSize({width:1366,height:768});await page.goto('/#/game/pool');
    await page.locator('.pool-spin').click();await expect(page.locator('.pool-spin-panel')).toBeVisible();
    const big=(await page.locator('.pool-spin-big').boundingBox())!;
    await page.mouse.click(big.x+big.width/2,big.y+big.height*.2);
    expect((await poolState(page)).aim.spinY).toBeGreaterThan(.4);
    await expect(page.locator('.pool-spin')).toHaveAttribute('aria-label',/Follow/);
    await page.mouse.click(big.x+big.width/2,big.y+big.height*.82);
    await expect(page.locator('.pool-spin')).toHaveAttribute('aria-label',/Draw/);
    await page.getByRole('button',{name:'Done'}).click();await expect(page.locator('.pool-spin-panel')).toBeHidden();
  });

  test('the computer takes its turn and hands the table back',async({page})=>{
    const s=createGame('ai','easy',9);s.breakShot=false;s.hand=null;s.turn=1;
    await seedPool(page,s);await page.setViewportSize({width:1366,height:768});await page.goto('/#/game/pool');
    await expect(page.locator('.pool-message')).toContainText('Computer');
    await expect(root(page)).toHaveAttribute('data-shots','1',{timeout:15000});
    await settle(page);
    const after=await poolState(page);expect(after.shots).toBeGreaterThanOrEqual(1);
  });

  test('progress survives a reload and two-player mode names both players',async({page})=>{
    await page.setViewportSize({width:1366,height:768});await page.goto('/#/game/pool');
    await powerShot(page,.8);await settle(page);
    const before=await poolState(page);
    await page.reload();await expect(root(page)).toHaveAttribute('data-shots',String(before.shots));
    expect((await poolState(page)).balls).toEqual(before.balls);
    await openGameMenu(page);await page.locator('#game-options').getByLabel('Players',{exact:true}).selectOption('two');
    await expect(page.locator('.pool-player').nth(1)).toContainText('Player 2');
    await expect(root(page)).toHaveAttribute('data-shots','0');
  });

  for(const viewport of [{width:390,height:844},{width:1366,height:768},{width:844,height:390},{width:768,height:1024}]){
    test(`fits ${viewport.width}×${viewport.height} with controls clear of the table`,async({page})=>{
      await page.setViewportSize(viewport);await page.goto('/#/game/pool');
      await expect(page.locator('.pool-table')).toBeVisible();
      const box=(name:string)=>page.locator(name).boundingBox().then(b=>b!);
      const table=await box('.pool-table-box'),power=await box('.pool-power'),hud=await box('.pool-hud'),dock=await box('.game-dock');
      for(const b of [table,power,hud])expect(b.x>=-1&&b.x+b.width<=viewport.width+1).toBe(true);
      expect(power.x+power.width<=table.x+1||power.y>=table.y+table.height-1).toBe(true);
      expect(hud.y+hud.height).toBeLessThanOrEqual(table.y+1);
      expect(table.y+table.height).toBeLessThanOrEqual(dock.y+1);
      expect(table.width*table.height).toBeGreaterThan(viewport.width*viewport.height*.25);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      for(const name of await page.locator('.pool-player-name').all())expect(await name.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
      if(viewport.width===390)await page.screenshot({path:'tests/games/pool/evidence/chromium.png'});
    });
  }

  test('touch: aim with a finger and shoot with the power cue',async({browser,browserName})=>{
    const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:3});
    await context.addInitScript(()=>{localStorage.setItem('pocket-arcade:v1:accounts:guest','true');localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');});
    const page=await context.newPage();
    try{
      await page.goto('/#/game/pool');await expect(root(page)).toHaveAttribute('data-orient','portrait');
      for(const sel of ['.pool-table','.pool-power'])expect(await page.locator(sel).evaluate(e=>getComputedStyle(e).touchAction),`${sel} keeps the finger from scrolling`).toBe('none');
      type TouchType='touchStart'|'touchMove'|'touchEnd';
      let touch:(type:TouchType,points:{x:number;y:number}[])=>Promise<unknown>;
      if(browserName==='chromium'){
        // Real touch input through the browser's input pipeline.
        const cdp=await context.newCDPSession(page);
        touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({...p,id:i+1}))});
      }else{
        // Handler-level coverage only: CDP is Chromium-only and Playwright's touchscreen can only tap, so WebKit drives the same gestures as touch
        // pointer events (what Pool listens to) aimed at the element under the finger. Pointer id 1 is always active,
        // so the game's setPointerCapture accepts it.
        let last={x:0,y:0};
        touch=async(type,points)=>{
          const point=points[0]??last;last=point;
          return page.evaluate(({type,point,first})=>{
            const w=window as unknown as {__poolTouchTarget?:Element|null};
            if(first)w.__poolTouchTarget=document.elementFromPoint(point.x,point.y);
            const el=w.__poolTouchTarget;if(!el)throw new Error('nothing under the finger');
            const name=type==='touchStart'?'pointerdown':type==='touchMove'?'pointermove':'pointerup';
            el.dispatchEvent(new PointerEvent(name,{bubbles:true,cancelable:true,composed:true,pointerId:1,pointerType:'touch',isPrimary:true,button:type==='touchMove'?-1:0,buttons:type==='touchEnd'?0:1,clientX:point.x,clientY:point.y}));
          },{type,point,first:type==='touchStart'});
        };
      }
      const s=await poolState(page),aim=await tableToScreen(page,s.balls[0].x+.4,s.balls[0].y-.2);
      await touch('touchStart',[aim]);await touch('touchMove',[{x:aim.x+3,y:aim.y}]);await touch('touchEnd',[]);
      expect((await poolState(page)).aim.angle).toBeCloseTo(Math.atan2(-.2,.4),1);
      const bar=(await page.locator('.pool-power').boundingBox())!,x=bar.x+bar.width/2,y=bar.y+40;
      await touch('touchStart',[{x,y}]);for(let i=1;i<=6;i++)await touch('touchMove',[{x,y:y+i*40}]);
      await expect(root(page)).toHaveAttribute('data-gesture','pull');
      await touch('touchEnd',[]);
      await expect(root(page)).toHaveAttribute('data-shots','1');
      // Only real touch input (CDP) can scroll the page, so the scroll check is meaningful there; WebKit's synthetic events cover the handlers.
      if(browserName==='chromium')expect(await page.evaluate(()=>scrollY)).toBe(0);
    }finally{await context.close();}
  });
});
