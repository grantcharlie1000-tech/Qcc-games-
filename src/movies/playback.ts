import {STREAM_PROVIDERS,streamProvider,type StreamProviderId} from './provider';

export const LOAD_TIMEOUT=15000,READY_TIMEOUT=12000,SLOW_PROMPT=12000,MAX_ATTEMPTS=4,ATTEMPT_BUDGET=45000,FAILURE_TTL=300000;
export type AttemptState='idle'|'connecting'|'loaded'|'ready'|'playing'|'failed';
export type FailReason='blocked'|'no-load'|'no-ready';
export interface Clock{set(fn:()=>void,ms:number):number;clear(id:number):void;now():number}
export interface SupervisorEvents{status(state:AttemptState,provider:StreamProviderId):void;switchTo(next:StreamProviderId,failed:StreamProviderId,reason:FailReason):void;slow(provider:StreamProviderId):void;exhausted(failed:StreamProviderId):void;working(provider:StreamProviderId):void}

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

// The remembered server comes first. A stored id that is no longer a server is ignored.
export function providerOrder(remembered?:StreamProviderId):StreamProviderId[]{
 const ids:StreamProviderId[]=STREAM_PROVIDERS.map(provider=>provider.id);
 return [...new Set(remembered&&ids.includes(remembered)?[remembered,...ids]:ids)];
}
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
// A server that has played is working, so its failure no longer counts for this title.
function clearFailure(key:string,provider:StreamProviderId){failures.get(key)?.delete(provider);}

// One title's playback. start() begins an attempt. A failed attempt moves on to the next server until
// the attempt limit, the time budget or the list runs out. A manual pick reports its failure and stops.
// Playback starts a fresh budget, and a stream that dies after playing gets another one.
// start() after stop() begins a new session with a fresh budget and no tried servers.
export class PlaybackSupervisor{
 state:AttemptState='idle';
 provider?:StreamProviderId;
 manual=false;
 // Whether this attempt has reported playback. A failed attempt that played is a stream that stopped, not one that never started.
 played=false;
 private startedAt?:number;
 private attempts=0;
 private tried=new Set<StreamProviderId>();
 private announced=false;
 private timer?:number;
 constructor(private key:string,private order:StreamProviderId[],private events:SupervisorEvents,private clock:Clock=systemClock){}

 start(provider:StreamProviderId,manual:boolean){
  this.disarm();
  this.startedAt??=this.clock.now();
  this.attempts++;this.tried.add(provider);
  this.provider=provider;this.manual=manual;this.announced=false;this.played=false;
  this.arm(LOAD_TIMEOUT,()=>this.fail('no-load'));
  this.enter('connecting');
 }
 // FrameXTV must report ready after it loads. A server that only reports playback gets a slow prompt instead of a failure.
 loaded(){
  const provider=this.provider;
  if(this.state!=='connecting'||!provider)return;
  if(streamProvider(provider).signals==='ready')this.arm(READY_TIMEOUT,()=>this.fail('no-ready'));
  else this.arm(SLOW_PROMPT,()=>this.events.slow(provider));
  this.enter('loaded');
 }
 message(kind:'ready'|'progress'){
  const provider=this.provider;
  // A manual pick that failed on its watchdog is still the pick on screen, so its own frame can bring it back. An automatic failure
  // was replaced by the next server, or it ended the session, so it stays failed.
  const revive=this.state==='failed'&&this.manual;
  if(!provider||!(revive||LIVE.includes(this.state)))return;
  this.disarm();
  if(revive)clearFailure(this.key,provider);
  if(kind==='ready'){if(this.state==='connecting'||this.state==='loaded'||revive)this.enter('ready');return;}
  if(this.state!=='playing'){this.restartBudget(provider);this.announced=false;this.played=true;this.enter('playing');}
  // A status listener may have stopped or restarted the session; then this attempt no longer reports.
  if(this.state==='playing'&&!this.announced){this.announced=true;this.events.working(provider);}
 }
 // Any live attempt fails on a frame-src violation, including one that is already playing.
 violation(){if(LIVE.includes(this.state))this.fail('blocked');}
 stop(){
  this.disarm();
  this.startedAt=undefined;this.attempts=0;this.tried.clear();this.announced=false;this.played=false;
  if(this.state!=='idle')this.enter('idle');
 }
 nextProvider(){
  const failed=failedProviders(this.key,this.clock.now());
  return this.order.find(provider=>!this.tried.has(provider)&&!failed.has(provider));
 }
 private fail(reason:FailReason){
  const provider=this.provider,now=this.clock.now(),playing=this.state==='playing';
  this.disarm();
  if(!provider)return;
  recordFailure(this.key,provider,now);
  // A stream that dies after playing starts a fresh failover budget, so time spent playing does not count against it.
  if(playing)this.restartBudget(provider);
  this.enter('failed');
  // A status listener may have stopped or restarted the session; then this failure is no longer ours to act on.
  if(this.manual||this.state!=='failed')return;
  const next=this.nextProvider();
  if(this.attempts>=MAX_ATTEMPTS||now-(this.startedAt??now)>=ATTEMPT_BUDGET||next===undefined)this.events.exhausted(provider);
  else this.events.switchTo(next,provider,reason);
 }
 // The failover budget starts over at this server: its clock, its attempt count and its tried set.
 private restartBudget(provider:StreamProviderId){
  this.startedAt=this.clock.now();this.attempts=1;this.tried=new Set([provider]);
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
