import {expect,test} from 'vitest';
import {CUSTOMS_HOUSE} from '../../../src/games/strongroom/maps/customs-house';
// @ts-expect-error -- retained vendor builder is deliberately JavaScript.
import {buildDefinitionGeometry,buildDefinitionNavigation} from '../../../src/games/strongroom/engine/world/maps/runtime-builder.js';

test('Customs House keeps the authored rooms, live floor boxes, spawn pads and opening coordinates',()=>{
 const m=CUSTOMS_HOUSE;
 expect(m.bounds).toEqual({x0:-34,x1:34,z0:-30,z1:30});
 expect(m.buildingFootprint).toEqual({x0:-14,x1:14,z0:-11,z1:11});
 expect(m.strongrooms.map(s=>s.box)).toEqual([[-13.6,0,-10.6,-4.4,3,-2.4],[-5.6,0,1.4,3.6,3,10.6]]);
 expect(m.openings.find(o=>o.id==='north-door-1')).toMatchObject({axis:'x',x:0,z:-11,width:2,height:2.25});
 expect(m.openings.find(o=>o.id==='west-door-1')).toMatchObject({axis:'z',x:-14,z:-1,width:1});
 expect(m.attackSpawns.quay.map(s=>s.x)).toEqual([-6,-3.6,-1.2,1.2,3.6,6]);
 expect(m.defenderSpawns.A.map(s=>[s.x,s.z])).toEqual([[-12,-9],[-9,-9],[-6,-9],[-12,-4],[-9,-4],[-6,-4]]);
 expect(m.defenderSpawns.B.map(s=>[s.x,s.z])).toEqual([[-4,3],[-1,3],[2,3],[-4,9],[-1,9],[2,9]]);
});

test('soft wall planes never appear in immutable geometry and deterministic cells stay within budget',()=>{
 const m=CUSTOMS_HOUSE,panels=m.panels;
 expect(panels.length).toBeGreaterThan(40);expect(panels.length).toBeLessThanOrEqual(96);
 expect(panels.reduce((n,p)=>n+p.cols*p.rows,0)).toBeLessThanOrEqual(2048);
 expect(panels.map(p=>p.id)).toEqual(panels.map((_,i)=>i));
 for(const p of panels){
  expect(p.cols).toBeGreaterThan(0);expect(p.cols).toBeLessThanOrEqual(4);expect(p.rows).toBeLessThanOrEqual(6);
  if(p.material!=='drywall'||p.y>0)continue;
  const x=p.x+(p.axis==='x'?p.cols*.25:0),z=p.z+(p.axis==='z'?p.cols*.25:0);
  expect(m.solids.some(b=>x>b[0]+.001&&x<b[1]-.001&&1.4>b[2]&&1.4<b[3]&&z>b[4]+.001&&z<b[5]-.001),`panel ${p.id} duplicated in hard solids`).toBe(false);
 }
});

test('the authored Cutter routes identify real panels and keep breach links separate from closed navigation',()=>{
 const m=CUSTOMS_HOUSE;
 expect(m.navigation.breachEdges.length).toBeGreaterThanOrEqual(4);
 for(const edge of m.navigation.breachEdges){
  expect(m.panels.find(p=>p.id===edge.panel)?.material).toBe('drywall');
  expect(m.navigation.nodes[edge.a]).toBeDefined();expect(m.navigation.nodes[edge.b]).toBeDefined();
  expect(m.navigation.edges.some(([a,b])=>a===edge.a&&b===edge.b||a===edge.b&&b===edge.a)).toBe(false);
 }
});

test('interior lintels remain soft while exterior headers stay hard and bot footprints target floor panels',()=>{
 const m=CUSTOMS_HOUSE;
 expect(m.panels.filter(p=>p.y>0&&p.material==='drywall')).toHaveLength(9);
 for(const o of m.openings){
  const x=o.x+(o.axis==='x'?o.width/2:0),z=o.z+(o.axis==='z'?o.width/2:0);
  const hard=m.solids.some(b=>x>b[0]&&x<b[1]&&2.7>b[2]&&2.7<b[3]&&z>b[4]&&z<b[5]);
  expect(hard,`${o.id} header material`).toBe(o.outside);
 }
 for(const data of Object.values(m.siteData))for(const id of data.reinforcePanels)expect(m.panels.find(p=>p.id===id)?.y).toBe(0);
 for(const edge of m.navigation.breachEdges)expect(m.panels.find(p=>p.id===edge.panel)?.y).toBe(0);
});

// This independently checks actual boxes rather than trusting the nav builder's visibility helper.
function crosses(a:readonly number[],b:readonly number[],box:readonly (number|string|undefined)[],margin=.34){
 if(Number(box[3])<=.1||Number(box[2])>=1.9)return false;
 let lo=0,hi=1;
 for(const [axis,min,max] of [[0,Number(box[0])-margin,Number(box[1])+margin],[2,Number(box[4])-margin,Number(box[5])+margin]] as const){
  const d=b[axis]-a[axis];if(Math.abs(d)<1e-9){if(a[axis]<min||a[axis]>max)return false;continue;}
  const t0=(min-a[axis])/d,t1=(max-a[axis])/d;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(lo>hi)return false;
 }
 return hi>1e-5&&lo<1-1e-5;
}
test('every navigation node is reachable and no ordinary edge crosses hard cover or intact soft walls',()=>{
 const m=CUSTOMS_HOUSE,n=m.navigation,boxes=[...m.solids,...m.props.map(p=>p.kind==='crate'?[p.x-p.size!/2,p.x+p.size!/2,0,p.size!,p.z-p.size!/2,p.z+p.size!/2]:[p.x-p.w!/2,p.x+p.w!/2,0,p.h!,p.z-p.d!/2,p.z+p.d!/2]),...m.panels.filter(p=>p.material==='drywall').map(p=>p.axis==='x'?[p.x,p.x+p.cols*.5,p.y,p.y+p.rows*.5,p.z-.1,p.z+.1]:[p.x-.1,p.x+.1,p.y,p.y+p.rows*.5,p.z,p.z+p.cols*.5])];
 const seen=new Set<string>(),todo=[Object.keys(n.nodes)[0]];
 while(todo.length){const id=todo.pop()!;if(seen.has(id))continue;seen.add(id);for(const [a,b] of n.edges){if(a===id)todo.push(b);if(b===id)todo.push(a);}}
 expect(seen.size).toBe(Object.keys(n.nodes).length);
 for(const [a,b] of n.edges)expect(boxes.some(box=>crosses(n.nodes[a],n.nodes[b],box)),`${a} → ${b} crosses solid geometry`).toBe(false);
});

test('each attacker pad is over fifteen metres from its nearest opening with hard cover in between',()=>{
 const m=CUSTOMS_HOUSE,cover=m.props.filter(p=>p.kind==='container').map(p=>[p.x-p.w!/2,p.x+p.w!/2,0,p.h!,p.z-p.d!/2,p.z+p.d!/2]);
 const entries=m.openings.filter(o=>o.outside).map(o=>[o.x+(o.axis==='x'?o.width/2:0),1.4,o.z+(o.axis==='z'?o.width/2:0)]);
 for(const [pad,spawns] of Object.entries(m.attackSpawns))for(const [index,s] of spawns.entries()){
  const near=[...entries].sort((a,b)=>Math.hypot(a[0]-s.x,a[2]-s.z)-Math.hypot(b[0]-s.x,b[2]-s.z))[0];
  expect(Math.hypot(near[0]-s.x,near[2]-s.z)).toBeGreaterThan(15);
  expect(cover.some(b=>crosses([s.x,1.62,s.z],near,b,0)),`${pad} ${index} exposed to nearest opening ${near[0]},${near[2]}`).toBe(true);
 }
});

test('all tactics and spawn references survive the real vendor geometry and navigation builders',()=>{
 const m=CUSTOMS_HOUSE,n=m.navigation;
 for(const routes of Object.values(n.attackRoutes))for(const route of routes)for(const key of route.nodes)expect(n.nodes[key],`missing attack route node ${key}`).toBeDefined();
 for(const area of n.defenseAreas)for(const key of [area.anchor,...area.nodes])expect(n.nodes[key],`missing defense node ${key}`).toBeDefined();
 for(const [pad,spawns] of Object.entries(m.attackSpawns))for(let i=0;i<spawns.length;i++)expect(n.nodes[`spawn-${pad}-${i}`]).toBeDefined();
 for(const [site,spawns] of Object.entries(m.defenderSpawns))for(let i=0;i<spawns.length;i++)expect(n.nodes[`spawn-${site}-${i}`]).toBeDefined();
 const world:any={mats:{wallN:{},metalDark:{}},environment:{add:()=>{}},slab:()=>{},box:()=>{},deco:()=>({rotation:{y:0}}),crate:()=>{},siteMarker:()=>{},spawns:{ct:[],t:[]},waypoints:{nodes:[],edges:[]}};
 expect(()=>{buildDefinitionGeometry(world,m);buildDefinitionNavigation(world,m);}).not.toThrow();
 expect(world.spawns.ct).toHaveLength(6);expect(world.spawns.t).toHaveLength(6);expect(world.bombSites).toHaveLength(2);expect(world.botTactics.attackRoutes.A[0].points).toHaveLength(4);
});
