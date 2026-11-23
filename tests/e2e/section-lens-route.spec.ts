import {expect,test} from '../fixtures';

// MOTION-5 (#24): the MOTION-4 release specs (section-lens.spec.ts) make the new selection in place, so the Games scene and its
// lens stay up. A real drag let go over Movies also changes the route (Charlie's video turns the page to Library at the lift,
// 15.183 s), and the new route can tear the Games bar's WebGL lens down while its raised bubble is still falling. Through that
// change no section bar may pop its bubble (a visible bar's lift never drops by more than a third in a frame, with the CSS
// timeline at .1x), no other bar may show a raised bubble it was never pressed into, and nothing may be left raised, pressed
// or dragging once the route has settled.
test('a drag release that changes the route lets the lens fall without a pop and leaves nothing raised',async({page,browserName})=>{
  test.skip(browserName!=='chromium','the timeline is slowed through the Chromium DevTools protocol');
  // MOTION-6 (#24 review of MOTION-5, finding 2): the CSS pill's scale eases on its own transition whatever the WebGL lens
  // does, so the bubble is read from the lens itself. Each section lens's WebGL uniforms (pillLift, pillProjection) are
  // copied onto the canvas the bar shows when its frame is presented (section-lens.ts draws the WebGL buffer into it).
  await page.addInitScript(()=>{
    const gl=WebGL2RenderingContext.prototype,ctx=CanvasRenderingContext2D.prototype;
    const names=new WeakMap<WebGLUniformLocation,string>();
    const getLoc=gl.getUniformLocation,uniform=gl.uniform1f,draw=ctx.drawImage;
    type Lens={pillLift?:number;pillProjection?:number};
    gl.getUniformLocation=function(this:WebGL2RenderingContext,program:WebGLProgram,name:string){
      const loc=getLoc.call(this,program,name);
      if(loc&&(this.canvas as HTMLCanvasElement).classList?.contains('section-lens'))names.set(loc,name);
      return loc;
    };
    gl.uniform1f=function(this:WebGL2RenderingContext,loc:WebGLUniformLocation|null,value:number){
      const name=loc&&names.get(loc);
      if(name){const canvas=this.canvas as HTMLCanvasElement&{__lens?:Lens};(canvas.__lens??={})[name as keyof Lens]=value;}
      return uniform.call(this,loc,value);
    };
    ctx.drawImage=function(this:CanvasRenderingContext2D,...args:unknown[]){
      const source=args[0] as HTMLCanvasElement&{__lens?:Lens};
      if(source?.__lens&&this.canvas.classList.contains('section-lens'))(this.canvas as HTMLCanvasElement&{__lens?:Lens}).__lens={...source.__lens};
      return Reflect.apply(draw,this,args);
    };
  });
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  const games=bar.getByRole('link',{name:'Games',exact:true}), movies=bar.getByRole('link',{name:'Movies',exact:true});
  await expect(games).toHaveAttribute('aria-current','page');
  const from=(await games.boundingBox())!, to=(await movies.boundingBox())!;
  const y=from.y+from.height/2;
  await page.mouse.move(from.x+from.width/2,y);
  await page.mouse.down();
  await page.mouse.move(to.x+to.width/2,y,{steps:6});
  await expect(bar).toHaveAttribute('data-pill-dragging','');
  await expect.poll(()=>bar.locator('canvas.section-lens').evaluate(el=>(el as HTMLCanvasElement).style.getPropertyValue('--section-lens-pad-x'))).not.toBe('');
  await page.waitForTimeout(300);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate',{playbackRate:.1});
  await page.evaluate(()=>{
    type Sample={t:number;bars:{origin:boolean;lift:number;pad:string;webgl:boolean;shown:boolean;lensLift:number;projection:number}[]};
    const w=window as Window&{__trace?:Sample[];__released?:number};
    document.querySelector('.app-tabbar')!.setAttribute('data-route-origin','');
    w.__trace=[];
    addEventListener('pointerup',()=>{w.__released??=performance.now();},{capture:true,once:true});
    const end=performance.now()+2600;
    const sample=()=>{
      const t=performance.now();
      const bars=[...document.querySelectorAll<HTMLElement>('.section-tabbar')].filter(el=>el.isConnected&&el.getBoundingClientRect().width>0&&getComputedStyle(el).visibility!=='hidden').map(el=>{
        const scale=getComputedStyle(el,'::after').scale;
        const [sx,sy=sx]=scale==='none'?[1]:scale.split(' ').map(Number);
        const lens=el.querySelector<HTMLCanvasElement&{__lens?:{pillLift?:number;pillProjection?:number}}>('canvas.section-lens');
        const webgl=el.dataset.sectionLens==='webgl',shown=webgl&&!!lens&&getComputedStyle(lens).visibility!=='hidden';
        return {origin:el.hasAttribute('data-route-origin'),lift:Math.min(1,Math.max(0,(sx*sy-1.07)/.18)),pad:lens?.style.getPropertyValue('--section-lens-pad-x')??'',
          webgl,shown,lensLift:shown?lens!.__lens?.pillLift??0:0,projection:shown?lens!.__lens?.pillProjection??0:0};
      });
      w.__trace!.push({t,bars});
      if(t<end)requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(2800);
  await cdp.send('Animation.setPlaybackRate',{playbackRate:1});
  await expect(page).toHaveURL(/#\/movies\/browse\/movie$/);
  const {trace,released}=await page.evaluate(()=>{
    const w=window as Window&{__trace?:{t:number;bars:{origin:boolean;lift:number;pad:string;webgl:boolean;shown:boolean;lensLift:number;projection:number}[]}[];__released?:number};
    return {trace:w.__trace!,released:w.__released!};
  });
  const before=trace.filter(sample=>sample.t<released), after=trace.filter(sample=>sample.t>=released);
  expect(before.at(-1)?.bars.find(entry=>entry.origin)?.lift,'held lift').toBe(1);
  expect(after.length).toBeGreaterThan(8);
  // MOTION-7: Apple's tab bar never leaves the screen when a tab turns the page (Charlie's video, 15.183 s). The Games bar
  // stays up, inert, while Movies loads (main.ts tabHandover; it used to be gone for about 30-370 ms), and gives way only
  // in the frame the Movies bar arrives: every frame after the lift shows a section bar, and the Games bar is on screen
  // until a Movies bar is.
  const blank=after.filter(sample=>sample.bars.length===0).map(sample=>Math.round(sample.t-released));
  expect(blank,'frames with no tab bar, ms after the lift').toEqual([]);
  const handed=after.findIndex(sample=>sample.bars.some(entry=>!entry.origin));
  expect(handed,'the Movies bar arrives').toBeGreaterThan(-1);
  expect(after.slice(0,handed).every(sample=>sample.bars.some(entry=>entry.origin)),'the Games bar holds until then').toBe(true);
  // The Games bar's bubble, while that bar is still on screen, falls on the release spring: no step of more than a third.
  const origin=after.map(sample=>sample.bars.find(entry=>entry.origin)?.lift).filter((lift):lift is number=>lift!==undefined);
  expect(origin[0]??0,JSON.stringify(origin)).toBeGreaterThan(.6);
  expect(Math.max(0,...origin.slice(1).map((lift,i)=>origin[i]-lift)),JSON.stringify(origin)).toBeLessThanOrEqual(.3);
  // MOTION-6: and so does the bubble the WebGL lens draws. While the Games bar is on screen and its pill still swells, its lens
  // stays the WebGL lens, shown and raised (a torn-down lens falls back to the CSS pill, which hides the canvas), and the
  // lens's own lift and projection never drop by more than a third in a frame. (MOTION-7: the Games bar now stays on screen
  // through the Movies load, its lens painting the loading page, so the bubble is seen falling for the whole load.)
  const lenses=after.map(sample=>sample.bars.find(entry=>entry.origin)).filter((entry):entry is NonNullable<typeof entry>=>!!entry);
  expect(lenses[0]?.lensLift??0,JSON.stringify(lenses.slice(0,4))).toBeGreaterThan(.6);
  const torn=lenses.filter(entry=>entry.lift>.05&&!(entry.shown&&entry.pad!==''));
  expect(torn,JSON.stringify(torn.slice(0,4))).toEqual([]);
  for(const key of ['lensLift','projection'] as const){
    const series=lenses.map(entry=>entry[key]);
    expect(Math.max(0,...series.slice(1).map((value,i)=>series[i]-value)),`${key} ${JSON.stringify(series)}`).toBeLessThanOrEqual(.3);
  }
  // A bar the route brings in was never pressed, so it never shows a raised bubble.
  const others=after.flatMap(sample=>sample.bars.filter(entry=>!entry.origin));
  expect(others.filter(entry=>entry.lift>0||entry.pad!==''),JSON.stringify(others.slice(0,6))).toEqual([]);
  // Once the route has settled, every section bar is flat: not pressed or dragging, no swell, and no raised lens on show. A bar
  // the route has hidden keeps its last lens frame on a canvas the stylesheet hides until its next fresh draw
  // (section-navigation.css: visible only under data-section-lens=webgl), so a raised pad there is never seen.
  await page.waitForTimeout(700);
  const settled=await page.evaluate(()=>[...document.querySelectorAll<HTMLElement>('.section-tabbar')].map(el=>{
    const lens=el.querySelector<HTMLCanvasElement>('canvas.section-lens');
    return {pressing:el.hasAttribute('data-pressing'),dragging:el.hasAttribute('data-pill-dragging'),scale:getComputedStyle(el,'::after').scale,
      raised:!!lens&&getComputedStyle(lens).visibility!=='hidden'&&lens.style.getPropertyValue('--section-lens-pad-x')!==''};
  }));
  expect(settled.length).toBeGreaterThan(0);
  for(const entry of settled)expect(entry,JSON.stringify(settled)).toEqual({pressing:false,dragging:false,scale:'none',raised:false});
});
