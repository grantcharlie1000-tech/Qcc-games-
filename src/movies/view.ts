import './style.css';
import {movieIcon} from './icons';
import {filterTitles,licensedSource,mediaKey,parseCatalog,parseMovieRoute,titleHash} from './model';
import type {Catalog,MovieRoute,Title} from './model';
import {MovieStorage} from './storage';
const base=import.meta.env.BASE_URL;
const escape=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
// Absolute same-origin URLs also resolve correctly inside CSS custom properties in /assets/ stylesheets.
const asset=(v:string)=>new URL(base+v,document.baseURI).href;
const meta=(t:Title)=>`${t.year} · ${t.kind==='tv'?'Series':t.runtime?`${t.runtime} min`:'Movie'}${t.rating===undefined?'':` · ★ ${t.rating.toFixed(1)}/10`}`;
export class MoviesView {
 readonly root=document.createElement('section');
 private catalog:Catalog={titles:[],source:'starter',trending:[]};
 private licenses:unknown=[];
 private storage=new MovieStorage();
 private abort=new AbortController();
 private ready=false;
 private failed=false;
 private query='';
 private focusSearch=false;
 private homeNavigation=false;
 private kind='all';
 private genre='All';
 private browseScroll=0;
 private returnFocus='';
 private positions=new Map<string,{top:number;href:string}>();
 private video?:HTMLVideoElement;
 private progressKey='';
 private lastSave=0;
 private route:MovieRoute={play:false};
 private onVisibility=()=>{if(document.hidden)this.pause();};
 constructor(container:HTMLElement,private study:()=>void,private reducedMotion:boolean,origin?:DOMRect){
  this.root.className='movies-view';this.root.setAttribute('aria-label','Movies and TV');this.root.tabIndex=-1;
  container.replaceChildren(this.root);document.body.classList.add('movies-active');
  this.root.addEventListener('click',this.click);
  this.root.addEventListener('input',this.input);
  this.root.addEventListener('change',this.change);
  document.addEventListener('visibilitychange',this.onVisibility);
  this.root.focus();
  if(origin&&!reducedMotion&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
   this.root.animate([{transform:`translate(${origin.x}px, ${origin.y}px) scale(${origin.width/innerWidth}, ${origin.height/innerHeight})`,opacity:.45},{transform:'none',opacity:1}],{duration:260,easing:'cubic-bezier(0.23, 1, 0.32, 1)'});
  }
  this.root.style.transformOrigin='top left';this.render();void this.load();
 }
 async load(){
  this.failed=false;this.ready=false;this.render();
  try{
   const response=await fetch(asset('movies/catalog.json'),{signal:this.abort.signal,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',redirect:'error'});
   if(!response.ok)throw new Error('Catalog unavailable');
   this.catalog=parseCatalog(await response.json());
   if(!this.catalog.titles.length)throw new Error('Empty catalog');
   // Optional registry failure disables playback, never discovery.
   try {const response=await fetch(asset('movies/licenses.json'),{signal:this.abort.signal,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',redirect:'error'});this.licenses=response.ok?await response.json():[];}catch{this.licenses=[];}
   if(this.abort.signal.aborted)return;
   this.ready=true;this.render();
  }catch{if(!this.abort.signal.aborted){this.failed=true;this.render();}}
 }
 private positionKey(route:MovieRoute){const title=this.catalog.titles.find(t=>t.id===route.id);return route.play?JSON.stringify(route):route.id?`${route.id}:s${route.season??title?.seasons[0]?.number??0}`:'browse';}
 navigate(hash:string){
  const next=parseMovieRoute(hash);
  if(!next){this.route={play:false};this.render('That page could not be found.');return;}
  if(!this.route.id&&next.id){this.browseScroll=this.root.scrollTop;this.returnFocus=(document.activeElement as HTMLElement)?.dataset.title||'';}
  this.positions.set(this.positionKey(this.route),{top:this.root.scrollTop,href:(document.activeElement as Element)?.closest('a')?.getAttribute('href')||''});
  const returning=!!this.route.id&&!next.id;
  this.stopVideo();this.route=next;this.render();
  if(this.focusSearch){this.focusSearch=false;this.searchFocus();return;}
  if(this.homeNavigation){this.homeNavigation=false;this.root.scrollTop=0;this.root.querySelector<HTMLElement>('h1')?.focus({preventScroll:true});return;}
  if(returning){this.root.scrollTop=this.browseScroll;this.root.querySelector<HTMLElement>(`[data-title="${this.returnFocus}"]`)?.focus({preventScroll:true});}
  else {const previous=this.positions.get(this.positionKey(next));this.root.scrollTop=previous?.top??0;
   const focus=previous?.href?this.root.querySelector<HTMLElement>(`a[href="${CSS.escape(previous.href)}"]`):null;
   (focus??this.root.querySelector<HTMLElement>('h1'))?.focus({preventScroll:true});}
 }
 private header(){return `<header class="movies-top"><a class="movies-brand" href="#/movies" aria-label="QCC Movies and TV home">QCC<span>MOVIES &amp; TV</span></a><nav aria-label="Movies and TV navigation">${[['all','Home'],['tv','TV Shows'],['movie','Movies'],['list','My list']].map(([kind,name])=>`<button data-kind="${kind}" aria-pressed="${this.kind===kind&&!this.route.id}">${name}</button>`).join('')}</nav><div class="movies-top-tools"><button data-action="search" class="movies-search-toggle" aria-label="Search movies and TV">${movieIcon('search')}</button><a class="movies-back" aria-label="Games" href="#/collection">← Games</a><button data-action="study" class="movies-study">Study Mode <kbd>Esc</kbd></button><span class="movies-profile" aria-hidden="true">Q</span></div></header>`;}
 private card(t:Title){const slot=['movie-157336','movie-438631','movie-329865','movie-129','movie-120467','movie-286217','tv-19885','tv-68595'].indexOf(t.id);const atlas=this.catalog.source==='starter'&&slot>=0;return `<a class="movies-poster" href="${titleHash(t.id)}" data-title="${t.id}" aria-label="Details for ${escape(t.name)}"><div class="movies-poster-art"><img ${atlas?`class="movies-atlas" style="left:-${slot%4*100}%;top:-${Math.floor(slot/4)*177.7778+38.8889}%"`:""} src="${asset(atlas?"movies/art/collection-stills.webp":t.poster)}" alt="" width="320" height="480" loading="lazy"><span class="movies-card-mark" aria-hidden="true">Q</span><span class="movies-poster-type">${t.kind==='tv'?'SERIES':'FILM'}</span><span class="movies-poster-logo">${escape(t.name)}</span><span class="movies-card-play" aria-hidden="true">${movieIcon("play")}</span></div><strong>${escape(t.name)}</strong><small>${escape(meta(t))}</small></a>`;}
 private shelf(name:string,titles:Title[],note=''){return `<section class="movies-shelf"><div class="movies-shelf-head"><h2>${name}</h2>${note?`<span>${note}</span>`:''}<div class="movies-row-arrows"><button data-scroll="-1" aria-label="Previous ${escape(name)}">‹</button><button data-scroll="1" aria-label="Next ${escape(name)}">›</button></div></div><div class="movies-row">${titles.map(t=>this.card(t)).join('')}</div></section>`;}
 private footer(){return `<footer class="movies-footer" aria-label="Credits and privacy"><strong>Your screen. Your privacy.</strong><p>Search stays on this device. My list and playback progress are stored only in this browser. No ads, trackers or external players.</p><p>${this.catalog.source==='tmdb'?`${this.catalog.attributionLogo?`<img class="movies-tmdb" src="${asset(this.catalog.attributionLogo)}" alt="TMDB" width="100" height="40">`:''}This product uses the TMDB API but is not endorsed or certified by TMDB.`:'Starter selection · Original illustrative artwork and summaries; not official film stills. Ratings are not supplied. This is not a live trending feed.'}</p>${this.catalog.updated?`<p>Catalog snapshot: ${escape(this.catalog.updated)}</p>`:''}<p>Playback requires verified distribution rights and a private, same-origin media file. No external streaming provider is connected. Movies are excluded from game offline downloads.</p><button data-action="clear">Clear my list &amp; playback progress</button><p class="movies-storage" role="status">${this.storage.durable?'Saved only on this device.':'Browser storage is unavailable. Changes last only for this visit.'}</p></footer>`;}
 private browse(){
  const available=this.kind==='list'?this.catalog.titles.filter(t=>this.storage.data.list.includes(t.id)):this.catalog.titles;
  const filtered=filterTitles(available,this.query,this.kind,this.genre);
  const simple=this.query.trim()||this.kind!=='all'||this.genre!=='All';
  const hero=this.catalog.titles[0];
  const season=hero?.seasons.find(s=>s.episodes.length);
  const heroRoute:MovieRoute=hero?.kind==='tv'?{id:hero.id,season:season?.number,episode:season?.episodes[0]?.number,play:true}:{id:hero?.id,play:true};
  const heroSource=hero&&(hero.kind==='movie'||season)?licensedSource(this.licenses,mediaKey(hero,heroRoute)):undefined;
  const heroPlay=hero?titleHash(hero.id)+(hero.kind==='tv'&&season?`/season/${season.number}/episode/${season.episodes[0].number}`:'')+'/play':'';
  return `${!simple&&hero?`<section class="movies-hero" style="--movies-hero:url('${asset('movies/art/cinema-hero.webp')}')"><div class="movies-hero-copy"><p class="movies-eyebrow"><span aria-hidden="true">Q</span> THE CINEMA COLLECTION</p><h1 tabindex="-1"><a href="${titleHash(hero.id)}">${escape(hero.name)}</a></h1><p class="movies-hero-tagline">Go further. Find your next great story.</p><p>${escape(hero.overview)}</p><div class="movies-hero-actions"><button class="movies-primary" data-play-route="${heroPlay}" ${heroSource?'':'disabled aria-describedby="movies-hero-unavailable"'}>${movieIcon("play")} Play</button><a class="movies-secondary" href="${titleHash(hero.id)}">${movieIcon("info")} More Info</a><button class="movies-hero-list" data-list="${hero.id}" aria-pressed="${this.storage.data.list.includes(hero.id)}">${movieIcon("plus")} My List</button></div><p class="movies-hero-note" id="movies-hero-unavailable">${heroSource?'Verified licensed playback · Private by design':'Playback unavailable until a licensed source is verified'}</p></div><span class="movies-hero-index">${hero.year} <span>|</span> ${hero.kind==='tv'?'SERIES':'FILM'}</span></section>`:`<h1 class="movies-page-title" tabindex="-1">${this.kind==='list'?'My list':this.kind==='tv'?'Series':this.kind==='movie'?'Movies':'Find your next story'}</h1>`}
  <div class="movies-browse"><div class="movies-filterbar"><label class="movies-search"><span aria-hidden="true">⌕</span><span class="sr-only">Search movies and TV</span><input type="search" id="movies-search" placeholder="Titles, stories, genres…" autocomplete="off" value="${escape(this.query)}"></label><label>Genre <select id="movies-genre" aria-label="Genre">${['All',...[...new Set(this.catalog.titles.flatMap(t=>t.genres))].sort()].map(g=>`<option${this.genre===g?' selected':''}>${escape(g)}</option>`).join('')}</select></label></div><div id="movies-results" aria-live="polite">${simple?`<p class="movies-result-count">${filtered.length} ${filtered.length===1?'title':'titles'}</p>${filtered.length?`<div class="movies-results-grid">${filtered.map(t=>this.card(t)).join('')}</div>`:`<div class="movies-empty"><h2>${this.kind==='list'&&!this.query?'Make it a movie night.':'No titles found'}</h2><p>${this.kind==='list'&&!this.query?'Open a title and choose “Add to my list” to keep it here.':'Try another title or clear your filters. Search covers this catalog snapshot only.'}</p><button data-action="reset">Explore all titles</button></div>`}`:`${this.shelf(this.catalog.source==='tmdb'?'Trending in this snapshot':'Movies you’ll love',this.catalog.source==='tmdb'?this.catalog.titles.filter(t=>this.catalog.trending.includes(t.id)):this.catalog.titles.slice(0,6),this.catalog.source==='tmdb'?'Snapshot, not live activity':'THE STARTER SELECTION')}${this.shelf('TV shows to get lost in',this.catalog.titles.filter(t=>t.kind==='tv'),'SERIES')}${this.shelf('Sci-Fi & Fantasy',this.catalog.titles.filter(t=>t.genres.includes('Science Fiction')||t.genres.includes('Fantasy')),'ESCAPE THE EVERYDAY')}`}</div>${this.footer()}</div>`;
 }
 private detail(t:Title){
  const selected=this.storage.data.list.includes(t.id);
  const season=t.seasons.find(s=>s.number===this.route.season)||t.seasons[0];
  const key=mediaKey(t,this.route),source=t.kind==='movie'?licensedSource(this.licenses,key):undefined;
  return `<a class="movies-detail-back" href="#/movies">← Back to browsing</a><section class="movies-detail"><img class="movies-detail-art" src="${asset(t.poster)}" alt="Original artwork for ${escape(t.name)}" width="320" height="480"><div><p class="movies-eyebrow">${t.kind==='tv'?'QCC SERIES COLLECTION':'QCC CINEMA COLLECTION'}</p><h1 tabindex="-1">${escape(t.name)}</h1><p class="movies-meta">${escape(meta(t))}</p><div class="movies-tags">${t.genres.map(g=>`<span>${escape(g)}</span>`).join('')}</div><p class="movies-overview">${escape(t.overview)}</p><div class="movies-actions">${t.kind==='movie'?`<button class="movies-primary" data-play="${t.id}" ${source?'':'disabled aria-describedby="movies-unavailable"'}>${source?'▶ Play movie':'Playback unavailable'}</button><a href="${titleHash(t.id)}/play">Playback information</a>`:''}<button data-list="${t.id}" aria-pressed="${selected}">${selected?'✓ In my list':'+ Add to my list'}</button></div><p id="movies-unavailable" class="movies-availability">${source?'Verified licensed file · Served privately from this site.':'No verified licensed source is available for this title. External players are disabled to protect your privacy.'}</p></div></section>${t.kind==='tv'?`<section class="movies-episodes"><div class="movies-shelf-head"><h2>Episodes</h2>${season?`<label>Season <select id="movies-season" aria-label="Season">${t.seasons.map(s=>`<option value="${s.number}"${s===season?' selected':''}>${escape(s.name)}</option>`).join('')}</select></label>`:''}</div>${season?season.episodes.map(e=>{
   const route={id:t.id,season:season.number,episode:e.number,play:true};const href=`${titleHash(t.id)}/season/${season.number}/episode/${e.number}/play`;const source=licensedSource(this.licenses,mediaKey(t,route));
   return `<article class="movies-episode"><span class="movies-episode-number">${String(e.number).padStart(2,'0')}</span><div><h3>${escape(e.name)}</h3><p>${escape(e.overview||'No description supplied.')}</p><small>${e.runtime?`${e.runtime} min · `:''}${source?'Licensed playback available':'Playback unavailable'}</small></div><a href="${href}" aria-label="${source?'Play':'Playback information for'} ${escape(e.name)}">${source?'▶ Play':'Details →'}</a></article>`;
  }).join(''):'<p>Episode metadata has not been included in this snapshot.</p>'}</section>`:''}`;
 }
 private player(t:Title){
  const episode=t.seasons.find(s=>s.number===this.route.season)?.episodes.find(e=>e.number===this.route.episode);
  const source=t.kind==='movie'||episode?licensedSource(this.licenses,mediaKey(t,this.route)):undefined;
  const back=titleHash(t.id)+(episode?`/season/${this.route.season}/episode/${this.route.episode}`:'');
  return `<div class="movies-player"><a class="movies-detail-back" href="${back}">← Back to ${escape(t.name)}</a><p class="movies-eyebrow">QCC SCREEN / ${t.kind==='tv'?'SERIES':'CINEMA'}</p><h1 tabindex="-1">${escape(t.name)}</h1>${episode?`<h2>S${this.route.season} · E${episode.number} — ${escape(episode.name)}</h2>`:''}<div class="movies-screen">${source?`<video controls playsinline preload="metadata" referrerpolicy="no-referrer" aria-label="${escape(t.name)} player" src="${asset(source.path)}"></video>`:`<div class="movies-player-unavailable"><span aria-hidden="true">▷</span><h2>Playback unavailable</h2><p>${t.kind==='tv'&&!episode?'This episode is not in the current catalog.':'There is no verified licensed source for this title.'}</p><p>Your privacy comes first. External streaming players would disclose your connection and viewing activity, so they are disabled.</p><a class="movies-primary" href="${back}">Return to title</a></div>`}</div><p id="movies-player-status" role="status">${source?`Licensed under ${escape(source.license)} · ${escape(source.credit)}. Progress stays on this device.`:'No request has been sent to any streaming provider.'}</p></div>`;
 }
 private mobileNav(){return `<nav class="movies-mobile-nav" aria-label="Mobile movies navigation"><button data-kind="all">${movieIcon('home')}<span>Home</span></button><button data-action="search">${movieIcon('search')}<span>Search</span></button><button data-kind="list">${movieIcon('list')}<span>My list</span></button><button data-action="study">${movieIcon('study')}<span>Study</span></button></nav>`;}
 private render(message=''){
  this.stopVideo();
  this.root.innerHTML=this.header()+(!this.ready?`<div class="movies-empty"><h1 tabindex="-1">${this.failed?'The collection is unavailable':'Opening the collection…'}</h1><p>${this.failed?'Connect to this site and try again. Movies are separate from the games offline pack.':'Your next story is on its way.'}</p>${this.failed?'<button data-action="retry">Try again</button>':''}</div>`:message?`<div class="movies-empty"><h1>${escape(message)}</h1><a href="#/movies">Back to browsing</a></div>`:this.route.id?(()=>{const t=this.catalog.titles.find(t=>t.id===this.route.id);return t?(this.route.play?this.player(t):this.detail(t)):'<div class="movies-empty"><h1>Title not found</h1><p>This title is not in the catalog snapshot.</p><a href="#/movies">Browse the collection</a></div>';})():this.browse())+this.mobileNav();
  this.video=this.root.querySelector('video')??undefined;
  if(this.video){
   const video=this.video,t=this.catalog.titles.find(t=>t.id===this.route.id)!;
   this.progressKey=mediaKey(t,this.route);this.lastSave=0;const key=this.progressKey;
   video.addEventListener('loadedmetadata',()=>{if(this.video!==video)return;const time=this.storage.data.progress[key];if(time&&Number.isFinite(video.duration)&&time<video.duration-2)video.currentTime=time;});
   video.addEventListener('timeupdate',()=>{if(this.video===video&&Date.now()-this.lastSave>5000){this.storage.progress(key,video.currentTime);this.lastSave=Date.now();}});
   video.addEventListener('pause',()=>{if(this.video===video)this.storage.progress(key,video.currentTime);});
   video.addEventListener('error',()=>{this.root.querySelector('#movies-player-status')!.textContent='This licensed file could not be played. No external fallback will be loaded.';});
  }
 }
 private click=(event:MouseEvent)=>{
  const target=(event.target as Element).closest<HTMLElement>('button');if(!target)return;
  if(target.dataset.scroll){const row=target.closest('.movies-shelf')?.querySelector('.movies-row');row?.scrollBy({left:Number(target.dataset.scroll)*row.clientWidth*.85,behavior:this.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
  if(target.dataset.kind){this.kind=target.dataset.kind;this.query='';this.genre='All';if(this.route.id){this.homeNavigation=true;location.hash='#/movies';}else{this.render();this.root.scrollTop=0;}}
  if(target.dataset.list){this.storage.toggle(target.dataset.list);this.render();this.root.querySelector<HTMLElement>('[data-list]')?.focus();}
  if(target.dataset.playRoute)location.hash=target.dataset.playRoute;
  if(target.dataset.play)location.hash=titleHash(target.dataset.play)+'/play';
  switch(target.dataset.action){case 'search':{this.kind='all';this.genre='All';if(this.route.id){this.focusSearch=true;location.hash='#/movies';}else{this.render();this.searchFocus();}break;}case 'study':this.pause();this.study();break;case 'retry':void this.load();break;case 'reset':this.query='';this.kind='all';this.genre='All';this.render();break;case 'clear':this.storage.clear();this.render();this.root.querySelector<HTMLElement>('[data-action="clear"]')?.focus();break;}
 };
 private searchFocus(){const search=this.root.querySelector<HTMLInputElement>('#movies-search');search?.focus({preventScroll:true});search?.scrollIntoView({block:'center'});}
 private input=(event:Event)=>{
  if((event.target as HTMLElement).id!=='movies-search')return;
  this.query=(event.target as HTMLInputElement).value;
  const start=(event.target as HTMLInputElement).selectionStart;
  const top=this.root.scrollTop;this.render();const input=this.root.querySelector<HTMLInputElement>('#movies-search');input?.focus({preventScroll:true});if(start!==null)input?.setSelectionRange(start,start);this.root.scrollTop=top;
 };
 private change=(event:Event)=>{
  const input=event.target as HTMLSelectElement;
  if(input.id==='movies-genre'){this.genre=input.value;this.render();this.root.querySelector<HTMLElement>('#movies-genre')?.focus({preventScroll:true});}
  if(input.id==='movies-season'&&this.route.id){const season=this.catalog.titles.find(t=>t.id===this.route.id)?.seasons.find(s=>s.number===Number(input.value));const episode=season?.episodes[0];if(episode)location.hash=`${titleHash(this.route.id)}/season/${season!.number}/episode/${episode.number}`;}
 };
 pause(){if(this.video){this.storage.progress(this.progressKey,this.video.currentTime);this.video.pause();}}
 private stopVideo(){if(this.video){const video=this.video;this.storage.progress(this.progressKey,video.currentTime);this.video=undefined;video.pause();video.removeAttribute('src');video.load();}}
 dispose(){this.abort.abort();this.stopVideo();document.removeEventListener('visibilitychange',this.onVisibility);this.root.remove();document.body.classList.remove('movies-active');}
}
