import { describe, expect, it } from 'vitest';
import { liquidLayers, polygonArea, rotatePoint, spillAngle, pourFrame } from '../../../src/games/water-sort/geometry';

describe('controlled vector liquid geometry', () => {
  it('rotates around the glass mouth using the same scene axes as SVG',()=>{
    expect(rotatePoint({x:40,y:124},90).x).toBeCloseTo(-60,8);
    expect(rotatePoint({x:40,y:124},90).y).toBeCloseTo(24,8);
    expect(rotatePoint({x:40,y:124},-90).x).toBeCloseTo(140,8);
    expect(rotatePoint({x:40,y:124},-90).y).toBeCloseTo(24,8);
  });
  it('preserves each band volume while its free surfaces stay horizontal in scene coordinates', () => {
    const upright = liquidLayers([{colour:0,units:1},{colour:1,units:2}],0);
    for (const angle of [-78,-30,35,81]) {
      const tilted = liquidLayers([{colour:0,units:1},{colour:1,units:2}],angle);
      expect(tilted).toHaveLength(2);
      tilted.forEach((layer,i) => {
        expect(polygonArea(layer.points)).toBeCloseTo(polygonArea(upright[i].points),2);
        const world=layer.points.map(p=>rotatePoint(p,angle));
        const surface=world.filter(p=>Math.abs(p.y-layer.surface)<.001);
        expect(surface.length).toBeGreaterThanOrEqual(2);
        expect(Math.max(...surface.map(p=>p.y))-Math.min(...surface.map(p=>p.y))).toBeLessThan(.001);
      });
    }
  });
  it('conserves transferred volume across source and destination throughout a maximal run', () => {
    for(const progress of [0,.2,.4,.6,.8,1]) {
      const f=pourFrame(progress);
      const source=liquidLayers([{colour:0,units:2},{colour:1,units:2-2*f.transfer}],spillAngle(4-2*f.transfer));
      const target=liquidLayers([{colour:1,units:1+2*f.transfer}],0);
      const area=[...source,...target].reduce((sum,l)=>sum+polygonArea(l.points),0);
      expect(area).toBeCloseTo(5*polygonArea(liquidLayers([{colour:0,units:1}],0)[0].points),1);
    }
  });
  it('travels before the stream starts and returns only after all liquid transfers',()=>{
    expect(pourFrame(.1).phase).toBe('travel');
    expect(pourFrame(.1).transfer).toBe(0);
    expect(pourFrame(.5).phase).toBe('flow');
    expect(pourFrame(.5).transfer).toBeGreaterThan(0);
    expect(pourFrame(.9).phase).toBe('return');
    expect(pourFrame(.9).transfer).toBe(1);
    expect(pourFrame(1).travel).toBe(0);
    expect(pourFrame(1).tilt).toBe(0);
  });
  it('tips further as the source empties and handles an empty source without phantom bands',()=>{
    expect(spillAngle(1)).toBeGreaterThan(spillAngle(3));
    expect(liquidLayers([{colour:0,units:0}],70)).toEqual([]);
  });
});
