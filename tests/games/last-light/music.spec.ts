import {test,expect,originalTheme,type Page} from '../../fixtures';
import {appSettings} from '../../game-menu';
const url='/#/game/last-light';
test.beforeEach(async({context})=>{await originalTheme(context);});
async function capture(page:Page){
 await page.addInitScript(()=>{
  const sources:{node:AudioBufferSourceNode;offset:number;stopped:boolean}[]=[];
  (window as any).__llMusic=sources;
  const start=AudioBufferSourceNode.prototype.start,stop=AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.start=function(when=0,offset=0,duration?:number){
   if(this.buffer&&this.buffer.duration>60)sources.push({node:this,offset,stopped:false});
   if(duration===undefined)return start.call(this,when,offset);return start.call(this,when,offset,duration);
  };
  AudioBufferSourceNode.prototype.stop=function(when?:number){const found=sources.find(s=>s.node===this);if(found)found.stopped=true;return stop.call(this,when);};
 });
}
const sources=(page:Page)=>page.evaluate(()=>(window as any).__llMusic.map((s:any)=>({offset:s.offset,stopped:s.stopped,loop:s.node.loop,duration:s.node.buffer?.duration,context:s.node.context.state})));
const soundOn=(page:Page)=>page.addInitScript(()=>localStorage.setItem('pocket-arcade:v1:settings',JSON.stringify({sound:true})));

test('music is opt-in and makes no asset request while Sound is off',async({page})=>{
 let requests=0;page.on('request',r=>{if(r.url().includes('/audio/a-light-left-on.mp3'))requests++;});await capture(page);await page.goto(url);await page.getByRole('button',{name:'Play →'}).click();await page.waitForTimeout(400);
 expect(await sources(page)).toHaveLength(0);expect(requests).toBe(0);
});

test('native audio decodes and loops, follows pause and Sound, resumes its place, rewinds a new run and closes on leave',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await capture(page);await soundOn(page);await page.goto(url);
 expect(await sources(page)).toHaveLength(0);await page.getByRole('button',{name:'Play →'}).click();
 await expect.poll(async()=>(await sources(page)).length).toBe(1);expect((await sources(page))[0]).toMatchObject({loop:true,stopped:false,offset:0});expect((await sources(page))[0].duration).toBeCloseTo(71.1111,2);
 await page.waitForTimeout(220);await page.keyboard.press('p');await expect.poll(async()=>(await sources(page))[0].stopped).toBe(true);
 await page.getByRole('button',{name:'Resume →'}).click();await expect.poll(async()=>(await sources(page)).length).toBe(2);expect((await sources(page))[1].offset).toBeGreaterThan(.1);
 await appSettings(page);await page.locator('#sound').uncheck();await page.locator('#menu').getByRole('button',{name:'Close menu',exact:true}).click();await page.waitForTimeout(200);
 expect(await sources(page)).toHaveLength(2);expect((await sources(page)).every((s:any)=>s.stopped)).toBe(true);
 await appSettings(page);await page.locator('#sound').check();await page.locator('#menu').getByRole('button',{name:'Close menu',exact:true}).click();await expect.poll(async()=>(await sources(page)).length).toBe(3);
 await page.locator('.ll-canvas').focus();await page.keyboard.press('p');await page.getByRole('button',{name:'Start a new run',exact:true}).click();await page.getByRole('button',{name:'Start new run',exact:true}).click();await expect.poll(async()=>(await sources(page)).length).toBe(4);expect((await sources(page))[3].offset).toBe(0);
 await page.getByRole('link',{name:'Games',exact:true}).click();await expect.poll(async()=>(await sources(page)).every((s:any)=>s.stopped&&s.context==='closed')).toBe(true);expect(errors).toEqual([]);
});

test('an audio download finishing while paused stays silent until Continue',async({page,context})=>{
 let release!:()=>void,requested=false;const gate=new Promise<void>(resolve=>{release=resolve;});
 await context.route('**/audio/a-light-left-on.mp3',async route=>{requested=true;await gate;await route.continue();});
 await capture(page);await soundOn(page);await page.goto(url);await page.getByRole('button',{name:'Play →'}).click();await expect.poll(()=>requested).toBe(true);await page.keyboard.press('p');
 const response=page.waitForResponse(r=>r.url().includes('/audio/a-light-left-on.mp3'));release();await response;await page.waitForTimeout(250);expect(await sources(page)).toHaveLength(0);
 await page.getByRole('button',{name:'Resume →'}).click();await expect.poll(async()=>(await sources(page)).length).toBe(1);expect((await sources(page))[0].offset).toBe(0);
});
