/**
 * A clock that does not trust the visitor's device time.
 *
 * It anchors to the server's HTTP `Date` header (UTC, whole seconds) and then advances with
 * `performance.now()`, a monotonic timer that ignores device clock changes, time-zone and
 * daylight-saving changes. Some browsers pause the monotonic timer while the computer sleeps.
 * `check()` notices when the device clock and the monotonic timer disagree and asks for a
 * fresh server sample. A forward jump looks the same whether the computer slept or the user
 * moved the clock on, so with a server anchor it waits for that sample, and adds the jump
 * only if the resync fails (`syncFailed()`); device clocks do keep counting during sleep.
 */
export type ClockSource='server'|'device';
export interface ClockStatus {source:ClockSource;/** server minus device, in ms (0 when unknown) */deviceOffsetMs:number;/** ± error bound of the last server sample, in ms */accuracyMs:number;syncedAtMs:number}

export interface TimeSources {wall:()=>number;mono:()=>number}
const defaultSources:TimeSources={wall:()=>Date.now(),mono:()=>performance.now()};

/** Divergence between wall and monotonic elapsed time that means sleep or a clock change. */
export const JUMP_THRESHOLD_MS=2000;
/** Samples with a slower round trip than this are too imprecise to adopt. */
export const MAX_RTT_MS=8000;

export class TrustedClock {
  private epoch:number;private mono:number;private wall:number;
  private status:ClockStatus;
  /** A forward jump held until the next server sample confirms or replaces it. */
  private pendingMs=0;
  constructor(private sources:TimeSources=defaultSources){
    this.epoch=sources.wall();this.mono=sources.mono();this.wall=this.epoch;
    this.status={source:'device',deviceOffsetMs:0,accuracyMs:Infinity,syncedAtMs:this.epoch};
  }
  /** Trusted current time, epoch ms (UTC). */
  now():number{return this.epoch+(this.sources.mono()-this.mono);}
  info():ClockStatus{return {...this.status};}

  /**
   * Adopts a server `Date` header measured between `sentMono` and `receivedMono`.
   * The header is truncated to the second, so the true time is on average half a second
   * later; the midpoint of the round trip estimates when the server stamped it.
   */
  adopt(dateHeader:string|null|undefined,sentMono:number,receivedMono:number):boolean{
    if(!dateHeader)return false;
    const stamped=Date.parse(dateHeader);
    const rtt=receivedMono-sentMono;
    if(!Number.isFinite(stamped)||rtt<0||rtt>MAX_RTT_MS)return false;
    const atReceive=stamped+500+rtt/2;
    const accuracy=500+rtt/2;
    // A slower (less precise) sample does not replace a good one, unless the two disagree beyond both error bounds.
    const agrees=Math.abs(atReceive-(this.epoch+(receivedMono-this.mono)))<=accuracy+this.status.accuracyMs;
    if(this.status.source==='server'&&accuracy>this.status.accuracyMs&&agrees){this.pendingMs=0;return true;}
    this.epoch=atReceive;this.mono=receivedMono;this.pendingMs=0;
    const wallNow=this.sources.wall()-(this.sources.mono()-receivedMono);
    this.wall=wallNow;
    this.status={source:'server',deviceOffsetMs:Math.round(atReceive-wallNow),accuracyMs:Math.round(accuracy),syncedAtMs:atReceive};
    return true;
  }

  /** Wall elapsed minus monotonic elapsed since the anchor. */
  private drift():number{
    return (this.sources.wall()-this.wall)-(this.sources.mono()-this.mono);
  }

  /**
   * Call on each tick and when the tab becomes visible. Returns true when the clock looks
   * unreliable (sleep, or the device clock was changed) and a server resync is wanted.
   * The monotonic time is kept. A forward jump (sleep, or the clock moved on) is applied at
   * once only without a server anchor; with one it is held until syncFailed().
   */
  check():boolean{
    const drift=this.drift();
    if(Math.abs(drift)<=JUMP_THRESHOLD_MS)return false;
    // drift>0: the wall clock moved further than the monotonic timer, the usual sign of sleep.
    // Without a server it is the best estimate; with one, a resync corrects it a moment later.
    const server=this.status.source==='server';
    if(server&&drift>0)this.pendingMs+=drift;
    const current=this.now()+(!server&&drift>0?drift:0);
    this.epoch=current;this.mono=this.sources.mono();this.wall=this.sources.wall();
    if(this.status.source==='server')this.status={...this.status,accuracyMs:Math.max(this.status.accuracyMs,Math.abs(drift))};
    return true;
  }

  /** The resync after a jump failed (offline): assume the held forward jump was sleep. */
  syncFailed():void{
    if(!this.pendingMs)return;
    this.epoch+=this.pendingMs;this.pendingMs=0;
  }
}
