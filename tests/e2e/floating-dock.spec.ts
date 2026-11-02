import {test,expect} from '../fixtures';
import {build} from 'esbuild';
let component:string;
test.use({serviceWorkers:'block'});
test.beforeAll(async()=>{const result=await build({stdin:{contents:"export {createGameDock} from './src/ui/floating-controls';export {bindDockClearance} from './src/ui/dock-layout';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',loader:{'.css':'empty'}});component=Buffer.from(result.outputFiles[0].text).toString('base64');});
const overlaps=(a:{x:number;y:number;width:number;height:number},b:typeof a)=>a.x<b.x+b.width-.5&&b.x<a.x+a.width-.5&&a.y<b.y+b.height-.5&&b.y<a.y+a.height-.5;
for(const size of [{width:320,height:844},{width:390,height:844},{width:844,height:390},{width:1366,height:768}])test(`compact leading dock floats without consuming a Snake row at ${size.width}x${size.height}`,async({page})=>{
 await page.setViewportSize(size);await page.goto('/#/collection');await expect(page.locator('.section-menu')).toBeVisible();const height=(await page.locator('.section-menu').boundingBox())!.height;await page.goto('/#/game/snake');await expect(page.locator('.game-view')).toHaveAttribute('data-game-chrome','ready');await expect(page.locator('.game-hud strong').first()).toBeVisible();const dock=page.locator('.game-dock');
 await expect(dock).toHaveCSS('position','absolute');await expect(dock).toHaveAttribute('data-dock-placement','top-left');
 const parts=await dock.locator(':scope>.game-glass').all();
 expect(parts.length).toBe(3);for(const part of parts){const r=(await part.boundingBox())!;expect(r.height).toBe(height);expect(r.height).toBeGreaterThanOrEqual(44);}
 const bounds=(await dock.boundingBox())!,stage=(await page.locator('.stage-wrap').boundingBox())!,board=(await page.locator('.snake-canvas').boundingBox())!;
 expect(bounds.x).toBeLessThanOrEqual(20);expect(bounds.y).toBeLessThanOrEqual(16);expect(bounds.width).toBeLessThan(Math.min(380,size.width-24));expect(stage.height).toBeGreaterThanOrEqual(size.height-20);
 for(const part of parts)expect(overlaps((await part.boundingBox())!,board)).toBe(false);
 expect(await page.locator('#game-menu svg').innerHTML()).toContain('M4 6h16');
});

async function fixture(page:import('@playwright/test').Page,code:string){
 await page.route('**/__dock_fixture__.js',r=>r.fulfill({contentType:'text/javascript',body:Buffer.from(code,'base64')}));
 await page.goto('/#/game/snake');await expect(page.locator('.game-view')).toHaveAttribute('data-game-chrome','ready');await expect(page.locator('.game-hud strong')).toBeVisible();
 return page.evaluateHandle(async()=>{
  const {createGameDock}=await import(String('/__dock_fixture__.js')),presses:string[]=[];
  const dock=createGameDock({backHref:'#/collection',backIcon:'',menuIcon:'',title:'Snake'});document.querySelector('.game-dock')!.replaceWith(dock.root);
  dock.setStats([{label:'Level',value:12}]);dock.setActions([{id:'undo',label:'Undo',icon:'undo',onPress:()=>presses.push('undo')},{id:'hint',label:'Hint',icon:'hint',onPress:()=>presses.push('hint')}]);return {dock,presses};
 });
}
for(const width of [320,390,1366])test(`typed action slots fit and retain identity, focus and callbacks at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});const api=await fixture(page,component),dock=page.locator('.game-dock');
 const order=await dock.locator(':scope>.game-glass').evaluateAll(elements=>elements.map(e=>e.getAttribute('aria-label')));expect(order).toEqual(['Games','Undo','Game information','Hint','Menu']);
 const r=(await dock.boundingBox())!;expect(r.x).toBeGreaterThanOrEqual(8);expect(r.x+r.width).toBeLessThanOrEqual(width-8);
 const heights=await dock.locator(':scope>.game-glass').evaluateAll(elements=>elements.map(e=>e.getBoundingClientRect().height));expect(new Set(heights).size).toBe(1);expect(heights[0]).toBeGreaterThanOrEqual(44);
 const undo=dock.getByRole('button',{name:'Undo',exact:true}),identity=await undo.elementHandle();await undo.focus();
 await api.evaluate(({dock,presses})=>dock.setActions([{id:'undo',label:'Undo',icon:'undo',onPress:()=>presses.push('updated')},{id:'hint',label:'Hint',icon:'hint',onPress:()=>presses.push('hint'),disabled:true}]));
 expect(await identity!.evaluate(e=>e===document.querySelector('[data-dock-action=undo]'))).toBe(true);await expect(undo).toBeFocused();await page.keyboard.press('Enter');await expect(dock.getByRole('button',{name:'Hint',exact:true})).toBeDisabled();expect(await api.evaluate(({presses})=>presses)).toEqual(['updated']);
 await api.evaluate(({dock})=>dock.setStats([{label:'Score',value:'999,999'},{label:'Level',value:32},{label:'Lines',value:120}]));
 const hud=dock.locator('.game-hud');const text=await hud.evaluate(e=>({width:e.clientWidth,content:e.scrollWidth}));expect(text.content).toBeLessThanOrEqual(text.width+1);
 await api.evaluate(({dock})=>dock.dispose());await undo.click();expect(await api.evaluate(({presses})=>presses)).toEqual(['updated']);
});


test('headroom is released when typed controls contract',async({page})=>{
 await page.setViewportSize({width:844,height:390});await page.route('**/__dock_fixture__.js',r=>r.fulfill({contentType:'text/javascript',body:Buffer.from(component,'base64')}));
 await page.goto('/#/game/snake');await expect(page.locator('.game-view')).toHaveAttribute('data-game-chrome','ready');
 const api=await page.evaluateHandle(async()=>{
  const {createGameDock,bindDockClearance}=await import(String('/__dock_fixture__.js'));
  const view=document.createElement('section');view.className='game-view';view.dataset.gameId='snake';view.innerHTML='<div class="game-surface"></div><div class="stage-wrap"><div id="game-stage" style="height:100%;display:grid;place-items:center"><div class="snake-canvas" style="width:360px;height:min(360px,100%)"></div></div></div>';
  document.querySelector('.game-view')!.replaceWith(view);
  const dock=createGameDock({backHref:'#/collection',backIcon:'',menuIcon:''});view.prepend(dock.root);dock.setStats([{label:'Score',value:'999,999'},{label:'Level',value:32},{label:'Lines',value:120}]);dock.setActions([{id:'undo',label:'Undo',icon:'undo',onPress(){}},{id:'hint',label:'Hint',icon:'hint',onPress(){}}]);const layout=bindDockClearance(view,'snake');return {dock,layout};
 });
 await expect.poll(()=>page.locator('.game-view').evaluate(e=>parseFloat((e as HTMLElement).style.getPropertyValue('--game-dock-clearance'))||0)).toBeGreaterThan(0);
 const before=(await page.locator('.stage-wrap').boundingBox())!.height;
 await api.evaluate(({dock})=>{dock.setActions([]);dock.setStats([{label:'Score',value:0}]);});
 await expect.poll(()=>page.locator('.game-view').evaluate(e=>parseFloat((e as HTMLElement).style.getPropertyValue('--game-dock-clearance'))||0)).toBe(0);
 expect((await page.locator('.stage-wrap').boundingBox())!.height).toBeGreaterThan(before);
 await api.evaluate(({dock,layout})=>{layout.dispose();dock.dispose();});
});
