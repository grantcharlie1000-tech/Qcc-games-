import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {modelLoader} from './model-loader';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
// @ts-expect-error -- original designer's JavaScript kit, bundled with provenance.
import {bodyFor,buildKit,mergeKitIntoBody,operatorMaterial,ENGINE_BODY_HEIGHT} from './engine/gfx/operators/attachments.js';
// @ts-expect-error -- licensed resource disposer.
import {disposeObject} from './engine/resources.js';
import {QUALITY,type Tier} from './quality';
import type {Entity} from './sim';

type Body='ct'|'t';type Side='attack'|'defend';type Op='cinder'|'wren'|'hush'|'latch'|'cadet';
export interface OperatorAvatar{root:THREE.Group;meshes:THREE.SkinnedMesh[];mixer:THREE.AnimationMixer;clips:Map<string,THREE.AnimationClip>;current:string;at:number;key:string;held?:THREE.Group;gun?:string}
const sideOf=(e:Entity):Side=>((e as Entity&{attacking?:boolean}).attacking??e.team===1)?'attack':'defend';
const opOf=(e:Entity):Op=>(e as Entity&{operator?:Op}).operator??'cadet';
/** Designer outputs are already merged. Never merge their two LOD meshes together. */
export class Operators{
 private templates=new Map<Body,GLTF>();private geometries=new Map<string,THREE.BufferGeometry>();private materials=new Map<string,THREE.Material>();private disposed=false;
 constructor(private tier:Tier){}
 async load(){
  const loader=modelLoader();
  await Promise.all((['ct','t'] as Body[]).map(async body=>{const g=await loader.loadAsync(`${import.meta.env.BASE_URL}game-assets/strongroom/models/soldier_${body}.glb`);if(this.disposed){disposeObject(g.scene);return;}g.scene.updateMatrixWorld(true);this.templates.set(body,g);}));
  if(this.disposed)return;
  for(const side of ['attack','defend'] as Side[])for(const tint of ['ally','enemy'])this.materials.set(`${side}/${tint}`,operatorMaterial({side,tint,lambert:this.tier==='potato'||this.tier==='low'}));
  for(const [op,body] of [['cinder','ct'],['wren','t'],['hush','ct'],['latch','t'],['cadet','ct'],['cadet','t']] as [Op,Body][]){const template=this.templates.get(body)!;
   for(const lod of [0,1]){const mesh=template.scene.getObjectByName(`Body_LOD${lod}`) as THREE.SkinnedMesh,kit=buildKit(op,{body,lod,skeleton:mesh.skeleton});this.geometries.set(`${op}/${body}/${lod}`,mergeKitIntoBody(mesh.geometry,kit.geometry));kit.geometry.dispose();}
  }
 }
 key(e:Entity){return `${opOf(e)}/${bodyFor(opOf(e),sideOf(e))}`;}
 create(e:Entity):OperatorAvatar|null{
  const op=opOf(e),body=bodyFor(op,sideOf(e)) as Body,template=this.templates.get(body);if(!template)return null;
  const root=cloneSkeleton(template.scene) as THREE.Group;root.scale.setScalar(1.83/ENGINE_BODY_HEIGHT[body]);const meshes:THREE.SkinnedMesh[]=[];
  root.traverse(o=>{if(o instanceof THREE.SkinnedMesh){const lod=o.name==='Body_LOD0'?0:1;o.geometry=this.geometries.get(`${op}/${body}/${lod}`)!;o.material=this.materials.get(`${sideOf(e)}/enemy`)!;o.castShadow=!!QUALITY[this.tier].shadows;o.receiveShadow=true;o.frustumCulled=true;o.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,1.1,0),2.8);meshes[lod]=o;}});
  return {root,meshes,mixer:new THREE.AnimationMixer(root),clips:new Map(template.animations.map(c=>[c.name,c])),current:'',at:0,key:this.key(e)};
 }
 style(a:OperatorAvatar,e:Entity,viewer:Entity|undefined,distance:number){const lod=this.tier==='potato'||distance>=QUALITY[this.tier].lod?1:0,material=this.materials.get(`${sideOf(e)}/${viewer?.team===e.team?'ally':'enemy'}`)!;for(let i=0;i<a.meshes.length;i++){a.meshes[i].visible=i===lod;a.meshes[i].material=material;}a.root.userData.lod=lod;a.root.userData.operator=opOf(e);a.root.userData.side=sideOf(e);}
 warmRoots(){const roots:THREE.Group[]=[];const template=this.templates.get('ct');if(template)for(const material of this.materials.values()){const root=cloneSkeleton(template.scene) as THREE.Group;root.traverse(o=>{if(o instanceof THREE.SkinnedMesh){o.visible=true;o.material=material;}});roots.push(root);}return roots;}
 release(a:OperatorAvatar){a.mixer.stopAllAction();a.mixer.uncacheRoot(a.root);a.root.removeFromParent();const seen=new Set<THREE.Skeleton>();a.root.traverse(o=>{if(o instanceof THREE.SkinnedMesh&&!seen.has(o.skeleton)){seen.add(o.skeleton);o.skeleton.dispose();}});}
 dispose(){if(this.disposed)return;this.disposed=true;const seen=new Set();for(const g of this.templates.values())disposeObject(g.scene,seen);for(const geometry of this.geometries.values())geometry.dispose();for(const material of this.materials.values()){const m=material as THREE.MeshStandardMaterial;m.map?.dispose();m.emissiveMap?.dispose();material.dispose();}this.templates.clear();this.geometries.clear();this.materials.clear();}
}
