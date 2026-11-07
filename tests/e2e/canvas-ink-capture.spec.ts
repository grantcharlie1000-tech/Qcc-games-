import {expect,test} from '../fixtures';

test('canvas ink clears transparent pixels between captures and follows resized sources',async({page})=>{
  await page.goto('/#/collection');
  const samples=await page.evaluate(async()=>{
    const {canvasInk}=await import(String('/src/ui/canvas-ink.ts'));
    const canvas=document.createElement('canvas');canvas.width=4;canvas.height=4;
    canvas.style.cssText='position:fixed;left:20px;top:20px;width:40px;height:40px';document.body.append(canvas);
    const ctx=canvas.getContext('2d')!;
    const original=performance.now.bind(performance);let now=1000;
    Object.defineProperty(performance,'now',{configurable:true,value:()=>now});
    const read=(x:number)=>{const box=canvas.getBoundingClientRect();return canvasInk(new DOMRect(box.left+x,box.top+20,1,1),canvas);};
    try{
      ctx.fillStyle='#ff0000';ctx.fillRect(0,0,4,4);const red=read(10);
      now+=121;ctx.clearRect(0,0,4,4);ctx.fillStyle='#0000ff';ctx.fillRect(2,0,2,4);
      const transparent=read(10),blue=read(30);
      canvas.width=8;canvas.height=4;ctx.fillStyle='#00ff00';ctx.fillRect(0,0,8,4);
      now+=121;const resized=read(10);
      return {red,transparent,blue,resized};
    }finally{Object.defineProperty(performance,'now',{configurable:true,value:original});canvas.remove();}
  });
  expect(samples).toEqual({red:[[255,0,0]],transparent:null,blue:[[0,0,255]],resized:[[0,255,0]]});
});

test('a tainted canvas does not prevent later clean captures of the same size',async({page})=>{
  await page.route('https://image.tmdb.org/ink-test.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="white"/></svg>'}));
  await page.goto('/#/collection');
  const samples=await page.evaluate(async()=>{
    const {canvasInk}=await import(String('/src/ui/canvas-ink.ts'));
    const image=new Image();image.src='https://image.tmdb.org/ink-test.svg';await image.decode();
    const make=()=>{const c=document.createElement('canvas');c.width=c.height=4;c.style.cssText='position:fixed;left:20px;top:20px;width:40px;height:40px';document.body.append(c);return c;};
    const a=make(),b=make(),aCtx=a.getContext('2d')!,bCtx=b.getContext('2d')!;
    const original=performance.now.bind(performance);let now=1000;
    Object.defineProperty(performance,'now',{configurable:true,value:()=>now});
    const read=(c:HTMLCanvasElement)=>{const box=c.getBoundingClientRect();return canvasInk(new DOMRect(box.left+20,box.top+20,1,1),c);};
    try{
      aCtx.fillStyle='#ff0000';aCtx.fillRect(0,0,4,4);const before=read(a);
      now+=121;aCtx.drawImage(image,0,0,4,4);const retained=read(a);
      bCtx.fillStyle='#0000ff';bCtx.fillRect(0,0,4,4);const other=read(b);
      a.width=4;a.height=4;aCtx.fillStyle='#00ff00';aCtx.fillRect(0,0,4,4);
      now+=121;const recovered=read(a);
      return {before,retained,other,recovered};
    }finally{Object.defineProperty(performance,'now',{configurable:true,value:original});a.remove();b.remove();}
  });
  expect(samples).toEqual({before:[[255,0,0]],retained:[[255,0,0]],other:[[0,0,255]],recovered:[[0,255,0]]});
});

test('canvas ink captures and clears non-preserved WebGL frames synchronously',async({page})=>{
  await page.goto('/#/collection');
  const samples=await page.evaluate(async()=>{
    const {canvasInk,syncCanvasInkSource}=await import(String('/src/ui/canvas-ink.ts'));
    const {registerGlassFrameSource,notifyGlassFrame}=await import(String('/src/ui/glass-frame-source.ts'));
    const canvas=document.createElement('canvas');canvas.width=4;canvas.height=4;
    canvas.style.cssText='position:fixed;left:20px;top:20px;width:40px;height:40px';document.body.append(canvas);
    const gl=canvas.getContext('webgl2',{alpha:true,preserveDrawingBuffer:false})!;
    const original=performance.now.bind(performance);let now=1000,blue=false;
    Object.defineProperty(performance,'now',{configurable:true,value:()=>now});
    const repaint=()=>{
      gl.disable(gl.SCISSOR_TEST);gl.clearColor(blue?0:1,0,0,blue?0:1);gl.clear(gl.COLOR_BUFFER_BIT);
      if(blue){gl.enable(gl.SCISSOR_TEST);gl.scissor(2,0,2,4);gl.clearColor(0,0,1,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.disable(gl.SCISSOR_TEST);}
      notifyGlassFrame(canvas);
    };
    const release=registerGlassFrameSource(canvas,repaint);
    const read=(x:number)=>{const box=canvas.getBoundingClientRect();return canvasInk(new DOMRect(box.left+x,box.top+20,1,1),canvas);};
    try{
      syncCanvasInkSource(canvas);const red=read(10);
      now+=121;blue=true;repaint();const transparent=read(10),right=read(30);
      return {red,transparent,right,preserved:gl.getContextAttributes()!.preserveDrawingBuffer};
    }finally{syncCanvasInkSource(null);release();Object.defineProperty(performance,'now',{configurable:true,value:original});canvas.remove();}
  });
  expect(samples).toEqual({red:[[255,0,0]],transparent:null,right:[[0,0,255]],preserved:false});
});
