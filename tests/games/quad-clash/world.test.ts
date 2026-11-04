import {describe,expect,test} from 'vitest';
import {MAP_IDS,getMap} from '../../../src/games/quad-clash/map';
import {compile,floorAt,moveBody,overlaps,rayWorld,clearLine,type Body} from '../../../src/games/quad-clash/physics';
import {findPath,navFor,nearestNode} from '../../../src/games/quad-clash/nav';
import {BODY,STEP} from '../../../src/games/quad-clash/config';

describe.each(MAP_IDS)('arena %s',id=>{
  const map=getMap(id),w=compile(map),nav=navFor(w);
  test('every spawn stands on a floor in open space',()=>{
    for(const s of map.spawns){const y=floorAt(w,s.x,s.z,1.5);expect(overlaps(w,s.x,y+0.01,s.z),`${s.x},${s.z}`).toBe(false);}
  });
  test('each house has at least five spawns, spread across opposite halves',()=>{
    for(const team of [0,1] as const)expect(map.spawns.filter(s=>s.team===team).length).toBeGreaterThanOrEqual(5);
    const mean=(t:0|1)=>map.spawns.filter(s=>s.team===t).reduce((a,s)=>a+s.x,0)/map.spawns.filter(s=>s.team===t).length;
    expect(Math.sign(mean(0))).toBe(-Math.sign(mean(1)));
  });
  test('spawns, zones and pickups all sit on the main navigation component and connect to each other',()=>{
    const points=[...map.spawns.map(s=>({x:s.x,y:floorAt(w,s.x,s.z,1.5),z:s.z})),...map.zones.map(z=>({x:z.x,y:z.y,z:z.z})),...map.pickups.map(p=>({x:p.x,y:floorAt(w,p.x,p.z,p.y+0.6,0.2),z:p.z}))];
    const nodes=points.map(p=>nearestNode(nav,p.x,p.y+0.1,p.z));
    nodes.forEach((n,i)=>{expect(n,JSON.stringify(points[i])).not.toBeNull();expect(n!.component,JSON.stringify(points[i])).toBe(nav.main);expect(Math.abs(n!.y-points[i].y),JSON.stringify(points[i])).toBeLessThan(0.6);});
    for(let i=1;i<nodes.length;i++)expect(findPath(nav,nodes[0]!.id,nodes[i]!.id,20000).length,JSON.stringify(points[i])).toBeGreaterThan(0);
  });
  test('raised zones are reachable by walking and jumping from the ground',()=>{
    const ground=nearestNode(nav,map.spawns[0].x,0.1,map.spawns[0].z)!;
    for(const z of map.zones){const n=nearestNode(nav,z.x,z.y+0.1,z.z)!;const path=findPath(nav,ground.id,n.id,20000);expect(path.length).toBeGreaterThan(0);expect(path.at(-1)).toBe(n.id);}
  });
});

describe('body movement',()=>{
  const w=compile(getMap('quad'));
  const body=(x:number,z:number,y=0):Body=>({x,y,z,vx:0,vy:0,vz:0,grounded:true});
  const sim=(b:Body,seconds:number,vx=0,vz=0)=>{for(let i=0;i<seconds/STEP;i++){b.vx=vx;b.vz=vz;b.vy-=BODY.gravity*STEP;moveBody(w,b,STEP);}return b;};
  test('the low cover wall at x = -16 stops a walker',()=>{
    const b=sim(body(-18,0),1.5,6,0);
    expect(b.x).toBeLessThan(-16.5+0.01);expect(b.x).toBeGreaterThan(-16.5-BODY.radius-0.05);
  });
  test('the stage steps (0.5 m each) are climbed by walking onto the 1.5 m stage',()=>{
    const b=sim(body(0,-9.5),2.5,0,6);
    expect(b.y).toBeCloseTo(1.5,2);expect(b.z).toBeGreaterThan(-5);
  });
  test('a 1.25 m wall cannot be stepped, but a jump clears it',()=>{
    const walk=sim(body(-18,0),1,6,0);expect(walk.y).toBe(0);
    const j=body(-18.2,0);j.vy=BODY.jump;j.grounded=false;
    let top=0;for(let i=0;i<60;i++){j.vx=4;j.vy-=BODY.gravity*STEP;moveBody(w,j,STEP);top=Math.max(top,j.y);}
    expect(top).toBeGreaterThan(1.25);expect(j.x).toBeGreaterThan(-16);
  });
  test('falling lands on the floor and stops',()=>{
    const b=body(0,12,5);b.grounded=false;sim(b,2);
    expect(b.y).toBe(0);expect(b.grounded).toBe(true);expect(b.vy).toBe(0);
  });
  test('walking down stairs keeps the feet on the steps',()=>{
    const b=body(0,-4,1.5);let airborne=0;
    for(let i=0;i<120;i++){b.vz=-5;b.vy-=BODY.gravity*STEP;moveBody(w,b,STEP);if(!b.grounded)airborne++;}
    expect(b.y).toBe(0);expect(airborne).toBeLessThan(6);
  });
  test('rays hit walls, the ground and nothing through open air',()=>{
    expect(rayWorld(w,-18,1,0,1,0,0,10)!.t).toBeCloseTo(1.5,5);
    expect(rayWorld(w,0,2,12,0,-1,0,10)!.t).toBeCloseTo(2,5);
    expect(rayWorld(w,0,3,12,0,0,1,4)).toBeNull();
    expect(clearLine(w,-18,1,0,-14,1,0)).toBe(false);
    expect(clearLine(w,-18,2,0,-14,2,0)).toBe(true);
  });
});
