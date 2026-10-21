// The renderer: chunk meshes in the shared vertex layout (MeshPart in engine/contracts.ts) lit through the vanilla
// lightmap (sky light × the day factor, warm block light, lightning flash, torch flicker, night vision), emissive
// vertices at full brightness, swaying leaves and plants, animated water and lava, rippling liquid surfaces and fog by
// medium (cylindrical air fog to the view distance, short blue water fog, very short orange lava fog). It owns the
// camera (eye, view bob, hurt tilt, eased FOV), the sky and clouds (render/sky-dome.ts), particles
// (render/particles.ts), the first-person hand (render/hand.ts), the block and screen overlays (render/overlay.ts) and
// the adaptive resolution governor, which resizes before drawing.
//
// Draw calls besides chunks and entities: sky 1, clouds 1, particles 1 (when alive), hand 1, block overlay 1 (when
// targeting or mining), screen overlay 1 (when tinted) — at most 6.
import * as THREE from 'three';
import {ATLAS_COLUMNS,ATLAS_ROWS,LIQUID,TILE_INDEX,isLava,isWater} from '../data/blocks';
import {biomeDef} from '../data/biomes';
import {CS,SEA_LEVEL,chunkKey,quadIndices,MAX_PART_QUADS,ROOT_FLAGS} from '../engine/constants';
import {paintAtlasTexture} from '../art/atlas';
import {liquidHeight} from '../engine/physics';
import type {ChunkMesh,Game,MeshPart,RenderService,SharedUniforms,Vec3,ParticleKind,ParticleOptions} from '../engine/contracts';
import {LAVA_FOG,LIGHT_GLSL,celestialAngle,cloudColor,fogColor,fogRange,hexToRgb,lightFactor,lightmap,moonPhase,nightVisionScale,skyColor,
  starBrightness,sunriseColor,sunriseSide,underwaterFogColor,waterFogColor,waterVision,type Medium,type RGB,type RenderUniforms} from './sky';
import {createSky,createSkyFrame} from './sky-dome';
import {createParticles} from './particles';
import {createHand,createViewMotion} from './hand';
import {createBlockOverlay,createScreenOverlay,type OverlayKind} from './overlay';

// ---- Chunk shaders ------------------------------------------------------------------------------------------------------
const VERTEX=`precision highp float;
uniform mat4 modelMatrix;uniform mat4 modelViewMatrix;uniform mat4 viewMatrix;uniform mat4 projectionMatrix;
uniform float daylight;uniform float flash;uniform float flicker;uniform float nightVision;uniform float time;uniform float sway;
uniform vec4 liquidTiles;
in vec4 position;in vec4 uvt;in vec4 tint;
out vec2 vTex;out vec3 vColor;out vec3 vRel;out vec2 vWorld;
flat out vec2 vTile;flat out float vAnim;flat out float vLiquid;
${LIGHT_GLSL}
void main(){
  float lightByte=mod(position.w,256.),flags=floor(position.w/256.);
  float sky=floor(lightByte/16.),block=mod(lightByte,16.);
  bool swaying=mod(flags,2.)>=1.,surface=mod(floor(flags/2.),2.)>=1.,emissive=mod(floor(flags/4.),2.)>=1.;
  // Meshes sit at the chunk centre (for back-to-front sorting); vertices are chunk-local. World x/z only feed the sway
  // and ripple phases, where float32 rounding far from the origin does not show.
  vec3 local=position.xyz/16.-vec3(8.,0.,8.);
  vec2 world=(modelMatrix*vec4(local,1.)).xz;
  if(swaying&&sway>0.){
    // A slow two-wave breeze, continuous across blocks so shared corners move together.
    float p=time*1.7+world.x*.45+world.y*.33,q=time*1.3+world.y*.41-world.x*.27;
    local.x+=sin(p)*.035+sin(q*2.1)*.012;local.z+=sin(q)*.03;
  }
  vec3 lit=emissive?vec3(1.):bcLightmap(sky,block,daylight,flash,flicker,nightVision);
  vColor=tint.rgb*(uvt.w/255.)*lit;
  vTex=uvt.xy/16.;vTile=vec2(mod(uvt.z,${ATLAS_COLUMNS}.),floor(uvt.z/${ATLAS_COLUMNS}.));
  float t=uvt.z;
  // 1 water still, 2 water flowing, 3 lava still, 4 lava flowing.
  vAnim=t==liquidTiles.x?1.:t==liquidTiles.y?2.:t==liquidTiles.z?3.:t==liquidTiles.w?4.:0.;
  vLiquid=surface?1.:0.;vWorld=world;
  // Camera-relative throughout: three multiplies the model and view matrices in float64 on the CPU, so a chunk's large
  // world offset cancels before the GPU sees it (world-space float32 would make far terrain jitter). The fog vector is
  // the view-space position turned back to world axes.
  vec4 mv=modelViewMatrix*vec4(local,1.);
  vRel=transpose(mat3(viewMatrix))*mv.xyz;
  gl_Position=projectionMatrix*mv;
}`;
const FRAGMENT=`precision highp float;
uniform sampler2D atlas;uniform float alphaTest;uniform float time;
uniform vec3 fogColor;uniform float fogNear;uniform float fogFar;uniform float fogShape;
in vec2 vTex;in vec3 vColor;in vec3 vRel;in vec2 vWorld;
flat in vec2 vTile;flat in float vAnim;flat in float vLiquid;
out vec4 colour;
${LIGHT_GLSL}
void main(){
  vec2 t=vTex;float shine=1.;
  if(vAnim>.5){
    bool lava=vAnim>2.5,still=vAnim<1.5||(vAnim>2.5&&vAnim<3.5);
    if(still){
      // The still texture churns: a periodic swirl of the tile (period 1 so greedy tiling stays seamless).
      float s=time*(lava?.12:.32);
      t+=vec2(sin(6.2832*(t.y*2.+s)),sin(6.2832*(t.x*2.+s*.83+.25)))*(lava?.045:.03);
    }else t.y+=time*(lava?.21:.625);
  }
  if(vLiquid>.5){
    // Surface ripples: interfering waves in world space nudge the lookup and the brightness.
    float a=sin(vWorld.x*2.3+time*1.9)+sin(vWorld.y*2.9-time*1.6)+sin((vWorld.x+vWorld.y)*1.7+time*1.2);
    t+=vec2(a,-a)*.008;shine=1.+a*.025;
  }
  vec2 f=clamp(fract(t),.001,.999);
  vec4 tex=texture(atlas,vec2((vTile.x+f.x)/${ATLAS_COLUMNS}.,1.-(vTile.y+1.-f.y)/${ATLAS_ROWS}.));
  if(tex.a<alphaTest)discard;
  vec3 c=tex.rgb*vColor*shine;
  colour=vec4(mix(c,fogColor,bcFog(bcFogDistance(vRel,fogShape),fogNear,fogFar)),tex.a);
}`;

/** The uniforms shared by reference by every world material (chunks, entities, particles, weather, sky). */
export function sharedUniforms():RenderUniforms{
  return{daylight:{value:1},skyDarkening:{value:0},fogColor:{value:new THREE.Color(.75,.85,1)},fogNear:{value:60},fogFar:{value:90},time:{value:0},flash:{value:0},
    fogShape:{value:1},nightVision:{value:0},flicker:{value:0},sway:{value:1}};
}
let liquidTiles:THREE.Vector4|null=null;
/** Chunk material for a render layer; the uniform objects in `shared` are shared by reference with every other world material. */
export function voxelMaterial(atlas:THREE.Texture,layer:'opaque'|'cutout'|'translucent',shared:SharedUniforms&Partial<RenderUniforms>){
  const translucent=layer==='translucent';
  liquidTiles??=new THREE.Vector4(...['water_still','water_flow','lava_still','lava_flow'].map(n=>TILE_INDEX.get(n)??-1));
  return new THREE.RawShaderMaterial({
    glslVersion:THREE.GLSL3,vertexShader:VERTEX,fragmentShader:FRAGMENT,
    uniforms:{atlas:{value:atlas},alphaTest:{value:layer==='cutout'?.5:translucent?.004:0},liquidTiles:{value:liquidTiles},
      daylight:shared.daylight,flash:shared.flash,time:shared.time,fogColor:shared.fogColor,fogNear:shared.fogNear,fogFar:shared.fogFar,
      flicker:shared.flicker??{value:0},nightVision:shared.nightVision??{value:0},fogShape:shared.fogShape??{value:1},sway:shared.sway??{value:1}},
    transparent:translucent,depthWrite:!translucent,side:layer==='opaque'?THREE.FrontSide:THREE.DoubleSide
  });
}

// ---- Pure helpers (tested) --------------------------------------------------------------------------------------------
/** Medium at the camera: inside water or lava below its surface, else air. */
export function mediumAt(world:{get(x:number,y:number,z:number):number},x:number,y:number,z:number):Medium{
  const bx=Math.floor(x),by=Math.floor(y),bz=Math.floor(z),id=world.get(bx,by,bz);
  if(id<=0||!LIQUID[id])return'air';
  const above=world.get(bx,by+1,bz),top=by+(above>0&&LIQUID[above]===LIQUID[id]?1:liquidHeight(id));
  if(y>=top)return'air';
  return isLava(id)?'lava':isWater(id)?'water':'air';
}
/** Vanilla FOV: the setting × the eased modifier (sprint, flight, bow) × 6/7 in a liquid, narrowed while dying. */
export function fieldOfView(base:number,modifier:number,medium:Medium,deathTicks=0):number{
  let fov=base*modifier;if(medium!=='air')fov*=6/7;
  if(deathTicks>0)fov/=(1-500/(Math.min(deathTicks,20)+500))*2+1;
  return fov;
}
/** Adaptive resolution step: average frame time (ms) of the last second → new scale (within min..max). */
export function governScale(scale:number,average:number,good:number,max:number,min=.5):{scale:number;good:number}{
  if(average>21&&scale>min)return{scale:Math.max(min,scale*.8),good:0};
  if(average<15&&scale<max){if(good+1>=3)return{scale:Math.min(max,scale*1.15),good:0};return{scale,good:good+1};}
  return{scale,good:0};
}

interface ChunkRender{meshes:THREE.Mesh[]}
const OVERLAYS=new Set(['water','lava','hurt','fire','portal']);

export function createRenderer(game:Game):RenderService{
  const canvas=game.canvas;
  const renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,stencil:false,powerPreference:'high-performance'});
  const maxScale=Math.min(window.devicePixelRatio||1,1.5);let scale=maxScale;
  renderer.setPixelRatio(scale);
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(70,1,.05,512);camera.rotation.order='YXZ';scene.add(camera);
  const atlas=paintAtlasTexture();
  const uniforms=sharedUniforms();
  const materials={opaque:voxelMaterial(atlas,'opaque',uniforms),cutout:voxelMaterial(atlas,'cutout',uniforms),translucent:voxelMaterial(atlas,'translucent',uniforms)};
  const sharedIndex=new THREE.BufferAttribute(quadIndices(MAX_PART_QUADS),1);
  const chunks=new Map<number,ChunkRender>();
  const chunkGroup=new THREE.Group();chunkGroup.matrixAutoUpdate=false;scene.add(chunkGroup);
  const sky=createSky(uniforms),skyFrame=createSkyFrame();scene.add(sky.dome,sky.clouds);
  const particles=createParticles(game,atlas,uniforms);scene.add(particles.mesh);
  const hand=createHand(game,atlas);scene.add(hand.mesh);
  const blockOverlay=createBlockOverlay(atlas);scene.add(blockOverlay.mesh);
  const screenOverlay=createScreenOverlay(atlas);scene.add(screenOverlay.mesh);
  const clear=new THREE.Color();
  let viewChunks=5,fovModifier=1,fovTarget=1,disposed=false;

  function geometryFor(part:MeshPart,minY:number,maxY:number){
    const g=new THREE.BufferGeometry(),n=part.quads*16;
    g.setAttribute('position',new THREE.BufferAttribute(part.position.subarray(0,n),4));
    g.setAttribute('uvt',new THREE.BufferAttribute(part.uvt.subarray(0,n),4));
    g.setAttribute('tint',new THREE.BufferAttribute(part.tint.subarray(0,n),4,true));
    g.setIndex(sharedIndex);g.setDrawRange(0,part.quads*6);
    g.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,(minY+maxY)/2,0),Math.hypot(CS/2,(maxY-minY)/2+1,CS/2));
    return g;
  }
  function release(render?:ChunkRender){
    if(!render)return;
    // Detach the shared index so disposing one chunk never frees it for the others.
    for(const mesh of render.meshes){chunkGroup.remove(mesh);mesh.geometry.setIndex(null);mesh.geometry.dispose();}
    render.meshes.length=0;
  }
  function applySize(){
    const w=canvas.clientWidth,h=canvas.clientHeight;if(w<1||h<1)return;
    renderer.setPixelRatio(scale);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
    const size=renderer.getDrawingBufferSize(new THREE.Vector2());blockOverlay.resize(size.x,size.y,camera.near);
  }
  const resize=new ResizeObserver(applySize);resize.observe(canvas);
  // Adaptive resolution keeps the frame time near budget on slow GPUs.
  let windowStart=0,frames=0,time=0,good=0,last=0;
  function govern(){
    const now=performance.now(),dt=last?now-last:16;last=now;frames++;time+=dt;
    if(now-windowStart<1000)return;
    if(game.state==='playing'){
      const next=governScale(scale,time/frames,good,maxScale);good=next.good;
      if(next.scale!==scale){scale=next.scale;applySize();}
    }
    windowStart=now;frames=0;time=0;
  }

  // ---- Per-tick state (20 Hz) ---------------------------------------------------------------------------------------
  let acc=0,ticks=0,waterTicks=0,flicker=0;
  const flickerRandom=Math.random;
  // View bob, the hand's lag behind the view, the hurt tilt (on every playerDamaged) and the death roll.
  const motion=createViewMotion();
  const unsubscribe:(()=>void)[]=[];
  function tick(){
    ticks++;
    particles.tick();hand.tick();
    motion.tick(game.player.state,game.survival.dead);
    const eye=game.player.eye();
    waterTicks=mediumAt(game.world,eye.x,eye.y,eye.z)==='water'?Math.min(600,waterTicks+1):Math.max(0,waterTicks-10);
    // LightTexture.tick: the block light red flicker random walk.
    flicker=game.reducedMotion?0:(flicker+(flickerRandom()-flickerRandom())*flickerRandom()*flickerRandom()*.1)*.9;
  }

  // ---- Per-frame -----------------------------------------------------------------------------------------------------
  const prefix=new THREE.Matrix4(),handPrefix=new THREE.Matrix4(),view=new THREE.Matrix4(),tmp=new THREE.Matrix4(),q=new THREE.Quaternion(),
    pos=new THREE.Vector3(),scl=new THREE.Vector3(),euler=new THREE.Euler(0,0,0,'YXZ');
  const zenith:RGB={r:0,g:0,b:0},fog:RGB={r:0,g:0,b:0},biomeSky:RGB={r:0,g:0,b:0},waterFog:RGB={r:-1,g:0,b:0},tmpRgb:RGB={r:0,g:0,b:0},handLight:RGB={r:1,g:1,b:1};
  const range={near:0,far:0,cylinder:true},sunrise=[0,0,0,0];
  let cloudTime=0,swamp=false;
  const WEIGHTS=[1,2,1];
  const sampled={r:0,g:0,b:0,water:0};
  function sampleBiomes(x:number,z:number){
    // Vanilla blends biome sky colours over the surrounding biome cells (CubicSampler); a 3×3 tent filter at ±8 blocks.
    let r=0,g=0,b=0;
    for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){
      const w=WEIGHTS[i+1]*WEIGHTS[j+1]/16,c=hexToRgb(biomeDef(game.world.biomeAt(Math.floor(x+i*8),Math.floor(z+j*8))).sky,tmpRgb);
      r+=c.r*w;g+=c.g*w;b+=c.b*w;
    }
    const biome=biomeDef(game.world.biomeAt(Math.floor(x),Math.floor(z)));swamp=biome.name==='swamp';
    sampled.r=r;sampled.g=g;sampled.b=b;sampled.water=waterFogColor(biome.name);
    return sampled;
  }
  function effect(name:string){
    const list=game.survival.effects();
    for(let i=0;i<list.length;i++)if(list[i].name===name)return list[i];
    return null;
  }
  function frame(dt:number){
    if(disposed)return;
    const d=Number.isFinite(dt)&&dt>0?dt:0;
    // Partial tick, mirroring the engine's fixed-step accumulator.
    acc=Math.max(0,Math.min(.05,acc+d-ticks*.05));ticks=0;
    const partial=acc*20,reduced=game.reducedMotion;
    if(!reduced){uniforms.time.value+=d;cloudTime+=d;}
    uniforms.sway.value=reduced?0:1;

    const p=game.player.state,eye=game.player.eye(),medium=mediumAt(game.world,eye.x,eye.y,eye.z);
    // Camera: eye, then the death roll, hurt tilt and view bob applied in view space (vanilla bobHurt / bobView).
    motion.frame(d,game.survival.dead);
    motion.camera(prefix.identity(),partial,reduced);
    euler.set(p.pitch,p.yaw,0,'YXZ');q.setFromEuler(euler);
    view.compose(pos.set(eye.x,eye.y,eye.z),q,scl.set(1,1,1)).multiply(tmp.copy(prefix).invert());
    view.decompose(camera.position,camera.quaternion,scl);camera.updateMatrixWorld();
    // Eased FOV (vanilla fovModifier += (target - modifier) * 0.5 per tick).
    fovModifier+=(fovTarget-fovModifier)*(1-Math.pow(.5,d*20));
    const fov=fieldOfView(game.settings.fov||70,fovModifier,medium,motion.deathTime);
    if(Math.abs(camera.fov-fov)>.01){camera.fov=fov;camera.updateProjectionMatrix();}

    // Light and sky.
    const t=game.time,w=game.weather,rain=w?.intensity??0,thunder=w?.thunder??0,flash=w?.flash??0;
    const angle=celestialAngle(t.dayTime+partial*(game.settings.daylightCycle&&game.state==='playing'?1:0)),daylight=t.daylight;
    const vision=effect('night_vision'),nightVision=vision?nightVisionScale(vision.ticks):0;
    // Smooth light from the unrounded darkening; skyDarkening keeps the engine's whole levels.
    uniforms.daylight.value=lightFactor(daylight,rain,thunder);uniforms.skyDarkening.value=t.skyDarkening;
    uniforms.flash.value=Math.max(0,Math.min(1,flash));uniforms.flicker.value=flicker;uniforms.nightVision.value=nightVision;
    sampleBiomes(eye.x,eye.z);biomeSky.r=sampled.r;biomeSky.g=sampled.g;biomeSky.b=sampled.b;
    const skyHex=(Math.round(biomeSky.r*255)<<16)|(Math.round(biomeSky.g*255)<<8)|Math.round(biomeSky.b*255);
    skyColor(skyHex,daylight,rain,thunder,flash,zenith);
    const light=game.world.lightAt(Math.floor(eye.x),Math.floor(eye.y),Math.floor(eye.z)),eyeSky=light>=0?light>>4&15:15,eyeBlock=light>=0?light&15:0;
    if(medium==='water'){
      // Vanilla eases the water fog colour toward a new biome's over 5 seconds.
      const target=hexToRgb(sampled.water,tmpRgb),k=waterFog.r<0?1:Math.min(1,d/5);
      if(waterFog.r<0){waterFog.r=target.r;waterFog.g=target.g;waterFog.b=target.b;}
      else{waterFog.r+=(target.r-waterFog.r)*k;waterFog.g+=(target.g-waterFog.g)*k;waterFog.b+=(target.b-waterFog.b)*k;}
      const hex=(Math.round(waterFog.r*255)<<16)|(Math.round(waterFog.g*255)<<8)|Math.round(waterFog.b*255);
      const bright=Math.max(eyeBlock,eyeSky*uniforms.daylight.value)/15;
      underwaterFogColor(hex,waterVision(waterTicks),bright,fog);
    }else if(medium==='lava'){fog.r=LAVA_FOG.r;fog.g=LAVA_FOG.g;fog.b=LAVA_FOG.b;}
    else{
      const look=game.player.look();
      fogColor({daylight,angle,lookX:look.x,viewChunks,rain,thunder,sky:zenith,nightVision},fog);
    }
    // Fog darkens toward the bottom of the world (clear colour scale, y below 1).
    if(eye.y<1){const k=Math.max(0,eye.y)**2;fog.r*=k;fog.g*=k;fog.b*=k;}
    uniforms.fogColor.value.setRGB(fog.r,fog.g,fog.b);
    clear.setRGB(fog.r,fog.g,fog.b,THREE.SRGBColorSpace);renderer.setClearColor(clear,1);
    fogRange(medium,viewChunks,{waterVision:waterVision(waterTicks),swamp,fireResistance:effect('fire_resistance')!==null},range);
    uniforms.fogNear.value=range.near;uniforms.fogFar.value=range.far;uniforms.fogShape.value=range.cylinder?1:0;

    const viewBlocks=viewChunks*CS;
    const f=skyFrame;
    f.sky.r=zenith.r;f.sky.g=zenith.g;f.sky.b=zenith.b;
    f.sunrise=sunriseColor(angle,sunrise);f.sunriseSide=sunriseSide(angle);
    f.angle=angle;f.sunAlpha=1-Math.max(0,Math.min(1,rain));f.stars=starBrightness(angle,rain);f.moonPhase=moonPhase(t.day);
    if(medium==='air'){f.skyFogStart=0;f.skyFogEnd=viewBlocks;}else{f.skyFogStart=range.near;f.skyFogEnd=range.far;}
    f.voidDark=eye.y<SEA_LEVEL+1;f.skyVisible=medium!=='lava';
    cloudColor(daylight,rain,thunder,f.cloud);
    f.cloudFar=Math.min(280,Math.max(160,viewBlocks*2));f.cloudNear=f.cloudFar*.5;f.cloudsVisible=medium!=='lava';f.mediumFog=medium!=='air';
    f.cloudTime=cloudTime;
    sky.update(f,camera.position);

    // Hand: lit like the player (light at the eye), with the bob prefix and the lag behind fast turns.
    const hudHidden=game.root.dataset?.[ROOT_FLAGS.hudHidden]==='true',hide=hudHidden||game.state==='loading';
    hand.mesh.visible=!hide;blockOverlay.setOutlineHidden(hudHidden);
    if(!hide){
      motion.lag(handPrefix.copy(prefix),p.yaw,p.pitch,partial,reduced);
      lightmap(eyeSky,eyeBlock,uniforms.daylight.value,{flash,flicker,nightVision},handLight);
      hand.update(partial,handPrefix,camera.aspect,handLight);
    }
    screenOverlay.update(uniforms.time.value,camera.aspect,p.yaw,p.pitch,Math.max(eyeBlock,eyeSky*uniforms.daylight.value)/15);
    particles.update(partial,camera.position);
  }

  const service:RenderService&{tick():void}={
    renderer,scene,camera,atlas,uniforms,
    get resolutionScale(){return scale;},
    setChunkMesh(cx,cz,mesh:ChunkMesh|null){
      const key=chunkKey(cx,cz);release(chunks.get(key));chunks.delete(key);
      if(!mesh||disposed)return;
      const render:ChunkRender={meshes:[]};
      for(const [layer,part] of [['opaque',mesh.opaque],['cutout',mesh.cutout],['translucent',mesh.translucent]] as const){
        if(!part||!part.quads)continue;
        const m=new THREE.Mesh(geometryFor(part,mesh.minY,mesh.maxY),materials[layer]);
        m.matrixAutoUpdate=false;m.position.set(cx*CS+CS/2,0,cz*CS+CS/2);m.updateMatrix();m.updateMatrixWorld(true);
        m.renderOrder=layer==='translucent'?2:layer==='cutout'?1:0;chunkGroup.add(m);render.meshes.push(m);
      }
      chunks.set(key,render);
    },
    setSelection(box){blockOverlay.setSelection(box);},
    setBreaking(pos:Vec3|null,stage:number){
      blockOverlay.setBreaking(pos,stage,pos?Math.max(0,game.world.get(Math.floor(pos.x),Math.floor(pos.y),Math.floor(pos.z))):0);
    },
    spawnParticles(kind:ParticleKind,x:number,y:number,z:number,options?:ParticleOptions){particles.spawn(kind,x,y,z,options);},
    swing(){hand.swing();},
    setOverlay(kind,strength=1){screenOverlay.set(kind&&OVERLAYS.has(kind)?kind as OverlayKind:null,strength);},
    setViewDistance(n){
      if(!Number.isFinite(n)||n<1)return;
      viewChunks=n;camera.far=Math.max(512,n*CS*4);camera.updateProjectionMatrix();
    },
    setFovScale(s){if(Number.isFinite(s)&&s>0)fovTarget=Math.max(.1,Math.min(2,s));},
    init(){
      // The hurt tilt follows every hit (fire and lava too, whose screen overlays hide the 'hurt' one); a load or a
      // respawn may turn the view far from where the hand's lag was.
      unsubscribe.push(game.events.on('playerDamaged',()=>motion.hurt()),game.events.on('restored',()=>motion.resync()),
        game.events.on('playerRespawned',()=>motion.resync()));
    },
    frame,tick,
    // Resize before drawing: resizing after would clear the presented frame.
    render(){if(disposed)return;govern();renderer.render(scene,camera);},
    info(){return{drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,chunks:chunks.size};},
    reset(){
      for(const r of chunks.values())release(r);chunks.clear();
      particles.reset();hand.reset();blockOverlay.setSelection(null);blockOverlay.setBreaking(null,0,0);screenOverlay.set(null,0);
      fovModifier=fovTarget=1;waterTicks=0;motion.reset();waterFog.r=-1;
    },
    dispose(){
      if(disposed)return;disposed=true;
      for(const off of unsubscribe.splice(0))off();
      resize.disconnect();for(const r of chunks.values())release(r);chunks.clear();
      sky.dispose();particles.dispose();hand.dispose();blockOverlay.dispose();screenOverlay.dispose();
      for(const m of Object.values(materials))m.dispose();atlas.dispose();
      renderer.dispose();renderer.forceContextLoss();scene.clear();
    }
  };
  applySize();
  return service;
}
