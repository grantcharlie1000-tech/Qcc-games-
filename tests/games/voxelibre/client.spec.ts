import {test,expect} from '../../fixtures';

// The actual client runs against a controllable native lifecycle. This checks
// that unrelated page errors cannot acknowledge exit while a world is live.
const nativeStub=`
globalThis.Module={};globalThis.nativeQuitCalls=0;
globalThis.emloop_request_exit=()=>{nativeQuitCalls++;};
globalThis.LuantiArgs=class {};
globalThis.LuantiLauncher=class {
  constructor(){globalThis.nativeEngine=this;}
  isReady(){return true;} isPersistent(){return true;}
  setProxy(){} setConf(){} overrideConf(){} addPack(){return Promise.resolve();}
  launch(){document.body.innerHTML='<canvas id="canvas"></canvas>';}
};`;

for(const kind of ['error','unhandledrejection'] as const){
  test(`an unrelated ${kind} still waits for native save and exit`,async({page})=>{
    await page.addInitScript(()=>{
      // Only the launcher is real in this controlled-runtime test. Enable
      // feature gates on WebKit too; no native WASM execution is claimed.
      Object.defineProperty(WebAssembly,'Suspending',{value:function(){},configurable:true});
      Object.defineProperty(WebAssembly,'promising',{value:function(){},configurable:true});
      if(!globalThis.OffscreenCanvas)Object.defineProperty(globalThis,'OffscreenCanvas',{value:function(){},configurable:true});
      if(!HTMLCanvasElement.prototype.transferControlToOffscreen)Object.defineProperty(HTMLCanvasElement.prototype,'transferControlToOffscreen',{value:function(){},configurable:true});
    });
    await page.route('**/voxelibre/runtime/launcher.js',route=>route.fulfill({contentType:'text/javascript',body:nativeStub}));
    await page.goto('/#/game/voxelibre');
    const frame=page.frameLocator('.voxelibre-frame');
    await frame.getByRole('button',{name:/Play VoxeLibre/}).click();
    await expect(frame.locator('#canvas')).toBeVisible();
    await frame.locator('body').evaluate((_,eventKind)=>{
      const error=new Error('Unrelated page exception');
      if(eventKind==='error')window.dispatchEvent(new ErrorEvent('error',{error,message:error.message,filename:location.origin+'/unrelated-ui.js'}));
      else window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection',{reason:error,promise:Promise.resolve()}));
    },kind);
    await expect(frame.locator('.native-error')).toContainText('Unrelated page exception');
    await page.getByRole('link',{name:'Back to game library'}).click();
    await expect.poll(()=>frame.locator('body').evaluate(()=>(window as any).nativeQuitCalls)).toBe(1);
    await expect(page.locator('.voxelibre-frame')).toBeAttached();
    await frame.locator('body').evaluate(()=>(window as any).nativeEngine.onexit(0));
    await expect(page.locator('.game-card')).toHaveCount(14);
    await expect(page.locator('.voxelibre-frame')).toHaveCount(0);
  });
}
