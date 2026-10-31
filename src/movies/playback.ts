import type {StreamProviderId} from './provider';

export const LOAD_TIMEOUT=15000,READY_TIMEOUT=12000,FAILURE_TTL=300000;
export type AttemptState='idle'|'connecting'|'loaded'|'ready'|'playing'|'failed';
export interface Clock{set(fn:()=>void,ms:number):number;clear(id:number):void;now():number}
export interface SupervisorEvents{status(state:AttemptState,provider:StreamProviderId):void;exhausted(failed:StreamProviderId):void;working(provider:StreamProviderId):void}

// Timer handles stay inside this module, so the Clock contract can use plain numbers.
const timers=new Map<number,ReturnType<typeof setTimeout>>();
let lastTimer=0;
const systemClock:Clock={
 set(fn,ms){const id=++lastTimer;timers.set(id,setTimeout(()=>{timers.delete(id);fn();},ms));return id;},
 clear(id){clearTimeout(timers.get(id));timers.delete(id);},
 now:()=>Date.now(),
};

// In memory only, never localStorage: a failure is transient network state and should not outlive this page.
const failures=new Map<string,Map<StreamProviderId,number>>();
const LIVE:AttemptState[]=['connecting','loaded','ready','playing'];

export function recordFailure(key:string,provider:StreamProviderId,now=Date.now()){
 const byProvider=failures.get(key)??new Map<StreamProviderId,number>();
 byProvider.set(provider,now);failures.set(key,byProvider);
}
// Entries older than FAILURE_TTL are ignored. Entries stamped after `now` (a clock that moved back) are ignored too.
export function failedProviders(key:string,now=Date.now()):Set<StreamProviderId>{
 const failed=new Set<StreamProviderId>();
 for(const [provider,time] of failures.get(key)??[])if(now>=time&&now-time<=FAILURE_TTL)failed.add(provider);
 return failed;
}
export function clearFailures(key:string){failures.delete(key);}
// One title's FrameXTV attempt. A timeout or blocked frame ends playback until the viewer retries.
export class PlaybackSupervisor{
 state:AttemptState='idle';
 provider?:StreamProviderId;
 // Whether this attempt has reported playback. A failed attempt that played is a stream that stopped, not one that never started.
 played=false;
 private announced=false;
 private timer?:number;
 constructor(private key:string,private events:SupervisorEvents,private clock:Clock=systemClock){}

 start(provider:StreamProviderId){
  this.disarm();
  this.provider=provider;this.announced=false;this.played=false;
  this.arm(LOAD_TIMEOUT,()=>this.fail());
  this.enter('connecting');
 }
 // FrameXTV must report ready or playback after it loads.
 loaded(){
  const provider=this.provider;
  if(this.state!=='connecting'||!provider)return;
  this.arm(READY_TIMEOUT,()=>this.fail());
  this.enter('loaded');
 }
 message(kind:'ready'|'progress'){
  const provider=this.provider;
  if(!provider||!LIVE.includes(this.state))return;
  this.disarm();
  if(kind==='ready'){if(this.state==='connecting'||this.state==='loaded')this.enter('ready');return;}
  if(this.state!=='playing'){this.played=true;this.enter('playing');}
  // A status listener may have stopped or restarted the session; then this attempt no longer reports.
  if(this.state==='playing'&&!this.announced){this.announced=true;this.events.working(provider);}
 }
 // Any live attempt fails on a frame-src violation, including one that is already playing.
 violation(){if(LIVE.includes(this.state))this.fail();}
 stop(){
  this.disarm();
  this.announced=false;this.played=false;
  if(this.state!=='idle')this.enter('idle');
 }
 private fail(){
  const provider=this.provider;
  this.disarm();
  if(!provider)return;
  recordFailure(this.key,provider,this.clock.now());
  this.enter('failed');
  // A status listener may have stopped or restarted the session; then this failure is no longer ours to act on.
  if(this.state==='failed')this.events.exhausted(provider);
 }
 private enter(state:AttemptState){
  this.state=state;
  if(this.provider)this.events.status(state,this.provider);
 }
 // Status events go out after the timers are armed, so a listener that calls back in cannot leave a stale watchdog behind.
 private arm(ms:number,run:()=>void){
  this.disarm();
  this.timer=this.clock.set(()=>{this.timer=undefined;run();},ms);
 }
 private disarm(){
  if(this.timer!==undefined)this.clock.clear(this.timer);
  this.timer=undefined;
 }
}
