import {test,expect} from '../../fixtures';

test('touch drag turns before release and can make an L-shaped turn',async({page,context,browserName})=>{
 await page.setViewportSize({width:390,height:844});
 await page.clock.install({time:new Date('2026-10-20T10:00:00Z')});
 await page.clock.pauseAt(new Date('2026-10-20T10:00:01Z'));
 await page.goto('/#/game/snake');
 await page.getByRole('button',{name:'Start slithering',exact:true}).click();
 const box=(await page.locator('.snake-canvas').boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2;
 const canvas=page.locator('.snake-canvas');
 // CDP touch is Chromium-only. WebKit drives the same held pointermove threshold with a mouse drag.
 const cdp=browserName==='chromium'?await context.newCDPSession(page):null;
 if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 else {await page.mouse.move(x,y);await page.mouse.down();}
 async function move(nx:number,ny:number){
  if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:nx,y:ny}]});
  else await page.mouse.move(nx,ny);
 }
 await move(x,y-30);
 await page.clock.runFor(190);
 const first=await canvas.getAttribute('aria-label');
 console.log('Held after upward swipe:',first);
 const firstHead=first?.match(/Head column ([\d.]+), row ([\d.]+)\./);
 expect(firstHead).not.toBeNull();
 expect(Number(firstHead![1])).toBeCloseTo(7,1);
 expect(Number(firstHead![2])).toBeGreaterThan(6);
 expect(Number(firstHead![2])).toBeLessThan(7);
 await move(x-30,y-30);
 await page.clock.runFor(160);
 const second=await canvas.getAttribute('aria-label');
 console.log('Held after leftward swipe:',second);
 const secondHead=second?.match(/Head column ([\d.]+), row ([\d.]+)\./);
 expect(secondHead).not.toBeNull();
 expect(Number(secondHead![1])).toBeGreaterThan(6);
 expect(Number(secondHead![1])).toBeLessThan(7);
 expect(Number(secondHead![2])).toBeCloseTo(6,1);
 if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 else await page.mouse.up();
});
