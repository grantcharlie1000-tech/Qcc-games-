import {test,expect,type Page} from '../../fixtures';
async function beginAction(page:Page){
 await expect.poll(()=>page.evaluate(()=>(window as any).__game.state.phase)).toBe('pick');
 expect(await page.evaluate(()=>{const g=(window as any).__game;return g.state.requestPick(g.localSeat,{locked:true});})).toBe(true);
 await expect.poll(()=>page.evaluate(()=>(window as any).__game.state.phase)).toBe('prep');
 await page.evaluate(()=>(window as any).__game.state.timer=.01);await expect.poll(()=>page.evaluate(()=>(window as any).__game.state.phase),{timeout:15000}).toBe('action');
}
for(const [tier,dpr,scale] of [['low',1,.75],['medium',1.5,1],['high',2,1]] as const)test(`${tier} renders its real quality path and respects its DPR cap`,async({browser})=>{
 test.setTimeout(180000);const context=await browser.newContext({viewport:{width:800,height:450},deviceScaleFactor:2});const {seedStudyTopic}=await import('../../fixtures');await seedStudyTopic(context);const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|WebGL|THREE/.test(m.text()))errors.push(m.text());});
 try{await page.goto(`/?quality=${tier}&test#/game/strongroom`);await expect(page.locator('.strongroom-game')).toHaveAttribute('data-models','true',{timeout:120000});expect(await page.locator('.strongroom-game>canvas').evaluate((c:HTMLCanvasElement)=>[c.width,c.height])).toEqual([Math.floor(800*dpr*scale),Math.floor(450*dpr*scale)]);await page.getByRole('button',{name:'Play vs bots',exact:true}).click();await page.getByRole('button',{name:'Start match',exact:true}).click();await beginAction(page);await expect.poll(()=>page.evaluate(()=>(window as any).__game.stats.draws)).toBeGreaterThan(0);expect(errors).toEqual([]);}finally{await context.close();}
});
