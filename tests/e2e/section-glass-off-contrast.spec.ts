import {test,expect} from '../fixtures';
import type {Page} from '@playwright/test';

// Glass-off bars (more contrast, reduced transparency) are opaque near-white slabs. The C30 accent, rim and smoked pill belong
// to the lens and its CSS blur fallback only, so here the selected tab keeps the bar's dark --glass-ink and the light pill.
const parse=(colour:string)=>(colour.match(/[\d.]+/g)??[]).map(Number);
const over=(top:number[],bottom:number[])=>{const alpha=top.length===4?top[3]:1;return [0,1,2].map(i=>top[i]*alpha+bottom[i]*(1-alpha));};
const luminance=(rgb:number[])=>{
  const [r,g,b]=rgb.slice(0,3).map(value=>{const v=value/255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});
  return .2126*r+.7152*g+.0722*b;
};
const contrast=(a:number[],b:number[])=>{const [hi,lo]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (hi+.05)/(lo+.05);};

async function selected(page:Page){
  const bar=page.locator('.app-tabbar');
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute('data-glass','off');
  const look=await bar.evaluate(el=>{
    const tab=el.querySelector('.ui-tab[aria-current=page]')!;
    const label=getComputedStyle(tab.querySelector(':scope>span')!);
    const glyph=getComputedStyle(tab.querySelector(':scope>.ui-icon')!);
    return {bar:getComputedStyle(el).backgroundColor,pill:getComputedStyle(el,'::after').backgroundColor,
      label:label.color,weight:label.fontWeight,shadow:label.textShadow,glyph:glyph.color,filter:glyph.filter};
  });
  const ground=over(parse(look.pill),parse(look.bar));
  return {...look,labelRatio:contrast(parse(look.label),ground),glyphRatio:contrast(parse(look.glyph),ground)};
}

// The pre-91942bad glass-off selection: #0b1015 at weight 700 with no rim, on a 16% white pill over the #f1f3f5 bar (17.5:1).
async function expectPlainSelection(page:Page){
  const plain={bar:'rgb(241, 243, 245)',pill:'rgba(255, 255, 255, 0.16)',label:'rgb(11, 16, 21)',glyph:'rgb(11, 16, 21)',weight:'700',shadow:'none',filter:'none'};
  await expect.poll(()=>selected(page)).toMatchObject(plain);
  const look=await selected(page);
  expect(look.labelRatio).toBeGreaterThanOrEqual(7);
  expect(look.glyphRatio).toBeGreaterThanOrEqual(7);
}

test.beforeEach(async({page})=>{
  await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
  await page.setViewportSize({width:390,height:844});
});

for(const scheme of ['light','dark'] as const){
  test(`more contrast keeps the selected section tab dark on the opaque bar (${scheme})`,async({page})=>{
    await page.emulateMedia({colorScheme:scheme,contrast:'more'});
    await page.goto('/');
    await expectPlainSelection(page);
  });

  test(`reduced transparency keeps the selected section tab dark on the opaque bar (${scheme})`,async({page,browserName})=>{
    test.skip(browserName!=='chromium','only Chromium can emulate prefers-reduced-transparency');
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'},{name:'prefers-color-scheme',value:scheme}]});
    await page.goto('/');
    await expectPlainSelection(page);
  });

  // The other side of the scope: the frosted CSS fallback (no WebGL lens, as after context loss or a rejected crop) still
  // draws the C30 accent and smoked pill. ?glass=fallback skips the section lens outright.
  test(`the CSS blur fallback keeps the C30 accent selection (${scheme})`,async({page})=>{
    await page.emulateMedia({colorScheme:scheme});
    await page.goto('/?glass=fallback');
    const bar=page.locator('.app-tabbar');
    await expect(bar).toBeVisible();
    await expect(bar).not.toHaveAttribute('data-glass','off');
    await expect(bar).not.toHaveAttribute('data-section-lens','webgl');
    const accent=scheme==='light'?'rgb(255, 55, 95)':'rgb(0, 153, 255)';
    await expect.poll(()=>bar.evaluate(el=>{
      const tab=el.querySelector('.ui-tab[aria-current=page]')!;
      return {label:getComputedStyle(tab.querySelector(':scope>span')!).color,glyph:getComputedStyle(tab.querySelector(':scope>.ui-icon')!).color,
        pill:getComputedStyle(el,'::after').backgroundColor};
    })).toEqual({label:accent,glyph:accent,pill:'rgba(0, 0, 0, 0.34)'});
  });
}
