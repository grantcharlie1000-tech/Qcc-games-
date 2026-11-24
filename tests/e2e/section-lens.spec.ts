import sharp from 'sharp';
import {expect,originalTheme,test} from '../fixtures';
import type {Page} from '@playwright/test';

test.beforeEach(async({context,page})=>{
  await originalTheme(context);
  await page.setViewportSize({width:390,height:844});
});

test('section lens updates the visible Games backdrop as the page scrolls',async({page})=>{
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  await page.evaluate(async()=>{
    await document.fonts.ready;
    await Promise.all([...document.querySelectorAll<HTMLImageElement>('.game-card img')]
      .filter(image=>image.getBoundingClientRect().top<innerHeight).map(image=>image.decode()));
  });
  const pixels=async()=>{
    // Sample the Games card artwork near the left side of the main body.
    const shot=await bar.screenshot({scale:'css'});
    return sharp(shot).extract({left:64,top:12,width:36,height:40}).removeAlpha().raw().toBuffer();
  };
  const rest=await pixels();
  await page.evaluate(()=>scrollTo(0,18));
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(18);
  await expect.poll(async()=>{
    const scrolled=await pixels();
    return scrolled.reduce((sum,channel,index)=>sum+Math.abs(channel-rest[index]),0)/rest.length;
  }).toBeGreaterThan(1);
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  await expect(bar.getByRole('link',{name:'Games'})).toHaveAttribute('aria-current','page');
});

test('section lens ignores game mutations and resumes live sampling at the restored library scroll',async({page})=>{
  await page.addInitScript(()=>{
    let queued=0;
    const request=window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame=callback=>{
      if(callback.name==='drawSectionLens') queued++;
      return request(callback);
    };
    Object.defineProperty(window,'sectionLensFrames',{get:()=>queued});
  });
  // The light theme's bar is Apple Music's pale frost, which lets only a faint tint of the art through. Live
  // sampling is read in the dark theme, whose smoke keeps the patch's own colour.
  await page.emulateMedia({colorScheme:'dark'});
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar'),canvas=bar.locator('canvas.section-lens');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  await page.evaluate(()=>scrollTo(0,18));
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(18);
  await page.evaluate(()=>{location.hash='#/game/snake';});
  await expect(page.locator('.snake-start')).toBeVisible();
  await expect(bar).not.toHaveAttribute('data-section-lens','webgl');
  const queued=await page.locator('#game-status').evaluate(async status=>{
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const count=()=>Reflect.get(window,'sectionLensFrames') as number;
    const before=count();
    status.textContent='Playing Snake';
    status.style.opacity='.9';
    await Promise.resolve();
    return count()-before;
  });
  expect(queued).toBe(0);

  await page.goBack();
  await expect(page.locator('.game-grid')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(18);
  await expect(bar).toHaveAttribute('data-section-lens','webgl');

  const patch=page.locator('#lens-test-patch');
  await page.locator('.game-grid').evaluate(grid=>{
    const element=document.createElement('div');
    element.id='lens-test-patch';
    element.style.cssText='position:fixed;inset:auto 0 0;height:100px;z-index:1;background:rgb(255,0,0)';
    grid.append(element);
  });
  const colour=()=>canvas.evaluate(el=>{
    const surface=el as HTMLCanvasElement;
    return [...surface.getContext('2d')!.getImageData(surface.width/2,surface.height/2,1,1).data];
  });
  await expect.poll(async()=>{const [r,g]=await colour();return r-g;}).toBeGreaterThan(80);
  await patch.evaluate(el=>{el.style.backgroundColor='rgb(0,255,0)';});
  await expect.poll(async()=>{const [r,g]=await colour();return g-r;}).toBeGreaterThan(80);
});

test('the selected ink is a bright blue with no dark rim over bright live glass',async({page})=>{
  await page.emulateMedia({colorScheme:'dark'});
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  // Apple's dark smoke keeps about .72 of the art's tone over a 30/255 floor, so the bright patch is #ddd: the glass
  // over it reads about 115, past the 110 this test calls bright (#aaa now reads about 102).
  await page.locator('.game-grid').evaluate(grid=>{
    const patch=document.createElement('div');
    patch.style.cssText='position:fixed;inset:auto 0 0;height:100px;z-index:1;background:#ddd;pointer-events:none';
    grid.append(patch);
  });
  const canvas=bar.locator('canvas.section-lens');
  await expect.poll(()=>canvas.evaluate(element=>{
    const surface=element as HTMLCanvasElement;
    return surface.getContext('2d')!.getImageData(surface.width/2,surface.height/2,1,1).data[0];
  })).toBeGreaterThan(110);

  const selected=bar.getByRole('link',{name:'Games',exact:true});
  await expect(selected).toHaveAttribute('aria-current','page');
  // LOOK-10: over bright art the dark pill now sits a little darker than the bar, so the accent keeps 2:1 by its ink, a
  // blue the lens picks against that pill (section-lens.ts selectionAccent). LOOK-23 (council on 6eaf6223, FAST LOOP
  // re-pin): Apple's ink turns a lighter blue over bright art, never navy, and its pill keeps no dark rim; the pill's
  // interior stays dark (PILL_CAP), so the accent is #0a84ff or a lighter blue, with no black rim at rest.
  let accent='';
  await expect.poll(async()=>{
    const [label,icon]=await Promise.all([selected.locator(':scope > span'),selected.locator('.ui-icon')].map(part=>part.evaluate(e=>getComputedStyle(e).color)));
    const same=label===icon&&label===accent;accent=label;return same;
  },{intervals:[250]}).toBe(true);
  const [red,green,blue]=accent.match(/\d+/g)!.map(Number);
  expect(blue,accent).toBeGreaterThan(Math.max(red,green));
  expect(red,accent).toBeLessThanOrEqual(200);
  await expect(selected.locator('.ui-icon')).not.toHaveCSS('filter',/0\.85/);
  await expect(selected.locator(':scope > span')).not.toHaveCSS('text-shadow',/0\.85/);
  await expect(selected.locator(':scope > span')).toHaveCSS('font-weight','600');

  // C30 shows every tab's 24px glyph in both themes, drawn at 32.4px (ink about .39 of the 60px bar, as Apple Music's),
  // with its #ff375f light accent at weight 600. Apple's light still (pr-183, 2.6 px a css px) holds 146-307 css px^2 of
  // ink in its unselected glyphs (New 297, Radio 146, Library 307) and 364 in its selected Home. Every tab's filled twin
  // drew 362-534 here (TV 534), solid white slabs on the dark smoke, so the dark theme's unselected tabs draw the line
  // twin, inside Apple's range, and the selected tab the filled one (Games 377). The light theme keeps the filled twins.
  const movies=bar.getByRole('link',{name:'Movies',exact:true});
  await expect(movies.locator('.ui-icon')).toHaveCSS('width','24px');
  await expect(movies.locator('.ui-icon')).toHaveCSS('transform',/^matrix\(1\.35,/);
  await expect(movies.locator('.ui-icon-line')).toHaveCSS('display','inline');
  await expect(movies.locator('.ui-icon-fill')).toHaveCSS('display','none');
  await expect(selected.locator('.ui-icon-fill')).toHaveCSS('display','inline');
  // The ink of each tab's shown glyph at its drawn size in css px^2: that twin alone, rasterised black on clear.
  const ink=await bar.evaluate(async element=>{
    const K=4,found:{selected:number;unselected:Record<string,number>}={selected:0,unselected:{}};
    for (const tab of element.querySelectorAll<HTMLElement>('.ui-tab')) {
      const icon=tab.querySelector<SVGSVGElement>('.ui-icon'),box=icon?.getBoundingClientRect();
      if (!icon||!box||!box.width) continue;
      const copy=icon.cloneNode(true) as SVGSVGElement,shown=[...icon.children],copied=[...copy.children];
      shown.forEach((part,i)=>{if (getComputedStyle(part).display==='none') copied[i].remove();});
      const canvas=document.createElement('canvas');
      canvas.width=Math.round(K*box.width);canvas.height=Math.round(K*box.height);
      copy.setAttribute('xmlns','http://www.w3.org/2000/svg');copy.setAttribute('color','#000');
      copy.setAttribute('width',String(canvas.width));copy.setAttribute('height',String(canvas.height));
      const image=new Image();
      image.src=`data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
      await image.decode();
      const context=canvas.getContext('2d')!;
      context.drawImage(image,0,0,canvas.width,canvas.height);
      let sum=0;
      for (const [i,alpha] of context.getImageData(0,0,canvas.width,canvas.height).data.entries()) if (i%4===3) sum+=alpha/255;
      if (tab.matches('[aria-current="page"],[aria-pressed="true"]')) found.selected=Math.round(sum/K/K);
      else found.unselected[tab.textContent!.trim()]=Math.round(sum/K/K);
    }
    return found;
  });
  console.log(`tab glyph ink, css px^2: ${JSON.stringify(ink)}`);
  expect(Object.keys(ink.unselected)).toHaveLength(4);
  for (const [name,area] of Object.entries(ink.unselected)) {
    expect(area,name).toBeGreaterThanOrEqual(130);
    expect(area,name).toBeLessThanOrEqual(330);
  }
  expect(ink.selected).toBeGreaterThanOrEqual(330);
  expect(ink.selected).toBeLessThanOrEqual(400);
  await page.emulateMedia({colorScheme:'light'});
  await expect(movies.locator('.ui-icon')).toHaveCSS('width','24px');
  await expect(movies.locator('.ui-icon-fill')).toHaveCSS('display','inline');
  await expect(movies.locator('.ui-icon-line')).toHaveCSS('display','none');
  await expect(selected.locator(':scope > span')).toHaveCSS('color','rgb(255, 55, 95)');
  await expect(selected.locator(':scope > span')).toHaveCSS('font-weight','600');
});

// The clear resting pill must not wash out the selected accent over bright art. Read the
// WebGL pill under the selected glyph and label over a white patch and compare it with the
// accent ink. The smoked pill before the clear pill (900e080c), measured by this same test, gave
// dark 2.52:1 at pill luminance .089 and light 1.25:1 at .188; the unlimited clear pill gave
// dark 1.26:1 (.227) and a light pill brighter than its accent (.451). Pin the dark smoked pill's
// values, with a little room for rasterisation. The light theme's pill is now Apple Music's milky grey,
// well above the accent at about 2.3:1 (the smoked light pill gave 1.25:1): pin that side instead.
// Since the light frost lets the art through (133d37f2), black art is the light pill's worst case: the pill followed it
// down to about 166/255 and the #ff375f accent read 1.45:1. The same floors hold over a black patch.
// LOOK-10 (council on aa6359ee): the dark pill was held at .091 so #0099ff kept 2.5:1, which sat it 79 under a 136 bar over
// mid-grey art. It now sits a step darker than the bar over every art, and the selected icon and label keep the 2:1 selected floor by their ink (section-lens.ts
// selectionAccent): checked over white, black and, dark only, a #777 patch, where #0099ff alone would read about 1.4:1.
// LOOK-17 (Charlie's FAST LOOP: re-pin the guards that block Apple's behaviour): the 1.05-1.35 step guard was our own
// (0313c4af), and Apple's frames break it over bright art. Read by this test's step, (Lbar+.05)/(Lpill+.05), in pairs
// across the capsule's ends on Apple's dark rest frames (fast/look/tools-look17/apple_step.py), Apple's pill sits 1.16
// under its bar over black (video 38.75 s; the 16 Nov still 1.21), 1.68 over a bright green poster (19.5 s, bar 137/255)
// and 2.05-2.08 over a bright photo (32.5-32.75 s). The guard is now Apple's with a little room: 1.10-1.30 over black,
// 1.45-2.30 over white and #777 art (PILL_STEP 1.21 rising to 1.8, LOOK-19).
// LOOK-20 (F20 review: two frames pooled, and the white bound a guess): five more of Apple's rest frames over bright art,
// read the same way (fast/look/tools-look20/step20.py): 22.6 s (Library over the green poster again) 1.67, 23.1 s (Radio
// over the light Radio page, its bar at luminance .39, the brightest in the video) 1.70, and 30.3, 31.1 and 32.8 s (Home
// over the scrolling photo) 1.60, 1.77 and 1.67. With 19.5 s and 32.5 s every frame's median lies in 1.60-2.05 (pooled
// 1.69 over 170 pairs), with no trend in the bar's luminance from .12 to .42 (band medians 1.65-1.73). #777 art (bar about
// .25) lies inside that range. White art (bar about .78) lies past it, so its bound is that band carried along the flat
// trend (a log fit gives 1.88 at .78). The guard is 1.55-2.15 over both, the frames' range with about .05 of room.
test('the selected accent keeps its contrast against the WebGL pill over white art and over black art',async({page})=>{
  const floor={dark:{ratio:2,pill:1},light:{ratio:2,pill:1}},milky={dark:0,light:.5};
  for (const scheme of ['dark','light'] as const) {
    await page.emulateMedia({colorScheme:scheme});
    await page.goto('/#/collection');
    const bar=page.locator('.app-tabbar');
    await expect(bar).toHaveAttribute('data-section-lens','webgl');
    await expect(bar.getByRole('link',{name:'Games',exact:true})).toHaveAttribute('aria-current','page');
    await page.locator('.game-grid').evaluate(grid=>{
      const patch=document.createElement('div');
      // The hash route keeps the document, so drop the last scheme's patch.
      document.getElementById('contrast-patch')?.remove();
      patch.id='contrast-patch';
      patch.style.cssText='position:fixed;inset:auto 0 0;height:100px;z-index:1;background:#fff;pointer-events:none';
      grid.append(patch);
    });
    const canvas=bar.locator('canvas.section-lens');
    const contrast=()=>canvas.evaluate(element=>{
      const surface=element as HTMLCanvasElement,rect=surface.getBoundingClientRect();
      const sx=surface.width/rect.width,sy=surface.height/rect.height;
      const tab=surface.closest('.app-tabbar')!.querySelector('[aria-current="page"]')!;
      const label=tab.querySelector(':scope > span')!,icon=tab.querySelector('.ui-icon')!;
      const lum=(rgb:number[])=>rgb.reduce((l,v,i)=>{const s=v/255;return l+(s<=.04045?s/12.92:((s+.055)/1.055)**2.4)*[.2126,.7152,.0722][i];},0);
      const ink=lum(getComputedStyle(label).color.match(/[\d.]+/g)!.slice(0,3).map(Number));
      const context=surface.getContext('2d')!,values:number[]=[],pill:number[]=[];
      for (const box of [label.getBoundingClientRect(),icon.getBoundingClientRect()]) {
        const x=Math.round((box.left-rect.left)*sx),y=Math.round((box.top-rect.top)*sy);
        const w=Math.max(1,Math.round(box.width*sx)),h=Math.max(1,Math.round(box.height*sy));
        const data=context.getImageData(x,y,w,h).data;
        for (let i=0;i<data.length;i+=4) {
          const bg=lum([data[i],data[i+1],data[i+2]]);
          pill.push(bg);
          values.push((Math.max(ink,bg)+.05)/(Math.min(ink,bg)+.05));
        }
      }
      values.sort((a,b)=>a-b);
      pill.sort((a,b)=>a-b);
      return `${Math.round(100*values[values.length>>1])/100} ${Math.round(1000*pill[pill.length>>1])/1000}`;
    });
    // LOOK-10: the bar body at the canvas centre (no glyph is drawn into the canvas) against the dark pill's luminance.
    const barToPill=(pillLuminance:number)=>canvas.evaluate((element,pillLuminance)=>{
      const surface=element as HTMLCanvasElement,data=surface.getContext('2d')!.getImageData(surface.width/2,surface.height/2,1,1).data;
      const lum=[...data].slice(0,3).reduce((l,v,i)=>{const s=v/255;return l+(s<=.04045?s/12.92:((s+.055)/1.055)**2.4)*[.2126,.7152,.0722][i];},0);
      return (lum+.05)/(pillLuminance+.05);
    },pillLuminance);
    // LOOK-24 (council on 6eaf6223, FAST LOOP re-pin): Apple's step was read in pairs across its pill's end caps
    // (tools-look17/apple_step.py; apple_match pill_step_bright): the bar 2-4.6 css px outside the capsule, the pill
    // 2-4.6 css px inside it, along the cap's normals. The same read here, at the selected capsule's trailing end, where
    // the bar's body lies beside it (Games is the leading end tab). The interior under the glyph is pinned on its own.
    const endStep=()=>canvas.evaluate(element=>{
      const surface=element as HTMLCanvasElement,rect=surface.getBoundingClientRect();
      const sx=surface.width/rect.width,sy=surface.height/rect.height;
      const bar=surface.closest('.app-tabbar') as HTMLElement,after=getComputedStyle(bar,'::after'),box=bar.getBoundingClientRect();
      const left=box.left+bar.clientLeft+parseFloat(after.translate),top=box.top+bar.clientTop+parseFloat(after.top);
      const radius=parseFloat(after.height)/2,cx=left+parseFloat(after.width)-radius,cy=top+radius;
      const data=surface.getContext('2d')!.getImageData(0,0,surface.width,surface.height).data;
      const lum=(x:number,y:number)=>{
        const i=4*(Math.round((y-rect.top)*sy)*surface.width+Math.round((x-rect.left)*sx));
        return [data[i],data[i+1],data[i+2]].reduce((l,v,c)=>{const s=v/255;return l+(s<=.04045?s/12.92:((s+.055)/1.055)**2.4)*[.2126,.7152,.0722][c];},0);
      };
      const steps:number[]=[];
      for (let angle=-40;angle<=40;angle+=5) for (let t=2;t<=4.61;t+=.2) {
        const ux=Math.cos(angle*Math.PI/180),uy=Math.sin(angle*Math.PI/180);
        steps.push((lum(cx+(radius+t)*ux,cy+(radius+t)*uy)+.05)/(lum(cx+(radius-t)*ux,cy+(radius-t)*uy)+.05));
      }
      steps.sort((a,b)=>a-b);
      return steps[steps.length>>1];
    });
    // Apple's pill interior over bright art, read inside its capsule with the ink masked (WCAG luminance; tools-look23/
    // miss23.py): .107 under Library at 19.5 s, .041 under Home at 32.5 s; with about .01 of room.
    const appleInterior=[.03,.12];
    // Wait for the white patch to reach the lens and for two equal reads.
    await expect.poll(()=>canvas.evaluate(element=>{
      const surface=element as HTMLCanvasElement;
      return surface.getContext('2d')!.getImageData(surface.width/2,surface.height/2,1,1).data[1];
    })).toBeGreaterThan(110);
    let previous='';
    await expect.poll(async()=>{const current=await contrast();const same=current===previous;previous=current;return same;},{intervals:[250]}).toBe(true);
    const [ratio,pill]=previous.split(' ').map(Number);
    console.log(`selected accent over white art, ${scheme}: ${ratio}:1, pill luminance ${pill}`);
    // The pill may be no brighter than the smoked pill either, so its contrast cannot recover
    // by crossing over the accent (light theme) while the art still washes it out.
    expect(ratio).toBeGreaterThanOrEqual(floor[scheme].ratio);
    expect(pill).toBeLessThanOrEqual(floor[scheme].pill);
    expect(pill).toBeGreaterThanOrEqual(milky[scheme]);
    if (scheme==='dark') {
      const step=await barToPill(pill),ends=await endStep();
      console.log(`dark bar to pill over white art: ${step.toFixed(2)} under the glyph, ${ends.toFixed(2)} across the pill's end`);
      expect(step).toBeGreaterThanOrEqual(1.55);
      // LOOK-23/24 (council on 6eaf6223, FAST LOOP re-pin): under the glyph Apple's pill stays a dark lens over bright art,
      // so there the pill is pinned to Apple's interior and the step has no upper bound; the 1.55-2.15 guard stays where
      // Apple's frames were read, across the pill's end.
      expect(ends).toBeGreaterThanOrEqual(1.55);
      expect(ends).toBeLessThanOrEqual(2.15);
      expect(pill).toBeGreaterThanOrEqual(appleInterior[0]);
      expect(pill).toBeLessThanOrEqual(appleInterior[1]);
    }
    // Black art: wait for the bar to darken under it (light frost about 188, dark smoke about 32), then two equal reads.
    await page.locator('#contrast-patch').evaluate(patch=>{(patch as HTMLElement).style.background='#000';});
    await expect.poll(()=>canvas.evaluate(element=>{
      const surface=element as HTMLCanvasElement;
      return surface.getContext('2d')!.getImageData(surface.width/2,surface.height/2,1,1).data[1];
    })).toBeLessThan(scheme==='light'?225:110);
    previous='';
    await expect.poll(async()=>{const current=await contrast();const same=current===previous;previous=current;return same;},{intervals:[250]}).toBe(true);
    const [blackRatio,blackPill]=previous.split(' ').map(Number);
    console.log(`selected accent over black art, ${scheme}: ${blackRatio}:1, pill luminance ${blackPill}`);
    expect(blackRatio).toBeGreaterThanOrEqual(floor[scheme].ratio);
    expect(blackPill).toBeLessThanOrEqual(floor[scheme].pill);
    expect(blackPill).toBeGreaterThanOrEqual(milky[scheme]);
    if (scheme==='dark') {
      const blackStep=await barToPill(blackPill);
      console.log(`dark bar to pill over black art: ${blackStep.toFixed(2)}`);
      expect(blackStep).toBeGreaterThanOrEqual(1.1);
      expect(blackStep).toBeLessThanOrEqual(1.3);
      // Mid-grey art, where #0099ff alone would read about 1.4:1 against the lighter pill: its ink keeps the floor.
      await page.locator('#contrast-patch').evaluate(patch=>{(patch as HTMLElement).style.background='#777';});
      await expect.poll(()=>canvas.evaluate(element=>{
        const surface=element as HTMLCanvasElement;
        return surface.getContext('2d')!.getImageData(surface.width/2,surface.height/2,1,1).data[1];
      })).toBeGreaterThan(110);
      previous='';
      await expect.poll(async()=>{const current=await contrast();const same=current===previous;previous=current;return same;},{intervals:[250]}).toBe(true);
      const [greyRatio,greyPill]=previous.split(' ').map(Number);
      const greyStep=await barToPill(greyPill),greyEnds=await endStep();
      console.log(`selected accent over #777 art, dark: ${greyRatio}:1, pill luminance ${greyPill}, bar to pill ${greyStep.toFixed(2)} under the glyph, ${greyEnds.toFixed(2)} across the pill's end`);
      expect(greyRatio).toBeGreaterThanOrEqual(floor.dark.ratio);
      expect(greyStep).toBeGreaterThanOrEqual(1.55);
      expect(greyEnds).toBeGreaterThanOrEqual(1.55);
      expect(greyEnds).toBeLessThanOrEqual(2.15);
      expect(greyPill).toBeGreaterThanOrEqual(appleInterior[0]);
      expect(greyPill).toBeLessThanOrEqual(appleInterior[1]);
    }
  }
});

// LOOK-11 (review I-1 on 691f4616): the dark selected ink landed 120 ms and a backdrop read after the lens's still frame, so a
// tab switch over mid or bright art reached rest in #0099ff (about 1.4:1 against the lighter pill) or still easing to its
// blue, and art that changed under a resting bar re-inked it with no settle repaint after. Two checks, over a #777 and a
// #ddd patch (the click is caught, so the route stays, as the release spec does):
// - a tap moves the selection; from the frame the pill's spring ends (no ::after animation runs again), the selected
//   label's colour never changes, and it holds 2:1 against the pill under the label and the glyph;
// - the art under the resting bar changes; once the selected ink has changed, tabbar.ts's settle repaint runs after it.
async function inkPage(page:Page){
  await page.emulateMedia({colorScheme:'dark'});
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  await page.evaluate(()=>document.addEventListener('click',event=>{
    const link=event.target instanceof Element?event.target.closest('.app-tabbar a.ui-tab'):null;
    if(!link)return;
    event.preventDefault();event.stopPropagation();
    document.querySelector('.app-tabbar [aria-current="page"]')?.removeAttribute('aria-current');
    link.setAttribute('aria-current','page');
  },true));
  const canvas=bar.locator('canvas.section-lens');
  const centre=()=>canvas.evaluate(element=>{const surface=element as HTMLCanvasElement;return surface.getContext('2d')!.getImageData(surface.width/2,surface.height/2,1,1).data[1];});
  const patch=async(art:string)=>{
    const before=await centre();
    await page.locator('.game-grid').evaluate((grid,art)=>{
      let patch=document.getElementById('ink-patch');
      if(!patch){patch=document.createElement('div');patch.id='ink-patch';grid.append(patch);}
      patch.style.cssText=`position:fixed;inset:auto 0 0;height:100px;z-index:1;background:${art};pointer-events:none`;
    },art);
    await expect.poll(async()=>Math.abs(await centre()-before)).toBeGreaterThan(20);
  };
  // The selected label's colour, the running animations and the glyph repaints (tabbar.ts settle), every frame for ms.
  const trace=(ms:number)=>page.evaluate(ms=>new Promise<{t:number;tab:string;color:string;pill:boolean;running:boolean;repaints:number}[]>(resolve=>{
    const bar=document.querySelector<HTMLElement>('.app-tabbar')!,samples:{t:number;tab:string;color:string;pill:boolean;running:boolean;repaints:number}[]=[];
    let repaints=0;
    // The repaint sets display:none !important on each glyph and restores it at once: count the restores.
    const watch=new MutationObserver(records=>{for(const record of records)if(/display:\s*none/.test(record.oldValue??''))repaints++;});
    for(const icon of bar.querySelectorAll('.ui-tab>.ui-icon'))watch.observe(icon,{attributes:true,attributeFilter:['style'],attributeOldValue:true});
    const end=performance.now()+ms;
    const sample=()=>{
      const tab=bar.querySelector<HTMLElement>('.ui-tab[aria-current=page]'),label=tab?.querySelector(':scope > span');
      const animations=bar.getAnimations({subtree:true}).filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity);
      samples.push({t:performance.now(),tab:tab?.textContent?.trim()??'',color:label?getComputedStyle(label).color:'',
        pill:animations.some(a=>(a.effect as KeyframeEffect|null)?.pseudoElement==='::after'),running:animations.length>0,repaints});
      if(performance.now()<end)requestAnimationFrame(sample);else{watch.disconnect();resolve(samples);}
    };
    requestAnimationFrame(sample);
  }),ms);
  const ratio=(ink:string)=>canvas.evaluate((element,ink)=>{
    const surface=element as HTMLCanvasElement,rect=surface.getBoundingClientRect(),sx=surface.width/rect.width,sy=surface.height/rect.height;
    const tab=surface.closest('.app-tabbar')!.querySelector('[aria-current="page"]')!;
    const lum=(rgb:number[])=>rgb.reduce((l,v,i)=>{const s=v/255;return l+(s<=.04045?s/12.92:((s+.055)/1.055)**2.4)*[.2126,.7152,.0722][i];},0);
    const inkLum=lum(ink.match(/[\d.]+/g)!.slice(0,3).map(Number)),values:number[]=[];
    for (const box of [tab.querySelector(':scope > span')!.getBoundingClientRect(),tab.querySelector('.ui-icon')!.getBoundingClientRect()]) {
      const x=Math.round((box.left-rect.left)*sx),y=Math.round((box.top-rect.top)*sy),w=Math.max(1,Math.round(box.width*sx)),h=Math.max(1,Math.round(box.height*sy));
      const data=surface.getContext('2d')!.getImageData(x,y,w,h).data;
      for (let i=0;i<data.length;i+=4) {const bg=lum([data[i],data[i+1],data[i+2]]);values.push((Math.max(inkLum,bg)+.05)/(Math.min(inkLum,bg)+.05));}
    }
    values.sort((a,b)=>a-b);
    return Math.round(100*values[values.length>>1])/100;
  },ink);
  return {bar,patch,trace,ratio};
}
test('dark: a tab switch\'s selected ink is its 2:1 blue by the time the pill lands, and never changes after',async({page})=>{
  const {bar,patch,trace,ratio}=await inkPage(page);
  let target='Movies';
  for (const art of ['#777','#ddd']) {
    await patch(art);
    await page.waitForTimeout(1200);
    const tracing=trace(2000);
    await page.waitForTimeout(100);
    await bar.getByRole('link',{name:target,exact:true}).click();
    const samples=await tracing;
    const first=samples.findIndex(sample=>sample.tab===target);
    expect(first,art).toBeGreaterThan(-1);
    const landed=samples.findIndex((sample,i)=>i>first&&samples.slice(i).every(s=>!s.pill&&s.tab===target));
    expect(landed,`${art}: the pill lands within the trace`).toBeGreaterThan(-1);
    const ink=samples[landed].color;
    const later=samples.slice(landed).filter(sample=>sample.color!==ink);
    expect(later.map(sample=>`${Math.round(sample.t-samples[landed].t)} ms ${sample.color}`),`${art}: ${target}'s ink as the pill lands, ${ink}`).toEqual([]);
    const contrast=await ratio(ink);
    console.log(`dark tab switch over ${art}: ${target}'s ink as the pill lands ${ink}, ${contrast}:1`);
    expect(contrast,`${art}: ${ink} as the pill lands`).toBeGreaterThanOrEqual(2);
    target=target==='Movies'?'Games':'Movies';
  }
});
test('dark: when the art under the resting bar changes, the settle repaint follows the selected ink\'s change',async({page})=>{
  const {patch,trace,ratio}=await inkPage(page);
  await patch('#222');
  await page.waitForTimeout(1200);
  // LOOK-25 (FAST LOOP re-pin with the council fix): the dark rest pill keeps its interior a dark lens over bright art
  // (section-lens.ts PILL_CAP), so #0a84ff keeps 2.2:1 over #777 as over #222 (2.43:1 there; Apple's ink stays its system
  // blue over a dark lens). From #222 the ink changes going to #ddd (a lighter blue) and back on #777 (#0a84ff).
  for (const art of ['#ddd','#777']) {
    const tracing=trace(1800);
    await page.waitForTimeout(100);
    await patch(art);
    const samples=await tracing;
    const changes=samples.map((sample,i)=>i&&sample.color!==samples[i-1].color?i:-1).filter(i=>i>0);
    expect(changes.length,`${art}: the selected ink adapts to the new art`).toBeGreaterThan(0);
    const last=changes.at(-1)!;
    const repaint=samples.findIndex((sample,i)=>i>=last&&sample.repaints>samples[last-1].repaints);
    expect(repaint,`${art}: a settle repaint after the ink's last change at ${Math.round(samples[last].t-samples[0].t)} ms`).toBeGreaterThan(-1);
    const ink=samples.at(-1)!.color,contrast=await ratio(ink);
    console.log(`dark art change to ${art}: ink ${ink} (${contrast}:1), last change ${Math.round(samples[last].t-samples[0].t)} ms, repaint ${Math.round(samples[repaint].t-samples[0].t)} ms`);
    expect(contrast,`${art}: ${ink}`).toBeGreaterThanOrEqual(2);
  }
});

// 93a36a80 frosts the dark resting pill soft (softFrost) while the moving selection kept the sparse frost, so letters
// under the pill snapped between streaked and soft on the settle frame and on a press's first frame (17-33/255). The
// last moving frame must be the rest pill: force pillMotion to .001 for one draw over a white title on black and compare
// that draw with the rest draw under the pill.
test('the dark pill\'s last moving frame over a title is its rest frame',async({page})=>{
  await page.addInitScript(()=>{
    const gl=WebGL2RenderingContext.prototype,getLocation=gl.getUniformLocation,uniform1f=gl.uniform1f;
    const names=new WeakMap<WebGLUniformLocation,string>();
    gl.getUniformLocation=function(this:WebGL2RenderingContext,program:WebGLProgram,name:string){
      const location=getLocation.call(this,program,name);
      if(location)names.set(location,name);
      return location;
    };
    gl.uniform1f=function(this:WebGL2RenderingContext,location:WebGLUniformLocation|null,value:number){
      const forced=(window as unknown as {forceMotion?:number}).forceMotion;
      return uniform1f.call(this,location,forced!==undefined&&location&&names.get(location)==='pillMotion'?forced:value);
    };
  });
  await page.emulateMedia({colorScheme:'dark'});
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  await expect(bar.getByRole('link',{name:'Games',exact:true})).toHaveAttribute('aria-current','page');
  await page.locator('.game-grid').evaluate(grid=>{
    const patch=document.createElement('div');
    patch.style.cssText='position:fixed;inset:auto 0 0;height:100px;z-index:1;background:#000;color:#fff;pointer-events:none;'
      +'font:700 22px/22px system-ui,sans-serif;padding:44px 0 0 14px;white-space:nowrap';
    patch.textContent='New Releases for You';
    grid.append(patch);
  });
  const canvas=bar.locator('canvas.section-lens');
  // The rows under the selected tab's label and glyph, as the contrast pin reads them.
  const pill=()=>canvas.evaluate(element=>{
    const surface=element as HTMLCanvasElement,rect=surface.getBoundingClientRect();
    const sx=surface.width/rect.width,sy=surface.height/rect.height;
    const tab=surface.closest('.app-tabbar')!.querySelector('[aria-current="page"]')!.getBoundingClientRect();
    const x=Math.round((tab.left+6-rect.left)*sx),y=Math.round((tab.top+8-rect.top)*sy);
    return [...surface.getContext('2d')!.getImageData(x,y,Math.round((tab.width-12)*sx),Math.round((tab.height-16)*sy)).data];
  });
  const steady=async()=>{
    let previous='';
    await expect.poll(async()=>{const current=(await pill()).join();const same=current===previous;previous=current;return same;},{intervals:[250]}).toBe(true);
    return previous.split(',').map(Number);
  };
  // Redraw by a one px scroll and back, so both reads are taken at the top of the page: the fixed title stays where it
  // is under the bar.
  const redraw=async()=>{
    await page.evaluate(()=>scrollTo(0,1));await page.waitForTimeout(300);
    await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(400);
  };
  await redraw();
  const rest=await steady();
  await page.evaluate(()=>{(window as unknown as {forceMotion?:number}).forceMotion=.001;});
  await redraw();
  const moving=await steady();
  await page.evaluate(()=>{delete (window as unknown as {forceMotion?:number}).forceMotion;});
  let worst=0,spread=0;
  for (let i=0;i<rest.length;i+=4) for (let c=0;c<3;c++) worst=Math.max(worst,Math.abs(rest[i+c]-moving[i+c]));
  for (let i=4;i<rest.length;i+=4) spread=Math.max(spread,Math.abs(rest[i+1]-rest[i-3]));
  console.log(`dark pill, last moving frame against rest over a title: max ${worst}/255 (title strokes ${spread}/255)`);
  // The title must show under the pill, or the comparison proves nothing.
  expect(spread).toBeGreaterThan(8);
  expect(worst).toBeLessThanOrEqual(2);
});

test('section lens falls back on context loss',async({page})=>{
  await page.addInitScript(()=>{
    const getContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,...args:unknown[]){
      const context=Reflect.apply(getContext,this,args);
      if(args[0]==='webgl2' && this.classList.contains('section-lens')){
        document.addEventListener('test-section-context-loss',()=>{
          const extension=context?.getExtension('WEBGL_lose_context');
          if(!extension)return;
          this.addEventListener('webglcontextlost',()=>setTimeout(()=>extension.restoreContext(),400),{once:true});
          extension.loseContext();
        },{once:true});
      }
      return context;
    };
  });
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  const canvas=bar.locator('canvas.section-lens');
  await expect(canvas).toHaveAttribute('aria-hidden','true');
  await page.evaluate(()=>document.dispatchEvent(new Event('test-section-context-loss')));
  await expect(bar).not.toHaveAttribute('data-section-lens','webgl');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
});

test('section lens keeps Movies art visible through CSS fallback',async({browserName,page})=>{
  // WebKit uses frost even when the separate texture request could succeed.
  const posterOrigin = browserName==='chromium'?'http://127.0.0.1:1':'*';
  let corsRequests=0;
  await page.route('https://image.tmdb.org/**',async route=>{
    const headers=await route.request().allHeaders();
    if(headers.origin || headers['sec-fetch-mode']==='cors')corsRequests++;
    return route.fulfill({contentType:'image/png',
      headers:{'access-control-allow-origin':posterOrigin,'cache-control':'no-store'},
      body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6WQAAAAASUVORK5CYII=','base64')});
  });
  await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
  await page.goto('/#/movies/browse/movie');
  const bar=page.locator('.movies-mobile-nav');
  await expect(bar.getByRole('button',{name:'Movies',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.locator('.movies-view').evaluate(el=>{el.scrollTop=200;});
  await expect(bar).toBeVisible();
  const poster=page.locator('.movies-poster img').first();
  await expect.poll(()=>poster.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(poster).toHaveAttribute('src',/^https:\/\/image\.tmdb\.org\//);
  if (browserName==='chromium') await expect.poll(()=>corsRequests).toBeGreaterThan(0);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(bar.locator('canvas.section-lens')).toBeHidden();
  await expect(bar).not.toHaveAttribute('data-section-lens','webgl');
  await expect.poll(()=>bar.evaluate(el=>[el,el.querySelector('.ui-glass-lens')].some(layer=>{
    if(!layer)return false;
    const style=getComputedStyle(layer);
    const filter = style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter');
    return style.display!=='none' && style.visibility==='visible' && !!filter && filter!=='none';
  }))).toBe(true);
});

test('section lens rises above the bar on first press, as Charlie\'s video, and through drag travel',async({page})=>{
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  const canvas=bar.locator('canvas.section-lens');
  // The surface grows past the bar only while the raised lens is drawn.
  const raised=()=>canvas.evaluate(element=>(element as HTMLCanvasElement).style.getPropertyValue('--section-lens-pad-x'));
  // The opaque rows of the padded surface above the bar over the lens: Charlie's video holds the lens top
  // about 4 px above the bar (2-6 px) on a press and 2 px above it through a drag.
  const overhang=(lensX:number)=>canvas.evaluate((element,lensX)=>{
    const surface=element as HTMLCanvasElement, rect=surface.getBoundingClientRect();
    const bar=surface.parentElement!.getBoundingClientRect();
    const scale=surface.width/rect.width, column=Math.round((lensX-rect.left)*scale);
    const rows=Math.floor((bar.top-rect.top)*scale)-1;
    const alpha=surface.getContext('2d')!.getImageData(column-4,0,9,rows).data;
    let opaque=0;
    for(let row=0;row<rows;row++){
      let max=0;
      for(let i=row*36+3;i<row*36+36;i+=4)max=Math.max(max,alpha[i]);
      if(max>127)opaque++;
    }
    return {rows,opaque:opaque/scale};
  },lensX);
  const box=(await bar.getByRole('link',{name:'Games',exact:true}).boundingBox())!;
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await expect(bar).toHaveAttribute('data-pressing','');
  await expect.poll(raised).not.toBe('');
  await page.waitForTimeout(300);
  const held=await overhang(x);
  expect(held.rows).toBeGreaterThan(6);
  expect(held.opaque).toBeGreaterThanOrEqual(1.5);expect(held.opaque).toBeLessThanOrEqual(7);
  await page.mouse.move(x+138,y,{steps:4});
  await page.waitForTimeout(400);
  expect(await raised()).not.toBe('');
  const drag=await overhang(x+138);
  expect(drag.opaque).toBeGreaterThanOrEqual(.5);expect(drag.opaque).toBeLessThanOrEqual(6);
  await page.mouse.move(x+4,y,{steps:4});
  await page.mouse.up();
  await expect.poll(raised).toBe('');
  await expect(bar.getByRole('link',{name:'Games',exact:true})).toHaveAttribute('aria-current','page');
});

// MOTION-4 (#24): a release that changes the tab (a tap on Movies while Games is current, or a drag let go over Movies)
// used to start the selection stretch, whose first '1 1' frame beat the release transition: the lens's lift (read from
// the pill's scale, section-lens.ts) fell from 1 to 0 in one frame and the raised bubble vanished. The bubble now falls
// back on the release spring every time. The CSS timeline runs at .1x, so each frame is a small step of the spring; the
// selection is made in place (no route change), so the Games scene and its lens stay up throughout.
for(const gesture of ['tap','drag'] as const) test(`a ${gesture} release that changes the tab lets the raised lens ease down on the release spring`,async({page,browserName})=>{
  test.skip(browserName!=='chromium','the timeline is slowed through the Chromium DevTools protocol');
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  const games=bar.getByRole('link',{name:'Games',exact:true}), movies=bar.getByRole('link',{name:'Movies',exact:true});
  await page.evaluate(()=>document.addEventListener('click',event=>{
    const link=event.target instanceof Element?event.target.closest('.app-tabbar a[href="#/movies/browse/movie"]'):null;
    if(!link)return;
    event.preventDefault();event.stopPropagation();
    document.querySelector('.app-tabbar [aria-current="page"]')?.removeAttribute('aria-current');
    link.setAttribute('aria-current','page');
  },true));
  const from=(await (gesture==='tap'?movies:games).boundingBox())!, to=(await movies.boundingBox())!;
  const y=from.y+from.height/2;
  await page.mouse.move(from.x+from.width/2,y);
  await page.mouse.down();
  if(gesture==='drag')await page.mouse.move(to.x+to.width/2,y,{steps:6});
  await expect.poll(()=>bar.locator('canvas.section-lens').evaluate(el=>(el as HTMLCanvasElement).style.getPropertyValue('--section-lens-pad-x'))).not.toBe('');
  await page.waitForTimeout(300);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate',{playbackRate:.1});
  await page.evaluate(()=>{
    const w=window as Window&{__trace?:{t:number;lift:number;pad:string}[];__released?:number};
    const bar=document.querySelector<HTMLElement>('.app-tabbar')!;
    w.__trace=[];
    addEventListener('pointerup',()=>{w.__released??=performance.now();},{capture:true,once:true});
    const end=performance.now()+2600;
    // performance.now(), not the frame's timestamp: a frame that handles the pointer-up starts before the event.
    const sample=()=>{
      const t=performance.now();
      const scale=getComputedStyle(bar,'::after').scale;
      const [sx,sy=sx]=scale==='none'?[1]:scale.split(' ').map(Number);
      const lens=bar.querySelector<HTMLCanvasElement>('canvas.section-lens');
      w.__trace!.push({t,lift:Math.min(1,Math.max(0,(sx*sy-1.07)/.18)),pad:lens?.style.getPropertyValue('--section-lens-pad-x')??''});
      if(t<end)requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(2800);
  await cdp.send('Animation.setPlaybackRate',{playbackRate:1});
  await expect(movies).toHaveAttribute('aria-current','page');
  const {trace,released}=await page.evaluate(()=>{const w=window as Window&{__trace?:{t:number;lift:number;pad:string}[];__released?:number};return {trace:w.__trace!,released:w.__released!};});
  const before=trace.filter(sample=>sample.t<released), after=trace.filter(sample=>sample.t>=released);
  expect(before.at(-1)?.lift,'held lift').toBe(1);
  expect(after.length).toBeGreaterThan(8);
  const lifts=after.map(sample=>sample.lift);
  // The first frame after the lift-off still shows the raised bubble, and it never falls by more than a third in a frame.
  expect(lifts[0],JSON.stringify(lifts)).toBeGreaterThan(.6);
  expect(Math.max(...lifts.slice(1).map((lift,i)=>lifts[i]-lift)),JSON.stringify(lifts)).toBeLessThanOrEqual(.3);
  expect(lifts.at(-1)).toBe(0);
  // The lens stays raised (padded past the bar) for several frames of the fall, not one.
  expect(after.filter(sample=>sample.pad!=='').length,JSON.stringify(after.map(sample=>sample.pad))).toBeGreaterThanOrEqual(4);
  void games;
});
