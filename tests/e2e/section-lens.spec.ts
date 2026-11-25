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

test('the light bar carries fine page strokes at their original coordinates',async({page})=>{
  await page.emulateMedia({colorScheme:'light'});
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar'),canvas=bar.locator('canvas.section-lens');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  // Place real narrow page marks just inside the straight top band, outside the selected pill.
  // Shift them into their former gaps to distinguish transmission from a blurred or mirrored copy.
  await page.locator('.game-grid').evaluate(grid=>{
    const b=document.querySelector('.app-tabbar')!.getBoundingClientRect();
    const patch=document.createElement('div');
    patch.id='light-detail-patch';
    patch.style.cssText='position:fixed;inset:auto 0 0;height:100px;background:#fff;z-index:1;pointer-events:none';
    for(let i=0;i<10;i++){
      const mark=document.createElement('div');
      mark.style.cssText=`position:fixed;left:${b.left+104+8*i}px;top:${b.top+3}px;width:3px;height:7px;background:#888`;
      patch.append(mark);
    }
    grid.append(patch);
  });
  const pixels=()=>canvas.evaluate(el=>{
    const surface=el as HTMLCanvasElement,rect=surface.getBoundingClientRect();
    const b=surface.closest('.app-tabbar')!.getBoundingClientRect();
    const sx=surface.width/rect.width,sy=surface.height/rect.height,ctx=surface.getContext('2d')!;
    const pixel=(x:number,y:number)=>ctx.getImageData(Math.floor((b.left+x-rect.left)*sx),Math.floor((b.top+y-rect.top)*sy),1,1).data[1];
    let mark=0,gap=0;
    for(let i=0;i<10;i++)for(let y=4;y<=8;y++){
      mark+=pixel(105+8*i,y);gap+=pixel(109+8*i,y);
    }
    return {delta:(gap-mark)/50,body:pixel(145,52)};
  });
  await expect.poll(async()=>(await pixels()).delta).toBeGreaterThan(20);
  const before=await pixels();
  expect(before.body).toBeGreaterThanOrEqual(231);
  expect(before.body).toBeLessThanOrEqual(237);
  await page.locator('#light-detail-patch').evaluate(patch=>{
    for(const mark of Array.from(patch.children) as HTMLElement[])mark.style.left=`${parseFloat(mark.style.left)+4}px`;
  });
  await expect.poll(async()=>(await pixels()).delta).toBeLessThan(-20);
  const shifted=await pixels();
  expect(Math.abs(shifted.body-before.body)).toBeLessThanOrEqual(1);
  // A same-tab press/drag/release must leave the shifted material unchanged at rest.
  const box=(await bar.getByRole('link',{name:'Games',exact:true}).boundingBox())!;
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.mouse.down();
  const pad=()=>canvas.evaluate(el=>(el as HTMLCanvasElement).style.getPropertyValue('--section-lens-pad-x'));
  await expect.poll(pad).not.toBe('');
  await page.mouse.move(x+118,y,{steps:4});
  await page.mouse.move(x,y,{steps:4});await page.mouse.up();
  await expect.poll(pad).toBe('');
  await expect.poll(pixels).toEqual(shifted);
  console.log(`light detail contrast at page coordinates: ${before.delta}, shifted: ${shifted.delta}; body ${shifted.body}`);
});

test('the light bar keeps unselected ink legible over fine black page strokes',async({page})=>{
  await page.emulateMedia({colorScheme:'light'});
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar'),canvas=bar.locator('canvas.section-lens');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  await page.locator('.game-grid').evaluate(grid=>{
    const b=document.querySelector('.app-tabbar')!.getBoundingClientRect();
    const patch=document.createElement('div');
    patch.style.cssText='position:fixed;inset:auto 0 0;height:100px;background:#fff;z-index:1;pointer-events:none';
    // A real page pattern: one stroke above the glyphs and two aligned with their upper rows.
    for(const depth of [5,12,14]){
      const mark=document.createElement('div');
      mark.style.cssText=`position:fixed;left:${b.left+80}px;top:${b.top+depth}px;width:180px;height:1px;background:#000`;
      patch.append(mark);
    }
    grid.append(patch);
  });
  const samples=()=>canvas.evaluate(element=>{
    const surface=element as HTMLCanvasElement,rect=surface.getBoundingClientRect();
    const bar=surface.closest('.app-tabbar')!,b=bar.getBoundingClientRect();
    const tab=Array.from(bar.querySelectorAll('.ui-tab')).find(tab=>tab.textContent!.trim()==='Movies')!;
    const sx=surface.width/rect.width,sy=surface.height/rect.height,ctx=surface.getContext('2d')!;
    const lum=(rgb:number[])=>rgb.reduce((l,v,i)=>{const s=v/255;return l+(s<=.04045?s/12.92:((s+.055)/1.055)**2.4)*[.2126,.7152,.0722][i];},0);
    const contrast=(glyph:Element)=>{
      const box=glyph.getBoundingClientRect();
      const ink=lum(getComputedStyle(glyph).color.match(/[\d.]+/g)!.slice(0,3).map(Number));
      const data=ctx.getImageData(Math.round((box.left-rect.left)*sx),Math.round((box.top-rect.top)*sy),Math.round(box.width*sx),Math.round(box.height*sy)).data;
      let darkest=1;
      for(let i=0;i<data.length;i+=4)darkest=Math.min(darkest,lum([data[i],data[i+1],data[i+2]]));
      return (darkest+.05)/(ink+.05);
    };
    const icon=tab.querySelector('.ui-icon')!,label=tab.querySelector(':scope > span')!;
    const pixel=(depth:number)=>ctx.getImageData(Math.floor((b.left+130-rect.left)*sx),Math.floor((b.top+depth-rect.top)*sy),1,1).data[1];
    return {detail:pixel(8.5)-pixel(5.5),icon:contrast(icon),label:contrast(label),iconTop:icon.getBoundingClientRect().top-b.top};
  });
  // Wait for the actual fine page pattern to reach the WebGL backdrop before measuring its ink.
  await expect.poll(async()=>(await samples()).detail).toBeGreaterThan(20);
  const ratios=await samples();
  console.log('light unselected ink over page strokes',JSON.stringify(ratios));
  expect(ratios.icon,'minimum contrast under the unselected icon').toBeGreaterThanOrEqual(3);
  expect(ratios.label,'minimum contrast under the unselected label').toBeGreaterThanOrEqual(4.5);
});

test('the light resting pill catches a nearby page stroke only at its rim',async({page})=>{
  await page.emulateMedia({colorScheme:'light'});
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar'),canvas=bar.locator('canvas.section-lens');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  await page.locator('.game-grid').evaluate(grid=>{
    const patch=document.createElement('div');
    patch.id='light-rim-patch';
    patch.style.cssText='position:fixed;inset:auto 0 0;height:100px;background:#fff;z-index:1;pointer-events:none';
    grid.append(patch);
  });
  const samples=()=>canvas.evaluate(el=>{
    const surface=el as HTMLCanvasElement,rect=surface.getBoundingClientRect();
    const bar=surface.closest('.app-tabbar') as HTMLElement,b=bar.getBoundingClientRect(),pill=getComputedStyle(bar,'::after');
    const x=b.left+parseFloat(pill.left)+parseFloat(pill.translate)+parseFloat(pill.width)/2;
    const y=b.top+parseFloat(pill.top);
    const sx=surface.width/rect.width,sy=surface.height/rect.height,ctx=surface.getContext('2d')!;
    const pixel=(depth:number)=>ctx.getImageData(Math.floor((x-rect.left)*sx),Math.floor((y+depth-rect.top)*sy),1,1).data[1];
    return {rim:pixel(.5),interior:pixel(4.5),body:pixel(12.5)};
  });
  await expect.poll(async()=>(await samples()).body).toBeGreaterThan(205);
  let previous='';
  await expect.poll(async()=>{const next=JSON.stringify(await samples()),same=next===previous;previous=next;return same;},{intervals:[250]}).toBe(true);
  const clear=await samples();
  expect(clear.rim-clear.interior,'visible top highlight on the resting glass edge').toBeGreaterThanOrEqual(20);
  // The real page stroke lies immediately outside the pill, not inside its face.
  await page.locator('#light-rim-patch').evaluate(patch=>{
    const bar=patch.ownerDocument.querySelector('.app-tabbar')!,b=bar.getBoundingClientRect(),pill=getComputedStyle(bar,'::after');
    const x=b.left+parseFloat(pill.left)+parseFloat(pill.translate)+parseFloat(pill.width)/2;
    const y=b.top+parseFloat(pill.top);
    const mark=document.createElement('div');
    mark.style.cssText=`position:fixed;left:${x-5}px;top:${y-2}px;width:10px;height:1.5px;background:#666`;
    patch.append(mark);
  });
  await expect.poll(async()=>clear.rim-(await samples()).rim).toBeGreaterThan(8);
  const stroke=await samples();
  expect(Math.abs(stroke.interior-clear.interior)).toBeLessThanOrEqual(4);
  expect(Math.abs(stroke.body-clear.body)).toBeLessThanOrEqual(2);
  expect(clear.body).toBeGreaterThanOrEqual(206);
  expect(clear.body).toBeLessThanOrEqual(212);
  // Move the source further outside the capsule. The displaced stroke must leave
  // the refractive hairline rather than merely changing the pill's mean tone.
  await page.locator('#light-rim-patch > div').evaluate(mark=>{
    const stroke=mark as HTMLElement;
    stroke.style.top=`${parseFloat(stroke.style.top)-4}px`;
  });
  await expect.poll(async()=>Math.abs(clear.rim-(await samples()).rim)).toBeLessThanOrEqual(3);
  const away=await samples();
  console.log(`light pill top stroke: rim ${clear.rim} -> ${stroke.rim} -> ${away.rim}, interior ${clear.interior} -> ${stroke.interior}, face ${clear.body} -> ${stroke.body}`);
});

test('the light curved rest face transmits a displaced page stroke inside the capsule',async({page})=>{
  await page.emulateMedia({colorScheme:'light'});
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar'),canvas=bar.locator('canvas.section-lens');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  await page.locator('.game-grid').evaluate(grid=>{
    const patch=document.createElement('div');
    patch.id='curved-face-patch';
    patch.style.cssText='position:fixed;inset:auto 0 0;height:100px;background:#fff;z-index:1;pointer-events:none';
    grid.append(patch);
  });
  const measure=()=>canvas.evaluate(el=>{
    const surface=el as HTMLCanvasElement,rect=surface.getBoundingClientRect();
    const bar=surface.closest('.app-tabbar')!,b=bar.getBoundingClientRect(),pill=getComputedStyle(bar,'::after');
    const x=b.left+parseFloat(pill.left)+parseFloat(pill.translate)+parseFloat(pill.width)/2;
    const y=b.top+parseFloat(pill.top);
    const sx=surface.width/rect.width,sy=surface.height/rect.height,ctx=surface.getContext('2d')!;
    const ix=Math.floor((x-rect.left)*sx),iy=Math.floor((y+10-rect.top)*sy);
    const pixel=(row:number)=>ctx.getImageData(ix,row,1,1).data[1];
    const stroke=document.querySelector('#curved-face-patch i')?.getBoundingClientRect();
    return {bend:pixel(iy),reference:pixel(Math.floor((y+31-rect.top)*sy)),gap:stroke?stroke.top-(rect.top+(iy+.5)/sy):0};
  });
  await expect.poll(async()=>(await measure()).bend).toBeGreaterThan(205);
  let previous='';
  await expect.poll(async()=>{const next=JSON.stringify(await measure()),same=next===previous;previous=next;return same;},{intervals:[250]}).toBe(true);
  const clear=await measure();
  await page.locator('#curved-face-patch').evaluate(patch=>{
    const bar=patch.ownerDocument.querySelector('.app-tabbar')!,b=bar.getBoundingClientRect(),pill=getComputedStyle(bar,'::after');
    const x=b.left+parseFloat(pill.left)+parseFloat(pill.translate)+parseFloat(pill.width)/2;
    const y=b.top+parseFloat(pill.top);
    const mark=document.createElement('i');
    mark.style.cssText=`position:fixed;left:${x-5}px;top:${y+13}px;width:10px;height:1.5px;background:#666`;
    patch.append(mark);
  });
  await expect.poll(async()=>clear.bend-(await measure()).bend).toBeGreaterThanOrEqual(6);
  const hit=await measure();
  expect(hit.gap,'actual page stroke is outside the sampled face pixel').toBeGreaterThanOrEqual(2);
  expect(Math.abs(hit.reference-clear.reference)).toBeLessThanOrEqual(2);
  await page.locator('#curved-face-patch i').evaluate(el=>{(el as HTMLElement).style.top=`${parseFloat((el as HTMLElement).style.top)+7}px`;});
  await expect.poll(async()=>Math.abs(clear.bend-(await measure()).bend)).toBeLessThanOrEqual(2);
  console.log(`curved rest face: ${clear.bend} -> ${hit.bend} -> ${(await measure()).bend}, source gap ${hit.gap} CSS px`);
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
      return `${Math.round(100*values[values.length>>1])/100} ${Math.round(1000*pill[pill.length>>1])/1000} ${Math.round(100*values[Math.floor(.05*(values.length-1))])/100}`;
    });
    // LOOK-26 (F22 review I-1 on c7f78314): the median let the pill's brighter edge band under the label's lowest rows pass
    // (1.9:1 at the baseline, 1.1:1 at a descender, over white art). The dark rest pill must hold 2:1 at the 5th percentile
    // of its per-pixel ratios under the label and glyph boxes too (the label's line box takes in its descenders).
    const lowFloor=2;
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
    const [ratio,pill,low]=previous.split(' ').map(Number);
    console.log(`selected accent over white art, ${scheme}: ${ratio}:1 (p5 ${low}:1), pill luminance ${pill}`);
    expect(low,'p5 under the label and glyph over white art').toBeGreaterThanOrEqual(lowFloor);
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
    const [blackRatio,blackPill,blackLow]=previous.split(' ').map(Number);
    console.log(`selected accent over black art, ${scheme}: ${blackRatio}:1 (p5 ${blackLow}:1), pill luminance ${blackPill}`);
    expect(blackLow,'p5 under the label and glyph over black art').toBeGreaterThanOrEqual(lowFloor);
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
      const [greyRatio,greyPill,greyLow]=previous.split(' ').map(Number);
      const greyStep=await barToPill(greyPill),greyEnds=await endStep();
      console.log(`selected accent over #777 art, dark: ${greyRatio}:1 (p5 ${greyLow}:1), pill luminance ${greyPill}, bar to pill ${greyStep.toFixed(2)} under the glyph, ${greyEnds.toFixed(2)} across the pill's end`);
      expect(greyRatio).toBeGreaterThanOrEqual(floor.dark.ratio);
      expect(greyLow,'p5 under the label and glyph over #777 art').toBeGreaterThanOrEqual(lowFloor);
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
    // LOOK-26 (F22 review I-1): the 5th percentile, not the median, so the label's lowest rows count.
    return Math.round(100*values[Math.floor(.05*(values.length-1))])/100;
  },ink);
  return {bar,patch,trace,ratio};
}
// LOOK-26 (F22 review I-1 on c7f78314): with Study or My list selected (their 'y' descends to about 4 css px from the pill's
// foot) over white, #ccc, #777 and bright posters, the resting dark pill's per-pixel ratio against the selected ink must hold
// 2:1 at the 5th percentile under the label and glyph boxes, and under the label's lowest 3 css px rows on their own. On
// c7f78314 the interior held 2.6-2.8:1 while the label's baseline row read about 1.9:1 and its descender about 1.1:1.
// LOOK-29 (F24 review m-2 on 639c0c73): and over saturated art, where the pill's colour raised its linear luminance past
// what the grey ink model sees (the model's label contrast over uniform pink (255,80,200) 2.53 -> 2.23, over red
// (230,30,40) 2.74 -> 2.44). These ratios are read from the canvas's own RGB, so pink and red are checked as they draw.
test('dark: the selected label keeps 2:1 down to its descenders over bright art, with My list and Study selected',async({page})=>{
  test.setTimeout(160_000);
  const {bar,patch}=await inkPage(page);
  // Study is the bar's action button (it opens Study Mode), so the selection moves as inkPage's caught click moves it: the
  // current tab's aria-current goes to the target, and the pill springs there.
  const select=(target:string)=>bar.evaluate((element,target)=>{
    const tab=[...element.querySelectorAll<HTMLElement>('.ui-tab')].find(t=>t.textContent?.trim()===target)!;
    for (const other of element.querySelectorAll('.ui-tab[aria-current="page"]')) if (other!==tab) other.removeAttribute('aria-current');
    tab.setAttribute('aria-current','page');
  },target);
  const canvas=bar.locator('canvas.section-lens');
  const centre=()=>canvas.evaluate(element=>{const surface=element as HTMLCanvasElement;return surface.getContext('2d')!.getImageData(surface.width/2,surface.height/2,1,1).data[1];});
  // Bright posters the backdrop can paint (an image, no CSS gradient or filter): a pink and cream facade with dark windows and
  // fine light strokes, and a photo lifted to poster brightness. Each goes over the black patch in its own holder, and the
  // last one is taken off first, so each poster's arrival changes the bar plainly.
  const poster=async(kind:'facade'|'photo')=>{
    await page.evaluate(()=>document.getElementById('ink-poster')?.remove());
    await expect.poll(centre).toBeLessThan(60);
    const before=await centre();
    await page.locator('.game-grid').evaluate(async(grid,kind)=>{
      const art=document.createElement('canvas');art.width=780;art.height=200;
      const ctx=art.getContext('2d')!;
      if(kind==='facade'){
        ctx.fillStyle='#f4c4cf';ctx.fillRect(0,0,780,200);
        for(let y=0;y<200;y+=40){ctx.fillStyle='#f8e4cc';ctx.fillRect(0,y,780,12);}
        ctx.fillStyle='#6b3343';for(let y=18;y<200;y+=20)for(let x=6;x<780;x+=14)ctx.fillRect(x,y,5,9);
        ctx.strokeStyle='#ffffff';ctx.lineWidth=2;for(let x=0;x<780;x+=26){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+40,200);ctx.stroke();}
      }else{
        const photo=new Image();photo.src='/study/photos/reading-writing.webp';await photo.decode();
        ctx.filter='brightness(1.45)';ctx.drawImage(photo,0,(photo.naturalHeight-photo.naturalWidth*200/780)/2,photo.naturalWidth,photo.naturalWidth*200/780,0,0,780,200);
      }
      const image=document.createElement('img');image.src=art.toDataURL('image/png');image.style.cssText='display:block;width:100%;height:100%;object-fit:cover';
      await image.decode();
      const holder=document.createElement('div');holder.id='ink-poster';holder.style.cssText='position:fixed;inset:auto 0 0;height:100px;z-index:2;pointer-events:none';
      holder.append(image);grid.append(holder);
    },kind);
    await expect.poll(async()=>Math.abs(await centre()-before)).toBeGreaterThan(20);
  };
  // The per-pixel ratios of the selected ink against the pill under the label and glyph boxes (p5), and under the label's
  // lowest 3 css px rows alone (p5): no glyph is drawn into the canvas.
  const reads=()=>canvas.evaluate(element=>{
    const surface=element as HTMLCanvasElement,rect=surface.getBoundingClientRect(),sx=surface.width/rect.width,sy=surface.height/rect.height;
    const tab=surface.closest('.app-tabbar')!.querySelector('[aria-current="page"]')!,label=tab.querySelector(':scope > span')!,icon=tab.querySelector('.ui-icon')!;
    const lum=(rgb:number[])=>rgb.reduce((l,v,i)=>{const s=v/255;return l+(s<=.04045?s/12.92:((s+.055)/1.055)**2.4)*[.2126,.7152,.0722][i];},0);
    const ink=getComputedStyle(label).color,inkLum=lum(ink.match(/[\d.]+/g)!.slice(0,3).map(Number));
    const read=(box:{left:number;top:number;width:number;height:number})=>{
      const x=Math.round((box.left-rect.left)*sx),y=Math.round((box.top-rect.top)*sy),w=Math.max(1,Math.round(box.width*sx)),h=Math.max(1,Math.round(box.height*sy));
      const data=surface.getContext('2d')!.getImageData(x,y,w,h).data,values:number[]=[];
      for (let i=0;i<data.length;i+=4) {const bg=lum([data[i],data[i+1],data[i+2]]);values.push((Math.max(inkLum,bg)+.05)/(Math.min(inkLum,bg)+.05));}
      return values;
    };
    const p5=(values:number[])=>{values.sort((a,b)=>a-b);return Math.round(100*values[Math.floor(.05*(values.length-1))])/100;};
    const l=label.getBoundingClientRect(),all=[...read(l),...read(icon.getBoundingClientRect())];
    return [tab.textContent!.trim(),ink,p5(all),p5(read({left:l.left,top:l.bottom-3,width:l.width,height:3})),Math.round(l.bottom-surface.closest('.app-tabbar')!.getBoundingClientRect().top)].join('|');
  });
  const settled=async(target:string)=>{
    await expect(bar.locator('.ui-tab[aria-current="page"]')).toHaveText(target);
    await expect.poll(()=>bar.evaluate(element=>element.getAnimations({subtree:true}).filter(a=>a.playState==='running'&&a.effect?.getComputedTiming().iterations!==Infinity).length)).toBe(0);
    let previous='';
    await expect.poll(async()=>{const current=await reads();const same=current===previous;previous=current;return same;},{intervals:[250]}).toBe(true);
    return previous;
  };
  for (const art of ['#fff','#ccc','#777','#ff50c8','#e61e28','facade','photo']) {
    if (art==='facade') await patch('#000');
    if (art==='facade'||art==='photo') await poster(art); else await patch(art);
    for (const target of ['My list','Study']) {
      await select(target);
      const read=await settled(target);
      const [tab,ink,low,lowest,labelBottom]=read.split('|');
      console.log(`dark ${target} over ${art}: ink ${ink} p5 ${low}:1 under the label and glyph, ${lowest}:1 under the label's lowest rows (label foot ${labelBottom} css px down the bar)`);
      expect(tab).toBe(target);
      expect(Number(low),`${target} over ${art}: p5 under the label and glyph`).toBeGreaterThanOrEqual(2);
      expect(Number(lowest),`${target} over ${art}: p5 under the label's lowest rows`).toBeGreaterThanOrEqual(2);
    }
  }
});
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
  // LOOK-27 (F23 review note): since ab225677 (ACCENT_FLOOR 2.6, and 3 for Apple's ink luminance) the ink over #777 is a
  // lighter blue than #0a84ff as well, not as light as over #ddd, so it still changes at each step.
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
// back on the release spring every time. Step the real CSS timeline at 60 Hz instead of measuring wall-clock rAF gaps:
// slow rendering can combine several spring frames into a single sample. The selection is made in place (no route
// change), so the Games scene and its lens stay up throughout.
for(const gesture of ['tap','drag'] as const) test(`a ${gesture} release that changes the tab lets the raised lens ease down on the release spring`,async({page,browserName})=>{
  test.skip(browserName!=='chromium','the timeline is controlled through the Chromium DevTools protocol');
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
  const lift=(scale:string)=>{
    const [sx,sy=sx]=scale==='none'?[1]:scale.split(' ').map(Number);
    return Math.min(1,Math.max(0,(sx*sy-1.07)/.18));
  };
  try{
    // Freeze the document timeline, not individual animations: release handlers must still see running transitions.
    await cdp.send('Animation.setPlaybackRate',{playbackRate:0});
    const held=await bar.evaluate(el=>getComputedStyle(el,'::after').scale);
    expect(lift(held),'held lift').toBe(1);
    await page.mouse.up();
    await expect(movies).toHaveAttribute('aria-current','page');
    const trace=await bar.evaluate(async el=>{
      const frame=()=>new Promise<number>(resolve=>requestAnimationFrame(resolve));
      const step=1000/60, samples=[];
      // Include the instant of release and then 32 normal frames (over 500 ms, past the 460 ms spring).
      for(let i=0;i<=32;i++){
        // Allow the actual section-lens renderer to draw this pose before reading its pad.
        await frame();
        const timestamp=await frame();
        const animations=el.getAnimations({subtree:true});
        const spring=animations.find(a=>a instanceof CSSTransition&&a.transitionProperty==='scale'&&
          (a.effect as KeyframeEffect|null)?.pseudoElement==='::after');
        samples.push({elapsed:i*step,timestamp,wallTime:performance.now(),springTime:spring?.currentTime??null,
          scale:getComputedStyle(el,'::after').scale,
          pad:el.querySelector<HTMLCanvasElement>('canvas.section-lens')?.style.getPropertyValue('--section-lens-pad-x')??''});
        // Advance only live animations, never resurrect a transition cancelled by the selection stretch.
        // Step the bar's other transitions too so the rendered geometry follows the same animation time.
        if(i<32)for(const a of animations){
          if(a.playState==='running'&&typeof a.currentTime==='number')a.currentTime+=step;
        }
      }
      return samples;
    });
    const lifts=trace.map(sample=>lift(sample.scale)), details=JSON.stringify(trace);
    // The held bubble must survive lift-off, and no normal frame may drop its lift by more than .30.
    expect(lifts[0],details).toBeGreaterThan(.6);
    const maxDrop=Math.max(lift(held)-lifts[0],...lifts.slice(1).map((value,i)=>lifts[i]-value));
    expect(maxDrop,details).toBeLessThanOrEqual(.3);
    expect(lifts.at(-1),details).toBe(0);
    const padded=trace.filter(sample=>sample.pad!=='').length;
    expect(padded,details).toBeGreaterThanOrEqual(4);
    expect(trace.at(-1)?.pad,details).toBe('');
    expect(trace.at(-1)?.scale,details).toMatch(/^(none|1( 1)?)$/);
    expect(trace.at(-1)?.springTime,details).toBeNull();
    // Prove that wall-clock stalls did not advance the timeline, and that the release really stepped.
    expect(new Set(trace.map(sample=>sample.timestamp)).size,details).toBe(1);
    expect(trace[0].springTime,details).toBe(0);
    expect(trace[1].springTime,details).toBeCloseTo(1000/60);
    console.log(`${gesture} release: max 60 Hz lift drop ${maxDrop}, padded frames ${padded}, final lift ${lifts.at(-1)}`);
  }finally{
    await cdp.send('Animation.setPlaybackRate',{playbackRate:1});
    await cdp.detach();
  }
});
