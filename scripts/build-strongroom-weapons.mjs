/** Offline LODs of the licensed Tiny Strike procedural gun builders. No runtime simplifier/Wasm. */
import*as THREE from'three';
import{mergeGeometries,mergeVertices}from'three/addons/utils/BufferGeometryUtils.js';
import{GLTFExporter}from'three/addons/exporters/GLTFExporter.js';
import{MeshoptSimplifier as S}from'meshoptimizer/meshopt_simplifier.module.js';
import{mkdir,writeFile}from'node:fs/promises';
import{weaponInstance,disposeWeaponTemplates}from'../src/games/strongroom/engine/gfx/weapons/registry.js';
await S.ready;S.useExperimentalFeatures=true;
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}};
const materials=[];const library={get:(name,options={})=>{const m=new THREE.MeshStandardMaterial({color:options.tint??0x535e69,roughness:.85,metalness:0});materials.push(m);return m;}};
const folder='public/game-assets/strongroom/models/weapons';await mkdir(folder,{recursive:true});
for(const id of['ak47','m4a1','mp5','smg','awp','glock','usp','deagle']){
 const source=weaponInstance(id,library,{viewmodel:false});source.updateMatrixWorld(true);const parts=[];
 source.traverse(o=>{if(!o.isMesh)return;const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld),count=geometry.attributes.position.count,color=new Float32Array(count*3);for(let n=0;n<count;n++){color[n*3]=o.material.color.r;color[n*3+1]=o.material.color.g;color[n*3+2]=o.material.color.b;}for(const attr of Object.keys(geometry.attributes))if(attr!=='position')geometry.deleteAttribute(attr);geometry.setAttribute('color',new THREE.BufferAttribute(color,3));parts.push(geometry);});
 const merged=mergeGeometries(parts),base=mergeVertices(merged,1e-5);for(const p of parts)p.dispose();merged.dispose();
 for(const[kind,budget]of[['low',2200],['held',250]]){
  const[index,error]=S.simplify(new Uint32Array(base.index.array),base.attributes.position.array,3,budget*3,.25,['Sparse','Prune']);if(index.length/3>budget||index.length<30)throw Error(`${id}-${kind}: invalid triangle budget ${index.length/3}`);
  const[remap,vertices]=S.compactMesh(index),geometry=new THREE.BufferGeometry();
  for(const name of['position','color']){const src=base.attributes[name],out=new Float32Array(vertices*3);for(let n=0;n<remap.length;n++)if(remap[n]!==0xffffffff)for(let k=0;k<3;k++)out[remap[n]*3+k]=src.array[n*3+k];geometry.setAttribute(name,new THREE.BufferAttribute(out,3));}
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(index),1));geometry.computeVertexNormals();const uv=new Float32Array(vertices*2),pos=geometry.attributes.position,normal=geometry.attributes.normal;for(let n=0;n<vertices;n++){const x=Math.abs(normal.getX(n)),y=Math.abs(normal.getY(n));uv[n*2]=(y>.5?pos.getX(n):x>.5?pos.getZ(n):pos.getX(n))*8;uv[n*2+1]=(y>.5?pos.getZ(n):pos.getY(n))*8;}geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85,metalness:0}),mesh=new THREE.Mesh(geometry,material);mesh.name=`${id}-${kind}`;mesh.userData={source:'Tiny Strike procedural weapon builders / Claude-of-Duty gfx',license:'MIT',triangles:index.length/3,simplificationError:error};
  const output=await new GLTFExporter().parseAsync(mesh,{binary:true});await writeFile(`${folder}/${id}-${kind}.glb`,new Uint8Array(output));console.log(`${id}-${kind}: ${index.length/3} tris / ${output.byteLength} bytes`);geometry.dispose();material.dispose();
 }base.dispose();
}
disposeWeaponTemplates(library);for(const m of materials)m.dispose();
