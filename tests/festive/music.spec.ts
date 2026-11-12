import {test,expect,type Page} from '../fixtures';
async function prepare(page:Page,sound=true){
 await page.addInitScript(sound=>{
  localStorage.setItem('pocket-arcade:v1:settings',JSON.stringify({sound}));
  const sources:{node:AudioBufferSourceNode;offset:number;stopped:boolean}[]=[];(window as any).__appMusic=sources;
  const start=AudioBufferSourceNode.prototype.start,stop=AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.start=function(when=0,offset=0,duration?:number){if(this.buffer&&this.buffer.duration>55)sources.push({node:this,offset,stopped:false});if(duration===undefined)return start.call(this,when,offset);return start.call(this,when,offset,duration);};
  AudioBufferSourceNode.prototype.stop=function(when?:number){const item=sources.find(s=>s.node===this);if(item)item.stopped=true;return stop.call(this,when);};
 },sound);
}
const sources=(page:Page)=>page.evaluate(()=>(window as any).__appMusic.map((s:any)=>({offset:s.offset,stopped:s.stopped,duration:s.node.buffer?.duration,context:s.node.context.state})));
const active=(page:Page)=>sources(page).then((a:any[])=>a.filter(s=>!s.stopped));
const menuButton=(page:Page)=>page.locator('.app-navigation').getByRole('button',{name:'Open menu',exact:true});

test('starts on a gesture and keeps one Christmas loop across the library and games',async({page})=>{
 let christmasRequests=0,gameRequests=0;page.on('request',r=>{if(r.url().includes('/audio/christmas/'))christmasRequests++;if(r.url().includes('/audio/a-light-left-on.mp3'))gameRequests++;});
 await prepare(page);await page.goto('/#/collection');await page.waitForTimeout(200);expect(christmasRequests).toBe(0);expect(await sources(page)).toHaveLength(0);
 await page.getByRole('link',{name:'Play Last Light',exact:true}).click();await expect(page.locator('.ll-game')).toBeVisible();await expect.poll(async()=>(await active(page)).length).toBe(1);
 expect((await active(page))[0].duration).toBeCloseTo(60,2);await page.getByRole('button',{name:'Carry the light →'}).click();await page.waitForTimeout(200);expect(gameRequests).toBe(0);expect(await sources(page)).toHaveLength(1);
 await page.getByRole('link',{name:'Games',exact:true}).click();await expect(page.getByRole('link',{name:'Play Snake',exact:true})).toBeVisible();await page.getByRole('link',{name:'Play Snake',exact:true}).click();await expect(page.locator('.game-view')).toHaveAttribute('data-game-id','snake');
 expect(await sources(page)).toHaveLength(1);expect(christmasRequests).toBe(1);expect(await active(page)).toHaveLength(1);
});

test('Sound and Christmas controls immediately mute and resume the app soundtrack',async({page})=>{
 await prepare(page,false);await page.goto('/#/collection');await menuButton(page).click();await page.waitForTimeout(150);expect(await sources(page)).toHaveLength(0);
 await page.locator('#sound').check();await expect.poll(async()=>(await active(page)).length).toBe(1);await page.waitForTimeout(200);
 await page.locator('#sound').uncheck();expect(await active(page)).toHaveLength(0);
 await page.locator('#sound').check();await expect.poll(async()=>(await active(page)).length).toBe(1);expect((await active(page))[0].offset).toBeGreaterThan(.1);
 await page.locator('#festive').uncheck();expect(await active(page)).toHaveLength(0);await page.locator('#festive').check();await expect.poll(async()=>(await active(page)).length).toBe(1);
});

test('Study Mode and movie/TV watch routes stay quiet; browsing resumes the same piece',async({page})=>{
 await prepare(page);await page.goto('/#/collection');await menuButton(page).click();await expect.poll(async()=>(await active(page)).length).toBe(1);await page.waitForTimeout(150);
 await page.locator('#open-study').click();await expect(page.locator('#study-view')).toBeVisible();expect(await active(page)).toHaveLength(0);
 await page.locator('.study-article-body').getByRole('link',{name:'Return to previous view',exact:true}).click();await expect.poll(async()=>(await active(page)).length).toBe(1);expect((await active(page))[0].offset).toBeGreaterThan(.05);
 await page.evaluate(()=>{location.hash='#/movies/movie-frost/play';});await expect.poll(async()=>(await active(page)).length).toBe(0);
 await page.evaluate(()=>{location.hash='#/movies/browse/movie';});await expect.poll(async()=>(await active(page)).length).toBe(1);
 await page.evaluate(()=>{location.hash='#/movies/tv-snow/season/1/episode/2/play';});await expect.poll(async()=>(await active(page)).length).toBe(0);
});

test('losing focus and pagehide stop audio; return resumes without duplicate sources',async({page,context,browserName})=>{
 test.skip(browserName!=='chromium','Native tab focus is verified through Chromium’s focus emulation control.');
 await prepare(page);await page.goto('/#/collection');await menuButton(page).click();await expect.poll(async()=>(await active(page)).length).toBe(1);await page.waitForTimeout(200);
 // Disable Playwright's forced focus, then use the browser's real blur/focus lifecycle.
 const client=await context.newCDPSession(page);await client.send('Emulation.setFocusEmulationEnabled',{enabled:false});
 const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();await expect.poll(async()=>(await active(page)).length).toBe(0);
 await page.bringToFront();await expect.poll(async()=>(await active(page)).length).toBe(1);
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));expect(await active(page)).toHaveLength(0);
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await expect.poll(async()=>(await active(page)).length).toBe(1);await other.close();
});

test('Breachline holds the app soundtrack while it is open; other games keep it',async({page})=>{
 await prepare(page);await page.goto('/#/collection');await menuButton(page).click();await expect.poll(async()=>(await active(page)).length).toBe(1);
 await page.evaluate(()=>{location.hash='#/game/breachline';});await expect(page.locator('.game-view')).toHaveAttribute('data-game-id','breachline');
 await expect.poll(async()=>(await active(page)).length).toBe(0);
 await page.evaluate(()=>{location.hash='#/game/snake';});await expect(page.locator('.game-view')).toHaveAttribute('data-game-id','snake');
 await expect.poll(async()=>(await active(page)).length).toBe(1);
 await page.evaluate(()=>{location.hash='#/game/breachline';});await expect.poll(async()=>(await active(page)).length).toBe(0);
 await page.evaluate(()=>{location.hash='#/collection';});await expect.poll(async()=>(await active(page)).length).toBe(1);
});
