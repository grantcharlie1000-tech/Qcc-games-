import {test,expect} from '../../fixtures';

// A controllable native-exit acknowledgement exercises routing while a real
// game would be saving. Actual upstream engine/world checks are separate.
async function controlledPlayer(page:import('@playwright/test').Page){
  await page.route('**/voxelibre/index.html?*',route=>route.fulfill({
    contentType:'text/html',headers:{'Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Opener-Policy':'same-origin'},
    body:`<!doctype html><html><body><button id="study">Study shortcut</button><script>
      window.commands=[];
      window.addEventListener('message',e=>{if(e.source===parent&&e.origin===location.origin)window.commands.push(e.data);});
      window.emit=(event,extra={})=>parent.postMessage({type:'QCC_VOXELIBRE_EVENT',event,...extra},location.origin);
      document.querySelector('#study').onclick=()=>emit('study');emit('ready');emit('running',{persistent:true});
    </script></body></html>`
  }));
  await page.goto('/#/game/voxelibre');
  await page.locator('.voxelibre-frame').waitFor();
  const frame=page.frameLocator('.voxelibre-frame');await frame.locator('#study').waitFor();
  return frame;
}

test('the library keeps the native engine download lazy',async({page})=>{
  const native:string[]=[];page.on('request',request=>{if(request.url().includes('/voxelibre/runtime/'))native.push(request.url());});
  await page.goto('/');await expect(page.getByRole('link',{name:'Play VoxeLibre',exact:true})).toBeVisible();
  expect(native).toEqual([]);
});

test('Back waits for a matching native exit, including overlapping navigation',async({page})=>{
  const frame=await controlledPlayer(page);
  await page.getByRole('link',{name:'Back to game library'}).click();
  await expect(page.locator('.voxelibre-frame')).toBeAttached();
  await expect.poll(()=>frame.locator('body').evaluate(()=>((window as any).commands as any[]).filter(x=>x.command==='quit').length)).toBe(1);
  await page.evaluate(()=>{location.hash='#/game/water-sort';});
  await page.evaluate(()=>{location.hash='#/game/snake';});
  await frame.locator('body').evaluate(()=> (window as any).emit('exited',{requestId:'not-the-active-quit'}));
  await expect(page.locator('.voxelibre-frame')).toBeAttached();
  await frame.locator('body').evaluate(()=>{
    const commands=(window as any).commands.filter((x:any)=>x.command==='quit');
    if(commands.length!==1)throw new Error('Shutdown was requested more than once');
    (window as any).emit('exited',{requestId:commands[0].requestId});
  });
  await expect(page.locator('#game-title')).toHaveText('Snake');
  await expect(page.locator('.voxelibre-frame')).toHaveCount(0);
});

test('a failed native exit keeps the frame and lets Back retry',async({page})=>{
  const frame=await controlledPlayer(page);
  await page.getByRole('link',{name:'Back to game library'}).click();
  await expect.poll(()=>frame.locator('body').evaluate(()=>(window as any).commands.some((x:any)=>x.command==='quit'))).toBe(true);
  await frame.locator('body').evaluate(()=>{
    const quit=(window as any).commands.find((x:any)=>x.command==='quit');
    (window as any).emit('error',{requestId:quit.requestId,message:'Could not finish saving. Retry Back to library.'});
  });
  await expect(page).toHaveURL(/#\/game\/voxelibre$/);
  await expect(page.locator('#game-status')).toContainText('Could not finish saving');
  await page.getByRole('link',{name:'Back to game library'}).click();
  await expect.poll(()=>frame.locator('body').evaluate(()=>(window as any).commands.filter((x:any)=>x.command==='quit').length)).toBe(2);
  await frame.locator('body').evaluate(()=>{
    const quit=(window as any).commands.filter((x:any)=>x.command==='quit').at(-1);
    (window as any).emit('exited',{requestId:quit.requestId});
  });
  await expect(page.locator('.game-card')).toHaveCount(14);
});

test('only the game frame can invoke Study and the frame survives the chapter',async({page})=>{
  const frame=await controlledPlayer(page),original=await page.locator('.voxelibre-frame').elementHandle();
  await page.evaluate(()=>window.postMessage({type:'QCC_VOXELIBRE_EVENT',event:'study'},location.origin));
  await expect(page.locator('#study-view')).toBeHidden();
  await frame.locator('#study').click();
  await expect(page.locator('#study-view')).toBeVisible();
  await expect(page.locator('#study-view')).toContainText('Worlds save separately');
  await page.getByRole('button',{name:'Return to Arcade',exact:true}).click();
  expect(await original!.evaluate(element=>element===document.querySelector('.voxelibre-frame'))).toBe(true);
});

test('unsupported browsers explain compatibility before downloading the game',async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(WebAssembly,'promising',{value:undefined,configurable:true});});
  const native:string[]=[];page.on('request',request=>{if(request.url().includes('/voxelibre/runtime/'))native.push(request.url());});
  await page.goto('/#/game/voxelibre');
  const frame=page.frameLocator('.voxelibre-frame');
  await expect(frame.locator('#notice-message')).toContainText('cannot run the VoxeLibre engine');
  await expect(frame.getByRole('button',{name:/Play VoxeLibre/})).toBeDisabled();
  expect(native).toEqual([]);
  await page.getByRole('link',{name:'Back to game library'}).click();
  await expect(page.locator('.game-card')).toHaveCount(14);
});

test('blocked one-time browser setup offers recovery instead of waiting forever',async({page})=>{
  await page.clock.install();
  await page.addInitScript(()=>{
    Object.defineProperty(window,'crossOriginIsolated',{value:false});
    Object.defineProperty(navigator.serviceWorker,'ready',{value:new Promise(()=>{})});
  });
  await page.goto('/#/game/voxelibre');
  await expect(page.getByRole('button',{name:'Preparing…',exact:true})).toBeDisabled();
  await page.clock.fastForward(13000);
  await expect(page.getByRole('button',{name:'Reload QCC',exact:true})).toBeEnabled();
  await expect(page.locator('.voxelibre-setup')).toContainText('Browser setup is unavailable');
  await page.getByRole('link',{name:'Back to game library'}).click();
  await expect(page.locator('.game-card')).toHaveCount(14);
});
