import {test,expect} from '../../fixtures';
import {createGame} from '../../../src/games/pool/model';

test('top trays identify groups and show each potted numbered ball',async({page})=>{
 const state=createGame('two');state.break=false;state.groups=['solids','stripes'];
 for(const id of [1,3,9,13])state.balls[id].pocketed=true;
 await page.goto('/');await page.evaluate(data=>localStorage.setItem('pocket-arcade:v1:save:pool',JSON.stringify({version:1,data})),state);
 await page.goto('/#/collection/14');const players=page.locator('.pool-player');await expect(players).toHaveCount(2);
 await expect(players.nth(0).locator('.pool-group-label')).toHaveText('SOLIDS · 1–7');await expect(players.nth(1).locator('.pool-group-label')).toHaveText('STRIPES · 9–15');
 for(const player of [players.nth(0),players.nth(1)]){await expect(player.locator('.pool-pot-slot')).toHaveCount(7);await expect(player.locator('.pool-pot-filled')).toHaveCount(2);await expect(player.locator('.pool-pot-count')).toHaveText('2 POTTED · 5 LEFT');}
 await expect(players.nth(0).getByLabel('Ball 1: potted',{exact:true})).toBeVisible();await expect(players.nth(1).getByLabel('Ball 13: potted',{exact:true})).toBeVisible();
 const table=(await page.locator('.pool-table').boundingBox())!,tray=(await players.nth(0).boundingBox())!,meter=(await page.locator('.pool-cue-meter').boundingBox())!;
 expect(tray.y+tray.height).toBeLessThan(table.y);expect(meter.x+meter.width).toBeLessThan(table.x);
 await page.locator('.pool-table').focus();await page.keyboard.press('ArrowUp');await expect(page.locator('.pool-power-value')).toHaveText('100%');
 await page.setViewportSize({width:390,height:844});await expect(players.nth(0).getByLabel('Ball 1: potted',{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('trays update while the other balls are still rolling',async({page})=>{
 const state=createGame('two');state.break=false;state.groups=['solids','stripes'];state.phase='moving';state.shots=1;
 state.shot={first:1,pots:[],cushions:[],scratch:false,eligible8:false,break:false};
 Object.assign(state.balls[1],{x:75,y:420,vx:-300,vy:0});Object.assign(state.balls[8],{x:320,y:600,vx:120,vy:0});
 await page.goto('/');await page.evaluate(data=>localStorage.setItem('pocket-arcade:v1:save:pool',JSON.stringify({version:1,data})),state);
 await page.goto('/#/collection/14');await expect(page.getByLabel('Ball 1: potted',{exact:true})).toBeVisible();await expect(page.locator('.pool-game')).toHaveAttribute('data-phase','moving');
});

test('clearing the group changes the badge to the eight ball',async({page})=>{
 const state=createGame('two');state.break=false;state.groups=['solids','stripes'];for(let id=1;id<=7;id++)state.balls[id].pocketed=true;
 await page.goto('/');await page.evaluate(data=>localStorage.setItem('pocket-arcade:v1:save:pool',JSON.stringify({version:1,data})),state);
 await page.goto('/#/collection/14');const player=page.locator('.pool-player').first();await expect(player.locator('.pool-group-label')).toHaveText('ON THE 8');await expect(player.locator('.pool-group-symbol')).toHaveText('8');await expect(player.locator('.pool-pot-filled')).toHaveCount(7);
});
