import {test,expect} from '../fixtures';

test.use({viewport:{width:390,height:844},hasTouch:true});
// Keep daily round seeding stable across an Auckland-midnight boundary.
test.beforeEach(async({page})=>{await page.clock.setFixedTime(new Date('2026-11-06T00:00:00Z'));});

// Removing the dock's optical layers made the controls disappear on dark art.
for(const route of ['color-connect','crossy-road'])test(`game glass retains frost and highlights on ${route}`,async({page})=>{
  await page.goto(`/#/game/${route}`);
  const controls=page.locator('.game-dock>.arcade-glass');
  await expect(controls).toHaveCount(3);
  for(const control of await controls.all()){
    // Game chrome mounts before the asynchronous material layers are attached.
    await expect(control).toHaveAttribute('data-glass',/^(backdrop|frost)$/);
    await expect(control.locator(':scope>.ui-glass-glow')).toHaveCount(1);
    const material=await control.evaluate(e=>({
      shadow:getComputedStyle(e,'::before').boxShadow,
      fill:getComputedStyle(e,'::before').backgroundColor,
      sheen:getComputedStyle(e,'::before').backgroundImage,
      rim:getComputedStyle(e.querySelector('.ui-glass-glow')!).backgroundImage,
      frost:getComputedStyle(e).getPropertyValue('--glass-frost')
    }));
    expect(material.shadow).not.toBe('none');
    expect(material.sheen).not.toBe('none');
    expect(material.rim).not.toBe('none');
    expect(material.frost).toMatch(/blur\([1-9]/);
    expect(material.fill).toMatch(/^rgba\(.+, 0\.[0-9]+\)$/);
    await expect(control).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  }
  await test.info().attach(`${route}-glass`,{body:await page.screenshot(),contentType:'image/png'});
});

// A transparent dock is not enough when the globe itself stops at a framed card.
for(const festive of ['off','christmas'])test(`Globle scene fills the viewport under floating controls (${festive})`,async({page})=>{
  await page.addInitScript(value=>localStorage.setItem('qcc:festive',value),festive);
  await page.goto('/#/game/globle');
  await expect(page.locator('.gl-globe canvas')).toBeVisible();
  const bounds=async()=>page.locator('.game-view').evaluate(view=>{
    const scene=view.querySelector('.gl-globe-wrap')!,search=view.querySelector('.gl-search')!,dock=view.querySelector('.game-dock')!;
    const plain=(e:Element)=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
    return {view:plain(view),scene:plain(scene),search:plain(search),dock:plain(dock),radius:getComputedStyle(scene).borderRadius};
  });
  for(const viewport of [{width:390,height:844},{width:844,height:390},{width:390,height:440}]){
    await page.setViewportSize(viewport);
    await expect.poll(async()=>{const b=await bounds();return Math.max(...(['x','y','width','height'] as const).map(k=>Math.abs(b.view[k]-b.scene[k])));}).toBeLessThan(2);
    const b=await bounds();expect(b.radius).toBe('0px');
    expect(b.search.y).toBeGreaterThanOrEqual(b.scene.y);
    expect(b.dock.y+b.dock.height).toBeLessThanOrEqual(b.scene.y+b.scene.height);
    expect(b.dock.y).toBeGreaterThan(b.search.y+b.search.height);
  }
  await test.info().attach(`globle-${festive}-full-bleed`,{body:await page.screenshot(),contentType:'image/png'});
  const wrongCountry=await page.evaluate(async()=>{
    const path='/src/games/globle/model.ts',m=await import(path),state=m.createState(m.aucklandDate());
    return m.nameOf(state.daily.answer==='FRA'?'NZL':'FRA');
  });
  await page.locator('.gl-input').fill(wrongCountry);
  await page.getByRole('button',{name:'Guess',exact:true}).click();
  await expect(page.locator('.gl-guess')).toHaveCount(1);
  await expect(page.locator('.gl-message')).not.toBeEmpty();
  await expect(page.locator('.gl-history')).toBeVisible();
  const overlaps=await page.locator('.gl-history').evaluate(history=>{
    const h=history.getBoundingClientRect(),d=document.querySelector('.game-dock')!.getBoundingClientRect();return h.bottom>d.top;
  });
  expect(overlaps).toBe(false);
  for(let i=0;i<2;i++){
    await page.locator('#game-menu').click();
    await expect(page.locator('#game-options')).toBeVisible();
    await page.getByRole('button',{name:'Close game menu',exact:true}).click();
    await expect(page.locator('#game-options')).toBeHidden();
    await expect(page.locator('#game-menu')).toBeFocused();
  }
});


test('Globle keeps floating controls inside the reduced visual viewport',async({page})=>{
  await page.goto('/#/game/globle');
  await page.locator('.gl-input').focus();
  await page.evaluate(()=>{
    Object.defineProperties(window.visualViewport!,{height:{configurable:true,get:()=>360},offsetTop:{configurable:true,get:()=>40}});
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('.globle')).toHaveClass(/gl-keyboard/);
  await expect.poll(()=>page.locator('.game-view').evaluate(e=>Math.round(e.getBoundingClientRect().height))).toBe(360);
  const positions=await page.locator('.game-view').evaluate(view=>{
    const v=view.getBoundingClientRect(),input=view.querySelector('.gl-input')!.getBoundingClientRect(),dock=view.querySelector('.game-dock')!.getBoundingClientRect();
    return {top:v.top,bottom:v.bottom,inputTop:input.top,inputBottom:input.bottom,dockBottom:dock.bottom};
  });
  expect(positions.inputTop).toBeGreaterThanOrEqual(positions.top);
  expect(positions.inputBottom).toBeLessThan(positions.bottom);
  expect(positions.dockBottom).toBeLessThanOrEqual(positions.bottom);
  await expect(page.locator('.gl-input')).toBeFocused();
});

test('Globle winning result stays clear of the dock and replaces overlapping summaries',async({page})=>{
  await page.setViewportSize({width:390,height:440});
  await page.goto('/#/collection');
  await page.evaluate(async()=>{
    const path='/src/games/globle/model.ts',m=await import(path),state=m.createState(m.aucklandDate());
    m.applyGuess(state,state.daily.answer);
    localStorage.setItem('pocket-arcade:v1:save:globle',JSON.stringify({version:1,data:m.serializeState(state)}));
  });
  await page.goto('/#/game/globle');
  await expect(page.locator('.gl-win')).toBeVisible();
  await expect(page.locator('.gl-chip')).toBeHidden();
  await expect(page.locator('.gl-history')).toBeHidden();
  const result=(await page.locator('.gl-win').boundingBox())!,dock=(await page.locator('.game-dock').boundingBox())!;
  expect(result.y+result.height).toBeLessThanOrEqual(dock.y);
  await page.getByRole('button',{name:'Play a practice round',exact:true}).click();
  await expect(page.locator('.gl-win')).toBeHidden();
  await expect(page.locator('.gl-input')).toBeFocused();
});
