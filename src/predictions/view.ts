import './style.css';
import type {AppDeps,AppView} from '../apps/types';
import {ApiError} from '../apps/api';
import {appIcon} from '../apps/icons';
import {uiIcon} from '../ui/icons';
import {bindGlass} from '../ui/glass';
import {openSheet} from '../ui/sheet';
import {autoHideTabbar} from '../ui/tabbar';
import {createSectionNavigation} from '../ui/navigation';
import {PredictionsClient,operationKey} from './client';
import {VIEWS,chartGeometry,closingText,exploreHash,formatDay,formatWhen,fromLocalInput,parseRoute,toLocalInput,type Route} from './model';
import {
 CATEGORIES,CATEGORY_LABEL,ERROR_TEXT,QUICK_AMOUNTS,REPORT_REASONS,TRADE_MIN,displayState,formatCredits,formatPercent,formatShares,parseCredits,validateDraft,
 type DraftInput,type DraftErrors,type MarketDetail,type MarketState,type MarketSummary,type Me,type Operation,type Outcome,type Portfolio,type Quote,type Receipt,
 type ReviewQueue,type Side,type Submission,
} from './shared';

const esc=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const DRAFT_KEY='qcc:predictions:draft:v1';
const SIDE_LABEL={yes:'YES',no:'NO'} as const;
const OUTCOME_LABEL={yes:'YES',no:'NO',void:'VOID'} as const;
const icon=(d:string)=>`<svg class="pr-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
const ICONS={back:'m12 5-7 7 7 7M5 12h14',plus:'M12 5v14M5 12h14',check:'m5 12.5 4.5 4.5L19 7',close:'m6 6 12 12M6 18 18 6',coin:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v10m-3-7.5c0-1 1.3-1.8 3-1.8s3 .8 3 1.8-1.3 1.6-3 1.6-3 .8-3 1.9 1.3 1.8 3 1.8 3-.8 3-1.8',source:'M4 5h16M4 12h10M4 19h7',shield:'M12 3 5 6v6c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6z'};
const errorText=(error:unknown,fallback='Something went wrong. Try again.')=>{
 if(error instanceof ApiError)return ERROR_TEXT[error.code]??error.message??fallback;
 return fallback;
};
const credits=(micro:number,exact=false)=>`${formatCredits(micro,exact)} credit${micro===1_000_000&&!exact?'':'s'}`;
const stateBadge=(state:MarketState,fixture=false)=>`<span class="pr-badge" data-state="${state}">${esc(displayState(state))}</span>${fixture?'<span class="pr-badge" data-state="fixture">Development fixture</span>':''}`;

/** Predictions at `#/predictions`: free play-credit forecasting markets. The server is the only authority for credits. */
export class PredictionsView implements AppView {
 private readonly root=document.createElement('section');
 private readonly navigation=createSectionNavigation('predictions');
 private readonly menuGlass=bindGlass(this.navigation.menu);
 private readonly hideTabbar:{dispose():void;reset():void};
 private readonly client:PredictionsClient;
 private readonly panel=document.createElement('div');
 private readonly live=document.createElement('p');
 private readonly offline=document.createElement('p');
 private readonly sheet=document.createElement('dialog');
 private readonly offAccounts:()=>void;
 private me:Me|null=null;
 private route:Route={kind:'explore',view:'all',category:'',q:''};
 private abort:AbortController|undefined;
 private generation=0;
 private disposed=false;
 private detail:MarketDetail|null=null;
 private ticket:Ticket|null=null;
 private flow:TradeFlow;
 private searchTimer:number|undefined;

 constructor(container:HTMLElement,private readonly deps:AppDeps){
  this.client=new PredictionsClient(()=>deps.accounts.session()?.token??null);
  const root=this.root;
  root.className='pr-view';root.setAttribute('aria-labelledby','pr-brand');
  root.innerHTML=`<header class="pr-top">
    <a class="pr-back" href="#/collection">${icon(ICONS.back)}<span>Games</span></a>
    <p class="pr-brand" id="pr-brand"><span class="pr-mark" aria-hidden="true">${icon(ICONS.coin)}</span>Predictions</p>
    <div class="pr-top-actions"><span class="pr-balance" data-field="balance" hidden></span><a class="pr-ask" href="#/predictions/ask">${icon(ICONS.plus)}<span>Ask a question</span></a></div>
   </header>`;
  this.offline.className='pr-offline';this.offline.hidden=true;this.offline.setAttribute('role','status');
  this.offline.textContent="You're offline. Showing what was last loaded; predictions can't be placed until you reconnect.";
  this.panel.className='pr-panel';this.panel.tabIndex=-1;
  this.live.className='sr-only';this.live.setAttribute('role','status');this.live.setAttribute('aria-live','polite');
  this.sheet.id='predictions-trade';this.sheet.className='ui-glass-sheet pr-sheet';this.sheet.setAttribute('aria-labelledby','pr-sheet-title');
  const nav=this.navigation;
  nav.bar.innerHTML=`<a class="ui-tab" href="#/collection">${uiIcon('games')}<span>Games</span></a><a class="ui-tab" href="#/predictions" data-tab="explore">${appIcon('discover')}<span>Explore</span></a><a class="ui-tab" href="#/predictions/calls" data-tab="calls">${appIcon('profile')}<span>My calls</span></a><a class="ui-tab" href="#/predictions/rankings" data-tab="rankings">${appIcon('activity')}<span>Rankings</span></a>`;
  nav.menu.addEventListener('click',()=>deps.openMenu());
  root.append(this.offline,this.panel,this.live,this.sheet,nav.root);
  container.replaceChildren(root);
  this.hideTabbar=autoHideTabbar(nav.bar,window);
  this.flow=new TradeFlow(this.sheet,this.client,{
   announce:text=>this.announce(text),
   done:receipt=>{this.updateBalance(receipt.balanceAfter);if(this.route.kind==='market'&&this.route.id===receipt.marketId)void this.show(false);},
   offline:()=>navigator.onLine===false,
  });
  root.addEventListener('click',this.onClick);
  root.addEventListener('submit',this.onSubmit);
  root.addEventListener('input',this.onInput);
  window.addEventListener('offline',this.onConnection);window.addEventListener('online',this.onConnection);
  this.onConnection();
  let identity=deps.accounts.session()?.token??null;
  this.offAccounts=deps.accounts.onChange(()=>{
   const next=deps.accounts.session()?.token??null;if(next===identity)return;identity=next;
   this.me=null;this.flow.close();void this.show(true);
  });
 }

 navigate(hash:string):void{
  this.route=parseRoute(hash);
  for(const link of this.navigation.bar.querySelectorAll<HTMLElement>('[data-tab]')){
   const tab=link.dataset.tab,on=tab===(this.route.kind==='market'||this.route.kind==='ask'||this.route.kind==='review'||this.route.kind==='missing'?'':this.route.kind==='explore'?'explore':this.route.kind);
   if(on)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  }
  void this.show(true);
 }
 pause():void{this.ticket?.cancel();}
 resume():void{}
 dispose():void{
  if(this.disposed)return;
  this.disposed=true;this.generation++;this.abort?.abort();this.ticket?.cancel();this.flow.dispose();
  clearTimeout(this.searchTimer);
  this.root.removeEventListener('click',this.onClick);this.root.removeEventListener('submit',this.onSubmit);this.root.removeEventListener('input',this.onInput);
  window.removeEventListener('offline',this.onConnection);window.removeEventListener('online',this.onConnection);
  this.offAccounts();this.hideTabbar.dispose();this.menuGlass.dispose();
  if(this.sheet.open)this.sheet.close();
  this.root.remove();
 }

 private announce(text:string){this.live.textContent='';this.live.textContent=text;}
 private readonly onConnection=()=>{this.offline.hidden=navigator.onLine!==false;this.root.toggleAttribute('data-offline',navigator.onLine===false);};
 private updateBalance(balance:number|null){
  if(this.me)this.me={...this.me,balance};
  const pill=this.root.querySelector<HTMLElement>('[data-field="balance"]')!;
  pill.hidden=balance===null;
  if(balance!==null)pill.innerHTML=`${icon(ICONS.coin)}<span><strong>${formatCredits(balance)}</strong> <span class="pr-hide-xs">credits</span></span>`;
  pill.setAttribute('aria-label',balance===null?'':`Balance: ${credits(balance)}`);
 }

 private async loadMe(signal:AbortSignal){
  this.me=await this.client.me(signal);
  this.updateBalance(this.me.eligible?this.me.balance:null);
 }
 /** Loads and renders the current route. One request set at a time; older results are discarded. */
 private async show(focus:boolean){
  if(this.disposed)return;
  const token=++this.generation;
  this.abort?.abort();const abort=this.abort=new AbortController();
  this.ticket?.cancel();this.ticket=null;
  if(!this.me)this.panel.innerHTML='<div class="pr-loading" aria-busy="true"><span></span><span></span><span></span></div>';
  try{
   if(!this.me)await this.loadMe(abort.signal);
   if(token!==this.generation)return;
   if(!this.me!.enabled){this.panel.innerHTML=`<div class="pr-empty"><h1>Predictions is not open yet</h1><p>It's being tested before launch. Check back soon.</p><a class="pr-button" href="#/collection">Back to games</a></div>`;return;}
   const r=this.route;
   if(r.kind==='explore')await this.renderExplore(r,abort.signal);
   else if(r.kind==='market')await this.renderMarket(r.id,r.side,abort.signal);
   else if(r.kind==='calls')await this.renderCalls(abort.signal);
   else if(r.kind==='rankings')await this.renderRankings(abort.signal);
   else if(r.kind==='ask')await this.renderAsk(r.id,abort.signal);
   else if(r.kind==='review')await this.renderReview(abort.signal);
   else this.panel.innerHTML=`<div class="pr-empty"><h1>Not found</h1><p>That Predictions page doesn't exist.</p><a class="pr-button" href="#/predictions">Explore questions</a></div>`;
   if(token!==this.generation)return;
   if(focus){this.panel.querySelector<HTMLElement>('h1')?.setAttribute('tabindex','-1');this.panel.querySelector<HTMLElement>('h1')?.focus({preventScroll:true});window.scrollTo({top:0});this.hideTabbar.reset();}
  }catch(error){
   if(abort.signal.aborted||token!==this.generation)return;
   if(error instanceof ApiError&&error.status===401){this.me=null;this.panel.innerHTML=this.signInCard('Your session ended. Log in again to continue.');return;}
   this.panel.innerHTML=`<div class="pr-empty" role="alert"><h1>Predictions is unavailable</h1><p>${esc(errorText(error,'Predictions could not load. Your credits are safe on the server.'))}</p><button type="button" class="pr-button" data-action="retry">Try again</button></div>`;
  }
 }

 // ---- Explore ----
 private joinCard():string{
  const me=this.me!;
  if(!me.signedIn)return this.signInCard();
  if(me.eligible)return '';
  return `<section class="pr-join" aria-labelledby="pr-join-title">
   <div><h2 id="pr-join-title">Join Predictions</h2>
   <p>Every Monday you get <strong>${credits(me.weeklyGrant)}</strong> to spend on YES or NO. Unused credits carry over.</p>
   <ul class="pr-join-rules"><li>Credits are free and have no cash value. They can't be bought, sold, sent to anyone or swapped for prizes.</li>
   <li>A correct share pays 1 credit; a wrong share pays nothing. You can sell while trading is open.</li>
   <li>Questions are about events, never about people's private lives. Every question is checked before it opens.</li></ul></div>
   <button type="button" class="pr-button pr-primary" data-action="join">Join and get ${formatCredits(me.weeklyGrant)} credits</button>
  </section>`;
 }
 private signInCard(text='Log in to make predictions. You can browse public questions without an account.'):string{
  return `<section class="pr-join"><div><h2>Log in to predict</h2><p>${esc(text)}</p></div><button type="button" class="pr-button pr-primary" data-action="login">Log in or sign up</button></section>`;
 }
 private async renderExplore(r:Extract<Route,{kind:'explore'}>,signal:AbortSignal){
  const {items}=await this.client.markets({view:r.view,category:r.category,q:r.q},signal);
  const roles=this.me?.roles??[];
  this.panel.innerHTML=`<div class="pr-head"><div><h1>Explore</h1><p class="pr-sub">${this.me?.eligible?`Next ${credits(this.me.weeklyGrant)}: ${esc(formatDay(this.me.nextGrantAt))}`:'Free weekly credits. No cash value.'}</p></div>
    ${roles.length?`<a class="pr-chip" href="#/predictions/review">${icon(ICONS.shield)}Review queue</a>`:''}</div>
   ${this.joinCard()}
   ${this.me?.tradingPaused?'<p class="pr-note" role="status">Trading is paused right now. Your credits and positions are safe.</p>':''}
   <form class="pr-filters" role="search" data-form="search"><label class="sr-only" for="pr-search">Search questions</label>
    <input id="pr-search" type="search" name="q" value="${esc(r.q)}" placeholder="Search questions" autocomplete="off" maxlength="60" enterkeyhint="search">
    <label class="sr-only" for="pr-category">Category</label><select id="pr-category" name="category"><option value="">All categories</option>${CATEGORIES.map(c=>`<option value="${c}"${c===r.category?' selected':''}>${CATEGORY_LABEL[c]}</option>`).join('')}</select>
   </form>
   <nav class="pr-views" aria-label="Question lists">${VIEWS.map(([v,label])=>`<a class="pr-pill" href="${exploreHash(v,r.category,r.q)}"${v===r.view?' aria-current="page"':''}>${label}</a>`).join('')}</nav>
   ${items.length?`<ul class="pr-grid" role="list">${items.map(m=>this.card(m)).join('')}</ul>`:`<div class="pr-empty"><h2>${r.q?'No questions match that search':'Nothing here yet'}</h2><p>${r.q?'Try different words, or suggest the question yourself.':'New questions appear here once they are reviewed.'}</p><a class="pr-button" href="#/predictions/ask"${r.q?` data-action="ask-with" data-q="${esc(r.q)}"`:''}>Suggest a question</a></div>`}`;
 }
 private card(m:MarketSummary):string{
  const open=m.state==='open',untouched=m.trades===0;
  const view=m.state==='resolved'||m.state==='void'?`<p class="pr-result" data-outcome="${m.outcome}">${m.outcome==='void'?'Void':`Resolved ${OUTCOME_LABEL[m.outcome!]}`}</p>`
   :`<p class="pr-view-pct"><span class="pr-pct">${formatPercent(m.yesPpm)}</span><span class="pr-pct-label">${untouched?'No predictions yet':'market view: YES'}</span></p>`;
  return `<li class="pr-card"><article aria-labelledby="pr-q-${m.id}">
   <p class="pr-card-meta"><span class="pr-cat">${CATEGORY_LABEL[m.category]}</span>${m.audience==='school'?'<span class="pr-cat">School only</span>':''}${!open?stateBadge(m.state):''}${m.fixture?'<span class="pr-badge" data-state="fixture">Development fixture</span>':''}</p>
   <h2 id="pr-q-${m.id}" class="pr-card-q"><a href="#/predictions/m/${m.id}">${esc(m.question)}</a></h2>
   ${view}
   ${open?`<div class="pr-outcomes" role="group" aria-label="Predict"><button type="button" class="pr-yes" data-action="quick" data-id="${m.id}" data-side="yes"${this.canTradeHint()}>YES <span>${formatPercent(m.yesPpm)}</span></button><button type="button" class="pr-no" data-action="quick" data-id="${m.id}" data-side="no"${this.canTradeHint()}>NO <span>${formatPercent(1e6-m.yesPpm)}</span></button></div>`:''}
   <p class="pr-card-foot"><span>${esc(closingText(m.state,m.closeAt,Date.now()))}</span><span>${m.traders} ${m.traders===1?'person':'people'}</span></p>
  </article></li>`;
 }
 private canTradeHint():string{return this.me?.eligible?'':' aria-describedby="pr-join-title"';}

 // ---- Market detail ----
 private async renderMarket(id:string,side:Side|null,signal:AbortSignal){
  const m=this.detail=await this.client.market(id,signal);
  const start=Date.parse(m.publishedAt??m.rules.closeAt),end=Math.min(Date.now(),Date.parse(m.closeAt));
  const chart=chartGeometry(m.history,start,Math.max(start+1,end),600,180);
  const held=m.positions.filter(p=>p.shares>0);
  this.panel.innerHTML=`<nav class="pr-crumbs" aria-label="Breadcrumb"><a href="#/predictions">Explore</a><span aria-hidden="true">/</span><span>${CATEGORY_LABEL[m.category]}</span></nav>
   <div class="pr-detail">
    <div class="pr-main">
     <p class="pr-card-meta"><span class="pr-cat">${CATEGORY_LABEL[m.category]}</span>${m.audience==='school'?'<span class="pr-cat">School only</span>':''}${stateBadge(m.state,m.fixture)}</p>
     <h1 class="pr-title">${esc(m.question)}</h1>
     <div class="pr-stats">
      ${m.state==='resolved'||m.state==='void'?`<p class="pr-result pr-big" data-outcome="${m.outcome}">${m.outcome==='void'?'Void · 0.50 per share':`Resolved ${OUTCOME_LABEL[m.outcome!]}`}</p>`
       :`<p><span class="pr-pct pr-big">${formatPercent(m.yesPpm,1)}</span><span class="pr-pct-label">${m.trades?'market view: YES':'No predictions yet'}</span></p>`}
      <dl class="pr-facts"><div><dt>Trading closes</dt><dd>${esc(formatWhen(m.closeAt))}</dd></div><div><dt>Result expected</dt><dd>${esc(formatWhen(m.resolveAt))}</dd></div><div><dt>People</dt><dd>${m.traders}</dd></div></dl>
     </div>
     <figure class="pr-chart"><svg viewBox="-34 -8 640 206" role="img" aria-label="${m.history.length?`YES price history: ${m.history.length} predictions, now ${formatPercent(m.yesPpm)}`:'No predictions yet: the price is still the 50% starting point'}">
      ${chart.ticks.map(t=>`<line x1="0" x2="600" y1="${t.y}" y2="${t.y}" class="pr-grid-line"/><text x="-8" y="${t.y+4}" text-anchor="end" class="pr-axis">${t.label}</text>`).join('')}
      ${chart.flat?'':`<path d="${chart.area}" class="pr-area"/>`}<path d="${chart.line}" class="pr-line${chart.flat?' pr-line-flat':''}"/>
      <circle cx="${chart.last.x}" cy="${chart.last.y}" r="4" class="pr-dot"/></svg>
      <figcaption>${m.history.length?`YES price after each prediction, on a fixed 0–100% scale.`:'No predictions yet. Untouched questions start at 50%; that is not a vote.'}</figcaption></figure>
     ${this.resolutionCard(m)}
     ${held.length||m.positions.some(p=>p.realised)?this.positionsCard(m):''}
     <section class="pr-card-block" aria-labelledby="pr-rules-title"><h2 id="pr-rules-title">How this resolves</h2>
      <dl class="pr-rules">
       <div><dt><span class="pr-tag pr-yes-tag">YES</span></dt><dd>${esc(m.rules.yesRule)}</dd></div>
       <div><dt><span class="pr-tag pr-no-tag">NO</span></dt><dd>${esc(m.rules.noRule)}</dd></div>
       <div><dt><span class="pr-tag">VOID</span></dt><dd>${esc(m.rules.voidRule)} A void pays <strong>0.50 credits per share</strong> you still hold. Sales already made stay final.</dd></div>
       <div><dt>Source</dt><dd>${esc(m.rules.source)}${m.rules.sourceFallback?`<br><span class="pr-muted">Then: ${esc(m.rules.sourceFallback)}</span>`:''}</dd></div>
       ${m.rules.disclosure?`<div><dt>Disclosure</dt><dd>${esc(m.rules.disclosure)}</dd></div>`:''}
      </dl>
      <p class="pr-muted pr-small">Rules frozen when published${m.rulesHash?` · record <code>${m.rulesHash.slice(0,12)}</code>`:''}. A reviewer with no position in this question decides the result, and anyone can challenge it for 24 hours.</p>
     </section>
     <section class="pr-card-block" aria-labelledby="pr-activity-title"><h2 id="pr-activity-title">Activity and evidence</h2>
      ${m.can.evidence?`<form class="pr-inline-form" data-form="evidence"><label for="pr-ev">Add evidence</label><textarea id="pr-ev" name="body" maxlength="500" rows="2" placeholder="What did the source say?" required></textarea><label class="sr-only" for="pr-ev-link">Link (https)</label><input id="pr-ev-link" name="link" type="url" inputmode="url" placeholder="https:// link (optional)" maxlength="300"><button class="pr-button" type="submit">Post evidence</button></form>`:''}
      <ul class="pr-feed" role="list">${[...m.evidence.map(e=>({at:e.at,html:`<li><p><strong>${esc(e.author)}</strong> · ${esc(formatWhen(e.at))}</p><p>${esc(e.body)}</p>${e.link?`<p><a href="${esc(e.link)}" rel="noopener noreferrer nofollow" target="_blank">${esc(e.link.replace(/^https:\/\//,'').slice(0,60))}</a></p>`:''}</li>`})),
       ...m.activity.map(a=>({at:a.at,html:`<li class="pr-trade"><span class="pr-tag ${a.side==='yes'?'pr-yes-tag':'pr-no-tag'}">${SIDE_LABEL[a.side]}</span> Someone ${a.op==='buy'?'predicted':'sold'} ${SIDE_LABEL[a.side]} · ${credits(a.credits)} → ${formatPercent(a.yesPpm)} · <span class="pr-muted">${esc(formatWhen(a.at))}</span></li>`}))]
        .sort((x,y)=>y.at.localeCompare(x.at)).map(x=>x.html).join('')||'<li class="pr-muted">No activity yet.</li>'}</ul>
      ${m.can.report?`<details class="pr-report"><summary>Report this question</summary><form data-form="report" class="pr-inline-form"><label for="pr-report-reason">Reason</label><select id="pr-report-reason" name="reason">${REPORT_REASONS.map(r=>`<option value="${r}">${{personal:'About a person or private matter',harmful:'Harmful or unsafe',ambiguous:'Unclear rules',duplicate:'Duplicate',already_known:'Result already known',other:'Something else'}[r]}</option>`).join('')}</select><label for="pr-report-note">Note (optional)</label><input id="pr-report-note" name="note" maxlength="300"><button class="pr-button" type="submit">Send report</button></form></details>`:''}
     </section>
    </div>
    <aside class="pr-aside" aria-label="Make a prediction"><div class="pr-ticket-host"></div></aside>
   </div>`;
  const host=this.panel.querySelector<HTMLElement>('.pr-ticket-host')!;
  if(m.state==='open'&&this.me?.eligible){
   this.ticket=new Ticket(host,this.client,m,side??'yes',this.me,(quote)=>this.flow.review(m,quote),()=>navigator.onLine===false);
   if(side)requestAnimationFrame(()=>host.querySelector<HTMLInputElement>('input[name="amount"]')?.focus({preventScroll:false}));
  }else host.innerHTML=this.ticketPlaceholder(m);
 }
 private ticketPlaceholder(m:MarketDetail):string{
  if(m.state==='open'&&!this.me?.signedIn)return `<div class="pr-ticket">${this.signInCard('Log in to predict on this question.')}</div>`;
  if(m.state==='open'&&!this.me?.eligible)return `<div class="pr-ticket"><h2>Make a prediction</h2><p>Join Predictions first. It's free and you get ${credits(this.me!.weeklyGrant)} every Monday.</p><button type="button" class="pr-button pr-primary" data-action="join">Join Predictions</button></div>`;
  const why=m.state==='closed'?'Trading has closed. No more predictions or sales; payouts wait for a reviewed result.':m.state==='paused'?'Trading is paused while moderators check this question.':m.state==='proposed'?'A result has been proposed. Payouts happen once the challenge window ends.':m.state==='disputed'?'The proposed result was challenged. An independent reviewer will decide.':m.state==='resolved'?`Resolved ${OUTCOME_LABEL[m.outcome!]}. Payouts have been made.`:m.state==='void'?'This question was voided. Each share paid 0.50 credits.':'This question is not open for predictions.';
  return `<div class="pr-ticket"><h2>${esc(displayState(m.state))}</h2><p>${esc(why)}</p>${m.settlement?.myPayout!=null?`<p class="pr-receipt-line">You received <strong>${credits(m.settlement.myPayout,true)}</strong>.</p>`:''}</div>`;
 }
 private positionsCard(m:MarketDetail):string{
  return `<section class="pr-card-block" aria-labelledby="pr-pos-title"><h2 id="pr-pos-title">Your position</h2><ul class="pr-positions" role="list">${m.positions.map(p=>`<li>
   <span class="pr-tag ${p.side==='yes'?'pr-yes-tag':'pr-no-tag'}">${SIDE_LABEL[p.side]}</span>
   <span>${p.shares?`<strong>${formatShares(p.shares)}</strong> shares · cost ${credits(p.costBasis)} · pays ${credits(p.shares)} if ${SIDE_LABEL[p.side]}`:`Closed · realised ${formatCredits(p.realised)}`}</span>
   ${p.shares&&m.state==='open'&&m.can.trade?`<button type="button" class="pr-button" data-action="sell" data-side="${p.side}" data-shares="${p.shares}">Sell</button>`:''}
  </li>`).join('')}</ul>${m.state!=='open'&&m.positions.some(p=>p.shares)?`<p class="pr-muted pr-small">Trading is closed, so selling is not available. Shares pay out after the reviewed result.</p>`:''}</section>`;
 }
 private resolutionCard(m:MarketDetail):string{
  const r=m.resolution,parts:string[]=[];
  if(r){
   const decided=r.finalOutcome;
   parts.push(`<p><strong>${decided?`Final result: ${OUTCOME_LABEL[decided]}`:`Proposed result: ${OUTCOME_LABEL[r.outcome]}`}</strong>${r.status==='proposed'?` · challenge until ${esc(formatWhen(r.challengeUntil))}`:''}${r.status==='disputed'?' · challenged, waiting for an independent reviewer':''}</p>
    <p>${esc(r.evidence)}</p><p class="pr-muted pr-small">Source checked: ${esc(r.sourceChecked)}</p>${r.disputeReason?`<p class="pr-small">Challenge: ${esc(r.disputeReason)}</p>`:''}${r.reviewNote?`<p class="pr-small">Reviewer: ${esc(r.reviewNote)}</p>`:''}`);
  }
  if(m.settlement)parts.push(`<p class="pr-small">Settled once: ${credits(m.settlement.totalPayout,true)} paid across ${m.settlement.claims} ${m.settlement.claims===1?'holder':'holders'}${m.settlement.completed?'; unused reserve returned.':'.'}</p>`);
  const outcomeSelect=(name:string)=>`<label for="pr-${name}">Result</label><select id="pr-${name}" name="outcome"><option value="yes">YES</option><option value="no">NO</option><option value="void">VOID</option></select>`;
  if(m.can.propose)parts.push(`<form class="pr-inline-form" data-form="propose"><h3>Propose the result</h3>${outcomeSelect('propose-outcome')}<label for="pr-propose-ev">Evidence</label><textarea id="pr-propose-ev" name="evidence" required minlength="10" maxlength="1000" rows="3"></textarea><label for="pr-propose-src">Source checked</label><input id="pr-propose-src" name="sourceChecked" required minlength="3" maxlength="300"><button class="pr-button" type="submit">Propose result</button></form>`);
  if(m.can.dispute)parts.push(`<form class="pr-inline-form" data-form="dispute"><h3>Challenge this result</h3><label for="pr-dispute">Why is it wrong?</label><textarea id="pr-dispute" name="reason" required minlength="10" maxlength="500" rows="2"></textarea><button class="pr-button" type="submit">Send challenge</button></form>`);
  if(m.can.finalise)parts.push(`<form class="pr-inline-form" data-form="finalise"><h3>${m.state==='disputed'?'Decide the challenge':'Finalise and pay out'}</h3>${m.state==='disputed'?`${outcomeSelect('final-outcome')}<label for="pr-final-note">Decision note</label><textarea id="pr-final-note" name="note" required rows="2" maxlength="500"></textarea>`:''}<button class="pr-button pr-primary" type="submit">Finalise ${m.state==='disputed'?'decision':`${OUTCOME_LABEL[r!.outcome]}`}</button></form>`);
  if(m.can.pause)parts.push(`<form class="pr-inline-form" data-form="pause" data-on="${m.state==='paused'?'false':'true'}"><label for="pr-pause-note">${m.state==='paused'?'Resume trading':'Integrity pause'}</label><input id="pr-pause-note" name="note" required minlength="5" maxlength="400" placeholder="Reason (recorded)"><button class="pr-button" type="submit">${m.state==='paused'?'Resume':'Pause trading'}</button></form>`);
  if(!parts.length)return '';
  return `<section class="pr-card-block" aria-labelledby="pr-res-title"><h2 id="pr-res-title">Result</h2>${parts.join('')}</section>`;
 }

 // ---- My calls ----
 private async renderCalls(signal:AbortSignal){
  if(!this.me?.signedIn){this.panel.innerHTML=`<div class="pr-head"><h1>My calls</h1></div>${this.signInCard()}`;return;}
  if(!this.me.eligible){this.panel.innerHTML=`<div class="pr-head"><h1>My calls</h1></div>${this.joinCard()}`;return;}
  const [p,mine]=await Promise.all([this.client.portfolio(signal),this.client.mine(signal)]);
  this.updateBalance(p.balance);
  const open=p.positions.filter(x=>x.shares>0),settled=p.positions.filter(x=>x.shares===0);
  this.panel.innerHTML=`<div class="pr-head"><div><h1>My calls</h1><p class="pr-sub">Spendable credits and open positions are kept separate.</p></div></div>
   <div class="pr-tiles">
    <div class="pr-tile"><p>Spendable</p><p class="pr-tile-value">${formatCredits(p.balance)}</p><p class="pr-muted pr-small">credits</p></div>
    <div class="pr-tile"><p>In open predictions</p><p class="pr-tile-value">${formatCredits(p.openCost)}</p><p class="pr-muted pr-small">cost of shares held</p></div>
    <div class="pr-tile"><p>Realised profit/loss</p><p class="pr-tile-value" data-sign="${Math.sign(p.realised)}">${p.realised>0?'+':''}${formatCredits(p.realised)}</p><p class="pr-muted pr-small">sales and settlements</p></div>
    <div class="pr-tile"><p>Next allowance</p><p class="pr-tile-value pr-tile-date">+${formatCredits(p.weeklyGrant)}</p><p class="pr-muted pr-small">${esc(formatDay(p.nextGrantAt))}</p></div>
   </div>
   <section class="pr-card-block" aria-labelledby="pr-open-title"><h2 id="pr-open-title">Open positions</h2>${open.length?this.positionList(open):'<p class="pr-muted">No open positions. <a href="#/predictions">Find a question</a>.</p>'}</section>
   ${settled.length?`<section class="pr-card-block" aria-labelledby="pr-settled-title"><h2 id="pr-settled-title">Closed and settled</h2>${this.positionList(settled)}</section>`:''}
   <section class="pr-card-block" aria-labelledby="pr-q-title"><h2 id="pr-q-title">Your questions</h2>${mine.items.length?`<ul class="pr-list" role="list">${mine.items.map(s=>this.submissionRow(s)).join('')}</ul>`:'<p class="pr-muted">You haven\'t suggested a question yet. <a href="#/predictions/ask">Ask one</a>.</p>'}</section>
   <section class="pr-card-block" aria-labelledby="pr-ledger-title"><h2 id="pr-ledger-title">Credit history</h2><ul class="pr-ledger" role="list">${p.ledger.map(l=>`<li><span>${esc(this.ledgerLabel(l.kind))}${l.question?`<br><a class="pr-small" href="#/predictions/m/${l.marketId}">${esc(l.question)}</a>`:''}</span><span class="pr-muted pr-small">${esc(formatWhen(l.at))}</span><strong data-sign="${Math.sign(l.amount)}">${l.amount>0?'+':''}${formatCredits(l.amount,true)}</strong></li>`).join('')||'<li class="pr-muted">No credit movements yet.</li>'}</ul></section>`;
 }
 private ledgerLabel(kind:string):string{return ({grant:'Weekly allowance',buy:'Prediction',sell:'Sale',payout:'Payout',void_payout:'Void payout (0.50 per share)',correction:'Correction'} as Record<string,string>)[kind]??kind;}
 private positionList(list:Portfolio['positions']):string{
  return `<ul class="pr-list" role="list">${list.map(x=>`<li class="pr-row"><div><a href="#/predictions/m/${x.market.id}">${esc(x.market.question)}</a>
   <p class="pr-small"><span class="pr-tag ${x.side==='yes'?'pr-yes-tag':'pr-no-tag'}">${SIDE_LABEL[x.side]}</span> ${x.shares?`${formatShares(x.shares)} shares · cost ${credits(x.costBasis)} · pays ${credits(x.shares)} if right`:`realised ${x.realised>0?'+':''}${formatCredits(x.realised)}`} · ${stateBadge(x.market.state)}</p></div>
   ${x.shares&&x.market.state==='open'?`<button type="button" class="pr-button" data-action="sell" data-id="${x.market.id}" data-side="${x.side}" data-shares="${x.shares}">Sell</button>`:''}</li>`).join('')}</ul>`;
 }
 private submissionRow(s:Submission):string{
  return `<li class="pr-row"><div><p>${['open','closed','proposed','disputed','resolved','void','paused'].includes(s.state)?`<a href="#/predictions/m/${s.id}">${esc(s.question)}</a>`:esc(s.question)}</p>
   <p class="pr-small">${stateBadge(s.state)}${s.reviewNote?` <span class="pr-muted">Reviewer: ${esc(s.reviewNote)}</span>`:''}</p></div>
   ${s.state==='changes_requested'?`<a class="pr-button" href="#/predictions/ask/${s.id}">Edit</a>`:''}</li>`;
 }

 // ---- Rankings ----
 private async renderRankings(signal:AbortSignal){
  const {items}=await this.client.rankings(signal);
  this.panel.innerHTML=`<div class="pr-head"><div><h1>Rankings</h1><p class="pr-sub">Realised trading profit, all time. Weekly allowances are not counted.</p></div></div>
   <p class="pr-note">Profit depends on when someone joined and how much they traded, so this is not a measure of forecasting skill. Open positions are shown separately and are not counted until sold or settled.</p>
   ${items.length?`<div class="pr-table-wrap"><table class="pr-table"><thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col" class="pr-num">Realised</th><th scope="col" class="pr-num">Questions</th><th scope="col" class="pr-num pr-hide-xs">Open</th></tr></thead>
   <tbody>${items.map((r,i)=>`<tr${r.username===this.me?.username?' data-me':''}><td>${i+1}</td><th scope="row">${esc(r.username)}</th><td class="pr-num" data-sign="${Math.sign(r.realised)}">${r.realised>0?'+':''}${formatCredits(r.realised)}</td><td class="pr-num">${r.markets}</td><td class="pr-num pr-hide-xs">${formatCredits(r.openCost)}</td></tr>`).join('')}</tbody></table></div>`
   :'<div class="pr-empty"><h2>No settled predictions yet</h2><p>Rankings appear once questions resolve or people sell.</p></div>'}`;
 }

 // ---- Ask ----
 private async renderAsk(id:string|null,signal:AbortSignal){
  if(!this.me?.eligible){this.panel.innerHTML=`<div class="pr-head"><h1>Ask a question</h1></div>${this.me?.signedIn?this.joinCard():this.signInCard('Log in to suggest a question.')}`;return;}
  let draft=this.loadDraft();
  if(id){
   const mine=(await this.client.mine(signal)).items.find(s=>s.id===id);
   if(!mine||mine.state!=='changes_requested'){this.panel.innerHTML='<div class="pr-empty"><h1>Nothing to edit</h1><p>Only questions with requested changes can be edited.</p><a class="pr-button" href="#/predictions/calls">My calls</a></div>';return;}
   draft={...mine.rules};
  }
  new AskForm(this.panel,draft,id,id?null:d=>this.saveDraft(d),async(d)=>{
   const result=await this.client.submit({...d,...(id?{id}:{})});
   if(!id)this.clearDraft();
   this.announce('Submitted for review.');
   return result;
  });
 }
 private loadDraft():DraftInput{
  const blank:DraftInput={question:'',category:'school',audience:'school',yesRule:'',noRule:'',voidRule:'',source:'',sourceFallback:'',disclosure:'',closeAt:'',resolveAt:''};
  try{const raw=JSON.parse(localStorage.getItem(DRAFT_KEY)??'null');if(raw&&typeof raw==='object')for(const key of Object.keys(blank) as (keyof DraftInput)[])if(typeof raw[key]==='string')blank[key]=raw[key];}catch{/* blank */}
  return blank;
 }
 private saveDraft(draft:DraftInput){try{localStorage.setItem(DRAFT_KEY,JSON.stringify(draft));}catch{/* this visit only */}}
 private clearDraft(){try{localStorage.removeItem(DRAFT_KEY);}catch{/* nothing stored */}}

 // ---- Review queue ----
 private async renderReview(signal:AbortSignal){
  if(!this.me?.roles.length){this.panel.innerHTML='<div class="pr-empty"><h1>Review queue</h1><p>Only moderators and resolvers can see this page.</p></div>';return;}
  const q:ReviewQueue=await this.client.queue(signal);
  const rules=(s:Submission)=>`<dl class="pr-rules pr-small"><div><dt>YES</dt><dd>${esc(s.rules.yesRule)}</dd></div><div><dt>NO</dt><dd>${esc(s.rules.noRule)}</dd></div><div><dt>VOID</dt><dd>${esc(s.rules.voidRule)}</dd></div><div><dt>Source</dt><dd>${esc(s.rules.source)}${s.rules.sourceFallback?` → ${esc(s.rules.sourceFallback)}`:''}</dd></div><div><dt>Closes</dt><dd>${esc(formatWhen(s.rules.closeAt))}; result ${esc(formatWhen(s.rules.resolveAt))}</dd></div><div><dt>Audience</dt><dd>${s.rules.audience==='school'?'School only':'Public'} · ${CATEGORY_LABEL[s.rules.category]}</dd></div>${s.rules.disclosure?`<div><dt>Disclosure</dt><dd>${esc(s.rules.disclosure)}</dd></div>`:''}</dl>`;
  this.panel.innerHTML=`<div class="pr-head"><div><h1>Review queue</h1><p class="pr-sub">Every decision is recorded. You can't review your own questions or resolve ones you've traded.</p></div></div>
   <section class="pr-card-block"><h2>Waiting for review (${q.pending.length})</h2>${q.pending.length?`<ul class="pr-list" role="list">${q.pending.map(s=>`<li class="pr-review-item"><h3>${esc(s.question)}</h3>${rules(s)}
    <form class="pr-inline-form" data-form="review" data-id="${s.id}"><label for="pr-note-${s.id}">Note to the author</label><input id="pr-note-${s.id}" name="note" maxlength="400"><div class="pr-actions"><button class="pr-button pr-primary" type="submit" value="approve">Approve and fund</button><button class="pr-button" type="submit" value="changes">Request changes</button><button class="pr-button" type="submit" value="reject">Reject</button></div></form></li>`).join('')}</ul>`:'<p class="pr-muted">Nothing waiting.</p>'}</section>
   <section class="pr-card-block"><h2>Closed, needs a result (${q.toResolve.length})</h2>${q.toResolve.length?`<ul class="pr-list" role="list">${q.toResolve.map(m=>`<li class="pr-row"><a href="#/predictions/m/${m.id}">${esc(m.question)}</a>${stateBadge(m.state)}</li>`).join('')}</ul>`:'<p class="pr-muted">Nothing to resolve.</p>'}</section>
   <section class="pr-card-block"><h2>Proposed or challenged (${q.proposed.length})</h2>${q.proposed.length?`<ul class="pr-list" role="list">${q.proposed.map(m=>`<li class="pr-row"><a href="#/predictions/m/${m.id}">${esc(m.question)}</a><span class="pr-small">${OUTCOME_LABEL[m.resolution.outcome]} · ${m.resolution.status==='disputed'?'challenged':`challenge until ${esc(formatWhen(m.resolution.challengeUntil))}`}</span></li>`).join('')}</ul>`:'<p class="pr-muted">None.</p>'}</section>
   ${q.reports.length?`<section class="pr-card-block"><h2>Reports</h2><ul class="pr-list" role="list">${q.reports.map(r=>`<li class="pr-row"><a href="#/predictions/m/${r.marketId}">${esc(r.question)}</a><span class="pr-small">${esc(r.reason)} × ${r.count}</span></li>`).join('')}</ul></section>`:''}`;
 }

 // ---- Events ----
 private readonly onClick=(event:MouseEvent)=>{
  const target=(event.target as Element).closest<HTMLElement>('[data-action]');if(!target||!this.root.contains(target))return;
  const action=target.dataset.action;
  if(action==='retry'){this.me=null;void this.show(true);}
  else if(action==='login')this.deps.openAccounts();
  else if(action==='join')void this.join(target as HTMLButtonElement);
  else if(action==='quick')void this.quick(target.dataset.id!,target.dataset.side as Side,target);
  else if(action==='sell')void this.sell(target.dataset.id??this.detail?.id??'',target.dataset.side as Side,Number(target.dataset.shares),target);
  else if(action==='ask-with'){event.preventDefault();const d=this.loadDraft();d.question=target.dataset.q??'';this.saveDraft(d);location.hash='#/predictions/ask';}
 };
 private readonly onInput=(event:Event)=>{
  const target=event.target as HTMLElement;
  if(target.closest('[data-form="search"]')){
   clearTimeout(this.searchTimer);
   this.searchTimer=window.setTimeout(()=>{
    const form=this.panel.querySelector<HTMLFormElement>('[data-form="search"]');if(!form||this.route.kind!=='explore')return;
    const data=new FormData(form);history.replaceState(null,'',location.pathname+location.search+exploreHash(this.route.view,String(data.get('category')??''),String(data.get('q')??'').trim()));
    this.route=parseRoute(location.hash);void this.refreshExplore();
   },target instanceof HTMLSelectElement?0:300);
  }
 };
 /** Refreshes the grid without rebuilding the search field, so typing keeps focus. */
 private async refreshExplore(){
  if(this.route.kind!=='explore')return;
  const token=++this.generation;this.abort?.abort();const abort=this.abort=new AbortController();
  try{
   const {items}=await this.client.markets({view:this.route.view,category:this.route.category,q:this.route.q},abort.signal);
   if(token!==this.generation)return;
   const grid=this.panel.querySelector('.pr-grid,.pr-panel>.pr-empty');
   const html=items.length?`<ul class="pr-grid" role="list">${items.map(m=>this.card(m)).join('')}</ul>`:`<div class="pr-empty"><h2>No questions match that search</h2><p>Try different words, or suggest the question yourself.</p><a class="pr-button" href="#/predictions/ask" data-action="ask-with" data-q="${esc(this.route.q)}">Suggest a question</a></div>`;
   if(grid)grid.outerHTML=html;
   for(const link of this.panel.querySelectorAll<HTMLAnchorElement>('.pr-views a'))link.href=exploreHash(new URLSearchParams(link.href.split('?')[1]??'').get('view')??'all',this.route.category,this.route.q);
   this.announce(`${items.length} ${items.length===1?'question':'questions'}`);
  }catch{/* keep the previous grid */}
 }
 private readonly onSubmit=(event:SubmitEvent)=>{
  const form=event.target as HTMLFormElement,kind=form.dataset.form;if(!kind)return;
  event.preventDefault();
  if(kind==='search')return;
  void this.submitForm(form,kind,(event.submitter as HTMLButtonElement|null)?.value??'');
 };
 private async submitForm(form:HTMLFormElement,kind:string,submitter:string){
  const data=new FormData(form),value=(name:string)=>String(data.get(name)??'').trim();
  const m=this.detail,buttons=[...form.querySelectorAll('button')];
  buttons.forEach(b=>b.disabled=true);
  const status=form.querySelector('.pr-form-status')??Object.assign(document.createElement('p'),{className:'pr-form-status'});
  status.setAttribute('role','status');form.append(status);status.textContent='Sending…';
  try{
   if(kind==='review'){
    await this.client.review(form.dataset.id!,submitter as 'approve'|'reject'|'changes',value('note'));
    this.announce(submitter==='approve'?'Approved and funded.':'Decision recorded.');await this.show(false);return;
   }
   if(!m)return;
   if(kind==='evidence')await this.client.evidence(m.id,value('body'),value('link'));
   else if(kind==='report'){await this.client.report(m.id,value('reason') as never,value('note'));status.textContent='Thanks. A moderator will look at it.';return;}
   else if(kind==='propose')await this.client.propose(m.id,value('outcome') as Outcome,value('evidence'),value('sourceChecked'));
   else if(kind==='dispute')await this.client.dispute(m.id,value('reason'));
   else if(kind==='finalise'){const r=await this.client.finalise(m.id,m.state==='disputed'?value('outcome') as Outcome:undefined,value('note')||undefined);this.announce(`Finalised ${OUTCOME_LABEL[r.outcome]}. Payouts made.`);}
   else if(kind==='pause')await this.client.pause(m.id,form.dataset.on==='true',value('note'));
   this.me=null;await this.show(false);
  }catch(error){status.textContent=errorText(error);buttons.forEach(b=>b.disabled=false);}
 }
 private async join(button:HTMLButtonElement){
  button.disabled=true;
  try{this.me=await this.client.join();this.updateBalance(this.me.balance);this.announce(`Joined. You have ${credits(this.me.balance??0)}.`);await this.show(false);}
  catch(error){button.disabled=false;this.announce(errorText(error));button.insertAdjacentHTML('afterend',`<p class="pr-form-status" role="alert">${esc(errorText(error))}</p>`);}
 }
 private async quick(id:string,side:Side,trigger:Element){
  if(!this.me?.signedIn){this.deps.openAccounts();return;}
  if(!this.me.eligible){this.panel.querySelector<HTMLElement>('.pr-join button')?.focus();return;}
  try{const m=await this.client.market(id);this.flow.buy(m,side,this.me,trigger);}
  catch(error){this.announce(errorText(error));}
 }
 private async sell(id:string,side:Side,shares:number,trigger:Element){
  try{const m=this.detail?.id===id?this.detail:await this.client.market(id);this.flow.sell(m,side,shares,trigger);}
  catch(error){this.announce(errorText(error));}
 }
}

/**
 * Amount-first purchase panel. Inputs are side and credits; the server returns the quote. One request at a time:
 * a newer amount aborts the older quote, and the review button stays disabled until a fresh quote has arrived.
 */
class Ticket {
 private abort:AbortController|undefined;
 private timer:number|undefined;
 private quote:Quote|null=null;
 private amount=1_000_000;
 constructor(private readonly host:HTMLElement,private readonly client:PredictionsClient,private readonly market:MarketDetail|MarketSummary,private side:Side,
  private readonly me:Me,private readonly onReview:(quote:Quote)=>void,private readonly offline:()=>boolean){
  host.innerHTML=`<form class="pr-ticket" data-ticket novalidate>
   <h2 id="pr-ticket-title">Make a prediction</h2>
   <fieldset class="pr-side"><legend class="sr-only">Outcome</legend>
    <label class="pr-yes"><input type="radio" name="side" value="yes"${side==='yes'?' checked':''}><span>${icon(ICONS.check)}YES</span></label>
    <label class="pr-no"><input type="radio" name="side" value="no"${side==='no'?' checked':''}><span>${icon(ICONS.check)}NO</span></label>
   </fieldset>
   <label for="pr-amount" class="pr-label">Credits to spend</label>
   <div class="pr-amount"><input id="pr-amount" name="amount" inputmode="decimal" autocomplete="off" value="1.00" aria-describedby="pr-amount-help"><span>credits</span></div>
   <div class="pr-quick" role="group" aria-label="Quick amounts">${QUICK_AMOUNTS.map(a=>`<button type="button" class="pr-pill" data-amount="${a}">${formatCredits(a).replace(/\.00$/,'').replace(/^0/,'0')}</button>`).join('')}</div>
   <p id="pr-amount-help" class="pr-muted pr-small">Available: ${credits(me.balance??0)}. Minimum 0.10.</p>
   <div class="pr-quote" aria-live="polite"></div>
   <button type="submit" class="pr-button pr-primary pr-wide" disabled>Review prediction</button>
  </form>`;
  const form=host.querySelector('form')!;
  form.addEventListener('change',event=>{const t=event.target as HTMLInputElement;if(t.name==='side'){this.side=t.value as Side;this.request(0);}});
  form.addEventListener('input',event=>{if((event.target as HTMLInputElement).name==='amount')this.request(250);});
  form.addEventListener('click',event=>{
   const b=(event.target as Element).closest<HTMLButtonElement>('[data-amount]');if(!b)return;
   form.querySelector<HTMLInputElement>('#pr-amount')!.value=formatCredits(Number(b.dataset.amount));this.request(0);
  });
  form.addEventListener('submit',event=>{event.preventDefault();if(this.quote&&!this.offline())this.onReview(this.quote);});
  this.request(0);
 }
 cancel(){this.abort?.abort();clearTimeout(this.timer);}
 private render(html:string,ready:boolean){
  this.host.querySelector('.pr-quote')!.innerHTML=html;
  const button=this.host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  button.disabled=!ready;
  button.textContent=ready&&this.quote?`Review ${SIDE_LABEL[this.side]} · ${formatCredits(this.quote.credits)} credits`:'Review prediction';
 }
 private request(delay:number){
  this.cancel();this.quote=null;
  const text=this.host.querySelector<HTMLInputElement>('#pr-amount')!.value,amount=parseCredits(text);
  for(const b of this.host.querySelectorAll<HTMLButtonElement>('[data-amount]'))b.setAttribute('aria-pressed',String(Number(b.dataset.amount)===amount));
  if(amount===null||amount<TRADE_MIN){this.render(`<p class="pr-muted pr-small">${text.trim()?'Enter at least 0.10 credits.':'Enter an amount.'}</p>`,false);return;}
  if(amount>(this.me.balance??0)){this.render(`<p class="pr-warn">You have ${credits(this.me.balance??0)}. Your next ${credits(this.me.weeklyGrant)} arrive ${esc(formatDay(this.me.nextGrantAt))}.</p>`,false);return;}
  this.amount=amount;
  this.render('<p class="pr-muted pr-small" aria-busy="true">Calculating…</p>',false);
  this.timer=window.setTimeout(()=>void this.fetch(),delay);
 }
 private async fetch(){
  const abort=this.abort=new AbortController();
  try{
   const quote=await this.client.quote({marketId:this.market.id,side:this.side,op:'buy',amount:this.amount},abort.signal);
   if(abort.signal.aborted)return;
   this.quote=quote;this.render(quoteTable(quote,this.side),true);
  }catch(error){if(!abort.signal.aborted)this.render(`<p class="pr-warn" role="alert">${esc(errorText(error))}</p>`,false);}
 }
}
function quoteTable(q:Quote,side:Side):string{
 const avg=q.shares?Math.round(q.credits/q.shares*1e6):0;
 if(q.op==='sell')return `<dl class="pr-quote-table"><div><dt>Selling</dt><dd>${formatShares(q.amount)} ${SIDE_LABEL[side]} shares</dd></div><div><dt>You receive</dt><dd><strong>${credits(q.credits,true)}</strong></dd></div><div><dt>Average price</dt><dd>${formatPercent(avg,1)}</dd></div><div><dt>${SIDE_LABEL[side]} price</dt><dd>${formatPercent(q.priceBeforePpm,1)} → ${formatPercent(q.priceAfterPpm,1)}</dd></div></dl>`;
 return `<dl class="pr-quote-table">
  <div><dt>Shares</dt><dd>${formatShares(q.shares)}</dd></div>
  <div><dt>Average price</dt><dd>${formatPercent(avg,1)} per share</dd></div>
  <div><dt>Pays if ${SIDE_LABEL[side]}</dt><dd><strong>${credits(q.payoutIfRight)}</strong> <span class="pr-gain">+${formatCredits(q.payoutIfRight-q.credits)} profit</span></dd></div>
  <div><dt>If ${side==='yes'?'NO':'YES'}</dt><dd>Pays 0 · you lose ${credits(q.credits)}</dd></div>
  <div><dt>${SIDE_LABEL[side]} price</dt><dd>${formatPercent(q.priceBeforePpm,1)} → ${formatPercent(q.priceAfterPpm,1)}</dd></div>
 </dl>`;
}

type Step='amount'|'review'|'sending'|'checking'|'receipt'|'not-placed';
/**
 * The modal flow: (amount →) review → confirm → receipt. The operation key is created when review opens and reused
 * only to retry or look up that same prediction. A lost response becomes "Checking your prediction", resolved by
 * receipt lookup, never by sending a second purchase.
 */
class TradeFlow {
 private market:MarketDetail|null=null;
 private side:Side='yes';
 private op:Operation='buy';
 private quote:Quote|null=null;
 private previous:Quote|null=null;
 private key='';
 private step:Step='review';
 private ticket:Ticket|null=null;
 private receipt:Receipt|null=null;
 private message='';
 private shares=0;
 private sellShares=0;
 private abort:AbortController|undefined;
 constructor(private readonly dialog:HTMLDialogElement,private readonly client:PredictionsClient,private readonly hooks:{announce(text:string):void;done(receipt:Receipt):void;offline():boolean}){
  dialog.addEventListener('click',this.onClick);
  dialog.addEventListener('close',()=>{this.abort?.abort();this.ticket?.cancel();this.ticket=null;});
  dialog.addEventListener('cancel',event=>{if(this.step==='sending'||this.step==='checking')event.preventDefault();});
 }
 dispose(){this.abort?.abort();this.ticket?.cancel();this.dialog.removeEventListener('click',this.onClick);}
 close(){if(this.dialog.open)this.dialog.close();}
 buy(market:MarketDetail,side:Side,me:Me,trigger:Element){
  this.market=market;this.side=side;this.op='buy';this.step='amount';this.quote=null;this.previous=null;
  this.dialog.innerHTML=`${this.head(`Predict ${SIDE_LABEL[side]}`)}<p class="pr-sheet-q">${esc(market.question)}</p><div class="pr-sheet-ticket"></div>`;
  this.ticket=new Ticket(this.dialog.querySelector('.pr-sheet-ticket')!,this.client,market,side,me,quote=>{this.side=quote.side;this.review(market,quote);},this.hooks.offline);
  openSheet(this.dialog,trigger);
  this.dialog.querySelector<HTMLInputElement>('#pr-amount')?.focus();
 }
 sell(market:MarketDetail,side:Side,shares:number,trigger:Element){
  this.market=market;this.side=side;this.op='sell';this.step='amount';this.quote=null;this.previous=null;this.shares=shares;this.sellShares=shares;
  this.renderSell();openSheet(this.dialog,trigger);void this.requestSellQuote();
 }
 review(market:MarketDetail,quote:Quote){
  this.market=market;this.side=quote.side;this.op=quote.op;this.quote=quote;this.previous=null;this.key=operationKey();this.step='review';this.receipt=null;
  this.ticket?.cancel();this.ticket=null;this.render();
  if(!this.dialog.open)openSheet(this.dialog,document.activeElement);
  this.dialog.querySelector<HTMLButtonElement>('[data-flow="confirm"]')?.focus();
 }
 private head(title:string){return `<div class="dialog-head pr-sheet-head"><h2 id="pr-sheet-title">${esc(title)}</h2><button type="button" class="icon-button" data-flow="close" aria-label="Close">${icon(ICONS.close)}</button></div>`;}
 private renderSell(){
  const half=Math.floor(this.shares/2);
  this.dialog.innerHTML=`${this.head(`Sell ${SIDE_LABEL[this.side]} shares`)}<p class="pr-sheet-q">${esc(this.market!.question)}</p>
   <div class="pr-quick" role="group" aria-label="How many shares"><button type="button" class="pr-pill" data-flow="sell-amount" data-shares="${this.shares}" aria-pressed="${this.sellShares===this.shares}">All ${formatShares(this.shares)}</button>${half>0?`<button type="button" class="pr-pill" data-flow="sell-amount" data-shares="${half}" aria-pressed="${this.sellShares===half}">Half ${formatShares(half)}</button>`:''}</div>
   <div class="pr-quote" aria-live="polite"><p class="pr-muted pr-small">Calculating…</p></div>
   <p class="pr-muted pr-small">Selling is final. You stop holding these shares and get the credits shown now.</p>
   <button type="button" class="pr-button pr-primary pr-wide" data-flow="sell-review" disabled>Review sale</button>`;
 }
 private async requestSellQuote(){
  this.abort?.abort();const abort=this.abort=new AbortController();
  try{
   const q=await this.client.quote({marketId:this.market!.id,side:this.side,op:'sell',amount:this.sellShares},abort.signal);
   if(abort.signal.aborted)return;
   this.quote=q;this.dialog.querySelector('.pr-quote')!.innerHTML=quoteTable(q,this.side);
   this.dialog.querySelector<HTMLButtonElement>('[data-flow="sell-review"]')!.disabled=false;
  }catch(error){if(!abort.signal.aborted)this.dialog.querySelector('.pr-quote')!.innerHTML=`<p class="pr-warn" role="alert">${esc(errorText(error))}</p>`;}
 }
 private render(){
  const m=this.market!,q=this.quote!,side=SIDE_LABEL[this.side],buy=this.op==='buy';
  const changed=(field:keyof Quote)=>this.previous&&this.previous[field]!==q[field]?' data-changed':'';
  if(this.step==='review'||this.step==='sending'){
   this.dialog.innerHTML=`${this.head(buy?'Review prediction':'Review sale')}
    <p class="pr-sheet-q">${esc(m.question)}</p>
    <p class="pr-review-side"><span class="pr-tag ${this.side==='yes'?'pr-yes-tag':'pr-no-tag'}">${side}</span>${buy?`You predict ${side}`:`You sell ${side} shares`}</p>
    ${this.message?`<p class="pr-warn" role="alert">${esc(this.message)}</p>`:''}
    <dl class="pr-quote-table pr-review">
     ${buy?`<div><dt>You spend</dt><dd${changed('credits')}><strong>${credits(q.credits,true)}</strong></dd></div>
     <div><dt>You get</dt><dd${changed('shares')}>${formatShares(q.shares)} ${side} shares</dd></div>
     <div><dt>If ${side}</dt><dd${changed('payoutIfRight')}>Pays ${credits(q.payoutIfRight,true)} · profit ${formatCredits(q.payoutIfRight-q.credits,true)}</dd></div>
     <div><dt>If ${this.side==='yes'?'NO':'YES'}</dt><dd>Pays 0 · you lose ${credits(q.credits,true)}</dd></div>
     <div><dt>If void</dt><dd>Pays ${credits(q.voidPayout,true)} (0.50 per share)</dd></div>`
     :`<div><dt>You sell</dt><dd>${formatShares(q.amount)} ${side} shares</dd></div><div><dt>You receive</dt><dd${changed('credits')}><strong>${credits(q.credits,true)}</strong></dd></div>`}
     <div><dt>${side} price</dt><dd${changed('priceAfterPpm')}>${formatPercent(q.priceBeforePpm,2)} → ${formatPercent(q.priceAfterPpm,2)}</dd></div>
     <div><dt>Price protection</dt><dd>Won't execute if you'd get under ${buy?`${formatShares(q.minOut)} shares`:credits(q.minOut,true)}</dd></div>
    </dl>
    <p class="pr-muted pr-small">Credits are free play credits with no cash value. Balance after: about ${credits(buy?q.balance-q.credits:q.balance+q.credits)}.</p>
    <div class="pr-actions"><button type="button" class="pr-button" data-flow="close">Cancel</button>
    <button type="button" class="pr-button pr-primary ${this.side==='yes'?'pr-confirm-yes':'pr-confirm-no'}" data-flow="confirm"${this.step==='sending'?' disabled aria-busy="true"':''}>${this.step==='sending'?'Placing…':buy?`Confirm ${side} · ${formatCredits(q.credits)} credits`:`Confirm sale · ${formatCredits(q.credits)} credits`}</button></div>`;
  }else if(this.step==='checking'){
   this.dialog.innerHTML=`${this.head('Checking your prediction')}<p class="pr-sheet-q">${esc(m.question)}</p>
    <p role="status">The connection dropped after you confirmed. We're checking whether it went through, using reference <code>${this.key.slice(0,10)}</code>. It won't be placed twice.</p>
    <div class="pr-actions"><button type="button" class="pr-button pr-primary" data-flow="check">Check again</button></div>`;
  }else if(this.step==='not-placed'){
   this.dialog.innerHTML=`${this.head('Not placed')}<p class="pr-sheet-q">${esc(m.question)}</p><p role="status">That prediction didn't go through, and no credits were used.</p>
    <div class="pr-actions"><button type="button" class="pr-button" data-flow="close">Close</button></div>`;
  }else if(this.step==='receipt'){
   const r=this.receipt!;
   this.dialog.innerHTML=`${this.head(r.op==='buy'?'Prediction placed':'Sale complete')}
    <p class="pr-done">${icon(ICONS.check)}<span>${r.op==='buy'?`${SIDE_LABEL[r.side]} · ${formatShares(r.shares)} shares`:`Sold ${formatShares(r.shares)} ${SIDE_LABEL[r.side]} shares`}</span></p>
    <p class="pr-sheet-q">${esc(r.question)}</p>
    <dl class="pr-quote-table"><div><dt>${r.op==='buy'?'Spent':'Received'}</dt><dd>${credits(r.credits,true)}</dd></div>
     ${r.op==='buy'?`<div><dt>Pays if ${SIDE_LABEL[r.side]}</dt><dd>${credits(r.shares,true)}</dd></div>`:''}
     <div><dt>${SIDE_LABEL[r.side]==='YES'?'YES':'NO'} price after</dt><dd>${formatPercent(r.side==='yes'?r.priceAfterPpm:1e6-r.priceAfterPpm,2)}</dd></div>
     <div><dt>Balance now</dt><dd><strong>${credits(r.balanceAfter,true)}</strong></dd></div>
     <div><dt>Time</dt><dd>${esc(formatWhen(r.at))}</dd></div><div><dt>Reference</dt><dd><code>${esc(r.id.slice(0,8))}</code></dd></div></dl>
    <div class="pr-actions"><button type="button" class="pr-button pr-primary" data-flow="close">Done</button></div>`;
  }
 }
 private readonly onClick=(event:MouseEvent)=>{
  const t=(event.target as Element).closest<HTMLElement>('[data-flow]');if(!t)return;
  const flow=t.dataset.flow;
  if(flow==='close'&&this.step!=='sending'&&this.step!=='checking')this.close();
  else if(flow==='confirm')void this.confirm();
  else if(flow==='check')void this.check();
  else if(flow==='sell-amount'){this.sellShares=Number(t.dataset.shares);this.renderSell();void this.requestSellQuote();}
  else if(flow==='sell-review'&&this.quote)this.review(this.market!,this.quote);
 };
 private async confirm(){
  if(this.hooks.offline()){this.message="You're offline. Reconnect, then confirm.";this.render();return;}
  const q=this.quote!;this.step='sending';this.message='';this.render();
  try{
   const result=await this.client.execute({marketId:this.market!.id,quoteId:q.id,operationKey:this.key});
   this.finish(result.receipt);
  }catch(error){
   if(error instanceof ApiError&&error.status===409&&['price_moved','quote_expired'].includes(error.code)){
    // Fetch a fresh quote for the same input; the person must confirm the changed numbers again.
    try{
     const fresh=await this.client.quote({marketId:this.market!.id,side:q.side,op:q.op,amount:q.amount,toleranceBp:q.toleranceBp});
     this.previous=q;this.quote=fresh;this.key=operationKey();this.step='review';
     this.message=error.code==='price_moved'?'The price moved. Check the highlighted numbers and confirm again.':'That quote expired. Here is a fresh one; confirm again.';
     this.render();this.hooks.announce(this.message);return;
    }catch(inner){error=inner;}
   }
   if(error instanceof ApiError&&error.status>0&&error.status<500){
    this.step='review';this.message=errorText(error);this.render();this.hooks.announce(this.message);return;
   }
   // Timeout, network loss or a 5xx after sending: the server may have committed. Look it up; never resend blindly.
   this.step='checking';this.render();await this.check();
  }
 }
 private async check(){
  try{
   const receipt=await this.client.receipt(this.key);
   this.finish(receipt);
  }catch(error){
   if(error instanceof ApiError&&error.status===404){this.step='not-placed';this.render();this.hooks.announce('Not placed. No credits were used.');return;}
   this.step='checking';this.render();
  }
 }
 private finish(receipt:Receipt){
  this.receipt=receipt;this.step='receipt';this.render();
  this.hooks.announce(`${receipt.op==='buy'?'Prediction placed':'Sale complete'}. Balance ${credits(receipt.balanceAfter)}.`);
  this.dialog.querySelector<HTMLButtonElement>('[data-flow="close"].pr-primary')?.focus();
  this.hooks.done(receipt);
 }
}

/** Three steps: Question; Rules and source; Review and submit. The draft is kept locally until submitted. */
class AskForm {
 private step=1;
 private errors:DraftErrors={};
 private submitted:Submission|null=null;
 private message='';
 constructor(private readonly host:HTMLElement,private draft:DraftInput,private readonly editing:string|null,private readonly save:((d:DraftInput)=>void)|null,private readonly send:(d:DraftInput)=>Promise<Submission>){
  if(!draft.closeAt){draft.closeAt=new Date(Date.now()+3*86_400_000).toISOString();draft.resolveAt=new Date(Date.now()+4*86_400_000).toISOString();}
  host.addEventListener('submit',this.onSubmit);host.addEventListener('input',this.onInput);host.addEventListener('click',this.onClick);
  this.render();
 }
 private field(name:keyof DraftInput,label:string,help:string,kind:'input'|'textarea'|'datetime'='input',max=400){
  const error=this.errors[name],value=kind==='datetime'?toLocalInput(this.draft[name]):this.draft[name];
  const attrs=`id="pr-f-${name}" name="${name}" ${error?`aria-invalid="true" aria-describedby="pr-e-${name} pr-h-${name}"`:`aria-describedby="pr-h-${name}"`}`;
  const control=kind==='textarea'?`<textarea ${attrs} rows="2" maxlength="${max}">${esc(value)}</textarea>`:kind==='datetime'?`<input ${attrs} type="datetime-local" value="${esc(value)}">`:`<input ${attrs} value="${esc(value)}" maxlength="${max}" autocomplete="off">`;
  return `<div class="pr-field"><label for="pr-f-${name}">${label}</label>${control}<p class="pr-help" id="pr-h-${name}">${help}</p>${error?`<p class="pr-error" id="pr-e-${name}">${esc(error)}</p>`:''}</div>`;
 }
 private stepErrors(step:number):DraftErrors{
  const all=validateDraft(this.draft,Date.now()),keys:(keyof DraftInput)[]=step===1?['question','category','audience']:step===2?['yesRule','noRule','voidRule','source','sourceFallback','disclosure','closeAt','resolveAt']:Object.keys(all) as (keyof DraftInput)[];
  return Object.fromEntries(keys.filter(k=>all[k]).map(k=>[k,all[k]])) as DraftErrors;
 }
 private render(){
  const d=this.draft,steps=['Question','Rules and source','Review'];
  if(this.submitted){
   this.host.innerHTML=`<div class="pr-empty"><h1>Submitted for review</h1><p>A moderator will check “${esc(this.submitted.question)}”. It opens for predictions only once approved, with ${credits(14_000_000)} of market funding from Predictions, not from you.</p><div class="pr-actions"><a class="pr-button pr-primary" href="#/predictions/calls">See its status</a><a class="pr-button" href="#/predictions">Explore</a></div></div>`;return;
  }
  const body=this.step===1?`
   ${this.field('question','Question','A yes/no question about an event, readable without extra context. Ask about events, never about a person’s private life.','textarea',160)}
   <div class="pr-templates" role="group" aria-label="Templates"><span class="pr-small pr-muted">Start from:</span>${['Will [event] start outdoors on [date]?','Will [team] win [fixture] on [date]?','Will official rainfall at [station] reach [mm] on [date]?','Will [publisher] release [update] by [date]?'].map(t=>`<button type="button" class="pr-pill" data-template="${esc(t)}">${esc(t)}</button>`).join('')}</div>
   <div class="pr-two"><div class="pr-field"><label for="pr-f-category">Category</label><select id="pr-f-category" name="category">${CATEGORIES.map(c=>`<option value="${c}"${c===d.category?' selected':''}>${CATEGORY_LABEL[c]}</option>`).join('')}</select></div>
   <div class="pr-field"><label for="pr-f-audience">Who can see it</label><select id="pr-f-audience" name="audience"><option value="school"${d.audience==='school'?' selected':''}>School members only</option><option value="public"${d.audience==='public'?' selected':''}>Everyone</option></select></div></div>`
  :this.step===2?`
   ${this.field('yesRule','YES means','Exactly what the source must report for YES.','textarea')}
   ${this.field('noRule','NO means','The explicit alternative. Different from YES.','textarea')}
   ${this.field('voidRule','Void if','What cancels the question (postponed, no source published…). Void pays 0.50 per share.','textarea')}
   ${this.field('source','Source','The official source that will verify the result.','input',300)}
   ${this.field('sourceFallback','Fallback source (optional)','Used if the main source is unavailable; otherwise void.','input',300)}
   <div class="pr-two">${this.field('closeAt','Trading closes','Before anyone could know the result.','datetime')}${this.field('resolveAt','Result expected','When the source will have published it.','datetime')}</div>
   ${this.field('disclosure','Your involvement (optional)','Say if you organise or could influence this event. You can’t trade questions you control.','input',300)}`
  :`<p class="pr-muted">This is exactly what people will see. Rules are frozen once it's approved.</p>
   <div class="pr-card pr-preview"><p class="pr-card-meta"><span class="pr-cat">${CATEGORY_LABEL[d.category as keyof typeof CATEGORY_LABEL]??''}</span>${d.audience==='school'?'<span class="pr-cat">School only</span>':''}<span class="pr-badge" data-state="pending">Preview</span></p>
    <h2 class="pr-card-q">${esc(d.question)}</h2><p class="pr-view-pct"><span class="pr-pct">50%</span><span class="pr-pct-label">No predictions yet</span></p>
    <p class="pr-card-foot"><span>Closes ${esc(d.closeAt?formatWhen(d.closeAt):'—')}</span><span>0 people</span></p></div>
   <dl class="pr-rules"><div><dt><span class="pr-tag pr-yes-tag">YES</span></dt><dd>${esc(d.yesRule)}</dd></div><div><dt><span class="pr-tag pr-no-tag">NO</span></dt><dd>${esc(d.noRule)}</dd></div><div><dt><span class="pr-tag">VOID</span></dt><dd>${esc(d.voidRule)}</dd></div><div><dt>Source</dt><dd>${esc(d.source)}${d.sourceFallback?` → ${esc(d.sourceFallback)}`:''}</dd></div><div><dt>Result</dt><dd>${esc(d.resolveAt?formatWhen(d.resolveAt):'')}</dd></div></dl>`;
  this.host.innerHTML=`<div class="pr-head"><div><h1>${this.editing?'Edit question':'Ask a question'}</h1><p class="pr-sub">Anyone can suggest; a moderator checks every question before it opens.</p></div></div>
   <ol class="pr-steps">${steps.map((s,i)=>`<li${i+1===this.step?' aria-current="step"':''}${i+1<this.step?' data-done':''}><span>${i+1}</span>${s}</li>`).join('')}</ol>
   <form class="pr-form pr-card-block" novalidate>${body}
    ${this.message?`<p class="pr-error" role="alert">${esc(this.message)}</p>`:''}
    <div class="pr-actions">${this.step>1?'<button type="button" class="pr-button" data-step="back">Back</button>':''}<button type="submit" class="pr-button pr-primary">${this.step<3?'Continue':this.editing?'Resubmit for review':'Submit for review'}</button></div>
   </form>`;
 }
 private readonly onInput=(event:Event)=>{
  const t=event.target as HTMLInputElement;const name=t.name as keyof DraftInput;
  if(!(name in this.draft))return;
  this.draft[name]=t.type==='datetime-local'?fromLocalInput(t.value):t.value;
  this.save?.(this.draft);
 };
 private readonly onClick=(event:MouseEvent)=>{
  const t=(event.target as Element).closest<HTMLElement>('[data-step],[data-template]');if(!t)return;
  if(t.dataset.template){this.draft.question=t.dataset.template;this.save?.(this.draft);this.render();this.host.querySelector<HTMLTextAreaElement>('#pr-f-question')?.focus();return;}
  this.step--;this.errors={};this.message='';this.render();this.host.querySelector<HTMLElement>('h1')?.focus();
 };
 private readonly onSubmit=(event:SubmitEvent)=>{
  event.preventDefault();
  this.errors=this.stepErrors(this.step);this.message='';
  if(Object.keys(this.errors).length){this.render();this.host.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();return;}
  if(this.step<3){this.step++;this.render();this.host.querySelector<HTMLElement>('.pr-form input,.pr-form textarea,.pr-form select,.pr-form button')?.focus();return;}
  void (async()=>{
   const button=this.host.querySelector<HTMLButtonElement>('button[type="submit"]')!;button.disabled=true;button.textContent='Submitting…';
   try{this.submitted=await this.send(this.draft);this.render();this.host.querySelector<HTMLElement>('h1')?.focus();}
   catch(error){this.message=error instanceof ApiError&&error.code==='invalid_draft'?error.message.replace(/^\w+: /,''):errorText(error);this.render();}
  })();
 };
}
