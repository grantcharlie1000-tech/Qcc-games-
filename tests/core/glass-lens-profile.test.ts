import {describe,expect,it} from 'vitest';
import {LENS_PRESETS,MAX_BEND_RATIO,edgeFactor,fitPreset,glassDensity,lensOffset,roundedRectField} from '../../src/ui/glass-lens-profile';

describe('edge-only lens profile',()=>{
  it('e(t)=1-3t²+2t³ is 1 at the rim, 0 inside the band, with flat ends',()=>{
    expect(edgeFactor(0)).toBe(1);
    expect(edgeFactor(1)).toBe(0);
    expect(edgeFactor(.5)).toBeCloseTo(.5,10);
    expect(edgeFactor(-1)).toBe(1);
    expect(edgeFactor(2)).toBe(0);
    const slope=(t:number)=>(edgeFactor(t+1e-5)-edgeFactor(t-1e-5))/2e-5;
    expect(slope(1e-4)).toBeCloseTo(0,2);
    expect(slope(1-1e-4)).toBeCloseTo(0,2);
    for(let t=0;t<1;t+=.01)expect(edgeFactor(t+.01)).toBeLessThanOrEqual(edgeFactor(t));
  });

  it('research presets keep bend/band within 2/3 (dock: radius 32, band 10, bend 6, softness .6)',()=>{
    expect(LENS_PRESETS.dock).toEqual({radius:32,band:10,bend:6,softness:.6,saturation:1.08});
    for(const preset of Object.values(LENS_PRESETS))expect(preset.bend/preset.band).toBeLessThanOrEqual(MAX_BEND_RATIO+1e-9);
  });

  it('fitPreset clamps radius, band and bend to the surface and the non-folding ratio',()=>{
    const fitted=fitPreset({radius:40,band:30,bend:30,softness:.6,saturation:1},120,44);
    expect(fitted.radius).toBe(22);
    expect(fitted.band).toBe(22);
    expect(fitted.bend).toBeCloseTo(22*2/3,10);
  });

  it('rounded-rectangle distance and normals',()=>{
    expect(roundedRectField(0,0,100,60,20).sd).toBeCloseTo(-30,10);
    const top=roundedRectField(0,-30,100,60,20);
    expect(top.sd).toBeCloseTo(0,10);expect([top.nx,top.ny]).toEqual([0,-1]);
    const corner=roundedRectField(50,30,100,60,20);
    expect(corner.sd).toBeCloseTo(Math.hypot(20,20)-20,10);
    expect(corner.nx).toBeCloseTo(Math.SQRT1_2,10);expect(corner.ny).toBeCloseTo(Math.SQRT1_2,10);
  });

  it('displaces inward by the full bend at the rim, not at all in the centre or outside',()=>{
    const preset=fitPreset(LENS_PRESETS.dock,200,64);
    const rim=lensOffset(0,-32+1e-9,200,64,preset);
    expect(rim.inside).toBe(true);expect(rim.dy).toBeCloseTo(6,6);expect(rim.dx).toBeCloseTo(0,10);
    const centre=lensOffset(0,0,200,64,preset);
    expect(Math.abs(centre.dx)+Math.abs(centre.dy)).toBe(0);expect(centre.inside).toBe(true);
    expect(lensOffset(0,-32+10,200,64,preset).dy).toBeCloseTo(0,10);
    expect(lensOffset(0,-40,200,64,preset)).toEqual({dx:0,dy:0,inside:false});
  });

  it('sampling along a straight edge stays monotonic (no fold) for bend/band <= 2/3',()=>{
    const preset=fitPreset(LENS_PRESETS.dock,200,64);
    let previous=-Infinity;
    for(let y=-32;y<=-32+preset.band;y+=.05){
      const sample=y+lensOffset(0,y,200,64,preset).dy;
      expect(sample).toBeGreaterThanOrEqual(previous-1e-9);previous=sample;
    }
  });

  it('glass buffer density is 1-1.5 px per CSS px',()=>{
    expect(glassDensity(1)).toBe(1);expect(glassDensity(2)).toBe(1.5);expect(glassDensity(3)).toBe(1.5);expect(glassDensity(0)).toBe(1);
  });
});
