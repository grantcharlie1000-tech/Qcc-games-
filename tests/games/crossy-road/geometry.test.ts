import {describe,expect,it} from 'vitest';
import {carGeometry,truckGeometry,trainGeometry,logGeometry,lilyGeometry,signalPostGeometry,lampGeometry,treeGeometry,mergeVehicle,chickenGeometry,ufoGeometry} from '../../../src/games/crossy-road/models';
import type {BufferGeometry} from 'three';
import {ROW_DEPTH,TRAFFIC_ROW_Z,TRAIN_BASE_Y} from '../../../src/games/crossy-road/config';

function bounds(g:BufferGeometry) {g.computeBoundingBox();return g.boundingBox!;}
it('merges vehicle paint and fixed details into one draw without tinting windows or wheels',()=>{
  const parts=carGeometry('sedan'), bodyCount=parts.body.getAttribute('position').count;
  const total=bodyCount+parts.detail.getAttribute('position').count;
  const merged=mergeVehicle(parts), paint=merged.getAttribute('paint');
  expect(merged.getAttribute('position').count).toBe(total);
  expect(merged.groups).toHaveLength(0);
  for(let i=0;i<total;i++) expect(paint.getX(i)).toBe(i<bodyCount?1:0);
  expect(merged.getAttribute('color').getX(bodyCount)).toBe(parts.detail.getAttribute('color').getX(0));
  merged.dispose();parts.body.dispose();parts.detail.dispose();
});
describe('objects remain within one row of ground',()=>{
  it('both directions of every vehicle silhouette project entirely inside their lane',()=>{
    const train=trainGeometry();
    const vehicles=[...(['compact','sedan','taxi'] as const).map(carGeometry),truckGeometry(2),truckGeometry(3),train.nose,train.carriage];
    for (let model=0;model<vehicles.length;model++) for (const g of [vehicles[model].body,vehicles[model].detail]) {
      const vertices=g.getAttribute('position'), baseY=model>=5?TRAIN_BASE_Y:0;
      for (const dir of [-1,1]) for (let i=0;i<vertices.count;i++) {
        const z=vertices.getZ(i)*dir+TRAFFIC_ROW_Z;
        // At fixed screen x, height projects towards the far lane by y*cot(45°)*cos(20°).
        const apparentZ=z-(vertices.getY(i)+baseY)*Math.cos(20*Math.PI/180);
        expect(z).toBeLessThan(ROW_DEPTH/2);
        expect(apparentZ).toBeGreaterThan(-ROW_DEPTH/2);
      }
      g.dispose();
    }
  });
  for(const style of ['compact','sedan','taxi'] as const) it(`${style} body and fixed-size details fit the lane and collision span`,()=>{
    const car=carGeometry(style), length=style==='compact'?1.2:1.8;
    for(const g of [car.body,car.detail]) {
      const b=bounds(g);expect(b.max.z).toBeLessThan(0.5);expect(b.min.z).toBeGreaterThan(-0.5);
      expect(b.max.x-b.min.x).toBeLessThanOrEqual(length+0.01);g.dispose();
    }
  });
  it('cargo, train carriages, logs and pads fit their own row',()=>{
    const train=trainGeometry();
    const all=[truckGeometry(2),truckGeometry(3),train.nose,train.carriage].flatMap(g=>[g.body,g.detail]);
    all.push(...([2,3,4] as const).map(logGeometry),lilyGeometry());
    for(const g of all) {const b=bounds(g);expect(b.min.z).toBeGreaterThan(-0.5);expect(b.max.z).toBeLessThan(0.5);g.dispose();}
  });
  it('the signal post and its flat front bulb stay inside the rail cell',()=>{
    const post=signalPostGeometry(), lamp=lampGeometry();
    expect(bounds(post).max.z+ROW_DEPTH/2-0.05).toBeLessThanOrEqual(ROW_DEPTH/2+0.000001);
    expect(bounds(lamp).max.z*0.05+ROW_DEPTH/2-0.007).toBeLessThan(ROW_DEPTH/2);
    post.dispose();lamp.dispose();
  });
});

it('winter trees are bare: only bark and snow, a tile wide at most, and taller variants grow taller',()=>{
  let previous=0;
  for(const variant of [0,1,2]) {
    const tree=treeGeometry(variant), color=tree.getAttribute('color'), b=bounds(tree);
    for(let i=0;i<color.count;i++) {
      // No foliage green anywhere: every vertex is bark brown (red-dominant) or snow (blue-white).
      const r=color.getX(i), g=color.getY(i), bl=color.getZ(i);
      expect(g>r && g>bl, `variant ${variant} vertex ${i}`).toBe(false);
    }
    expect(b.max.x-b.min.x).toBeLessThanOrEqual(1);expect(b.max.z-b.min.z).toBeLessThanOrEqual(1);
    expect(b.max.y).toBeGreaterThan(previous);previous=b.max.y;
    tree.dispose();
  }
});

it('the bird and the UFO both wear a red Santa hat on top',()=>{
  for(const g of [chickenGeometry(),ufoGeometry()]) {
    const position=g.getAttribute('position'), color=g.getAttribute('color');
    let top=-Infinity; for(let i=0;i<position.count;i++) top=Math.max(top,position.getY(i));
    let redNearTop=0;
    for(let i=0;i<position.count;i++) if(position.getY(i)>top-0.25 && color.getX(i)>0.4 && color.getY(i)<0.1) redNearTop++;
    expect(redNearTop).toBeGreaterThan(8);
    g.dispose();
  }
});

it('logs keep their snow and end grain untinted while the bark takes the log colour',()=>{
  for(const len of [2,3,4] as const) {
    const log=logGeometry(len), paint=log.getAttribute('paint'), color=log.getAttribute('color');
    let fixedSnow=0, painted=0;
    for(let i=0;i<paint.count;i++) {
      if(paint.getX(i)===1) painted++;
      else if(color.getX(i)>0.85 && color.getY(i)>0.85 && color.getZ(i)>0.85) fixedSnow++;
    }
    expect(painted,'painted').toBeGreaterThan(0);expect(fixedSnow,'snow').toBeGreaterThan(0);
    const b=bounds(log);expect(b.max.x-b.min.x).toBeLessThanOrEqual(len+1e-6);
    log.dispose();
  }
});
