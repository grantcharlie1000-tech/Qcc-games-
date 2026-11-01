import {test,expect} from '../../fixtures';

test('scoped touch styles give the stick and fire button their phone-sized hit areas',async({page})=>{
  await page.setViewportSize({width:844,height:390});await page.goto('/');
  await page.evaluate(async()=>{
    document.body.replaceChildren();
    const root=document.createElement('div');root.className='shooter-game';
    root.innerHTML='<div id="hud"></div>';document.body.append(root);
    const {default:TouchControls}=await import('/src/games/shooter/core/touch-controls.js' as string);
    const game={root,hudRoot:root.firstElementChild,state:{phase:'live'},player:{alive:true},
      weapons:{current:()=>({id:'usp'})},input:{locked:true,setTouchMode(){}},events:{on(){}},
      listen:(target:EventTarget|null,type:string,handler:EventListener,options?:AddEventListenerOptions)=>target?.addEventListener(type,handler,options)};
    const controls=new TouchControls(game,{search:'?touch=1'});controls.update();
  });
  const stick=await page.locator('.tc-stick').boundingBox(),fire=await page.locator('.tc-fire').boundingBox();
  expect(stick!.width).toBeGreaterThanOrEqual(100);expect(stick!.height).toBeGreaterThanOrEqual(100);
  expect(fire!.width).toBeGreaterThanOrEqual(72);expect(fire!.height).toBeGreaterThanOrEqual(72);
});

test('QCC toolbar buttons stay above phone controls without a banner',async({page})=>{
  await page.setViewportSize({width:844,height:390});await page.goto('/');
  await page.addStyleTag({path:'src/games/shooter/style.css'});
  await page.evaluate(()=>{
    document.body.classList.add('in-game');
    document.body.innerHTML='<section class="game-view" data-reference-game="true"><div class="game-toolbar"><a class="icon-button">Back</a>'+['pause-game','fullscreen-game','game-menu','rules-game','restart-game','favourite-game'].map(id=>`<button id="${id}" class="icon-button">x</button>`).join('')+'</div><div class="stage-wrap"><div id="game-stage"><div class="shooter-game touch-device"></div></div></div></section>';
  });
  for(const button of await page.locator('.game-toolbar button').all()){
    const box=(await button.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(44);
  }
  expect(await page.locator('.game-toolbar').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
});
