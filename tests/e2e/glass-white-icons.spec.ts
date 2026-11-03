import {test,expect} from '../fixtures';

test.use({viewport:{width:393,height:852}});

async function whiteGlyphs(scope:import('@playwright/test').Locator){
  const glyphs=await scope.evaluateAll(roots=>roots.flatMap(root=>[root,...root.querySelectorAll('svg,svg path,svg line,svg circle,span,small,strong,kbd')].filter(e=>{
    const s=getComputedStyle(e),r=e.getBoundingClientRect();
    return r.width>1&&r.height>1&&s.visibility!=='hidden'&&s.display!=='none'&&(!e.querySelector('svg,span,small,strong,kbd')||e instanceof SVGElement)&&!e.matches('.ui-glass-glow,.ui-glass-lens,.ui-nav-icon g');
  }).map(e=>{const s=getComputedStyle(e);return {glyph:e.tagName+':'+e.textContent?.trim().slice(0,35),color:s.color,opacity:s.opacity,filter:s.filter,halo:e.hasAttribute('data-glass-halo')};})));
  expect(glyphs.length).toBeGreaterThan(0);
  for(const glyph of glyphs){
    expect(glyph.color,JSON.stringify(glyph)).toBe('rgb(255, 255, 255)');
    expect(glyph.opacity,JSON.stringify(glyph)).toBe('1');
    expect(glyph.filter,JSON.stringify(glyph)).toBe('none');
    expect(glyph.halo,JSON.stringify(glyph)).toBe(false);
  }
}

for(const background of ['#fff','#000'])test(`navigation glyphs stay white over ${background}, hover, press and scroll`,async({page})=>{
  await page.goto('/#/collection');
  await page.addStyleTag({content:`.game-card{background:${background}!important}.game-card>*{visibility:hidden!important}body{background:${background}!important}`});
  const scope=page.locator('.section-tabbar .ui-tab,.section-menu');
  await whiteGlyphs(scope);
  const games=page.locator('.section-tabbar .ui-tab').first();await games.hover();await whiteGlyphs(scope);
  await page.mouse.down();try{await whiteGlyphs(scope);}finally{await page.mouse.move(1,1);await page.mouse.up();}
  await page.evaluate(()=>window.scrollTo(0,650));
  await expect(page.locator('.section-tabbar')).toHaveAttribute('data-minimized','true');
  const mini=page.locator('.ui-tabbar-mini');await whiteGlyphs(mini);await mini.click();
  await expect(page.locator('.section-tabbar')).not.toHaveAttribute('data-minimized','true');
  await whiteGlyphs(scope);
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await whiteGlyphs(page.locator('#menu button'));
});

test('game glass buttons keep white glyphs over a bright canvas and while pressed',async({page})=>{
  await page.goto('/#/game/claimline');await page.locator('.cl-start').click();
  const controls=page.locator('.game-dock>.arcade-glass');await whiteGlyphs(controls);
  const back=page.locator('.game-dock>a.arcade-glass').first();await back.hover();await whiteGlyphs(controls);
  await page.mouse.down();try{await whiteGlyphs(controls);}finally{await page.mouse.move(1,1);await page.mouse.up();}
});
