import {msToNextTick} from './countdown';
import * as time from './source';

/**
 * Calls `render` once per displayed second, aligned to the trusted clock's second boundary.
 * Each tick recomputes from the clock, so throttled background timers and missed ticks
 * never accumulate error. Timers stop while the tab is hidden and restart on return.
 */
export function startTicker(render:()=>void):()=>void{
  let timer:number|undefined,stopped=false;
  const tick=()=>{
    timer=undefined;
    if(stopped)return;
    time.maintain();
    render();
    if(!document.hidden)timer=window.setTimeout(tick,msToNextTick(time.now(),time.departure()));
  };
  const onVisibility=()=>{if(!document.hidden&&timer===undefined)tick();};
  const unsubscribe=time.subscribe(()=>{if(timer!==undefined)clearTimeout(timer);tick();});
  document.addEventListener('visibilitychange',onVisibility);
  tick();
  return ()=>{stopped=true;if(timer!==undefined)clearTimeout(timer);unsubscribe();document.removeEventListener('visibilitychange',onVisibility);};
}
