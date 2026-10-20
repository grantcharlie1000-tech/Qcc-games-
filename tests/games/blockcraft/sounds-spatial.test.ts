import {describe,expect,test} from 'vitest';
import {attenuation,rangeFor,spatialize,stereoPan,ATTENUATION_DISTANCE} from '../../../src/games/blockcraft/audio/spatial';

const eye={x:0,y:64,z:0};

describe('positional attenuation (vanilla linear model)',()=>{
  test('falls linearly to zero at 16 blocks for ordinary sounds',()=>{
    expect(ATTENUATION_DISTANCE).toBe(16);
    expect(rangeFor(1)).toBe(16);
    expect(rangeFor(.15)).toBe(16);
    expect(attenuation(0,16)).toBe(1);
    expect(attenuation(4,16)).toBeCloseTo(.75,6);
    expect(attenuation(8,16)).toBeCloseTo(.5,6);
    expect(attenuation(16,16)).toBe(0);
    expect(attenuation(40,16)).toBe(0);
  });
  test('loud sounds carry further: range is 16 × volume above 1 (explosions 64, thunder everywhere)',()=>{
    expect(rangeFor(4)).toBe(64);
    expect(attenuation(32,rangeFor(4))).toBeCloseTo(.5,6);
    expect(attenuation(500,rangeFor(10000))).toBeGreaterThan(.99);
  });
  test('spatialize measures from the eye in 3D',()=>{
    const ahead=spatialize({x:0,y:64,z:-8},eye,0,16);
    expect(ahead.distance).toBeCloseTo(8,6);expect(ahead.gain).toBeCloseTo(.5,6);expect(ahead.pan).toBeCloseTo(0,6);
    const below=spatialize({x:0,y:60,z:3},eye,0,16);
    expect(below.distance).toBeCloseTo(5,6);expect(below.gain).toBeCloseTo(1-5/16,6);
    expect(spatialize({x:20,y:64,z:0},eye,0,16).gain).toBe(0);
  });
});

describe('stereo pan from the player yaw',()=>{
  // Yaw 0 looks north (-z), positive yaw turns left: right ear points east at yaw 0.
  test('facing north, east is right and west is left',()=>{
    expect(stereoPan(5,0,0,0)).toBeGreaterThan(.5);
    expect(stereoPan(-5,0,0,0)).toBeLessThan(-.5);
    expect(stereoPan(0,0,-5,0)).toBeCloseTo(0,6);
    expect(stereoPan(0,0,5,0)).toBeCloseTo(0,6);
  });
  test('facing south (yaw π), east is on the left',()=>{
    expect(stereoPan(5,0,0,Math.PI)).toBeLessThan(-.5);
  });
  test('facing west (yaw π/2, turned left), north is on the right',()=>{
    expect(stereoPan(0,0,-5,Math.PI/2)).toBeGreaterThan(.5);
    expect(stereoPan(0,0,5,Math.PI/2)).toBeLessThan(-.5);
  });
  test('sounds above, below or at the head stay centred and the pan never exceeds the range',()=>{
    expect(stereoPan(0,6,0,1)).toBeCloseTo(0,6);
    expect(stereoPan(0,0,0,0)).toBe(0);
    for(let a=0;a<Math.PI*2;a+=.3){const p=stereoPan(Math.cos(a)*3,0,Math.sin(a)*3,.7);expect(Math.abs(p)).toBeLessThanOrEqual(1);}
    // A sound almost inside the head is only slightly panned.
    expect(Math.abs(stereoPan(.2,0,0,0))).toBeLessThan(Math.abs(stereoPan(4,0,0,0)));
  });
  test('diagonal sources are panned partly',()=>{
    const p=stereoPan(3,0,-3,0);expect(p).toBeGreaterThan(.2);expect(p).toBeLessThan(stereoPan(4,0,0,0));
  });
});
