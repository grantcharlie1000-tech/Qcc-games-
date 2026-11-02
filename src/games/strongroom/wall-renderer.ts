import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {QUALITY,type Tier} from './quality';
import {CELL_SIZE,PANEL_FLAG,WallStore,type WallPanel} from './walls';

export interface WallMaterialSource{get(name:string,options?:Record<string,unknown>):THREE.Material}
export interface WallRenderMetrics{drawCalls:number;activeDebris:number;capacity:number;lastSyncMs:number;dirtyCells:number}
export interface WallSyncResult{cells:number;panels:number;ms:number}
type BatchName='drywallSolid'|'drywallFrame'|'woodSolid'|'woodFrame'|'plates'|'debris';
interface Batch{mesh:THREE.InstancedMesh;keys:Int32Array;dirty:Set<number>;crack:THREE.InstancedBufferAttribute|null}

function frameGeometry(){
 // A square aperture occupies 60% of the cell area; bars meet without overlapping.
 const border=(CELL_SIZE-Math.sqrt(.6)*CELL_SIZE)/2,inner=CELL_SIZE-2*border;
 const parts=[
  new THREE.BoxGeometry(CELL_SIZE,border,1).translate(0,(CELL_SIZE-border)/2,0),
  new THREE.BoxGeometry(CELL_SIZE,border,1).translate(0,-(CELL_SIZE-border)/2,0),
  new THREE.BoxGeometry(border,inner,1).translate((CELL_SIZE-border)/2,0,0),
  new THREE.BoxGeometry(border,inner,1).translate(-(CELL_SIZE-border)/2,0,0),
 ];
 const geometry=mergeGeometries(parts)!;for(const part of parts)part.dispose();return geometry;
}

/** A small deterministic four-variant crack mask, allocated once at scene construction. */
function crackAtlas(){
 const tile=32,size=tile*2,data=new Uint8Array(size*size*4);let seed=0x7137;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let variant=0;variant<4;variant++){
  const ox=(variant%2)*tile,oy=Math.floor(variant/2)*tile;
  const pixel=(x:number,y:number,strength:number)=>{
   if(x<1||x>=tile-1||y<1||y>=tile-1)return;
   const i=((oy+y)*size+ox+x)*4;data[i]=Math.max(data[i],strength);data[i+1]=data[i+2]=data[i];data[i+3]=255;
  };
  for(let branch=0;branch<5;branch++){
   const angle=branch*Math.PI*2/5+random()*.5;let x=15,y=15;
   for(let step=0;step<17;step++){
    x+=Math.cos(angle)+(random()-.5)*1.3;y+=Math.sin(angle)+(random()-.5)*1.3;
    const px=Math.round(x),py=Math.round(y);pixel(px,py,255);pixel(px+1,py,65);pixel(px,py+1,65);
   }
  }
 }
 const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
 texture.name='sr-wall-crack-atlas';texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;return texture;
}

/** Six persistent GPU batches: five wall groups and one bounded debris pool. */
export class WallRenderer{
 readonly meshes:Record<BatchName,THREE.InstancedMesh>;
 readonly metrics:WallRenderMetrics;
 readonly crackAtlas:THREE.DataTexture|null;
 reducedMotion=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 private batches:Batch[]=[];
 private slots:Int16Array;
 private kinds:Int8Array;
 private plateSlots:Int16Array;
 private cellPanels:Uint8Array;
 private lastStates:Uint8Array;
 private revision=-1;
 private disposed=false;
 private matrix=new THREE.Matrix4();
 private zero=new THREE.Matrix4().makeScale(0,0,0);
 private position=new THREE.Vector3();
 private scale=new THREE.Vector3();
 private rotation=new THREE.Quaternion();
 private axis=new THREE.Vector3(0,1,0);
 private color=new THREE.Color();
 private materials=new Set<THREE.Material>();
 private debrisLife:Float32Array;
 private debrisPosition:Float32Array;
 private debrisVelocity:Float32Array;
 private debrisFloor:Float32Array;
 private debrisSize:Float32Array;
 private debrisSpin:Float32Array;
 private debrisBounced:Uint8Array;
 private replaceDebris=0;

 constructor(private scene:THREE.Scene,readonly store:WallStore,readonly tier:Tier,source?:WallMaterialSource){
  const cap=QUALITY[tier].particles;this.metrics={drawCalls:0,activeDebris:0,capacity:cap,lastSyncMs:0,dirtyCells:0};
  this.crackAtlas=tier==='medium'||tier==='high'?crackAtlas():null;
  this.slots=new Int16Array(store.cellCount).fill(-1);this.kinds=new Int8Array(store.cellCount).fill(-1);
  this.plateSlots=new Int16Array(store.panels.length).fill(-1);this.cellPanels=new Uint8Array(store.cellCount);this.lastStates=store.states.slice();
  let drywall=0,wood=0;for(const panel of store.panels){if(panel.material==='drywall')drywall+=panel.cellCount;else wood+=panel.cellCount;this.cellPanels.fill(panel.index,panel.firstCell,panel.firstCell+panel.cellCount);}
  const plaster=this.makeMaterial('plaster',0xc7c5b9,source,true),timber=this.makeMaterial('wood',0x95724b,source,true),steel=this.makeMaterial('metal_brushed',0x77858b,source,false);
  const debris=new THREE.MeshLambertMaterial({color:0xffffff});this.materials.add(debris);
  const names:BatchName[]=['drywallSolid','drywallFrame','woodSolid','woodFrame','plates','debris'];
  const geometries=[new THREE.BoxGeometry(CELL_SIZE,CELL_SIZE,1),frameGeometry(),new THREE.BoxGeometry(CELL_SIZE,CELL_SIZE,1),frameGeometry(),new THREE.BoxGeometry(1,1,1),new THREE.BoxGeometry(1,1,1)];
  const counts=[drywall,drywall,wood,wood,store.panels.length,cap],mats=[plaster,plaster,timber,timber,steel,debris];
  this.meshes={} as Record<BatchName,THREE.InstancedMesh>;
  for(let i=0;i<names.length;i++){
   const capacity=Math.max(1,counts[i]),geometry=geometries[i],mesh=new THREE.InstancedMesh(geometry,mats[i],capacity);
   mesh.name=`sr-walls-${names[i]}`;mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=!!QUALITY[tier].shadows&&i<5;mesh.receiveShadow=i<5;
   mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(capacity*3).fill(1),3).setUsage(THREE.DynamicDrawUsage);
   const crack=i<4&&this.crackAtlas?new THREE.InstancedBufferAttribute(new Float32Array(capacity),1).setUsage(THREE.DynamicDrawUsage):null;
   if(crack)geometry.setAttribute('aCrack',crack);
   for(let slot=0;slot<capacity;slot++)mesh.setMatrixAt(slot,this.zero);
   this.batches.push({mesh,keys:new Int32Array(capacity).fill(-1),dirty:new Set(),crack});this.meshes[names[i]]=mesh;scene.add(mesh);
  }
  this.debrisLife=new Float32Array(cap);this.debrisPosition=new Float32Array(cap*3);this.debrisVelocity=new Float32Array(cap*3);this.debrisFloor=new Float32Array(cap);this.debrisSize=new Float32Array(cap);this.debrisSpin=new Float32Array(cap);this.debrisBounced=new Uint8Array(cap);
  this.sync();
 }

 private makeMaterial(name:string,color:number,source:WallMaterialSource|undefined,cracks:boolean){
  const original=source?.get(name,{scale:2,uvMode:'planar',vertexMasks:false,tint:color});
  const material=original?original.clone():(this.tier==='potato'||this.tier==='low'?new THREE.MeshLambertMaterial({color}):new THREE.MeshStandardMaterial({color,roughness:.9,metalness:name==='metal_brushed'?.65:0}));
  delete material.userData.owShared;
  const compile=original?.onBeforeCompile,key=original?.customProgramCacheKey.call(original)??name,atlas=cracks?this.crackAtlas:null;
  material.onBeforeCompile=(shader,renderer)=>{
   compile?.call(original!,shader,renderer);
   shader.vertexShader='varying vec3 vSrWallWorld;varying vec3 vSrWallNormal;\n'+(atlas?'attribute float aCrack;varying float vSrCrack;varying vec2 vSrCellUv;\n':'')+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
    mat4 srWallModel=modelMatrix;
    #ifdef USE_INSTANCING
      srWallModel=srWallModel*instanceMatrix;
    #endif
    vSrWallWorld=(srWallModel*vec4(transformed,1.0)).xyz;
    vSrWallNormal=normalize(mat3(srWallModel)*objectNormal);
    ${atlas?'vSrCrack=aCrack;vSrCellUv=position.xy*2.0+.5;':''}`);
   shader.fragmentShader='varying vec3 vSrWallWorld;varying vec3 vSrWallNormal;\n'+(atlas?'uniform sampler2D srCracks;varying float vSrCrack;varying vec2 vSrCellUv;\n':'')+shader.fragmentShader;
   // Preserve vendor PBR projection and re-enable instance tint (its vertex-mask override removes it).
   shader.fragmentShader=shader.fragmentShader.replace('// vertex colours are masks here, see OW_VCOL_MASKS','#include <color_fragment>');
   // Stock materials also get continuous wall-plane UVs, and the cheap source's rotated normal is corrected.
   shader.fragmentShader=shader.fragmentShader.replace('vec3 srN=abs(srNormal)','vec3 srN=abs(vSrWallNormal)').replace('#include <map_fragment>',`#ifdef USE_MAP
     vec3 srWallN=abs(vSrWallNormal);
     vec2 srWallUv=(srWallN.y>.5?vSrWallWorld.xz:srWallN.x>.5?vSrWallWorld.zy:vSrWallWorld.xy)*.5;
     diffuseColor*=texture2D(map,srWallUv);
    #endif`);
   if(atlas){
    shader.uniforms.srCracks={value:atlas};
    shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
     float srVariant=max(0.0,floor(vSrCrack-.5));
     vec2 srTile=vec2(mod(srVariant,2.0),floor(srVariant/2.0));
     float srMask=texture2D(srCracks,(srTile+clamp(vSrCellUv,.02,.98))*.5).r*step(.5,vSrCrack);
     diffuseColor.rgb*=1.0-srMask*.76;`);
   }
  };
  material.customProgramCacheKey=()=>`${key}:sr-walls:${atlas?'cracks':'tint'}`;this.materials.add(material);return material;
 }
 /** Apply model revisions. Packet draining does not affect this cursor. */
 sync():WallSyncResult{
  if(this.disposed)return{cells:0,panels:0,ms:0};
  const start=performance.now(),changes=this.store.changesSince(this.revision);
  if(changes.reset)this.clearDebris();
  for(const index of changes.cells){
   const state=this.store.states[index],panel=this.store.panels[this.cellPanels[index]];
   if(state===3&&this.lastStates[index]!==3&&!changes.reset&&!this.reducedMotion)this.spawnDebris(index,panel);
   this.updateCell(index,panel,state);this.lastStates[index]=state;
  }
  for(const index of changes.panels)this.updatePlate(this.store.panels[index]);
  for(const batch of this.batches)this.flush(batch);
  this.revision=changes.revision;const ms=performance.now()-start;this.metrics.lastSyncMs=ms;this.metrics.dirtyCells=changes.cells.length;this.refreshMetrics();
  return{cells:changes.cells.length,panels:changes.panels.length,ms};
 }
 private updateCell(index:number,panel:WallPanel,state:number){
  const kind=state===3?-1:(panel.material==='drywall'?0:2)+(state===2?1:0),old=this.kinds[index];
  if(old!==kind&&old>=0){this.remove(this.batches[old],this.slots[index],this.slots);this.slots[index]=-1;}
  this.kinds[index]=kind;if(kind<0)return;
  const batch=this.batches[kind];let slot=this.slots[index];
  if(slot<0){slot=batch.mesh.count++;batch.keys[slot]=index;this.slots[index]=slot;}
  const point=this.store.cellCenter(index);this.position.set(point.x,point.y,point.z);this.scale.set(1,1,panel.thickness);this.rotation.setFromAxisAngle(this.axis,panel.axis==='z'?-Math.PI/2:0);
  this.matrix.compose(this.position,this.rotation,this.scale);batch.mesh.setMatrixAt(slot,this.matrix);
  const jitter=.96+((Math.imul(index+1,0x9e3779b1)>>>0)&255)/255*.08,shade=jitter*(state===1?.62:state===2?.84:1);
  this.color.setRGB(shade,shade,shade);batch.mesh.setColorAt(slot,this.color);
  if(batch.crack)batch.crack.setX(slot,state===1?1+(index%4):0);batch.dirty.add(slot);
 }
 private updatePlate(panel:WallPanel){
  const batch=this.batches[4];let slot=this.plateSlots[panel.index];
  if(!(panel.flags&PANEL_FLAG.REINFORCED)){
   if(slot>=0){this.remove(batch,slot,this.plateSlots);this.plateSlots[panel.index]=-1;}return;
  }
  if(slot<0){slot=batch.mesh.count++;batch.keys[slot]=panel.index;this.plateSlots[panel.index]=slot;}
  const half=panel.cols*CELL_SIZE/2,offset=panel.thickness/2+.025;
  this.position.set(panel.x+(panel.axis==='x'?half:offset),panel.y+panel.rows*CELL_SIZE/2,panel.z+(panel.axis==='z'?half:offset));
  this.rotation.setFromAxisAngle(this.axis,panel.axis==='z'?-Math.PI/2:0);this.scale.set(panel.cols*CELL_SIZE,panel.rows*CELL_SIZE,.045);this.matrix.compose(this.position,this.rotation,this.scale);
  batch.mesh.setMatrixAt(slot,this.matrix);this.color.setRGB(1,1,1);batch.mesh.setColorAt(slot,this.color);batch.dirty.add(slot);
 }
 /** Swap-delete keeps draw counts equal to visible cells; preallocated buffers never change size. */
 private remove(batch:Batch,slot:number,slots:Int16Array){
  const last=--batch.mesh.count;
  if(slot!==last){
   const key=batch.keys[last];batch.keys[slot]=key;slots[key]=slot;
   batch.mesh.instanceMatrix.array.copyWithin(slot*16,last*16,last*16+16);
   batch.mesh.instanceColor!.array.copyWithin(slot*3,last*3,last*3+3);
   if(batch.crack)batch.crack.setX(slot,batch.crack.getX(last));batch.dirty.add(slot);
  }
  batch.keys[last]=-1;batch.mesh.setMatrixAt(last,this.zero);if(batch.crack)batch.crack.setX(last,0);batch.dirty.add(last);
 }
 private flush(batch:Batch){
  if(!batch.dirty.size)return;
  const sorted=[...batch.dirty].sort((a,b)=>a-b);let start=sorted[0],end=start;
  const range=()=>{
   batch.mesh.instanceMatrix.addUpdateRange(start*16,(end-start+1)*16);batch.mesh.instanceColor!.addUpdateRange(start*3,(end-start+1)*3);batch.crack?.addUpdateRange(start,end-start+1);
  };
  for(let i=1;i<sorted.length;i++){if(sorted[i]===end+1)end=sorted[i];else{range();start=end=sorted[i];}}range();
  batch.mesh.instanceMatrix.needsUpdate=true;batch.mesh.instanceColor!.needsUpdate=true;if(batch.crack)batch.crack.needsUpdate=true;batch.dirty.clear();
 }
 private spawnDebris(index:number,panel:WallPanel){
  const count=QUALITY[this.tier].debris,point=this.store.cellCenter(index),batch=this.batches[5],cap=this.metrics.capacity;
  for(let chunk=0;chunk<count;chunk++){
   const slot=batch.mesh.count<cap?batch.mesh.count++:this.replaceDebris++%cap,seed=(Math.imul(index+1,73856093)^Math.imul(chunk+1,19349663))>>>0;
   const angle=(seed&1023)/1024*Math.PI*2,speed=.6+((seed>>>10)&255)/255*1.3,at=slot*3;
   this.debrisLife[slot]=2;this.debrisPosition[at]=point.x;this.debrisPosition[at+1]=point.y;this.debrisPosition[at+2]=point.z;
   this.debrisVelocity[at]=Math.cos(angle)*speed;this.debrisVelocity[at+1]=1+((seed>>>18)&31)/31*1.5;this.debrisVelocity[at+2]=Math.sin(angle)*speed;
   this.debrisFloor[slot]=panel.y+.035;this.debrisSize[slot]=.035+(seed&15)/15*.045;this.debrisSpin[slot]=(seed&255)/255*Math.PI*2;this.debrisBounced[slot]=0;
   this.color.set(panel.material==='wood'?0x9c7b54:0xc9c5b7);batch.mesh.setColorAt(slot,this.color);this.writeDebris(slot);batch.dirty.add(slot);
  }
 }
 private writeDebris(slot:number){
  const at=slot*3,size=this.debrisSize[slot];this.position.fromArray(this.debrisPosition,at);this.scale.set(size,size*.7,size*1.3);this.rotation.setFromAxisAngle(this.axis,this.debrisSpin[slot]);
  this.matrix.compose(this.position,this.rotation,this.scale);this.batches[5].mesh.setMatrixAt(slot,this.matrix);
 }
 private clearDebris(){
  const batch=this.batches[5];if(!batch)return;
  for(let slot=0;slot<batch.mesh.count;slot++){batch.mesh.setMatrixAt(slot,this.zero);batch.dirty.add(slot);}
  batch.mesh.count=0;this.replaceDebris=0;
 }
 /** Advance pooled chunks only; call sync() once before drawing to apply host changes. */
 update(dt:number){
  if(this.disposed||!Number.isFinite(dt)||dt<=0)return;
  const batch=this.batches[5],step=Math.min(.1,dt);
  if(this.reducedMotion){this.clearDebris();this.flush(batch);this.refreshMetrics();return;}
  for(let slot=0;slot<batch.mesh.count;){
   this.debrisLife[slot]-=dt;
   if(this.debrisLife[slot]<=0){
    const last=--batch.mesh.count;
    if(last!==slot){
     for(const values of [this.debrisLife,this.debrisFloor,this.debrisSize,this.debrisSpin,this.debrisBounced])values[slot]=values[last];
     this.debrisPosition.copyWithin(slot*3,last*3,last*3+3);this.debrisVelocity.copyWithin(slot*3,last*3,last*3+3);batch.mesh.instanceColor!.array.copyWithin(slot*3,last*3,last*3+3);
    }
    batch.mesh.setMatrixAt(last,this.zero);batch.dirty.add(last);continue;
   }
   const at=slot*3;this.debrisVelocity[at+1]-=9.8*step;
   for(let axis=0;axis<3;axis++)this.debrisPosition[at+axis]+=this.debrisVelocity[at+axis]*step;
   if(this.debrisPosition[at+1]<this.debrisFloor[slot]){
    this.debrisPosition[at+1]=this.debrisFloor[slot];this.debrisVelocity[at+1]=this.debrisBounced[slot]?0:Math.abs(this.debrisVelocity[at+1])*.25;
    this.debrisVelocity[at]*=.55;this.debrisVelocity[at+2]*=.55;this.debrisBounced[slot]=1;
   }
   this.debrisSpin[slot]+=step*2;this.writeDebris(slot);batch.dirty.add(slot);slot++;
  }
  this.flush(batch);this.refreshMetrics();
 }
 private refreshMetrics(){this.metrics.activeDebris=this.batches[5].mesh.count;this.metrics.drawCalls=this.batches.filter(batch=>batch.mesh.count>0&&batch.mesh.visible).length;}
 dispose(){
  if(this.disposed)return;this.disposed=true;
  for(const batch of this.batches){this.scene.remove(batch.mesh);batch.mesh.dispose();batch.mesh.geometry.dispose();}
  for(const material of this.materials)material.dispose();this.crackAtlas?.dispose();this.materials.clear();this.metrics.activeDebris=0;this.metrics.drawCalls=0;
 }
}
