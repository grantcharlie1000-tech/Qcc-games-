import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
// @ts-expect-error -- unchanged Tiny Strike grip poses, ISC.
import {NPC_ARM_POSES,applyNPCArmGrip} from './engine/viewmodel-arms.js';
// @ts-expect-error -- licensed resource disposer.
import {disposeObject} from './engine/resources.js';
import type {Entity} from './sim';
import type {Tier} from './quality';
/** Original low-poly Tiny Strike weapons and the existing authored arm. Character processing stays outside this round. */
export class WeaponView{
 private models:THREE.Group[]=[];private disposed=false;
 constructor(private camera:THREE.Camera,private tier:Tier){}
 async load(){
  const loader=new GLTFLoader(),base=`${import.meta.env.BASE_URL}game-assets/strongroom/models/viewmodels/`;
  const assets=await Promise.all(['m4a1','usp','npc-arms-ct'].map(id=>loader.loadAsync(base+id+'.glb')));
  if(this.disposed){for(const asset of assets)disposeObject(asset.scene);return;}
  for(let index=0;index<2;index++){
   const group=new THREE.Group(),weapon=assets[index].scene,arms=cloneSkeleton(assets[2].scene.getObjectByName('VM_Grip')??assets[2].scene),pose=NPC_ARM_POSES[index===0?'rifle':'pistol'];
   arms.position.fromArray(pose.pos);arms.rotation.set(...pose.rot as [number,number,number]);arms.scale.setScalar(pose.scale);applyNPCArmGrip(arms,index===0?'rifle':'pistol');
   if(index===1)weapon.scale.setScalar(1.1);group.add(weapon,arms);group.visible=false;
   group.traverse(o=>{if(o instanceof THREE.Mesh){const source=Array.isArray(o.material)?o.material:[o.material];const styled=source.map(m=>{const old=m as THREE.MeshStandardMaterial;const material=this.tier==='potato'||this.tier==='low'?new THREE.MeshLambertMaterial({color:old.color,map:old.map}):old.clone();material.depthTest=false;material.depthWrite=false;return material;});o.material=Array.isArray(o.material)?styled:styled[0];o.castShadow=false;o.receiveShadow=false;o.frustumCulled=false;o.renderOrder=30;}});
   this.camera.add(group);this.models.push(group);
  }
  disposeObject(assets[2].scene);
 }
 update(e:Entity|undefined,home:boolean,ads:boolean,time:number,reduced:boolean){for(let i=0;i<this.models.length;i++){const m=this.models[i];m.visible=!home&&!!e&&e.hp>0&&i===e.weapon;if(!m.visible)continue;m.position.set(ads?0:i===0?.15:.14,i===0?-.27:-.2,i===0?-.47:-.36);m.rotation.set(0,.04,-.01);if(!reduced)m.position.y+=Math.sin(time*10)*Math.min(.004,Math.hypot(e!.vx,e!.vz)*.001);}}
 dispose(){if(this.disposed)return;this.disposed=true;const seen=new Set();for(const m of this.models){this.camera.remove(m);disposeObject(m,seen);}this.models=[];}
}
