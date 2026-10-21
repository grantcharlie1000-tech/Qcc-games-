// Entity rendering: every entity in two dynamic meshes (≤ 2 draw calls, none when nothing is visible).
//  1. Entity atlas layer: box models of every kind (CPU-posed boxes, entity/model.ts), dropped and thrown item sprites,
//     experience orbs. The atlas holds each kind's model.paint texture, every item sprite (art/items spritePixels) and
//     the orb icons; it is rebuilt when kinds are registered.
//  2. Block atlas layer (game.render.atlas): block-rendered entities (falling blocks, primed TNT with its white flash and
//     swell) via game.mesher.meshBlock, dropped block items as small spinning cubes, flat block-tile items, and the
//     flames drawn over burning entities.
// Both share one shader: lit like chunks (sky light × the shared daylight uniform, block light, warm torchlight) from the
// entity's eye cell, vanilla diffuse face shading, 30% red hurt overlay (also while dying), white flash (× 0.75 like the
// vanilla overlay), tinted and emissive parts, fog. Positions are interpolated between ticks; items bob and spin unless
// reduced motion is preferred. Vertices are written relative to a floating origin near the camera.
import * as THREE from 'three';
import {ATLAS_COLUMNS,ATLAS_ROWS,BLOCK_COUNT,FACE_TILE,TILE_INDEX,TINTED_TILES,blockDef,BLOCK_BY_NAME} from '../data/blocks';
import {ITEM_SPRITES,itemDef} from '../data/items';
import {CH,quadIndices} from '../engine/constants';
import {spritePixels} from '../art/items';
import type {AnimationState,ChunkMesh,Entity,EntityKind,Game,PartPose} from '../engine/contracts';
import {FLAG_EMISSIVE,QuadWriter,compileModel,diffuse,entityMatrix,mat,packAtlas,paintOrb,writeModel,type AtlasLayout,type CompiledModel} from './model';
import {xpIcon} from './items';
import {wrapAngle} from './ai';

/** What the renderer needs from the entity service per entity (positions of the previous tick for interpolation). */
export interface RenderRec{
  e:Entity;kind:EntityKind;
  px:number;py:number;pz:number;pyaw:number;phead:number;ppitch:number;
  /** Walk animation (vanilla WalkAnimationState): position and speed now and one tick ago. */
  walkPos:number;walkSpeed:number;walkSpeedOld:number;
  /** Random phase for item bobbing and spin. */
  bob:number;
  frozen:boolean;
}
export interface RenderStats{entities:number;quads:number;blockQuads:number;drawCalls:number;cpuMs:number}
export interface EntityRenderer{
  frame(dt:number,partial:number,recs:readonly RenderRec[]):void;
  /** Kinds changed: rebuild the atlas before the next frame. */
  invalidate():void;
  readonly stats:RenderStats;
  readonly atlas:AtlasLayout|null;
  dispose():void;
}

const VERTEX=`precision highp float;
uniform mat4 modelViewMatrix;uniform mat4 projectionMatrix;uniform float daylight;
in vec3 position;in vec2 uv;in vec4 color;in vec4 extra;
out vec2 vUv;out vec3 vColor;out vec3 vLight;out float vHurt;out float vFlash;out float vDepth;
void main(){
  float sky=floor(extra.x/16.),block=mod(extra.x,16.);
  float skyLevel=sky*daylight,level=max(skyLevel,block);
  float bright=max(pow(.8,15.-level),.04);
  vec3 warm=mix(vec3(1.),vec3(1.,.86,.66),clamp((block-skyLevel)/8.,0.,1.));
  vLight=mod(extra.w,2.)>=1.?vec3(1.):bright*warm;
  vColor=color.rgb;vHurt=extra.y/255.;vFlash=extra.z/255.;vUv=uv;
  vec4 mv=modelViewMatrix*vec4(position,1.);vDepth=-mv.z;gl_Position=projectionMatrix*mv;
}`;
const FRAGMENT=`precision highp float;
uniform sampler2D map;uniform float alphaTest;uniform vec3 fogColor;uniform float fogNear;uniform float fogFar;
in vec2 vUv;in vec3 vColor;in vec3 vLight;in float vHurt;in float vFlash;in float vDepth;
out vec4 colour;
void main(){
  vec4 t=texture(map,vUv);
  if(t.a<alphaTest)discard;
  vec3 c=t.rgb*vColor;
  c=mix(c,vec3(1.,0.,0.),vHurt*.3);
  c=mix(c,vec3(1.),vFlash);
  c*=vLight;
  colour=vec4(mix(c,fogColor,smoothstep(fogNear,fogFar,vDepth)),t.a);
}`;

interface Layer{writer:QuadWriter;geometry:THREE.BufferGeometry;mesh:THREE.Mesh;material:THREE.RawShaderMaterial;version:number;
  attrs:THREE.BufferAttribute[]}
/** One block mesh converted for the block layer: per quad 4 corners (block units, 0..1), uvs, shade and tint. */
interface BlockQuads{count:number;pos:Float32Array;uv:Float32Array;shade:Float32Array;tint:Uint8Array}

const DEFAULT_TINT={grass:0x91bd59,foliage:0x77ab2f,water:0x3f76e4,none:0xffffff} as const;
const ANIM:AnimationState={time:0,partial:0,limbSwing:0,limbAmount:0,headYaw:0,headPitch:0,attack:0,reducedMotion:false};
const BASE=mat(),PAINT={tint:-1};
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const lerpAngle=(a:number,b:number,t:number)=>a+wrapAngle(b-a)*t;
/** Deterministic small offsets for stacked item copies. */
const jitter=(id:number,i:number,k:number)=>{let h=Math.imul(id*31+i*7+k,0x9e3779b1)>>>0;h=Math.imul(h^h>>>15,0x85ebca6b)>>>0;return((h>>>8)/16777216-.5);};

export function createEntityRenderer(game:Game):EntityRenderer{
  const scene=game.render.scene,camera=game.render.camera,shared=game.render.uniforms;
  const frustum=new THREE.Frustum(),projScreen=new THREE.Matrix4(),sphere=new THREE.Sphere();
  let atlasTexture:THREE.DataTexture|null=null,layout:AtlasLayout|null=null,dirty=true,animTime=0;
  const models=new Map<string,CompiledModel>(),poses=new Map<string,Record<string,PartPose>>();
  const blockMeshes=new Map<number,BlockQuads>();
  const stats:RenderStats={entities:0,quads:0,blockQuads:0,drawCalls:0,cpuMs:0};
  const placeholder=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1,THREE.RGBAFormat);placeholder.needsUpdate=true;

  function makeLayer(texture:THREE.Texture,order:number):Layer{
    const writer=new QuadWriter(512),geometry=new THREE.BufferGeometry();
    const material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:VERTEX,fragmentShader:FRAGMENT,
      uniforms:{map:{value:texture},alphaTest:{value:.1},daylight:shared.daylight,fogColor:shared.fogColor,fogNear:shared.fogNear,fogFar:shared.fogFar},
      side:THREE.DoubleSide,transparent:false,depthWrite:true,blending:THREE.CustomBlending,
      blendSrc:THREE.SrcAlphaFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendSrcAlpha:THREE.OneFactor,blendDstAlpha:THREE.OneMinusSrcAlphaFactor});
    const mesh=new THREE.Mesh(geometry,material);
    mesh.frustumCulled=false;mesh.renderOrder=order;mesh.visible=false;mesh.name='entities';
    scene.add(mesh);
    const layer:Layer={writer,geometry,mesh,material,version:-1,attrs:[]};
    bind(layer);
    return layer;
  }
  function bind(l:Layer){
    const w=l.writer,g=l.geometry;
    const attrs=[new THREE.BufferAttribute(w.position,3),new THREE.BufferAttribute(w.uv,2),new THREE.BufferAttribute(w.color,4,true),new THREE.BufferAttribute(w.extra,4,false)];
    for(const a of attrs)a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position',attrs[0]);g.setAttribute('uv',attrs[1]);g.setAttribute('color',attrs[2]);g.setAttribute('extra',attrs[3]);
    g.setIndex(new THREE.BufferAttribute(quadIndices(w.capacity),1));
    g.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1e6);
    l.attrs=attrs;l.version=w.version;
  }
  function upload(l:Layer){
    const w=l.writer;
    if(w.version!==l.version){
      // Reallocated: replace the GPU buffers.
      l.geometry.dispose();bind(l);
    }
    const sizes=[3,2,4,4];
    l.attrs.forEach((a,i)=>{a.clearUpdateRanges();if(w.quads)a.addUpdateRange(0,w.quads*4*sizes[i]);a.needsUpdate=w.quads>0;});
    l.geometry.setDrawRange(0,w.quads*6);
    l.mesh.position.set(w.ox,w.oy,w.oz);
    l.mesh.visible=w.quads>0;
  }
  const entityLayer=makeLayer(placeholder,1.5),blockLayer=makeLayer(game.render.atlas??placeholder,1.6);

  // ---- Atlas -----------------------------------------------------------------------------------
  function rebuildAtlas(){
    dirty=false;models.clear();poses.clear();
    const kinds=game.entities.kinds().filter(k=>k.model&&Number.isInteger(k.model.textureWidth)&&Number.isInteger(k.model.textureHeight)
      &&k.model.textureWidth>0&&k.model.textureHeight>0&&k.model.textureWidth<=1024&&k.model.textureHeight<=1024);
    const items=[...kinds.map(k=>({key:'kind:'+k.kind,w:k.model!.textureWidth,h:k.model!.textureHeight})),
      ...ITEM_SPRITES.map(s=>({key:'sprite:'+s,w:16,h:16})),...Array.from({length:11},(_,i)=>({key:'orb:'+i,w:16,h:16}))];
    const l=packAtlas(items,512),pixels=new Uint8ClampedArray(l.width*l.height*4);
    for(const k of kinds){
      const r=l.regions.get('kind:'+k.kind)!,tw=r.w,th=r.h,tmp=new Uint8ClampedArray(tw*th*4);
      try{k.model!.paint(tmp,tw,th);}catch{/* an unpaintable model shows its blank texture */}
      for(let y=0;y<th;y++)pixels.set(tmp.subarray(y*tw*4,(y+1)*tw*4),((r.y+y)*l.width+r.x)*4);
      models.set(k.kind,compileModel(k.model!,r,l.width,l.height));
      poses.set(k.kind,{});
    }
    for(const s of ITEM_SPRITES){
      const r=l.regions.get('sprite:'+s)!,px=spritePixels(s);
      for(let y=0;y<16;y++)pixels.set(px.subarray(y*64,(y+1)*64),((r.y+y)*l.width+r.x)*4);
    }
    for(let i=0;i<11;i++){const r=l.regions.get('orb:'+i)!;paintOrb(pixels,l.width,r.x,r.y,i);}
    atlasTexture?.dispose();
    atlasTexture=new THREE.DataTexture(new Uint8Array(pixels.buffer),l.width,l.height,THREE.RGBAFormat);
    atlasTexture.magFilter=THREE.NearestFilter;atlasTexture.minFilter=THREE.NearestFilter;atlasTexture.generateMipmaps=false;atlasTexture.needsUpdate=true;
    entityLayer.material.uniforms.map.value=atlasTexture;
    layout=l;
  }

  // ---- Block meshes ------------------------------------------------------------------------------
  function convert(mesh:ChunkMesh):BlockQuads{
    const parts=[mesh.opaque,mesh.cutout,mesh.translucent];let count=0;for(const p of parts)count+=p.quads;
    const out:BlockQuads={count,pos:new Float32Array(count*12),uv:new Float32Array(count*8),shade:new Float32Array(count),tint:new Uint8Array(count*3)};
    let q=0;
    for(const p of parts)for(let i=0;i<p.quads;i++,q++){
      for(let v=0;v<4;v++){
        const s=(i*4+v)*4;
        out.pos[q*12+v*3]=p.position[s]/16;out.pos[q*12+v*3+1]=p.position[s+1]/16;out.pos[q*12+v*3+2]=p.position[s+2]/16;
        const tile=p.uvt[s+2],tx=tile%ATLAS_COLUMNS,ty=Math.floor(tile/ATLAS_COLUMNS);
        const fu=Math.max(.001,Math.min(.999,p.uvt[s]/16)),fv=Math.max(.001,Math.min(.999,p.uvt[s+1]/16));
        out.uv[q*8+v*2]=(tx+fu)/ATLAS_COLUMNS;out.uv[q*8+v*2+1]=1-(ty+1-fv)/ATLAS_ROWS;
      }
      const s=i*16;out.shade[q]=p.uvt[s+3]/255;out.tint[q*3]=p.tint[s];out.tint[q*3+1]=p.tint[s+1];out.tint[q*3+2]=p.tint[s+2];
    }
    return out;
  }
  /** A plain cube from the block's face tiles (when the mesher cannot mesh it). */
  function fallbackCube(id:number):BlockQuads{
    const faces=[[[1,1,1],[1,1,0],[1,0,1],[1,0,0]],[[0,1,0],[0,1,1],[0,0,0],[0,0,1]],[[0,1,0],[1,1,0],[0,1,1],[1,1,1]],[[0,0,1],[1,0,1],[0,0,0],[1,0,0]],
      [[0,1,1],[1,1,1],[0,0,1],[1,0,1]],[[1,1,0],[0,1,0],[1,0,0],[0,0,0]]],shade=[.8,.8,1,.55,.9,.9];
    const out:BlockQuads={count:6,pos:new Float32Array(72),uv:new Float32Array(48),shade:new Float32Array(shade),tint:new Uint8Array(18).fill(255)};
    faces.forEach((f,q)=>{
      const tile=FACE_TILE[id*6+q],tx=tile%ATLAS_COLUMNS,ty=Math.floor(tile/ATLAS_COLUMNS),uv=[[0,1],[1,1],[0,0],[1,0]];
      f.forEach((c,v)=>{out.pos.set(c,q*12+v*3);out.uv[q*8+v*2]=(tx+.001+uv[v][0]*.998)/ATLAS_COLUMNS;out.uv[q*8+v*2+1]=1-(ty+1-(.001+uv[v][1]*.998))/ATLAS_ROWS;});
    });
    return out;
  }
  function blockQuads(id:number):BlockQuads{
    let m=blockMeshes.get(id);if(m)return m;
    const def=blockDef(id),tint=def.tint==='none'?undefined:DEFAULT_TINT[def.tint];
    try{m=convert(game.mesher.meshBlock(id,tint));if(!m.count)m=fallbackCube(id);}catch{m=fallbackCube(id);}
    blockMeshes.set(id,m);return m;
  }
  /** Writes a block mesh: local block coordinates (0..1) mapped by `BASE` after centring (offsets cx, cy, cz). */
  function writeBlock(m:BlockQuads,cx:number,cy:number,cz:number,s:number){
    const w=blockLayer.writer,M=BASE;if(!w.reserve(m.count))return;
    const P=m.pos;
    for(let q=0;q<m.count;q++){
      const o=q*12,c:number[]=TMPC;
      for(let v=0;v<4;v++){
        const x=(P[o+v*3]-cx)*s,y=(P[o+v*3+1]-cy)*s,z=(P[o+v*3+2]-cz)*s;
        c[v*3]=M[0]*x+M[1]*y+M[2]*z+M[3];c[v*3+1]=M[4]*x+M[5]*y+M[6]*z+M[7];c[v*3+2]=M[8]*x+M[9]*y+M[10]*z+M[11];
      }
      w.tintR=m.tint[q*3];w.tintG=m.tint[q*3+1];w.tintB=m.tint[q*3+2];
      const u=m.uv,t=q*8;
      w.quad(c[0],c[1],c[2],c[3],c[4],c[5],c[6],c[7],c[8],c[9],c[10],c[11],u[t],u[t+1],u[t+6],u[t+7],m.shade[q],0);
      // The writer assumes a rectangle; restore this quad's own per-vertex uvs (rotated faces).
      const U=w.uv,k=(w.quads-1)*8;for(let i=0;i<8;i++)U[k+i]=u[t+i];
    }
    w.tintR=w.tintG=w.tintB=255;
  }
  const TMPC:number[]=new Array(12).fill(0);

  // ---- Per-kind drawing --------------------------------------------------------------------------
  let camRX=1,camRY=0,camRZ=0,camUX=0,camUY=1,camUZ=0,camX=0,camZ=0;
  function drawModel(r:RenderRec,x:number,y:number,z:number,partial:number,light:number,hurt:number,reduced:boolean){
    const e=r.e,k=r.kind,m=models.get(k.kind);if(!m)return;
    let app:{tint?:number;flash?:number;scale?:number}|undefined;
    try{app=k.model!.appearance?.(e);}catch{app=undefined;}
    const scale=m.scale*(app&&Number.isFinite(app.scale)&&app.scale!>0?app.scale!:1)*(e.baby?.5:1)/16;
    const yaw=lerpAngle(r.pyaw,e.yaw,partial);
    let roll=0;
    if(e.deathTime>0){const f=Math.sqrt(Math.max(0,(e.deathTime+partial-1)/20*1.6));roll=Math.min(1,f)*Math.PI/2;}
    entityMatrix(BASE,x,y,z,yaw,roll,scale);
    const w=entityLayer.writer;
    w.light=light;w.hurt=hurt;w.flash=app&&Number.isFinite(app.flash)?Math.round(Math.max(0,Math.min(1,app.flash!))*.75*255):0;
    const pose=poses.get(k.kind)!;
    for(const key in pose){const p=pose[key];p.x=p.y=p.z=0;p.px=p.py=p.pz=0;p.visible=true;}
    const swing=r.walkPos-r.walkSpeed*(1-partial);
    ANIM.time=animTime;ANIM.partial=partial;ANIM.reducedMotion=reduced;
    ANIM.limbSwing=e.baby?swing*3:swing;ANIM.limbAmount=e.deathTime>0?0:Math.min(1,lerp(r.walkSpeedOld,r.walkSpeed,partial));
    ANIM.headYaw=wrapAngle(lerpAngle(r.phead,e.headYaw,partial)-yaw);ANIM.headPitch=lerp(r.ppitch,e.pitch,partial);
    const sw=e.data.swing;ANIM.attack=typeof sw==='number'&&sw>0?Math.max(0,Math.min(1,1-sw/10)):0;
    try{k.model!.animate?.(e,pose,ANIM);}catch{/* keep the rest pose */}
    PAINT.tint=app&&Number.isInteger(app.tint)?app.tint!&0xffffff:-1;
    writeModel(w,m,BASE,pose,PAINT);
    w.hurt=0;w.flash=0;
  }
  function drawItem(r:RenderRec,x:number,y:number,z:number,partial:number,light:number,reduced:boolean){
    const e=r.e,k=r.kind;let s;
    try{s=k.item?.(e);}catch{s=null;}
    if(!s)return;
    const def=itemDef(s.id);if(!def)return;
    const thrown=k.category!=='item',copies=thrown?1:s.count>48?5:s.count>32?4:s.count>16?3:s.count>1?2:1;
    const age=e.age+partial,spin=reduced?r.bob:age/20+r.bob,bob=reduced?.1:Math.sin(age/10+r.bob)*.1+.1;
    const icon=def.icon;
    for(let i=0;i<copies;i++){
      const jx=i?jitter(e.id,i,1)*.3:0,jy=i?jitter(e.id,i,2)*.3:0,jz=i?jitter(e.id,i,3)*.3:0;
      if(icon.kind==='block'){
        const b=BLOCK_BY_NAME.get(icon.block);if(!b)return;
        const m=blockQuads(b.id);
        entityMatrix(BASE,x+jx*.5,y+bob+jy*.25,z+jz*.5,thrown?0:spin,0,1);
        blockLayer.writer.light=light;writeBlock(m,.5,0,.5,.25);
        continue;
      }
      let ux:number,uy:number,uz:number,vx:number,vy:number,vz:number;
      if(thrown){ux=camRX*.25;uy=camRY*.25;uz=camRZ*.25;vx=camUX*.25;vy=camUY*.25;vz=camUZ*.25;}
      else{ux=Math.cos(spin)*.25;uy=0;uz=-Math.sin(spin)*.25;vx=0;vy=.25;vz=0;}
      // Copies of flat items stack behind each other along the item's normal.
      const nx=thrown?0:Math.sin(spin)*.06*i,nz=thrown?0:Math.cos(spin)*.06*i;
      const cx=x+jx*.4-nx,cy=y+(thrown?e.height/2:.25+bob)+jy*.3,cz=z+jz*.4-nz;
      if(icon.kind==='sprite'){
        const reg=layout?.regions.get('sprite:'+icon.sprite);if(!reg||!layout)return;
        const w=entityLayer.writer;w.light=light;
        const e1=1/64;
        w.rect(cx,cy,cz,ux,uy,uz,vx,vy,vz,(reg.x+e1)/layout.width,(reg.y+e1)/layout.height,(reg.x+16-e1)/layout.width,(reg.y+16-e1)/layout.height,1,0);
      }else{
        const tile=TILE_INDEX.get(icon.tile);if(tile===undefined)return;
        const w=blockLayer.writer,tx=tile%ATLAS_COLUMNS,ty=Math.floor(tile/ATLAS_COLUMNS);
        w.light=light;
        if(TINTED_TILES.has(icon.tile)){const c=tintFor(icon.tile);w.tintR=c>>16&255;w.tintG=c>>8&255;w.tintB=c&255;}
        w.rect(cx,cy,cz,ux,uy,uz,vx,vy,vz,(tx+.001)/ATLAS_COLUMNS,1-ty/ATLAS_ROWS-.001/ATLAS_ROWS,(tx+.999)/ATLAS_COLUMNS,1-(ty+.999)/ATLAS_ROWS,1,0);
        w.tintR=w.tintG=w.tintB=255;
      }
    }
  }
  const tileTint=new Map<string,number>();
  function tintFor(tile:string){
    let c=tileTint.get(tile);
    if(c===undefined){c=0xffffff;for(const b of BLOCK_BY_NAME.values())if(b.tiles.includes(tile)&&b.tint!=='none'){c=DEFAULT_TINT[b.tint];break;}tileTint.set(tile,c);}
    return c;
  }
  function drawOrb(r:RenderRec,x:number,y:number,z:number,partial:number,light:number){
    const e=r.e,points=e.data.points,reg=layout?.regions.get('orb:'+xpIcon(typeof points==='number'?points:1));if(!reg||!layout)return;
    const w=entityLayer.writer,f=(e.age+partial)/2;
    w.light=light;w.tintR=Math.round((Math.sin(f)+1)*.5*255);w.tintG=255;w.tintB=Math.round((Math.sin(f+4.18879)+1)*.1*255);
    const s=.15,e1=1/64;
    w.rect(x,y+.15,z,camRX*s,camRY*s,camRZ*s,camUX*s,camUY*s,camUZ*s,(reg.x+e1)/layout.width,(reg.y+e1)/layout.height,(reg.x+16-e1)/layout.width,(reg.y+16-e1)/layout.height,1,FLAG_EMISSIVE);
    w.tintR=w.tintG=w.tintB=255;
  }
  function drawBlock(r:RenderRec,x:number,y:number,z:number,partial:number,light:number){
    const e=r.e,k=r.kind;let id:number;
    try{id=k.block?.(e)??0;}catch{id=0;}
    if(!Number.isInteger(id)||id<=0||id>=BLOCK_COUNT)return;
    const fuse=e.data.fuse,w=blockLayer.writer;let s=1;w.flash=0;
    if(typeof fuse==='number'&&Number.isFinite(fuse)){
      const left=fuse-partial+1;
      if(left<10){let f=Math.max(0,Math.min(1,1-left/10));f*=f;f*=f;s=1+f*.3;}
      if(Math.floor(fuse/5)%2===0)w.flash=Math.round(.75*255);
    }
    entityMatrix(BASE,x,y+.5*s,z,0,0,1);
    w.light=light;writeBlock(blockQuads(id),.5,.5,.5,s);
    w.flash=0;
  }
  const FIRE_TILE=TILE_INDEX.get('fire');
  function drawFlames(e:Entity,x:number,y:number,z:number){
    if(FIRE_TILE===undefined)return;
    const w=blockLayer.writer,tx=FIRE_TILE%ATLAS_COLUMNS,ty=Math.floor(FIRE_TILE/ATLAS_COLUMNS);
    // Yaw-only billboard in front of the body (vanilla renderFlame draws stacked fire quads facing the camera).
    let dx=camX-x,dz=camZ-z;const d=Math.hypot(dx,dz)||1;dx/=d;dz/=d;
    const hw=e.width*.7,hh=e.height*.6,off=e.width*.35;
    w.light=0xff;
    w.rect(x+dx*off,y+hh,z+dz*off,-dz*hw,0,dx*hw,0,hh,0,(tx+.001)/ATLAS_COLUMNS,1-ty/ATLAS_ROWS-.001/ATLAS_ROWS,(tx+.999)/ATLAS_COLUMNS,1-(ty+.999)/ATLAS_ROWS,1,FLAG_EMISSIVE);
  }

  const renderer:EntityRenderer={
    stats,get atlas(){return layout;},
    invalidate(){dirty=true;},
    frame(dt,partial,recs){
      const t0=performance.now();
      if(dirty)rebuildAtlas();
      const reduced=game.reducedMotion;
      if(!reduced)animTime+=dt;
      camera.updateMatrixWorld();
      projScreen.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projScreen);
      const me=camera.matrixWorld.elements;camRX=me[0];camRY=me[1];camRZ=me[2];camUX=me[4];camUY=me[5];camUZ=me[6];
      const cp=camera.position;camX=cp.x;camZ=cp.z;
      const ox=Math.floor(cp.x/16)*16,oy=0,oz=Math.floor(cp.z/16)*16;
      entityLayer.writer.begin(ox,oy,oz);blockLayer.writer.begin(ox,oy,oz);
      const far=(shared.fogFar.value||96)+8;
      let drawn=0;
      for(let i=0;i<recs.length;i++){
        const r=recs[i],e=r.e;
        if(e.removed||r.frozen)continue;
        const k=r.kind,mode=k.category==='xp'?'orb':k.render??(k.model?'model':'none');
        if(mode==='none'&&!(e.fire>0))continue;
        const snap=Math.abs(e.x-r.px)+Math.abs(e.y-r.py)+Math.abs(e.z-r.pz)>8;
        const x=snap?e.x:lerp(r.px,e.x,partial),y=snap?e.y:lerp(r.py,e.y,partial),z=snap?e.z:lerp(r.pz,e.z,partial);
        if(Math.hypot(x-cp.x,z-cp.z)>far)continue;
        sphere.center.set(x,y+e.height/2,z);sphere.radius=Math.max(e.width,e.height)*1.5+.5;
        if(!frustum.intersectsSphere(sphere))continue;
        const ly=Math.min(CH-1,Math.max(0,Math.floor(y+e.height*.85)));
        const light=game.world.lightAt(Math.floor(x),ly,Math.floor(z));
        const hurt=e.hurtTime>0||e.deathTime>0?255:0;
        drawn++;
        if(mode==='model')drawModel(r,x,y,z,partial,light,hurt,reduced);
        else if(mode==='item')drawItem(r,x,y,z,partial,light,reduced);
        else if(mode==='block')drawBlock(r,x,y,z,partial,light);
        else if(mode==='orb')drawOrb(r,x,y,z,partial,light);
        if(e.fire>0&&k.category!=='item'&&k.category!=='xp')drawFlames(e,x,y,z);
      }
      upload(entityLayer);upload(blockLayer);
      stats.entities=drawn;stats.quads=entityLayer.writer.quads;stats.blockQuads=blockLayer.writer.quads;
      stats.drawCalls=(stats.quads?1:0)+(stats.blockQuads?1:0);stats.cpuMs=performance.now()-t0;
    },
    dispose(){
      for(const l of [entityLayer,blockLayer]){scene.remove(l.mesh);l.geometry.dispose();l.material.dispose();}
      atlasTexture?.dispose();atlasTexture=null;placeholder.dispose();blockMeshes.clear();models.clear();
    }
  };
  return renderer;
}
