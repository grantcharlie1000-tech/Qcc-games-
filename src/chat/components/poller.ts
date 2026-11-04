import {pollMs} from '../../apps/format';

/**
 * Runs `run` every `ms` (scaled in dev tests) while started, not paused and the tab is visible.
 * One run at a time; hiding the tab aborts the run in flight and stops the timer, showing it again runs once at once.
 * Stale results are the caller's to ignore with the signal it is given.
 */
export class Poller {
 private timer:number|undefined;
 private abort:AbortController|undefined;
 private running=false;
 private started=false;
 private paused=false;
 private disposed=false;
 private again=false;
 constructor(private readonly run:(signal:AbortSignal)=>Promise<void>,private readonly ms:number) {
  document.addEventListener('visibilitychange',this.onVisibility);
 }
 start():void{if(this.disposed)return;this.started=true;this.sync(false);}
 stop():void{this.started=false;this.clear();this.abort?.abort();}
 pause():void{this.paused=true;this.clear();this.abort?.abort();}
 resume():void{this.paused=false;this.sync(true);}
 /** Run now (after an action that changed the server's answer). */
 nudge():void{
  if(!this.active())return;
  if(this.running){this.again=true;return;}
  this.clear();void this.tick();
 }
 dispose():void{this.disposed=true;this.started=false;this.clear();this.abort?.abort();document.removeEventListener('visibilitychange',this.onVisibility);}
 private active():boolean{return this.started&&!this.paused&&!this.disposed&&document.visibilityState==='visible';}
 private clear():void{if(this.timer!==undefined){clearTimeout(this.timer);this.timer=undefined;}}
 private schedule():void{
  this.clear();
  if(!this.active())return;
  this.timer=window.setTimeout(()=>{this.timer=undefined;void this.tick();},pollMs(this.ms));
 }
 private sync(now:boolean):void{
  this.clear();
  if(!this.active()){this.abort?.abort();return;}
  if(now&&!this.running)void this.tick();else if(!this.running)this.schedule();
 }
 private async tick():Promise<void>{
  if(!this.active()||this.running)return;
  this.running=true;
  const abort=this.abort=new AbortController();
  try{await this.run(abort.signal);}catch{/* the caller reports what matters */}
  this.running=false;
  if(this.disposed)return;
  if(this.again&&this.active()){this.again=false;void this.tick();return;}
  this.again=false;
  this.schedule();
 }
 private readonly onVisibility=():void=>{this.sync(true);};
}
