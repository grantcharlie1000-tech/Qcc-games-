import {describe,expect,test} from 'vitest';
import * as THREE from 'three';
import {WallStore,type PanelDefinition} from '../../../src/games/strongroom/walls';
import {WallRenderer} from '../../../src/games/strongroom/wall-renderer';
import {CUSTOMS_HOUSE} from '../../../src/games/strongroom/maps/customs-house';

const drywall:PanelDefinition={id:0,axis:'x',x:0,y:0,z:0,cols:4,rows:6,material:'drywall'};
const wood:PanelDefinition={id:1,axis:'z',x:4,y:.25,z:2,cols:2,rows:4,material:'wood',opening:'door'};
const meshCount=(renderer:WallRenderer)=>Object.values(renderer.meshes).filter(mesh=>mesh.count>0&&mesh.visible).length;
const clearUploads=(renderer:WallRenderer)=>{for(const mesh of Object.values(renderer.meshes)){mesh.instanceMatrix.clearUpdateRanges();mesh.instanceColor?.clearUpdateRanges();(mesh.geometry.getAttribute('aCrack') as THREE.BufferAttribute|undefined)?.clearUpdateRanges();}};

describe('preallocated instanced walls',()=>{
 test('creates six persistent batches and draws only visible material/state groups',()=>{
  const store=new WallStore([drywall,wood]),scene=new THREE.Scene(),renderer=new WallRenderer(scene,store,'potato');
  expect(Object.values(renderer.meshes)).toHaveLength(6);expect(scene.children).toHaveLength(6);
  expect(renderer.meshes.drywallSolid.count).toBe(24);expect(renderer.meshes.woodSolid.count).toBe(0);
  expect(renderer.meshes.drywallFrame.count).toBe(0);expect(meshCount(renderer)).toBe(1);
  expect(renderer.metrics.drawCalls).toBe(1);renderer.dispose();
 });
 test('moves shattered cells to one frame batch and gone cells to the debris pool',()=>{
  const store=new WallStore([drywall]),renderer=new WallRenderer(new THREE.Scene(),store,'low');
  store.damageCell(0,'rifle',180);renderer.sync();
  expect(renderer.meshes.drywallSolid.count).toBe(23);expect(renderer.meshes.drywallFrame.count).toBe(1);
  const frame=renderer.meshes.drywallFrame.geometry;
  expect((frame.index?.count??frame.getAttribute('position').count)/3).toBe(48);
  store.damageCell(0,'melee');renderer.sync();
  expect(renderer.meshes.drywallFrame.count).toBe(0);expect(renderer.metrics.activeDebris).toBe(2);
  renderer.update(2.01);expect(renderer.metrics.activeDebris).toBe(0);renderer.dispose();
 });
 test('updates dense instance slots correctly when a middle cell is removed',()=>{
  const store=new WallStore([{...drywall,cols:4,rows:1}]),renderer=new WallRenderer(new THREE.Scene(),store,'potato'),matrix=new THREE.Matrix4();
  store.damageCell(1,'melee');store.damageCell(1,'melee');renderer.sync();
  const mesh=renderer.meshes.drywallSolid;expect(mesh.count).toBe(3);
  const positions=[];for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);positions.push(matrix.elements[12]);}
  expect(positions.sort((a,b)=>a-b)).toEqual([.25,1.25,1.75]);
  store.damageCell(3,'rifle',100);renderer.sync();const color=new THREE.Color();mesh.getColorAt(1,color);
  expect(color.r).toBeLessThan(.7);renderer.dispose();
 });
 test('keeps adjacent cells at half-metre centres and orients z-axis wood correctly',()=>{
  const store=new WallStore([wood]),renderer=new WallRenderer(new THREE.Scene(),store,'potato'),matrix=new THREE.Matrix4();
  store.placeBarricade(1,2);renderer.sync();renderer.meshes.woodSolid.getMatrixAt(0,matrix);
  expect(new THREE.Vector3().setFromMatrixPosition(matrix)).toEqual(new THREE.Vector3(4,.5,2.25));
  const size=new THREE.Box3().setFromBufferAttribute(renderer.meshes.woodSolid.geometry.getAttribute('position') as THREE.BufferAttribute).applyMatrix4(matrix).getSize(new THREE.Vector3());
  expect(size.x).toBeCloseTo(.08);expect(size.y).toBeCloseTo(.5);expect(size.z).toBeCloseTo(.5);renderer.dispose();
 });
 test('uploads dirty component ranges using r180 BufferAttribute ranges',()=>{
  const store=new WallStore([drywall]),renderer=new WallRenderer(new THREE.Scene(),store,'medium');clearUploads(renderer);
  store.damageCell(6,'rifle',100);const result=renderer.sync(),mesh=renderer.meshes.drywallSolid;
  expect(result.cells).toBe(1);expect(mesh.instanceMatrix.updateRanges).toEqual([{start:96,count:16}]);
  expect(mesh.instanceColor?.updateRanges).toEqual([{start:18,count:3}]);
  expect((mesh.geometry.getAttribute('aCrack') as THREE.BufferAttribute).updateRanges).toEqual([{start:6,count:1}]);
  expect(renderer.sync().cells).toBe(0);renderer.dispose();
 });
 test('replicated wall changes reach rendering after network dirty packets were consumed',()=>{
  const store=new WallStore([drywall]),renderer=new WallRenderer(new THREE.Scene(),store,'potato');
  store.breach(0,1,'charge');store.drainPackets();expect(renderer.sync().cells).toBe(20);
  expect(renderer.meshes.drywallSolid.count).toBe(12);expect(renderer.metrics.activeDebris).toBe(12);renderer.dispose();
 });
 test('adds and removes plate instances when cutter state arrives',()=>{
  const store=new WallStore([drywall]),renderer=new WallRenderer(new THREE.Scene(),store,'potato');
  store.reinforce(0);renderer.sync();expect(renderer.meshes.plates.count).toBe(1);
  store.breach(0,2,'cutter');renderer.sync();expect(renderer.meshes.plates.count).toBe(0);expect(meshCount(renderer)).toBeLessThanOrEqual(6);renderer.dispose();
 });
 test.each([['potato',1,48],['low',2,96],['medium',4,192],['high',6,384]] as const)('pools %s debris at the tier count and particle cap', (tier,chunks,cap)=>{
  const store=new WallStore([drywall]),renderer=new WallRenderer(new THREE.Scene(),store,tier);
  store.damageCell(0,'melee');store.damageCell(0,'melee');renderer.sync();expect(renderer.metrics.activeDebris).toBe(chunks);
  for(let repeat=0;repeat<10;repeat++){
   store.reset(repeat+1);renderer.sync();store.breach(0,1,'charge');renderer.sync();
   expect(renderer.metrics.activeDebris).toBeLessThanOrEqual(cap);expect(renderer.metrics.capacity).toBe(cap);
  }
  renderer.dispose();
 });
 test.each([['potato',48],['low',96],['medium',192],['high',384]] as const)('bounds a simultaneous multi-panel debris burst on %s', (tier,cap)=>{
  const defs=Array.from({length:8},(_,id)=>({...drywall,id,x:id*3})),store=new WallStore(defs),renderer=new WallRenderer(new THREE.Scene(),store,tier);
  for(let id=0;id<8;id++)store.breach(id,1,'charge');renderer.sync();
  expect(renderer.metrics.activeDebris).toBe(cap);expect(renderer.meshes.debris.count).toBe(cap);
  renderer.update(2.01);expect(renderer.metrics.activeDebris).toBe(0);renderer.dispose();
 });
 test('suppresses breach debris under reduced motion',()=>{
  const store=new WallStore([drywall]),renderer=new WallRenderer(new THREE.Scene(),store,'high');renderer.reducedMotion=true;
  store.breach(0,1,'charge');renderer.sync();expect(renderer.metrics.activeDebris).toBe(0);expect(renderer.meshes.drywallSolid.count).toBe(12);renderer.dispose();
 });
 test('clears existing moving chunks when reduced motion is enabled',()=>{
  const store=new WallStore([drywall]),renderer=new WallRenderer(new THREE.Scene(),store,'low');
  store.breach(0,1,'charge');renderer.sync();expect(renderer.metrics.activeDebris).toBe(24);
  renderer.reducedMotion=true;renderer.update(.016);expect(renderer.metrics.activeDebris).toBe(0);renderer.dispose();
 });
 test('reuses every geometry, material, instance buffer and crack atlas during a breach',()=>{
  const store=new WallStore([drywall]),renderer=new WallRenderer(new THREE.Scene(),store,'medium');
  const before=Object.values(renderer.meshes).map(mesh=>[mesh.geometry,mesh.material,mesh.instanceMatrix.array,mesh.instanceColor?.array]);
  const atlas=renderer.crackAtlas;store.breach(0,2,'charge');renderer.sync();renderer.update(.1);
  expect(Object.values(renderer.meshes).map(mesh=>[mesh.geometry,mesh.material,mesh.instanceMatrix.array,mesh.instanceColor?.array])).toEqual(before);
  expect(renderer.crackAtlas).toBe(atlas);expect(atlas).toBeInstanceOf(THREE.DataTexture);renderer.dispose();
 });
 test('round resets clear existing debris without spawning chunks for newly empty openings',()=>{
  const store=new WallStore([drywall,wood]),renderer=new WallRenderer(new THREE.Scene(),store,'potato');
  store.placeBarricade(1,2);store.breach(0,1,'charge');renderer.sync();expect(renderer.metrics.activeDebris).toBe(12);
  store.reset(1);renderer.sync();expect(renderer.metrics.activeDebris).toBe(0);expect(renderer.meshes.woodSolid.count).toBe(0);
  expect(renderer.meshes.drywallSolid.count).toBe(24);renderer.dispose();
 });
 test('disposes owned materials and geometry while preserving the material source and existing scene objects',()=>{
  const source=new THREE.MeshLambertMaterial(),scene=new THREE.Scene(),light=new THREE.AmbientLight();scene.add(light);let sourceDisposed=false;
  source.addEventListener('dispose',()=>sourceDisposed=true);
  const renderer=new WallRenderer(scene,new WallStore([drywall]),'medium',{get:()=>source});let atlasDisposed=false;
  renderer.crackAtlas?.addEventListener('dispose',()=>atlasDisposed=true);
  const geometries=new Set(Object.values(renderer.meshes).map(mesh=>mesh.geometry));let disposedGeometry=0;
  for(const geometry of geometries)geometry.addEventListener('dispose',()=>disposedGeometry++);
  const materials=new Set(Object.values(renderer.meshes).flatMap(mesh=>Array.isArray(mesh.material)?mesh.material:[mesh.material]));let disposedMaterials=0;
  for(const material of materials)material.addEventListener('dispose',()=>disposedMaterials++);
  renderer.dispose();renderer.dispose();expect(scene.children).toEqual([light]);expect(sourceDisposed).toBe(false);
  expect(disposedGeometry).toBe(geometries.size);expect(disposedMaterials).toBe(materials.size);expect(atlasDisposed).toBe(true);source.dispose();
 });
});

test('measures a preallocated Customs House breach and dirty renderer update without drawing',()=>{
 const store=new WallStore(CUSTOMS_HOUSE.panels),renderer=new WallRenderer(new THREE.Scene(),store,'potato');
 const target=store.panels.find(p=>p.material==='drywall'&&p.cols===4&&p.rows===6)!,samples:number[]=[];
 for(let sample=0;sample<150;sample++){
  store.reset(sample+1);renderer.sync();clearUploads(renderer);const start=performance.now();
  store.breach(target.id,2,'charge');renderer.sync();const elapsed=performance.now()-start;
  if(sample>=30)samples.push(elapsed);
 }
 samples.sort((a,b)=>a-b);expect(renderer.metrics.activeDebris).toBe(12);expect(renderer.metrics.drawCalls).toBeLessThanOrEqual(6);
 console.info(`Strongroom wall renderer: breach + dirty sync mean ${(samples.reduce((a,b)=>a+b,0)/samples.length).toFixed(3)} ms, p95 ${samples[Math.floor(samples.length*.95)].toFixed(3)} ms (Node, no GPU draw; browser CPU test is separate).`);
 renderer.dispose();
});
