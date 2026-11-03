import {describe,it,expect} from 'vitest';
import {AdaptiveResolution} from '../../../src/games/crossy-road/quality';

const frames=(quality:AdaptiveResolution,count:number,seconds:number)=>{for(let i=0;i<count;i++)quality.observe(seconds);};
describe('adaptive resolution budget',()=>{
  it('caps a high-density screen at DPR2 through brief hitches and normal 60 Hz play',()=>{
    const quality=new AdaptiveResolution();
    expect(quality.cap).toBe(2);
    quality.observe(.12);frames(quality,180,1/60);
    expect(quality.cap).toBe(2);
  });
  it('reduces to 1.5 after sustained pressure, then 1 after four more bad seconds',()=>{
    const quality=new AdaptiveResolution();
    frames(quality,40,.025);expect(quality.cap).toBe(2);
    frames(quality,40,.025);expect(quality.cap).toBe(1.5);
    frames(quality,120,.025);expect(quality.cap).toBe(1.5);
    frames(quality,40,.025);expect(quality.cap).toBe(1);
    expect(quality.low).toBe(true);
    frames(quality,480,1/60);expect(quality.cap).toBe(1.5);
    expect(quality.low).toBe(false);
  });
  it('recovers only after eight good seconds and never oscillates near the budget',()=>{
    const quality=new AdaptiveResolution();frames(quality,160,.025);
    frames(quality,500,.018);expect(quality.cap).toBe(1.5);
    frames(quality,240,1/60);expect(quality.cap).toBe(1.5);
    frames(quality,240,1/60);expect(quality.cap).toBe(2);
    frames(quality,480,1/60);expect(quality.cap).toBe(2);
  });
  it('an isolated interruption preserves native DPR and explicit High resets the budget',()=>{
    const quality=new AdaptiveResolution();frames(quality,160,.025);
    quality.reset();expect(quality.cap).toBe(2);
    quality.observe(2);frames(quality,60,1/60);expect(quality.cap).toBe(2);
  });
  it('distinguishes a single interruption from persistently very slow rendering',()=>{
    const quality=new AdaptiveResolution();
    frames(quality,20,.3);
    expect(quality.cap).toBe(1.5);
  });
  it('adapts when slow and fast frames alternate instead of discarding every slow sample',()=>{
    const quality=new AdaptiveResolution();
    for(let i=0;i<120;i++){quality.observe(.3);quality.observe(1/60);}
    expect(quality.cap).toBe(1);
  });
});
