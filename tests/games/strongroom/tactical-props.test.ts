import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {TacticalProps} from '../../../src/games/strongroom/tactical-props';
import {CUSTOMS_HOUSE} from '../../../src/games/strongroom/maps/customs-house';
import {Simulation,type Entity} from '../../../src/games/strongroom/sim';
const panel={id:7,axis:'x' as const,x:0,y:0,z:0,cols:4,rows:6,material:'drywall' as const};
function fixture(sourceTexture?:THREE.Texture){
 let blocked=false;const source=new THREE.MeshLambertMaterial({color:0x8899aa,map:sourceTexture??null});
 const world={spawns:[[0,0,0],[0,0,4]] as [number,number,number][],panels:[panel],blocked:()=>blocked,collide:(e:Entity)=>({x:e.x,y:e.y,z:e.z,ground:true})};
 const state=new Simulation(world,[{seat:0,name:'Attacker',team:1,bot:false},{seat:1,name:'Defender',team:0,bot:false}],2);state.phase='action';state.round=1;
 Object.assign(state.entities[0],{x:2,y:.03,z:3,yaw:0,attacking:true});Object.assign(state.entities[1],{x:4,y:.03,z:4,attacking:false});
 state.objective={site:'A',revealed:false,state:'carried',carrier:0,position:{x:2,y:.03,z:3},interactionSeat:null,interaction:null,progress:0};
 const scene=new THREE.Scene(),props=new TacticalProps(scene,{get:()=>source},'potato',CUSTOMS_HOUSE);
 return{state,scene,source,props,blocked:(value:boolean)=>blocked=value,dispose:()=>{props.dispose();source.dispose();}};
}
const led=(props:TacticalProps)=>{const c=new THREE.Color();props.deviceMeshes.led.getColorAt(0,c);return c.r;};
describe('bounded Customs House dressing',()=>{
 it('uses at most five static batches and three pooled device batches without adding lights or shadow casters',()=>{
  const f=fixture();expect(f.props.staticMeshes.length).toBe(5);expect(Object.values(f.props.deviceMeshes)).toHaveLength(3);
  let lights=0,casters=0;f.props.group.traverse(o=>{if(o instanceof THREE.Light)lights++;if(o instanceof THREE.Mesh&&o.castShadow)casters++;});
  expect(lights).toBe(0);expect(casters).toBe(0);expect(f.props.metrics.staticDrawCalls).toBeLessThanOrEqual(5);f.dispose();
 });
 it('keeps authored collision boxes, spawn pads and navigation exactly unchanged',()=>{
  const before=JSON.stringify([CUSTOMS_HOUSE.solids,CUSTOMS_HOUSE.attackSpawns,CUSTOMS_HOUSE.defenderSpawns,CUSTOMS_HOUSE.navigation]);const f=fixture();f.props.update(f.state,0,1,false);
  expect(JSON.stringify([CUSTOMS_HOUSE.solids,CUSTOMS_HOUSE.attackSpawns,CUSTOMS_HOUSE.defenderSpawns,CUSTOMS_HOUSE.navigation])).toBe(before);f.dispose();
 });
 it('keeps the Harbor diagnostic world free of Customs dressing and devices',()=>{
  const f=fixture(),props=new TacticalProps(f.scene,{get:()=>f.source},'potato',{id:'harbor'});props.update(f.state,0,0,false);
  expect(props.group.visible).toBe(false);expect(props.metrics.staticDrawCalls).toBe(0);expect(props.metrics.deviceDrawCalls).toBe(0);props.dispose();f.dispose();
 });
 it('disposes owned meshes, materials and label atlas without disposing shared source textures',()=>{
  const texture=new THREE.Texture(),f=fixture(texture);let sourceDisposed=false,textureDisposed=false,atlasDisposed=false;
  f.source.addEventListener('dispose',()=>sourceDisposed=true);texture.addEventListener('dispose',()=>textureDisposed=true);f.props.labelAtlas.addEventListener('dispose',()=>atlasDisposed=true);
  const geometries=new Set<THREE.BufferGeometry>();f.props.group.traverse(o=>{if(o instanceof THREE.Mesh)geometries.add(o.geometry);});let released=0;for(const geometry of geometries)geometry.addEventListener('dispose',()=>released++);
  f.props.dispose();f.props.dispose();expect(f.scene.children).not.toContain(f.props.group);expect(sourceDisposed).toBe(false);expect(textureDisposed).toBe(false);expect(atlasDisposed).toBe(true);expect(released).toBe(geometries.size);texture.dispose();f.source.dispose();
 });
});
describe('physical Cracker prop',()=>{
 it('follows the carrier on their back and rotates with their heading',()=>{
  const f=fixture();f.props.update(f.state,0,0,false);expect(f.props.metrics.crackerVisible).toBe(true);
  expect(f.props.crackerPosition.x).toBeCloseTo(2);expect(f.props.crackerPosition.z).toBeCloseTo(3.28);
  f.state.entities[0].yaw=Math.PI/2;f.props.update(f.state,0,0,false);expect(f.props.crackerPosition.x).toBeCloseTo(2.28);expect(f.props.crackerPosition.z).toBeCloseTo(3);f.dispose();
 });
 it('places the dropped and planted rig on the objective rather than an operator',()=>{
  const f=fixture();f.state.objective.state='dropped';f.state.objective.carrier=null;f.state.objective.position={x:-9,y:.03,z:-6};f.props.update(f.state,0,0,false);
  expect(f.props.crackerPosition).toEqual(new THREE.Vector3(-9,.28,-6));
  f.state.objective.state='planted';f.state.objective.position={x:-8,y:.28,z:-5};f.state.phase='planted';f.props.update(f.state,0,0,false);
  expect(f.props.crackerPosition.x).toBe(-8);expect(f.props.crackerPosition.y).toBeCloseTo(.28);expect(f.props.crackerPosition.z).toBe(-5);f.dispose();
 });
 it('models the drill rig within a .4m by .4m footprint and .5m height',()=>{
  const f=fixture();f.state.objective.state='dropped';f.state.objective.carrier=null;f.state.objective.position={x:0,y:0,z:0};f.props.update(f.state,0,0,false);
  const bounds=new THREE.Box3(),matrix=new THREE.Matrix4();for(const mesh of Object.values(f.props.deviceMeshes)){mesh.geometry.computeBoundingBox();for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);bounds.union(mesh.geometry.boundingBox!.clone().applyMatrix4(matrix));}}
  const size=bounds.getSize(new THREE.Vector3());expect(size.x).toBeCloseTo(.4,3);expect(size.z).toBeCloseTo(.4,3);expect(size.y).toBeCloseTo(.5,3);f.dispose();
 });
 it('shows attackers the device while defenders need local-eye line of sight',()=>{
  const f=fixture();f.blocked(true);f.props.update(f.state,0,0,false);expect(f.props.metrics.crackerVisible).toBe(true);
  f.props.update(f.state,1,0,false);expect(f.props.metrics.crackerVisible).toBe(false);
  f.blocked(false);f.props.update(f.state,1,0,false);expect(f.props.metrics.crackerVisible).toBe(true);f.dispose();
 });
 it('hides stale objective props during menus and the next Pick',()=>{
  const f=fixture();for(const phase of ['menu','pick'] as const){f.state.phase=phase;f.props.update(f.state,0,0,false);expect(f.props.metrics.crackerVisible).toBe(false);expect(f.props.metrics.deviceDrawCalls).toBe(0);}f.dispose();
 });
 it.each([[40,.25,.75],[9,.125,.375],[2,.0625,.1875]])('blinks the planted LED at its fuse frequency with %ss left', (timer,on,off)=>{
  const f=fixture();f.state.phase='planted';f.state.objective.state='planted';f.state.objective.carrier=null;f.state.timer=timer;
  f.props.update(f.state,0,on,false);const bright=led(f.props);f.props.update(f.state,0,off,false);expect(led(f.props)).toBeLessThan(bright*.2);f.dispose();
 });
 it('keeps the planted LED static under reduced motion',()=>{
  const f=fixture();f.state.phase='planted';f.state.objective.state='planted';f.state.objective.carrier=null;f.state.timer=2;
  f.props.update(f.state,0,.01,true);const a=led(f.props);f.props.update(f.state,0,.1875,true);expect(led(f.props)).toBe(a);f.dispose();
 });
});
describe('attached wall-charge props',()=>{
 it('positions charges at their cell on the owner-facing wall surface and keeps that face stable',()=>{
  const f=fixture();f.state.objective.carrier=null;Object.assign(f.state.entities[0],{x:1.25,z:1});
  f.state.tools=[1,1,0,0,[],[],[[0,7,2,2]]];f.props.update(f.state,0,0,false);expect(f.props.metrics.charges).toBe(1);
  const matrix=new THREE.Matrix4();f.props.deviceMeshes.casing.getMatrixAt(0,matrix);expect(matrix.elements[12]).toBeCloseTo(1.25);expect(matrix.elements[13]).toBeCloseTo(.25);expect(matrix.elements[14]).toBeGreaterThan(.1);
  f.state.entities[0].z=-2;f.props.update(f.state,0,0,false);f.props.deviceMeshes.casing.getMatrixAt(0,matrix);expect(matrix.elements[14]).toBeGreaterThan(.1);f.dispose();
 });
 it('rejects stale-round and malformed charge rows without allocating new resources',()=>{
  const f=fixture();f.state.objective.carrier=null;const before=Object.values(f.props.deviceMeshes).map(m=>[m.geometry,m.material,m.instanceMatrix.array]);const atlas=f.props.labelAtlas;
  for(const tools of [[1,0,0,0,[],[],[[0,7,2,2]]],[1,1,0,0,[],[],[[0,96,2,2]]],[1,1,0,0,[],[],[[0,7,2,NaN]]],[1,1,0,0,[],[],[[0,7,1,2]]]]){f.state.tools=tools;f.props.update(f.state,0,1,false);expect(f.props.metrics.charges).toBe(0);}
  expect(Object.values(f.props.deviceMeshes).map(m=>[m.geometry,m.material,m.instanceMatrix.array])).toEqual(before);expect(f.props.labelAtlas).toBe(atlas);f.dispose();
 });
 it('reuses GPU update-range descriptors between animation frames',()=>{
  const f=fixture();f.props.update(f.state,0,0,false);const attribute=f.props.deviceMeshes.casing.instanceMatrix,range=attribute.updateRanges[0];attribute.clearUpdateRanges();
  f.props.update(f.state,0,.016,false);expect(attribute.updateRanges[0]).toBe(range);f.dispose();
 });
});
describe('flying impact-grenade props',()=>{
 it('shows authoritative projectile positions to defenders through the same pooled batches',()=>{
  const f=fixture();f.state.objective.carrier=null;f.blocked(true);f.state.tools=[1,1,0,0,[],[],[],null,[[1,0,123,234,-345]]];f.props.update(f.state,1,0,false);
  expect(f.props.metrics.projectiles).toBe(1);expect(f.props.metrics.deviceDrawCalls).toBeLessThanOrEqual(3);expect(f.props.metrics.crackerVisible).toBe(false);
  const matrix=new THREE.Matrix4();f.props.deviceMeshes.casing.getMatrixAt(0,matrix);expect(matrix.elements[12]).toBeCloseTo(1.23);expect(matrix.elements[13]).toBeCloseTo(2.34);expect(matrix.elements[14]).toBeCloseTo(-3.45);f.dispose();
 });
 it('bounds a simultaneous burst to twenty visuals without adding draw batches or resources',()=>{
  const f=fixture();f.state.objective.carrier=null;const before=Object.values(f.props.deviceMeshes).map(m=>[m.geometry,m.material,m.instanceMatrix.array]);
  f.state.tools=[1,1,0,0,[],[],[],null,Array.from({length:25},(_,i)=>[i+1,0,i*10,150,0])];f.props.update(f.state,0,.1,false);
  expect(f.props.metrics.projectiles).toBe(20);expect(f.props.deviceMeshes.casing.count).toBe(40);expect(Object.values(f.props.deviceMeshes)).toHaveLength(3);
  expect(Object.values(f.props.deviceMeshes).map(m=>[m.geometry,m.material,m.instanceMatrix.array])).toEqual(before);f.dispose();
 });
 it('rejects stale rounds, duplicate ids and malformed projectile positions',()=>{
  const f=fixture();f.state.objective.carrier=null;
  f.state.tools=[1,0,0,0,[],[],[],null,[[1,0,0,100,0]]];f.props.update(f.state,0,0,false);expect(f.props.metrics.projectiles).toBe(0);
  f.state.tools=[1,1,0,0,[],[],[],null,[[1,0,0,100,0],[1,0,100,100,0],[2,0,NaN,100,0],[3,10,0,100,0],[4,0,0,Infinity,0],[5,0,32768,100,0]]];f.props.update(f.state,0,0,false);expect(f.props.metrics.projectiles).toBe(1);
  f.props.dispose();expect(f.props.metrics.projectiles).toBe(0);f.source.dispose();
 });
});
