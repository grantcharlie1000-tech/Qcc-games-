import {beforeEach,expect,it,vi} from 'vitest';
import {FAILURE_TTL,LOAD_TIMEOUT,PlaybackSupervisor,READY_TIMEOUT,clearFailures,failedProviders,recordFailure,type Clock} from '../../src/movies/playback';
import {STREAM_PROVIDERS} from '../../src/movies/provider';

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

const events=()=>({status:vi.fn(),exhausted:vi.fn(),working:vi.fn()});

it('fails the single FrameXTV attempt when its frame never loads within 15 seconds',()=>{
 const t=fakeClock(),e=events(),sup=new PlaybackSupervisor(KEY,e,t.clock);
 sup.start('framextv');
 t.advance(LOAD_TIMEOUT-1);
 expect(e.exhausted).not.toHaveBeenCalled();
 t.advance(1);
 expect(e.exhausted).toHaveBeenCalledExactlyOnceWith('framextv');
 expect(e.status).toHaveBeenLastCalledWith('failed','framextv');
 expect(failedProviders(KEY,t.clock.now())).toEqual(new Set(['framextv']));
 expect(t.pending()).toBe(0);
 t.advance(60000);
 expect(e.exhausted).toHaveBeenCalledTimes(1);
});

it('fails FrameXTV if it loads but sends no ready message within 12 seconds',()=>{
 const t=fakeClock(),e=events(),sup=new PlaybackSupervisor(KEY,e,t.clock);
 sup.start('framextv');
 t.advance(1000);
 sup.loaded();
 t.advance(READY_TIMEOUT-1);
 expect(e.exhausted).not.toHaveBeenCalled();
 t.advance(1);
 expect(e.exhausted).toHaveBeenCalledExactlyOnceWith('framextv');
 expect(sup.state).toBe('failed');
 expect(t.pending()).toBe(0);
});

it('a ready message clears the watchdog without remembering unplayed media',()=>{
 const t=fakeClock(),e=events(),sup=new PlaybackSupervisor(KEY,e,t.clock);
 sup.start('framextv');sup.loaded();sup.message('ready');
 expect(sup.state).toBe('ready');
 expect(t.pending()).toBe(0);
 t.advance(60000);
 expect(e.exhausted).not.toHaveBeenCalled();
 expect(e.working).not.toHaveBeenCalled();
});

it.each(['connecting','loaded','ready','playing'] as const)('a frame-src violation fails a %s attempt at once',state=>{
 const t=fakeClock(),e=events(),sup=new PlaybackSupervisor(KEY,e,t.clock);
 sup.start('framextv');
 if(state!=='connecting')sup.loaded();
 if(state==='ready'||state==='playing')sup.message('ready');
 if(state==='playing'){sup.message('progress');t.advance(60000);}
 sup.violation();
 expect(e.exhausted).toHaveBeenCalledExactlyOnceWith('framextv');
 expect(sup.state).toBe('failed');
 expect(sup.played).toBe(state==='playing');
 expect(t.pending()).toBe(0);
});

it('a violation is ignored when no attempt is live',()=>{
 const t=fakeClock(),e=events(),sup=new PlaybackSupervisor(KEY,e,t.clock);
 sup.violation();
 sup.start('framextv');t.advance(LOAD_TIMEOUT);
 sup.violation();sup.stop();sup.violation();
 expect(e.status.mock.calls.filter(([state])=>state==='failed')).toHaveLength(1);
 expect(e.exhausted).toHaveBeenCalledTimes(1);
});

it('keeps failures for five minutes and ignores a clock that moved back',()=>{
 recordFailure(KEY,'framextv',1000);
 expect(failedProviders(KEY,999)).toEqual(new Set());
 expect(failedProviders(KEY,1000+FAILURE_TTL)).toEqual(new Set(['framextv']));
 expect(failedProviders(KEY,1001+FAILURE_TTL)).toEqual(new Set());
 expect(failedProviders('tv-19885:s1:e1',1000)).toEqual(new Set());
 clearFailures(KEY);
 expect(failedProviders(KEY,1000)).toEqual(new Set());
});

it('reports the working server once, on the first progress message',()=>{
 const t=fakeClock(),e=events(),sup=new PlaybackSupervisor(KEY,e,t.clock);
 sup.start('framextv');sup.loaded();sup.message('ready');
 expect(t.pending()).toBe(0);
 expect(e.working).not.toHaveBeenCalled();
 sup.message('progress');sup.message('progress');sup.message('ready');
 expect(e.working).toHaveBeenCalledExactlyOnceWith('framextv');
 expect(sup.state).toBe('playing');
 t.advance(60000);
 expect(e.exhausted).not.toHaveBeenCalled();
});

it.each([false,true])('a progress message clears the watchdog without ready (loaded: %s)',loaded=>{
 const t=fakeClock(),e=events(),sup=new PlaybackSupervisor(KEY,e,t.clock);
 sup.start('framextv');if(loaded)sup.loaded();sup.message('progress');
 expect(t.pending()).toBe(0);
 t.advance(60000);
 expect(e.exhausted).not.toHaveBeenCalled();
 expect(sup.state).toBe('playing');
});

it('stop cancels pending watchdogs and ignores late signals until a fresh attempt',()=>{
 const t=fakeClock(),e=events(),sup=new PlaybackSupervisor(KEY,e,t.clock);
 sup.start('framextv');sup.stop();
 expect(sup.state).toBe('idle');expect(t.pending()).toBe(0);
 const reported=e.status.mock.calls.length;
 t.advance(LOAD_TIMEOUT);sup.loaded();sup.violation();sup.message('ready');sup.message('progress');
 expect(e.exhausted).not.toHaveBeenCalled();expect(e.working).not.toHaveBeenCalled();
 expect(e.status.mock.calls.length).toBe(reported);
 sup.start('framextv');
 expect(sup.state).toBe('connecting');expect(t.pending()).toBe(1);
});

it('a status listener that stops the session silences the events still due',()=>{
 const t=fakeClock(),e=events();
 const failing:PlaybackSupervisor=new PlaybackSupervisor(KEY,{...e,status(state){if(state==='failed')failing.stop();}},t.clock);
 failing.start('framextv');failing.violation();
 expect(failing.state).toBe('idle');expect(e.exhausted).not.toHaveBeenCalled();
 const w=events();
 const playing:PlaybackSupervisor=new PlaybackSupervisor(KEY,{...w,status(state){if(state==='playing')playing.stop();}},t.clock);
 playing.start('framextv');playing.loaded();playing.message('progress');
 expect(playing.state).toBe('idle');expect(w.working).not.toHaveBeenCalled();
 expect(t.pending()).toBe(0);
});

it('a listener that stops while connecting cannot leave a stale watchdog',()=>{
 const t=fakeClock(),e=events();
 const sup:PlaybackSupervisor=new PlaybackSupervisor(KEY,{...e,status(state){if(state==='connecting')sup.stop();}},t.clock);
 sup.start('framextv');
 expect(sup.state).toBe('idle');expect(t.pending()).toBe(0);
 t.advance(LOAD_TIMEOUT);
 expect(e.exhausted).not.toHaveBeenCalled();
});

it('keeps only the FrameXTV readiness protocol',()=>{
 expect(STREAM_PROVIDERS.map(provider=>[provider.id,provider.signals])).toEqual([['framextv','ready']]);
});

it('a failed attempt cannot revive from a late message and only a retry starts playback',()=>{
 const t=fakeClock(),e=events(),sup=new PlaybackSupervisor(KEY,e,t.clock);
 sup.start('framextv');t.advance(LOAD_TIMEOUT);
 sup.loaded();sup.message('progress');sup.message('ready');
 expect(sup.state).toBe('failed');expect(e.working).not.toHaveBeenCalled();
 clearFailures(KEY);sup.stop();sup.start('framextv');sup.loaded();sup.message('progress');
 expect(sup.state).toBe('playing');expect(e.working).toHaveBeenCalledExactlyOnceWith('framextv');
 expect(failedProviders(KEY,t.clock.now())).toEqual(new Set());
});

it('the failure event sees whether the stream had played, and a new attempt resets that flag',()=>{
 const t=fakeClock(),e=events(),seen:boolean[]=[];
 const sup:PlaybackSupervisor=new PlaybackSupervisor(KEY,{...e,exhausted(){seen.push(sup.played);}},t.clock);
 sup.start('framextv');sup.loaded();
 expect(sup.played).toBe(false);
 sup.message('progress');sup.violation();
 expect(seen).toEqual([true]);
 sup.start('framextv');
 expect(sup.played).toBe(false);
});
