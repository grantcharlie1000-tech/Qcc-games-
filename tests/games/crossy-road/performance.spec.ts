import {test,expect} from '../../fixtures';
import sharp from 'sharp';
import {openGame,hook} from './helpers';
import {AdaptiveResolution} from '../../../src/games/crossy-road/quality';

test('crisp directional shadows keep the reference contrast without an offscreen shadow texture',async({page})=>{
  await openGame(page,{viewport:{width:390,height:844}});
  await hook(page).setQuality('high');
  const sample=await page.evaluate(()=>{
    const h=window.__crossyRoadTest!;
    const lanes=Array.from({length:24},(_,i)=>{
      const row=i-6,obstacles=Array(9).fill(null),blocked=Array(9).fill(false),variant=Array(9).fill(0);
      if(row===2){obstacles[3]='tree';blocked[3]=true;variant[3]=2;}
      return {kind:'grass' as const,row,shade:((row%2+2)%2) as 0|1,obstacles,blocked,variant,edge:Array(12).fill(null)};
    });
    h.forceLanes(lanes);
    const canvas=document.querySelector<HTMLCanvasElement>('.hw-canvas')!,copy=document.createElement('canvas');
    copy.width=canvas.width;copy.height=canvas.height;
    const ctx=copy.getContext('2d')!;ctx.drawImage(canvas,0,0);
    // Independently project ground points under the 45° / 20° camera at row zero.
    const pitch=Math.PI/4,yaw=20*Math.PI/180,tile=390/(8*Math.cos(yaw)),dpr=canvas.width/390;
    const pixel=(x:number)=>{
      const z=-2*1.38,sx=195+tile*((x-4)*Math.cos(yaw)-z*Math.sin(yaw));
      const sy=844*.65+tile*Math.sin(pitch)*((x-4)*Math.sin(yaw)+z*Math.cos(yaw));
      return [...ctx.getImageData(Math.round(sx*dpr),Math.round(sy*dpr),1,1).data];
    };
    return {bright:pixel(2),shadow:pixel(4),stats:h.stats()};
  });
  expect(sample.bright[1]).toBeGreaterThan(210);
  expect(sample.shadow[1]).toBeGreaterThan(110);
  expect(sample.shadow[1]).toBeLessThan(165);
  expect(sample.shadow[1]).toBeLessThan(sample.bright[1]*.72);
  expect(sample.stats.quality).toBe('high');
  expect(sample.stats.textures).toBe(0);
  expect(sample.stats.calls).toBeLessThanOrEqual(48);
});

test('an unchanged frame reuses instance buffers instead of uploading every static prop again',async({page})=>{
  await openGame(page);
  const uploads=await page.evaluate(()=>{
    const h=window.__crossyRoadTest!,gl=document.querySelector<HTMLCanvasElement>('.hw-canvas')!.getContext('webgl2')!;
    h.forceLanes([]);
    const original=gl.bufferSubData.bind(gl);let count=0;
    gl.bufferSubData=((...args:Parameters<typeof gl.bufferSubData>)=>{count++;return original(...args);}) as typeof gl.bufferSubData;
    try{h.forceLanes([]);return count;}finally{gl.bufferSubData=original;}
  });
  expect(uploads).toBe(0);
});

test('projected closed voxel casters cull redundant back faces',async({page})=>{
  await openGame(page);
  await hook(page).setQuality('high');
  const casters=await page.evaluate(()=>{
    const h=window.__crossyRoadTest!,gl=document.querySelector<HTMLCanvasElement>('.hw-canvas')!.getContext('webgl2')!;
    const original=gl.drawElementsInstanced.bind(gl),states:boolean[]=[];
    gl.drawElementsInstanced=(...args:Parameters<typeof gl.drawElementsInstanced>)=>{
      const program=gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram;
      if(gl.getUniformLocation(program,'uFloor')!==null)states.push(gl.isEnabled(gl.CULL_FACE));
      return original(...args);
    };
    try{h.forceLanes([]);return states;}finally{gl.drawElementsInstanced=original;}
  });
  expect(casters.length).toBeGreaterThan(0);
  expect(casters.every(Boolean)).toBe(true);
});

test.describe('mobile adaptive resolution',()=>{
  test.use({deviceScaleFactor:3});
  test('applies a sustained budget reduction during an uninterrupted buffered-hop sequence',async({page})=>{
    await openGame(page,{viewport:{width:390,height:844}});
    await page.evaluate(()=>{
      const h=window.__crossyRoadTest!,root=document.querySelector<HTMLElement>('.crossy-road')!;
      h.setQuality('high');
      h.forceLanes(Array.from({length:110},(_,i)=>({kind:'grass',row:i-8,shade:(i%2) as 0|1,
        blocked:Array(9).fill(false),obstacles:Array(9).fill(null),variant:Array(9).fill(0),edge:Array(12).fill(null)})));
      const native=requestAnimationFrame.bind(window);let clock=performance.now(),frames=0;
      // Deterministic 25 Hz timestamps isolate the controller from host load.
      // Feeding the buffer before every frame never exposes a grounded frame.
      window.requestAnimationFrame=callback=>native(()=>{
        h.hop('up');clock+=40;callback(clock);
        if(++frames===140){window.requestAnimationFrame=native;h.freeze(true);root.dataset.perfDone='true';}
      });
      h.freeze(false);
    });
    await page.waitForFunction(()=>document.querySelector<HTMLElement>('.crossy-road')?.dataset.perfDone==='true');
    // The budget starts at DPR 2 (780 px wide at 390 CSS px); two bad seconds drop it to DPR 1.5 and the next level needs four more.
    // The run is 140 frames x 40 ms = 5.6 s: past the first drop (2 s) but short of the second (6 s). Coupling: one more slow window
    // (>= 6 s of bad frames, i.e. 150 frames) would give DPR 1 = 390 px. Assert that schedule from quality.ts itself, at both edges,
    // so the 585 px expectation is derived from the controller rather than a bare constant.
    const schedule=(frames:number)=>{const r=new AdaptiveResolution();for(let i=0;i<frames;i++)r.observe(.04);return r.cap;};
    expect(schedule(139)).toBe(1.5);expect(schedule(140)).toBe(1.5);expect(schedule(150)).toBe(1);
    expect(await page.locator('.hw-canvas').evaluate((c:HTMLCanvasElement)=>c.width)).toBe(390*schedule(140));
    expect((await hook(page).state()).maxRow).toBeGreaterThan(25);
  });
});

test('HUD preserves its sampled appearance without copying or reading the Crossy GPU canvas',async({page})=>{
  await page.addInitScript(()=>{
    const original=CanvasRenderingContext2D.prototype.drawImage;
    (window as unknown as {crossyHudCopies:number}).crossyHudCopies=0;
    CanvasRenderingContext2D.prototype.drawImage=(function(this:CanvasRenderingContext2D,...args:Parameters<typeof original>){
      if(args[0] instanceof HTMLCanvasElement && args[0].matches('.hw-canvas'))
        (window as unknown as {crossyHudCopies:number}).crossyHudCopies++;
      return original.apply(this,args);
    }) as typeof original;
  });
  const errors=await openGame(page);
  const label=page.locator('#game-score strong');
  await expect(label).toHaveCSS('color','rgb(255, 255, 255)');
  await expect(label).toHaveAttribute('data-glass-halo','');
  // Exercise score and resize invalidation while the scene is deterministic.
  await page.locator('.hw-canvas').press('ArrowUp');
  await hook(page).advance(.2);
  await expect(label).not.toHaveText('0');
  await page.setViewportSize({width:390,height:844});
  await expect(label).toHaveAttribute('data-glass-halo','');
  expect(await page.evaluate(()=>(window as unknown as {crossyHudCopies:number}).crossyHudCopies)).toBe(0);
  // Reset snaps the camera; both captures now share exactly the same frozen pose.
  await hook(page).setSeed(11);
  const dock=page.locator('.game-dock');
  const optimized=await dock.screenshot({animations:'disabled'});
  const appearance=()=>page.locator('.game-dock .glass-ink').evaluateAll(labels=>labels.map(label=>{
    const style=getComputedStyle(label);return {text:label.textContent,color:style.color,shadow:style.textShadow};
  }));
  const optimizedAppearance=await appearance();
  // Re-enable the original pixel-sampling path in the same frozen scene.
  await page.evaluate(()=>{
    document.querySelector<HTMLCanvasElement>('.hw-canvas')!.dataset.glassInk='sample';
    dispatchEvent(new Event('resize'));
  });
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {crossyHudCopies:number}).crossyHudCopies)).toBeGreaterThan(0);
  expect(await appearance()).toEqual(optimizedAppearance);
  const sampled=await dock.screenshot({animations:'disabled'});
  await test.info().attach('hud-optimized',{body:optimized,contentType:'image/png'});
  await test.info().attach('hud-original-sampling',{body:sampled,contentType:'image/png'});
  const a=await sharp(optimized).ensureAlpha().raw().toBuffer(),b=await sharp(sampled).ensureAlpha().raw().toBuffer();
  expect(a.length).toBe(b.length);
  let changed=0;for(let i=0;i<a.length;i+=4)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>8)changed++;
  expect(changed/(a.length/4)).toBeLessThan(.001);
  expect(errors).toEqual([]);
});
