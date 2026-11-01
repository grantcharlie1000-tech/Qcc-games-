import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
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
export class View{
 readonly renderer:THREE.WebGLRenderer;readonly scene=new THREE.Scene();readonly camera=new THREE.PerspectiveCamera(74,1,.05,80);
 world:any;materials:any;private avatars=new Map<number,Avatar>();private templates=new Map<Team,THREE.Group>();private clips=new Map<Team,THREE.AnimationClip[]>();
 private owned=new Set<THREE.Material>();private disposed=false;private sun=new THREE.DirectionalLight(0xffe8ce,2);private gun:THREE.Mesh;private composer:EffectComposer|null=null;private fxaa:ShaderPass|null=null;
 private warm=0;private time=0;private width=1;private height=1;
 readonly collision:SimWorld;
 constructor(readonly root:HTMLElement,public tier:Tier){
  const q=QUALITY[tier];this.renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
  this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.1;
  this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.shadowMap.enabled=!!q.shadows;
  this.camera.rotation.order='YXZ';this.scene.add(this.camera);root.prepend(this.renderer.domElement);
  this.renderer.domElement.setAttribute('aria-label','Strongroom first person play surface');this.renderer.domElement.tabIndex=0;
  this.materials=new MaterialSystem({renderer:this.renderer,quality:tier,anisotropy:tier==='potato'?1:4});
  const game={renderer:this.renderer,scene:this.scene,camera:this.camera,materials:this.materials,gfxQuality:tier,quality:q,selectedMapId:'harbor',state:{phase:'menu'},config:{PLAYER:{STEP_HEIGHT:.55}},events:{on:()=>()=>{},emit:()=>{}},buildSimpleSky:(world:any)=>this.simpleSky(world)};
  this.world=new World(game);
  this.sun.position.set(35,48,-30);this.sun.castShadow=!!q.shadows;this.sun.shadow.mapSize.set(q.shadows||512,q.shadows||512);Object.assign(this.sun.shadow.camera,{left:-18,right:18,top:18,bottom:-18,near:1,far:120});
  if(tier!=='high'){this.scene.add(this.sun,new THREE.HemisphereLight(0xb6dce8,0x59685e,1.8),new THREE.AmbientLight(0x84979c,.55));}
  this.scene.fog=new THREE.Fog(0x9bb7be,q.fog*.55,q.fog);this.camera.far=q.far;this.camera.updateProjectionMatrix();
  let lights=0;this.scene.traverse(o=>{if(o instanceof THREE.PointLight){o.visible=lights++<q.lights;}});
  this.gun=this.buildGun();this.camera.add(this.gun);this.gun.visible=false;
  this.makePost();
  const p=new THREE.Vector3(),d=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3();
  this.collision={spawns:[[0,0,-35],[0,0,35]],spawn:(team,index)=>{const list=this.world.spawns[team===0?'ct':'t'],s=list[index%list.length];return{x:s.pos.x,y:s.pos.y,z:s.pos.z,yaw:s.yaw??(team===0?Math.PI:0)};},
   collide:(e,dx,dy,dz)=>{p.set(e.x,e.y,e.z);d.set(dx,dy,dz);const r=this.world.resolveMovement(p,d,.35,e.crouch?1.25:1.83);return{x:r.pos.x,y:r.pos.y,z:r.pos.z,ground:r.onGround};},
   blocked:(from,to)=>{a.set(from.x,from.y,from.z);b.set(to.x-from.x,to.y-from.y,to.z-from.z);const distance=b.length();if(distance<.001)return false;b.multiplyScalar(1/distance);const hit=this.world.raycast(a,b,distance);return !!hit&&hit.distance<distance-.03;},
   path:(from,to)=>{a.set(from.x,from.y,from.z);b.set(to.x,to.y,to.z);return this.world.findPath(a,b)?.map((p:THREE.Vector3)=>({x:p.x,y:p.y,z:p.z}))??[];}};
 }
 private simpleSky(world:any){
  if(this.tier==='potato'){
   const mat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color(0x6697b0)},bottom:{value:new THREE.Color(0xc0d1d3)}},vertexShader:'varying float h;void main(){h=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position.z=gl_Position.w;}',fragmentShader:'uniform vec3 top;uniform vec3 bottom;varying float h;void main(){gl_FragColor=vec4(mix(bottom,top,smoothstep(-.05,.8,h)),1.);}'});
   const mesh=new THREE.Mesh(new THREE.SphereGeometry(250,12,6),mat);mesh.frustumCulled=false;this.scene.add(mesh);
  }else{
   // A static equirectangular sky; no atmosphere LUTs or per-frame cloud passes.
   const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d')!;const g=ctx.createLinearGradient(0,0,0,256);g.addColorStop(0,'#5d91ad');g.addColorStop(.5,'#bfd1d5');g.addColorStop(1,'#859a96');ctx.fillStyle=g;ctx.fillRect(0,0,512,256);const texture=new THREE.CanvasTexture(canvas);texture.mapping=THREE.EquirectangularReflectionMapping;texture.colorSpace=THREE.SRGBColorSpace;this.scene.background=texture;
  }
  world.sky=null;
 }
 private buildGun(){
  const pieces:THREE.BufferGeometry[]=[];
  const box=(x:number,y:number,z:number,w:number,h:number,d:number)=>{const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);pieces.push(g);};
  box(0,0,0,.065,.105,.3);box(0,.015,-.18,.052,.075,.22);box(0,.025,-.37,.025,.025,.2);box(0,-.09,.06,.045,.12,.06);box(0,-.12,-.04,.045,.15,.07);box(0,.04,.16,.065,.11,.18);box(0,.085,-.02,.055,.045,.07);box(0,.11,-.02,.025,.01,.05);
  const geometry=mergeGeometries(pieces)!;for(const g of pieces)g.dispose();const material=new THREE.MeshLambertMaterial({color:0x25343c});this.owned.add(material);
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(.22,-.24,-.5);mesh.renderOrder=30;mesh.material.depthTest=false;return mesh;
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
  const loader=new GLTFLoader();await Promise.all(([0,1] as Team[]).map(async team=>{const gltf=await loader.loadAsync(`${import.meta.env.BASE_URL}game-assets/strongroom/models/soldier_${team===0?'ct':'t'}.glb`);if(this.disposed){disposeObject(gltf.scene);return;}
   gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){if(['AK','SMG','Sniper','Pistol'].includes(o.name))o.visible=false;o.castShadow=!!QUALITY[this.tier].shadows;o.frustumCulled=false;if(this.tier==='potato'||this.tier==='low'){o.material=(Array.isArray(o.material)?o.material:[o.material]).map(m=>{const material=new THREE.MeshLambertMaterial({color:(m as THREE.MeshStandardMaterial).color,map:(m as THREE.MeshStandardMaterial).map});this.owned.add(material);return material;});}}});
   this.templates.set(team,gltf.scene);this.clips.set(team,gltf.animations);
  }));
 }
 private avatar(e:Entity):Avatar|null{
  const old=this.avatars.get(e.seat);if(old)return old;const template=this.templates.get(e.team);if(!template)return null;
  const root=cloneSkeleton(template) as THREE.Group;root.scale.setScalar(1.83/(e.team===0?2.2699:2.1358));this.scene.add(root);const mixer=new THREE.AnimationMixer(root),clips=new Map((this.clips.get(e.team)??[]).map(c=>[c.name,c]));
  const a={root,mixer,clips,current:'',at:0,dead:false};this.avatars.set(e.seat,a);return a;
 }
 draw(entities:Entity[],local:number|null,phase:string,dt:number,home:boolean,reduced:boolean){
  this.time+=dt;this.world.update(dt);this.materials.update?.(dt);
  for(const e of entities){if(e.seat===local)continue;const a=this.avatar(e);if(!a)continue;a.root.visible=true;a.root.position.set(e.x,e.y,e.z);a.root.rotation.y=e.yaw;
   const distance=this.camera.position.distanceTo(a.root.position),hz=distance>20?QUALITY[this.tier].animationHz:60;a.at+=dt;
   const desired=e.hp<=0?'Death':e.crouch?'Duck':Math.hypot(e.vx,e.vz)>1?'Run':'Idle';const name=[...a.clips.keys()].find(n=>n.toLowerCase()===desired.toLowerCase())??[...a.clips.keys()].find(n=>n.toLowerCase().includes(desired.toLowerCase()))??'';
   if(name&&a.current!==name){a.mixer.stopAllAction();const action=a.mixer.clipAction(a.clips.get(name)!);if(e.hp<=0){action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;}action.play();a.current=name;}
   if(a.at>=1/hz){a.mixer.update(a.at);a.at=0;}
  }
  for(const [seat,a] of this.avatars)if(!entities.some(e=>e.seat===seat&&e.seat!==local))a.root.visible=false;
  const e=entities.find(e=>e.seat===local);
  if(home){this.gun.visible=false;const angle=this.time*.025;this.camera.position.set(Math.sin(angle)*31,19,Math.cos(angle)*31);this.camera.lookAt(0,1,0);}
  else if(e){this.camera.position.set(e.x,e.y+(e.hp<=0?.55:e.crouch?1.08:1.62),e.z);this.camera.rotation.set(e.pitch,e.yaw,0,'YXZ');this.gun.visible=e.hp>0&&phase!=='gameEnd';const ads=this.camera.userData.ads;this.gun.position.x=ads?0:.22;this.gun.position.y=ads?-.13:-.24;if(!reduced)this.gun.position.y+=Math.sin(this.time*10)*Math.min(.004,Math.hypot(e.vx,e.vz)*.001);this.camera.fov=ads?58:74;this.camera.updateProjectionMatrix();}
  this.sun.shadow.autoUpdate=this.tier!=='medium'||this.warm++%2===0;
  this.renderer.info.reset();if(this.composer)this.composer.render(dt);else this.renderer.render(this.scene,this.camera);
 }
 clearAvatars(){for(const a of this.avatars.values()){a.mixer.stopAllAction();a.mixer.uncacheRoot(a.root);this.scene.remove(a.root);a.root.traverse(o=>{if(o instanceof THREE.SkinnedMesh)o.skeleton.dispose();});}this.avatars.clear();}
 dispose(){if(this.disposed)return;this.disposed=true;this.clearAvatars();this.world.sky?.dispose();this.composer?.passes.forEach(p=>p.dispose());this.composer?.dispose();const seen=disposeObject(this.scene);disposeObject(this.world.solids,seen);disposeObject(this.world.environment,seen);for(const root of this.templates.values())disposeObject(root,seen);for(const m of this.owned)m.dispose();this.materials.dispose();if(this.scene.background instanceof THREE.Texture)this.scene.background.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();}
}
