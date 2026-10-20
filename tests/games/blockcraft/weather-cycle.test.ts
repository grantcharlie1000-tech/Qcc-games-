import {describe,expect,test} from 'vitest';
import {RAIN_DELAY,RAIN_DURATION,THUNDER_DURATION,LEVEL_STEP,MAX_WEATHER_TICKS,newCycle,advanceCycle,setCycle,cycleState,
  serializeCycle,parseCycle,type WeatherCycle} from '../../../src/games/blockcraft/world/weather-cycle';

function seeded(seed=7){
  let s=seed>>>0;
  return ()=>{s=(s+0x6d2b79f5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
}
/** Lengths of consecutive runs where `pick` holds / does not hold, over `ticks` ticks of the cycle. */
function runs(c:WeatherCycle,random:()=>number,ticks:number,pick:(c:WeatherCycle)=>boolean){
  const on:number[]=[],off:number[]=[];let current=pick(c),length=0;
  for(let i=0;i<ticks;i++){
    advanceCycle(c,random,true);
    const now=pick(c);
    if(now===current)length++;
    else{(current?on:off).push(length);current=now;length=1;}
  }
  return{on:on.slice(1),off:off.slice(1)};// the first run started mid-way
}

describe('weather cycle (vanilla ServerLevel.advanceWeatherCycle)',()=>{
  test('a new world starts clear and the first rain comes after 0.5 to 7.5 days',()=>{
    for(let seed=1;seed<=20;seed++){
      const c=newCycle(),random=seeded(seed);
      expect(cycleState(c)).toBe('clear');
      let t=0;while(!c.raining&&t<RAIN_DELAY[1]+10){advanceCycle(c,random,true);t++;}
      expect(t).toBeGreaterThanOrEqual(RAIN_DELAY[0]);
      expect(t).toBeLessThanOrEqual(RAIN_DELAY[1]+2);
    }
  });
  test('clear spells last 12000..180000 ticks and rain lasts 12000..24000 ticks',()=>{
    const c=newCycle(),{on,off}=runs(c,seeded(3),6_000_000,x=>x.raining);
    expect(on.length).toBeGreaterThan(20);expect(off.length).toBeGreaterThan(20);
    for(const r of on){expect(r).toBeGreaterThanOrEqual(RAIN_DURATION[0]);expect(r).toBeLessThanOrEqual(RAIN_DURATION[1]+1);}
    for(const r of off){expect(r).toBeGreaterThanOrEqual(RAIN_DELAY[0]);expect(r).toBeLessThanOrEqual(RAIN_DELAY[1]+1);}
    // Uniform sampling: the mean clear spell is near 4 days, the mean rain near 0.75 days.
    const mean=(a:number[])=>a.reduce((s,v)=>s+v,0)/a.length;
    expect(mean(off)).toBeGreaterThan(60000);expect(mean(off)).toBeLessThan(130000);
    expect(mean(on)).toBeGreaterThan(15000);expect(mean(on)).toBeLessThan(21000);
  });
  test('thunder flag runs 3600..15600 ticks and some rain spells become thunderstorms',()=>{
    const c=newCycle(),random=seeded(11),{on}=runs(c,random,6_000_000,x=>x.thundering);
    for(const r of on){expect(r).toBeGreaterThanOrEqual(THUNDER_DURATION[0]);expect(r).toBeLessThanOrEqual(THUNDER_DURATION[1]+1);}
    const d=newCycle();let storm=0,rain=0;
    for(let i=0;i<6_000_000;i++){advanceCycle(d,random,true);const s=cycleState(d);if(s==='thunder')storm++;else if(s==='rain')rain++;}
    expect(storm).toBeGreaterThan(0);expect(rain).toBeGreaterThan(storm);
  });
  test('rain and thunder levels ease by 0.01 per tick',()=>{
    const c=newCycle(),random=seeded(5);
    setCycle(c,'thunder',50000,random);
    expect(cycleState(c)).toBe('thunder');expect(c.rainLevel).toBe(0);
    advanceCycle(c,random,true);expect(c.rainLevel).toBeCloseTo(LEVEL_STEP,6);
    for(let i=0;i<120;i++)advanceCycle(c,random,true);
    expect(c.rainLevel).toBe(1);expect(c.thunderLevel).toBe(1);
    setCycle(c,'clear',50000,random);
    for(let i=0;i<50;i++)advanceCycle(c,random,true);
    expect(c.rainLevel).toBeCloseTo(.5,6);
    for(let i=0;i<60;i++)advanceCycle(c,random,true);
    expect(c.rainLevel).toBe(0);expect(c.thunderLevel).toBe(0);
  });
  test('a disabled cycle freezes the counters but levels still ease',()=>{
    const c=newCycle(),random=seeded(9);
    setCycle(c,'rain',30,random);
    for(let i=0;i<500;i++)advanceCycle(c,random,false);
    expect(c.raining).toBe(true);expect(c.rainTime).toBe(30);expect(c.rainLevel).toBe(1);
    for(let i=0;i<31;i++)advanceCycle(c,random,true);
    expect(c.raining).toBe(false);
  });
  test('set() with a duration holds that weather for exactly that long',()=>{
    const random=seeded(2);
    const c=newCycle();setCycle(c,'rain',100,random);
    for(let i=0;i<99;i++){advanceCycle(c,random,true);expect(c.raining).toBe(true);}
    advanceCycle(c,random,true);expect(c.raining).toBe(false);
    const d=newCycle();setCycle(d,'clear',200,random);
    for(let i=0;i<200;i++){advanceCycle(d,random,true);expect(cycleState(d)).toBe('clear');}
  });
  test('set() without a duration samples the vanilla ranges',()=>{
    const random=seeded(4);
    for(let i=0;i<200;i++){
      const r=newCycle();setCycle(r,'rain',undefined,random);
      expect(r.rainTime).toBeGreaterThanOrEqual(RAIN_DURATION[0]);expect(r.rainTime).toBeLessThanOrEqual(RAIN_DURATION[1]);expect(r.thundering).toBe(false);
      const t=newCycle();setCycle(t,'thunder',undefined,random);
      expect(t.rainTime).toBeGreaterThanOrEqual(THUNDER_DURATION[0]);expect(t.rainTime).toBeLessThanOrEqual(THUNDER_DURATION[1]);expect(t.thunderTime).toBe(t.rainTime);
      // Clearing (sleeping) resets the cycle: a fresh clear spell of 0.5..7.5 days, then normal weather.
      const c=newCycle();setCycle(c,'thunder',500,random);setCycle(c,'clear',undefined,random);
      expect(cycleState(c)).toBe('clear');expect(c.clearTime).toBe(0);
      expect(c.rainTime).toBeGreaterThanOrEqual(RAIN_DELAY[0]);expect(c.rainTime).toBeLessThanOrEqual(RAIN_DELAY[1]);
    }
  });
  test('set() clamps durations and ignores invalid ones',()=>{
    const random=seeded(6),c=newCycle();
    setCycle(c,'rain',10**9,random);expect(c.rainTime).toBe(MAX_WEATHER_TICKS);
    setCycle(c,'rain',-5,random);expect(c.rainTime).toBeGreaterThanOrEqual(RAIN_DURATION[0]);
    setCycle(c,'rain',Number.NaN,random);expect(c.rainTime).toBeGreaterThanOrEqual(RAIN_DURATION[0]);
  });
  test('serialize and parse round-trip; invalid data is rejected',()=>{
    const random=seeded(8),c=newCycle();setCycle(c,'thunder',4000,random);
    for(let i=0;i<37;i++)advanceCycle(c,random,true);
    const back=parseCycle(JSON.parse(JSON.stringify(serializeCycle(c))));
    expect(back).toEqual(c);
    for(const bad of [null,1,'x',{},{r:1},{...serializeCycle(c) as object,ct:-1},{...serializeCycle(c) as object,rl:2},{...serializeCycle(c) as object,rt:1.5}])
      expect(parseCycle(bad)).toBeNull();
  });
});
