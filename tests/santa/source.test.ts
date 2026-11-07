import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const start=Date.UTC(2026,9,19,9);
let mono:number;
let fetchTime:ReturnType<typeof vi.fn>;

beforeEach(()=>{
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(start);
  mono=0;
  vi.stubGlobal('performance',{now:()=>mono});
  vi.stubGlobal('document',Object.assign(new EventTarget(),{baseURI:'https://example.test/',hidden:false}));
  vi.stubGlobal('window',{setTimeout});
  vi.stubGlobal('sessionStorage',{getItem:()=>null});
  fetchTime=vi.fn(()=>new Promise<Response>(()=>{}));
  vi.stubGlobal('fetch',fetchTime);
});

afterEach(()=>{
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Santa clock synchronization',()=>{
  it('recovers the departure and server clock when the first startup request fails transiently',async()=>{
    fetchTime.mockImplementationOnce(()=>Promise.reject(new Error('temporary network failure')))
      .mockImplementationOnce(()=>Promise.resolve(new Response(JSON.stringify({
        schema:1,season:2026,departureUtc:'2026-12-24T11:00:00Z',status:'estimated',
      }),{status:200,headers:{Date:new Date(start).toUTCString(),'Content-Type':'application/json'}})));
    const time=await import('../../src/santa/source');
    const {startTicker}=await import('../../src/santa/ticker');
    const stop=startTicker(()=>{});
    try{
      for(let i=0;i<20;i++)await Promise.resolve();
      expect(fetchTime).toHaveBeenCalledTimes(2);
      expect(time.current().fromFile).toBe(true);
      expect(time.departure()).toBe(Date.UTC(2026,11,24,11));
      expect(time.clockInfo().source).toBe('server');
    }finally{stop();}
  });

  it('starts the initial and maintenance requests when a ticker subscribes',async()=>{
    const {startTicker}=await import('../../src/santa/ticker');
    const stop=startTicker(()=>{});
    expect(fetchTime).toHaveBeenCalledTimes(2);
    stop();
  });

  it('still resynchronizes if the device clock jumps during the initial request',async()=>{
    const time=await import('../../src/santa/source');
    const stop=time.subscribe(()=>{});
    time.maintain();
    vi.setSystemTime(start+5000);
    time.maintain();
    expect(fetchTime).toHaveBeenCalledTimes(3);
    stop();
  });

  it('keeps the normal retry interval after an initial request fails',async()=>{
    let fail:(reason:Error)=>void=()=>{};
    fetchTime.mockImplementationOnce(()=>new Promise<Response>((_resolve,reject)=>{fail=reject;}));
    const time=await import('../../src/santa/source');
    const stop=time.subscribe(()=>{});
    time.maintain();
    fail(new Error('offline'));
    await time.ready();
    mono=29*60*1000;vi.setSystemTime(start+mono);time.maintain();
    expect(fetchTime).toHaveBeenCalledTimes(2);
    mono=30*60*1000+1;vi.setSystemTime(start+mono);time.maintain();
    expect(fetchTime).toHaveBeenCalledTimes(3);
    stop();
  });
});
