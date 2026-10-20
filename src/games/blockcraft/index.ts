import * as THREE from 'three';
import type {GameModule,GameContext,GameInstance} from '../../core/types';
import {AIR,WATER,BLOCK_NAMES,BLOCK_COUNT,BREAKABLE,HOTBAR,FACE_TILES,ATLAS_COLUMNS,ATLAS_ROWS,TILE} from './blocks';
import {TerrainGenerator,CS,CH} from './terrain';
import {VoxelWorld,chunkKey,MAX_EDITS} from './world';
import {meshChunk,quadIndices,MAX_QUADS,LOWERED,type MeshPart} from './mesher';
import {createPlayer,stepPlayer,raycast,playerCollides,EYE,type PlayerState,type RayHit} from './physics';
import {paintAtlas,paintClouds,ATLAS_WIDTH,ATLAS_HEIGHT} from './atlas';
import './style.css';

const VIEW_DISTANCES=[3,5,7,9],DEFAULT_VIEW=1,REACH=6,STEP=1/60,SKY=0x9fd3ff,UNDERWATER=0x1d4a8f;
const MESH_BUDGET_MS=5,GENERATE_BUDGET_MS=6,REPEAT_MS=230;
interface Snapshot{version:1;seed:number;x:number;y:number;z:number;yaw:number;pitch:number;slot:number;mined:number;placed:number;view:number;edits:number[]}
interface ChunkRender{solid?:THREE.Mesh;water?:THREE.Mesh}
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const nextSeed=(seed:number)=>(Math.imul(seed^0x9e3779b9,0x85ebca6b)>>>0)||1;

const VERTEX=`attribute vec4 info;
varying vec2 vTex;varying vec2 vTile;varying float vShade;
#include <fog_pars_vertex>
void main(){
  float lowered=step(${LOWERED-.5},info.z),tile=info.z-${LOWERED}.*lowered;
  vTex=info.xy;vTile=vec2(mod(tile,${ATLAS_COLUMNS}.),floor(tile/${ATLAS_COLUMNS}.));vShade=info.w/255.;
  vec4 mvPosition=modelViewMatrix*vec4(position.x,position.y-.125*lowered,position.z,1.);
  gl_Position=projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;
// Each greedy quad repeats its tile with fract(), so one quad can cover many blocks.
const FRAGMENT=`uniform sampler2D atlas;uniform float opacity;
varying vec2 vTex;varying vec2 vTile;varying float vShade;
#include <fog_pars_fragment>
void main(){
  vec2 f=clamp(fract(vTex),.001,.999);
  vec4 texel=texture2D(atlas,vec2((vTile.x+f.x)/${ATLAS_COLUMNS}.,1.-(vTile.y+1.-f.y)/${ATLAS_ROWS}.));
  gl_FragColor=vec4(texel.rgb*vShade,opacity);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
function voxelMaterial(atlas:THREE.Texture,opacity:number){
  const transparent=opacity<1,uniforms=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{opacity:{value:opacity}}]);
  // Assigned after merging, which would otherwise clone the texture.
  uniforms.atlas={value:atlas};
  return new THREE.ShaderMaterial({uniforms,vertexShader:VERTEX,fragmentShader:FRAGMENT,fog:true,transparent,depthWrite:!transparent,side:transparent?THREE.DoubleSide:THREE.FrontSide});
}
const CLOUD_SPAN=512,CLOUD_CELL=8;
/** Run-length merged cloud quads for a 3×3 block of identical tiles. */
function cloudLayer(){
  const size=CLOUD_SPAN/CLOUD_CELL,mask=paintClouds(size),positions:number[]=[];
  for(let tz=-1;tz<=1;tz++)for(let tx=-1;tx<=1;tx++)for(let y=0;y<size;y++){
    for(let x=0;x<size;){
      if(!mask[(y*size+x)*4+3]){x++;continue;}
      let end=x;while(end<size&&mask[(y*size+end)*4+3])end++;
      const x0=tx*CLOUD_SPAN+x*CLOUD_CELL-CLOUD_SPAN/2,x1=tx*CLOUD_SPAN+end*CLOUD_CELL-CLOUD_SPAN/2,z0=tz*CLOUD_SPAN+y*CLOUD_CELL-CLOUD_SPAN/2,z1=z0+CLOUD_CELL;
      positions.push(x0,0,z0,x1,0,z0,x0,0,z1,x0,0,z1,x1,0,z0,x1,0,z1);x=end;
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.computeBoundingSphere();return g;
}

/** Chunk offsets sorted nearest-first, computed once for the largest view. */
const OFFSETS=(()=>{
  const r=VIEW_DISTANCES[VIEW_DISTANCES.length-1]+2,list:[number,number,number][]=[];
  for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++)list.push([dx,dz,dx*dx+dz*dz]);
  return list.sort((a,b)=>a[2]-b[2]);
})();

function mount(container:HTMLElement,context:GameContext):GameInstance{
  const root=document.createElement('div');root.className='blockcraft';
  root.innerHTML=`<canvas tabindex="0" aria-label="Blockcraft 3D world. Move with W A S D or arrows, Space to jump, Shift to sprint. Click or tap to mine, right-click or long-press to place, 1 to 9 choose a block."></canvas>
  <div class="bc-crosshair" aria-hidden="true"></div><div class="bc-debug" aria-hidden="true" hidden></div>
  <div class="bc-hotbar" role="toolbar" aria-label="Blocks to place"></div>
  <button class="bc-view" type="button" aria-label="Change view distance">View</button>
  <div class="bc-touch" hidden><div class="bc-stick" aria-label="Movement stick"><span></span></div><button type="button" class="bc-jump" aria-label="Jump">▲</button></div>
  <div class="bc-overlay"><p class="bc-eyebrow">BLOCKCRAFT</p><h2 class="bc-heading">Build anything</h2><p class="bc-copy"></p><button class="game-button bc-start" type="button">Play</button><p class="bc-loading" role="status"></p></div>`;
  container.append(root);
  const $=<T extends HTMLElement>(s:string)=>root.querySelector<T>(s)!;
  const canvas=$<HTMLCanvasElement>('canvas'),overlay=$('.bc-overlay'),heading=$('.bc-heading'),copy=$('.bc-copy'),start=$<HTMLButtonElement>('.bc-start'),loading=$('.bc-loading');
  const hotbar=$('.bc-hotbar'),debug=$('.bc-debug'),viewButton=$<HTMLButtonElement>('.bc-view'),touchUI=$('.bc-touch'),stick=$('.bc-stick'),stickKnob=stick.querySelector<HTMLElement>('span')!,jumpButton=$<HTMLButtonElement>('.bc-jump');
  const abort=new AbortController(),signal=abort.signal;
  const coarse=matchMedia('(pointer: coarse)').matches;
  const desktopCopy='Click to look around with the mouse.<br>W A S D move · Space jump · Shift sprint<br>Left click mine · Right click place · 1–9 or wheel pick a block';
  const touchCopy='Drag to look · left stick to move · ▲ jump<br>Tap to mine · long-press to place<br>Tap the bar below to pick a block';

  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,stencil:false,powerPreference:'high-performance'});}
  catch{
    root.innerHTML='<div class="bc-fallback" role="status"><h2>3D graphics unavailable</h2><p>Blockcraft needs WebGL 2. Enable browser hardware acceleration or try a recent browser.</p><a class="game-button" href="#/">Choose another game</a></div>';
    context.setStatus('This browser could not create a WebGL 2 renderer.');
    return{pause(){},resume(){},restart(){},serialize:()=>null,restore(){},dispose(){root.remove();}};
  }

  // ---- State ------------------------------------------------------------------------------
  let seed=0x51ab1e,generator=new TerrainGenerator(seed),world=new VoxelWorld();
  let player:PlayerState=createPlayer(.5,CH,.5),slot=0,mined=0,placed=0,view=DEFAULT_VIEW;
  let playing=false,paused=false,disposed=false,contextLost=false,locked=false,spawnPending=true;
  let frame=0,last=0,accumulator=0,needsRender=true,target:RayHit|null=null;
  const keys=new Set<string>();let touchMove={x:0,y:0},touchJump=false,jumpQueued=false,jumpTime=0;

  // ---- Renderer, scene and shared GPU resources ------------------------------------------
  let maxScale=Math.min(window.devicePixelRatio||1,1.5),scale=maxScale;
  renderer.setPixelRatio(scale);renderer.setClearColor(SKY);
  const scene=new THREE.Scene();scene.background=new THREE.Color(SKY);
  const fog=new THREE.Fog(SKY,1,2);scene.fog=fog;
  const camera=new THREE.PerspectiveCamera(72,1,.08,200);camera.rotation.order='YXZ';
  const atlasPixels=paintAtlas(),flipped=new Uint8Array(atlasPixels.length),rowBytes=ATLAS_WIDTH*4;
  // DataTexture rows start at the bottom; the atlas is painted top-down.
  for(let y=0;y<ATLAS_HEIGHT;y++)flipped.set(atlasPixels.subarray(y*rowBytes,(y+1)*rowBytes),(ATLAS_HEIGHT-1-y)*rowBytes);
  const atlas=new THREE.DataTexture(flipped,ATLAS_WIDTH,ATLAS_HEIGHT,THREE.RGBAFormat);
  atlas.magFilter=THREE.NearestFilter;atlas.minFilter=THREE.NearestFilter;atlas.generateMipmaps=false;atlas.colorSpace=THREE.SRGBColorSpace;atlas.needsUpdate=true;
  // Unlit materials: lighting and ambient occlusion are baked into each vertex.
  const solidMaterial=voxelMaterial(atlas,1),waterMaterial=voxelMaterial(atlas,.72);
  const sharedIndex=new THREE.BufferAttribute(quadIndices(MAX_QUADS),1);
  const renders=new Map<number,ChunkRender>();
  const chunkGroup=new THREE.Group();chunkGroup.matrixAutoUpdate=false;scene.add(chunkGroup);
  const outlineGeometry=new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004,1.004,1.004));
  const outlineMaterial=new THREE.LineBasicMaterial({color:0x111111,transparent:true,opacity:.6});
  const outline=new THREE.LineSegments(outlineGeometry,outlineMaterial);outline.visible=false;scene.add(outline);
  // Clouds are real geometry only where clouds exist, so clear sky costs no fragments.
  const cloudGeometry=cloudLayer(),cloudMaterial=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.82,depthWrite:false,side:THREE.DoubleSide});
  const clouds=new THREE.Mesh(cloudGeometry,cloudMaterial);clouds.position.y=CH+16;clouds.renderOrder=2;scene.add(clouds);

  function geometryFor(part:MeshPart,minY:number,maxY:number){
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(part.position,3));
    g.setAttribute('info',new THREE.BufferAttribute(part.info,4));
    g.setIndex(sharedIndex);g.setDrawRange(0,part.quads*6);
    // Known extents: no per-vertex bounding pass.
    g.boundingSphere=new THREE.Sphere(new THREE.Vector3(CS/2,(minY+maxY)/2,CS/2),Math.hypot(CS/2,(maxY-minY)/2,CS/2));
    return g;
  }
  function releaseMesh(mesh?:THREE.Mesh){
    if(!mesh)return;chunkGroup.remove(mesh);
    // Detach the shared index so disposing one chunk never frees it for the others.
    mesh.geometry.setIndex(null);mesh.geometry.dispose();
  }
  function placeMesh(mesh:THREE.Mesh,cx:number,cz:number){mesh.matrixAutoUpdate=false;mesh.position.set(cx*CS,0,cz*CS);mesh.updateMatrix();mesh.updateMatrixWorld(true);chunkGroup.add(mesh);}
  const neighbourScratch:(Uint8Array|null)[]=new Array(9).fill(null);
  function hasNeighbours(cx:number,cz:number){
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)if(!world.chunks.has(chunkKey(cx+dx,cz+dz)))return false;
    return true;
  }
  function buildMesh(cx:number,cz:number){
    for(let dz=-1,i=0;dz<=1;dz++)for(let dx=-1;dx<=1;dx++,i++)neighbourScratch[i]=world.chunk(cx+dx,cz+dz)?.data??null;
    const result=meshChunk(neighbourScratch),key=chunkKey(cx,cz),old=renders.get(key),render:ChunkRender={};
    releaseMesh(old?.solid);releaseMesh(old?.water);
    if(result.solid.quads){render.solid=new THREE.Mesh(geometryFor(result.solid,result.minY,result.maxY),solidMaterial);placeMesh(render.solid,cx,cz);}
    if(result.water.quads){render.water=new THREE.Mesh(geometryFor(result.water,result.minY,result.maxY),waterMaterial);render.water.renderOrder=1;placeMesh(render.water,cx,cz);}
    renders.set(key,render);dirty.delete(key);needsRender=true;
  }

  // ---- Chunk streaming: generation in workers, meshing on a frame budget -----------------
  const pending=new Set<number>(),dirty=new Set<number>();
  /** True while chunks are being generated or meshed: the loop keeps running. */
  let streamBusy=true;
  const workers:{worker:Worker;jobs:Set<number>}[]=[];
  try{
    const count=Math.max(1,Math.min(3,(navigator.hardwareConcurrency||2)-1));
    for(let i=0;i<count;i++){
      const worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'}),entry={worker,jobs:new Set<number>()};
      worker.onmessage=(event:MessageEvent<{seed:number;cx:number;cz:number;data:Uint8Array}>)=>{entry.jobs.delete(chunkKey(event.data.cx,event.data.cz));receive(event.data);};
      // A worker that fails (for example a blocked script) hands its jobs back;
      // with none left, generation continues on the main thread.
      worker.onerror=()=>{
        worker.terminate();for(const key of entry.jobs)pending.delete(key);
        workers.splice(workers.indexOf(entry),1);root.dataset.workers=String(workers.length);schedule();
      };
      workers.push(entry);
    }
  }catch{for(const w of workers)w.worker.terminate();workers.length=0;}
  root.dataset.workers=String(workers.length);
  function inRange(cx:number,cz:number,extra:number){
    const pcx=Math.floor(player.x/CS),pcz=Math.floor(player.z/CS),r=VIEW_DISTANCES[view]+extra;
    return (cx-pcx)**2+(cz-pcz)**2<=r*r;
  }
  function receive({seed:s,cx,cz,data}:{seed:number;cx:number;cz:number;data:Uint8Array}){
    const key=chunkKey(cx,cz);pending.delete(key);
    if(disposed||s!==seed||world.chunks.has(key)||!inRange(cx,cz,1.5))return;
    world.insert(cx,cz,data);
  }
  function stream(){
    const pcx=Math.floor(player.x/CS),pcz=Math.floor(player.z/CS),r=VIEW_DISTANCES[view],rGen=(r+1.5)**2,rMesh=r*r,rDrop=(r+2.5)**2;
    // Generation reaches r+1.5 so every meshed chunk (≤ r) has all eight neighbours.
    for(const [key,chunk] of world.chunks)if((chunk.cx-pcx)**2+(chunk.cz-pcz)**2>rDrop){
      const render=renders.get(key);releaseMesh(render?.solid);releaseMesh(render?.water);renders.delete(key);world.remove(key);dirty.delete(key);needsRender=true;
    }
    const begin=performance.now();let meshed=0;streamBusy=pending.size>0;
    for(const [dx,dz,d] of OFFSETS){
      if(d>rGen)break;
      const cx=pcx+dx,cz=pcz+dz,key=chunkKey(cx,cz);
      if(!world.chunks.has(key)){
        if(pending.has(key))continue;
        if(workers.length){
          let best=workers[0];for(const w of workers)if(w.jobs.size<best.jobs.size)best=w;
          if(best.jobs.size<2){best.jobs.add(key);pending.add(key);best.worker.postMessage({seed,cx,cz,job:key});}
        }else if(performance.now()-begin<GENERATE_BUDGET_MS)world.insert(cx,cz,generator.generate(cx,cz));
        // Without workers, generation itself is work that keeps the loop running.
        streamBusy=true;continue;
      }
      if(d>rMesh||(renders.has(key)&&!dirty.has(key))||!hasNeighbours(cx,cz))continue;
      streamBusy=true;
      if(meshed&&performance.now()-begin>MESH_BUDGET_MS)continue;
      buildMesh(cx,cz);meshed++;
    }
    return meshed;
  }

  // ---- World editing ----------------------------------------------------------------------
  function touchEdit(wx:number,wy:number,wz:number){
    // Rebuild the edited chunk now; neighbours that share the border (and AO) are queued.
    const cx=Math.floor(wx/CS),cz=Math.floor(wz/CS),lx=wx-cx*CS,lz=wz-cz*CS;
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      if((dx===-1&&lx!==0)||(dx===1&&lx!==CS-1)||(dz===-1&&lz!==0)||(dz===1&&lz!==CS-1))continue;
      const key=chunkKey(cx+dx,cz+dz);if(renders.has(key))dirty.add(key);
    }
    if(hasNeighbours(cx,cz))buildMesh(cx,cz);
    for(const key of [...dirty]){const c=world.chunks.get(key);if(c&&hasNeighbours(c.cx,c.cz))buildMesh(c.cx,c.cz);}
    editsCache=null;
  }
  function mine(){
    if(!target||!BREAKABLE(target.id))return;
    const {x,y,z,id}=target;
    if(!world.set(x,y,z,AIR)){limit();return;}
    mined++;context.setScore(mined);context.sound('tap');touchEdit(x,y,z);updateTarget();
    context.setStatus(`Mined ${BLOCK_NAMES[id].toLowerCase()}. ${mined} blocks mined.`);report();
  }
  function place(){
    if(!target)return;
    const x=target.x+target.nx,y=target.y+target.ny,z=target.z+target.nz,existing=world.get(x,y,z);
    if(y<0||y>=CH||(existing!==AIR&&existing!==WATER))return;
    const id=HOTBAR[slot];
    // Never place a block inside the player.
    if(x+1>player.x-.3&&x<player.x+.3&&z+1>player.z-.3&&z<player.z+.3&&y+1>player.y&&y<player.y+1.8)return;
    if(!world.set(x,y,z,id)){limit();return;}
    placed++;context.sound('tap');touchEdit(x,y,z);updateTarget();report();
  }
  function pick(){if(!target)return;const index=HOTBAR.indexOf(target.id);if(index>=0)select(index);}
  function limit(){if(world.editCount>=MAX_EDITS)context.setStatus(`This world has reached its ${MAX_EDITS} edit limit. Restart for a fresh world.`);}
  let editsCache:number[]|null=null;

  // ---- HUD ---------------------------------------------------------------------------------
  function icon(id:number){
    const c=document.createElement('canvas');c.width=TILE;c.height=TILE;
    const tile=FACE_TILES[id][4],ox=(tile%ATLAS_COLUMNS)*TILE,oy=Math.floor(tile/ATLAS_COLUMNS)*TILE,image=new ImageData(TILE,TILE);
    for(let y=0;y<TILE;y++)image.data.set(atlasPixels.subarray(((oy+y)*ATLAS_WIDTH+ox)*4,((oy+y)*ATLAS_WIDTH+ox+TILE)*4),y*TILE*4);
    c.getContext('2d')?.putImageData(image,0,0);return c.toDataURL();
  }
  hotbar.innerHTML=HOTBAR.map((id,i)=>`<button type="button" class="bc-slot" data-slot="${i}" aria-label="${BLOCK_NAMES[id]}, slot ${i+1}" aria-pressed="false"><img alt="" src="${icon(id)}" draggable="false"><small>${i+1}</small></button>`).join('');
  const slots=[...hotbar.querySelectorAll<HTMLButtonElement>('.bc-slot')];
  function select(index:number){
    slot=((index%HOTBAR.length)+HOTBAR.length)%HOTBAR.length;
    slots.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===slot)));
    root.dataset.slot=String(slot);context.announce(`${BLOCK_NAMES[HOTBAR[slot]]} selected`);
  }
  hotbar.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest<HTMLButtonElement>('.bc-slot');if(b){select(Number(b.dataset.slot));if(playing&&!coarse&&!locked)lock();}},{signal});
  hotbar.addEventListener('pointerdown',e=>e.stopPropagation(),{signal});
  function setView(index:number){
    view=index;const r=VIEW_DISTANCES[view]*CS;
    fog.near=r*.55;fog.far=r*.95;camera.far=r+CS;camera.updateProjectionMatrix();
    viewButton.textContent=`View ${VIEW_DISTANCES[view]}`;root.dataset.view=String(VIEW_DISTANCES[view]);needsRender=true;
  }
  viewButton.addEventListener('click',()=>{setView((view+1)%VIEW_DISTANCES.length);context.announce(`View distance ${VIEW_DISTANCES[view]} chunks`);if(playing&&!coarse&&!locked)lock();},{signal});
  function report(){
    root.dataset.mined=String(mined);root.dataset.placed=String(placed);
    context.setLevel(`${Math.floor(player.x)}, ${Math.floor(player.y)}, ${Math.floor(player.z)}`);
  }
  function showOverlay(kind:'start'|'resume'){
    playing=false;clearInput();overlay.hidden=false;root.dataset.phase='ready';
    heading.textContent=kind==='start'?'Build anything':'Paused';
    copy.innerHTML=coarse?touchCopy:desktopCopy;start.textContent=kind==='start'?'Play':'Resume';
    touchUI.hidden=true;needsRender=true;schedule();
  }

  // ---- Input ------------------------------------------------------------------------------
  function clearInput(){keys.clear();touchMove={x:0,y:0};touchJump=false;jumpQueued=false;stickKnob.style.transform='';stopRepeat();}
  function lock(){
    if(coarse||locked)return;
    try{const result=canvas.requestPointerLock() as unknown;if(result instanceof Promise)result.catch(()=>{});}catch{/* drag-to-look remains */}
  }
  function begin(){
    if(paused||disposed||contextLost)return;
    playing=true;overlay.hidden=true;root.dataset.phase='playing';touchUI.hidden=!coarse;
    context.setStatus(coarse?'Drag to look. Tap to mine, long-press to place.':'Mouse looks once captured; drag to look otherwise. Click mines, right-click places.');
    canvas.focus({preventScroll:true});lock();schedule();
  }
  start.addEventListener('click',begin,{signal});
  document.addEventListener('pointerlockchange',()=>{
    const now=document.pointerLockElement===canvas;
    if(locked&&!now&&playing&&!disposed)showOverlay('resume');
    // The click that captured the mouse should not also mine.
    if(now&&drag)drag.moved=true;
    locked=now;root.dataset.locked=String(locked);
  },{signal});
  const typing=(e:Event)=>e.target instanceof HTMLElement&&e.target.matches('input,textarea,select,[contenteditable=true]');
  window.addEventListener('keydown',e=>{
    if(!playing||paused||typing(e)||document.querySelector('dialog[open]')||e.ctrlKey||e.metaKey||e.altKey)return;
    if(/^Digit[1-9]$/.test(e.code)){select(Number(e.code.slice(5))-1);e.preventDefault();return;}
    if(e.code==='F3'){debug.hidden=!debug.hidden;e.preventDefault();return;}
    if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight'].includes(e.code)){keys.add(e.code);if(e.code==='Space'){jumpQueued=true;jumpTime=performance.now();}e.preventDefault();}
  },{signal});
  // Releases always clear, even after focus or dialog changes.
  window.addEventListener('keyup',e=>keys.delete(e.code),{signal});
  window.addEventListener('blur',clearInput,{signal});
  document.addEventListener('mousemove',e=>{
    if(!locked||!playing||paused)return;
    look(e.movementX,e.movementY,.0022);
  },{signal});
  function look(dx:number,dy:number,k:number){
    player.yaw-=dx*k;player.pitch=Math.max(-1.55,Math.min(1.55,player.pitch-dy*k));
  }
  let repeat=0,repeatAction:(()=>void)|null=null;
  function startRepeat(action:()=>void){stopRepeat();action();repeatAction=action;repeat=window.setInterval(()=>{if(playing&&!paused)repeatAction?.();},REPEAT_MS);}
  function stopRepeat(){clearInterval(repeat);repeat=0;repeatAction=null;}
  canvas.addEventListener('contextmenu',e=>e.preventDefault(),{signal});
  // Pointer lock: buttons act at the crosshair. Without lock: drag looks, a short click acts.
  let drag:{id:number;x:number;y:number;startX:number;startY:number;time:number;button:number;moved:boolean;hold:number}|null=null;
  canvas.addEventListener('pointerdown',e=>{
    if(!playing||paused)return;
    e.preventDefault();canvas.focus({preventScroll:true});
    if(locked){updateTarget();if(e.button===0)startRepeat(mine);else if(e.button===2)startRepeat(place);else if(e.button===1)pick();return;}
    if(drag)return;
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,time:performance.now(),button:e.button,moved:false,hold:0};
    canvas.setPointerCapture(e.pointerId);
    if(e.pointerType!=='mouse'){const d=drag;d.hold=window.setTimeout(()=>{if(drag===d&&!d.moved){d.moved=true;updateTarget();startRepeat(place);}},380);}
    if(e.pointerType==='mouse'&&!coarse)lock();
  },{signal});
  canvas.addEventListener('pointermove',e=>{
    if(!drag||drag.id!==e.pointerId||paused)return;
    const k=e.pointerType==='mouse'?.005:.006;look(e.clientX-drag.x,e.clientY-drag.y,k);drag.x=e.clientX;drag.y=e.clientY;
    if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>8&&!drag.moved){drag.moved=true;clearTimeout(drag.hold);}
  },{signal});
  function endDrag(e:PointerEvent,cancelled:boolean){
    if(!drag||drag.id!==e.pointerId)return;
    const d=drag;drag=null;clearTimeout(d.hold);
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    if(repeatAction)stopRepeat();
    else if(!cancelled&&!d.moved&&performance.now()-d.time<380&&playing&&!paused){updateTarget();if(d.button===2)place();else if(d.button===0)mine();}
  }
  canvas.addEventListener('pointerup',e=>endDrag(e,false),{signal});
  canvas.addEventListener('pointercancel',e=>endDrag(e,true),{signal});
  document.addEventListener('mouseup',()=>{if(locked)stopRepeat();},{signal});
  canvas.addEventListener('wheel',e=>{if(!playing||paused)return;e.preventDefault();select(slot+(e.deltaY>0?1:-1));},{signal,passive:false});
  // Touch stick.
  let stickId:number|null=null;
  stick.addEventListener('pointerdown',e=>{if(!playing||paused||stickId!==null)return;e.preventDefault();stickId=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e);},{signal});
  stick.addEventListener('pointermove',e=>{if(e.pointerId===stickId)moveStick(e);},{signal});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(type,e=>{if((e as PointerEvent).pointerId!==stickId)return;stickId=null;touchMove={x:0,y:0};stickKnob.style.transform='';},{signal});
  function moveStick(e:PointerEvent){
    const box=stick.getBoundingClientRect(),r=box.width/2;
    let dx=(e.clientX-box.left-r)/r,dy=(e.clientY-box.top-r)/r;const len=Math.hypot(dx,dy);if(len>1){dx/=len;dy/=len;}
    touchMove={x:dx,y:-dy};stickKnob.style.transform=`translate(${dx*r*.5}px,${dy*r*.5}px)`;
  }
  jumpButton.addEventListener('pointerdown',e=>{e.preventDefault();touchJump=true;jumpQueued=true;jumpTime=performance.now();},{signal});
  for(const type of ['pointerup','pointercancel','pointerleave'])jumpButton.addEventListener(type,()=>{touchJump=false;},{signal});

  // ---- Simulation and rendering -----------------------------------------------------------
  function updateTarget(){
    // From the current look angles, not last frame's camera, so a click acts where the crosshair is now.
    const c=Math.cos(player.pitch);
    target=raycast(world,player.x,player.y+EYE,player.z,-Math.sin(player.yaw)*c,Math.sin(player.pitch),-Math.cos(player.yaw)*c,REACH);
    outline.visible=!!target;if(target)outline.position.set(target.x+.5,target.y+.5,target.z+.5);
    root.dataset.target=target?`${target.x},${target.y},${target.z}`:'';
  }
  function trySpawn(){
    const cx=Math.floor(player.x/CS),cz=Math.floor(player.z/CS);
    if(!world.chunks.has(chunkKey(cx,cz)))return;
    spawnPending=false;
    for(let i=0;i<CH&&playerCollides(world,player);i++)player.y+=1;
    loading.textContent='';start.disabled=false;
  }
  function syncCamera(){
    camera.position.set(player.x,player.y+EYE,player.z);camera.rotation.set(player.pitch,player.yaw,0);
    const under=world.get(Math.floor(player.x),Math.floor(player.y+EYE),Math.floor(player.z))===WATER;
    const color=under?UNDERWATER:SKY;
    if((scene.background as THREE.Color).getHex()!==color){(scene.background as THREE.Color).setHex(color);fog.color.setHex(color);}
    const r=VIEW_DISTANCES[view]*CS;fog.near=under?2:r*.55;fog.far=under?24:r*.95;
    // The cloud layer tiles every CLOUD_SPAN blocks, so snapping it around the player is seamless.
    const drift=(performance.now()/1000*1.2)%CLOUD_SPAN;
    clouds.position.x=Math.round((player.x-drift)/CLOUD_SPAN)*CLOUD_SPAN+drift;clouds.position.z=Math.round(player.z/CLOUD_SPAN)*CLOUD_SPAN;
  }
  // Adaptive resolution: keeps frame time near the display's budget on slow GPUs.
  let windowStart=0,windowFrames=0,windowTime=0,windowMeshed=0,goodWindows=0,fps=0;
  function govern(dt:number,meshed:number){
    windowFrames++;windowTime+=dt;windowMeshed+=meshed;
    const now=performance.now();if(now-windowStart<1000)return;
    const average=windowTime/windowFrames;fps=Math.round(1000/average);
    if(!windowMeshed&&playing){
      if(average>21&&scale>.5){scale=Math.max(.5,scale*.8);applySize();goodWindows=0;}
      else if(average<15&&scale<maxScale){if(++goodWindows>=3){scale=Math.min(maxScale,scale*1.15);applySize();goodWindows=0;}}
      else goodWindows=0;
    }
    windowStart=now;windowFrames=0;windowTime=0;windowMeshed=0;
    root.dataset.fps=String(fps);root.dataset.scale=scale.toFixed(2);
    if(!debug.hidden)debug.textContent=`${fps} fps · ${(scale*100)|0}% res · ${renderer.info.render.calls} draws · ${(renderer.info.render.triangles/1000).toFixed(0)}k tris · ${world.chunks.size} chunks · ${Math.floor(player.x)} ${Math.floor(player.y)} ${Math.floor(player.z)}`;
  }
  function loop(time:number){
    frame=0;if(disposed||contextLost||paused)return;
    const raw=last?time-last:16.7,dt=Math.min(.1,raw/1000);last=time;
    const meshed=stream();
    if(spawnPending)trySpawn();
    if(playing&&!spawnPending){
      accumulator+=dt;if(jumpQueued&&time-jumpTime>200)jumpQueued=false;
      const forward=(+(keys.has('KeyW')||keys.has('ArrowUp'))-+(keys.has('KeyS')||keys.has('ArrowDown')))+touchMove.y;
      const right=(+(keys.has('KeyD')||keys.has('ArrowRight'))-+(keys.has('KeyA')||keys.has('ArrowLeft')))+touchMove.x;
      const input={forward:Math.max(-1,Math.min(1,forward)),right:Math.max(-1,Math.min(1,right)),jump:keys.has('Space')||touchJump||jumpQueued,sprint:keys.has('ShiftLeft')||keys.has('ShiftRight')||Math.hypot(touchMove.x,touchMove.y)>.95};
      // A tap shorter than a frame still jumps: the press is held until a step consumes it.
      while(accumulator>=STEP){stepPlayer(player,input,world,STEP);accumulator-=STEP;if(jumpQueued&&(player.vy>0||player.inWater)){jumpQueued=false;input.jump=keys.has('Space')||touchJump;}}
      if(player.y<-16){const s=generator.spawnPoint();Object.assign(player,{x:s.x,y:s.y+1,z:s.z,vx:0,vy:0,vz:0});}
      needsRender=true;
    }else accumulator=0;
    if(needsRender){
      syncCamera();updateTarget();renderer.render(scene,camera);needsRender=false;
      root.dataset.x=player.x.toFixed(2);root.dataset.y=player.y.toFixed(2);root.dataset.z=player.z.toFixed(2);root.dataset.yaw=player.yaw.toFixed(3);root.dataset.grounded=String(player.onGround);
      root.dataset.drawCalls=String(renderer.info.render.calls);root.dataset.triangles=String(renderer.info.render.triangles);
    }
    root.dataset.chunks=String(world.chunks.size);root.dataset.meshes=String(renders.size);root.dataset.ready=String(!spawnPending);
    govern(raw,meshed);
    // Idle on the overlay once the visible world has finished streaming.
    if(playing||streamBusy||spawnPending||needsRender)frame=requestAnimationFrame(loop);
  }
  function schedule(){if(!frame&&!paused&&!disposed&&!contextLost){last=0;frame=requestAnimationFrame(loop);}}
  function applySize(){
    const w=canvas.clientWidth,h=canvas.clientHeight;if(w<1||h<1)return;
    renderer.setPixelRatio(scale);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();needsRender=true;schedule();
  }
  const resize=new ResizeObserver(()=>{if(!disposed&&!contextLost)applySize();});resize.observe(canvas);
  canvas.addEventListener('webglcontextlost',e=>{
    if(disposed)return;e.preventDefault();contextLost=true;cancelAnimationFrame(frame);frame=0;clearInput();
    if(locked)document.exitPointerLock();overlay.hidden=false;heading.textContent='Graphics interrupted';copy.textContent='Your world is saved. Leave and reopen Blockcraft to restore the graphics.';start.hidden=true;
    context.save(serialize());context.setStatus('Graphics context lost. Leave and reopen the game.');
  },{signal});

  // ---- Lifecycle --------------------------------------------------------------------------
  function clearChunks(){
    for(const render of renders.values()){releaseMesh(render.solid);releaseMesh(render.water);}
    renders.clear();pending.clear();dirty.clear();world.clear();editsCache=null;
    // Results still in flight are discarded on arrival (seed or range check).
    for(const w of workers)w.jobs.clear();
  }
  function reset(newSeed:number,spawn?:{x:number;y:number;z:number}){
    clearChunks();seed=newSeed>>>0;generator=new TerrainGenerator(seed);
    const s=spawn??generator.spawnPoint();player=createPlayer(s.x,s.y,s.z);
    spawnPending=true;start.disabled=true;loading.textContent='Generating terrain…';needsRender=true;
  }
  function serialize():Snapshot{
    editsCache??=world.serializeEdits();
    return{version:1,seed,x:player.x,y:player.y,z:player.z,yaw:player.yaw,pitch:player.pitch,slot,mined,placed,view,edits:editsCache};
  }
  function restore(value:unknown){
    if(!value||typeof value!=='object')return;
    const v=value as Partial<Snapshot>;
    if(v.version!==1||!finite(v.seed)||!Number.isInteger(v.seed)||v.seed<0||v.seed>0xffffffff)return;
    if(![v.x,v.y,v.z,v.yaw,v.pitch].every(finite)||Math.abs(v.x!)>1e6||Math.abs(v.z!)>1e6||v.y!<-16||v.y!>CH+64)return;
    if(![v.slot,v.mined,v.placed,v.view].every(n=>Number.isInteger(n)&&(n as number)>=0)||v.slot!>=HOTBAR.length||v.view!>=VIEW_DISTANCES.length)return;
    const probe=new VoxelWorld();if(!probe.restoreEdits(v.edits))return;
    reset(v.seed,{x:v.x!,y:v.y!,z:v.z!});world.restoreEdits(v.edits);
    player.yaw=v.yaw!;player.pitch=Math.max(-1.55,Math.min(1.55,v.pitch!));mined=v.mined!;placed=v.placed!;
    select(v.slot!);setView(v.view!);context.setScore(mined);report();
    showOverlay('resume');heading.textContent='Welcome back';start.textContent='Continue';
    context.setStatus(`Saved world ready: ${mined} mined, ${placed} placed.`);
  }
  for(const id of HOTBAR)if(id<=0||id>=BLOCK_COUNT)throw new Error('Invalid hotbar');
  reset(seed);select(0);setView(DEFAULT_VIEW);report();showOverlay('start');context.setScore(0);
  context.setStatus(coarse?'Tap Play to explore.':'Press Play, then use the mouse to look around.');

  return{
    pause(){paused=true;clearInput();if(drag){clearTimeout(drag.hold);drag=null;}cancelAnimationFrame(frame);frame=0;if(locked)document.exitPointerLock();if(playing)showOverlay('resume');},
    resume(){if(disposed||contextLost)return;paused=false;needsRender=true;schedule();},
    restart(){if(contextLost)return;reset(nextSeed(seed));mined=0;placed=0;context.setScore(0);report();showOverlay('start');context.setStatus('A fresh world. Press Play when it is ready.');context.save(serialize());},
    serialize,
    restore,
    dispose(){
      if(disposed)return;disposed=true;cancelAnimationFrame(frame);frame=0;clearInput();abort.abort();resize.disconnect();
      if(document.pointerLockElement===canvas)document.exitPointerLock();
      for(const w of workers)w.worker.terminate();
      clearChunks();
      for(const disposable of [outlineGeometry,outlineMaterial,cloudGeometry,cloudMaterial,solidMaterial,waterMaterial,atlas])disposable.dispose();
      renderer.dispose();renderer.forceContextLoss();scene.clear();root.remove();
    }
  };
}

const game:GameModule=Object.freeze({
  id:'blockcraft',title:'Blockcraft',cover:'game-art/blockcraft/cover.svg',
  rules:'Explore an endless block world and build whatever you like. Press Play, then move with W A S D or the arrow keys, jump with Space and sprint with Shift. On a computer the mouse looks around once captured (or drag to look); left click mines the outlined block and right click places the selected block against it. Hold a button to keep mining or placing. Choose a block with 1 to 9, the mouse wheel, or the bar at the bottom; middle click copies the block you are looking at. On a touch screen, drag to look, use the left stick to move and ▲ to jump, tap to mine and long-press to place. Water slows you down and lets you swim upwards with jump. Bedrock and water cannot be mined. View changes how far you can see; F3 shows performance details. Your score is the number of blocks mined in this world. Your world, position and edits are saved on this device. Restart creates a new world.',
  mount
});
export default game;
