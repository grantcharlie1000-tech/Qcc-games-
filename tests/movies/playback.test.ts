import {beforeEach,expect,it,vi} from 'vitest';
import {ATTEMPT_BUDGET,FAILURE_TTL,LOAD_TIMEOUT,PlaybackSupervisor,READY_TIMEOUT,SLOW_PROMPT,clearFailures,failedProviders,providerOrder,recordFailure,type Clock} from '../../src/movies/playback';
import {STREAM_PROVIDERS,type StreamProviderId} from '../../src/movies/provider';

const KEY='movie-157336';
beforeEach(()=>clearFailures(KEY));

// Pending timers fire in due order inside advance(), the way browser timers do.
function fakeClock(){
 let now=0,lastId=0;
 const timers=new Map<number,{due:number;run:()=>void}>();
 const next=(end:number)=>[...timers].map(([id,timer])=>({id,...timer})).filter(timer=>timer.due<=end).sort((a,b)=>a.due-b.due)[0];
 const clock:Clock={
  set(run,ms){timers.set(++lastId,{due:now+ms,run});return lastId;},
  clear(id){timers.delete(id);},
  now:()=>now,
 };
 return {
  clock,
  pending:()=>timers.size,
  advance(ms:number){
   const end=now+ms;
   for(let timer=next(end);timer;timer=next(end)){now=timer.due;timers.delete(timer.id);timer.run();}
   now=end;
  },
 };
}

const events=()=>({status:vi.fn(),switchTo:vi.fn(),slow:vi.fn(),exhausted:vi.fn(),working:vi.fn()});

// Starts the next server on every switchTo, as the player will.
function autoPlayer(clock:Clock,order=providerOrder()){
 const e=events();
 const sup:PlaybackSupervisor=new PlaybackSupervisor(KEY,order,{...e,switchTo(next,failed,reason){e.switchTo(next,failed,reason);sup.start(next,false);}},clock);
 return {sup,e};
}

it('fails over when the frame never loads within 15 seconds',()=>{
 const t=fakeClock(),e=events();
 const sup=new PlaybackSupervisor(KEY,providerOrder(),e,t.clock);
 sup.start('framextv',false);
 t.advance(LOAD_TIMEOUT-1);
 expect(e.switchTo).not.toHaveBeenCalled();
 t.advance(1);
 expect(e.switchTo).toHaveBeenCalledWith('vidlink','framextv','no-load');
 expect(e.status).toHaveBeenLastCalledWith('failed','framextv');
});

it('fails over when FrameXTV loads but sends no ready message within 12 seconds',()=>{
 const t=fakeClock(),e=events();
 const sup=new PlaybackSupervisor(KEY,providerOrder(),e,t.clock);
 sup.start('framextv',false);
 t.advance(1000);
 sup.loaded();
 t.advance(READY_TIMEOUT-1);
 expect(e.switchTo).not.toHaveBeenCalled();
 t.advance(1);
 expect(e.switchTo).toHaveBeenCalledWith('vidlink','framextv','no-ready');
});

it('prompts instead of failing over for servers that only report playback',()=>{
 const t=fakeClock(),e=events();
 const sup=new PlaybackSupervisor(KEY,providerOrder(),e,t.clock);
 sup.start('vidlink',false);
 sup.loaded();
 t.advance(SLOW_PROMPT);
 expect(e.slow).toHaveBeenCalledWith('vidlink');
 // The frame has loaded, so the 15 second no-load watchdog must not fire later.
 t.advance(LOAD_TIMEOUT);
 expect(e.switchTo).not.toHaveBeenCalled();
 expect(e.exhausted).not.toHaveBeenCalled();
 expect(sup.state).toBe('loaded');
});

it('a frame-src violation fails the attempt at once',()=>{
 const t=fakeClock(),e=events();
 const sup=new PlaybackSupervisor(KEY,providerOrder(),e,t.clock);
 sup.start('framextv',false);
 sup.violation();
 expect(e.switchTo).toHaveBeenCalledWith('vidlink','framextv','blocked');
 expect(t.pending()).toBe(0);
 // Once a server is playing, a violation no longer fails the attempt.
 sup.start('vidlink',false);sup.loaded();sup.message('progress');
 sup.violation();
 expect(e.switchTo).toHaveBeenCalledTimes(1);
});

it('skips servers that failed for the same title in the last five minutes, but not after',()=>{
 const t=fakeClock();
 recordFailure(KEY,'framextv',t.clock.now());
 expect(failedProviders(KEY,FAILURE_TTL-1)).toEqual(new Set(['framextv']));
 expect(failedProviders(KEY,FAILURE_TTL+1)).toEqual(new Set());
 const sup=new PlaybackSupervisor(KEY,providerOrder(),events(),t.clock);
 sup.start('vidlink',false);
 expect(sup.nextProvider()).toBe('vixsrc');
 sup.stop();
 t.advance(FAILURE_TTL+1);
 const later=new PlaybackSupervisor(KEY,providerOrder(),events(),t.clock);
 later.start('vidlink',false);
 expect(later.nextProvider()).toBe('framextv');
});

it('stops after four servers or 45 seconds and reports exhaustion',()=>{
 // Four blocked frames use up the attempt limit, even though a fifth listed server is still untried.
 const quick=fakeClock(),four=autoPlayer(quick.clock,[...providerOrder(),'spare' as StreamProviderId]);
 four.sup.start('framextv',false);
 for(let i=0;i<4;i++)four.sup.violation();
 expect(four.e.switchTo.mock.calls.map(([next])=>next)).toEqual(['vidlink','vixsrc','vidsrc']);
 expect(four.e.exhausted).toHaveBeenCalledTimes(1);
 expect(four.e.exhausted).toHaveBeenCalledWith('vidsrc');

 // Slow failures run past the 45 second budget after three attempts.
 clearFailures(KEY);
 const slow=fakeClock(),budget=autoPlayer(slow.clock);
 budget.sup.start('framextv',false);
 slow.advance(LOAD_TIMEOUT);
 slow.advance(LOAD_TIMEOUT);
 expect(budget.e.switchTo.mock.calls.map(([next])=>next)).toEqual(['vidlink','vixsrc']);
 expect(budget.e.exhausted).not.toHaveBeenCalled();
 slow.advance(LOAD_TIMEOUT);
 expect(slow.clock.now()).toBe(ATTEMPT_BUDGET);
 expect(budget.e.exhausted).toHaveBeenCalledWith('vixsrc');
 expect(budget.e.switchTo).toHaveBeenCalledTimes(2);
});

it('a manual pick that fails reports the failure without switching',()=>{
 const t=fakeClock(),e=events();
 const sup=new PlaybackSupervisor(KEY,providerOrder(),e,t.clock);
 sup.start('vidsrc',true);
 t.advance(LOAD_TIMEOUT);
 expect(e.status).toHaveBeenLastCalledWith('failed','vidsrc');
 expect(e.switchTo).not.toHaveBeenCalled();
 expect(e.exhausted).not.toHaveBeenCalled();
 expect(failedProviders(KEY,t.clock.now())).toEqual(new Set(['vidsrc']));
});

it('reports the working server once, on the first progress message',()=>{
 const t=fakeClock(),e=events();
 const sup=new PlaybackSupervisor(KEY,providerOrder(),e,t.clock);
 sup.start('framextv',false);
 sup.loaded();
 sup.message('ready');
 expect(e.working).not.toHaveBeenCalled();
 sup.message('progress');
 sup.message('progress');
 expect(e.working).toHaveBeenCalledTimes(1);
 expect(e.working).toHaveBeenCalledWith('framextv');
 expect(sup.state).toBe('playing');
});

it('stop cancels pending watchdogs and ignores late signals',()=>{
 const t=fakeClock(),e=events();
 const sup=new PlaybackSupervisor(KEY,providerOrder(),e,t.clock);
 sup.start('framextv',false);
 sup.stop();
 expect(sup.state).toBe('idle');
 expect(t.pending()).toBe(0);
 const reported=e.status.mock.calls.length;
 t.advance(LOAD_TIMEOUT);
 sup.loaded();sup.violation();sup.message('ready');sup.message('progress');
 expect(e.switchTo).not.toHaveBeenCalled();
 expect(e.exhausted).not.toHaveBeenCalled();
 expect(e.slow).not.toHaveBeenCalled();
 expect(e.working).not.toHaveBeenCalled();
 expect(e.status.mock.calls.length).toBe(reported);
 // Only start() begins a new attempt.
 sup.start('vidlink',false);
 expect(sup.state).toBe('connecting');
});

it('a status listener that stops the session silences the events still due',()=>{
 const t=fakeClock(),e=events();
 const failing:PlaybackSupervisor=new PlaybackSupervisor(KEY,providerOrder(),{...e,status(state){if(state==='failed')failing.stop();}},t.clock);
 failing.start('framextv',false);
 failing.violation();
 expect(failing.state).toBe('idle');
 expect(e.switchTo).not.toHaveBeenCalled();
 expect(e.exhausted).not.toHaveBeenCalled();

 const w=events();
 const playing:PlaybackSupervisor=new PlaybackSupervisor(KEY,providerOrder(),{...w,status(state){if(state==='playing')playing.stop();}},t.clock);
 playing.start('vidlink',false);
 playing.loaded();
 playing.message('progress');
 expect(playing.state).toBe('idle');
 expect(w.working).not.toHaveBeenCalled();
});

it('providerOrder puts the remembered server first',()=>{
 expect(providerOrder()).toEqual(['framextv','vidlink','vixsrc','vidsrc']);
 expect(providerOrder('vixsrc')).toEqual(['vixsrc','framextv','vidlink','vidsrc']);
 expect(providerOrder('framextv')).toEqual(['framextv','vidlink','vixsrc','vidsrc']);
 // A stored value that is no longer a server is ignored.
 expect(providerOrder('retired' as never)).toEqual(['framextv','vidlink','vixsrc','vidsrc']);
});

it('gives each server the signal it reports',()=>{
 expect(STREAM_PROVIDERS.map(provider=>[provider.id,provider.signals])).toEqual([['framextv','ready'],['vidlink','playback'],['vixsrc','playback'],['vidsrc','none']]);
});
