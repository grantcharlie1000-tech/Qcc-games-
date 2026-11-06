/**
 * One shared time source for the Santa pages and the homepage countdown: the departure
 * config, the trusted clock and the developer test mode, loaded once per page.
 */
import {CONFIG_PATH,FALLBACK_CONFIG,parseConfig,type DepartureConfig} from './config';
import {TrustedClock} from './clock';

/** Developer testing: `#/santa?test=10` departs 10 s from now; `#/santa?at=2026-12-24T09:59:50Z` pretends it is that time. `test=off` clears. */
export interface TestOverride {departureMs?:number;offsetMs?:number}
const TEST_KEY='qcc:santa-test';
const RESYNC_MS=30*60*1000;
const RESYNC_AFTER_HIDDEN_MS=60*1000;

let config:DepartureConfig=FALLBACK_CONFIG;
let configFromFile=false;
const clock=new TrustedClock();
let loading:Promise<void>|undefined;
let lastSync=-Infinity,hiddenAt=0;
const listeners=new Set<()=>void>();

function readTest():TestOverride|undefined{
  try{
    const raw=sessionStorage.getItem(TEST_KEY);if(!raw)return undefined;
    const data=JSON.parse(raw) as TestOverride;
    const ok=(v:unknown)=>v===undefined||typeof v==='number'&&Number.isFinite(v);
    return ok(data.departureMs)&&ok(data.offsetMs)?data:undefined;
  }catch{return undefined;}
}
let test=readTest();
function writeTest(value:TestOverride|undefined){
  test=value;
  try{value?sessionStorage.setItem(TEST_KEY,JSON.stringify(value)):sessionStorage.removeItem(TEST_KEY);}catch{/* this visit only */}
  emit();
}

/** Applies `test=` / `at=` from a `#/santa?…` hash. Returns true if test mode changed. */
export function applyTestParams(hash:string):boolean{
  const query=hash.split('?')[1];if(!query)return false;
  const params=new URLSearchParams(query);
  const seconds=params.get('test'),at=params.get('at');
  if(seconds==='off'||at==='off'){writeTest(undefined);return true;}
  const real=clock.now();
  if(seconds!==null&&/^\d{1,7}$/.test(seconds)){writeTest({departureMs:real+Number(seconds)*1000});return true;}
  if(at!==null){const ms=Date.parse(at);if(Number.isFinite(ms)&&/Z$|[+-]\d{2}:\d{2}$/.test(at)){writeTest({offsetMs:ms-real});return true;}}
  return false;
}
export function clearTest(){writeTest(undefined);}
export function testMode():TestOverride|undefined{return test;}

export function now():number{return clock.now()+(test?.offsetMs??0);}
export function departure():number{return test?.departureMs??config.departureMs;}
export function current():{config:DepartureConfig;fromFile:boolean}{return {config,fromFile:configFromFile};}
export function clockInfo(){return clock.info();}

function emit(){for(const listener of listeners)listener();}

/** Fetches the config; its response's Date header also anchors the clock. */
/**
 * Fetches the config; its response's Date header also anchors the clock. Every sync re-reads
 * the config, so a page left open for days picks up a corrected or official time.
 */
async function sync():Promise<void>{
  const url=new URL(CONFIG_PATH,document.baseURI);
  const sent=performance.now();
  // AbortSignal.timeout is missing on older Safari and Chromebooks.
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch(url,{cache:'no-store',credentials:'omit',signal:controller.signal});
    const received=performance.now();
    if(!clock.adopt(response.headers.get('Date'),sent,received))clock.syncFailed();
    lastSync=received;
    if(response.ok){
      const parsed=parseConfig(await response.json().catch(()=>undefined));
      if(parsed){config=parsed;configFromFile=true;}
    }
  }catch{clock.syncFailed();/* offline or blocked: keep the current config and clock */}
  finally{clearTimeout(timer);}
  emit();
}

/** Loads once; later calls return the same promise. */
export function ready():Promise<void>{
  loading??=sync();
  return loading;
}

/** Runs `listener` whenever the config, clock or test mode changes. Also keeps the clock fresh while anyone listens. */
export function subscribe(listener:()=>void):()=>void{
  listeners.add(listener);
  void ready();
  return ()=>{listeners.delete(listener);};
}

/** Called by tickers each tick: catches sleep and device clock changes, and refreshes the server anchor now and then. */
export function maintain():void{
  const jumped=clock.check();
  if(jumped||performance.now()-lastSync>RESYNC_MS){lastSync=performance.now();void sync();}
}

if(typeof document!=='undefined'){
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){hiddenAt=performance.now();return;}
    if(!listeners.size)return;
    const jumped=clock.check();
    if(jumped||performance.now()-hiddenAt>RESYNC_AFTER_HIDDEN_MS)void sync();
    emit();
  });
}
