import {describe,expect,it} from 'vitest';
import {sweepSphereBox} from '../../src/core/collision';

describe('swept sphere against a box',()=>{
  it('distinguishes a rounded-corner near miss from contact',()=>{
    const center=[0,0],half=[1,1];
    expect(sweepSphereBox([1.8,1.8],[1.8,1.8],center,half,1)).toBe(false);
    expect(sweepSphereBox([1.6,1.8],[1.6,1.8],center,half,1)).toBe(true);
  });
  it('detects a crossing even when both endpoints are outside',()=>{
    expect(sweepSphereBox([0,2.1],[2.1,0],[0,0],[1,1],1)).toBe(true);
  });
});
