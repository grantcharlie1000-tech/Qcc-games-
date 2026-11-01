import {describe,expect,it} from 'vitest';
import {carGeometry,truckGeometry,trainGeometry,logGeometry,lilyGeometry,signalPostGeometry,lampGeometry,treeGeometry} from '../../../src/games/crossy-road/models';
import type {BufferGeometry} from 'three';
import {ROW_DEPTH,TRAFFIC_ROW_Z,TRAIN_BASE_Y} from '../../../src/games/crossy-road/config';

function bounds(g:BufferGeometry) {g.computeBoundingBox();return g.boundingBox!;}
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

it('stacked tree foliage has no internal horizontal caps to produce seams',()=>{
  const tree=treeGeometry(2), index=tree.getIndex()!, normal=tree.getAttribute('normal'), position=tree.getAttribute('position');
  for(let i=0;i<index.count;i+=3) {
    const v=index.getX(i), y=position.getY(v);
    if(y>0.5 && y<2.0) expect(normal.getY(v)).toBe(0);
  }
  tree.dispose();
});
