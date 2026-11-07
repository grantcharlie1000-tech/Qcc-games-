import './style.css';
import type {AppView} from '../apps/types';
import {
  tileCodes,addTrendPoint,blocOf,blocSeats,BLOCS,candidateName,counting,countStatus,diffEvents,electorateLeads,feedTime,filterElectorates,formatInt,formatPct,headline,hemicycle,inkOn,INDEPENDENT,lead,majority,
  partyColour,totalSeats,validTrend,whoIsIn,type CountStatus,type ElectionBundle,type ElectorateFilter,type FeedElectorate,type FeedEvent,type FeedParty,type SortKey,type TrendPoint,
} from './model';

const ENDPOINT='api/election';
const STORE='qcc:election:v1';
const INTERVALS=[[0,'Off'],[15,'15 s'],[30,'30 s'],[60,'1 min'],[120,'2 min']] as const;
type Tab='overview'|'electorates'|'members'|'trends';
const esc=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const icon=(path:string)=>`<svg viewBox="0 0 24 24" aria-hidden="true" class="el-icon"><path d="${path}"/></svg>`;
const ICONS={back:'m12 5-7 7 7 7M5 12h14',refresh:'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',search:'m21 21-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14'};

interface Saved {interval:number;trend:TrendPoint[];coalition:number[];events:FeedEvent[]}
function load():Saved{
  try{
    const raw=JSON.parse(localStorage.getItem(STORE)??'null');
    const events=Array.isArray(raw?.events)?raw.events.filter((e:any)=>e&&typeof e.at==='string'&&typeof e.text==='string'&&['lead','final','milestone'].includes(e.kind)).slice(-80):[];
    return {interval:INTERVALS.some(([s])=>s===raw?.interval)?raw.interval:30,trend:validTrend(raw?.trend),coalition:Array.isArray(raw?.coalition)?raw.coalition.filter(Number.isInteger):[],events};
  }catch{return {interval:30,trend:[],coalition:[],events:[]};}
}

/** QCC Results Desk at `#/election`: live New Zealand general election results from the Electoral Commission's public feed. */
export class ElectionView implements AppView {
  private readonly page:HTMLElement;
  private bundle:ElectionBundle|undefined;
  private saved=load();
  private tab:Tab='overview';
  private detail:number|undefined;
  private filter:ElectorateFilter={query:'',kind:'all',party:'all',status:'all',close:false,sort:'name'};
  private timer:number|undefined;
  private abort:AbortController|undefined;
  private paused=false;
  private disposed=false;
  private error='';
  private loading=false;

  constructor(private root:HTMLElement,private deps:{reducedMotion:()=>boolean}){
    root.innerHTML=`<article class="election-page" aria-labelledby="el-title">
      <nav class="el-top">
        <a class="el-back" href="#/collection">${icon(ICONS.back)}<span>Games</span></a>
        <p class="el-brand"><span class="el-brand-mark" aria-hidden="true">✓</span>QCC <span>Results Desk</span></p>
        <div class="el-actions">
          <label class="el-auto"><span class="sr-only">Auto refresh</span><select data-control="interval" aria-label="Auto refresh">${INTERVALS.map(([s,l])=>`<option value="${s}">${s?`Every ${l}`:'Auto refresh off'}</option>`).join('')}</select></label>
          <button type="button" class="ui-icon-btn" data-action="refresh">${icon(ICONS.refresh)}<span class="el-hide-sm">Refresh</span></button>
        </div>
      </nav>
      <header class="el-hero">
        <div class="el-hero-head">
          <div>
            <p class="el-eyebrow">2026 General Election</p>
            <h1 id="el-title">Live results</h1>
          </div>
          <p class="el-status" data-state="loading" role="status"><span class="el-dot" aria-hidden="true"></span><span data-field="status">Connecting…</span></p>
        </div>
        <p class="el-headline" data-field="headline"></p>
        <p class="el-meta" data-field="meta">Results from the Electoral Commission</p>
        <div class="el-stats" data-field="stats"></div>
      </header>
      <div class="el-tabs" role="tablist" aria-label="Results views">
        <a class="ui-pill" role="tab" href="#/election" data-tab="overview">Votes &amp; seats</a>
        <a class="ui-pill" role="tab" href="#/election/electorates" data-tab="electorates">Electorates</a>
        <a class="ui-pill" role="tab" href="#/election/members" data-tab="members">Who’s in</a>
        <a class="ui-pill" role="tab" href="#/election/trends" data-tab="trends">As it happens</a>
      </div>
      <div class="el-error" role="alert" hidden></div>
      <main class="el-panel" data-field="panel" tabindex="-1"></main>
      <p class="el-foot">Unofficial. Preliminary election-night counts from the <a href="https://electionresults.govt.nz/" target="_blank" rel="noopener noreferrer">Electoral Commission</a>; official results follow once special votes are counted. Seats include any overhang. Trend lines are recorded on this device while the page is open.</p>
    </article>`;
    this.page=root.querySelector('.election-page')!;
    const interval=this.page.querySelector<HTMLSelectElement>('[data-control="interval"]')!;
    interval.value=String(this.saved.interval);
    interval.addEventListener('change',()=>{this.saved.interval=Number(interval.value);this.persist();this.schedule();});
    this.page.querySelector('[data-action="refresh"]')!.addEventListener('click',()=>void this.refresh(true));
    this.page.addEventListener('click',this.onClick);
    this.page.addEventListener('input',this.onInput);
    this.page.addEventListener('change',this.onInput);
    document.addEventListener('visibilitychange',this.onVisibility);
    this.renderShell();
    void this.refresh();
  }

  navigate(hash:string):void{
    const path=hash.replace(/^#\/election\/?/,'').split(/[?#]/)[0];
    const e=/^e\/(\d+)$/.exec(path);
    this.detail=e?Number(e[1]):undefined;
    this.tab=e||path==='electorates'?'electorates':path==='trends'?'trends':path==='members'?'members':'overview';
    for(const link of this.page.querySelectorAll<HTMLElement>('[data-tab]')){
      const on=link.dataset.tab===this.tab;
      link.setAttribute('aria-selected',String(on));
      if(on)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    }
    this.renderPanel(true);
  }
  pause():void{this.paused=true;this.stop();}
  resume():void{this.paused=false;void this.refresh();}
  dispose():void{
    this.disposed=true;this.stop();this.abort?.abort();
    document.removeEventListener('visibilitychange',this.onVisibility);
  }

  private persist(){try{localStorage.setItem(STORE,JSON.stringify(this.saved));}catch{/* this visit only */}}
  private stop(){if(this.timer!==undefined){clearTimeout(this.timer);this.timer=undefined;}}
  private schedule(){
    this.stop();
    if(this.disposed||this.paused||document.hidden||!this.saved.interval)return;
    this.timer=window.setTimeout(()=>void this.refresh(),this.saved.interval*1000);
  }
  private readonly onVisibility=()=>{if(document.hidden)this.stop();else if(!this.paused)void this.refresh();};

  private async refresh(manual=false){
    if(this.disposed)return;
    this.stop();this.abort?.abort();
    const abort=this.abort=new AbortController();let timedOut=false;
    this.loading=true;this.renderStatus();
    try{
      // A plain timer rather than AbortSignal.any, which older Safari lacks.
      const timeout=window.setTimeout(()=>{timedOut=true;abort.abort();},20000);
      const response=await fetch(ENDPOINT,{signal:abort.signal,headers:{accept:'application/json'}}).finally(()=>clearTimeout(timeout));
      const body=await response.json().catch(()=>null);
      if(!response.ok||!body||!Array.isArray(body.parties)||!Array.isArray(body.electorates))throw new Error(body?.error||'The results feed did not answer.');
      if(abort.signal.aborted||this.disposed)return;
      const previous=this.bundle,before=previous?.updated;
      this.bundle=body as ElectionBundle;this.error='';
      const fresh=diffEvents(previous,this.bundle,id=>this.party(id)?.abbrev??'IND');
      if(fresh.length)this.saved.events=[...this.saved.events,...fresh].slice(-80);
      this.saved.trend=addTrendPoint(this.saved.trend,this.bundle);this.persist();
      this.renderShell();
      // Keep the reader's place: a background update repaints only when the feed has moved on.
      if(manual||before!==this.bundle.updated)this.renderPanel(false);
    }catch(error){
      // Superseded by a newer refresh, or the view closed: nothing to report.
      if(this.disposed||this.abort!==abort||abort.signal.aborted&&!timedOut)return;
      this.error=timedOut||!(error instanceof Error)?'The results feed did not answer in time.':error.message;
      if(!this.bundle)this.renderPanel(false);
    }finally{
      if(this.abort===abort){this.loading=false;this.renderStatus();this.schedule();}
    }
  }

  private field(name:string){return this.page.querySelector<HTMLElement>(`[data-field="${name}"]`)!;}
  private renderStatus(){
    const status=this.page.querySelector<HTMLElement>('.el-status')!,b=this.bundle;
    const final=!!b&&b.electorates.length>0&&b.electorates.every(e=>e.final);
    const state=this.error&&!b?'error':!b?'loading':final?'final':counting(b)?'live':'waiting';
    status.dataset.state=state;status.toggleAttribute('data-busy',this.loading);
    this.field('status').textContent=state==='error'?'Feed unavailable':state==='loading'?'Connecting…':state==='final'?'Final results':state==='live'?'Live · counting':'Live · awaiting results';
    const err=this.page.querySelector<HTMLElement>('.el-error')!;
    err.hidden=!this.error;
    if(this.error)err.innerHTML=`<span>${esc(this.error)}${b?' Showing the last results received.':''}</span><button type="button" class="game-button secondary" data-action="retry">Retry</button>`;
  }
  private renderShell(){
    this.renderStatus();
    const b=this.bundle;if(!b)return;
    const s=b.stats;
    this.field('headline').textContent=headline(b);
    this.field('meta').textContent=`${b.updated?`Updated ${feedTime(b.updated)}`:'Waiting for the first update'} · Electoral Commission`;
    const placesTotal=s.placesTotal||0;
    const tiles=[
      ['Voting places counted',formatPct(s.placesPercent),placesTotal?`${formatInt(s.placesCounted)} of ${formatInt(placesTotal)} results`:formatInt(s.placesCounted),s.placesPercent],
      ['Votes counted',formatInt(s.votesCast),s.electors?`${formatPct(s.votesPercent)} of ${formatInt(s.electors)} enrolled`:formatPct(s.votesPercent),s.votesPercent],
      ['Electorates final',`${b.electorates.filter(e=>e.final).length} / ${b.electorates.length}`,`${b.electorates.filter(e=>e.kind==='general').length} general · ${b.electorates.filter(e=>e.kind==='maori').length} Māori`,s.electoratesPercent],
      ['Special votes',formatInt(s.specialVotes),'Counted after election night',undefined],
    ] as const;
    this.field('stats').innerHTML=tiles.map(([label,value,sub,bar])=>`<div class="el-stat"><p class="el-stat-label">${label}</p><p class="el-stat-value">${value}</p><p class="el-stat-sub">${sub}</p>${bar===undefined?'':`<span class="el-meter" aria-hidden="true"><span style="width:${Math.min(100,Math.max(0,bar))}%"></span></span>`}</div>`).join('');
  }

  private party(id:number):FeedParty|undefined{return this.bundle?.parties.find(p=>p.id===id);}
  private chip(id:number,short=true){
    const p=this.party(id),colour=partyColour(p),name=p?(short?p.abbrev:p.name):INDEPENDENT.name;
    return `<span class="el-chip" style="--pc:${colour};--pi:${inkOn(colour)}" title="${esc(p?.name??INDEPENDENT.name)}">${esc(id===0?(short?'IND':name):name)}</span>`;
  }

  private renderPanel(focus:boolean){
    const panel=this.field('panel');
    if(!this.bundle){
      panel.innerHTML=this.error?`<div class="el-empty"><p>${esc(this.error)}</p><button type="button" class="game-button" data-action="retry">Try again</button></div>`:'<div class="el-empty"><p>Loading the latest results…</p></div>';
      return;
    }
    if(this.tab==='overview')panel.innerHTML=this.overview();
    else if(this.tab==='trends')panel.innerHTML=this.trends();
    else if(this.tab==='members')panel.innerHTML=this.members();
    else if(this.detail!==undefined)panel.innerHTML=this.electorate(this.detail);
    else{panel.innerHTML=this.electorates();this.renderRows();}
    if(focus&&this.tab==='electorates'&&this.detail!==undefined)panel.querySelector<HTMLElement>('h2')?.focus({preventScroll:false});
  }

  /* Votes & seats */
  private overview():string{
    const b=this.bundle!,seats=totalSeats(b),need=majority(seats),seated=b.parties.filter(p=>p.seats>0),blocs=blocSeats(b);
    const order=[...seated].sort((a,c)=>this.side(a)-this.side(c)||c.seats-a.seats);
    const dots=hemicycle(seats||120);
    let i=0;const fills:string[]=[];
    for(const p of order)for(let n=0;n<p.seats;n++)fills[i++]=partyColour(p);
    const svg=`<svg class="el-house" viewBox="0 -24 360 214" role="img" aria-label="${seats?`Parliament of ${seats} seats. ${order.map(p=>`${p.name} ${p.seats}`).join(', ')}.`:'Seats will appear once votes are counted.'}">${dots.map((d,k)=>`<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${d.r.toFixed(1)}" fill="${fills[k]??'#27272a'}"/>`).join('')}${seats?`<text x="180" y="-12" text-anchor="middle" class="el-house-label">${need} TO GOVERN</text><line x1="180" x2="180" y1="-6" y2="4" class="el-house-tick"/>`:''}<text x="180" y="168" text-anchor="middle" class="el-house-total">${blocs.other||seats||'—'}</text><text x="180" y="184" text-anchor="middle" class="el-house-label">${blocs.other?'UNALIGNED':'SEATS'}</text></svg>`;
    const blocText=(bloc:'left'|'right')=>order.filter(p=>blocOf(p.abbrev)===bloc).map(p=>p.abbrev==='TPMAO'?'Te Pāti Māori':p.abbrev==='GP'?'Greens':p.name.replace(/ Party$| New Zealand$/,'')).join(', ');
    const shown=b.parties.filter(p=>p.seats>0||p.percent>=1);
    const rest=b.parties.filter(p=>!shown.includes(p));
    const restVotes=rest.reduce((s,p)=>s+p.votes,0),restPct=rest.reduce((s,p)=>s+p.percent,0);
    const maxPct=Math.max(10,...shown.map(p=>p.percent));
    const rows=shown.map(p=>`<tr><th scope="row"><span class="el-swatch" style="--pc:${partyColour(p)}"></span>${esc(p.name)}</th>
      <td><span class="el-bar-cell"><span class="el-bar"><span style="width:${p.percent/maxPct*100}%;--pc:${partyColour(p)}"></span></span><span class="el-num">${formatPct(p.percent)}</span></span></td>
      <td class="el-num el-hide-sm">${formatInt(p.votes)}</td><td class="el-num el-hide-sm">${p.electorateSeats}</td><td class="el-num el-hide-sm">${p.listSeats}</td><td class="el-num el-strong">${p.seats}</td></tr>`).join('');
    return `<section class="el-card el-seats" aria-labelledby="el-seats-title">
      <div class="el-card-head"><h2 id="el-seats-title">Votes &amp; seats</h2><p class="el-card-note">Seats as allocated by the Commission on the count so far</p></div>
      <div class="el-seats-grid">
        <figure class="el-house-wrap"><div class="el-chamber"><p class="el-bloc" data-bloc="left" data-won="${blocs.left>=need&&seats>0}"><strong>${blocs.left}</strong><span>Left</span><small>${esc(blocText('left'))||'Labour, Greens, Te Pāti Māori'}</small></p>${svg}<p class="el-bloc" data-bloc="right" data-won="${blocs.right>=need&&seats>0}"><strong>${blocs.right}</strong><span>Right</span><small>${esc(blocText('right'))||'National, ACT, NZ First'}</small></p></div><figcaption class="el-chamber-note">Left ${blocs.left} · unaligned ${blocs.other} · right ${blocs.right}. ${seats?`${need} needed in a ${seats}-seat Parliament${seats>120?` (incl. ${seats-120} overhang)`:''}.`:''}</figcaption><figcaption class="el-legend">${order.map(p=>`<span><span class="el-swatch" style="--pc:${partyColour(p)}"></span>${esc(p.abbrev)} <strong>${p.seats}</strong></span>`).join('')}</figcaption></figure>
        <div class="el-table-wrap"><table class="el-table">
          <thead><tr><th scope="col">Party</th><th scope="col">Party vote</th><th scope="col" class="el-num el-hide-sm">Votes</th><th scope="col" class="el-num el-hide-sm" title="Electorate seats">Elec.</th><th scope="col" class="el-num el-hide-sm" title="List seats">List</th><th scope="col" class="el-num">Seats</th></tr></thead>
          <tbody>${rows||'<tr><td colspan="6" class="el-muted">No party votes counted yet.</td></tr>'}${rest.length?`<tr class="el-other"><th scope="row"><span class="el-swatch" style="--pc:#3f3f46"></span>${rest.length} other parties</th><td><span class="el-bar-cell"><span class="el-bar"><span style="width:${restPct/maxPct*100}%;--pc:#52525c"></span></span><span class="el-num">${formatPct(restPct)}</span></span></td><td class="el-num el-hide-sm">${formatInt(restVotes)}</td><td class="el-num el-hide-sm">0</td><td class="el-num el-hide-sm">0</td><td class="el-num el-strong">0</td></tr>`:''}</tbody>
        </table></div>
      </div>
    </section>
    ${this.coalition(seated,seats,need)}
    ${this.tiles()}`;
  }
  /** Left-to-right seating for the house diagram: a conventional left/right reading, then anything else. */
  private side(p:FeedParty){const order=[...BLOCS.left,'*',...BLOCS.right] as string[];const i=order.indexOf(p.abbrev);return i<0?order.indexOf('*'):i;}
  private coalition(seated:FeedParty[],seats:number,need:number):string{
    const chosen=seated.filter(p=>this.saved.coalition.includes(p.id));
    const sum=chosen.reduce((s,p)=>s+p.seats,0),won=seats>0&&sum>=need;
    const width=seats?Math.min(100,sum/seats*100):0;
    return `<section class="el-card" aria-labelledby="el-coalition-title">
      <div class="el-card-head"><h2 id="el-coalition-title">Build a government</h2><p class="el-card-note">Pick parties to see whether they reach ${seats?need:'a majority'}</p></div>
      <div class="el-coalition-parties">${seated.length?seated.map(p=>`<button type="button" class="el-toggle" data-party="${p.id}" aria-pressed="${chosen.includes(p)}" style="--pc:${partyColour(p)};--pi:${inkOn(partyColour(p))}"><span class="el-swatch"></span>${esc(p.abbrev)}<strong>${p.seats}</strong></button>`).join(''):'<p class="el-muted">Parties appear here once seats are allocated.</p>'}</div>
      <div class="el-majority" data-won="${won}">
        <div class="el-majority-bar"><span style="width:${width}%">${chosen.map(p=>`<i style="flex:${p.seats};--pc:${partyColour(p)}"></i>`).join('')}</span><b style="left:${seats?need/seats*100:50}%" aria-hidden="true"></b></div>
        <p role="status"><strong>${sum}</strong> of ${seats||'—'} seats · ${chosen.length?won?`a majority with ${sum-need+1} to spare`:`${need-sum} short of a majority`:'no parties selected'}</p>
      </div>
    </section>`;
  }
  private tiles():string{
    const b=this.bundle!,leads=electorateLeads(b),codes=tileCodes(b.electorates);
    const group=(kind:'general'|'maori',title:string)=>{
      const list=b.electorates.filter(e=>e.kind===kind).sort((a,c)=>a.name.localeCompare(c.name));
      return `<h3 class="el-sub">${title} <span>${list.length}</span></h3><div class="el-tiles">${list.map(e=>{
        const l=lead(e),p=l.leader?this.party(l.leader.party):undefined,colour=l.leader?partyColour(p??INDEPENDENT):'';
        const label=`${e.name}: ${l.leader?`${candidateName(l.leader.name)} (${p?.abbrev??'Independent'}) leads by ${formatInt(l.margin)}`:'no votes counted'}, ${formatPct(e.placesPercent,0)} counted`;
        return `<a class="el-tile" href="#/election/e/${e.id}" data-final="${e.final}" style="${colour?`--pc:${colour};--pi:${inkOn(colour)}`:''}" title="${esc(label)}" aria-label="${esc(label)}"><span>${esc(codes.get(e.id)??'')}</span></a>`;
      }).join('')}</div>`;
    };
    const legend=[...leads.entries()].sort((a,c)=>c[1]-a[1]).map(([id,n])=>{const p=this.party(id);return `<span><span class="el-swatch" style="--pc:${partyColour(p??INDEPENDENT)}"></span>${esc(p?.abbrev??'IND')} <strong>${n}</strong></span>`;}).join('');
    return `<section class="el-card" aria-labelledby="el-leads-title">
      <div class="el-card-head"><h2 id="el-leads-title">Electorate leads</h2><p class="el-card-note">Each square is an electorate, coloured by the party of the candidate ahead. Solid when final.</p></div>
      ${legend?`<p class="el-legend">${legend}</p>`:''}
      ${group('general','General electorates')}${group('maori','Māori electorates')}
    </section>`;
  }

  /* Electorates */
  private electorates():string{
    const b=this.bundle!,f=this.filter,leaders=[...electorateLeads(b).keys()].map(id=>this.party(id)??{...INDEPENDENT,name:'Independent'}).sort((a,c)=>a.name.localeCompare(c.name));
    const sorts:[SortKey,string][]=[['name','Name'],['margin','Closest'],['counted','Most counted'],['votes','Most votes']];
    const statuses:[CountStatus,string][]=[['all','Any status'],['counting','Counting'],['complete','Complete'],['none','No results yet']];
    return `<section class="el-card" aria-labelledby="el-list-title">
      <div class="el-card-head"><h2 id="el-list-title">Electorate results</h2><p class="el-card-note" data-field="count"></p></div>
      <div class="el-filters">
        <label class="el-search">${icon(ICONS.search)}<span class="sr-only">Search electorates or candidates</span><input type="search" data-filter="query" placeholder="Search electorates or candidates" value="${esc(f.query)}" autocomplete="off"></label>
        <div class="el-seg" role="group" aria-label="Electorate type">${(['all','general','maori'] as const).map(k=>`<button type="button" class="ui-pill" data-kind="${k}" aria-pressed="${f.kind===k}">${k==='all'?'All':k==='general'?'General':'Māori'}</button>`).join('')}</div>
        <label class="el-select"><span>Leader</span><select data-filter="party"><option value="all">Any party</option>${leaders.map(p=>`<option value="${p.id}"${f.party===p.id?' selected':''}>${esc(p.name)}</option>`).join('')}</select></label>
        <label class="el-select"><span>Status</span><select data-filter="status">${statuses.map(([k,l])=>`<option value="${k}"${f.status===k?' selected':''}>${l}</option>`).join('')}</select></label>
        <label class="el-select"><span>Sort</span><select data-filter="sort">${sorts.map(([k,l])=>`<option value="${k}"${f.sort===k?' selected':''}>${l}</option>`).join('')}</select></label>
        <label class="el-check"><input type="checkbox" data-filter="close"${f.close?' checked':''}><span>Close races (under 5%)</span></label>
      </div>
      <div class="el-rows" data-field="rows"></div>
    </section>`;
  }
  private renderRows(){
    const host=this.page.querySelector<HTMLElement>('[data-field="rows"]');if(!host||!this.bundle)return;
    const rows=filterElectorates(this.bundle,this.filter);
    this.field('count').textContent=`${rows.length} of ${this.bundle.electorates.length} electorates`;
    host.innerHTML=rows.length?`<div class="el-row el-row-head" aria-hidden="true"><span>Electorate</span><span>Leading</span><span class="el-hide-sm">Margin</span><span class="el-hide-sm">Counted</span></div>`+rows.map(row=>{
      const e=row.electorate,l=row.leader,p=l?this.party(l.party):undefined;
      return `<a class="el-row" href="#/election/e/${e.id}">
        <span class="el-row-name"><strong>${esc(e.name)}</strong><small>${e.kind==='maori'?'Māori':'General'} · ${({complete:'Complete',counting:'Counting',none:'No results yet'})[countStatus(e)]}</small></span>
        <span class="el-row-lead">${l?`${this.chip(l.party)}<span>${esc(candidateName(l.name))}</span>`:'<span class="el-muted">Awaiting votes</span>'}</span>
        <span class="el-row-margin el-num">${l?`+${formatInt(row.margin)}<small>${formatPct(row.marginPercent)}</small>`:'—'}</span>
        <span class="el-row-count"><span class="el-meter"><span style="width:${e.placesPercent}%"></span></span><small>${formatPct(e.placesPercent,0)}</small></span>
        <span class="sr-only">${l?`, ${p?.name??'Independent'}, ahead by ${formatInt(row.margin)} votes`:''}, ${formatPct(e.placesPercent,0)} of voting places counted</span>
      </a>`;}).join(''):'<p class="el-empty">No electorates match these filters.</p>';
  }
  private electorate(id:number):string{
    const e=this.bundle!.electorates.find(x=>x.id===id);
    if(!e)return `<div class="el-empty"><p>That electorate isn’t in this election.</p><a class="game-button secondary" href="#/election/electorates">All electorates</a></div>`;
    const l=lead(e),cTotal=e.candidates.reduce((s,c)=>s+c.votes,0),pTotal=e.partyVotes.reduce((s,v)=>s+v.votes,0);
    const max=Math.max(1,...e.candidates.map(c=>c.votes));
    const pMax=Math.max(1,...e.partyVotes.map(v=>v.votes));
    return `<a class="el-crumb" href="#/election/electorates">${icon(ICONS.back)}All electorates</a>
    <section class="el-card el-detail" aria-labelledby="el-detail-title">
      <div class="el-card-head"><div><p class="el-eyebrow">${e.kind==='maori'?'Māori electorate':'General electorate'}${e.final?' · Final':''}</p><h2 id="el-detail-title" tabindex="-1">${esc(e.name)}</h2></div>
        ${l.leader?`<p class="el-detail-lead">${this.chip(l.leader.party)} <strong>${esc(candidateName(l.leader.name))}</strong> leads by ${formatInt(l.margin)}</p>`:''}</div>
      <dl class="el-facts">
        <div><dt>Voting places</dt><dd>${formatInt(e.placesCounted)} of ${formatInt(e.placesTotal)} <small>(${formatPct(e.placesPercent)})</small></dd></div>
        <div><dt>Votes cast</dt><dd>${formatInt(e.votesCast)}</dd></div>
        <div><dt>Informal votes</dt><dd>${formatInt(e.candidateInformals)} candidate · ${formatInt(e.partyInformals)} party</dd></div>
        <div><dt>Updated</dt><dd>${e.updated?feedTime(e.updated):'Not yet'}</dd></div>
      </dl>
      ${e.available?'':'<p class="el-note">This electorate’s results file did not answer. Showing candidates only.</p>'}
      <div class="el-detail-grid">
        <div><h3 class="el-sub">Candidate vote</h3><ol class="el-bars">${e.candidates.map((c,i)=>`<li><span class="el-bars-label">${i===0&&c.votes>0?'<span class="el-lead-mark" aria-label="Leading">●</span>':''}${esc(candidateName(c.name))} ${this.chip(c.party)}</span><span class="el-bar"><span style="width:${c.votes/max*100}%;--pc:${partyColour(this.party(c.party)??INDEPENDENT)}"></span></span><span class="el-num">${formatInt(c.votes)}<small>${cTotal?formatPct(c.votes/cTotal*100):''}</small></span></li>`).join('')}</ol></div>
        <div><h3 class="el-sub">Party vote here</h3>${e.partyVotes.length?`<ol class="el-bars">${e.partyVotes.slice(0,10).map(v=>{const p=this.party(v.party);return `<li><span class="el-bars-label">${esc(p?.name??`Party ${v.party}`)}</span><span class="el-bar"><span style="width:${v.votes/pMax*100}%;--pc:${partyColour(p)}"></span></span><span class="el-num">${formatInt(v.votes)}<small>${pTotal?formatPct(v.votes/pTotal*100):''}</small></span></li>`;}).join('')}</ol>`:'<p class="el-muted">No party votes counted yet.</p>'}</div>
      </div>
    </section>`;
  }

  /* Who's in */
  private members():string{
    const groups=whoIsIn(this.bundle!);
    if(!groups.length)return '<div class="el-empty"><p>Members appear once seats are allocated.</p></div>';
    return `<section class="el-card" aria-labelledby="el-members-title"><div class="el-card-head"><h2 id="el-members-title">Who’s in on these numbers</h2><p class="el-card-note">Electorate leaders first, then each party’s list in rank order. The list skips candidates already in on an electorate.</p></div>
      <div class="el-members">${groups.map(g=>{const c=partyColour(g.party);return `<article class="el-member-card" style="--pc:${c}">
        <header><span class="el-swatch"></span><h3>${esc(g.party.name)}</h3><strong>${g.party.seats}</strong></header>
        <p class="el-member-sub">${g.party.electorateSeats} electorate · ${g.party.listSeats} list</p>
        ${g.electorate.length?`<h4>Electorates</h4><ul>${g.electorate.map(m=>`<li><span>${esc(m.name)}</span><small>${esc(m.seat)}</small></li>`).join('')}</ul>`:''}
        ${g.list.length?`<h4>List</h4><ol>${g.list.map((m,i)=>`<li${i===g.list.length-1?' class="el-last-in"':''}><span>${esc(m.name)}</span><small>#${m.rank}${i===g.list.length-1?' · last in':''}</small></li>`).join('')}</ol>`:''}
        ${g.next?`<p class="el-next">Next in: <strong>${esc(g.next.name)}</strong> <small>#${g.next.rank}</small></p>`:''}
      </article>`;}).join('')}</div></section>`;
  }

  /* Trends */
  private trends():string{
    const b=this.bundle!,points=this.saved.trend;
    const ids=[...new Set(points.flatMap(p=>Object.keys(p.shares).map(Number)))].filter(id=>points.some(p=>(p.shares[id]??0)>=1));
    const W=640,H=260,L=36,R=56,T=12,B=30;
    const maxY=Math.max(10,Math.ceil(Math.max(0,...points.flatMap(p=>Object.values(p.shares)))/10)*10);
    const x=(c:number)=>L+(W-L-R)*Math.min(100,Math.max(0,c))/100,y=(v:number)=>T+(H-T-B)*(1-v/maxY);
    const grid=Array.from({length:maxY/10+1},(_,k)=>k*10).map(v=>`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${v}%</text>`).join('');
    const xTicks=[0,25,50,75,100].map(c=>`<text x="${x(c)}" y="${H-10}" text-anchor="middle">${c}%</text>`).join('');
    const ends:{y:number;id:number}[]=[];
    const lines=ids.map(id=>{
      const p=this.party(id),colour=partyColour(p),pts=points.filter(pt=>pt.shares[id]!==undefined);
      if(!pts.length)return '';
      const last=pts[pts.length-1];ends.push({y:y(last.shares[id]),id});
      return `<polyline fill="none" stroke="${colour}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${pts.map(pt=>`${x(pt.counted).toFixed(1)},${y(pt.shares[id]).toFixed(1)}`).join(' ')}"/>${pts.length===1?`<circle cx="${x(last.counted)}" cy="${y(last.shares[id])}" r="3.5" fill="${colour}"/>`:''}`;
    }).join('');
    // End labels, nudged apart so they never overlap.
    ends.sort((a,c)=>a.y-c.y);for(let k=1;k<ends.length;k++)if(ends[k].y-ends[k-1].y<13)ends[k].y=ends[k-1].y+13;
    const labels=ends.map(e=>{const p=this.party(e.id);return `<text x="${W-R+6}" y="${e.y+4}" class="el-trend-label" fill="${partyColour(p)}">${esc(p?.abbrev??'')}</text>`;}).join('');
    const chart=points.length?`<svg class="el-trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Party vote share against voting places counted, from ${points.length} updates recorded on this device."><g class="el-grid">${grid}${xTicks}</g>${lines}${labels}</svg>
      <p class="el-card-note">Horizontal axis: voting places counted. ${points.length} update${points.length===1?'':'s'} recorded since you opened Results Desk on this device.</p>`
      :`<div class="el-empty"><p>Waiting for vote share data. Lines start drawing from the first counted update.</p></div>`;
    const close=b.electorates.map(lead).filter(l=>l.leader&&l.runnerUp&&l.runnerUp.votes>0).sort((a,c)=>a.marginPercent-c.marginPercent).slice(0,8);
    const recent=[...b.electorates].filter(e=>e.updated).sort((a,c)=>c.updated.localeCompare(a.updated)||c.placesPercent-a.placesPercent).slice(0,8);
    const item=(e:FeedElectorate,extra:string)=>`<li><a href="#/election/e/${e.id}"><span><strong>${esc(e.name)}</strong>${extra}</span><small>${formatPct(e.placesPercent,0)} counted</small></a></li>`;
    return `<section class="el-card" aria-labelledby="el-trend-title"><div class="el-card-head"><h2 id="el-trend-title">Vote share over time</h2></div>${chart}
      ${ids.length?`<p class="el-legend">${ids.map(id=>{const p=this.party(id);return `<span><span class="el-swatch" style="--pc:${partyColour(p)}"></span>${esc(p?.name??'')}</span>`;}).join('')}</p>`:''}</section>
    <section class="el-card" aria-labelledby="el-feed-title"><div class="el-card-head"><h2 id="el-feed-title">As it happens</h2><p class="el-card-note">Lead changes, finished electorates and count milestones, noticed while this page is open</p></div>
      ${this.saved.events.length?`<ol class="el-feed">${[...this.saved.events].reverse().slice(0,30).map(ev=>`<li data-kind="${ev.kind}"><time>${esc(feedTime(ev.at).replace(' NZ time',''))}</time>${ev.electorate?`<a href="#/election/e/${ev.electorate}">${esc(ev.text)}</a>`:`<span>${esc(ev.text)}</span>`}</li>`).join('')}</ol>`:'<p class="el-muted">Nothing yet. Events appear here as the next updates arrive.</p>'}
    </section>
    ${this.pace()}
    <div class="el-two">
      <section class="el-card" aria-labelledby="el-close-title"><div class="el-card-head"><h2 id="el-close-title">Closest races</h2></div>${close.length?`<ol class="el-list">${close.map(l=>item(l.electorate,`<span class="el-list-sub">${this.chip(l.leader!.party)} vs ${this.chip(l.runnerUp!.party)} · ${formatInt(l.margin)} votes (${formatPct(l.marginPercent)})</span>`)).join('')}</ol>`:'<p class="el-muted">Close races show once two candidates have votes.</p>'}</section>
      <section class="el-card" aria-labelledby="el-recent-title"><div class="el-card-head"><h2 id="el-recent-title">Recently updated</h2></div>${recent.length?`<ol class="el-list">${recent.map(e=>item(e,`<span class="el-list-sub">${feedTime(e.updated)}</span>`)).join('')}</ol>`:'<p class="el-muted">No electorate has reported yet.</p>'}</section>
    </div>`;
  }

  /** How far the preliminary count has got, with halfway and complete marked. */
  private pace():string{
    const b=this.bundle!,pct=b.stats.placesPercent;
    const marks=[[25,'25%'],[50,'Half'],[75,'75%']] as const;
    return `<section class="el-card" aria-labelledby="el-pace-title"><div class="el-card-head"><h2 id="el-pace-title">The pace of the count</h2><p class="el-card-note">${formatInt(b.stats.placesCounted)}${b.stats.placesTotal?` of ${formatInt(b.stats.placesTotal)}`:''} voting place results in</p></div>
      <div class="el-pace"><span class="el-pace-fill" style="width:${Math.min(100,pct)}%"></span>${marks.map(([m,l])=>`<span class="el-pace-mark" style="left:${m}%"><small>${l}</small></span>`).join('')}<strong>${formatPct(pct)}</strong></div>
      <p class="el-muted">${b.electorates.filter(e=>countStatus(e)==='complete').length} complete · ${b.electorates.filter(e=>countStatus(e)==='counting').length} counting · ${b.electorates.filter(e=>countStatus(e)==='none').length} with no results yet</p></section>`;
  }

  private readonly onClick=(event:Event)=>{
    const target=event.target as Element;
    if(target.closest('[data-action="retry"]')){void this.refresh(true);return;}
    const toggle=target.closest<HTMLButtonElement>('.el-toggle');
    if(toggle){
      const id=Number(toggle.dataset.party),set=new Set(this.saved.coalition);
      if(set.has(id))set.delete(id);else set.add(id);
      this.saved.coalition=[...set];this.persist();
      const card=toggle.closest('.el-card')!,b=this.bundle!,seats=totalSeats(b);
      card.outerHTML=this.coalition(b.parties.filter(p=>p.seats>0),seats,majority(seats));
      this.page.querySelector<HTMLElement>(`.el-toggle[data-party="${id}"]`)?.focus();
      return;
    }
    const kind=target.closest<HTMLButtonElement>('[data-kind]');
    if(kind){
      this.filter.kind=kind.dataset.kind as ElectorateFilter['kind'];
      for(const b of this.page.querySelectorAll('[data-kind]'))b.setAttribute('aria-pressed',String(b===kind));
      this.renderRows();
    }
  };
  private readonly onInput=(event:Event)=>{
    const el=event.target as HTMLInputElement|HTMLSelectElement;
    const key=el.dataset.filter;if(!key)return;
    if(key==='query')this.filter.query=el.value;
    else if(key==='party')this.filter.party=el.value==='all'?'all':Number(el.value);
    else if(key==='sort')this.filter.sort=el.value as SortKey;
    else if(key==='status')this.filter.status=el.value as CountStatus;
    else if(key==='close')this.filter.close=(el as HTMLInputElement).checked;
    this.renderRows();
  };
}
