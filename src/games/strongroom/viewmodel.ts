import * as THREE from 'three';
import {modelLoader} from './model-loader';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
// @ts-expect-error -- licensed grip rig retained from Tiny Strike.
import {NPC_ARM_POSES,applyNPCArmGrip} from './engine/viewmodel-arms.js';
// @ts-expect-error -- licensed procedural weapon builds, shared across actors.
import {weaponInstance,disposeWeaponTemplates} from './engine/gfx/weapons/registry.js';
// @ts-expect-error -- licensed resource disposer.
import {disposeObject} from './engine/resources.js';
import {type Tier} from './quality';
import {GUNS,type Entity} from './sim';

/** Shared procedural guns, designer palette arms and cached remote gun materials. */
export class WeaponView{
 private models=new Map<string,THREE.Group>();private arms=new Map<string,THREE.Group>();private low=new Map<string,THREE.Group>();private proxies=new Map<string,THREE.Group>();private lowMaterial:THREE.MeshLambertMaterial;private proxyMaterial:THREE.MeshLambertMaterial;private disposed=false;
 constructor(private camera:THREE.Camera,private tier:Tier,private materials:any){const map=materials.get('rubber',{tint:0xffffff}).map;this.lowMaterial=new THREE.MeshLambertMaterial({color:0xffffff,map,vertexColors:true,depthTest:false,depthWrite:false});this.proxyMaterial=new THREE.MeshLambertMaterial({color:0xffffff,map,vertexColors:true});}
 async load(){const loader=modelLoader();const ids=['ak47','m4a1','mp5','smg','awp','glock','usp','deagle'];const jobs=ids.flatMap(id=>(this.tier==='potato'||this.tier==='low'?['held','low']:['held']).map(async kind=>{const asset=await loader.loadAsync(`${import.meta.env.BASE_URL}game-assets/strongroom/models/weapons/${id}-${kind}.glb`);if(this.disposed){disposeObject(asset.scene);return;}(kind==='low'?this.low:this.proxies).set(id,asset.scene);}));await Promise.all(jobs);await Promise.all(['attack','defend'].map(async side=>{const asset=await loader.loadAsync(`${import.meta.env.BASE_URL}game-assets/strongroom/models/viewmodels/arms_${side}.glb`);if(this.disposed){disposeObject(asset.scene);return;}asset.scene.traverse(o=>{if(o instanceof THREE.Mesh){const m=o.material as THREE.MeshStandardMaterial;if(this.tier==='potato'||this.tier==='low')o.material=new THREE.MeshLambertMaterial({map:m.map,color:0xffffff});const material=o.material as THREE.MeshStandardMaterial;material.depthTest=false;material.depthWrite=false;o.frustumCulled=false;o.castShadow=false;o.renderOrder=40;}});this.arms.set(side,asset.scene);}));if(!this.disposed){this.model('m4a1');this.model('usp');}}
 private model(id:string){const old=this.models.get(id);if(old)return old;const cheap=this.tier==='potato'||this.tier==='low',gun=(cheap?this.low.get(id)?.clone(true):weaponInstance(id,this.materials,{viewmodel:true})) as THREE.Group|null;if(!gun)return null;
  gun.traverse(o=>{if(o instanceof THREE.Mesh){if(cheap)o.material=this.lowMaterial;o.castShadow=false;o.receiveShadow=false;o.frustumCulled=false;o.renderOrder=30;for(const m of Array.isArray(o.material)?o.material:[o.material]){m.depthTest=false;m.depthWrite=false;}}});
  const group=new THREE.Group();group.name=`viewmodel:${id}`;group.add(gun);const pistol=['glock','usp','deagle'].includes(id),pose=NPC_ARM_POSES[pistol?'pistol':id==='awp'?'sniper':id==='mp5'||id==='smg'?'smg':'rifle'];
  for(const [side,template] of this.arms){const arms=cloneSkeleton(template.getObjectByName('VM_Grip')??template) as THREE.Group;arms.name=`arms:${side}`;arms.position.fromArray(pose.pos);arms.rotation.set(...pose.rot as [number,number,number]);arms.scale.setScalar(pose.scale);applyNPCArmGrip(arms,pistol?'pistol':'rifle');group.add(arms);}
  group.visible=false;this.camera.add(group);this.models.set(id,group);return group;
 }
 gunId(e:Entity){const loadout=e as Entity&{primary?:string;secondary?:string};return (e.weapon===0?loadout.primary:loadout.secondary)??GUNS[e.weapon].id;}
 held(e:Entity){const gun=this.proxies.get(this.gunId(e))?.clone(true);if(!gun)return null;gun.traverse(o=>{if(o instanceof THREE.Mesh){o.material=this.proxyMaterial;o.castShadow=false;}});return gun;}

 update(e:Entity|undefined,home:boolean,ads:boolean,time:number,reduced:boolean){const selected=e?this.model(this.gunId(e)):null;for(const m of this.models.values())m.visible=m===selected&&!home&&!!e&&e.hp>0;if(!selected||home||!e||e.hp<=0)return;
  const attack=(e as Entity&{attacking?:boolean}).attacking??e.team===1;for(const side of ['attack','defend']){const arms=selected.getObjectByName(`arms:${side}`);if(arms)arms.visible=side===(attack?'attack':'defend');}
  const pistol=e.weapon===1;selected.position.set(ads?0:pistol?.13:.16,pistol?-.19:-.245,pistol?-.36:-.43);selected.rotation.set(0,.025,-.01);
  if(!reduced)selected.position.y+=Math.sin(time*10)*Math.min(.003,Math.hypot(e.vx,e.vz)*.001);
  if(e.reload>0){const phase=(time%2.6)/2.6;selected.rotation.z=-.25*Math.sin(phase*Math.PI);selected.position.y-=.08;}
 }
 async warm(compile:(model:THREE.Object3D)=>Promise<unknown>){for(const model of this.models.values())await compile(model);}
 dispose(){if(this.disposed)return;this.disposed=true;const skeletons=new Set<THREE.Skeleton>();for(const m of this.models.values()){m.removeFromParent();m.traverse(o=>{if(o instanceof THREE.SkinnedMesh&&!skeletons.has(o.skeleton)){skeletons.add(o.skeleton);o.skeleton.dispose();}});}const seen=new Set();for(const arms of this.arms.values())disposeObject(arms,seen);for(const root of [...this.low.values(),...this.proxies.values()])disposeObject(root,seen);this.lowMaterial.dispose();this.proxyMaterial.dispose();this.low.clear();this.proxies.clear();this.models.clear();this.arms.clear();disposeWeaponTemplates(this.materials);}
}
