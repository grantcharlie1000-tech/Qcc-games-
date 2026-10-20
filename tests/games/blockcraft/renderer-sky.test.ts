import {describe,expect,test} from 'vitest';
import {celestialAngle,sunDirection,moonPhase,sunriseColor,starBrightness,skyColor,fogColor,cloudColor,lightmap,skyFactor,fogRange,waterVision,
  waterFogColor,underwaterFogColor} from '../../../src/games/blockcraft/render/sky';
import {paintCelestial,CELESTIAL_CELL} from '../../../src/games/blockcraft/render/sky-art';
import {daylightAt} from '../../../src/games/blockcraft/engine/game';

const PLAINS_SKY=0x78a7ff;
const rgb=(hex:number)=>({r:(hex>>16&255)/255,g:(hex>>8&255)/255,b:(hex&255)/255});

describe('celestial cycle',()=>{
  test('the celestial angle is 0 at noon, a quarter at sunset, a half at midnight and three quarters at sunrise',()=>{
    expect(celestialAngle(6000)).toBeCloseTo(0);expect(celestialAngle(12000)).toBeCloseTo(.25);
    expect(celestialAngle(18000)).toBeCloseTo(.5);expect(celestialAngle(0)).toBeCloseTo(.75);
    expect(celestialAngle(23999)).toBeGreaterThan(.74);
  });
  test('the sun rises in the east, stands overhead at noon and sets in the west, matching the engine daylight',()=>{
    const noon=sunDirection(celestialAngle(6000));expect(noon.y).toBeCloseTo(1);
    const rise=sunDirection(celestialAngle(0));expect(rise.x).toBeCloseTo(1);expect(rise.y).toBeCloseTo(0);
    const set=sunDirection(celestialAngle(12000));expect(set.x).toBeCloseTo(-1);
    // The sun is above the horizon exactly while the engine's daylight is above one half.
    for(let t=0;t<24000;t+=500)expect(sunDirection(celestialAngle(t)).y>1e-6).toBe(daylightAt(t)>.5+1e-6);
  });
  test('moon phases follow the day counter: full on day 1, eight phases, repeating',()=>{
    expect(moonPhase(1)).toBe(0);expect(moonPhase(2)).toBe(1);expect(moonPhase(5)).toBe(4);expect(moonPhase(9)).toBe(0);expect(moonPhase(0)).toBe(7);
  });
  test('sunrise and sunset glow only near the horizon, strongest when the sun crosses it',()=>{
    expect(sunriseColor(celestialAngle(6000))).toBeNull();expect(sunriseColor(celestialAngle(18000))).toBeNull();
    const dusk=sunriseColor(celestialAngle(12000))!;
    expect(dusk[0]).toBeCloseTo(.85);expect(dusk[1]).toBeCloseTo(.375);expect(dusk[2]).toBeCloseTo(.2);expect(dusk[3]).toBeCloseTo(1);
    const late=sunriseColor(celestialAngle(12900))!;expect(late[3]).toBeLessThan(dusk[3]);expect(late[0]).toBeLessThan(dusk[0]);
  });
  test('stars are invisible by day, brightest at midnight and hidden by rain',()=>{
    expect(starBrightness(celestialAngle(6000),0)).toBe(0);
    expect(starBrightness(celestialAngle(18000),0)).toBeCloseTo(.5);
    expect(starBrightness(celestialAngle(18000),1)).toBe(0);
    expect(starBrightness(celestialAngle(12300),0)).toBeLessThan(.5);expect(starBrightness(celestialAngle(12300),0)).toBeGreaterThan(0);
  });
});

describe('sky, fog and cloud colours',()=>{
  test('the zenith is the biome sky colour at noon, black at midnight and greyer in rain',()=>{
    const noon=skyColor(PLAINS_SKY,1,0,0,0),sky=rgb(PLAINS_SKY);
    expect(noon.r).toBeCloseTo(sky.r);expect(noon.g).toBeCloseTo(sky.g);expect(noon.b).toBeCloseTo(sky.b);
    const night=skyColor(PLAINS_SKY,0,0,0,0);expect(night.r+night.g+night.b).toBeCloseTo(0);
    const rain=skyColor(PLAINS_SKY,1,1,0,0);
    expect(rain.b-rain.r).toBeLessThan(noon.b-noon.r);expect(rain.b).toBeLessThan(noon.b);
    const storm=skyColor(PLAINS_SKY,1,1,1,0);expect(storm.b).toBeLessThan(rain.b);
    const flash=skyColor(PLAINS_SKY,0,0,0,1);expect(flash.r).toBeGreaterThan(.3);
  });
  test('the horizon fog is pale blue by day, near black at night and blends toward the sky with view distance',()=>{
    const sky=skyColor(PLAINS_SKY,1,0,0,0);
    const near=fogColor({daylight:1,angle:0,lookX:0,viewChunks:3,rain:0,thunder:0,sky});
    const far=fogColor({daylight:1,angle:0,lookX:0,viewChunks:12,rain:0,thunder:0,sky});
    expect(near.b).toBeGreaterThan(.9);expect(near.r).toBeGreaterThan(sky.r);
    // A longer view distance keeps the fog paler (closer to the fog base colour than to the sky).
    expect(far.r).toBeGreaterThan(near.r);
    const night=fogColor({daylight:0,angle:.5,lookX:0,viewChunks:5,rain:0,thunder:0,sky:skyColor(PLAINS_SKY,0,0,0,0)});
    expect(Math.max(night.r,night.g,night.b)).toBeLessThan(.12);
    const rain=fogColor({daylight:1,angle:0,lookX:0,viewChunks:5,rain:1,thunder:0,sky});expect(rain.r).toBeLessThan(near.r);
  });
  test('looking toward the setting sun tints the fog with the sunset colour; looking away does not',()=>{
    const angle=celestialAngle(12000),sky=skyColor(PLAINS_SKY,.5,0,0,0);
    const west=fogColor({daylight:.5,angle,lookX:-1,viewChunks:5,rain:0,thunder:0,sky});
    const east=fogColor({daylight:.5,angle,lookX:1,viewChunks:5,rain:0,thunder:0,sky});
    expect(west.r-west.b).toBeGreaterThan(east.r-east.b+.2);
  });
  test('night vision brightens the fog colour',()=>{
    const sky=skyColor(PLAINS_SKY,0,0,0,0),base={daylight:0,angle:.5,lookX:0,viewChunks:5,rain:0,thunder:0,sky};
    expect(fogColor({...base,nightVision:1}).b).toBeGreaterThan(fogColor(base).b*3);
  });
  test('clouds are white at noon, darken at night and turn grey in rain and thunder',()=>{
    const noon=cloudColor(1,0,0);expect([noon.r,noon.g,noon.b]).toEqual([1,1,1]);
    const night=cloudColor(0,0,0);expect(night.r).toBeCloseTo(.1);expect(night.b).toBeCloseTo(.15);
    const rain=cloudColor(1,1,0);expect(rain.r).toBeLessThan(.7);expect(rain.r).toBeCloseTo(rain.g,1);
    expect(cloudColor(1,1,1).r).toBeLessThan(rain.r);
  });
});

describe('light',()=>{
  test('the sky light factor follows the engine sky darkening: 1 by day, 0.2 at night, lower in storms',()=>{
    expect(skyFactor(0)).toBe(1);expect(skyFactor(11)).toBeCloseTo(.2);expect(skyFactor(15)).toBeCloseTo(.2);
    expect(skyFactor(3)).toBeGreaterThan(skyFactor(8));expect(skyFactor(3)).toBeLessThan(1);
  });
  test('the lightmap matches vanilla: full daylight is white, moonlight is dim blue, darkness is not pure black',()=>{
    const day=lightmap(15,0,1);expect(day.r).toBeGreaterThan(.97);expect(day.b).toBeGreaterThan(.97);
    const moon=lightmap(15,0,.2);expect(moon.b).toBeGreaterThan(moon.r+.1);expect(moon.r).toBeGreaterThan(.25);expect(moon.r).toBeLessThan(.4);
    const dark=lightmap(0,0,1);expect(dark.r).toBeGreaterThan(.05);expect(dark.r).toBeLessThan(.15);
    expect(lightmap(8,0,1).r).toBeLessThan(lightmap(12,0,1).r);
  });
  test('block light is warm: red above green above blue at mid levels',()=>{
    const torch=lightmap(0,10,.2);expect(torch.r).toBeGreaterThan(torch.g);expect(torch.g).toBeGreaterThan(torch.b);
    const full=lightmap(0,15,.2);expect(full.r).toBeGreaterThan(.97);
  });
  test('a lightning flash lights the sky channel fully and night vision brightens dark places',()=>{
    expect(lightmap(15,0,.2,{flash:1}).r).toBeGreaterThan(lightmap(15,0,.2).r);
    const cave=lightmap(3,0,1),vision=lightmap(3,0,1,{nightVision:1});
    expect(Math.max(vision.r,vision.g,vision.b)).toBeGreaterThan(.97);expect(vision.r).toBeGreaterThan(cave.r*2);
  });
});

describe('fog by medium',()=>{
  test('air fog ends before the loaded chunk edge and starts well before it',()=>{
    const r=fogRange('air',5,{});expect(r.far).toBeLessThanOrEqual(5*16);expect(r.far).toBeGreaterThan(4*16);expect(r.near).toBeLessThan(r.far*.75);
    expect(fogRange('air',12,{}).far).toBeGreaterThan(r.far);
  });
  test('underwater fog is short and grows with water vision; swamps are murkier',()=>{
    const fresh=fogRange('water',12,{waterVision:0}),adapted=fogRange('water',12,{waterVision:1});
    expect(fresh.far).toBeCloseTo(24);expect(adapted.far).toBeCloseTo(96);expect(fresh.near).toBe(-8);
    expect(fogRange('water',12,{waterVision:1,swamp:true}).far).toBeCloseTo(96*.85);
    expect(fogRange('water',3,{waterVision:1}).far).toBeLessThanOrEqual(fogRange('air',3,{}).far);
  });
  test('lava fog is very short; fire resistance lets you see a little further',()=>{
    const lava=fogRange('lava',5,{});expect(lava.near).toBeCloseTo(.25);expect(lava.far).toBe(1);
    expect(fogRange('lava',5,{fireResistance:true}).far).toBe(3);
  });
  test('water vision ramps over 30 seconds submerged',()=>{
    expect(waterVision(0)).toBe(0);expect(waterVision(100)).toBeCloseTo(.6);expect(waterVision(600)).toBe(1);
    expect(waterVision(350)).toBeGreaterThan(.6);expect(waterVision(350)).toBeLessThan(1);
  });
  test('underwater fog is deep blue, swamp water murky green, and water vision brightens it',()=>{
    expect(waterFogColor('plains')).toBe(0x050533);expect(waterFogColor('swamp')).toBe(0x232317);
    const dim=underwaterFogColor(0x050533,0,1),clear=underwaterFogColor(0x050533,1,1);
    expect(clear.b).toBeCloseTo(1);expect(clear.b).toBeGreaterThan(dim.b*3);expect(clear.b).toBeGreaterThan(clear.r*4);
    expect(underwaterFogColor(0x050533,1,.2).b).toBeLessThan(clear.b);
  });
});

describe('sun and moon art',()=>{
  const cells=paintCelestial(),W=CELESTIAL_CELL*9;
  const lit=(cell:number,half?:'left'|'right')=>{
    let n=0;
    for(let y=0;y<CELESTIAL_CELL;y++)for(let x=0;x<CELESTIAL_CELL;x++){
      if(half==='left'&&x>=CELESTIAL_CELL/2||half==='right'&&x<CELESTIAL_CELL/2)continue;
      const i=(y*W+cell*CELESTIAL_CELL+x)*4;if(cells[i+3]>128&&cells[i]+cells[i+1]+cells[i+2]>200)n++;
    }
    return n;
  };
  test('the sun is a bright warm square with a soft glow border',()=>{
    const c=CELESTIAL_CELL/2,i=(c*W+c)*4;expect(cells[i]).toBeGreaterThan(240);expect(cells[i+2]).toBeLessThan(cells[i]);
    const corner=0;expect(cells[corner+3]).toBeLessThan(cells[i+3]);
  });
  test('moon phases wax and wane: full is brightest, new is dark, quarters light opposite halves',()=>{
    const full=lit(1),newMoon=lit(5);expect(full).toBe(100);expect(newMoon).toBe(0);
    for(const p of [1,2,3])expect(lit(1+p)).toBeLessThan(full);
    // Phase 2 (last quarter) and phase 6 (first quarter) are mirror images.
    expect(lit(3,'left')).toBeGreaterThan(lit(3,'right'));expect(lit(7,'right')).toBeGreaterThan(lit(7,'left'));
  });
});
