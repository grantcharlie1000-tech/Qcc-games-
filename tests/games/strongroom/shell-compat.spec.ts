import {test,expect} from '../../fixtures';

for(const tier of ['medium','high'])test(`${tier} home and sheet buttons do not create app tabbar overlays`,async({page})=>{
 test.setTimeout(60000);
 // Safari/frost is the path on which the shared tabbar helper inserts scroll edges.
 await page.addInitScript(()=>Object.defineProperty(navigator,'userAgentData',{value:undefined}));
 await page.goto('/#/collection');
 await expect(page.locator('.game-card')).toHaveCount(21);
 const overlays=await page.evaluate(async tier=>{
  // Exercise the real HUD without compiling the unrelated 3D scene.
  const modulePath='/src/games/strongroom/ui/hud.ts';
  const {HUD}=await import(modulePath);
  const host=document.createElement('div');host.className='strongroom-game';document.body.append(host);
  const noop=()=>{};
  const hud=new HUD(host,{start:noop,play:noop,home:noop,sheet:noop,quality:noop,settings:{},remap:noop,maxTeam:()=>3,currentTier:()=>tier},false);
  try{
   const home=host.querySelectorAll('.ui-scroll-edge').length;
   hud.rules();
   await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
   return{home,sheet:host.querySelectorAll('.ui-scroll-edge').length};
  }finally{hud.dispose();host.remove();}
 },tier);
 expect(overlays).toEqual({home:0,sheet:0});
});
