// WebKit cannot reliably displace a CSS backdrop. A bounded canvas copies the
// current game frame each RAF; an ordinary SVG filter bends only its rim.
// No game state, screenshots, readbacks or network resources enter this path.
const NS='http://www.w3.org/2000/svg',BEVEL=10,BEND=3;
interface Lens{draw():void;clear():void}
const lenses=new Set<Lens>();
let frame=0,sequence=0;
function tick(){
  frame=0;
  if(document.hidden){for(const lens of lenses)lens.clear();return;}
  for(const lens of lenses)lens.draw();
  if(lenses.size)frame=requestAnimationFrame(tick);
}
function wake(){if(!frame&&lenses.size&&!document.hidden)frame=requestAnimationFrame(tick);}
function visibility(){if(document.hidden){cancelAnimationFrame(frame);frame=0;for(const lens of lenses)lens.clear();}else wake();}

function displacement(width:number,height:number,radius:number,density:number):string{
  const map=document.createElement('canvas');map.width=Math.round(width*density);map.height=Math.round(height*density);
  const ctx=map.getContext('2d');if(!ctx)return '';
  const pixels=ctx.createImageData(map.width,map.height);
  for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){
    const px=(x+.5)/density,py=(y+.5)/density;
    const dx=px-Math.min(Math.max(px,radius),width-radius),dy=py-Math.min(Math.max(py,radius),height-radius);
    const distance=Math.hypot(dx,dy),depth=radius-distance;
    const t=Math.min(1,Math.max(0,depth)/BEVEL),power=-BEND*(1-t*t*(3-2*t));
    const i=(y*map.width+x)*4;
    pixels.data[i]=Math.round(255*(.5+(distance?power*dx/distance:0)/(2*BEND)));
    pixels.data[i+1]=Math.round(255*(.5+(distance?power*dy/distance:0)/(2*BEND)));
    pixels.data[i+2]=128;pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);return map.toDataURL();
}

/** Enabled only on fallback engines; unsupported/tainted sources stay on live CSS blur. */
export function bindLiveCanvasGlass(surface:HTMLElement):{setEnabled(enabled:boolean):void;dispose():void}{
  const canvas=document.createElement('canvas');canvas.className='ui-glass-live';canvas.setAttribute('aria-hidden','true');
  const ctx=canvas.getContext('2d');
  const svg=document.createElementNS(NS,'svg');svg.setAttribute('width','0');svg.setAttribute('height','0');svg.setAttribute('aria-hidden','true');svg.dataset.liveLensFilter='';
  const filter=document.createElementNS(NS,'filter'),image=document.createElementNS(NS,'feImage'),bend=document.createElementNS(NS,'feDisplacementMap');
  const id=`ui-live-lens-${++sequence}`;filter.id=id;filter.setAttribute('color-interpolation-filters','sRGB');filter.setAttribute('x','0');filter.setAttribute('y','0');filter.setAttribute('width','100%');filter.setAttribute('height','100%');
  image.setAttribute('preserveAspectRatio','none');image.setAttribute('width','100%');image.setAttribute('height','100%');image.setAttribute('result','map');
  bend.setAttribute('in','SourceGraphic');bend.setAttribute('in2','map');bend.setAttribute('scale',String(2*BEND));bend.setAttribute('xChannelSelector','R');bend.setAttribute('yChannelSelector','G');filter.append(image,bend);svg.append(filter);
  canvas.style.filter=`url(#${id}) blur(3px)`;
  let enabled=false,disposed=false,failed=!ctx,ready=false,key='',generation=0;
  let source:HTMLCanvasElement|null=null;
  const clear=()=>{if(!canvas.hidden)canvas.hidden=true;if(surface.hasAttribute('data-live-lens'))surface.removeAttribute('data-live-lens');};
  const detach=()=>{clear();canvas.remove();svg.remove();};
  const fail=()=>{failed=true;ready=false;generation++;lenses.delete(lens);detach();};
  const start=()=>{
    const view=surface.closest('.game-view')??(document.body.classList.contains('in-game')?document.querySelector('.game-view'):null);
    if(!view||view.matches('[data-game-id=shooter]'))return;
    source=view.querySelector<HTMLCanvasElement>('#game-stage canvas:not(.ui-glass-live)');
    if(!source){const stage=view.querySelector('#game-stage');if(stage)sourceWatch.observe(stage,{childList:true});return;}
    sourceWatch.disconnect();lenses.add(lens);if(lenses.size===1)document.addEventListener('visibilitychange',visibility);wake();
  };
  const sourceWatch=new MutationObserver(()=>{if(enabled&&!disposed&&!failed)start();});
  const lens:Lens={clear,draw(){
    if(disposed||failed||!enabled||!surface.isConnected){detach();return;}
    if(!source?.isConnected){
      const view=surface.closest('.game-view')??(document.body.classList.contains('in-game')?document.querySelector('.game-view'):null);
      source=view?.matches('[data-game-id=shooter]')?null:view?.querySelector<HTMLCanvasElement>('#game-stage canvas:not(.ui-glass-live)')??null;
    }
    if(!source||!source.width||!source.height){clear();return;}
    const style=getComputedStyle(surface);
    if(style.visibility==='hidden'||style.display==='none'||Number(style.opacity)===0||surface.closest('[hidden],[data-sheet-hidden]')){clear();return;}
    const box=surface.getBoundingClientRect(),back=source.getBoundingClientRect();
    const left=Math.max(box.left,back.left),top=Math.max(box.top,back.top),right=Math.min(box.right,back.right),bottom=Math.min(box.bottom,back.bottom);
    if(!box.width||!box.height||right<=left||bottom<=top){clear();return;}
    // A capped density bounds phone raster/filter cost even on DPR3 displays.
    const width=surface.offsetWidth,height=surface.offsetHeight;
    const density=Math.min(1.5,Math.max(1,devicePixelRatio||1),Math.sqrt(98000/(width*height)));
    const radius=Math.min(parseFloat(style.borderTopLeftRadius)||height/2,width/2,height/2);
    const next=`${width}/${height}/${radius}/${density}`;
    if(key!==next){
      key=next;ready=false;clear();canvas.width=Math.round(width*density);canvas.height=Math.round(height*density);
      const token=++generation;
      try{
        const url=displacement(width,height,radius,density);if(!url){fail();return;}
        const probe=new Image();probe.onload=()=>{if(disposed||token!==generation)return;image.setAttribute('href',url);image.setAttributeNS('http://www.w3.org/1999/xlink','xlink:href',url);ready=true;};probe.onerror=fail;probe.src=url;
      }catch{fail();return;}
    }
    if(!ready){clear();return;}
    if(!svg.isConnected)document.body.append(svg);
    if(canvas.parentElement!==surface)surface.prepend(canvas);
    try{
      ctx!.clearRect(0,0,canvas.width,canvas.height);
      ctx!.drawImage(source,(left-back.left)*source.width/back.width,(top-back.top)*source.height/back.height,(right-left)*source.width/back.width,(bottom-top)*source.height/back.height,
        (left-box.left)*canvas.width/box.width,(top-box.top)*canvas.height/box.height,(right-left)*canvas.width/box.width,(bottom-top)*canvas.height/box.height);
      if(canvas.hidden)canvas.hidden=false;if(!surface.hasAttribute('data-live-lens'))surface.dataset.liveLens='';
    }catch{fail();}
  }};
  return{setEnabled(value){
    if(disposed||failed||enabled===value)return;
    enabled=value;
    if(enabled)start();
    else{sourceWatch.disconnect();lenses.delete(lens);detach();if(!lenses.size){document.removeEventListener('visibilitychange',visibility);cancelAnimationFrame(frame);frame=0;}}
  },dispose(){if(disposed)return;disposed=true;generation++;sourceWatch.disconnect();lenses.delete(lens);detach();if(!lenses.size){document.removeEventListener('visibilitychange',visibility);cancelAnimationFrame(frame);frame=0;}}};
}

/** Shared sheets use the same live fallback and accessibility policy as bars. */
export function bindFallbackCanvasGlass(surface:HTMLElement):()=>void{
 const lens=bindLiveCanvasGlass(surface);
 const queries=[matchMedia('(prefers-reduced-transparency: reduce)'),matchMedia('(prefers-contrast: more)'),matchMedia('(forced-colors: active)')];
 const brands=(navigator as Navigator&{userAgentData?:{brands?:{brand:string}[]}}).userAgentData?.brands;
 const fallback=new URLSearchParams(location.search).get('glass')==='fallback'||!brands?.some(b=>b.brand==='Chromium');
 const sync=()=>lens.setEnabled(fallback&&!queries.some(q=>q.matches));
 for(const q of queries)q.addEventListener('change',sync);sync();
 return()=>{for(const q of queries)q.removeEventListener('change',sync);lens.dispose();};
}
