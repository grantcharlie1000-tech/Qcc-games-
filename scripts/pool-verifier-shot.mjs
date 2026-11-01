import assert from 'node:assert/strict';

// This browser function only observes layout/state. It never invokes app hooks.
function inspectLayout(canvas,{expected}={}){
 const root=canvas.closest('.pool-game'),stage=canvas.closest('#game-stage'),available=stage?.parentElement;
 const sample=()=>{
  if(!canvas.isConnected||!root||!stage||!available)throw Error('Pool readiness requires the mounted table');
  if(document.visibilityState!=='visible'||document.querySelector('#app')?.inert||document.querySelector('#pause-game')?.getAttribute('aria-label')!=='Pause game'||!document.querySelector('#pause-overlay')?.hidden||root.dataset.phase!=='aim'||root.dataset.gesture!=='idle'||root.dataset.shots!=='0')throw Error('Pool readiness requires visible unpaused aim/idle with zero shots');
  const r=canvas.getBoundingClientRect(),style=getComputedStyle(root),canvasStyle=getComputedStyle(canvas);
  const rect={x:r.x,y:r.y,width:r.width,height:r.height};
  const width=available.clientWidth,height=available.clientHeight,naturalWidth=Math.max(root.offsetWidth,root.scrollWidth),naturalHeight=Math.max(root.offsetHeight,root.scrollHeight)+(parseFloat(style.marginTop)||0)+(parseFloat(style.marginBottom)||0);
  const scale=!naturalWidth||!naturalHeight?1:Math.min(width/naturalWidth,height/naturalHeight);
  const area=available.getBoundingClientRect(),bounds=root.getBoundingClientRect();
  const fit=stage.classList.contains('viewport-fitted')
   ? stage.style.width===`${width}px`&&stage.style.height===`${naturalHeight}px`&&Math.abs(Number(stage.dataset.viewportScale)-scale)<1e-6
   : bounds.left>=area.left-.5&&bounds.right<=area.right+.5&&bounds.top>=area.top-.5&&bounds.bottom<=area.bottom+.5;
  const ready=fit&&width>0&&height>0&&Object.values(rect).every(Number.isFinite)&&r.width>0&&r.height>0&&canvasStyle.display!=='none'&&canvasStyle.visibility==='visible'&&!stage.getAnimations({subtree:true}).some(a=>a.playState==='running'||a.pending);
  return {...rect,layoutKey:JSON.stringify([rect,stage.style.cssText,stage.dataset.viewportScale,width,height,naturalWidth,naturalHeight]),ready};
 };
 if(expected){
  const current=sample();
  if(!current.ready||current.layoutKey!==expected.layoutKey)throw Error('Pool layout changed before pointerdown: '+JSON.stringify({expected,current}));
  return current;
 }
 return new Promise((resolve,reject)=>{
  let previous,stable=0,frame;
  const timeout=setTimeout(()=>finish(Error('Pool layout readiness timed out after15000ms')),15000);
  function finish(error,value){clearTimeout(timeout);cancelAnimationFrame(frame);if(error)reject(error);else resolve(value);}
  function tick(){
   try{
    const current=sample();stable=current.ready&&current.layoutKey===previous?stable+1:current.ready?1:0;previous=current.layoutKey;
    if(stable===3){finish(null,current);return;}
    frame=requestAnimationFrame(tick);
   }catch(error){finish(error);}
  }
  frame=requestAnimationFrame(tick);
 });
}

export async function settledPoolGeometry(page){
 let timer;
 try{return await Promise.race([page.locator('.pool-table').evaluate(inspectLayout,{}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Pool layout readiness timed out after15000ms (Node deadline)')),15000);})]);}
 finally{clearTimeout(timer);}
}

/** Project fixture coordinates independently of the application's inverse input mapping. */
export function poolScreenPoint(b,x,y){
 return b.height>b.width?{x:b.x+x/440*b.width,y:b.y+y/840*b.height}:{x:b.x+(840-y)/840*b.width,y:b.y+x/440*b.height};
}

export async function preparePoolShot(page){
 const canvas=page.locator('.pool-table');await canvas.hover();
 const b=await settledPoolGeometry(page);
 const cue=poolScreenPoint(b,220,615);await page.mouse.move(cue.x,cue.y);
 await canvas.evaluate(inspectLayout,{expected:b});
 return b;
}

export async function verifyPoolShot(page){
 const b=await preparePoolShot(page);
 const end=poolScreenPoint(b,220,705);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});await page.mouse.up();
 assert.equal(await page.locator('.pool-game').getAttribute('data-shots'),'1');
}
