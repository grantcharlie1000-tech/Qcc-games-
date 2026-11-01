import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {WeaponView} from './viewmodel';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
// @ts-expect-error -- licensed JavaScript vendor, kept outside application TS settings.
import World from './engine/world/map.js';
// @ts-expect-error -- licensed JavaScript vendor.
import {MaterialSystem} from './engine/gfx/materials/index.js';
// @ts-expect-error -- licensed resource disposer.
import {disposeObject} from './engine/resources.js';
import {QUALITY,type Tier} from './quality';
import {GUNS,type Entity,type Point,type SimWorld,type Team} from './sim';

type Avatar={root:THREE.Group;mixer:THREE.AnimationMixer;clips:Map<string,THREE.AnimationClip>;current:string;at:number;dead:boolean};
export function deviceGPU(){
 const canvas=document.createElement('canvas');const gl=canvas.getContext('webgl2');if(!gl)return '';
 const debug=gl.getExtension('WEBGL_debug_renderer_info'),name=debug?String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)):'';gl.getExtension('WEBGL_lose_context')?.loseContext();return name;
}
export class View{
 readonly renderer:THREE.WebGLRenderer;readonly scene=new THREE.Scene();readonly camera=new THREE.PerspectiveCamera(74,1,.05,80);
 world:any;materials:any;private avatars=new Map<number,Avatar>();private templates=new Map<Team,THREE.Group>();private clips=new Map<Team,THREE.AnimationClip[]>();
 private owned=new Set<THREE.Material>();private disposed=false;private sun=new THREE.DirectionalLight(0xfff1dc,3.4);private weapon:WeaponView;private benchTarget:THREE.WebGLRenderTarget|null=null;farAnimationCap=Infinity;private composer:EffectComposer|null=null;private fxaa:ShaderPass|null=null;
 private warm=0;private time=0;private width=1;private height=1;
 readonly collision:SimWorld;
 constructor(readonly root:HTMLElement,public tier:Tier){
  const q=QUALITY[tier];this.renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
  this.renderer.info.autoReset=false;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.45;
  this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.shadowMap.enabled=!!q.shadows;
  this.camera.rotation.order='YXZ';this.scene.add(this.camera);root.prepend(this.renderer.domElement);
  this.renderer.domElement.setAttribute('aria-label','Strongroom first person play surface');this.renderer.domElement.tabIndex=0;
  this.materials=new MaterialSystem({renderer:this.renderer,quality:tier,anisotropy:tier==='potato'?1:4});
  const game={renderer:this.renderer,scene:this.scene,camera:this.camera,materials:this.materials,gfxQuality:tier,quality:q,selectedMapId:'harbor',settings:{brightnessEv:.5},state:{phase:'menu'},config:{PLAYER:{STEP_HEIGHT:.55}},events:{on:()=>()=>{},emit:()=>{}},buildSimpleSky:(world:any)=>this.simpleSky(world)};
  this.world=new World(game);
  if(tier==='high')this.sun=this.world.sun??this.sun;this.sun.position.set(35,48,-30);this.sun.castShadow=!!q.shadows;this.sun.shadow.mapSize.set(q.shadows||512,q.shadows||512);Object.assign(this.sun.shadow.camera,{left:-18,right:18,top:18,bottom:-18,near:1,far:120});
  if(tier!=='high')this.scene.add(this.sun);
  const fill=new THREE.HemisphereLight(0xd7efff,0xb9ac93,tier==='high'?3.2:2.4);fill.name='daylight-fill';this.scene.add(fill,new THREE.AmbientLight(0xd9e6ec,tier==='high'?2.6:.9));
  this.scene.fog=new THREE.Fog(0xd5e7ed,q.fog*.8,q.fog*1.22);this.camera.far=q.far;this.camera.updateProjectionMatrix();
  let lights=0;this.scene.traverse(o=>{if(o instanceof THREE.PointLight){o.visible=lights++<q.lights;}});
  this.weapon=new WeaponView(this.camera,tier);
  this.makePost();
  const p=new THREE.Vector3(),d=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3();
  this.collision={spawns:[[0,0,-35],[0,0,35]],spawn:(team,index)=>{const list=this.world.spawns[team===0?'ct':'t'],s=list[index%list.length];return{x:s.pos.x,y:s.pos.y,z:s.pos.z,yaw:s.yaw??(team===0?Math.PI:0)};},
   collide:(e,dx,dy,dz)=>{p.set(e.x,e.y,e.z);d.set(dx,dy,dz);const r=this.world.resolveMovement(p,d,.35,e.crouch?1.25:1.83);return{x:r.pos.x,y:r.pos.y,z:r.pos.z,ground:r.onGround};},
   blocked:(from,to)=>{a.set(from.x,from.y,from.z);b.set(to.x-from.x,to.y-from.y,to.z-from.z);const distance=b.length();if(distance<.001)return false;b.multiplyScalar(1/distance);const hit=this.world.raycast(a,b,distance);return !!hit&&hit.distance<distance-.03;},
   path:(from,to)=>{a.set(from.x,from.y,from.z);b.set(to.x,to.y,to.z);return this.world.findPath(a,b)?.map((p:THREE.Vector3)=>({x:p.x,y:p.y,z:p.z}))??[];}};
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
  this.composer?.dispose();this.composer=null;this.fxaa=null;
  if(this.tier==='potato'||this.tier==='low')return;
  this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.scene,this.camera));
  if(this.tier==='high'){const bloom=new UnrealBloomPass(new THREE.Vector2(this.width,this.height),.15,.3,.95);this.composer.addPass(bloom);this.composer.renderTarget1.samples=4;this.composer.renderTarget2.samples=4;}
  this.fxaa=new ShaderPass(FXAAShader);this.composer.addPass(this.fxaa);
 }
 resize(width:number,height:number,scale:number){this.width=width;this.height=height;const ratio=Math.min(devicePixelRatio||1,QUALITY[this.tier].dpr)*scale;this.renderer.setPixelRatio(ratio);this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.composer?.setPixelRatio(ratio);this.composer?.setSize(width,height);this.fxaa?.uniforms.resolution.value.set(1/(width*ratio),1/(height*ratio));}
 async loadCharacters(){
  const loader=new GLTFLoader();await this.weapon.load();await Promise.all(([0,1] as Team[]).map(async team=>{const gltf=await loader.loadAsync(`${import.meta.env.BASE_URL}game-assets/strongroom/models/soldier_${team===0?'ct':'t'}.glb`);if(this.disposed){disposeObject(gltf.scene);return;}
   gltf.scene.updateMatrixWorld(true);
   gltf.scene.traverse(o=>{
    if(['AK','SMG','Sniper','Pistol'].includes(o.name))o.visible=false;
    if(o instanceof THREE.Mesh){
     o.castShadow=!!QUALITY[this.tier].shadows;o.frustumCulled=true;
     if(o instanceof THREE.SkinnedMesh){o.computeBoundingSphere();if(o.boundingSphere)o.boundingSphere.radius*=1.35;}
     if(this.tier==='potato'||this.tier==='low'){
      const array=Array.isArray(o.material),sources=array?o.material as THREE.Material[]:[o.material as THREE.Material];
      const styled=sources.map(m=>{const old=m as THREE.MeshStandardMaterial,material=new THREE.MeshLambertMaterial({color:old.color,map:old.map});this.owned.add(material);return material;});o.material=array?styled:styled[0];
     }
    }
   });
   if(this.tier==='potato'||this.tier==='low')this.addWeaponProxy(gltf.scene);
   this.templates.set(team,gltf.scene);this.clips.set(team,gltf.animations);
  }));
  // Warm the actual world, both soldier skins and both hidden viewmodels before play.
  // Future wall/gadget variants join this pass when their milestones add them.
  for(const target of [this.scene,...this.templates.values()]){if(this.disposed)return;await this.renderer.compileAsync(target,this.camera,this.scene);}
 }
 private addWeaponProxy(root:THREE.Group){
  const anchor=root.getObjectByName('AK');if(!anchor?.parent)return;
  const parts:THREE.BufferGeometry[]=[];for(const [x,y,z,w,h,d] of [[0,0,-.1,.07,.1,.35],[0,.02,-.43,.025,.025,.32],[0,0,.17,.065,.11,.23],[0,-.1,-.06,.04,.15,.07]]){const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);parts.push(g);}
  const geometry=mergeGeometries(parts)!;for(const g of parts)g.dispose();const material=new THREE.MeshLambertMaterial({color:0x263039});this.owned.add(material);
  const mesh=new THREE.Mesh(geometry,material);mesh.name='sr-weapon-proxy';mesh.position.copy(anchor.position);mesh.quaternion.copy(anchor.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-Math.PI/2));const scale=anchor.parent.getWorldScale(new THREE.Vector3()).x;mesh.scale.setScalar(1/Math.max(.001,scale));anchor.parent.add(mesh);
 }
 private avatar(e:Entity):Avatar|null{
  const old=this.avatars.get(e.seat);if(old)return old;const template=this.templates.get(e.team);if(!template)return null;
  const root=cloneSkeleton(template) as THREE.Group;root.scale.setScalar(1.83/(e.team===0?2.2699:2.1358));this.scene.add(root);const mixer=new THREE.AnimationMixer(root),clips=new Map((this.clips.get(e.team)??[]).map(c=>[c.name,c]));
  const a={root,mixer,clips,current:'',at:0,dead:false};this.avatars.set(e.seat,a);return a;
 }
 draw(entities:Entity[],local:number|null,phase:string,dt:number,home:boolean,reduced:boolean){
  this.time+=dt;this.world.update(dt);this.materials.update?.(dt);
  this.sun.position.set(30,58,-22);this.sun.intensity=Math.max(3.4,this.sun.intensity);this.sun.color.set(0xfff1dc);
  for(const e of entities){if(e.seat===local)continue;const a=this.avatar(e);if(!a)continue;a.root.visible=true;a.root.position.set(e.x,e.y,e.z);a.root.rotation.y=e.yaw;const cheap=this.tier==='potato'||this.tier==='low';if(!cheap){const rifle=a.root.getObjectByName('AK'),pistol=a.root.getObjectByName('Pistol');if(rifle)rifle.visible=e.weapon===0;if(pistol)pistol.visible=e.weapon===1;}
   const distance=this.camera.position.distanceTo(a.root.position),hz=distance>20?Math.min(QUALITY[this.tier].animationHz,this.farAnimationCap):60;a.at+=dt;
   const desired=e.hp<=0?'Death':e.crouch?'Duck':Math.hypot(e.vx,e.vz)>1?'Run':'Idle';const name=[...a.clips.keys()].find(n=>n.toLowerCase()===desired.toLowerCase())??[...a.clips.keys()].find(n=>n.toLowerCase().includes(desired.toLowerCase()))??'';
   if(name&&a.current!==name){a.mixer.stopAllAction();const action=a.mixer.clipAction(a.clips.get(name)!);if(e.hp<=0){action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;}action.play();a.current=name;}
   if(a.at>=1/hz){a.mixer.update(a.at);a.at=0;}
  }
  for(const [seat,a] of this.avatars)if(!entities.some(e=>e.seat===seat&&e.seat!==local))a.root.visible=false;
  const e=entities.find(e=>e.seat===local);
  this.weapon.update(e,home,!!this.camera.userData.ads,this.time,reduced);
  if(home){const angle=reduced?0:this.time*.025;this.camera.position.set(Math.sin(angle)*31,19,Math.cos(angle)*31);this.camera.lookAt(0,1,0);}
  else if(e){this.camera.position.set(e.x,e.y+(e.hp<=0?.55:e.crouch?1.08:1.62),e.z);this.camera.rotation.set(e.pitch,e.yaw,0,'YXZ');this.camera.fov=this.camera.userData.ads?58:74;this.camera.updateProjectionMatrix();}
  this.sun.shadow.autoUpdate=this.tier!=='medium'||this.warm++%2===0;
  this.renderer.info.reset();if(this.composer)this.composer.render(dt);else this.renderer.render(this.scene,this.camera);
 }
 benchmark(entities:Entity[],dt:number){
  if(!this.benchTarget)this.benchTarget=new THREE.WebGLRenderTarget(Math.max(1,this.width*.5|0),Math.max(1,this.height*.5|0));
  for(const e of entities){if(e.seat===0)continue;const a=this.avatar(e);if(a){a.root.visible=true;a.root.position.set(e.x,e.y,e.z);a.root.rotation.y=e.yaw;if(!a.current){const clip=[...a.clips.values()].find(c=>/run/i.test(c.name));if(clip){a.mixer.clipAction(clip).play();a.current=clip.name;}}a.mixer.update(dt);}}
  const target=this.renderer.getRenderTarget(),pos=this.camera.position.clone(),rotation=this.camera.quaternion.clone();
  this.camera.position.set(0,18,42);this.camera.lookAt(0,1,0);this.renderer.setRenderTarget(this.benchTarget);this.renderer.render(this.scene,this.camera);this.renderer.setRenderTarget(target);this.camera.position.copy(pos);this.camera.quaternion.copy(rotation);
 }
 endBenchmark(){this.benchTarget?.dispose();this.benchTarget=null;this.clearAvatars();}
 clearAvatars(){for(const a of this.avatars.values()){a.mixer.stopAllAction();a.mixer.uncacheRoot(a.root);this.scene.remove(a.root);a.root.traverse(o=>{if(o instanceof THREE.SkinnedMesh)o.skeleton.dispose();});}this.avatars.clear();}
 dispose(){if(this.disposed)return;this.disposed=true;this.endBenchmark();this.weapon.dispose();this.world.sky?.dispose();this.composer?.passes.forEach(p=>p.dispose());this.composer?.dispose();const seen=disposeObject(this.scene);disposeObject(this.world.solids,seen);disposeObject(this.world.environment,seen);for(const root of this.templates.values())disposeObject(root,seen);for(const m of this.owned)m.dispose();this.materials.dispose();if(this.scene.background instanceof THREE.Texture)this.scene.background.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();}
}
