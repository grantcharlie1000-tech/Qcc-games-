import {test, expect} from '../../fixtures';
import {generate,initial,free} from '../../../src/games/slipline/model';

for(const level of [1,12,20,50]){
  test(`available arrows agree with the model throughout removals on level ${level}`,async({page})=>{
    const board=generate(level),saved=initial(level,level);
    await page.addInitScript(value=>localStorage.setItem('pocket-arcade:v1:save:slipline',JSON.stringify({version:1,data:value,updated:1})),saved);
    await page.goto('/#/game/slipline');
    const svg=page.locator('.sl-board');await expect(svg).toBeVisible();
    await expect(page.locator('.sl-level')).toHaveText(`Level ${level}`);
    const removed=new Set<string>();
    for(let step=0;step<Math.min(8,board.arrows.length);step++){
      const active=board.arrows.filter(a=>!removed.has(a.id)).map(a=>a.id);
      const expected=Object.fromEntries(board.arrows.filter(a=>!removed.has(a.id)).map(a=>[a.id,String(free(board,a,active))]));
      const actual=await svg.locator('g[data-id]').evaluateAll(nodes=>Object.fromEntries(nodes.map(node=>[node.getAttribute('data-id'),node.getAttribute('data-free')])));
      expect(actual).toEqual(expected);
      const first=board.arrows.find(a=>!removed.has(a.id)&&free(board,a,active));
      if(!first)break;
      const route=svg.locator(`g[data-id="${first.id}"] polyline`);
      const point=await route.evaluate((node:SVGPolylineElement)=>{const p=node.getPointAtLength(node.getTotalLength()/2),m=node.getScreenCTM()!;return{x:p.x*m.a+p.y*m.c+m.e,y:p.x*m.b+p.y*m.d+m.f};});
      await page.mouse.click(point.x,point.y);
      await expect(svg.locator(`g[data-id="${first.id}"]`)).toHaveCount(0);
      removed.add(first.id);
    }
  });
}
