import * as THREE from 'three';
import {WeaponView} from './viewmodel';
import {Operators,type OperatorAvatar} from './operators';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
// @ts-expect-error -- licensed Tiny Strike HDR composite, bloom and SSAO.
import {PostChain} from './engine/gfx/post/index.js';
import {CollisionAdapter} from './world-adapter';
import {WallRenderer} from './wall-renderer';
import {WallStore} from './walls';
// @ts-expect-error -- licensed JavaScript vendor, kept outside application TS settings.
import World from './engine/world/map.js';
// @ts-expect-error -- licensed JavaScript vendor.
import {MaterialSystem} from './engine/gfx/materials/index.js';
// @ts-expect-error -- licensed resource disposer.
import {disposeObject} from './engine/resources.js';
import {gunFor} from './loadouts';
import {TacticalProps} from './tactical-props';
import {hudMarkers} from './hud-markers';
import {QUALITY,type Tier} from './quality';
import {type Entity,type Point,type SimWorld,type Team} from './sim';

type Avatar=OperatorAvatar;
export function deviceGPU(){
 const canvas=document.createElement('canvas');const gl=canvas.getContext('webgl2');if(!gl)return '';
 const debug=gl.getExtension('WEBGL_debug_renderer_info'),name=debug?String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)):'';gl.getExtension('WEBGL_lose_context')?.loseContext();return name;
}
export class View{
 readonly renderer:THREE.WebGLRenderer;readonly scene=new THREE.Scene();readonly camera=new THREE.PerspectiveCamera(74,1,.05,80);
 world:any;materials:any;private avatars=new Map<number,Avatar>();private operators:Operators;
 private disposed=false;private sun=new THREE.DirectionalLight(0xfff1dc,3.4);private weapon:WeaponView;private benchTarget:THREE.WebGLRenderTarget|null=null;farAnimationCap=Infinity;private composer:EffectComposer|null=null;private fxaa:ShaderPass|null=null;private post:any=null;private adapter:CollisionAdapter;private wallView:WallRenderer|null=null;private props:TacticalProps;
 private warm=0;private time=0;private width=1;private height=1;
 readonly collision:SimWorld;
 constructor(readonly root:HTMLElement,public tier:Tier){
  const q=QUALITY[tier];this.renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
  this.renderer.info.autoReset=false;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.45;
  this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.shadowMap.enabled=!!q.shadows;
  this.camera.rotation.order='YXZ';this.scene.add(this.camera);root.prepend(this.renderer.domElement);
  this.renderer.domElement.setAttribute('aria-label','Strongroom first person play surface');this.renderer.domElement.tabIndex=0;
  this.materials=new MaterialSystem({renderer:this.renderer,quality:tier,anisotropy:tier==='potato'?1:4});
  const game={renderer:this.renderer,scene:this.scene,camera:this.camera,materials:this.materials,gfxQuality:tier,quality:q,selectedMapId:import.meta.env.DEV&&new URLSearchParams(location.search).get('map')==='harbor'?'harbor':'customs-house',settings:{brightnessEv:.5},state:{phase:'menu'},config:{PLAYER:{STEP_HEIGHT:.55}},events:{on:()=>()=>{},emit:()=>{}},buildSimpleSky:(world:any)=>this.simpleSky(world)};
  this.world=new World(game);
  if(tier==='high')this.sun=this.world.sun??this.sun;this.sun.position.set(35,48,-30);this.sun.castShadow=!!q.shadows;this.sun.shadow.mapSize.set(q.shadows||512,q.shadows||512);Object.assign(this.sun.shadow.camera,{left:-18,right:18,top:18,bottom:-18,near:1,far:120});
  if(tier!=='high')this.scene.add(this.sun);
  const fill=new THREE.HemisphereLight(0xd7efff,0xb9ac93,tier==='high'?3.2:2.4);fill.name='daylight-fill';this.scene.add(fill,new THREE.AmbientLight(0xd9e6ec,tier==='high'?2.6:.9));
  this.scene.fog=new THREE.Fog(0xd5e7ed,q.fog*.8,q.fog*1.22);this.camera.far=q.far;this.camera.updateProjectionMatrix();
  let lights=0;this.scene.traverse(o=>{if(o instanceof THREE.PointLight){o.visible=lights++<q.lights;}});
  this.weapon=new WeaponView(this.camera,tier,this.materials);this.operators=new Operators(tier);
  this.makePost();
  this.props=new TacticalProps(this.scene,this.materials,tier,this.world.mapDefinition);this.adapter=new CollisionAdapter(this.world);this.collision=this.adapter.world;

 }
 private simpleSky(world:any){
  // The sky is a background texture, so it cannot be clipped by the camera's
  // short potato far plane. It adds no scene draw or post-processing pass.
  const canvas=document.createElement('canvas');canvas.width=this.tier==='potato'?128:512;canvas.height=canvas.width/2;
  const ctx=canvas.getContext('2d')!,g=ctx.createLinearGradient(0,0,0,canvas.height);g.addColorStop(0,'#78b8eb');g.addColorStop(.5,'#d9edf5');g.addColorStop(1,'#b8c6bd');ctx.fillStyle=g;ctx.fillRect(0,0,canvas.width,canvas.height);
  const texture=new THREE.CanvasTexture(canvas);texture.mapping=THREE.EquirectangularReflectionMapping;texture.colorSpace=THREE.SRGBColorSpace;this.scene.background=texture;
  world.sky=null;
 }
 private makePost(){
  this.composer?.dispose();this.composer=null;this.fxaa=null;this.post?.dispose();this.post=null;
  if(this.tier==='potato'||this.tier==='low')return;
  if(this.tier==='high'&&PostChain.supported(this.renderer)){
   const gl=this.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info'),gpu=debug?String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)):'';
   const ssao=matchMedia('(pointer:fine)').matches&&/NVIDIA|GeForce|Radeon|RTX/i.test(gpu);
   this.post=new PostChain({renderer:this.renderer,scene:this.scene,camera:this.camera,world:this.world},{aa:'auto',ssao});this.post.bloomStrength=.09;return;
  }
  this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.scene,this.camera));this.composer.addPass(new OutputPass());
  this.fxaa=new ShaderPass(FXAAShader);this.composer.addPass(this.fxaa);
 }
 setWalls(store:WallStore){if(this.wallView?.store===store)return;this.wallView?.dispose();this.adapter.bind(store);this.wallView=new WallRenderer(this.scene,store,this.tier,this.materials);this.wallView.sync();}
 setWallShot(fn:((cell:number)=>void)|null){this.adapter.onWallShot=fn;}
 get walls(){return this.wallView;}
 resize(width:number,height:number,scale:number){this.width=width;this.height=height;const ratio=Math.min(devicePixelRatio||1,QUALITY[this.tier].dpr)*scale;this.renderer.setPixelRatio(ratio);this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.composer?.setPixelRatio(ratio);this.composer?.setSize(width,height);this.fxaa?.uniforms.resolution.value.set(1/(width*ratio),1/(height*ratio));this.post?.setSize();}
 async loadCharacters(){
  await Promise.all([this.weapon.load(),this.operators.load()]);if(this.disposed)return;
  await this.renderer.compileAsync(this.scene,this.camera,this.scene);await this.weapon.warm(this.renderer,this.scene);
  for(const root of this.operators.warmRoots()){if(!this.disposed)await this.renderer.compileAsync(root,this.camera,this.scene);const skeletons=new Set<THREE.Skeleton>();root.traverse(o=>{if(o instanceof THREE.SkinnedMesh&&!skeletons.has(o.skeleton)){skeletons.add(o.skeleton);o.skeleton.dispose();}});}
 }
 private avatar(e:Entity):Avatar|null{
  const old=this.avatars.get(e.seat);if(old?.key===this.operators.key(e))return old;if(old)this.operators.release(old);
  const avatar=this.operators.create(e);if(!avatar)return null;this.scene.add(avatar.root);this.avatars.set(e.seat,avatar);return avatar;
 }
 private held(a:Avatar,e:Entity,distance:number){const id=this.weapon.gunId(e);if(a.gun!==id){a.held?.removeFromParent();a.held=this.weapon.held(e)??undefined;a.gun=id;const anchor=a.root.getObjectByName('AK');if(a.held&&anchor){anchor.add(a.held);a.held.scale.setScalar(1/a.root.scale.x);a.held.rotation.y=-Math.PI/2;}}
  if(a.held)a.held.visible=e.hp>0&&distance<28;
 }
 draw(entities:Entity[],local:number|null,phase:string,dt:number,home:boolean,reduced:boolean,state?:import('./sim').Simulation){
  this.time+=dt;this.world.update(reduced?0:dt);this.materials.update?.(dt);
  this.sun.position.set(30,58,-22);this.sun.intensity=Math.max(3.4,this.sun.intensity);this.sun.color.set(0xfff1dc);
  if(this.wallView){this.wallView.reducedMotion=reduced;this.wallView.sync();this.wallView.update(dt);}
  const viewer=entities.find(e=>e.seat===local),follow=viewer&&viewer.hp<=0?entities.find(e=>e.team===viewer.team&&e.hp>0)??viewer:viewer,viewSeat=follow?.seat??local;
  if(state)this.props.update(state,viewSeat??0,this.time,reduced);
  for(const e of entities){if(e.seat===viewSeat)continue;const a=this.avatar(e);if(!a)continue;a.root.visible=true;a.root.position.set(e.x,e.y,e.z);a.root.rotation.y=e.yaw+Math.PI;
   const distance=this.camera.position.distanceTo(a.root.position),hz=distance>20?Math.min(QUALITY[this.tier].animationHz,this.farAnimationCap):60;a.at+=dt;this.operators.style(a,e,viewer,distance);this.held(a,e,distance);
   const desired=e.hp<=0?'Death':e.crouch?'Duck':Math.hypot(e.vx,e.vz)>1?'Run':'Idle';const name=[...a.clips.keys()].find(n=>n.toLowerCase()===desired.toLowerCase())??[...a.clips.keys()].find(n=>n.toLowerCase().includes(desired.toLowerCase()))??'';
   if(name&&a.current!==name){a.mixer.stopAllAction();const action=a.mixer.clipAction(a.clips.get(name)!);if(e.hp<=0){action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;}action.play();a.current=name;}
   if(a.at>=1/hz){a.mixer.update(a.at);a.at=0;}
  }
  for(const [seat,a] of this.avatars)if(!entities.some(e=>e.seat===seat&&e.seat!==viewSeat))a.root.visible=false;
  const e=entities.find(e=>e.seat===local);
  this.weapon.update(e,home||phase==='pick'||phase==='gameEnd',!!this.camera.userData.ads,this.time,reduced);
  if(home){const angle=reduced?0:this.time*.025;this.camera.position.set(Math.sin(angle)*31,19,Math.cos(angle)*31);this.camera.lookAt(0,1,0);}
  else if(follow){this.camera.position.set(follow.x,follow.y+(follow.hp<=0?.55:follow.crouch?1.08:1.62),follow.z);this.camera.rotation.set(follow.pitch,follow.yaw,0,'YXZ');this.camera.fov=this.camera.userData.ads?gunFor(follow).adsFov:74;this.camera.updateProjectionMatrix();}
  this.sun.shadow.autoUpdate=this.tier!=='medium'||this.warm++%2===0;
  this.renderer.info.reset();if(this.post)this.post.render(this.scene,this.camera);else if(this.composer)this.composer.render(dt);else this.renderer.render(this.scene,this.camera);
 }
 benchmark(entities:Entity[],dt:number){
  if(!this.benchTarget)this.benchTarget=new THREE.WebGLRenderTarget(Math.max(1,this.width*.5|0),Math.max(1,this.height*.5|0));
  for(const e of entities){if(e.seat===0)continue;const a=this.avatar(e);if(a){a.root.visible=true;a.root.position.set(e.x,e.y,e.z);a.root.rotation.y=e.yaw+Math.PI;this.operators.style(a,e,entities[0],0);this.held(a,e,0);if(!a.current){const clip=[...a.clips.values()].find(c=>/run/i.test(c.name));if(clip){a.mixer.clipAction(clip).play();a.current=clip.name;}}a.mixer.update(dt);}}
  const target=this.renderer.getRenderTarget(),pos=this.camera.position.clone(),rotation=this.camera.quaternion.clone();
  this.camera.position.set(0,18,42);this.camera.lookAt(0,1,0);this.renderer.setRenderTarget(this.benchTarget);this.renderer.render(this.scene,this.camera);this.renderer.setRenderTarget(target);this.camera.position.copy(pos);this.camera.quaternion.copy(rotation);
 }
 endBenchmark(){this.benchTarget?.dispose();this.benchTarget=null;this.clearAvatars();}
 clearAvatars(){for(const a of this.avatars.values())this.operators.release(a);this.avatars.clear();}
 spotMarkers(entities:Entity[],local:number|null,time:number,state?:import('./sim').Simulation){return hudMarkers(this.camera,entities,local,time,state);}
 dispose(){if(this.disposed)return;this.disposed=true;this.endBenchmark();this.wallView?.dispose();this.props.dispose();this.post?.dispose();this.weapon.dispose();this.world.sky?.dispose();this.composer?.passes.forEach(p=>p.dispose());this.composer?.dispose();const seen=disposeObject(this.scene);disposeObject(this.world.solids,seen);disposeObject(this.world.environment,seen);this.operators.dispose();this.materials.dispose();if(this.scene.background instanceof THREE.Texture)this.scene.background.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();}
}
