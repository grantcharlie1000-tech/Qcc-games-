// STUB renderer (owned by the renderer & sky agent, who adds the sky dome, sun/moon/stars,
// particles, breaking cracks and the first-person hand). This version: chunk meshes with the
// shared vertex layout, day/night light, fog, clouds, selection outline and adaptive resolution.
import * as THREE from 'three';
import {ATLAS_COLUMNS,ATLAS_ROWS} from '../data/blocks';
import {CS,CH,chunkKey} from '../engine/constants';
import {quadIndices,MAX_PART_QUADS} from '../engine/constants';
import {paintAtlasTexture,paintClouds} from '../art/atlas';
import type {ChunkMesh,Game,MeshPart,RenderService,SharedUniforms,Vec3,ParticleKind} from '../engine/contracts';

const VERTEX=`precision highp float;
uniform mat4 modelViewMatrix;uniform mat4 projectionMatrix;uniform float daylight;
in vec4 position;in vec4 uvt;in vec4 tint;
out vec2 vTex;out vec2 vTile;out vec3 vColor;out float vDepth;
void main(){
  float lightByte=mod(position.w,256.);
  float sky=floor(lightByte/16.),block=mod(lightByte,16.);
  float skyLevel=sky*daylight;
  float level=max(skyLevel,block);
  float bright=max(pow(.8,15.-level),.04);
  // Torchlight is warm when it outshines the sky.
  vec3 lightColour=mix(vec3(1.),vec3(1.,.86,.66),clamp((block-skyLevel)/8.,0.,1.));
  vColor=tint.rgb*(uvt.w/255.)*bright*lightColour;
  vTex=uvt.xy/16.;vTile=vec2(mod(uvt.z,${ATLAS_COLUMNS}.),floor(uvt.z/${ATLAS_COLUMNS}.));
  vec4 mv=modelViewMatrix*vec4(position.xyz/16.,1.);
  vDepth=-mv.z;gl_Position=projectionMatrix*mv;
}`;
const FRAGMENT=`precision highp float;
uniform sampler2D atlas;uniform float opacity;uniform float alphaTest;uniform vec3 fogColor;uniform float fogNear;uniform float fogFar;
in vec2 vTex;in vec2 vTile;in vec3 vColor;in float vDepth;
out vec4 colour;
void main(){
  vec2 f=clamp(fract(vTex),.001,.999);
  vec4 t=texture(atlas,vec2((vTile.x+f.x)/${ATLAS_COLUMNS}.,1.-(vTile.y+1.-f.y)/${ATLAS_ROWS}.));
  if(t.a<alphaTest)discard;
  colour=vec4(mix(t.rgb*vColor,fogColor,smoothstep(fogNear,fogFar,vDepth)),t.a*opacity);
}`;
export const DAY_SKY=0x8fc6ff,NIGHT_SKY=0x05070f,UNDERWATER=0x1d4a8f;

export function sharedUniforms():SharedUniforms{
  return{daylight:{value:1},skyDarkening:{value:0},fogColor:{value:new THREE.Color()},fogNear:{value:60},fogFar:{value:90},time:{value:0},flash:{value:0}};
}
/** Chunk material; the uniform objects in `shared` are shared by reference with every other world material. */
export function voxelMaterial(atlas:THREE.Texture,layer:'opaque'|'cutout'|'translucent',shared:SharedUniforms){
  const translucent=layer==='translucent';
  return new THREE.RawShaderMaterial({
    glslVersion:THREE.GLSL3,vertexShader:VERTEX,fragmentShader:FRAGMENT,
    uniforms:{atlas:{value:atlas},opacity:{value:translucent?.78:1},alphaTest:{value:layer==='cutout'?.5:translucent?.01:0},
      daylight:shared.daylight,fogColor:shared.fogColor,fogNear:shared.fogNear,fogFar:shared.fogFar},
    transparent:translucent,depthWrite:!translucent,side:layer==='opaque'?THREE.FrontSide:THREE.DoubleSide
  });
}
const CLOUD_SPAN=512,CLOUD_CELL=8;
function cloudLayer(){
  const size=CLOUD_SPAN/CLOUD_CELL,mask=paintClouds(size),positions:number[]=[];
  for(let tz=-1;tz<=1;tz++)for(let tx=-1;tx<=1;tx++)for(let y=0;y<size;y++)for(let x=0;x<size;){
    if(!mask[(y*size+x)*4+3]){x++;continue;}
    let end=x;while(end<size&&mask[(y*size+end)*4+3])end++;
    const x0=tx*CLOUD_SPAN+x*CLOUD_CELL-CLOUD_SPAN/2,x1=tx*CLOUD_SPAN+end*CLOUD_CELL-CLOUD_SPAN/2,z0=tz*CLOUD_SPAN+y*CLOUD_CELL-CLOUD_SPAN/2,z1=z0+CLOUD_CELL;
    positions.push(x0,0,z0,x1,0,z0,x0,0,z1,x0,0,z1,x1,0,z0,x1,0,z1);x=end;
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeBoundingSphere();return g;
}
interface ChunkRender{meshes:THREE.Mesh[]}

export function createRenderer(game:Game):RenderService{
  const canvas=game.canvas;
  const renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,stencil:false,powerPreference:'high-performance'});
  const maxScale=Math.min(window.devicePixelRatio||1,1.5);let scale=maxScale;
  renderer.setPixelRatio(scale);
  const scene=new THREE.Scene();scene.background=new THREE.Color(DAY_SKY);
  const camera=new THREE.PerspectiveCamera(70,1,.05,200);camera.rotation.order='YXZ';scene.add(camera);
  const atlas=paintAtlasTexture();
  const uniforms=sharedUniforms();
  const materials={opaque:voxelMaterial(atlas,'opaque',uniforms),cutout:voxelMaterial(atlas,'cutout',uniforms),translucent:voxelMaterial(atlas,'translucent',uniforms)};
  const sharedIndex=new THREE.BufferAttribute(quadIndices(MAX_PART_QUADS),1);
  const chunks=new Map<number,ChunkRender>();
  const chunkGroup=new THREE.Group();chunkGroup.matrixAutoUpdate=false;scene.add(chunkGroup);
  const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1,1,1)),new THREE.LineBasicMaterial({color:0x111111,transparent:true,opacity:.6}));
  outline.visible=false;scene.add(outline);
  const clouds=new THREE.Mesh(cloudLayer(),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.8,depthWrite:false,side:THREE.DoubleSide,fog:false}));
  clouds.position.y=CH+40;clouds.renderOrder=3;scene.add(clouds);
  const fogColor=new THREE.Color(),sky=new THREE.Color(),night=new THREE.Color(NIGHT_SKY),day=new THREE.Color(DAY_SKY),water=new THREE.Color(UNDERWATER);
  let viewChunks=5,fovScale=1,fov=70;

  function geometryFor(part:MeshPart,minY:number,maxY:number){
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(part.position,4));
    g.setAttribute('uvt',new THREE.BufferAttribute(part.uvt,4));
    g.setAttribute('tint',new THREE.BufferAttribute(part.tint,4,true));
    g.setIndex(sharedIndex);g.setDrawRange(0,part.quads*6);
    g.boundingSphere=new THREE.Sphere(new THREE.Vector3(CS/2,(minY+maxY)/2,CS/2),Math.hypot(CS/2,(maxY-minY)/2+1,CS/2));
    return g;
  }
  function release(render?:ChunkRender){
    if(!render)return;
    // Detach the shared index so disposing one chunk never frees it for the others.
    for(const mesh of render.meshes){chunkGroup.remove(mesh);mesh.geometry.setIndex(null);mesh.geometry.dispose();}
  }
  function applySize(){
    const w=canvas.clientWidth,h=canvas.clientHeight;if(w<1||h<1)return;
    renderer.setPixelRatio(scale);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
  }
  const resize=new ResizeObserver(applySize);resize.observe(canvas);
  // Adaptive resolution keeps the frame time near budget on slow GPUs.
  let windowStart=0,frames=0,time=0,good=0,last=0;
  function govern(){
    const now=performance.now(),dt=last?now-last:16;last=now;frames++;time+=dt;
    if(now-windowStart<1000)return;
    const average=time/frames;
    if(game.state==='playing'){
      if(average>21&&scale>.5){scale=Math.max(.5,scale*.8);applySize();good=0;}
      else if(average<15&&scale<maxScale){if(++good>=3){scale=Math.min(maxScale,scale*1.15);applySize();good=0;}}
      else good=0;
    }
    windowStart=now;frames=0;time=0;
  }
  const service:RenderService={
    renderer,scene,camera,atlas,uniforms,
    get resolutionScale(){return scale;},
    setChunkMesh(cx,cz,mesh:ChunkMesh|null){
      const key=chunkKey(cx,cz);release(chunks.get(key));chunks.delete(key);
      if(!mesh)return;
      const render:ChunkRender={meshes:[]};
      for(const [layer,part] of [['opaque',mesh.opaque],['cutout',mesh.cutout],['translucent',mesh.translucent]] as const){
        if(!part.quads)continue;
        const m=new THREE.Mesh(geometryFor(part,mesh.minY,mesh.maxY),materials[layer]);
        m.matrixAutoUpdate=false;m.position.set(cx*CS,0,cz*CS);m.updateMatrix();m.updateMatrixWorld(true);
        m.renderOrder=layer==='translucent'?2:layer==='cutout'?1:0;chunkGroup.add(m);render.meshes.push(m);
      }
      chunks.set(key,render);
    },
    setSelection(box){
      outline.visible=!!box;if(!box)return;
      const g=.004;outline.position.set((box.minX+box.maxX)/2,(box.minY+box.maxY)/2,(box.minZ+box.maxZ)/2);
      outline.scale.set(box.maxX-box.minX+g,box.maxY-box.minY+g,box.maxZ-box.minZ+g);
    },
    setBreaking(_pos:Vec3|null,_stage:number){},
    spawnParticles(_kind:ParticleKind,_x:number,_y:number,_z:number){},
    swing(){},
    setOverlay(){},
    setViewDistance(n){viewChunks=n;camera.far=(n+1)*CS+32;camera.updateProjectionMatrix();},
    setFovScale(s){fovScale=s;},
    frame(dt){
      const p=game.player.state,eye=game.player.eye();
      camera.position.set(eye.x,eye.y,eye.z);camera.rotation.set(p.pitch,p.yaw,0);
      const targetFov=70*fovScale;fov+=(targetFov-fov)*Math.min(1,dt*10);if(Math.abs(camera.fov-fov)>.01){camera.fov=fov;camera.updateProjectionMatrix();}
      const daylight=game.time.daylight,under=p.headInWater;
      sky.copy(night).lerp(day,daylight);
      fogColor.copy(under?water:sky);
      (scene.background as THREE.Color).copy(fogColor);
      const far=viewChunks*CS,near=under?1:far*.6,farFog=under?20:far*.95;
      const srgb={r:0,g:0,b:0};fogColor.getRGB(srgb,THREE.SRGBColorSpace);
      uniforms.daylight.value=.2+.8*Math.max(0,(11-game.time.skyDarkening)/11);uniforms.skyDarkening.value=game.time.skyDarkening;
      uniforms.fogColor.value.setRGB(srgb.r,srgb.g,srgb.b);uniforms.fogNear.value=near;uniforms.fogFar.value=farFog;
      if(!game.reducedMotion)uniforms.time.value+=dt;uniforms.flash.value=game.weather.flash;
      const drift=(performance.now()/1000*1.2)%CLOUD_SPAN;
      clouds.position.x=Math.round((p.x-drift)/CLOUD_SPAN)*CLOUD_SPAN+drift;clouds.position.z=Math.round(p.z/CLOUD_SPAN)*CLOUD_SPAN;
      (clouds.material as THREE.MeshBasicMaterial).color.setScalar(.25+.75*daylight);
    },
    // Resize before drawing: resizing after would clear the presented frame.
    render(){govern();renderer.render(scene,camera);},
    info(){return{drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,chunks:chunks.size};},
    reset(){for(const r of chunks.values())release(r);chunks.clear();},
    dispose(){
      resize.disconnect();for(const r of chunks.values())release(r);chunks.clear();
      outline.geometry.dispose();(outline.material as THREE.Material).dispose();clouds.geometry.dispose();(clouds.material as THREE.Material).dispose();
      for(const m of Object.values(materials))m.dispose();atlas.dispose();
      renderer.dispose();renderer.forceContextLoss();scene.clear();
    }
  };
  applySize();
  return service;
}
