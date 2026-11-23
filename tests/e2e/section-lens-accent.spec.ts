import {expect,test} from '../fixtures';

// MOTION-8 (#24 review of MOTION-7, finding 1): the tab under the raised lens takes its accent a sixth of the way to white
// while the press lasts (a5416727), as every frame of Charlie's video press shows its glyph's ink easing lighter (154 -> 193
// luma over about 200 ms, 19.60-19.80 s). Only the glyph's opacity eased, so the colour stepped in one frame at the press
// (light luma about 100 -> 125, dark 128 -> 148) and back at the release: the size of pop 630a4fc2 fixed. Here the timeline
// runs at .1x and the label's and icon's colour are read every frame: no frame may carry more than a third of the change.
for(const scheme of ['light','dark'] as const)test(`the lens target's lighter accent eases in on the press and back on the release (${scheme})`,async({page,browserName})=>{
  test.skip(browserName!=='chromium','the timeline is slowed through the Chromium DevTools protocol');
  await page.emulateMedia({colorScheme:scheme});
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  const games=bar.getByRole('link',{name:'Games',exact:true});
  await expect(games).toHaveAttribute('aria-current','page');
  const box=(await games.boundingBox())!;
  // The tabs take the lens's ink when the WebGL lens comes up, which eases too: let that finish before the timeline slows.
  await page.waitForFunction(()=>document.querySelector('.app-tabbar')!.getAnimations({subtree:true})
    .every(a=>a.playState!=='running'||a.effect?.getComputedTiming().iterations===Infinity));
  await page.waitForTimeout(300);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate',{playbackRate:.1});
  await page.evaluate(()=>{
    type Ink={t:number;label:number;icon:number};
    const w=window as Window&{__ink?:Ink[];__stop?:boolean};
    const tab=document.querySelector('.app-tabbar a.ui-tab[href="#/collection"]')!;
    const label=tab.querySelector(':scope>span')!,icon=tab.querySelector('svg')!;
    // Any colour syntax the transition serialises (rgb, color(srgb), oklab) is read back as sRGB through a canvas.
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
    const luma=(color:string)=>{ctx.clearRect(0,0,1,1);ctx.fillStyle='#000';ctx.fillStyle=color;ctx.fillRect(0,0,1,1);const [r,g,b]=ctx.getImageData(0,0,1,1).data;return .2126*r+.7152*g+.0722*b;};
    w.__ink=[];
    // Read after the frame's animation callbacks (tabbar.ts marks the lens target in one of them), as the frame is painted.
    const sample=()=>{w.__ink!.push({t:performance.now(),label:luma(getComputedStyle(label).color),icon:luma(getComputedStyle(icon).color)});if(!w.__stop)next();};
    const next=()=>requestAnimationFrame(()=>setTimeout(sample,0));
    next();
  });
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await expect(bar).toHaveAttribute('data-pressing','');
  await page.waitForTimeout(2400);
  await page.mouse.up();
  await expect(bar).not.toHaveAttribute('data-pressing','');
  await page.waitForTimeout(2400);
  await cdp.send('Animation.setPlaybackRate',{playbackRate:1});
  const ink=await page.evaluate(()=>{const w=window as Window&{__ink?:{t:number;label:number;icon:number}[];__stop?:boolean};w.__stop=true;return w.__ink!;});
  expect(ink.length).toBeGreaterThan(20);
  for(const key of ['label','icon'] as const){
    const series=ink.map(sample=>Math.round(sample[key]*10)/10);
    const change=Math.max(...series)-Math.min(...series);
    expect(change,`${key}: the press lightens the accent ${JSON.stringify(series)}`).toBeGreaterThan(12);
    // It eases back to the plain accent on the release.
    expect(Math.abs(series.at(-1)!-series[0]),`${key}: back to the accent ${JSON.stringify(series)}`).toBeLessThanOrEqual(1);
    const step=Math.max(...series.slice(1).map((value,i)=>Math.abs(value-series[i])));
    expect(step,`${key}: largest one-frame step of ${change.toFixed(1)} ${JSON.stringify(series)}`).toBeLessThanOrEqual(change/3);
  }
});
