import './banner.css';
import {JOURNEY_MS,pad,phase,remaining,spoken} from './countdown';
import * as time from './source';
import {startTicker} from './ticker';

/** The homepage strip shows from now until two days after Santa gets home. */
const SHOW_AFTER_MS=2*24*60*60*1000;
let stop:(()=>void)|undefined;

const sleigh=`<svg class="santa-banner-icon" viewBox="0 0 48 32" aria-hidden="true"><path d="M5 26h32q5 0 5-4" fill="none" stroke="#e9b949" stroke-width="2.6" stroke-linecap="round"/><path d="M10 26v-4M32 26v-4" stroke="#e9b949" stroke-width="2.2"/><path d="M6 11q-3 11 8 11h18q7 0 8-9l-9 2q-2-8-10-8h-9q-5 0-6 4z" fill="#d8263a" stroke="#6e1220" stroke-width="1.6" stroke-linejoin="round"/><path d="M13 9q-1-8 7-8 8 0 7 8z" fill="#8b5a2b"/><path d="M8 16h28" stroke="#e9b949" stroke-width="1.8"/></svg>`;

/**
 * Adds the compact countdown above the game grid. It reads the same trusted clock and
 * config as the full tracker, and stops its timer as soon as the library is re-rendered.
 */
export function mountSantaBanner(grid:Element):void{
  stop?.();stop=undefined;
  const link=document.createElement('a');
  link.className='santa-banner';link.href='#/santa';
  link.innerHTML=`${sleigh}<span class="santa-banner-text"><span class="santa-banner-title">Santa Tracker</span><span class="santa-banner-line"></span></span><span class="santa-banner-time" aria-hidden="true"></span><span class="santa-banner-go" aria-hidden="true">›</span>`;
  link.hidden=true;
  grid.before(link);
  const line=link.querySelector<HTMLElement>('.santa-banner-line')!,clock=link.querySelector<HTMLElement>('.santa-banner-time')!;
  let spokenMinute=-1;
  const render=()=>{
    if(!link.isConnected){stop?.();stop=undefined;return;}
    const now=time.now(),dep=time.departure(),current=phase(now,dep);
    link.hidden=now>=dep+JOURNEY_MS+SHOW_AFTER_MS;
    let text:string,digits='';
    if(current==='countdown'){
      const left=remaining(now,dep);
      text='Santa leaves the North Pole in';
      digits=`${left.days}d ${pad(left.hours)}h ${pad(left.minutes)}m ${pad(left.seconds)}s`;
      // The accessible name changes once a minute, not every second.
      const minute=Math.ceil(left.totalSeconds/60);
      if(minute!==spokenMinute){spokenMinute=minute;link.setAttribute('aria-label',`Santa Tracker: ${spoken(left)} until Santa leaves the North Pole. Open the tracker.`);}
    }else if(current==='flying'){spokenMinute=-1;text='Santa is on his way! Follow his simulated flight';link.setAttribute('aria-label','Santa Tracker: Santa is on his way. Follow his simulated flight.');}
    else{spokenMinute=-1;text='Santa is home. Merry Christmas!';link.setAttribute('aria-label','Santa Tracker: Santa is home. Merry Christmas!');}
    if(line.textContent!==text)line.textContent=text;
    if(clock.textContent!==digits)clock.textContent=digits;
    clock.hidden=!digits;
  };
  stop=startTicker(render);
}
