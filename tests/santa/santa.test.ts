import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {FALLBACK_CONFIG,parseConfig,parseUtc} from '../../src/santa/config';
import {JUMP_THRESHOLD_MS,TrustedClock} from '../../src/santa/clock';
import {JOURNEY_MS,msToNextTick,phase,remaining,spoken} from '../../src/santa/countdown';
import {ROUTE,positionAt,interpolate,STOP_MINUTES} from '../../src/santa/tracker/route';

const shipped=JSON.parse(readFileSync(new URL('../../public/santa/departure.json',import.meta.url),'utf8'));

describe('departure config',()=>{
  it('ships a valid, clearly estimated 2026 departure in UTC',()=>{
    const config=parseConfig(shipped)!;
    expect(config).toBeDefined();
    expect(new Date(config.departureMs).toISOString()).toBe('2026-12-24T10:00:00.000Z');
    expect(config.status).toBe('estimated');
    expect(config.label).toBe('Estimated departure');
    expect(config.source).toMatch(/NORAD has not published a 2026/);
    // The bundled fallback agrees with the file, so an offline visitor sees the same time.
    expect(config.departureMs).toBe(FALLBACK_CONFIG.departureMs);
  });
  it('keeps tracking-centre opening times separate from the departure',()=>{
    const config=parseConfig(shipped)!;
    const centre=config.references.filter(ref=>ref.kind==='tracking-centre');
    expect(centre.map(ref=>ref.utc)).toEqual(['2026-12-24T09:00:00Z','2026-12-24T11:00:00Z']);
    for(const ref of centre)expect(Date.parse(ref.utc!)).not.toBe(config.departureMs);
  });
  it('rejects ambiguous or implausible timestamps',()=>{
    expect(parseUtc('2026-12-24T10:00:00')).toBeUndefined();
    expect(parseUtc('2026-12-24T10:00:00+01:00')).toBeUndefined();
    expect(parseUtc('2026-12-24T10:00Z')).toBe(Date.UTC(2026,11,24,10));
    expect(parseConfig({...shipped,departureUtc:'2026-12-24 10:00'})).toBeUndefined();
    expect(parseConfig({...shipped,departureUtc:'2026-07-24T10:00:00Z'})).toBeUndefined();
    expect(parseConfig({...shipped,season:2025})).toBeUndefined();
    expect(parseConfig({...shipped,schema:2})).toBeUndefined();
    expect(parseConfig(null)).toBeUndefined();
  });
  it('accepts a corrected time without code changes, but never calls an unsourced time official',()=>{
    const corrected=parseConfig({...shipped,departureUtc:'2026-12-24T09:30:00Z'})!;
    expect(corrected.departureMs).toBe(Date.UTC(2026,11,24,9,30));
    const unsourced=parseConfig({...shipped,status:'official',label:'Departure'})!;
    expect(unsourced.status).toBe('estimated');expect(unsourced.label).toBe('Estimated departure');
    const official=parseConfig({...shipped,status:'official',label:'Official departure',references:[{label:'NORAD 2026',kind:'official',url:'https://www.noradsanta.org/'}]})!;
    expect(official.status).toBe('official');expect(official.label).toBe('Official departure');
  });
});

describe('countdown arithmetic',()=>{
  const dep=Date.UTC(2026,11,24,10);
  it('breaks the remaining time into days, hours, minutes and seconds',()=>{
    expect(remaining(Date.UTC(2026,10,6,9,58,57),dep)).toEqual({days:48,hours:0,minutes:1,seconds:3,totalSeconds:48*86400+63});
    expect(remaining(dep-1,dep)).toMatchObject({seconds:1,totalSeconds:1});
    expect(remaining(dep,dep).totalSeconds).toBe(0);
    expect(remaining(dep+5000,dep).totalSeconds).toBe(0);
  });
  it('is pure UTC, so a daylight-saving change on the device does not move the target',()=>{
    // 25 hours of real time is always 90000 s, whatever the local clocks did that night.
    expect(remaining(dep-90000_000,dep).totalSeconds).toBe(90000);
  });
  it('switches phase exactly at departure and after the journey',()=>{
    expect(phase(dep-1,dep)).toBe('countdown');
    expect(phase(dep,dep)).toBe('flying');
    expect(phase(dep+JOURNEY_MS,dep)).toBe('home');
  });
  it('schedules ticks just after each displayed second changes',()=>{
    expect(msToNextTick(dep-2500,dep)).toBe(515);
    expect(msToNextTick(dep-2000,dep)).toBe(1015);
  });
  it('reads naturally to screen readers',()=>{
    expect(spoken(remaining(dep-(2*86400+3600+120)*1000,dep))).toBe('2 days, 1 hour and 2 minutes');
    expect(spoken(remaining(dep-5000,dep))).toBe('5 seconds');
  });
});

describe('trusted clock',()=>{
  const fake=(wall:number,mono=0)=>{const s={wall,mono};return {s,sources:{wall:()=>s.wall,mono:()=>s.mono}};};
  it('uses the server Date header and ignores a wrong device clock',()=>{
    const {s,sources}=fake(Date.UTC(2026,0,1)); // device thinks it is January
    const clock=new TrustedClock(sources);
    s.mono=100;s.wall+=100;
    expect(clock.adopt('Fri, 06 Nov 2026 09:00:00 GMT',0,100)).toBe(true);
    // header second + 500 ms truncation midpoint + half the 100 ms round trip
    expect(clock.now()).toBe(Date.UTC(2026,10,6,9,0,0)+550);
    s.mono+=10_000;s.wall+=10_000;
    expect(clock.now()).toBe(Date.UTC(2026,10,6,9,0,10)+550);
    expect(clock.info().source).toBe('server');
    expect(clock.info().deviceOffsetMs).toBeGreaterThan(300*86400_000);
  });
  it('rejects missing headers and slow round trips',()=>{
    const {sources}=fake(1000);const clock=new TrustedClock(sources);
    expect(clock.adopt(null,0,10)).toBe(false);
    expect(clock.adopt('Fri, 06 Nov 2026 09:00:00 GMT',0,9000)).toBe(false);
    expect(clock.info().source).toBe('device');
  });
  it('ignores the user changing the device clock',()=>{
    const {s,sources}=fake(Date.UTC(2026,10,6));const clock=new TrustedClock(sources);
    clock.adopt('Fri, 06 Nov 2026 00:00:00 GMT',0,0);
    const before=clock.now();
    s.wall-=3600_000; // device set back an hour; monotonic time continues
    s.mono+=1000;s.wall+=1000;
    expect(clock.check()).toBe(true); // asks for a resync
    expect(clock.now()).toBe(before+1000);
  });
  it('holds a forward jump for the server, and adds it as sleep only if the resync fails',()=>{
    const {s,sources}=fake(Date.UTC(2026,10,6));const clock=new TrustedClock(sources);
    clock.adopt('Fri, 06 Nov 2026 00:00:00 GMT',0,0);
    const before=clock.now();
    s.wall+=600_000; // ten minutes asleep (or the clock moved on): wall advanced, monotonic did not
    expect(clock.check()).toBe(true);
    expect(clock.now()).toBe(before); // a clock moved forward does not move the countdown
    expect(clock.check()).toBe(false);
    clock.syncFailed(); // offline: the best guess is that it was sleep
    expect(clock.now()).toBe(before+600_000);
  });
  it('lets the server sample decide after a forward jump',()=>{
    const {s,sources}=fake(Date.UTC(2026,10,6));const clock=new TrustedClock(sources);
    clock.adopt('Fri, 06 Nov 2026 00:00:00 GMT',0,0);
    s.wall+=600_000;clock.check();
    s.mono=50;clock.adopt('Fri, 06 Nov 2026 00:10:00 GMT',0,50); // the server says ten minutes really passed
    clock.syncFailed(); // nothing left pending, so nothing is added twice
    expect(clock.now()).toBe(Date.UTC(2026,10,6,0,10)+525);
  });
  it('adds sleep time at once when there is no server anchor',()=>{
    const {s,sources}=fake(1000);const clock=new TrustedClock(sources);
    s.wall+=600_000;
    expect(clock.check()).toBe(true);
    expect(clock.now()).toBe(601_000);
  });
  it('tolerates normal timer jitter',()=>{
    const {s,sources}=fake(0);const clock=new TrustedClock(sources);
    s.wall+=JUMP_THRESHOLD_MS-1;s.mono+=0;
    expect(clock.check()).toBe(false);
  });
});

describe('simulated route',()=>{
  const dep=Date.UTC(2026,11,24,10);
  it('runs westward in time order from the North Pole and back',()=>{
    expect(ROUTE[0].id).toBe('north-pole');expect(ROUTE.at(-1)!.id).toBe('north-pole-return');
    for(let i=1;i<ROUTE.length;i++)expect(ROUTE[i].at).toBeGreaterThan(ROUTE[i-1].at+STOP_MINUTES-1);
    expect(ROUTE.at(-1)!.at*60000).toBe(JOURNEY_MS);
  });
  it('places the sleigh before, during and after the journey',()=>{
    expect(positionAt(dep-1,dep).visited).toBe(-1);
    const start=positionAt(dep,dep);expect(start.visited).toBe(0);expect(start.next!.id).toBe('kiritimati');
    const london=ROUTE.findIndex(s=>s.id==='london');
    const atLondon=positionAt(dep+ROUTE[london].at*60000+60000,dep);
    expect(atLondon.visited).toBe(london);expect(atLondon.landed).toBe(true);
    const end=positionAt(dep+JOURNEY_MS,dep);expect(end).toMatchObject({visited:ROUTE.length-1,progress:1});expect(end.next).toBeUndefined();
  });
  it('flies great circles',()=>{
    const mid=interpolate({lat:0,lon:170},{lat:0,lon:-170},0.5);
    expect(mid.lat).toBeCloseTo(0);expect(Math.abs(mid.lon)).toBeCloseTo(180);
  });
});
