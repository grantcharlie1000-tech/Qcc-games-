import './santa.css';
import type {AppView} from '../apps/types';
import {northPoleScene} from './scene';
import {pad,phase,remaining,spoken,type SantaPhase} from './countdown';
import {localClock,localShort,localWhen,offsetText,utcWhen,visitorZone} from './format';
import * as time from './source';
import {startTicker} from './ticker';
import type {TrackerPanel} from './tracker/view';

const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const UNITS=[['days','Days'],['hours','Hours'],['minutes','Minutes'],['seconds','Seconds']] as const;

/**
 * The full Santa Tracker page at `#/santa`: the countdown until departure, then (at the
 * configured instant, without a reload) QCC's simulated tracker.
 */
export class SantaView implements AppView {
  private stopTicker:(()=>void)|undefined;
  private shown:SantaPhase|undefined;
  private tracker:TrackerPanel|undefined;
  private trackerLoading=false;
  private lastSpoken=-1;
  private observer:IntersectionObserver|undefined;
  private disposed=false;
  private refsHtml='';
  private readonly page:HTMLElement;

  constructor(private root:HTMLElement,private deps:{reducedMotion:()=>boolean}){
    root.innerHTML=`<article class="santa-page" aria-labelledby="santa-title">
      <nav class="santa-top"><a class="santa-back" href="#/collection"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 5-7 7 7 7M5 12h14"/></svg><span>Games</span></a><p class="santa-brand">QCC Santa Tracker</p></nav>
      <div class="santa-test" hidden role="status"><span></span><button type="button" class="game-button secondary" data-action="exit-test">Exit test mode</button></div>
      <section class="santa-hero" data-phase="loading" data-motion="on">
        <div class="santa-scene" data-motion="on">${northPoleScene}</div>
        <div class="santa-snowfall-wrap" aria-hidden="true"><div class="santa-snowfall"></div></div>
        <div class="santa-hero-copy">
          <p class="santa-eyebrow">Christmas Eve <span data-field="season"></span></p>
          <h1 id="santa-title">Santa leaves the North Pole in</h1>
          <div class="santa-countdown" role="timer" aria-live="off" aria-atomic="true">
            ${UNITS.map(([key,label])=>`<div class="santa-unit"><span class="santa-digits" data-unit="${key}">--</span><span class="santa-unit-label">${label}</span></div>`).join('')}
          </div>
          <p class="santa-chip"><span class="santa-chip-dot" aria-hidden="true"></span><span data-field="label">Estimated departure</span>:<br><strong data-field="local-short"></strong></p>
        </div>
      </section>
      <div class="santa-flight" hidden></div>
      <section class="santa-info" aria-labelledby="santa-when">
        <h2 id="santa-when">When does Santa leave?</h2>
        <p data-field="message"></p>
        <dl class="santa-facts">
          <div><dt data-field="label-2">Estimated departure</dt><dd data-field="local"></dd></div>
          <div><dt>In UTC</dt><dd data-field="utc"></dd></div>
          <div><dt>Your time zone</dt><dd data-field="zone"></dd></div>
          <div><dt>Confidence</dt><dd data-field="confidence"></dd></div>
        </dl>
        <p class="santa-norad" data-field="norad"></p>
        <p class="santa-clock" data-field="clock"></p>
        <details class="santa-source"><summary>How we worked this out</summary><p data-field="source"></p><p data-field="method"></p><ul data-field="refs"></ul><p class="santa-updated" data-field="updated"></p></details>
      </section>
      <p class="santa-disclaimer">QCC’s Santa Tracker is a just-for-fun simulation made by QCC. It is not NORAD’s tracker and it does not show live tracking data. For the official NORAD Tracks Santa, visit <a href="https://www.noradsanta.org/" target="_blank" rel="noopener noreferrer">noradsanta.org</a>.</p>
    </article>`;
    this.page=root.querySelector('.santa-page')!;
    root.querySelector('[data-action="exit-test"]')!.addEventListener('click',()=>{time.clearTest();if(location.hash.includes('?'))history.replaceState(null,'',location.pathname+location.search+'#/santa');});
    this.syncMotion();
    // Off-screen, the scene's animations pause, so scrolling down to read costs nothing.
    if('IntersectionObserver' in window){
      this.observer=new IntersectionObserver(([entry])=>{this.page.querySelector<HTMLElement>('.santa-hero')!.dataset.visible=String(entry.isIntersecting);});
      this.observer.observe(this.page.querySelector('.santa-hero')!);
    }
  }

  navigate(hash:string):void{
    // Test parameters are relative to the trusted clock, so wait for it first.
    void time.ready().then(()=>{if(!this.disposed&&time.applyTestParams(hash))this.render();});
    this.start();
  }
  pause():void{this.stopTicker?.();this.stopTicker=undefined;}
  resume():void{this.start();}
  dispose():void{this.disposed=true;this.pause();this.observer?.disconnect();this.tracker?.dispose();this.tracker=undefined;}

  private start(){
    if(this.stopTicker||this.disposed)return;
    this.stopTicker=startTicker(()=>this.render());
  }
  private field(name:string){return this.page.querySelector<HTMLElement>(`[data-field="${name}"]`)!;}
  private syncMotion(){
    const motion=this.deps.reducedMotion()?'off':'on';
    for(const el of this.page.querySelectorAll<HTMLElement>('.santa-scene,.santa-hero'))if(el.dataset.motion!==motion)el.dataset.motion=motion;
  }

  private render(){
    if(this.disposed)return;
    this.syncMotion();
    const now=time.now(),dep=time.departure(),{config,fromFile}=time.current();
    const current=phase(now,dep);
    if(current!==this.shown)this.showPhase(current);
    this.renderTest();
    if(current==='countdown'){
      const left=remaining(now,dep);
      for(const [key] of UNITS){
        const el=this.page.querySelector<HTMLElement>(`[data-unit="${key}"]`)!;
        const text=key==='days'?String(left.days):pad(left[key]);
        if(el.textContent!==text)el.textContent=text;
      }
      const minute=Math.floor(left.totalSeconds/60);
      if(minute!==this.lastSpoken){this.lastSpoken=minute;this.page.querySelector('.santa-countdown')!.setAttribute('aria-label',`${spoken(left)} until ${config.label.toLowerCase()}`);}
    }else{
      this.tracker?.update(now,dep);
    }
    this.renderInfo(dep,config,fromFile);
  }

  private showPhase(next:SantaPhase){
    this.shown=next;
    const hero=this.page.querySelector<HTMLElement>('.santa-hero')!;
    hero.dataset.phase=next;
    const title=this.page.querySelector('#santa-title')!;
    title.textContent=next==='countdown'?'Santa leaves the North Pole in':next==='flying'?'Santa is on his way!':'Santa is home again';
    this.page.querySelector<HTMLElement>('.santa-countdown')!.hidden=next!=='countdown';
    const flight=this.page.querySelector<HTMLElement>('.santa-flight')!;
    flight.hidden=next==='countdown';
    if(next==='countdown'){this.tracker?.dispose();this.tracker=undefined;flight.replaceChildren();return;}
    if(this.tracker||this.trackerLoading)return;
    // The tracker (and later the 3D globe) loads only once Santa has left.
    this.trackerLoading=true;
    import('./tracker/view').then(({TrackerPanel})=>{
      this.trackerLoading=false;
      if(this.disposed||this.shown==='countdown')return;
      this.tracker=new TrackerPanel(flight,{reducedMotion:this.deps.reducedMotion});
      this.tracker.update(time.now(),time.departure());
    }).catch(()=>{this.trackerLoading=false;flight.innerHTML='<p class="santa-flight-error">The tracker could not load. Check your connection and refresh.</p>';});
  }

  private renderTest(){
    const bar=this.page.querySelector<HTMLElement>('.santa-test')!,test=time.testMode();
    bar.hidden=!test;
    if(test){
      const text=test.departureMs!==undefined?`Test mode: departure simulated for ${localClock(test.departureMs)}.`:`Test mode: pretending it is ${localWhen(time.now())}.`;
      const span=bar.querySelector('span')!;if(span.textContent!==text)span.textContent=text;
    }
  }

  private renderInfo(dep:number,config:ReturnType<typeof time.current>['config'],fromFile:boolean){
    const estimated=config.status==='estimated';
    const set=(name:string,text:string)=>{const el=this.field(name);if(el.textContent!==text)el.textContent=text;};
    set('season',String(config.season));
    set('label',config.label);set('label-2',config.label);
    set('local-short',`${localWhen(dep)}`);
    set('local',localWhen(dep));set('utc',utcWhen(dep));set('zone',visitorZone());
    const range=config.uncertaintyMinutes?` (give or take ${config.uncertaintyMinutes>=60?`${Math.round(config.uncertaintyMinutes/60)} hour${config.uncertaintyMinutes>=120?'s':''}`:`${config.uncertaintyMinutes} minutes`})`:'';
    set('confidence',`${config.confidence[0].toUpperCase()}${config.confidence.slice(1)}${range}`);
    set('message',estimated
      ?`Santa is expected to leave the North Pole on ${localWhen(dep)} your time. That is ${utcWhen(dep)}, when Christmas Day begins in Kiribati, the first place on Earth to reach midnight. NORAD has not published a departure time for ${config.season}, so this is our estimate from past years. We will update it if NORAD publishes one.`
      :`Santa leaves the North Pole on ${localWhen(dep)} your time (${utcWhen(dep)}).`);
    const centre=config.references.filter(ref=>ref.kind==='tracking-centre'&&ref.utc);
    set('norad',centre.length?`Not the same thing: NORAD’s tracking centre has its own opening times. If NORAD keeps its usual schedule, ${centre.map(ref=>`${ref.label.replace(/\s*\(.*\)$/,'')} at ${localShort(Date.parse(ref.utc!))}`).join(', and ')} (your time). Those are when NORAD starts tracking, not when Santa leaves.`:'');
    const clock=time.clockInfo();
    set('clock',clock.source==='server'
      ?`Everyone sees the same countdown: it runs on QCC’s server clock, not your device’s.${Math.abs(clock.deviceOffsetMs)>=60000?` Your device clock is ${offsetText(clock.deviceOffsetMs)}, and we have corrected for it.`:''}`
      :'We could not reach QCC’s server clock, so this countdown is using your device’s clock. Refresh when you are online for the most accurate time.');
    set('source',config.source);set('method',config.method);
    set('updated',`${fromFile?'Last checked':'Built-in estimate, last checked'} ${config.updated}.`);
    const refs=this.field('refs');
    const html=config.references.filter(ref=>ref.url).map(ref=>`<li><a href="${escape(ref.url!)}" target="_blank" rel="noopener noreferrer">${escape(ref.label)}</a></li>`).join('');
    if(this.refsHtml!==html){this.refsHtml=html;refs.innerHTML=html;}
  }
}
