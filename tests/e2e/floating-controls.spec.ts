import {test,expect} from '../fixtures';
import {GAME_IDS} from '../../src/core/types';

for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1366,height:768}]){
  test(`all 21 games have safe floating controls without a painted banner at ${viewport.width}×${viewport.height}`,async({page})=>{
    test.setTimeout(180000);await page.setViewportSize(viewport);
    for(const id of GAME_IDS){
      await page.goto(`/#/game/${id}`);
      // The first software-rendered WebGL scene can compile past the default
      // seven-second assertion deadline on a shared CI worker.
      await expect(page.locator('.loading')).toHaveCount(0,{timeout:30000});
      await expect(page.locator('#game-stage>*').first()).toBeVisible();
      const layout=await page.locator('.game-view').evaluate(view=>{
        const dock=view.querySelector<HTMLElement>('.game-dock')!,surface=view.querySelector('.game-surface')!,s=getComputedStyle(dock),v=getComputedStyle(view);
        const r=dock.getBoundingClientRect(),b=surface.getBoundingClientRect();
        return{paddingTop:v.paddingTop,paint:[s.backgroundColor,s.backgroundImage,s.backdropFilter,s.boxShadow],surface:{x:b.x,y:b.y,w:b.width,h:b.height},dock:{x:r.x,y:r.y,w:r.width,h:r.height},overflow:document.documentElement.scrollWidth>innerWidth};
      });
      expect(layout.paddingTop,id).toBe('0px');
      expect(layout.paint,id).toEqual(['rgba(0, 0, 0, 0)','none','none','none']);
      expect(layout.surface,id).toEqual({x:0,y:0,w:viewport.width,h:viewport.height});
      expect(layout.dock.x,id).toBeGreaterThanOrEqual(0);expect(layout.dock.x+layout.dock.w,id).toBeLessThanOrEqual(viewport.width);
      expect(layout.dock.y,id).toBeGreaterThanOrEqual(0);expect(layout.dock.y+layout.dock.h,id).toBeLessThanOrEqual(viewport.height);expect(layout.overflow,id).toBe(false);
      if(await page.locator('.game-dock[data-sheet-hidden]').count())continue;
      const collisions=await page.locator('#game-stage').evaluate(stage=>{
        const d=document.querySelector('.game-dock')!.getBoundingClientRect();
        return [...stage.querySelectorAll<HTMLElement>('button,input,select')].filter(el=>{
          if(el.closest('details:not([open])')&&!el.closest('summary'))return false;
          const r=el.getBoundingClientRect();let left=r.left,right=r.right,top=r.top,bottom=r.bottom;
          // Large minefields deliberately scroll inside a clipped frame. Cells
          // outside that scrollport have no painted/input area under the dock.
          for(let p=el.parentElement;p&&p!==stage.parentElement;p=p.parentElement){
            const s=getComputedStyle(p),b=p.getBoundingClientRect();
            if(s.overflowX!=='visible'){left=Math.max(left,b.left);right=Math.min(right,b.right);}
            if(s.overflowY!=='visible'){top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);}
          }
          return right>left&&bottom>top&&getComputedStyle(el).visibility!=='hidden'&&left<d.right&&right>d.left&&top<d.bottom&&bottom>d.top;
        }).map(el=>el.getAttribute('aria-label')||el.textContent?.trim()||el.className);
      });
      expect(collisions,`${id}: native controls clear floating controls`).toEqual([]);
    }
  });
}
for(const width of [390,1366])test(`Movies/TV header floats as bounded glass groups at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});
  await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
  for(const route of ['movie','tv']){
    await page.goto(`/#/movies/browse/${route}`);
    const header=page.locator('.movies-top');await expect(header).toBeVisible();
    await expect(header).toHaveCSS('background-color','rgba(0, 0, 0, 0)');await expect(header).toHaveCSS('backdrop-filter','none');await expect(header).toHaveCSS('border-bottom-width','0px');
    await expect(header.locator('.floating-glass-group')).toHaveCount(3);
    for(const group of await header.locator('.floating-glass-group').all()){
      if(!await group.isVisible())continue;
      await expect(group).toHaveAttribute('data-glass',/backdrop|frost/);
      expect((await group.boundingBox())!.width).toBeLessThan(width-24);
    }
    expect((await page.locator('.movies-page-head').boundingBox())!.y).toBe(0);
  }
});
