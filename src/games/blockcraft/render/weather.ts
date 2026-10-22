// Weather visuals in game.render.scene: one instanced draw call for every rain streak, snowflake and splash droplet
// (simulated in render/weather-drops.ts), plus one additive draw call for lightning bolts while one exists. Precipitation
// is lit by the renderer's lightmap at full sky light (render/sky.ts LIGHT_GLSL: drops only fall through open sky) with
// the shared daylight, flash, flicker and night vision, and fogged like the chunks, so it matches the world.
import * as THREE from 'three';
import type {Game,SharedUniforms} from '../engine/contracts';
import {LIGHT_GLSL,type RenderUniforms} from './sky';
import type {Bolt} from '../world/weather-lightning';
import {DROP_ABOVE,DROP_CAP,DROP_RADIUS,DropSim,INSTANCE_FLOATS,PrecipitationField,SPLASH_CAP,visualRandom,type DropFrame} from './weather-drops';
import {BOLT_ALPHA,BOLT_COLOR,BOLT_VERTICES,writeBolt} from './weather-bolt';

/** Bolts drawn at once (a new strike replaces the oldest beyond this). */
export const MAX_DRAWN_BOLTS=2;

const PRECIPITATION_VERTEX=`precision highp float;
uniform mat4 modelViewMatrix;uniform mat4 viewMatrix;uniform mat4 projectionMatrix;uniform vec3 eye;
uniform float daylight;uniform float flash;uniform float flicker;uniform float nightVision;
in vec3 position;in vec4 iPos;in vec4 iInfo;
out vec3 vColor;out float vAlpha;out vec3 vRel;out vec2 vUv;out float vKind;
${LIGHT_GLSL}
void main(){
  vec3 p=iPos.xyz;float kind=iPos.w;vec2 corner=position.xy;vec4 mv;
  if(kind<.5){
    // Rain: a vertical streak turned toward the camera around the y axis.
    vec2 h=vec2(eye.z-p.z,p.x-eye.x);float l=length(h);vec2 side=l>1e-4?h/l:vec2(1.,0.);
    mv=modelViewMatrix*vec4(p+vec3(side.x,0.,side.y)*(corner.x*iInfo.x)+vec3(0.,corner.y*iInfo.y,0.),1.);
  }else{
    // Snowflakes and splash droplets face the camera.
    mv=modelViewMatrix*vec4(p,1.);mv.xy+=vec2(corner.x,corner.y-.5)*iInfo.x;
  }
  float d=length(p.xz-eye.xz);
  float edge=(1.-smoothstep(${DROP_RADIUS-3}.,${DROP_RADIUS}.,d))*(1.-smoothstep(${DROP_ABOVE-4}.,${DROP_ABOVE}.,p.y-eye.y));
  vAlpha=iInfo.z*edge*(kind<.5?mix(1.,.3,corner.y):1.);
  vec3 base=kind<.5?vec3(.62,.7,.9):kind<1.5?vec3(.96,.97,1.):vec3(.66,.74,.94);
  vColor=base*bcLightmap(15.,0.,daylight,flash,flicker,nightVision);
  vRel=transpose(mat3(viewMatrix))*mv.xyz;vUv=vec2(corner.x+.5,corner.y);vKind=kind;
  gl_Position=projectionMatrix*mv;
}`;
const PRECIPITATION_FRAGMENT=`precision highp float;
uniform vec3 fogColor;uniform float fogNear;uniform float fogFar;uniform float fogShape;
in vec3 vColor;in float vAlpha;in vec3 vRel;in vec2 vUv;in float vKind;
out vec4 colour;
${LIGHT_GLSL}
void main(){
  float a=vAlpha;
  if(vKind>.5&&vKind<1.5){
    // A 3×3 pixel flake: solid centre cross, faint corners.
    vec2 cell=floor(clamp(vUv,0.,.999)*3.);
    if(cell.x!=1.&&cell.y!=1.)a*=.3;
  }
  if(a<.004)discard;
  colour=vec4(mix(vColor,fogColor,bcFog(bcFogDistance(vRel,fogShape),fogNear,fogFar)),a);
}`;
const BOLT_VERTEX=`precision highp float;
uniform mat4 modelViewMatrix;uniform mat4 projectionMatrix;in vec3 position;
void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const BOLT_FRAGMENT=`precision highp float;
uniform vec3 color;uniform float opacity;out vec4 colour;
void main(){colour=vec4(color,opacity);}`;

export interface WeatherVisuals{
  /** Per frame: dt seconds (0 freezes the drops), the rain level and the live bolts. */
  frame(dt:number,intensity:number,bolts:readonly Bolt[]):void;
  reset():void;
  dispose():void;
  /** The precipitation and bolt meshes (each one draw call when visible). */
  readonly meshes:readonly THREE.Mesh[];
  readonly sim:DropSim;
}

export function createWeatherVisuals(game:Game):WeatherVisuals{
  const render=game.render,scene=render.scene,u=render.uniforms;
  const field=new PrecipitationField();
  const sim=new DropSim(visualRandom(0x9e3779b9),(x,y,z)=>render.spawnParticles('smoke',x,y+.1,z,{count:1,spread:.2}));

  // Precipitation: one quad instanced per particle.
  const geometry=new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.5,0,0,.5,0,0,-.5,1,0,.5,1,0],3));
  geometry.setIndex([0,1,2,2,1,3]);
  const instances=new THREE.InstancedInterleavedBuffer(sim.out,INSTANCE_FLOATS,1);instances.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('iPos',new THREE.InterleavedBufferAttribute(instances,4,0));
  geometry.setAttribute('iInfo',new THREE.InterleavedBufferAttribute(instances,4,4));
  geometry.instanceCount=0;
  const eye=new THREE.Vector3();
  const extra=u as SharedUniforms&Partial<RenderUniforms>;
  const material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:PRECIPITATION_VERTEX,fragmentShader:PRECIPITATION_FRAGMENT,
    uniforms:{eye:{value:eye},daylight:u.daylight,flash:u.flash,flicker:extra.flicker??{value:0},nightVision:extra.nightVision??{value:0},
      fogColor:u.fogColor,fogNear:u.fogNear,fogFar:u.fogFar,fogShape:extra.fogShape??{value:1}},
    transparent:true,depthWrite:false,side:THREE.DoubleSide});
  const precipitation=new THREE.Mesh(geometry,material);
  precipitation.frustumCulled=false;precipitation.renderOrder=4;precipitation.visible=false;precipitation.name='weather-precipitation';
  scene.add(precipitation);

  // Bolts: additive nested tubes, rebuilt only when a bolt appears or re-flashes.
  const boltPositions=new Float32Array(BOLT_VERTICES*3*MAX_DRAWN_BOLTS);
  const boltGeometry=new THREE.BufferGeometry();
  const boltAttribute=new THREE.BufferAttribute(boltPositions,3);boltAttribute.setUsage(THREE.DynamicDrawUsage);
  boltGeometry.setAttribute('position',boltAttribute);boltGeometry.setDrawRange(0,0);
  const boltMaterial=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:BOLT_VERTEX,fragmentShader:BOLT_FRAGMENT,
    uniforms:{color:{value:new THREE.Color(BOLT_COLOR[0],BOLT_COLOR[1],BOLT_COLOR[2])},opacity:{value:BOLT_ALPHA}},
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
  const bolt=new THREE.Mesh(boltGeometry,boltMaterial);
  bolt.frustumCulled=false;bolt.renderOrder=5;bolt.visible=false;bolt.name='weather-bolt';
  scene.add(bolt);
  const drawn=new Float64Array(MAX_DRAWN_BOLTS*4).fill(Number.NaN);let drawnCount=0;

  const frameData:DropFrame={dt:0,camX:0,camY:0,camZ:0,originX:0,originY:0,originZ:0,intensity:0,reducedMotion:false};
  const offs=[
    game.events.on('blockChanged',({x,z})=>field.touch(x,z)),
    game.events.on('chunkLoaded',()=>{field.dirty=true;}),game.events.on('chunkUnloaded',()=>{field.dirty=true;}),
    game.events.on('worldReset',()=>visuals.reset())
  ];

  function updateBolts(bolts:readonly Bolt[]){
    const count=Math.min(MAX_DRAWN_BOLTS,bolts.length),first=bolts.length-count;
    let same=count===drawnCount;
    for(let i=0;i<count&&same;i++){const b=bolts[first+i];same=drawn[i*4]===b.seed&&drawn[i*4+1]===b.x&&drawn[i*4+2]===b.y&&drawn[i*4+3]===b.z;}
    if(same)return;
    drawnCount=count;bolt.visible=count>0;
    if(!count){boltGeometry.setDrawRange(0,0);return;}
    const cam=render.camera.position,ox=Math.floor(cam.x),oy=Math.floor(cam.y),oz=Math.floor(cam.z);
    let o=0;
    for(let i=0;i<count;i++){
      const b=bolts[first+i];drawn[i*4]=b.seed;drawn[i*4+1]=b.x;drawn[i*4+2]=b.y;drawn[i*4+3]=b.z;
      o=writeBolt(boltPositions,o,b.x+.5-ox,b.y-oy,b.z+.5-oz,b.seed);
    }
    bolt.position.set(ox,oy,oz);
    boltAttribute.clearUpdateRanges();boltAttribute.addUpdateRange(0,o);boltAttribute.needsUpdate=true;
    boltGeometry.setDrawRange(0,o/3);
  }

  const visuals:WeatherVisuals={
    meshes:[precipitation,bolt],sim,
    frame(dt,intensity,bolts){
      updateBolts(bolts);
      if(intensity<=0&&!sim.splashes){precipitation.visible=false;geometry.instanceCount=0;return;}
      const cam=render.camera.position,f=frameData;
      field.update(game.world,cam.x,cam.y,cam.z);
      f.dt=game.state==='paused'?0:dt;f.camX=cam.x;f.camY=cam.y;f.camZ=cam.z;
      f.originX=Math.floor(cam.x);f.originY=Math.floor(cam.y);f.originZ=Math.floor(cam.z);
      f.intensity=intensity;f.reducedMotion=game.reducedMotion;
      const n=sim.update(f,field);
      precipitation.position.set(f.originX,f.originY,f.originZ);
      eye.set(cam.x-f.originX,cam.y-f.originY,cam.z-f.originZ);
      geometry.instanceCount=n;precipitation.visible=n>0;
      if(n){instances.clearUpdateRanges();instances.addUpdateRange(0,n*INSTANCE_FLOATS);instances.needsUpdate=true;}
    },
    reset(){sim.reset();field.dirty=true;drawn.fill(Number.NaN);drawnCount=0;bolt.visible=false;precipitation.visible=false;geometry.instanceCount=0;},
    dispose(){
      for(const off of offs)off();
      scene.remove(precipitation);scene.remove(bolt);
      geometry.dispose();material.dispose();boltGeometry.dispose();boltMaterial.dispose();
    }
  };
  return visuals;
}
/** Instances the precipitation mesh can hold. */
export const PRECIPITATION_CAPACITY=DROP_CAP+SPLASH_CAP;
