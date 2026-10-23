import { test, expect } from '../../fixtures';
import { createArena } from '../../../src/games/neon-coil/model';

test('a legacy 600-mass save eats, grows, renders and persists beyond 9,000',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const saved=createArena();saved.phase='running';const p=saved.snakes[0];p.mass=600;
 p.body=Array.from({length:388},(_,i)=>({x:-250*Math.sin(i*5/250),y:250-250*Math.cos(i*5/250)}));
 p.pathLength=p.body.reduce((sum,b,i)=>sum+(i?Math.hypot(b.x-p.body[i-1].x,b.y-p.body[i-1].y):0),0);
 saved.snakes.slice(1).forEach(b=>{b.alive=false;b.body=[];b.pathLength=0;b.diedAt=0});
 saved.food=Array.from({length:30},(_,i)=>({id:i+1,x:3,y:0,value:300,color:0,trail:false}));saved.nextFood=31;
 await page.addInitScript(s=>{if(!localStorage.getItem('qcc-growth-seeded')){localStorage.setItem('pocket-arcade:v1:save:neon-coil',JSON.stringify({version:1,data:s}));localStorage.setItem('qcc-growth-seeded','1');}},saved);
 await page.clock.install();await page.goto('/#/game/neon-coil');
 await page.getByRole('button',{name:'Continue arena',exact:true}).click();
 await page.keyboard.down('ArrowRight');await page.clock.runFor(1200);await page.keyboard.up('ArrowRight');
 await expect(page.locator('.nc-mass')).toHaveText('9600');
 await expect(page.locator('#game-score')).toContainText('9600');
 await expect(page.locator('.nc-ranking .is-you strong')).toHaveText('9600');
 await page.getByRole('button',{name:'Pause game',exact:true}).click();
 const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:neon-coil')!).data);
 expect(state.snakes[0].mass).toBe(9600);expect(state.snakes[0].pathLength).toBeGreaterThan(2000);
 expect(state.eaten).toBe(30);expect(state.snakes[0].body.length).toBeLessThanOrEqual(2048);
 await page.reload();await expect(page.getByRole('button',{name:'Continue arena',exact:true})).toBeVisible();
 await expect(page.locator('.nc-mass')).toHaveText('9600');
 expect(errors).toEqual([]);
});
