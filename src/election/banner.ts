import './banner.css';
import {blocOf,counting,formatPct,headline,partyColour,type ElectionBundle} from './model';

/** The library strip shows until shortly after the official results (27 November 2026). */
const SHOW_UNTIL=Date.parse('2026-12-01T00:00:00+13:00');
const REFRESH_MS=60_000;
const AFTER_CARDS=12;
const esc=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
let stop:(()=>void)|undefined;
/** The last results seen this page load: a remounted strip paints them at once, so its height never changes under a restored scroll. */
let last:ElectionBundle|undefined;

/**
 * Adds a one-tap way into Results Desk in the middle of the game grid: the live headline, how much is counted and a seat strip.
 * It reads the cheap summary part of `/api/election` (no electorate files) once a minute while the library is showing.
 */
export function mountElectionBanner(grid:Element,now=Date.now()):void{
  stop?.();stop=undefined;
  if(now>=SHOW_UNTIL)return;
  const link=document.createElement('a');
  link.className='election-banner';link.href='#/election';link.dataset.state='loading';
  link.innerHTML=`<span class="eb-badge"><i aria-hidden="true"></i><span data-field="badge">Live</span></span>
    <span class="eb-title">Election 2026</span><span class="eb-line" data-field="line">Live results from the Electoral Commission</span>
    <span class="eb-count" data-field="count"></span><span class="eb-go" aria-hidden="true">›</span>
    <span class="eb-seats" aria-hidden="true"></span>`;
  // A full-width row in the middle of the games. Twelve fills whole rows at every grid width (2, 3, 4 and 6 columns).
  const cards=grid.querySelectorAll(':scope > .game-card');
  if(cards.length>AFTER_CARDS)cards[AFTER_CARDS-1].after(link);else grid.append(link);
  const field=(name:string)=>link.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
  let timer:number|undefined,abort:AbortController|undefined;
  const paint=(b:ElectionBundle)=>{
    const live=counting(b),final=b.electorates.length>0&&b.electorates.every(e=>e.final);
    link.dataset.state=final?'final':live?'live':'waiting';
    field('badge').textContent=final?'Final':live?'Live':'Tonight';
    field('line').textContent=live?headline(b):'Results appear here as the Electoral Commission releases them.';
    field('count').textContent=live?`${formatPct(b.stats.placesPercent,0)} counted`:'';
    const seated=b.parties.filter(p=>p.seats>0).sort((a,c)=>{const o={left:0,other:1,right:2};return o[blocOf(a.abbrev)]-o[blocOf(c.abbrev)]||c.seats-a.seats;});
    link.querySelector('.eb-seats')!.innerHTML=seated.map(p=>`<i style="flex:${p.seats};background:${partyColour(p)}" title="${esc(p.abbrev)} ${p.seats}"></i>`).join('');
    last=b;
    link.setAttribute('aria-label',`Election 2026 Results Desk. ${field('line').textContent}${live?` ${formatPct(b.stats.placesPercent,0)} of voting places counted.`:''} Open live results.`);
  };
  const tick=async()=>{
    if(!link.isConnected){stop?.();return;}
    if(document.hidden)return;
    abort?.abort();const mine=abort=new AbortController();
    try{
      const response=await fetch('api/election?part=summary',{signal:mine.signal,headers:{accept:'application/json'}});
      const body=await response.json();
      if(response.ok&&Array.isArray(body?.parties)&&link.isConnected)paint(body as ElectionBundle);
    }catch{/* keep the link and its last text: it is still the way in */}
  };
  if(last)paint(last);
  const onVisible=()=>{if(!document.hidden)void tick();};
  document.addEventListener('visibilitychange',onVisible);
  timer=window.setInterval(()=>void tick(),REFRESH_MS);
  stop=()=>{clearInterval(timer);abort?.abort();document.removeEventListener('visibilitychange',onVisible);stop=undefined;};
  void tick();
}
