import {expect,test} from '../fixtures';

// MOTION-8 (#24 review of MOTION-7, finding 1): the tab under the raised lens takes its accent a sixth of the way to white
// while the press lasts (a5416727), as every frame of Charlie's video press shows its glyph's ink easing lighter (154 -> 193
// luma over about 200 ms, 19.60-19.80 s). Only the glyph's opacity eased, so the colour stepped in one frame at the press
// (light luma about 100 -> 125, dark 128 -> 148) and back at the release: the size of pop 630a4fc2 fixed. Here the timeline
// runs at .1x and the label's and icon's colour are read every frame: no frame may carry more than a third of the change.
// MOTION-13 (#24): a step is only a pop when the frames around it are regular. At .1x the 200 ms ease (initial slope 2)
// moves at most a quarter of its change in STALL_MS of wall time, so a step over a third between samples closer than that
// is a pop. Across a longer gap (a frame stalled under load: once in 82 runs, a 7.1 step of a 20.2 change in the dark
// theme, 6/6 on rerun) a take cannot tell an ease from a pop, so the press is taken again, up to TAKES times; the judged
// take meets the same bounds as before, and a pop between regular frames fails at once.
const STALL_MS = 250, TAKES = 3;
type Ink = {t:number;label:number;icon:number};
for(const scheme of ['light','dark'] as const)test(`the lens target's lighter accent eases in on the press and back on the release (${scheme})`,async({page,browserName})=>{
  test.skip(browserName!=='chromium','the timeline is slowed through the Chromium DevTools protocol');
  test.setTimeout(120_000);
  await page.emulateMedia({colorScheme:scheme});
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  const games=bar.getByRole('link',{name:'Games',exact:true});
  await expect(games).toHaveAttribute('aria-current','page');
  const box=(await games.boundingBox())!;
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  // One take: the press and release at .1x, the colours read every frame.
  const take=async():Promise<Ink[]>=>{
    // The tabs take the lens's ink when the WebGL lens comes up, which eases too: let that finish before the timeline slows.
    await page.waitForFunction(()=>document.querySelector('.app-tabbar')!.getAnimations({subtree:true})
      .every(a=>a.playState!=='running'||a.effect?.getComputedTiming().iterations===Infinity));
    await page.waitForTimeout(300);
    await cdp.send('Animation.setPlaybackRate',{playbackRate:.1});
    await page.evaluate(()=>{
      const w=window as Window&{__ink?:Ink[];__take?:number};
      const take=w.__take=(w.__take??0)+1;
      const tab=document.querySelector('.app-tabbar a.ui-tab[href="#/collection"]')!;
      const label=tab.querySelector(':scope>span')!,icon=tab.querySelector('svg')!;
      // Any colour syntax the transition serialises (rgb, color(srgb), oklab) is read back as sRGB through a canvas.
      const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
      const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
      const luma=(color:string)=>{ctx.clearRect(0,0,1,1);ctx.fillStyle='#000';ctx.fillStyle=color;ctx.fillRect(0,0,1,1);const [r,g,b]=ctx.getImageData(0,0,1,1).data;return .2126*r+.7152*g+.0722*b;};
      w.__ink=[];
      // Read after the frame's animation callbacks (tabbar.ts marks the lens target in one of them), as the frame is painted.
      const sample=()=>{if(w.__take!==take)return;w.__ink!.push({t:performance.now(),label:luma(getComputedStyle(label).color),icon:luma(getComputedStyle(icon).color)});next();};
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
    return page.evaluate(()=>{const w=window as Window&{__ink?:Ink[];__take?:number};w.__take=(w.__take??0)+1;return w.__ink!;});
  };
  const judge=(ink:Ink[])=>(['label','icon'] as const).map(key=>{
    const series=ink.map(sample=>Math.round(sample[key]*10)/10);
    const change=Math.max(...series)-Math.min(...series);
    const steps=series.slice(1).map((value,i)=>({step:Math.abs(value-series[i]),gap:ink[i+1].t-ink[i].t}));
    const step=Math.max(...steps.map(s=>s.step));
    // Steps over a third across a stalled frame: this take cannot tell the ease from a pop there.
    const stalled=steps.filter(s=>s.step>change/3&&s.gap>STALL_MS).map(s=>Math.round(s.gap));
    return {key,series,change,step,stalled};
  });
  let ink:Ink[]=[];
  let verdict:ReturnType<typeof judge>=[];
  for(let n=1;n<=TAKES;n++){
    ink=await take();
    verdict=judge(ink);
    if(verdict.every(v=>!v.stalled.length))break;
  }
  expect(ink.length).toBeGreaterThan(20);
  for(const {key,series,change,step,stalled} of verdict){
    expect(change,`${key}: the press lightens the accent ${JSON.stringify(series)}`).toBeGreaterThan(12);
    // It eases back to the plain accent on the release.
    expect(Math.abs(series.at(-1)!-series[0]),`${key}: back to the accent ${JSON.stringify(series)}`).toBeLessThanOrEqual(1);
    const stall=stalled.length?` (frames stalled ${stalled.join(', ')} ms around it in all ${TAKES} takes)`:'';
    expect(step,`${key}: largest one-frame step of ${change.toFixed(1)}${stall} ${JSON.stringify(series)}`).toBeLessThanOrEqual(change/3);
  }
});
