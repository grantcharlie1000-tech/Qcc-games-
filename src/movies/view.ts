import './style.css';
import {movieIcon} from './icons';
import {frameSource,FRAME_SANDBOX,FRAME_ALLOW,STREAM_PROVIDERS,streamProvider,providerSignal} from './provider';
import type {StreamProviderId} from './provider';
import {filterTitles,licensedSource,mediaKey,nextEpisode,parseCatalog,parseMovieRoute,titleHash} from './model';
import type {Catalog,MovieRoute,Title} from './model';
import {MovieStorage} from './storage';
import {movieJson,movieNetworkMessage,MovieNetworkError} from './network';
const base=import.meta.env.BASE_URL;
const escape=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
// Absolute same-origin URLs also resolve correctly inside CSS custom properties in /assets/ stylesheets.
const asset=(v:string)=>v.startsWith('https://')?v:new URL(base+v,document.baseURI).href;
const meta=(t:Title)=>[t.year||'',t.kind==='tv'?'Series':t.runtime?t.runtime+' min':'Movie',t.rating===undefined?'':'★ '+t.rating.toFixed(1)+'/10'].filter(Boolean).join(' · ');
type FullscreenDocument=Document&{webkitFullscreenElement?:Element|null;webkitExitFullscreen?:()=>void};
type FullscreenElement=HTMLElement&{webkitRequestFullscreen?:()=>void};
interface PlaybackPreferences {autoNext:()=>boolean;setAutoNext:(value:boolean)=>void}
export class MoviesView {
 readonly root=document.createElement('section');
 private catalog:Catalog={titles:[],source:'starter',trending:[]};
 private licenses:unknown=[];
 private storage=new MovieStorage();
 private abort=new AbortController();
 private ready=false;
 private failed=false;
 private loadError='';
 private query='';
 private focusSearch=false;
 private homeNavigation=false;
 private kind='all';
 private genre='All';
 private remoteTitles:Title[]=[];
 private remotePage=1;
 private remoteRequestedPage=1;
 private remotePages=1;
 private remoteLoading=false;
 private remoteError='';
 private searchTimer?:ReturnType<typeof setTimeout>;
 private searchRequest=0;
 private detailRequest=0;
 private metadataAbort?:AbortController;
 private detailAbort?:AbortController;
 private pendingTitle=false;
 private detailError='';
 private dynamicIds=new Set<string>();
 private loadedDetails=new Set<string>();
 private loadedSeasons=new Set<string>();
 private browseScroll=0;
 private returnFocus='';
 private positions=new Map<string,{top:number;href:string}>();
 private lastActivatedHref='';
 private video?:HTMLVideoElement;
 private frame?:HTMLIFrameElement;
 private preferExternal=false;
 private providerId:StreamProviderId='framextv';
 private frameTime=0;
 private progressKey='';
 private ended=false;
 private suspended=false;
 private countdown?:ReturnType<typeof setInterval>;
 private nextHash='';
 private countdownGeneration=0;
 private wasFullscreen=false;
 private intentionalExit=false;
 private lastSave=0;
 private route:MovieRoute={play:false};
 private onVisibility=()=>{if(document.hidden)this.pause();};
 constructor(container:HTMLElement,private study:()=>void,private reducedMotion:boolean,origin?:DOMRect,private preferences:PlaybackPreferences={autoNext:()=>true,setAutoNext:()=>{}}){
  this.root.className='movies-view';this.root.setAttribute('aria-label','Movies and TV');this.root.tabIndex=-1;
  container.replaceChildren(this.root);document.body.classList.add('movies-active');
  this.root.addEventListener('error',event=>{const image=event.target;if(image instanceof HTMLImageElement){if(image.dataset.poster&&image.src!==image.dataset.poster){image.src=image.dataset.poster;delete image.dataset.poster;}else image.style.opacity='0';}},{capture:true});
  this.root.addEventListener('click',this.click);
  this.root.addEventListener('click',event=>{
   const link=(event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
   if(link){this.lastActivatedHref=link.getAttribute('href')||'';if(link.dataset.title)this.returnFocus=link.dataset.title;}
  },{capture:true});
  this.root.addEventListener('input',this.input);
  this.root.addEventListener('change',this.change);
  this.root.addEventListener('keydown',this.keydown);
  document.addEventListener('fullscreenchange',this.fullscreenChange);document.addEventListener('webkitfullscreenchange',this.fullscreenChange);
  document.addEventListener('visibilitychange',this.onVisibility);
  window.addEventListener('message',this.providerMessage);
  this.root.focus();
  if(origin&&!reducedMotion&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
   this.root.animate([{transform:`translate(${origin.x}px, ${origin.y}px) scale(${origin.width/innerWidth}, ${origin.height/innerHeight})`,opacity:.45},{transform:'none',opacity:1}],{duration:260,easing:'cubic-bezier(0.23, 1, 0.32, 1)'});
  }
  this.root.style.transformOrigin='top left';this.render();void this.load();
 }
 async load(){
  this.failed=false;this.loadError='';this.ready=false;this.render();
  try{
   this.catalog=parseCatalog(await movieJson(asset('movies/catalog.json'),this.abort.signal));
   if(!this.catalog.titles.length)throw new Error('Empty catalog');
   // An unavailable optional registry disables local media, never discovery.
   try {this.licenses=await movieJson(asset('movies/licenses.json'),this.abort.signal,5000);}catch{this.licenses=[];}
   if(this.abort.signal.aborted)return;
   this.ready=true;this.render();
   if(this.route.id){if(this.needsDetails(this.route))void this.loadTitle(this.route.id,this.route.season);}
   else void this.fetchCatalog('',1);
  }catch(error){if(!this.abort.signal.aborted){this.failed=true;this.loadError=movieNetworkMessage(error,'The collection');this.render();}}
 }
 private async fetchCatalog(query:string,page:number){
  query=query.trim();
  this.remoteRequestedPage=page;
  const request=++this.searchRequest;
  this.metadataAbort?.abort();const controller=this.metadataAbort=new AbortController();
  this.remoteLoading=true;this.remoteError='';this.renderSearchState();
  try{
   const params=new URLSearchParams({type:this.kind==='movie'||this.kind==='tv'?this.kind:'all',page:String(page)});
   if(query)params.set('q',query);
   const data=await movieJson('/api/movies?'+params,controller.signal);
   if(request!==this.searchRequest||query!==this.query.trim())return;
   const parsed=parseCatalog({titles:data.titles,source:'tmdb'});
   this.remoteTitles=parsed.titles;
   for(const title of parsed.titles)this.dynamicIds.add(title.id);
   this.remotePage=Number.isInteger(data.page)?data.page:page;
   this.remotePages=Number.isInteger(data.totalPages)?Math.max(1,Math.min(500,data.totalPages)):1;
   this.remoteLoading=false;this.renderSearchState();
  }catch(error){
   if(request!==this.searchRequest||query!==this.query.trim()||controller.signal.aborted)return;
   this.remoteLoading=false;this.remoteError=movieNetworkMessage(error,'Full catalog search');this.renderSearchState();
  }
 }
 private needsDetails(route:MovieRoute){
  if(!route.id||!/^(movie|tv)-[1-9]\d*$/.test(route.id))return false;
  const title=this.catalog.titles.find(t=>t.id===route.id);
  if(!title||this.dynamicIds.has(route.id)&&!this.loadedDetails.has(route.id))return true;
  return this.dynamicIds.has(route.id)&&title.kind==='tv'&&!!route.season&&!this.loadedSeasons.has(route.id+':s'+route.season);
 }
 private async loadTitle(id:string,season?:number){
  const request=++this.detailRequest;this.detailAbort?.abort();const controller=this.detailAbort=new AbortController();this.pendingTitle=true;this.detailError='';if(this.screenFullscreen())this.renderDetailError();else this.render();
  try{
   const params=new URLSearchParams({id});if(season)params.set('season',String(season));
   const data=await movieJson('/api/movies?'+params,controller.signal);const parsed=parseCatalog({titles:[data.title],source:'tmdb'});const title=parsed.titles[0];
   if(request!==this.detailRequest||this.route.id!==id)return;
   if(!title)throw new Error('Title details are unavailable.');
   const previous=this.catalog.titles.find(t=>t.id===id);
   if(previous)for(const item of title.seasons)if(!item.episodes.length)item.episodes=previous.seasons.find(s=>s.number===item.number)?.episodes??[];
   this.catalog={...this.catalog,titles:[...this.catalog.titles.filter(t=>t.id!==id),title]};
   this.dynamicIds.add(id);this.loadedDetails.add(id);
   if(season)this.loadedSeasons.add(id+':s'+season);
   else for(const item of title.seasons)if(item.episodes.length)this.loadedSeasons.add(id+':s'+item.number);
   this.pendingTitle=false;this.render();
  }catch(error){
   if(request!==this.detailRequest||this.route.id!==id)return;
   if(controller.signal.aborted)return;
   this.pendingTitle=false;this.detailError=error instanceof MovieNetworkError&&error.status===404?'':movieNetworkMessage(error,'Title details');if(this.screenFullscreen())this.renderDetailError();else this.render();
  }
 }
 private renderSearchState(){
  // A browse request may complete after Play was pressed. Updating its state
  // must not replace the player's iframe or restart an active stream.
  if(this.route.id)return;
  const input=this.root.querySelector<HTMLInputElement>('#movies-search');
  const focused=input===document.activeElement;
  const start=input?.selectionStart,top=this.root.scrollTop;
  this.render();
  if(focused){const next=this.root.querySelector<HTMLInputElement>('#movies-search');next?.focus({preventScroll:true});if(start!==null&&start!==undefined)next?.setSelectionRange(start,start);this.root.scrollTop=top;}
 }
 private positionKey(route:MovieRoute){const title=this.catalog.titles.find(t=>t.id===route.id);return route.play?JSON.stringify(route):route.id?`${route.id}:s${route.season??title?.seasons[0]?.number??0}`:'browse';}
 navigate(hash:string){
  const next=parseMovieRoute(hash);
  if(!next){this.route={play:false};this.render('That page could not be found.');return;}
  this.detailRequest++;this.detailAbort?.abort();this.pendingTitle=false;this.detailError='';
  const returningFromPlayer=!!this.route.play&&!next.play&&!!this.route.id&&this.route.id===next.id;
  const returnEpisodeHref=returningFromPlayer?titleHash(this.route.id!)+'/season/'+this.route.season+'/episode/'+this.route.episode+'/play':'';
  if(!this.route.id&&next.id){this.browseScroll=this.root.scrollTop;this.returnFocus=(document.activeElement as HTMLElement)?.dataset.title||'';}
  this.positions.set(this.positionKey(this.route),{top:this.root.scrollTop,href:this.lastActivatedHref||(document.activeElement as Element)?.closest('a')?.getAttribute('href')||''});
  this.lastActivatedHref='';
  const returning=!!this.route.id&&!next.id;
  const inPlace=this.route.play&&next.play&&this.route.id===next.id&&this.screenFullscreen();
  this.stopVideo();this.suspended=false;this.preferExternal=false;this.route=next;
  const title=this.catalog.titles.find(t=>t.id===next.id);
  if(inPlace&&title)this.refreshPlayer(title);else this.render();
  if(this.ready&&this.needsDetails(next))void this.loadTitle(next.id!,next.season);
  if(this.focusSearch){this.focusSearch=false;this.searchFocus();return;}
  if(this.homeNavigation){this.homeNavigation=false;this.root.scrollTop=0;this.root.querySelector<HTMLElement>('h1')?.focus({preventScroll:true});return;}
  if(returning){this.root.scrollTop=this.browseScroll;this.root.querySelector<HTMLElement>(`[data-title="${this.returnFocus}"]`)?.focus({preventScroll:true});}
  else {const previous=this.positions.get(this.positionKey(next));this.root.scrollTop=previous?.top??0;
   const anchors=[...this.root.querySelectorAll<HTMLAnchorElement>('a')];
   const focus=returningFromPlayer?anchors.find(a=>a.getAttribute('href')===returnEpisodeHref):previous?.href?anchors.find(a=>a.getAttribute('href')===previous.href):null;
   (focus??this.root.querySelector<HTMLElement>('h1'))?.focus({preventScroll:true});}
 }
 private header(){return `<header class="movies-top"><a class="movies-brand" href="#/movies" aria-label="QCC Movies and TV home">QCC<span>MOVIES &amp; TV</span></a><nav aria-label="Movies and TV navigation">${[['all','Home'],['tv','TV Shows'],['movie','Movies'],['list','My list']].map(([kind,name])=>`<button data-kind="${kind}" aria-pressed="${this.kind===kind&&!this.route.id}">${name}</button>`).join('')}</nav><div class="movies-top-tools"><button data-action="search" class="movies-search-toggle" aria-label="Search movies and TV">${movieIcon('search')}</button><a class="movies-back" aria-label="Games" href="#/collection">← Games</a><button data-action="study" class="movies-study">Study Mode <kbd>Esc</kbd></button><span class="movies-profile" aria-hidden="true">Q</span></div></header>`;}
 private card(t:Title){return `<a class="movies-poster" href="${titleHash(t.id)}" data-title="${t.id}" aria-label="Details for ${escape(t.name)}"><div class="movies-poster-art"><img data-poster="${asset(t.poster)}" src="${asset(t.poster)}" alt="" width="320" height="480" loading="lazy" referrerpolicy="no-referrer"><span class="movies-card-mark" aria-hidden="true">Q</span><span class="movies-poster-type">${t.kind==='tv'?'SERIES':'FILM'}</span><span class="movies-poster-logo">${escape(t.name)}</span><span class="movies-card-play" aria-hidden="true">${movieIcon('play')}</span></div><strong>${escape(t.name)}</strong><small>${escape(meta(t))}</small></a>`;}
 private shelf(name:string,titles:Title[],note=''){return `<section class="movies-shelf"><div class="movies-shelf-head"><h2>${name}</h2>${note?`<span>${note}</span>`:''}<div class="movies-row-arrows"><button data-scroll="-1" aria-label="Previous ${escape(name)}">‹</button><button data-scroll="1" aria-label="Next ${escape(name)}">›</button></div></div><div class="movies-row">${titles.map(t=>this.card(t)).join('')}</div></section>`;}
 private footer(){return `<footer class="movies-footer" aria-label="Credits and privacy"><strong>Your screen. Your privacy.</strong><p>My list and playback progress stay on this device. Full-catalog searches go through QCC’s metadata service to TMDB. Real posters and backdrops load from TMDB; its image server receives ordinary image requests.</p><p>${this.catalog.source==='tmdb'?`${this.catalog.attributionLogo?`<img class="movies-tmdb" src="${asset(this.catalog.attributionLogo)}" alt="TMDB" width="100" height="40">`:''}This product uses the TMDB API but is not endorsed or certified by TMDB.`:'Starter selection · Real title artwork from TMDB. Original summaries. Ratings are not supplied. This is not a live trending feed.'}</p>${this.catalog.updated?`<p>Catalog snapshot: ${escape(this.catalog.updated)}</p>`:''}<p>Streaming is provided by an external service. QCC does not verify its availability or distribution rights. Movies are excluded from game offline downloads.</p><button data-action="clear">Clear my list &amp; playback progress</button><p class="movies-storage" role="status">${this.storage.durable?'Saved only on this device.':'Browser storage is unavailable. Changes last only for this visit.'}</p></footer>`;}
 private browse(){
  const available=this.kind==='list'?this.catalog.titles.filter(t=>this.storage.data.list.includes(t.id)):this.catalog.titles;
  const local=filterTitles(available,this.query,this.kind,this.genre);
  // TMDB can match aliases and translated titles absent from the display text.
  const remote=this.kind==='list'?[]:filterTitles(this.remoteTitles,'',this.kind,this.genre);
  const filtered=[...new Map([...local,...remote].map(t=>[t.id,t])).values()];
  const simple=this.query.trim()||this.kind!=='all'||this.genre!=='All';
  const hero=this.remoteTitles[0]??this.catalog.titles[0];
  const season=hero?.seasons.find(s=>s.episodes.length);
  const heroRoute:MovieRoute=hero?.kind==='tv'?{id:hero.id,season:season?.number,episode:season?.episodes[0]?.number,play:true}:{id:hero?.id,play:true};
  const heroSource=hero?(licensedSource(this.licenses,mediaKey(hero,heroRoute))??frameSource(hero,heroRoute)):undefined;
  const heroPlay=hero?titleHash(hero.id)+(hero.kind==='tv'&&season?`/season/${season.number}/episode/${season.episodes[0].number}`:'')+'/play':'';
  return `${!simple&&hero?`<section class="movies-hero" style="--movies-hero:url('${asset(hero.backdrop??hero.poster)}');--movies-hero-fallback:url('${asset(hero.poster)}')"><div class="movies-hero-copy"><p class="movies-eyebrow"><span aria-hidden="true">Q</span> THE CINEMA COLLECTION</p><h1 tabindex="-1"><a href="${titleHash(hero.id)}">${escape(hero.name)}</a></h1><p class="movies-hero-tagline">Go further. Find your next great story.</p><p>${escape(hero.overview)}</p><div class="movies-hero-actions"><button class="movies-primary" data-play-route="${heroPlay}" ${heroSource?'':'disabled aria-describedby="movies-hero-unavailable"'}>${movieIcon("play")} Play</button><a class="movies-secondary" href="${titleHash(hero.id)}">${movieIcon("info")} More Info</a><button class="movies-hero-list" data-list="${hero.id}" aria-pressed="${this.storage.data.list.includes(hero.id)}">${movieIcon("plus")} My List</button></div><p class="movies-hero-note" id="movies-hero-unavailable">${heroSource?'Streaming available · External player':'No provider identifier is available'}</p></div><span class="movies-hero-index">${hero.year||'Year unknown'} <span>|</span> ${hero.kind==='tv'?'SERIES':'FILM'}</span></section>`:`<h1 class="movies-page-title" tabindex="-1">${this.kind==='list'?'My list':this.kind==='tv'?'Series':this.kind==='movie'?'Movies':'Find your next story'}</h1>`}
  <div class="movies-browse"><div class="movies-filterbar"><label class="movies-search"><span aria-hidden="true">⌕</span><span class="sr-only">Search movies and TV</span><input type="search" id="movies-search" placeholder="Search movies, TV shows…" autocomplete="off" value="${escape(this.query)}"></label><label>Genre <select id="movies-genre" aria-label="Genre">${['All',...[...new Set(this.catalog.titles.flatMap(t=>t.genres))].sort()].map(g=>`<option${this.genre===g?' selected':''}>${escape(g)}</option>`).join('')}</select></label></div><div id="movies-results" aria-live="polite">${simple?`<p class="movies-result-count">${filtered.length} ${filtered.length===1?'title':'titles'}</p>${filtered.length?`<div class="movies-results-grid">${filtered.map(t=>this.card(t)).join('')}</div>`:`<div class="movies-empty"><h2>${this.kind==='list'&&!this.query?'Make it a movie night.':'No titles found'}</h2><p>${this.kind==='list'&&!this.query?'Open a title and choose “Add to my list” to keep it here.':'Try another title or clear your filters. Search covers this catalog snapshot only.'}</p><button data-action="reset">Explore all titles</button></div>`}`:`${this.shelf(this.remoteTitles.length?'Trending Movies':this.catalog.source==='tmdb'?'Trending in this snapshot':'Movies you’ll love',this.remoteTitles.length?this.remoteTitles.filter(t=>t.kind==='movie'):this.catalog.source==='tmdb'?this.catalog.titles.filter(t=>this.catalog.trending.includes(t.id)):this.catalog.titles.filter(t=>t.kind==='movie').slice(0,6),this.remoteTitles.length?'Updated weekly by TMDB':this.catalog.source==='tmdb'?'Snapshot, not live activity':'THE STARTER SELECTION')}${this.shelf(this.remoteTitles.length?'Trending TV':'TV shows to get lost in',this.remoteTitles.length?this.remoteTitles.filter(t=>t.kind==='tv'):this.catalog.titles.filter(t=>t.kind==='tv'),'SERIES')}${this.shelf('Sci-Fi & Fantasy',(this.remoteTitles.length?this.remoteTitles:this.catalog.titles).filter(t=>t.genres.includes('Science Fiction')||t.genres.includes('Fantasy')),'ESCAPE THE EVERYDAY')}`}</div>${this.footer()}</div>`;
 }
 private detail(t:Title){
  const selected=this.storage.data.list.includes(t.id);
  const season=t.seasons.find(s=>s.number===this.route.season)||t.seasons[0];
  const key=mediaKey(t,this.route),source=t.kind==='movie'?(licensedSource(this.licenses,key)??frameSource(t,this.route)):undefined;
  return `<a class="movies-detail-back" href="#/movies">← Back to browsing</a><section class="movies-detail"><img class="movies-detail-art" src="${asset(t.poster)}" alt="Poster for ${escape(t.name)}" width="320" height="480"><div><p class="movies-eyebrow">${t.kind==='tv'?'QCC SERIES COLLECTION':'QCC CINEMA COLLECTION'}</p><h1 tabindex="-1">${escape(t.name)}</h1><p class="movies-meta">${escape(meta(t))}</p><div class="movies-tags">${t.genres.map(g=>`<span>${escape(g)}</span>`).join('')}</div><p class="movies-overview">${escape(t.overview)}</p><div class="movies-actions">${t.kind==='movie'?`<button class="movies-primary" data-play="${t.id}" ${source?'':'disabled aria-describedby="movies-unavailable"'}>${source?'▶ Play movie':'Playback unavailable'}</button><a href="${titleHash(t.id)}/play">Playback information</a>`:''}<button data-list="${t.id}" aria-pressed="${selected}">${selected?'✓ In my list':'+ Add to my list'}</button></div><p id="movies-unavailable" class="movies-availability">${source?'Streaming available. An external player receives normal connection and playback information.':'Choose an episode below to stream this series.'}</p></div></section>${t.kind==='tv'?`<section class="movies-episodes"><div class="movies-shelf-head"><h2>Episodes</h2>${season?`<label>Season <select id="movies-season" aria-label="Season">${t.seasons.map(s=>`<option value="${s.number}"${s===season?' selected':''}>${escape(s.name)}</option>`).join('')}</select></label>`:''}</div>${season?season.episodes.map(e=>{
   const route={id:t.id,season:season.number,episode:e.number,play:true};const href=`${titleHash(t.id)}/season/${season.number}/episode/${e.number}/play`;const source=licensedSource(this.licenses,mediaKey(t,route))??frameSource(t,route);
   return `<article class="movies-episode"><span class="movies-episode-number">${String(e.number).padStart(2,'0')}</span><div><h3>${escape(e.name)}</h3><p>${escape(e.overview||'No description supplied.')}</p><small>${e.runtime?`${e.runtime} min · `:''}${source?'Streaming available':'Provider identifier unavailable'}</small></div><a href="${href}" aria-label="${source?'Play':'Playback information for'} ${escape(e.name)}">${source?'▶ Play':'Details →'}</a></article>`;
  }).join(''):'<p>Episode metadata has not been included in this snapshot.</p>'}</section>`:''}`;
 }
 private player(t:Title){
  const episode=t.seasons.find(s=>s.number===this.route.season)?.episodes.find(e=>e.number===this.route.episode);
  const source=!this.preferExternal&&(t.kind==='movie'||episode)?licensedSource(this.licenses,mediaKey(t,this.route)):undefined;
  const provider=streamProvider(this.providerId);
  const external=frameSource(t,this.route,this.providerId,this.storage.data.progress[mediaKey(t,this.route)]??0);
  const back=titleHash(t.id)+(episode?`/season/${this.route.season}/episode/${this.route.episode}`:'');
  return `<div class="movies-player"><a class="movies-detail-back" href="${back}">← Back to ${escape(t.name)}</a><p class="movies-eyebrow">QCC SCREEN / ${t.kind==='tv'?'SERIES':'CINEMA'}</p><h1 tabindex="-1">${escape(t.name)}</h1>${episode?`<h2>S${this.route.season} · E${episode.number} — ${escape(episode.name)}</h2>`:''}<div class="movies-screen" data-title="${t.id}" tabindex="-1" aria-label="Player area"><div class="movies-media">${source?`<video controls playsinline preload="metadata" referrerpolicy="no-referrer" aria-label="${escape(t.name)} player" src="${asset(source.path)}"></video>`:external?`<iframe class="movies-provider-frame" data-provider="${this.providerId}" data-media-key="${escape(mediaKey(t,this.route))}" src="${escape(external)}" title="${escape(t.name)} streaming player" sandbox="${FRAME_SANDBOX}" allow="${FRAME_ALLOW}" referrerpolicy="no-referrer" allowfullscreen></iframe>`:`<div class="movies-player-unavailable"><span aria-hidden="true">▷</span><h2>Playback unavailable</h2><p>${t.kind==='tv'&&!episode?'This episode is not in the current catalog.':'This title has no valid provider identifier.'}</p><p>Choose a title with a supported movie or series identifier.</p><a class="movies-primary" href="${back}">Return to title</a></div>`}</div><div class="movies-next" role="dialog" aria-label="Up next" hidden></div><p class="movies-next-announcement sr-only" role="status" aria-live="polite"></p><button data-action="fullscreen" class="movies-fullscreen"${this.fullscreenSupported()?'':' hidden'} aria-pressed="false">Full screen</button></div>${t.kind==='tv'?`<label class="movies-auto-next"><input type="checkbox" id="movies-auto-next"${this.preferences.autoNext()?' checked':''}> Auto next episode</label>`:''}<p id="movies-player-status" role="status">${source?`Licensed under ${escape(source.license)} · ${escape(source.credit)}. Progress stays on this device.`:external?`External player provided by ${provider.name}. It and its streaming providers receive your IP address and normal playback requests and may serve ads or use cookies. Availability and distribution rights are not verified by QCC. No account data or watchlist is sent by QCC.`:'No provider identifier is available for this title.'}</p>${external&&!source?`<div class="movies-source-controls" role="group" aria-label="Streaming source"><label for="movies-source">Source <select id="movies-source" aria-describedby="movies-source-help">${STREAM_PROVIDERS.map(item=>`<option value="${item.id}"${item.id===this.providerId?' selected':''}>${item.name}</option>`).join('')}</select></label><button data-action="next-source">Try another source</button><button data-action="reload-stream">Reload player</button><p id="movies-source-help">Player blocked or not loading? Try another source. Your episode stays selected. ${provider.resume==='none'?'This source may start at the beginning and cannot share playback progress.':'Playback position resumes where supported.'}</p></div>`:''}</div>`;
 }
 private mobileNav(){return `<nav class="movies-mobile-nav" aria-label="Mobile movies navigation"><button data-kind="all">${movieIcon('home')}<span>Home</span></button><button data-action="search">${movieIcon('search')}<span>Search</span></button><button data-kind="list">${movieIcon('list')}<span>My list</span></button><button data-action="study">${movieIcon('study')}<span>Study</span></button></nav>`;}
 private render(message=''){
  const title=this.catalog.titles.find(t=>t.id===this.route.id);
  if(this.route.play&&title&&this.screenFullscreen()&&this.root.querySelector<HTMLElement>('.movies-screen')?.dataset.title===title.id){this.refreshPlayer(title);return;}
  this.stopVideo();
  this.root.innerHTML=this.header()+(!this.ready?`<div class="movies-empty"><h1 tabindex="-1">${this.failed?'The collection is unavailable':'Opening the collection…'}</h1><p>${this.failed?escape(this.loadError||'Connect to this site and try again. Movies are separate from the games offline pack.'):'Your next story is on its way.'}</p>${this.failed?'<button data-action="retry">Try again</button>':''}</div>`:message?`<div class="movies-empty"><h1>${escape(message)}</h1><a href="#/movies">Back to browsing</a></div>`:this.route.id?(()=>{const t=this.catalog.titles.find(t=>t.id===this.route.id);return t?(this.route.play?this.player(t):this.detail(t)):'<div class="movies-empty"><h1>Title not found</h1><p>This title is not in the catalog snapshot.</p><a href="#/movies">Browse the collection</a></div>';})():this.browse())+this.mobileNav();
  if(!this.route.id&&(this.query.trim().length>=2||this.remoteError)){
   const results=this.root.querySelector<HTMLElement>('#movies-results');
   if(results){
    const status=document.createElement('p');status.className='movies-catalog-status';status.setAttribute('role','status');
    status.textContent=this.remoteLoading?'Searching the full movie and TV catalog…':this.remoteError?this.remoteError+' The titles included with this site are still searchable.':this.remoteTitles.length?'Showing full-catalog results from TMDB.':'No additional matches in the full catalog.';
    if(this.remoteError){const retry=document.createElement('button');retry.textContent='Retry search';retry.dataset.action='retry-search';status.append(' ',retry);}
    results.prepend(status);
    if(this.remotePages>1){
     const pagination=document.createElement('div');pagination.className='movies-pagination';
     const previous=document.createElement('button');previous.textContent='Previous';previous.dataset.action='catalog-page';previous.dataset.page=String(this.remotePage-1);previous.disabled=this.remotePage<=1;
     const label=document.createElement('span');label.textContent='Page '+this.remotePage+' of '+this.remotePages;
     const next=document.createElement('button');next.textContent='Next';next.dataset.action='catalog-page';next.dataset.page=String(this.remotePage+1);next.disabled=this.remotePage>=this.remotePages;
     pagination.append(previous,label,next);results.append(pagination);
    }
   }
  }
  if(this.route.id&&this.pendingTitle){
   const main=this.root.querySelector<HTMLElement>('.movies-empty');
   if(main){main.querySelector('h1')!.textContent='Loading title details…';const p=main.querySelector('p');if(p)p.textContent='Fetching current movie and episode information.';}
  }
  this.renderDetailError();
  if(this.dynamicIds.size){
   const paragraphs=this.root.querySelectorAll<HTMLElement>('.movies-footer p');
   if(paragraphs[1])paragraphs[1].textContent='Search and metadata use the TMDB database. This product uses the TMDB API but is not endorsed or certified by TMDB.';
  }
  this.bindPlayer();
 }
 private renderDetailError(){
  this.root.querySelector('.movies-detail-error')?.remove();
  this.root.querySelector('.movies-empty [data-action="retry-title"]')?.remove();
  if(!this.route.id||!this.detailError)return;
  let notice=this.root.querySelector<HTMLElement>('.movies-empty');
  if(notice){notice.querySelector('h1')!.textContent='Title details unavailable';const text=notice.querySelector('p');if(text)text.textContent=this.detailError;}
  else{
   notice=document.createElement('div');notice.className='movies-catalog-status movies-detail-error';notice.setAttribute('role','status');notice.textContent=this.detailError;
   const screen=this.root.querySelector('.movies-screen');
   if(screen)screen.append(notice);
   else this.root.querySelector('.movies-top')?.after(notice);
  }
  const retry=document.createElement('button');retry.textContent='Retry title';retry.dataset.action='retry-title';notice.append(' ',retry);
 }
 private bindPlayer(){
  this.ended=false;
  this.video=this.root.querySelector('video')??undefined;
  this.frame=this.root.querySelector('iframe')??undefined;
  if(this.frame){const title=this.catalog.titles.find(t=>t.id===this.route.id)!;this.progressKey=mediaKey(title,this.route);this.frameTime=this.storage.data.progress[this.progressKey]??0;this.lastSave=0;}
  if(this.video){
   const video=this.video,t=this.catalog.titles.find(t=>t.id===this.route.id)!;
   this.progressKey=mediaKey(t,this.route);this.lastSave=0;const key=this.progressKey;
   video.addEventListener('loadedmetadata',()=>{if(this.video!==video)return;const time=this.storage.data.progress[key];if(time&&Number.isFinite(video.duration)&&time<video.duration-2)video.currentTime=time;});
   video.addEventListener('play',()=>{if(this.video===video&&!document.hidden&&!this.root.closest('[inert]'))this.suspended=false;});
   video.addEventListener('ended',()=>{if(this.video===video)this.episodeEnded();});
   video.addEventListener('timeupdate',()=>{if(this.video!==video)return;this.rearm(video.currentTime,video.duration);if(!this.ended&&Date.now()-this.lastSave>5000){this.storage.progress(key,video.currentTime);this.lastSave=Date.now();}});
   video.addEventListener('pause',()=>{if(this.video===video)this.storage.progress(key,this.ended?0:video.currentTime);});
   video.addEventListener('error',()=>{if(this.video!==video)return;const status=this.root.querySelector('#movies-player-status');if(status){status.textContent='The local file could not be played. ';const button=document.createElement('button');button.dataset.action='external-stream';button.textContent='Use external player';status.append(button);}});
  }
  if(this.suspended||document.hidden)this.pause();
 }
 private providerMessage=(event:MessageEvent)=>{
  if(!this.frame||event.source!==this.frame.contentWindow)return;
  const signal=providerSignal(this.providerId,event.origin,event.data);if(!signal||signal.kind==='ready')return;
  if(signal.kind==='ended'){this.episodeEnded();return;}
  this.frameTime=signal.currentTime;
  if(signal.duration){this.rearm(signal.currentTime,signal.duration);if(signal.duration-signal.currentTime<=1)this.episodeEnded();}
  if(signal.ended)this.episodeEnded();
  if(!this.ended&&Date.now()-this.lastSave>5000){this.storage.progress(this.progressKey,this.frameTime);this.lastSave=Date.now();}
 };
 private click=(event:MouseEvent)=>{
  const target=(event.target as Element).closest<HTMLElement>('button');if(!target)return;
  if(target.dataset.scroll){const row=target.closest('.movies-shelf')?.querySelector('.movies-row');row?.scrollBy({left:Number(target.dataset.scroll)*row.clientWidth*.85,behavior:this.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
  if(target.dataset.kind){this.kind=target.dataset.kind;this.query='';this.searchRequest++;this.metadataAbort?.abort();clearTimeout(this.searchTimer);this.remoteTitles=[];this.remoteLoading=false;this.remoteError='';this.genre='All';if(this.route.id){this.homeNavigation=true;location.hash='#/movies';}else{this.render();this.root.scrollTop=0;}}
  if(target.dataset.list){this.storage.toggle(target.dataset.list);this.render();this.root.querySelector<HTMLElement>('[data-list]')?.focus();}
  if(target.dataset.playRoute)location.hash=target.dataset.playRoute;
  if(target.dataset.play)location.hash=titleHash(target.dataset.play)+'/play';
  switch(target.dataset.action){case 'search':{this.kind='all';this.genre='All';if(this.route.id){this.focusSearch=true;location.hash='#/movies';}else{this.render();this.searchFocus();}break;}case 'catalog-page':void this.fetchCatalog(this.query,Number(target.dataset.page));break;case 'retry-search':void this.fetchCatalog(this.query,this.remoteRequestedPage);break;case 'retry-title':if(this.route.id)void this.loadTitle(this.route.id,this.route.season);break;case 'next-source':this.switchProvider(STREAM_PROVIDERS[(STREAM_PROVIDERS.findIndex(provider=>provider.id===this.providerId)+1)%STREAM_PROVIDERS.length].id,'next-source');break;case 'reload-stream':this.stopVideo();this.suspended=false;this.render();break;case 'study':this.pause();this.study();break;case 'retry':void this.load();break;case 'play-next':this.playNext();break;case 'cancel-next':this.cancelNext(true);break;case 'fullscreen':void this.toggleFullscreen();break;case 'resume-stream':this.suspended=false;this.render();break;case 'external-stream':this.preferExternal=true;this.render();break;case 'reset':this.query='';this.searchRequest++;this.metadataAbort?.abort();this.remoteTitles=[];this.remoteError='';this.remoteLoading=false;this.kind='all';this.genre='All';this.render();break;case 'clear':this.storage.clear();this.render();this.root.querySelector<HTMLElement>('[data-action="clear"]')?.focus();break;}
 };
 private switchProvider(providerId:StreamProviderId,focus='movies-source'){
  if(providerId===this.providerId)return;
  this.stopVideo();this.providerId=providerId;this.preferExternal=true;this.suspended=false;this.render();
  (focus==='movies-source'?this.root.querySelector<HTMLElement>('#movies-source'):this.root.querySelector<HTMLElement>('[data-action="next-source"]'))?.focus({preventScroll:true});
 }
 private searchFocus(){const search=this.root.querySelector<HTMLInputElement>('#movies-search');search?.focus({preventScroll:true});search?.scrollIntoView({block:'center'});}
 private input=(event:Event)=>{
  if((event.target as HTMLElement).id!=='movies-search')return;
  this.query=(event.target as HTMLInputElement).value;
  const start=(event.target as HTMLInputElement).selectionStart;
  this.searchRequest++;this.metadataAbort?.abort();clearTimeout(this.searchTimer);
  this.remoteTitles=[];this.remotePage=1;this.remotePages=1;this.remoteError='';
  this.remoteLoading=this.query.trim().length>=2;
  const top=this.root.scrollTop;this.render();const input=this.root.querySelector<HTMLInputElement>('#movies-search');input?.focus({preventScroll:true});if(start!==null)input?.setSelectionRange(start,start);this.root.scrollTop=top;
  const query=this.query.trim();if(query.length>=2)this.searchTimer=setTimeout(()=>void this.fetchCatalog(query,1),280);
 };
 private change=(event:Event)=>{
  const input=event.target as HTMLSelectElement;
  if(input.id==='movies-source'){const provider=STREAM_PROVIDERS.find(provider=>provider.id===input.value);if(provider)this.switchProvider(provider.id);}
  if(input.id==='movies-auto-next'){const value=(event.target as HTMLInputElement).checked;this.preferences.setAutoNext(value);if(!value)this.cancelNext();}
  if(input.id==='movies-genre'){this.genre=input.value;this.render();this.root.querySelector<HTMLElement>('#movies-genre')?.focus({preventScroll:true});}
  if(input.id==='movies-season'&&this.route.id){const selected=this.catalog.titles.find(t=>t.id===this.route.id)?.seasons.find(s=>s.number===Number(input.value));if(selected&&!selected.episodes.length)location.hash=titleHash(this.route.id)+'/season/'+selected.number+'/episode/1';}
  if(input.id==='movies-season'&&this.route.id){const season=this.catalog.titles.find(t=>t.id===this.route.id)?.seasons.find(s=>s.number===Number(input.value));const episode=season?.episodes[0];if(episode)location.hash=`${titleHash(this.route.id)}/season/${season!.number}/episode/${episode.number}`;}
 };
 private fullscreenElement(){return document.fullscreenElement||(document as FullscreenDocument).webkitFullscreenElement;}
 private screenFullscreen(){const screen=this.root.querySelector('.movies-screen');return !!screen&&this.fullscreenElement()===screen;}
 private fullscreenSupported(){const element=document.documentElement as FullscreenElement;return typeof element.requestFullscreen==='function'||typeof element.webkitRequestFullscreen==='function';}
 private async exitFullscreen(){
  if(!this.fullscreenElement())return;
  this.intentionalExit=true;const doc=document as FullscreenDocument;
  try{if(document.fullscreenElement&&document.exitFullscreen)await document.exitFullscreen();else doc.webkitExitFullscreen?.();}catch{this.intentionalExit=false;}
 }
 private async toggleFullscreen(){
  if(this.fullscreenElement()){await this.exitFullscreen();return;}
  const screen=this.root.querySelector<FullscreenElement>('.movies-screen');if(!screen)return;
  try{if(screen.requestFullscreen)await screen.requestFullscreen();else screen.webkitRequestFullscreen?.();}catch{/* The browser can deny fullscreen. */}
  if(!screen.isConnected||this.suspended||document.hidden)await this.exitFullscreen();
 }
 private fullscreenChange=()=>{
  const active=!!this.fullscreenElement();
  if(this.wasFullscreen&&!active){if(!this.intentionalExit)this.cancelNext(true);this.intentionalExit=false;}
  this.wasFullscreen=active;
  const button=this.root.querySelector('[data-action="fullscreen"]');button?.setAttribute('aria-pressed',String(this.screenFullscreen()));
 };
 private refreshPlayer(title:Title){
  const screen=this.root.querySelector<HTMLElement>('.movies-screen'),player=screen?.parentElement;if(!screen||!player)return;
  const template=document.createElement('template');template.innerHTML=this.player(title);const next=template.content.firstElementChild!;
  const nextFrame=next.querySelector('iframe');
  const preserveFrame=!!this.frame&&!!nextFrame&&this.frame.dataset.provider===nextFrame.dataset.provider&&this.frame.dataset.mediaKey===nextFrame.dataset.mediaKey;
  if(preserveFrame)this.frame!.title=nextFrame!.title;
  else{this.stopVideo();screen.querySelector('.movies-media')!.replaceChildren(...next.querySelector('.movies-media')!.childNodes);}
  for(const child of [...player.children])if(child!==screen)child.remove();
  let before=true;for(const child of [...next.children]){if(child.classList.contains('movies-screen'))before=false;else if(before)player.insertBefore(child,screen);else player.append(child);}
  if(!preserveFrame)this.bindPlayer();this.renderDetailError();this.fullscreenChange();
 }
 private rearm(time:number,duration:number){if(this.ended&&Number.isFinite(duration)&&duration>0&&duration-time>5){this.ended=false;this.cancelNext();}}
 private episodeEnded(){
  const title=this.catalog.titles.find(t=>t.id===this.route.id);if(this.suspended||this.ended||!this.route.play||title?.kind!=='tv')return;
  this.ended=true;this.frameTime=0;this.storage.progress(this.progressKey,0);
  const next=nextEpisode(title,this.route.season!,this.route.episode!);if(!next||!this.preferences.autoNext())return;
  this.cancelNext();const generation=this.countdownGeneration;
  const show=()=>{
   if(generation!==this.countdownGeneration||!this.ended||!this.preferences.autoNext())return;
   const overlay=this.root.querySelector<HTMLElement>('.movies-next');if(!overlay)return;
   this.nextHash=`${titleHash(title.id)}/season/${next.season}/episode/${next.episode}/play`;
   const label=`Up next: S${next.season} · E${next.episode}${next.name?' — '+next.name:''}`;
   overlay.innerHTML=`<h2>${escape(label)}</h2><p class="movies-next-countdown">Playing in 10</p><div><button class="movies-primary" data-action="play-next">Play now</button><button data-action="cancel-next">Cancel</button></div>`;overlay.hidden=false;
   const announcement=this.root.querySelector('.movies-next-announcement');if(announcement)announcement.textContent=label+'. Playing in 10 seconds.';
   overlay.querySelector<HTMLElement>('[data-action="play-next"]')?.focus({preventScroll:true});
   let seconds=10;this.countdown=setInterval(()=>{if(!this.preferences.autoNext()){this.cancelNext();return;}seconds--;if(seconds<=0)this.playNext();else {const count=overlay.querySelector('.movies-next-countdown');if(count)count.textContent='Playing in '+seconds;}},1000);
  };
  if(this.fullscreenElement()&&(this.fullscreenElement()===this.frame||this.fullscreenElement()===this.video))void this.exitFullscreen().then(show);else show();
 }
 private cancelNext(focus=false){
  this.countdownGeneration++;clearInterval(this.countdown);this.countdown=undefined;this.nextHash='';
  const overlay=this.root.querySelector<HTMLElement>('.movies-next');const visible=overlay&&!overlay.hidden;if(overlay)overlay.hidden=true;
  const announcement=this.root.querySelector('.movies-next-announcement');if(announcement)announcement.textContent='';
  if(focus&&visible)this.root.querySelector<HTMLElement>('.movies-screen')?.focus({preventScroll:true});
 }
 private playNext(){const hash=this.nextHash;this.cancelNext();if(hash&&this.preferences.autoNext())location.hash=hash;}
 private keydown=(event:KeyboardEvent)=>{if(event.key==='Enter'&&this.nextHash&&!(event.target as Element).closest('button')){event.preventDefault();this.playNext();}};
 pause(){this.suspended=true;this.cancelNext();if(this.video){this.storage.progress(this.progressKey,this.ended?0:this.video.currentTime);this.video.pause();}if(this.frame){this.storage.progress(this.progressKey,this.ended?0:this.frameTime);this.frame.remove();this.frame=undefined;const media=this.root.querySelector('.movies-media');if(media)media.innerHTML='<div class="movies-player-unavailable"><h2>Stream paused</h2><p>The external player was unloaded while you read or left the tab.</p><button class="movies-primary" data-action="resume-stream">Resume stream</button></div>';}}
 private stopVideo(){this.cancelNext();if(this.frame)this.storage.progress(this.progressKey,this.ended?0:this.frameTime);this.frame?.remove();this.frame=undefined;if(this.video){const video=this.video;this.storage.progress(this.progressKey,this.ended?0:video.currentTime);this.video=undefined;video.pause();video.removeAttribute('src');video.load();}}
 dispose(){this.abort.abort();this.metadataAbort?.abort();this.detailAbort?.abort();this.searchRequest++;this.detailRequest++;clearTimeout(this.searchTimer);this.stopVideo();document.removeEventListener('visibilitychange',this.onVisibility);document.removeEventListener('fullscreenchange',this.fullscreenChange);document.removeEventListener('webkitfullscreenchange',this.fullscreenChange);window.removeEventListener('message',this.providerMessage);this.root.remove();document.body.classList.remove('movies-active');}
}
