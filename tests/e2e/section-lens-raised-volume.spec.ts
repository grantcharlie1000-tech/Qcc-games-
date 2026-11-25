import {expect,originalTheme,test} from '../fixtures';

test.use({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,colorScheme:'light'});

// Read the actual pill uniform, not the CSS thumb or the quantized foreground warp map.
type RaisedWindow = Window & {raisedPill?:number[]};

test('a real page stripe curves continuously through the raised lens shoulder',async({context,page},info)=>{
  await originalTheme(context);
  await context.addInitScript(()=>{
    const gl=WebGL2RenderingContext.prototype;
    const locations=new WeakSet<WebGLUniformLocation>();
    const get=gl.getUniformLocation,send=gl.uniform4fv;
    gl.getUniformLocation=function(program,name){
      const location=get.call(this,program,name);
      if(location&&name==='pill'&&(this.canvas as HTMLCanvasElement).classList.contains('section-lens'))locations.add(location);
      return location;
    };
    gl.uniform4fv=function(location,value,...args){
      if(location&&locations.has(location))(window as RaisedWindow).raisedPill=Array.from(value);
      return Reflect.apply(send,this,[location,value,...args]);
    };
  });
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar'),canvas=bar.locator('canvas.section-lens');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  await page.evaluate(()=>document.fonts.ready);
  const games=(await bar.getByRole('link',{name:'Games',exact:true}).boundingBox())!;
  const x=games.x+games.width/2,y=games.y+games.height/2;
  await page.mouse.move(x,y);await page.mouse.down();
  await expect(bar).toHaveAttribute('data-pressing','');
  await page.mouse.move(x+138,y,{steps:4});
  await expect(bar).toHaveAttribute('data-pill-dragging','');
  await page.waitForTimeout(700);
  const geometry=await bar.evaluate(el=>{
    const r=el.getBoundingClientRect(),p=(window as RaisedWindow).raisedPill!;
    return {cx:r.x+p[0],cy:r.y+p[1],width:p[2],height:p[3]};
  });
  await page.locator('.game-grid').evaluate((grid,x)=>{
    const pad=document.createElement('div');
    pad.style.cssText='position:fixed;inset:auto 0 0;height:150px;z-index:2;background:#888;pointer-events:none';
    const stripe=document.createElement('div');
    stripe.style.cssText='position:absolute;top:0;bottom:0;width:9px;background:rgb(85,145,195);left:'+(x-4.5)+'px';
    pad.append(stripe);grid.append(pad);
  },geometry.cx);
  const sample=()=>canvas.evaluate((el,g)=>{
    const c=el as HTMLCanvasElement,r=c.getBoundingClientRect(),sx=c.width/r.width,sy=c.height/r.height;
    const ctx=c.getContext('2d')!,mid=Math.round((g.cx-r.x)*sx-.5),span=Math.round(18*sx);
    // A shoulder is a curved volume, not a thin painted rim: measure the actual stripe
    // at three depths before the 2px reflective outline, in both upper and lower rows.
    const offsets=[0,-g.height/2+10,-g.height/2+6,-g.height/2+3,g.height/2-10,g.height/2-6,g.height/2-3];
    return offsets.map(off=>{
      const row=Math.round((g.cy+off-r.y)*sy-.5);
      const d=ctx.getImageData(mid-span,row,2*span+1,1).data;
      const z=Array.from({length:2*span+1},(_,i)=>d[i*4+2]-d[i*4]);
      const outer=[...z.slice(0,5),...z.slice(-5)].sort((a,b)=>a-b),base=(outer[4]+outer[5])/2;
      const a=z.map(v=>Math.max(0,v-base)),peak=Math.max(...a);
      const half=peak/2;
      // Interpolate the two half-height crossings to avoid rounding at 1.5x canvas density.
      const left=a.findIndex(v=>v>=half),right=a.length-1-[...a].reverse().findIndex(v=>v>=half);
      const start=left>0?left-1+(half-a[left-1])/(a[left]-a[left-1]):left;
      const end=right<a.length-1?right+(a[right]-half)/(a[right]-a[right+1]):right;
      return {width:(end-start)/sx,peak};
    });
  },geometry);
  await expect.poll(async()=>(await sample())[0].peak).toBeGreaterThan(75);
  const rows=await sample();
  console.log('raised stripe profile',JSON.stringify({geometry,rows}));
  await page.screenshot({path:info.outputPath('raised-stripe-390.png'),scale:'css'});
  await canvas.screenshot({path:info.outputPath('raised-stripe-surface.png')});
  await page.mouse.up();
  expect(rows[0].width).toBeGreaterThan(7.65);
  expect(rows[0].width).toBeLessThan(11.25);
  for(const shoulder of [rows.slice(1,4),rows.slice(4,7)]){
    expect(shoulder[1].width-rows[0].width).toBeGreaterThan(1.25);
    expect(shoulder[2].width-rows[0].width).toBeGreaterThan(2.6);
    expect(shoulder[2].width).toBeGreaterThan(shoulder[1].width);
  }
  expect(geometry.width/geometry.height).toBeGreaterThanOrEqual(1.50);
});
