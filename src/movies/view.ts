import './style.css';
import {uiIcon} from '../ui/icons';
import {bindRails,updateRails} from '../ui/rails';
import {markImages,watchImages} from '../ui/images';
import {openSheet} from '../ui/sheet';
import {autoHideTabbar} from '../ui/tabbar';
import mauriMark from '../assets/mauri-mark.svg?raw';
import {frameSource,FRAME_SANDBOX,FRAME_ALLOW,STREAM_PROVIDERS,START_THRESHOLD,streamProvider,providerSignal} from './provider';
import type {StreamProviderId} from './provider';
import {filterTitles,kindHash,licensedSource,mediaKey,nextEpisode,parseCatalog,parseMovieRoute,parseRails,previousEpisode,titleHash} from './model';
import type {CastMember,Catalog,Episode,MovieKind,MovieRoute,Rail,Season,Title} from './model';
import type {MovieStorage} from './storage';
import {MOVIES_KEY,snapshotOf,keepsResume} from './storage';
import type {ContinueItem,TitleSnapshot} from './storage';
import {formatClock,formatRuntime,initials} from './format';
import {answersRequest,cachedJson,SEARCH_STALE} from './query';
import {movieJson,movieNetworkMessage,MovieNetworkError} from './network';
import {PlaybackSupervisor,clearFailures,failedProviders,providerOrder} from './playback';
import type {AttemptState,SupervisorEvents} from './playback';
const base=import.meta.env.BASE_URL;
const escape=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
// Absolute same-origin URLs also resolve correctly inside CSS custom properties in /assets/ stylesheets.
const asset=(v:string)=>v.startsWith('https://')?v:new URL(base+v,document.baseURI).href;
const cardMeta=(t:Title)=>[t.year?String(t.year):'',t.kind==='tv'?'Series':'Movie'].filter(Boolean).join(' · ');
// A title saved in storage carries what a card or a Continue watching tile needs. Genres, overview and seasons arrive when the title loads.
const fromSnapshot=(s:TitleSnapshot):Title=>({id:s.id,kind:s.kind,name:s.name,year:s.year,genres:[],overview:'',poster:s.poster,backdrop:s.backdrop,seasons:[],source:{type:'third-party'}});
// The title page while its details load. A play route shows it until its season has loaded, so the player is built only once.
// The media's own record of what it has played. A seek to a saved position adds nothing to it, so it shows real playback in every engine.
const hasPlayed=(video:HTMLVideoElement)=>{const ranges=video.played;for(let i=0;i<ranges.length;i++)if(ranges.end(i)>ranges.start(i))return true;return false;};
const LOADING_TITLE='<div class="movies-empty" role="status"><h1 tabindex="-1">Loading title details…</h1><p>Fetching current movie and episode information.</p></div>';
// What the API adds to a built-in title: its cast, related titles, rating and runtime. Its name, summary, artwork, seasons and episodes stay,
// except that an episode without a still or a rating takes the API's for the same season and episode.
const mergeDetails=(bundled:Title,detail:Title):Title=>({...bundled,
 ...(detail.rating===undefined?{}:{rating:detail.rating}),
 ...(detail.runtime===undefined?{}:{runtime:detail.runtime}),
 ...(detail.cast?.length?{cast:detail.cast}:{}),
 ...(detail.related?.length?{related:detail.related}:{}),
 seasons:bundled.seasons.map(season=>{
  const fromApi=detail.seasons.find(s=>s.number===season.number);
  if(!fromApi)return season;
  return {...season,episodes:season.episodes.map(episode=>{
   const match=fromApi.episodes.find(e=>e.number===episode.number);
   if(!match)return episode;
   const still=episode.still??match.still,rating=episode.rating??match.rating;
   return {...episode,...(still===undefined?{}:{still}),...(rating===undefined?{}:{rating})};
  })};
 })});
const slug=(name:string)=>name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
// The server a button names, and the server after it. Server n is the n-th provider in STREAM_PROVIDERS.
const serverNumber=(id?:StreamProviderId)=>STREAM_PROVIDERS.findIndex(provider=>provider.id===id)+1;
const nextServer=(id?:StreamProviderId):StreamProviderId=>STREAM_PROVIDERS[(STREAM_PROVIDERS.findIndex(provider=>provider.id===id)+1)%STREAM_PROVIDERS.length].id;
// The play route of one episode.
const playHash=(id:string,season:number,episode:number)=>`${titleHash(id)}/season/${season}/episode/${episode}/play`;
// The status lines a browse page can show. Focus falls back to the first one that exists.
const STATUS_LINES=['movies-catalog-status','movies-rails-status','movies-result-count'];
// A focused control is found again after a render by what it is. A finder lists the controls that match, most likely first.
type Finder=(root:HTMLElement)=>HTMLElement[];
const within=(root:HTMLElement,selector:string)=>[...root.querySelectorAll<HTMLElement>(selector)];
// The bar a control sits in. Study is in the header and in the island, so a control is found again in the bar it was in.
const barOf=(el:Element)=>el.closest('.movies-top')?'top':el.closest('.movies-mobile-nav')?'nav':'page';
// The part of the page a control sits in: its rail, its section, the episode list or the action row. A re-render keeps the name of a part.
const regionOf=(el:Element)=>{const part=el.closest<HTMLElement>('[data-rail],section,.movies-episodes-list,.movies-actions');return part?(part.dataset.rail?`rail:${part.dataset.rail}`:part.className):'';};
function finderFor(el:HTMLElement):Finder|undefined{
 const {dataset}=el,rail=el.closest<HTMLElement>('[data-rail]')?.dataset.rail;
 if(el.id){const id=el.id;return root=>within(root,'[id]').filter(e=>e.id===id);}
 const status=STATUS_LINES.find(name=>el.classList.contains(name));
 if(status)return root=>within(root,'.'+status);
 if(dataset.title){
  const title=dataset.title;
  // A card or tile stays in the rail it was in while that rail still shows the title, else the first card or tile for the title.
  return root=>{const same=within(root,'[data-title]').filter(e=>e.dataset.title===title);return rail===undefined?same:[...same.filter(e=>e.closest<HTMLElement>('[data-rail]')?.dataset.rail===rail),...same];};
 }
 if(dataset.kind){const kind=dataset.kind,bar=barOf(el);return root=>within(root,'[data-kind]').filter(e=>e.dataset.kind===kind&&barOf(e)===bar);}
 if(dataset.action){const action=dataset.action,nav=dataset.nav,bar=barOf(el);return root=>within(root,'[data-action]').filter(e=>e.dataset.action===action&&(nav===undefined||e.dataset.nav===nav)&&barOf(e)===bar);}
 if(dataset.server){const server=dataset.server;return root=>within(root,'[data-server]').filter(e=>e.dataset.server===server);}
 if(dataset.drawerSeason){const season=dataset.drawerSeason;return root=>within(root,'[data-drawer-season]').filter(e=>e.dataset.drawerSeason===season);}
 if(dataset.titleSeason){const season=dataset.titleSeason;return root=>within(root,'[data-title-season]').filter(e=>e.dataset.titleSeason===season);}
 if(dataset.season){const season=dataset.season;return root=>within(root,'.movies-season-pills [data-season]').filter(e=>e.dataset.season===season);}
 if(dataset.play){const play=dataset.play;return root=>within(root,'[data-play]').filter(e=>e.dataset.play===play);}
 if(dataset.list){const list=dataset.list;return root=>within(root,'[data-list]').filter(e=>e.dataset.list===list);}
 if(dataset.playRoute){const route=dataset.playRoute;return root=>within(root,'[data-play-route]').filter(e=>e.dataset.playRoute===route);}
 if(dataset.scroll){const scroll=dataset.scroll;return root=>within(root,'[data-scroll]').filter(e=>e.dataset.scroll===scroll&&e.closest<HTMLElement>('[data-rail]')?.dataset.rail===rail);}
 // A heading and a plain link are found again by their tag and their address. A thumbnail with tabindex -1 repeats an episode's address, so it is skipped.
 if(el.tagName==='H1')return root=>within(root,'h1');
 const href=el.getAttribute('href');
 if(href)return root=>within(root,'a[href]:not([tabindex="-1"])').filter(e=>e.getAttribute('href')===href);
 return undefined;
}
// The rails of one section. A section keeps its own counter and controller, as the home does, so a late answer never replaces another's rails.
interface SectionRails {rails:Rail[];error:boolean;empty:boolean;requested:boolean;request:number;abort?:AbortController}
// A full-catalog request: a search of two characters or more, or a section's genre. Its key names it, and its family says whether it is a search (q) or a genre (g).
interface RemoteRequest {family:'q'|'g';key:string;params:Record<string,string>}
type FullscreenDocument=Document&{webkitFullscreenElement?:Element|null;webkitExitFullscreen?:()=>void};
type FullscreenElement=HTMLElement&{webkitRequestFullscreen?:()=>void};
interface PlaybackPreferences {autoNext:()=>boolean;setAutoNext:(value:boolean)=>void}
export class MoviesView {
 readonly root=document.createElement('section');
 private catalog:Catalog={titles:[],source:'starter',trending:[]};
 private licenses:unknown=[];
 private confirmedPlayback='';
 private warning?:HTMLDialogElement;
 private abort=new AbortController();
 private ready=false;
 private failed=false;
 private loadError='';
 private query='';
 private focusSearch=false;
 private homeNavigation=false;
 private kind:MovieKind='all';
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
 // The hash of the page the rails in the DOM were drawn for. Their scroll carries over a redraw of that page only.
 private railPage='';
 private detailError='';
 private dynamicIds=new Set<string>();
 // The ids of the bundled catalog as load() read it. A bundled title opens on its own page, and the API adds to it in the background.
 private bundledIds=new Set<string>();
 private loadedDetails=new Set<string>();
 private loadedSeasons=new Set<string>();
 // The built-in titles whose details have been asked for. Each is asked for once, in the background.
 private askedBuiltIn=new Set<string>();
 private browseScroll=0;
 private returnFocus='';
 // The rail a title's card or tile was activated from, so focus can return to that rail.
 private returnRail='';
 private positions=new Map<string,{top:number;href:string}>();
 private lastActivatedHref='';
 // The season a pill on the title page asked for. The page that season opens keeps focus on that pill.
 private pillSeason?:number;
 // The episode drawer: the season its pills show (undefined is the season playing), the season being loaded, and a season that failed to load.
 private drawerSeason?:number;
 private drawerLoading?:number;
 private drawerError?:{season:number;message:string};
 private drawerRequest=0;
 private drawerAbort?:AbortController;
 // The timer that hides the resume pill after four seconds.
 private resumeTimer?:ReturnType<typeof setTimeout>;
 private video?:HTMLVideoElement;
 private frame?:HTMLIFrameElement;
 // The server the user picked this session. It wins over the remembered order and over failures, until Try again.
 private pickedServer?:StreamProviderId;
 // The media key the pick was made on. Only that title's attempts treat the pick as manual.
 private pickedKey?:string;
 // The server on screen. Undefined when no server can start the title, or when the title plays from a licensed file.
 private providerId?:StreamProviderId;
 // Every automatic attempt for this title has failed, so the panel shows until Try again.
 private exhausted=false;
 // The failover line: what did not start and what is being tried.
 private failoverNote='';
 // The playback session of the title on screen. Its supervisor is stopped by stopVideo, pause and dispose.
 private supervisor?:PlaybackSupervisor;
 private supervisorKey='';
 // The saved position a provider frame starts from, and whether its Resumed pill has shown for the current attempt.
 private frameStart=0;
 private lifeShown=false;
 private frameTime=0;
 // Whether the media on screen has reported a time since it was bound. A position is written only after such a report.
 private frameReported=false;
 private videoReported=false;
 // The duration the provider frame last reported for the media on screen. A native video reads its own.
 private frameDuration?:number;
 private progressKey='';
 private ended=false;
 private suspended=false;
 private countdown?:ReturnType<typeof setInterval>;
 private nextHash='';
 // The control that had focus before Up next took it. Cancel returns focus there, or to the screen when that control has gone.
 private nextReturn?:Element|null;
 private countdownGeneration=0;
 private wasFullscreen=false;
 // The element that was fullscreen last, so an exit can tell whether its screen is still on the page.
 private fullscreenTarget?:Element|null;
 private intentionalExit=false;
 private disposed=false;
 private lastSave=0;
 private route:MovieRoute={play:false};
 // The not-found page is on screen for an invalid route. A valid route clears it, and a late answer never replaces it.
 private notFound=false;
 private rails:Rail[]=[];
 private railsError=false;
 private railsRequest=0;
 private railsAbort?:AbortController;
 // Set once the home has asked for its rails. A failed request is asked again only through Retry.
 private railsRequested=false;
 // Each section has its own rails, asked the first time it shows.
 private sectionRails:Record<'movie'|'tv',SectionRails>={movie:{rails:[],error:false,empty:false,requested:false,request:0},tv:{rails:[],error:false,empty:false,requested:false,request:0}};
 // The full-catalog request the remote titles answer, and the request the page wants now. Pages and earlier results belong to the request they answer.
 private remoteKey='';
 private remoteWanted='';
 // The image URLs that have loaded here. A re-render replaces the elements, and a URL seen before skips the fade-in.
 private seenImages=new Set<string>();
 // The image URLs that failed here. A re-render does not ask for them again: a card shows its placeholder, a backdrop its poster.
 private failedImages=new Set<string>();
 private readonly disposeImages:()=>void;
 private onVisibility=()=>{if(document.hidden)this.pause();};
 // The island is one element that survives renders: render() swaps the page around it and refreshes its items.
 private readonly tabbar=Object.assign(document.createElement('nav'),{className:'movies-mobile-nav ui-tabbar'});
 private readonly disposeRails:()=>void;
 private readonly hideTabbar:{reset():void;dispose():void};
 // The island's scroll check clears data-hidden, so while Up next shows the attribute is put back.
 private readonly yieldGuard=new MutationObserver(()=>{if(this.root.querySelector('.movies-next:not([hidden])')&&!this.tabbar.hasAttribute('data-hidden'))this.tabbar.dataset.hidden='true';});
 constructor(container:HTMLElement,private storage:MovieStorage,private study:(advance?:boolean)=>void,private reducedMotion:boolean,private preferences:PlaybackPreferences={autoNext:()=>true,setAutoNext:()=>{}}){
  this.root.className='movies-view';this.root.setAttribute('aria-label','Movies and TV');this.root.tabIndex=-1;
  container.replaceChildren(this.root);document.body.classList.add('movies-active');
  this.root.addEventListener('error',event=>{const image=event.target;if(image instanceof HTMLImageElement){const failed=image.getAttribute('src');if(failed)this.failedImages.add(failed);const rest=(JSON.parse(image.dataset.fallbacks||'[]') as string[]).filter(url=>!this.failedImages.has(url)),next=rest.shift();if(next){image.dataset.fallbacks=JSON.stringify(rest);image.src=next;}else if(image.classList.contains('movies-detail-art')){image.closest('.movies-detail-inner')?.classList.add('movies-detail-bare');image.remove();}else image.style.opacity='0';}},{capture:true});
  this.root.addEventListener('load',event=>{const image=event.target;if(image instanceof HTMLImageElement&&image.matches('img.ui-card-img,img.ui-hero-backdrop')){const src=image.getAttribute('src');if(src)this.seenImages.add(src);}},{capture:true});
  this.root.addEventListener('click',this.click);
  this.root.addEventListener('click',event=>{
   const control=(event.target as Element).closest<HTMLElement>('a[href^="#"],button');
   if(control instanceof HTMLAnchorElement)this.lastActivatedHref=control.getAttribute('href')||'';
   // On a browse page the control pressed records the card or tile it belongs to, so Back can return focus there. A control without a title records none.
   if(control&&!this.route.id){this.returnFocus=control.dataset.title||'';this.returnRail=control.dataset.title?control.closest<HTMLElement>('[data-rail]')?.dataset.rail||'':'';}
  },{capture:true});
  this.root.addEventListener('input',this.input);
  this.root.addEventListener('compositionend',this.compositionEnd);
  this.root.addEventListener('change',this.change);
  this.root.addEventListener('keydown',this.keydown);
  this.root.addEventListener('focusin',this.revealFocus);
  this.disposeImages=watchImages(this.root);
  this.tabbar.setAttribute('aria-label','Sections');
  this.disposeRails=bindRails(this.root,()=>this.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Movies scrolls inside its own overlay, so the island's hide-on-scroll follows that scroller rather than the window.
  this.hideTabbar=autoHideTabbar(this.tabbar,this.root);this.yieldGuard.observe(this.tabbar,{attributes:true,attributeFilter:['data-hidden']});
  document.addEventListener('fullscreenchange',this.fullscreenChange);document.addEventListener('webkitfullscreenchange',this.fullscreenChange);
  document.addEventListener('visibilitychange',this.onVisibility);document.addEventListener('securitypolicyviolation',this.violation);
  window.addEventListener('message',this.providerMessage);window.addEventListener('storage',this.onStorage);
  this.root.focus();
  // Another page may have written the saved data while Movies was closed. Storage that still holds what this page saw changes nothing.
  this.storage.reload();this.render();void this.load();
 }
 async load(){
  // Each state the collection passes through replaces the header and the island, so a control that has focus keeps it.
  this.failed=false;this.loadError='';this.ready=false;this.renderKeepingFocus();
  try{
   this.catalog=parseCatalog(await movieJson(asset('movies/catalog.json'),this.abort.signal));
   if(!this.catalog.titles.length)throw new Error('Empty catalog');
   this.bundledIds=new Set(this.catalog.titles.map(t=>t.id));
   // An unavailable optional registry disables local media, never discovery.
   try {this.licenses=await movieJson(asset('movies/licenses.json'),this.abort.signal,5000);}catch{this.licenses=[];}
   if(this.abort.signal.aborted)return;
   this.ready=true;
   // As in applyRoute, a route whose details are not loaded is pending before the page renders.
   const pending=!!this.route.id&&this.needsDetails(this.route);this.pendingTitle=pending;
   // A pending title is drawn by loadTitle, so its loading page is drawn once, not here as well.
   if(!pending)this.renderKeepingFocus();
   if(this.route.id){if(pending)void this.loadTitle(this.route.id,this.route.season);else void this.enrichTitle(this.route.id);}
   else{this.requestHomeRails();this.requestSectionRails();}
  }catch(error){if(!this.abort.signal.aborted){this.failed=true;this.loadError=movieNetworkMessage(error,'The collection');this.renderKeepingFocus();}}
 }
 // The full-catalog request the page needs now. A search of two characters or more is the request. Without one, a section's genre is.
 // The server takes a genre without a query, so a search's results are filtered by the genre on this page.
 private remoteRequest():RemoteRequest|undefined{
  if(this.kind==='list')return undefined;
  const query=this.query.trim(),type:'movie'|'tv'|'all'=this.kind==='movie'||this.kind==='tv'?this.kind:'all';
  if(query.length>=2)return {family:'q',key:`q|${type}|${query}`,params:{type,q:query}};
  if(type!=='all'&&this.genre!=='All')return {family:'g',key:`g|${type}|${this.genre}`,params:{type,genre:this.genre}};
  return undefined;
 }
 // Stops the request in flight. The results on screen stay until a new request answers.
 private stopRemote(){this.searchRequest++;this.metadataAbort?.abort();clearTimeout(this.searchTimer);this.remoteWanted='';this.remoteError='';this.remoteLoading=false;}
 // Stops the request and drops its results: for Home, a new section, or a page with no request.
 private resetRemote(){this.stopRemote();this.remoteTitles=[];this.remoteKey='';}
 // Starts the request the page now needs, unless it is already wanted. A page with no request drops its results.
 private syncRemote(){
  const request=this.remoteRequest();
  if(!request)this.resetRemote();
  else if(request.key!==this.remoteWanted)void this.fetchCatalog(1);
 }
 // Asks the full catalog for the page's request, one page at a time. A response that is no longer the wanted request is dropped.
 private async fetchCatalog(page:number){
  const request=this.remoteRequest();if(!request)return;
  clearTimeout(this.searchTimer);
  this.remoteRequestedPage=page;this.remoteWanted=request.key;
  const id=++this.searchRequest;
  this.metadataAbort?.abort();const controller=this.metadataAbort=new AbortController();
  this.remoteLoading=true;this.remoteError='';this.renderBrowseState();
  try{
   const {data}=await cachedJson('/api/movies?'+new URLSearchParams({...request.params,page:String(page)}),controller.signal,{staleTime:SEARCH_STALE});
   if(id!==this.searchRequest||!answersRequest(this.remoteRequest()?.key,request.key))return;
   const parsed=parseCatalog({titles:data.titles,source:'tmdb'},true);
   this.remoteTitles=parsed.titles;this.remoteKey=request.key;
   for(const title of parsed.titles)this.dynamicIds.add(title.id);
   this.remotePage=Number.isInteger(data.page)?data.page:page;
   this.remotePages=Number.isInteger(data.totalPages)?Math.max(1,Math.min(500,data.totalPages)):1;
   this.remoteLoading=false;this.renderBrowseState();
  }catch(error){
   if(id!==this.searchRequest||!answersRequest(this.remoteRequest()?.key,request.key)||controller.signal.aborted)return;
   // Titles from an earlier request go when this one fails. A later page of the same request keeps its results.
   if(this.remoteKey!==request.key){this.remoteTitles=[];this.remoteKey='';}
   this.remoteLoading=false;this.remoteError=movieNetworkMessage(error,request.family==='g'?'Genre results':'Full catalog search');this.renderBrowseState();
  }
 }
 // The home asks once for all of its rails. A response that arrives after a title opened updates the state only.
 // The home asks for its rails once: when the view opens on a section, or the first time Home is shown.
 private requestHomeRails(){if(!this.railsRequested)void this.fetchRails();}
 // A section asks for its rails the first time it shows. Only Retry asks again after a failure.
 private requestSectionRails(){const kind=this.kind;if((kind==='movie'||kind==='tv')&&!this.sectionRails[kind].requested)void this.fetchSectionRails(kind);}
 // Retry asks again for the rails of the page on screen.
 private retryRails(){const kind=this.kind;if(kind==='movie'||kind==='tv')void this.fetchSectionRails(kind);else void this.fetchRails();}
 private async fetchRails(){
  this.railsRequested=true;const request=++this.railsRequest;
  this.railsAbort?.abort();const controller=this.railsAbort=new AbortController();
  try{
   const {data}=await cachedJson('/api/movies?rails=home',controller.signal);
   if(request!==this.railsRequest)return;
   const rails=parseRails(data);
   this.rails=rails;this.railsError=rails.length===0;
   for(const rail of rails)for(const title of rail.titles)this.dynamicIds.add(title.id);
  }catch{
   if(request!==this.railsRequest||controller.signal.aborted)return;
   this.rails=[];this.railsError=true;
  }
  this.renderBrowseState();
 }
 private async fetchSectionRails(kind:'movie'|'tv'){
  const state=this.sectionRails[kind];
  state.requested=true;const request=++state.request;
  state.abort?.abort();const controller=state.abort=new AbortController();
  try{
   const {data}=await cachedJson('/api/movies?rails='+kind,controller.signal);
   if(request!==state.request)return;
   const rails=parseRails(data);
   state.rails=rails;state.error=false;state.empty=rails.length===0;
   for(const rail of rails)for(const title of rail.titles)this.dynamicIds.add(title.id);
  }catch{
   if(request!==state.request||controller.signal.aborted)return;
   state.rails=[];state.error=true;
  }
  this.renderBrowseState();
 }
 private needsDetails(route:MovieRoute){
  if(!route.id||!/^(movie|tv)-[1-9]\d*$/.test(route.id))return false;
  // A bundled title opens on its own page, whatever the rails or the search said about its id. The API adds to it in the background.
  if(this.bundledIds.has(route.id))return false;
  const title=this.catalog.titles.find(t=>t.id===route.id);
  if(!title||this.dynamicIds.has(route.id)&&!this.loadedDetails.has(route.id))return true;
  return this.dynamicIds.has(route.id)&&title.kind==='tv'&&!!route.season&&!this.loadedSeasons.has(route.id+':s'+route.season);
 }
 private async loadTitle(id:string,season?:number,retried=false){
  const request=++this.detailRequest;this.detailAbort?.abort();const controller=this.detailAbort=new AbortController();this.pendingTitle=true;this.detailError='';this.redrawDetail();
  // Where focus rests once the loading page has taken Retry away. A failure brings focus back to Retry only if the reader left it there.
  const resting=document.activeElement;
  try{
   const params=new URLSearchParams({id});if(season)params.set('season',String(season));
   const {data}=await cachedJson('/api/movies?'+params,controller.signal);const parsed=parseCatalog({titles:[data.title],source:'tmdb'},true);const title=parsed.titles[0];
   if(request!==this.detailRequest||this.route.id!==id)return;
   if(!title||title.id!==id)throw new Error('Title details are unavailable.');
   this.storeTitle(id,title,season);
   this.pendingTitle=false;this.renderKeepingFocus();
  }catch(error){
   if(request!==this.detailRequest||this.route.id!==id)return;
   if(controller.signal.aborted)return;
   const back=retried&&(document.activeElement===resting||document.activeElement===document.body);
   this.pendingTitle=false;this.detailError=error instanceof MovieNetworkError&&error.status===404?'':movieNetworkMessage(error,'Title details');this.redrawDetail();
   // The loading page took the Retry button away. When the failure brings it back, focus returns to it, unless the reader moved on.
   if(back)this.root.querySelector<HTMLElement>('[data-action="retry-title"]')?.focus({preventScroll:true});
  }
 }
 // Redraws the title page while its details load or fail. Fullscreen keeps the screen and shows only the notice in it. Focus stays on its control.
 private redrawDetail(){this.keepingFocus(()=>{if(this.screenFullscreen())this.renderDetailError();else this.render();});}
 // A title's details become the catalog's own. A season that comes back without episodes keeps the ones it had, and the seasons with episodes are loaded.
 private storeTitle(id:string,title:Title,season?:number){
  const previous=this.catalog.titles.find(t=>t.id===id);
  if(previous&&this.bundledIds.has(id))title={...title,source:previous.source};
  if(previous)for(const item of title.seasons)if(!item.episodes.length)item.episodes=previous.seasons.find(s=>s.number===item.number)?.episodes??[];
  this.catalog={...this.catalog,titles:[...this.catalog.titles.filter(t=>t.id!==id),title]};
  this.dynamicIds.add(id);this.loadedDetails.add(id);
  // A requested season is loaded only with episodes. An empty answer, such as a failed season request, is asked for again later.
  if(season){if(title.seasons.some(item=>item.number===season&&item.episodes.length))this.loadedSeasons.add(id+':s'+season);}
  else for(const item of title.seasons)if(item.episodes.length)this.loadedSeasons.add(id+':s'+item.number);
 }
 // A built-in title asks the API once, in the background, for what the API adds. Nothing shows while the request runs, and a failure leaves
 // the bundled page as it is. The page re-renders only while it still shows this title and is not playing, and keeps its focus.
 private async enrichTitle(id:string){
  if(this.askedBuiltIn.has(id)||!this.bundledIds.has(id))return;
  this.askedBuiltIn.add(id);
  try{
   const {data}=await cachedJson('/api/movies?'+new URLSearchParams({id}),this.abort.signal);
   const detail=parseCatalog({titles:[data.title],source:'tmdb'},true).titles[0];
   // An answer for another title's id changes nothing here.
   if(!detail||detail.id!==id||this.abort.signal.aborted)return;
   this.catalog={...this.catalog,titles:this.catalog.titles.map(t=>t.id===id?mergeDetails(t,detail):t)};
   if(this.route.id===id&&!this.route.play&&!this.notFound)this.renderKeepingFocus();
  }catch{/* The bundled page stays as it is. */}
 }
 // A browse request may complete after Play was pressed, or after a not-found route opened. Updating its state
 // must not replace the player's iframe, restart an active stream or replace the not-found page.
 private renderBrowseState(){
  if(this.route.id||this.notFound)return;
  const top=this.root.scrollTop;
  // The focused control is recorded by what it is before the redraw, and the control that matches it takes focus after the redraw.
  const active=document.activeElement instanceof HTMLElement&&document.activeElement!==this.root&&this.root.contains(document.activeElement)?document.activeElement:undefined;
  const finder=active&&finderFor(active),region=active?regionOf(active):'';
  this.refreshBrowse();
  if(active)this.restoreFocus(finder?finder(this.root):[],region);
  this.root.scrollTop=top;
 }
 // The first candidate that can take focus does. A candidate in the region the focused control was in comes first, so a link that shares
 // its address with another link (Continue and an episode's Play link) stays where it was. Without one, the first status line that exists takes it, else the page heading.
 private restoreFocus(candidates:HTMLElement[],region=''){
  const ordered=[...candidates.filter(c=>regionOf(c)===region),...candidates.filter(c=>regionOf(c)!==region)];
  for(const candidate of ordered){
   if(candidate.matches(':disabled'))continue;
   candidate.focus({preventScroll:true});
   if(document.activeElement===candidate)return;
  }
  const status=STATUS_LINES.map(name=>this.root.querySelector<HTMLElement>('.'+name)).find(el=>el!==null);
  (status??this.root.querySelector<HTMLElement>('h1'))?.focus({preventScroll:true});
 }
 // Focus returns to a title's card or tile: the one in the rail it was opened from while that rail still shows it, else the first one.
 private focusTitle(id:string,rail:string){
  const same=within(this.root,'[data-title]').filter(e=>e.dataset.title===id);
  (same.find(e=>!!rail&&e.closest<HTMLElement>('[data-rail]')?.dataset.rail===rail)??same[0])?.focus({preventScroll:true});
 }
 private positionKey(route:MovieRoute){const title=this.catalog.titles.find(t=>t.id===route.id);return route.play?JSON.stringify(route):route.id?`${route.id}:s${route.season??title?.seasons[0]?.number??0}`:'browse';}
 navigate(hash:string){
  this.dismissWarning();
  if(this.confirmedPlayback!==hash)this.confirmedPlayback='';
  this.closeDrawer();
  this.applyRoute(hash);
  // Every route shows the island again, and scroll travel counts from wherever the new page lands.
  this.hideTabbar.reset();
 }
 private applyRoute(hash:string){
  const next=parseMovieRoute(hash);
  if(!next){this.stopVideo();this.route={play:false};this.notFound=true;this.render();this.root.querySelector<HTMLElement>('.movies-empty h1')?.focus({preventScroll:true});return;}
  this.detailRequest++;this.detailAbort?.abort();this.pendingTitle=false;this.detailError='';
  const returningFromPlayer=!!this.route.play&&!next.play&&!!this.route.id&&this.route.id===next.id;
  const returnEpisodeHref=returningFromPlayer?titleHash(this.route.id!)+'/season/'+this.route.season+'/episode/'+this.route.episode+'/play':'';
  if(!this.route.id&&next.id){
   this.browseScroll=this.root.scrollTop;
   // A pressed control has already recorded its card. A focused card wins; a press that left no focus (Safari) keeps the recorded card.
   const opened=document.activeElement as HTMLElement|null;
   if(opened?.dataset.title){this.returnFocus=opened.dataset.title;this.returnRail=opened.closest<HTMLElement>('[data-rail]')?.dataset.rail||'';}
  }
  this.positions.set(this.positionKey(this.route),{top:this.root.scrollTop,href:this.lastActivatedHref||(document.activeElement as Element)?.closest('a')?.getAttribute('href')||''});
  this.lastActivatedHref='';
  const returning=!!this.route.id&&!next.id;
  const inPlace=this.route.play&&next.play&&this.route.id===next.id&&this.screenFullscreen();
  // A season pill keeps its page, scroll position and focus when the season changes within the same title.
  const pill=this.pillSeason;this.pillSeason=undefined;const keepPill=pill!==undefined&&!!next.id&&!next.play&&this.route.id===next.id,scroll=this.root.scrollTop;
  this.stopVideo();this.suspended=false;this.exhausted=false;this.failoverNote='';this.route=next;this.notFound=false;
  // A page change starts the drawer again on the season playing, and drops a season that was loading for the page before.
  this.drawerRequest++;this.drawerAbort?.abort();this.drawerSeason=undefined;this.drawerLoading=undefined;this.drawerError=undefined;
  // A section change resets its genre, as the section buttons do. The typed query stays.
  const kind=next.id?this.kind:(next.kind??'all');if(kind!==this.kind)this.genre='All';this.kind=kind;
  // A page that is not a title brings its full-catalog request in line with its query and genre.
  if(!next.id)this.syncRemote();
  const title=this.catalog.titles.find(t=>t.id===next.id);
  // A route whose title details are not loaded yet is pending before the page renders, so a play route shows the loading text, not a player.
  const pending=this.ready&&this.needsDetails(next);this.pendingTitle=pending;
  // A pending route is drawn by loadTitle, so it is drawn once.
  if(inPlace&&title)this.refreshPlayer(title);else if(!pending)this.render();
  if(pending)void this.loadTitle(next.id!,next.season);
  else if(this.ready&&next.id)void this.enrichTitle(next.id);
  // A session that opened a title first has no rails yet, so the first time Home is shown they are requested.
  if(this.ready&&!next.id&&!next.kind)this.requestHomeRails();
  if(this.ready&&!next.id)this.requestSectionRails();
  if(this.focusSearch){this.focusSearch=false;this.searchFocus();return;}
  if(this.homeNavigation){this.homeNavigation=false;this.root.scrollTop=0;this.root.querySelector<HTMLElement>('h1')?.focus({preventScroll:true});return;}
  if(returning){this.root.scrollTop=this.browseScroll;this.focusTitle(this.returnFocus,this.returnRail);}
  else if(keepPill){this.root.scrollTop=scroll;this.restoreFocus(within(this.root,'.movies-season-pills [data-season]').filter(e=>e.dataset.season===String(pill)));}
  else {const previous=this.positions.get(this.positionKey(next));this.root.scrollTop=previous?.top??0;
   // A thumbnail link repeats an episode's play address with tabindex -1, so focus goes to the Play link that a keyboard reaches.
   const anchors=[...this.root.querySelectorAll<HTMLAnchorElement>('a:not([tabindex="-1"])')];
   const focus=returningFromPlayer?anchors.find(a=>a.getAttribute('href')===returnEpisodeHref):previous?.href?anchors.find(a=>a.getAttribute('href')===previous.href):null;
   (focus??this.root.querySelector<HTMLElement>('h1'))?.focus({preventScroll:true});}
 }
 private header(){const pills:[MovieKind,string][]=[['all','Home'],['movie','Movies'],['tv','TV Shows'],['list','My list']];return `<header class="movies-top ui-header"><div class="ui-header-inner"><a class="movies-brand ui-brand" href="#/movies" aria-label="Movies and TV home"><span class="ui-brand-tile">${mauriMark}</span><span class="ui-wordmark">Mauri <span>Study Notes</span></span></a><nav class="ui-nav" aria-label="Movies and TV navigation">${pills.map(([kind,name])=>`<button class="ui-pill" data-kind="${kind}" aria-pressed="${this.kind===kind&&!this.route.id}">${name}</button>`).join('')}</nav><div class="ui-header-actions"><button data-action="search" class="movies-search-toggle ui-icon-btn" aria-label="Search movies and TV">${uiIcon('search')}</button><a class="movies-back ui-icon-btn" aria-label="Games" href="#/collection">${uiIcon('grid')}<span class="ui-label" aria-hidden="true">Games</span></a><button data-action="study" class="movies-study ui-icon-btn">${uiIcon('study')}<span class="ui-label">Study Mode</span><kbd class="ui-kbd" aria-hidden="true">Esc</kbd></button></div></div></header>`;}
 // The image a card, tile or hero requests: its first candidate that has not failed in this view. The other usable candidates are the fallbacks,
 // which the error listener tries in order. When every candidate failed there is no image, so the placeholder shows alone.
 private artImage(candidates:string[],className:string,attributes:string){
  const usable=[...new Set(candidates)].filter(url=>!this.failedImages.has(url));
  if(!usable.length)return '';
  const [src,...fallbacks]=usable;
  return `<img class="${className}${this.seenImages.has(src)?' is-seen':''}"${fallbacks.length?` data-fallbacks="${escape(JSON.stringify(fallbacks))}"`:''} src="${escape(src)}" ${attributes}>`;
 }
 private card(t:Title){
  const name=escape(t.name),type=t.kind==='tv'?'SERIES':'FILM';
  const image=this.artImage([asset(t.poster)],'ui-card-img','alt="" width="320" height="480" loading="lazy" decoding="async" referrerpolicy="no-referrer"');
  const rating=t.rating===undefined?'':`<span class="ui-chip rating">★ ${t.rating.toFixed(1)}</span>`;
  return `<a class="movies-poster ui-card" href="${escape(titleHash(t.id))}" data-title="${escape(t.id)}" aria-label="Details for ${name}"><span class="ui-card-poster"><span class="ui-card-placeholder" aria-hidden="true">${uiIcon('image')}<span>${name}</span></span>${image}<span class="ui-card-chips"><span class="ui-chip">${type}</span>${rating}</span><span class="ui-card-play" aria-hidden="true">${uiIcon('play')}</span></span><span class="ui-card-caption"><strong class="ui-card-title">${name}</strong><small class="ui-card-meta">${escape(cardMeta(t))}</small></span></a>`;
 }
 // A rail is a head with its count, then a row of tiles between two arrows. The id must be unique on the page.
 private rail(id:string,name:string,tiles:string,count:number,subtitle=''){
  const label=escape(name);
  return `<section class="movies-shelf ui-rail" data-rail="${escape(id)}"><div class="ui-rail-head"><h2>${label}</h2><span class="ui-count">${count} ${count===1?'title':'titles'}</span>${subtitle?`<p class="ui-rail-sub">${escape(subtitle)}</p>`:''}</div><div class="ui-rail-body"><button class="ui-rail-arrow prev" data-scroll="-1" aria-label="Previous ${label}">${uiIcon('chevron-left')}</button><div class="ui-rail-row">${tiles}</div><button class="ui-rail-arrow next" data-scroll="1" aria-label="Next ${label}">${uiIcon('chevron-right')}</button></div></section>`;
 }
 private shelf(id:string,name:string,titles:Title[],subtitle=''){return this.rail(id,name,titles.map(t=>this.card(t)).join(''),titles.length,subtitle);}
 private footer(){return `<footer class="movies-footer ui-footer" aria-label="Credits and privacy"><div class="ui-footer-brand"><span class="ui-brand-tile">${mauriMark}</span><strong>Mauri Study Notes</strong><span>Movies &amp; TV</span></div><nav class="ui-footer-links" aria-label="Movies and TV sections"><a href="#/movies">Home</a><a href="#/movies/browse/movie">Movies</a><a href="#/movies/browse/tv">TV Shows</a><a href="#/movies/list">My list</a></nav><strong>Your screen. Your privacy.</strong><p>My list and playback progress stay on this device. Full-catalog searches go through QCC’s metadata service to TMDB. Real posters and backdrops load from TMDB; its image server receives ordinary image requests.</p><p>${this.catalog.source==='tmdb'?`${this.catalog.attributionLogo?`<img class="movies-tmdb" src="${escape(asset(this.catalog.attributionLogo))}" alt="TMDB" width="100" height="40">`:''}This product uses the TMDB API but is not endorsed or certified by TMDB.`:'Starter selection · Real title artwork from TMDB. Original summaries. Ratings are not supplied. This is not a live trending feed.'}</p>${this.catalog.updated?`<p>Catalog snapshot: ${escape(this.catalog.updated)}</p>`:''}<p>Streaming is provided by an external service. QCC does not verify its availability or distribution rights. Movies are excluded from game offline downloads.</p><button data-action="clear" class="ui-btn secondary small">Clear my list &amp; watch history</button><p class="movies-storage" role="status">${this.storage.durable?'Saved only on this device.':'Browser storage is unavailable. Changes last only for this visit.'}</p></footer>`;}
 private browse(){const {head,body}=this.browseParts();return `${head}<div class="movies-browse">${this.filterBar()}<div id="movies-results">${body}</div>${this.footer()}</div>`;}
 // The title block and the results of a browse page. A redraw in place replaces these two and leaves the rest of the page alone.
 private browseParts(){
  const list=this.kind==='list';
  // A section filters the titles the page has loaded. My list filters its saved titles only.
  const available=list?this.savedTitles():this.loadedTitles();
  const local=filterTitles(available,this.query,this.kind,this.genre);
  // Full-catalog titles show only while they answer the request the page makes, so a search never shows a genre's titles, or the reverse.
  const request=this.remoteRequest();
  const answers=!!request&&!!this.remoteKey&&this.remoteKey.startsWith(request.family+'|');
  // A search's titles are already matched by TMDB, which can match aliases and translated titles absent from the display text. A genre's titles were asked for by genre alone, so the typed text narrows them here.
  const remote=answers?filterTitles(this.remoteTitles,request?.family==='g'?this.query:'',this.kind,this.genre):[];
  const filtered=[...new Map([...local,...remote].map(t=>[t.id,t])).values()];
  const simple=!!this.query.trim()||this.genre!=='All'||list;
  // A section and My list open with their title block. Home keeps its hero, and a search on Home keeps its own heading.
  const head=this.kind==='all'?(simple?'<h1 class="movies-page-title" tabindex="-1">Find your next story</h1>':this.hero()):this.pageHead(this.kind,list?available.length:undefined);
  const body=simple?this.results(filtered):this.kind==='movie'||this.kind==='tv'?this.sectionContent(this.kind):this.homeContent();
  return {head,body};
 }
 // Redraws a browse page's title block and results in place. The header, the island and the filter bar stay as they are, so the search
 // field keeps its node, its focus and its caret while the reader types.
 private refreshBrowse(){
  const header=this.root.querySelector('.movies-top'),browse=this.root.querySelector<HTMLElement>('.movies-browse'),results=browse?.querySelector<HTMLElement>('#movies-results');
  if(!header||!browse||!results){this.render();return;}
  const scrolls=this.railScrolls(),{head,body}=this.browseParts();
  for(const node of [...this.root.children])if(node!==header&&node!==browse&&node!==this.tabbar)node.remove();
  browse.insertAdjacentHTML('beforebegin',head);
  this.patchResults(results,body);
  this.refreshGenres();this.restoreRailScrolls(scrolls);markImages(this.root);this.footerAttribution();updateRails(this.root);
 }
 // The genre list follows the titles the page has loaded. The select keeps its node and the reader's choice, and only its options change.
 private refreshGenres(){
  const select=this.root.querySelector<HTMLSelectElement>('#movies-genre');if(!select)return;
  const incoming=document.createElement('template');incoming.innerHTML=this.filterBar();
  const next=incoming.content.querySelector<HTMLSelectElement>('#movies-genre');if(!next)return;
  const names=(options:HTMLOptionsCollection)=>[...options].map(option=>option.textContent).join('\n');
  if(names(select.options)===names(next.options))return;
  select.replaceChildren(...next.options);select.value=this.genre;
 }
 // Replaces the results of a browse page. The count line and the status line keep their nodes when the redraw has one of the same kind,
 // so their live regions stay in the page and announce the new text. The grid, the empty state and the pagination are replaced around them.
 private patchResults(results:HTMLElement,markup:string){
  const incoming=document.createElement('template');incoming.innerHTML=markup;
  const fresh=[...incoming.content.children] as HTMLElement[];
  const copyOf=(cls:string)=>fresh.find(node=>node.classList.contains(cls));
  const keep=(cls:string)=>{const copy=copyOf(cls),old=results.querySelector<HTMLElement>(':scope > .'+cls);if(!copy||!old)return undefined;old.innerHTML=copy.innerHTML;return old;};
  const count=keep('movies-result-count'),status=keep('movies-catalog-status');
  const countCopy=copyOf('movies-result-count'),statusCopy=copyOf('movies-catalog-status');
  for(const node of [...results.children])if(node!==count&&node!==status)node.remove();
  const split=statusCopy?fresh.indexOf(statusCopy):fresh.length;
  const before=fresh.slice(0,split).filter(node=>node!==countCopy),after=statusCopy?fresh.slice(split+1):[];
  if(countCopy&&!count)results.prepend(countCopy);
  for(const node of before)results.insertBefore(node,status??null);
  if(statusCopy&&!status)results.append(statusCopy);
  const tail=status??statusCopy;
  if(tail&&after.length)tail.after(...after);
 }
 // A rail keeps its scroll position through a redraw. A rail is found again by its name, which is unique on the page.
 private railScrolls(){return new Map([...this.root.querySelectorAll<HTMLElement>('[data-rail]')].map(rail=>[rail.dataset.rail??'',rail.querySelector<HTMLElement>('.ui-rail-row')?.scrollLeft??0] as const));}
 // The rows scroll smoothly, so the restore is made without the animation, and the row keeps its own behaviour after it.
 private restoreRailScrolls(scrolls:Map<string,number>){for(const rail of this.root.querySelectorAll<HTMLElement>('[data-rail]')){const row=rail.querySelector<HTMLElement>('.ui-rail-row'),left=scrolls.get(rail.dataset.rail??'');if(row&&left){row.style.scrollBehavior='auto';row.scrollLeft=left;row.style.removeProperty('scroll-behavior');}}}
 // Once a title from the API is shown, the footer names TMDB as the source of its metadata.
 private footerAttribution(){
  if(!this.dynamicIds.size)return;
  const paragraphs=this.root.querySelectorAll<HTMLElement>('.movies-footer p');
  if(paragraphs[1])paragraphs[1].textContent='Search and metadata use the TMDB database. This product uses the TMDB API but is not endorsed or certified by TMDB.';
 }
 // The title block of a section or My list: a heading, one line of copy and, when given, the count.
 private pageHead(kind:'movie'|'tv'|'list',count?:number){
  const copy:Record<'movie'|'tv'|'list',[string,string]>={movie:['Movies','Films for every mood, from new releases to old favourites.'],tv:['TV Shows','Series to start tonight and seasons to catch up on.'],list:['My list','Titles you saved on this device.']};
  const [title,line]=copy[kind];
  const total=count===undefined?'':`<span class="ui-count">${count} ${count===1?'title':'titles'}</span>`;
  return `<div class="movies-page-head ui-container"><h1 class="movies-page-title" tabindex="-1">${title}</h1><p>${line}</p>${total}</div>`;
 }
 // A section's own rails. While they are pending, or when they fail or come back empty, the bundled titles of that kind show as one grid.
 private sectionContent(kind:'movie'|'tv'){
  const state=this.sectionRails[kind];
  if(state.rails.length){
   const used=new Set<string>();
   return state.rails.map(rail=>{let id=rail.id,n=2;while(used.has(id))id=`${rail.id}-${n++}`;used.add(id);return this.shelf(id,rail.title,rail.titles);}).join('');
  }
  const titles=this.catalog.titles.filter(t=>t.kind===kind);
  const status=state.error?'<p class="movies-rails-status" role="status" tabindex="-1">Showing the starter selection. The full catalog is unavailable right now. <button class="ui-btn secondary small" data-action="retry-rails">Retry</button></p>'
   :state.empty&&!titles.length?'<p class="movies-rails-status" role="status" tabindex="-1">No titles to show here right now.</p>':'';
  return `${status}${titles.length?`<div class="movies-results-grid ui-grid">${titles.map(t=>this.card(t)).join('')}</div>`:''}`;
 }
 // The rails of Home and of both sections.
 private railTitles(){return [...this.rails,...this.sectionRails.movie.rails,...this.sectionRails.tv.rails].flatMap(rail=>rail.titles);}
 // Every title the page has loaded from the bundled catalog or from a rail.
 private loadedTitles(){return [...this.catalog.titles,...this.railTitles()];}
 // Every title the page can name by id: the bundled catalog, the rails, the search results and any loaded related titles.
 lookup(id:string):Title|undefined{
  const titles=[...this.catalog.titles,...this.railTitles(),...this.remoteTitles];
  return titles.find(t=>t.id===id)??titles.flatMap(t=>t.related??[]).find(t=>t.id===id);
 }
 // The featured title is the first rail title, else the first bundled title. Play starts the first loaded episode of a series;
 // without a loaded episode it opens the title page, so no play route ever lacks a season and an episode.
 private hero(){
  const hero=this.rails[0]?.titles[0]??this.catalog.titles[0];
  if(!hero)return '';
  const isTv=hero.kind==='tv',name=escape(hero.name);
  const season=hero.seasons.find(s=>s.episodes.length),episode=season?.episodes[0];
  const route:MovieRoute=isTv?{id:hero.id,season:season?.number,episode:episode?.number,play:true}:{id:hero.id,play:true};
  const source=hero.source.type==='archive'||(licensedSource(this.licenses,mediaKey(hero,route))??frameSource(hero,route));
  const playRoute=!isTv?`${titleHash(hero.id)}/play`:season&&episode?`${titleHash(hero.id)}/season/${season.number}/episode/${episode.number}/play`:titleHash(hero.id);
  const listed=this.storage.data.list.includes(hero.id);
  const info=[hero.year?String(hero.year):'',isTv?'Series':'Movie',hero.genres.slice(0,3).join(' / ')].filter(Boolean).join(' · ');
  const backdropUrl=asset(hero.backdrop??hero.poster),posterUrl=asset(hero.poster);
  return `<section class="movies-hero ui-hero" aria-label="Featured: ${name}">${this.artImage([backdropUrl,posterUrl],'ui-hero-backdrop','alt="" fetchpriority="high" referrerpolicy="no-referrer"')}<span class="ui-hero-shade" aria-hidden="true"></span><div class="ui-hero-content"><div class="ui-hero-badges"><span class="ui-chip">${isTv?'Featured series':'Featured film'}</span>${hero.rating===undefined?'':`<span class="ui-chip rating">★ ${hero.rating.toFixed(1)}</span>`}</div><h1 class="ui-hero-title" tabindex="-1">${name}</h1><p class="ui-hero-meta">${escape(info)}</p><p class="ui-hero-overview">${escape(hero.overview)}</p><div class="ui-hero-actions"><button class="movies-primary ui-btn primary" data-play-route="${escape(playRoute)}"${source?'':' disabled aria-describedby="movies-hero-unavailable"'}>${uiIcon('play')}Play</button><a class="ui-btn secondary" href="${escape(titleHash(hero.id))}">${uiIcon('info')}Details</a><button class="movies-hero-list ui-btn secondary" data-list="${escape(hero.id)}" aria-label="${listed?'Remove':'Add'} ${name} ${listed?'from':'to'} my list">${uiIcon(listed?'check':'plus')}My list</button></div>${source?'':'<span class="sr-only" id="movies-hero-unavailable">No provider identifier is available</span>'}</div></section>`;
 }
 // The filter bar: a search field and a genre list built from every title the page has loaded.
 private filterBar(){
  const genres=new Set<string>();
  for(const title of [...this.loadedTitles(),...this.remoteTitles])for(const genre of title.genres)genres.add(genre);
  if(this.genre!=='All')genres.add(this.genre);
  return `<div class="movies-filterbar"><label class="movies-search"><span class="sr-only">Search movies and TV</span>${uiIcon('search')}<input type="search" id="movies-search" placeholder="Search movies, TV shows…" autocomplete="off" value="${escape(this.query)}"></label><label class="movies-genre">Genre <select id="movies-genre" aria-label="Genre">${['All',...[...genres].sort()].map(g=>`<option${this.genre===g?' selected':''}>${escape(g)}</option>`).join('')}</select></label></div>`;
 }
 // Filtered results: the count, then the cards (or the empty state), then the full-catalog status and its pagination.
 private results(filtered:Title[]){
  // My list with no saved titles explains how to add some. A filter that empties a list with saved titles shows the usual no-match state.
  if(this.kind==='list'&&!this.savedTitles().length)return `<div class="movies-empty"><h2>Your list is empty</h2><p>Open a title and choose Add to my list to save it here.</p><button class="ui-btn secondary" data-action="reset">Explore all titles</button></div>`;
  const count=`${filtered.length} ${filtered.length===1?'title':'titles'}`;
  // The count line announces a filtered result. An unfiltered My list shows its count in its title block instead.
  const filtering=!!this.query.trim()||this.genre!=='All';
  const body=filtered.length?`<div class="movies-results-grid ui-grid">${filtered.map(t=>this.card(t)).join('')}</div>`:`<div class="movies-empty"><h2>No titles found</h2><p>Try another title or clear your filters. ${this.kind==='list'?'My list search covers the titles saved on this device.':'Search covers this catalog snapshot only.'}</p><button class="ui-btn secondary" data-action="reset">Explore all titles</button></div>`;
  return `${filtering?`<p class="movies-result-count" role="status" tabindex="-1">${count}</p>`:''}${body}${this.searchStatus()}`;
 }
 // The full-catalog status line and its pagination, for the request the page makes. Pagination shows only for the results that answer it.
 private searchStatus(){
  const request=this.remoteRequest();
  if(!request)return '';
  const genre=request.family==='g',answers=this.remoteKey===request.key;
  const message=this.remoteLoading?(genre?'Loading this genre from the full movie and TV catalog…':'Searching the full movie and TV catalog…')
   :this.remoteError?`${this.remoteError} ${genre?'The titles included with this site are still shown.':'The titles included with this site are still searchable.'}`
   :answers&&this.remoteTitles.length?'Showing full-catalog results from TMDB.':'No additional matches in the full catalog.';
  const retry=this.remoteError?` <button class="ui-btn secondary small" data-action="retry-search">${genre?'Retry':'Retry search'}</button>`:'';
  const pages=answers&&this.remotePages>1?`<div class="movies-pagination"><button class="ui-btn secondary small" data-action="catalog-page" data-nav="previous" data-page="${this.remotePage-1}"${this.remotePage<=1?' disabled':''}>Previous</button><span>Page ${this.remotePage} of ${this.remotePages}</span><button class="ui-btn secondary small" data-action="catalog-page" data-nav="next" data-page="${this.remotePage+1}"${this.remotePage>=this.remotePages?' disabled':''}>Next</button></div>`:'';
  return `<p class="movies-catalog-status" role="status" tabindex="-1">${escape(message)}${retry}</p>${pages}`;
 }
 // The unfiltered home: Continue watching, My list, then the API rails, or the starter rails until the request answers or when it fails.
 private homeContent(){
  const used=new Set(['continue-watching','my-list']);
  const unique=(id:string)=>{let next=id,n=2;while(used.has(next))next=`${id}-${n++}`;used.add(next);return next;};
  const shelves:string[]=[];
  const continued=this.continueRail();if(continued)shelves.push(continued);
  const saved=this.listRail();if(saved)shelves.push(saved);
  if(this.railsError)shelves.push('<p class="movies-rails-status" role="status" tabindex="-1">Showing the starter selection. The full catalog is unavailable right now. <button class="ui-btn secondary small" data-action="retry-rails">Retry</button></p>');
  if(this.rails.length){for(const rail of this.rails)shelves.push(this.shelf(unique(rail.id),rail.title,rail.titles));}
  else for(const [name,titles,note] of this.starterRails())if(titles.length)shelves.push(this.shelf(unique(slug(name)),name,titles,note));
  return shelves.join('');
 }
 // The starter rails from the bundled catalog, used while the aggregated request is pending or after it fails.
 private starterRails():[string,Title[],string][]{
  const catalog=this.catalog;
  const first:[string,Title[],string]=catalog.source==='tmdb'
   ?['Trending in this snapshot',catalog.titles.filter(t=>catalog.trending.includes(t.id)),'Snapshot, not live activity']
   :['Movies you’ll love',catalog.titles.filter(t=>t.kind==='movie').slice(0,6),'THE STARTER SELECTION'];
  return [first,['TV shows to get lost in',catalog.titles.filter(t=>t.kind==='tv'),'SERIES'],['Sci-Fi & Fantasy',catalog.titles.filter(t=>t.genres.includes('Science Fiction')||t.genres.includes('Fantasy')),'ESCAPE THE EVERYDAY']];
 }
 // Continue watching: one tile per in-progress title, newest first. An item with neither a title nor a saved snapshot is skipped.
 private continueRail(){
  const tiles:string[]=[];
  // Items come newest first, so the first item for each title is the one to resume: its latest episode, or its film.
  const shown=new Set<string>();
  for(const item of this.storage.continueItems()){
   if(shown.has(item.id))continue;
   const snapshot=this.storage.snapshot(item.id);
   const title=this.lookup(item.id)??(snapshot?fromSnapshot(snapshot):undefined);
   if(!title)continue;
   shown.add(item.id);
   const name=escape(title.name),episode=item.season!==undefined&&item.episode!==undefined;
   const route=`${titleHash(item.id)}${episode?`/season/${item.season}/episode/${item.episode}`:''}/play`;
   const image=this.artImage([asset(title.backdrop??title.poster),asset(title.poster)],'ui-card-img','alt="" width="320" height="180" loading="lazy" decoding="async" referrerpolicy="no-referrer"');
   const percent=item.duration?Math.round(Math.min(100,Math.max(0,item.time/item.duration*100))):undefined;
   tiles.push(`<a class="movies-continue ui-card" href="${escape(route)}" data-title="${escape(item.id)}" aria-label="Resume ${name}"><span class="ui-card-poster"><span class="ui-card-placeholder" aria-hidden="true">${uiIcon('image')}<span>${name}</span></span>${image}${percent===undefined?'':`<span class="movies-progress" aria-hidden="true"><span style="width:${percent}%"></span></span>`}</span><span class="ui-card-caption"><strong class="ui-card-title">${name}</strong><small class="ui-card-meta">${escape(episode?`S${item.season} · E${item.episode}`:'Movie')}</small></span></a>`);
  }
  return tiles.length?this.rail('continue-watching','Continue watching',tiles.join(''),tiles.length,'Pick up where you left off'):'';
 }
 // The saved titles in list order. Each id resolves through lookup(), else to its stored snapshot, and an id with neither is skipped.
 private savedTitles():Title[]{
  const titles:Title[]=[];
  for(const id of this.storage.data.list){
   const snapshot=this.storage.snapshot(id),found=this.lookup(id)??(snapshot?fromSnapshot(snapshot):undefined);
   if(found)titles.push(found);
  }
  return titles;
 }
 // My list: the saved titles, from the page's titles or from their saved snapshots.
 private listRail(){const titles=this.savedTitles();return titles.length?this.shelf('my-list','My list',titles):'';}
 // The season the title page shows: the route's season, else the first one.
 private shownSeason(t:Title):Season|undefined{return t.seasons.find(s=>s.number===this.route.season)||t.seasons[0];}
 // A season pill navigates as the old season select did: the season's first episode, and a season whose episodes are not loaded loads on the way.
 // The season already on screen is not chosen again, as choosing the current option of a select did nothing.
 private pickSeason(number:number){
  const title=this.catalog.titles.find(t=>t.id===this.route.id);if(!title)return;
  const season=title.seasons.find(s=>s.number===number);
  if(!season||season.number===this.shownSeason(title)?.number)return;
  this.pillSeason=number;
  location.hash=`${titleHash(title.id)}/season/${season.number}/episode/${season.episodes[0]?.number??1}`;
 }
 // Re-renders the page and gives focus back to the control that had it, found again by what it is. The scroll position stays.
 private renderKeepingFocus(){const top=this.root.scrollTop;this.keepingFocus(()=>this.render());this.root.scrollTop=top;}
 // Runs an update that rebuilds part of the page, then gives focus back to the control that had it, found again by what it is.
 private keepingFocus(update:()=>void){
  const active=document.activeElement instanceof HTMLElement&&document.activeElement!==this.root&&this.root.contains(document.activeElement)?document.activeElement:undefined;
  const finder=active&&finderFor(active),region=active?regionOf(active):'';
  update();
  if(active)this.restoreFocus(finder?finder(this.root):[],region);
 }
 // A series opens its newest episode in progress, else its first episode that is loaded. With neither there is no play route.
 private seriesPrimary(t:Title){
  const continued=this.storage.continueItems().find((item):item is ContinueItem&{season:number;episode:number}=>item.id===t.id&&item.season!==undefined&&item.episode!==undefined);
  const first=t.seasons.find(s=>s.episodes.length),episode=first?.episodes[0];
  if(continued)return `<a class="movies-primary ui-btn primary" href="${escape(`${titleHash(t.id)}/season/${continued.season}/episode/${continued.episode}/play`)}">${uiIcon('play')}Continue S${continued.season} · E${continued.episode}</a>`;
  if(first&&episode)return `<a class="movies-primary ui-btn primary" href="${escape(`${titleHash(t.id)}/season/${first.number}/episode/${episode.number}/play`)}">${uiIcon('play')}Play S${first.number} E${episode.number}</a>`;
  return '';
 }
 // The seasons as toggle pills, then the episodes of the season on screen. Episodes that are still loading say so.
 private episodesSection(t:Title,season:Season|undefined){
  const count=t.seasons.length;
  const pills=t.seasons.map(s=>`<button class="ui-pill" data-season="${s.number}" aria-pressed="${s.number===season?.number}">${escape(s.name)}${s.episodes.length?` <span class="movies-pill-count" aria-hidden="true">${s.episodes.length}</span>`:''}</button>`).join('');
  const loading=this.pendingTitle||(season!==undefined&&this.drawerLoading===season.number);
  const rows=season?.episodes.length?season.episodes.map(e=>this.episodeRow(t,season,e)).join('')
   :loading?'<p class="movies-episodes-status">Loading episodes…</p>'
   :season&&!this.bundledIds.has(t.id)&&!this.loadedSeasons.has(t.id+':s'+season.number)?`<p class="movies-episodes-status" role="status">Episodes for this season aren't available right now.</p><button class="ui-btn secondary" data-title-season="${season.number}">Retry episodes</button>`
   :'<p class="movies-episodes-status">Episode metadata has not been included in this snapshot.</p>';
  return `<section class="movies-episodes ui-container"><div class="movies-section-head"><h2>Seasons</h2>${count?`<span class="ui-count">${count} ${count===1?'season':'seasons'}</span>`:''}</div>${count?`<div class="movies-season-pills" role="group" aria-label="Seasons">${pills}</div>`:''}<div class="movies-episodes-list">${rows}</div></section>`;
 }
 // One episode: a 16:9 still with its chip and any progress, the name and its meta, the overview, and a Play link named for the episode.
 private episodeRow(t:Title,season:Season,e:Episode){
  const play=`${titleHash(t.id)}/season/${season.number}/episode/${e.number}/play`,name=escape(e.name);
  const key=mediaKey(t,{id:t.id,season:season.number,episode:e.number,play:false}),saved=this.storage.data.progress[key]??0,duration=this.storage.data.meta[key]?.duration;
  const percent=saved>0&&duration?Math.round(Math.min(100,saved/duration*100)):undefined;
  const image=this.artImage([...(e.still?[asset(e.still)]:[]),...(t.backdrop?[asset(t.backdrop)]:[]),asset(t.poster)],'movies-episode-still','alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"');
  const meta=[e.airDate??'',e.runtime?formatRuntime(e.runtime):'',e.rating===undefined?'':`★ ${e.rating.toFixed(1)}`].filter(Boolean).map(part=>escape(part)).join(' · ');
  return `<article class="movies-episode"><a class="movies-episode-thumb" href="${escape(play)}" tabindex="-1" aria-hidden="true">${image}<span class="ui-chip">EP ${e.number}</span><span class="ui-card-play">${uiIcon('play')}</span>${percent===undefined?'':`<span class="movies-progress"><span style="width:${percent}%"></span></span>`}</a><div class="movies-episode-body"><h3>${name}</h3>${meta?`<p class="movies-episode-meta">${meta}</p>`:''}<p>${escape(e.overview||'No description supplied.')}</p></div><a class="ui-btn primary small" href="${escape(play)}" aria-label="Play ${name}">${uiIcon('play')}Play</a></article>`;
 }
 // The cast: up to twelve people as photo cards. A person with no photo, or whose photo failed, shows initials.
 private castSection(cast:CastMember[]){
  const cards=cast.map(person=>{
   const photo=this.artImage(person.photo?[asset(person.photo)]:[],'movies-cast-img','alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"');
   return `<li class="movies-cast-card"><span class="movies-cast-photo"><span class="movies-cast-initials" aria-hidden="true">${escape(initials(person.name))}</span>${photo}</span><strong class="movies-cast-name">${escape(person.name)}</strong>${person.character?`<small class="movies-cast-character">${escape(person.character)}</small>`:''}</li>`;
  }).join('');
  return `<section class="movies-cast ui-container"><div class="movies-section-head"><h2>Cast</h2><span class="ui-count">${cast.length} ${cast.length===1?'person':'people'}</span></div><ul class="movies-cast-row">${cards}</ul></section>`;
 }
 // The title page: a blurred backdrop behind the poster, the chips, title, genres, overview and actions. A series then lists its seasons
 // and episodes, and the cast and the titles like this one follow.
 private detail(t:Title){
  const name=escape(t.name),season=this.shownSeason(t);
  const source=t.kind==='movie'?(t.source.type==='archive'||(licensedSource(this.licenses,mediaKey(t,this.route))??frameSource(t,this.route))):undefined;
  const saved=this.storage.data.progress[t.id]??0;
  const chips=[`<span class="ui-chip">${t.kind==='tv'?'Series':'Movie'}</span>`,t.year?`<span class="ui-chip">${escape(String(t.year))}</span>`:'',t.rating===undefined?'':`<span class="ui-chip rating">★ ${t.rating.toFixed(1)}</span>`,t.runtime?`<span class="ui-chip">${escape(formatRuntime(t.runtime))}</span>`:''].join('');
  const backdrop=this.artImage([...(t.backdrop?[asset(t.backdrop)]:[]),asset(t.poster)],'movies-detail-backdrop-img','alt="" referrerpolicy="no-referrer"');
  const poster=this.artImage([asset(t.poster)],'movies-detail-art',`alt="Poster for ${name}" width="320" height="480" referrerpolicy="no-referrer"`);
  const primary=t.kind==='movie'
   ?`<button class="movies-primary ui-btn primary" data-play="${escape(t.id)}"${source?'':' disabled aria-describedby="movies-unavailable"'}>${uiIcon('play')}Play movie</button>`
   :this.seriesPrimary(t);
  // A movie's saved position is offered as a resume point only from START_THRESHOLD seconds, and only where it can start there: from a local
  // file, or with the current server. The title page and the watch page follow the same server.
  const server=this.chooseServer(mediaKey(t,this.route));const resumes=!!licensedSource(this.licenses,mediaKey(t,this.route))||(!!server&&streamProvider(server).resume!=='none');
  const resume=t.kind==='movie'&&source&&saved>=START_THRESHOLD&&resumes?`<small class="movies-resume">Resume at ${escape(formatClock(saved))}</small>`:'';
  const list=this.listButton(t.id);
  const note=t.kind==='movie'
   ?(source?'Streaming available. An external player receives normal connection and playback information.':'No provider identifier is available for this title.')
   :season?.episodes.length?'Choose an episode below to stream this series.':this.pendingTitle?'Loading episodes…':'Episode details are not in this snapshot.';
  const info=`<div class="movies-detail-info"><div class="movies-chips">${chips}</div><h1 tabindex="-1">${name}</h1><div class="movies-tags">${t.genres.map(g=>`<span class="ui-chip">${escape(g)}</span>`).join('')}</div><p class="movies-overview">${escape(t.overview)}</p><div class="movies-actions">${primary}${resume}${list}</div><p id="movies-unavailable" class="movies-availability">${escape(note)}</p></div>`;
  // The backdrop carries the hero's shade from theme.css. Without a poster, the grid drops the poster column.
  const header=`<section class="movies-detail"><div class="movies-detail-backdrop" aria-hidden="true">${backdrop}<span class="ui-hero-shade" aria-hidden="true"></span></div><div class="movies-detail-inner ui-container${poster?'':' movies-detail-bare'}">${poster}${info}</div></section>`;
  const episodes=t.kind==='tv'?this.episodesSection(t,season):'';
  const cast=t.cast?.length?this.castSection(t.cast):'';
  // The related rail sits in the page gutter, as the browse rails do, so its arrows and cards stay inside the page width.
  const related=t.related?.length?`<div class="movies-related ui-container">${this.shelf('related','More like this',t.related)}</div>`:'';
  return `${header}${episodes}${cast}${related}`;
 }
 private playbackHash(){return titleHash(this.route.id!)+(this.route.season?`/season/${this.route.season}/episode/${this.route.episode}`:'')+'/play';}
 private dismissWarning(){this.warning?.close();this.warning?.remove();this.warning=undefined;}
 private warnBeforePlayback(trigger:HTMLElement|undefined,proceed:()=>void,cancel:()=>void=()=>{}){
  if(this.warning?.open||this.disposed)return;
  const drawer=trigger?.closest<HTMLDialogElement>('dialog.movies-drawer');
  const reopenDrawer=!!drawer?.open;
  const hadMedia=!!this.frame||!!this.video;
  if(hadMedia)this.pause();
  this.stopVideo();
  if(hadMedia){const media=this.root.querySelector('.movies-media');if(media)media.innerHTML='<div class="movies-player-unavailable"><h2>Stream paused</h2><button class="ui-btn primary" data-action="resume-stream">Resume stream</button></div>';}
  const dialog=document.createElement('dialog');this.warning=dialog;
  dialog.className='movies-warning ui-glass-sheet';
  dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
  dialog.setAttribute('aria-labelledby','movies-warning-title');dialog.setAttribute('aria-describedby','movies-warning-description');
  dialog.innerHTML=`<h2 id="movies-warning-title">Before you watch</h2><p id="movies-warning-description">This video player is run by an outside website, not QCC. It may show ads that are inappropriate or harmful, and QCC can't control or block them. We're doing everything we can to prevent this.</p><div class="movies-warning-actions"><button class="ui-btn secondary" autofocus>Go back</button><button class="ui-btn primary">Continue</button></div>`;
  const [back,forward]=dialog.querySelectorAll<HTMLButtonElement>('button');
  const finder=trigger?finderFor(trigger):undefined;
  const finish=(accepted:boolean)=>{
   this.dismissWarning();
   if(accepted){this.suspended=false;proceed();}else {cancel();if(reopenDrawer&&drawer?.isConnected)openSheet(drawer);(trigger?.isConnected?trigger:finder?.(this.root)[0])?.focus({preventScroll:true});}
  };
  back.addEventListener('click',()=>finish(false));forward.addEventListener('click',()=>finish(true));
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
  dialog.addEventListener('keydown',event=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish(false);}
   if(event.key==='Tab'){event.preventDefault();(document.activeElement===back?forward:back).focus();}
  });
  document.body.append(dialog);openSheet(dialog,trigger);back.focus({preventScroll:true});
 }
 private player(t:Title){
  const route=this.route;
  const episode=t.seasons.find(s=>s.number===route.season)?.episodes.find(e=>e.number===route.episode);
  const key=mediaKey(t,route),saved=this.storage.data.progress[key]??0;
  // A licensed file plays from its own file before any provider is asked, whether or not its season has loaded.
  const archive=t.source.type==='archive'?t.source:undefined;
  const source=archive?undefined:licensedSource(this.licenses,key);
  const needsWarning=!archive&&this.confirmedPlayback!==this.playbackHash();
  if(needsWarning&&!this.suspended)queueMicrotask(()=>{
   if(!this.disposed&&this.route.play&&this.currentTitle()?.id===t.id&&!this.suspended&&this.confirmedPlayback!==this.playbackHash())this.warnBeforePlayback(undefined,()=>{this.confirmedPlayback=this.playbackHash();this.renderKeepingFocus();},()=>{location.hash=titleHash(t.id);});
  });
  // An episode missing from a loaded season gets no provider (section 8.3). A season still loading, or one that failed, keeps the optimistic player.
  const missing=!source&&this.episodeMissing(t,route);
  const server=archive||needsWarning||source||missing?undefined:this.chooseServer(key);
  this.providerId=server;
  const exhausted=!archive&&!needsWarning&&!source&&!missing&&!server;
  const external=server?frameSource(t,route,server,saved):undefined;
  const back=titleHash(t.id)+(episode?`/season/${route.season}/episode/${route.episode}`:'');
  const media=archive?`<iframe class="movies-archive-frame" data-media-key="${escape(key)}" src="https://archive.org/embed/${archive.archiveId}" title="${escape(t.name)} Internet Archive player" sandbox="allow-scripts allow-same-origin allow-presentation" referrerpolicy="no-referrer" allowfullscreen></iframe>`
   :needsWarning?`<div class="movies-player-unavailable"><h2>${this.suspended?'Stream paused':'Before you watch'}</h2>${this.suspended?'<button class="ui-btn primary" data-action="resume-stream">Resume stream</button>':''}</div>`
   :source?`<video controls playsinline preload="metadata" referrerpolicy="no-referrer" aria-label="${escape(t.name)} player" data-media-key="${escape(key)}" src="${escape(asset(source.path))}"></video>`
   :missing?this.episodeUnavailable(t,route)
   :external?`<iframe class="movies-provider-frame" data-provider="${server}" data-media-key="${escape(key)}" src="${escape(external)}" title="${escape(t.name)} streaming player" sandbox="${FRAME_SANDBOX}" allow="${FRAME_ALLOW}" referrerpolicy="no-referrer" allowfullscreen></iframe>`
   :exhausted?`<div class="movies-player-unavailable"><span aria-hidden="true">▷</span><h2>Playback didn't start</h2><p>This title would not start on any server.</p><button class="ui-btn primary" data-action="retry-servers">Try again</button></div>`
   :`<div class="movies-player-unavailable"><span aria-hidden="true">▷</span><h2>Playback unavailable</h2><p>${t.kind==='tv'&&!episode?'This episode is not in the current catalog.':'This title has no valid provider identifier.'}</p><p>Choose a title with a supported movie or series identifier.</p><a class="ui-btn primary" href="${escape(back)}">Return to title</a></div>`;
  const showServers=!archive&&!needsWarning&&!source&&!missing&&(!!external||exhausted);
  const status=archive?`From the Internet Archive · ${escape(archive.license)}`
   :needsWarning?'Playback is waiting for your confirmation.'
   :source?`Licensed under ${escape(source.license)} · ${escape(source.credit)}. Progress stays on this device.`
   :server&&external?`External player provided by ${escape(streamProvider(server).name)}. It and its streaming providers receive your IP address and normal playback requests and may serve ads or use cookies. Availability and distribution rights are not verified by QCC. No account data or watchlist is sent by QCC.`
   :exhausted?'No server started this title.'
   :missing?''
   :'No provider identifier is available for this title.';
  // Section 7.6 order: back, title, episode heading, My list, screen, servers, episode controls (TV), status.
  return `<div class="movies-player"><a class="movies-detail-back" href="${escape(back)}" aria-label="Back to ${escape(t.name)}">${uiIcon('back')}Back</a><h1 tabindex="-1">${escape(t.name)}</h1>${episode?`<h2>S${route.season} · E${episode.number} — ${escape(episode.name)}</h2>`:''}<div class="movies-watch-actions">${this.listButton(t.id)}</div><div class="movies-screen" data-title="${escape(t.id)}" tabindex="-1" aria-label="Player area"><div class="movies-media">${media}</div><div class="movies-connecting" hidden><span class="movies-spinner" aria-hidden="true"></span>${server?`<p>Connecting to Server ${serverNumber(server)}…</p>`:''}</div><div class="movies-next" role="dialog" aria-label="Up next" hidden></div><p class="movies-next-announcement sr-only" role="status" aria-live="polite"></p><button data-action="fullscreen" class="movies-fullscreen"${this.fullscreenSupported()?'':' hidden'} aria-pressed="false">Full screen</button><div class="movies-resume-pill" hidden></div></div>${showServers?this.serversRow(key):''}${t.kind==='tv'&&episode?this.episodeControls(t,route.season!,route.episode!):''}<p id="movies-player-status" role="status">${status}</p></div>`;
 }
 // The server a title starts on: the user's pick this session, else the first server of the remembered order that has not failed for this
 // title in the last five minutes. Once every automatic attempt has failed, no server starts until Try again.
 private chooseServer(key:string):StreamProviderId|undefined{
  const failed=failedProviders(key);
  // The pick starts the other titles too. Its failure on one of them hands that title to the remembered order.
  if(this.pickedServer&&(key===this.pickedKey||!failed.has(this.pickedServer)))return this.pickedServer;
  if(this.exhausted)return undefined;
  return providerOrder(this.storage.data.provider).find(id=>!failed.has(id));
 }
 // Section 8.3. A season is judged once its metadata has loaded: a built-in title's list is always known, and a fetched title's list is known
 // once its details have loaded. A season without episodes that has not loaded yet, or whose load failed, is not judged.
 private episodeMissing(t:Title,route:MovieRoute){
  if(t.kind!=='tv')return false;
  // A play route that names no episode has nothing to play, so it is unavailable before any metadata is judged.
  if(route.season===undefined||route.episode===undefined)return true;
  const builtIn=this.bundledIds.has(t.id);
  if(!builtIn&&!this.loadedDetails.has(t.id))return false;
  const season=t.seasons.find(s=>s.number===route.season);
  if(!season)return true;
  if(!builtIn&&!season.episodes.length&&!this.loadedSeasons.has(t.id+':s'+route.season))return false;
  return !season.episodes.some(e=>e.number===route.episode);
 }
 // Section 8.3: the panel links to the season the missing episode belongs to, or to the title when the season is not in its list.
 private episodeUnavailable(t:Title,route:MovieRoute){
  if(route.season===undefined||route.episode===undefined)return `<div class="movies-player-unavailable"><span aria-hidden="true">▷</span><h2>Episode unavailable</h2><p>This link doesn't name an episode.</p><a class="ui-btn primary" href="${escape(titleHash(t.id))}">Choose an episode</a></div>`;
  const season=t.seasons.find(s=>s.number===route.season);
  const href=titleHash(t.id)+(season?`/season/${season.number}/episode/${season.episodes[0]?.number??1}`:'');
  return `<div class="movies-player-unavailable"><span aria-hidden="true">▷</span><h2>Episode unavailable</h2><p>This episode isn't in this season's list.</p><a class="ui-btn primary" href="${escape(href)}">Choose another episode</a></div>`;
 }
 // The servers row. Server n is the n-th provider in STREAM_PROVIDERS. A server that failed for this title in the last five minutes stays marked.
 // The help says so when the current server cannot resume.
 private serversRow(key:string){
  const failed=failedProviders(key);
  const buttons=STREAM_PROVIDERS.map((provider,index)=>`<button class="movies-server" data-server="${provider.id}" aria-pressed="${provider.id===this.providerId}" data-state="${failed.has(provider.id)?'failed':'idle'}"><span class="movies-server-dot" aria-hidden="true"></span>Server ${index+1} <small>${escape(provider.name)}</small></button>`).join('');
  const beginning=this.providerId&&streamProvider(this.providerId).resume==='none'?' This server starts from the beginning.':'';
  return `<div class="movies-servers" role="group" aria-label="Servers" aria-describedby="movies-source-help"><span class="movies-servers-label">Servers</span>${buttons}<button data-action="reload-stream" class="ui-btn secondary small">Reload player</button><p id="movies-source-help">If a server will not start we try the next one automatically. You can also pick one.${beginning}</p><p class="movies-failover" role="status">${escape(this.failoverNote)}</p></div>`;
 }
 private listButton(id:string){const selected=this.storage.data.list.includes(id);return `<button class="ui-btn secondary" data-list="${escape(id)}">${uiIcon(selected?'check':'plus')}${selected?'In my list':'Add to my list'}</button>`;}
 private currentTitle(){return this.catalog.titles.find(t=>t.id===this.route.id);}
 // The episode controls of a series: previous, the episode button that opens the drawer, next and the Auto next switch.
 private episodeControls(t:Title,season:number,number:number){
  return `<div class="movies-episode-controls">${this.previousControl(t,season,number)}<button class="ui-btn secondary" data-action="episodes" aria-haspopup="dialog">S${season} · E${number}</button>${this.nextControl(t,season,number)}<label class="movies-auto-next"><span class="ui-switch"><input type="checkbox" id="movies-auto-next"${this.preferences.autoNext()?' checked':''}><span aria-hidden="true"></span></span>Auto next episode</label>${this.drawer(t)}</div>`;
 }
 private previousControl(t:Title,season:number,number:number){
  const previous=previousEpisode(t,season,number);
  if(previous)return `<a class="ui-btn secondary" href="${escape(playHash(t.id,previous.season,previous.episode))}" aria-label="Previous episode" data-episode-nav="previous">${uiIcon('chevron-left')}Previous</a>`;
  // Nothing earlier in the series is the first episode. An earlier season that is not loaded leaves the previous episode unknown.
  const first=!t.seasons.some(s=>s.number<season);
  return `<button class="ui-btn secondary" disabled aria-label="${first?'First episode':'Previous episode unavailable'}" data-episode-nav="previous">${uiIcon('chevron-left')}Previous</button>`;
 }
 private nextControl(t:Title,season:number,number:number){
  const next=nextEpisode(t,season,number);
  if(next)return `<a class="ui-btn primary" href="${escape(playHash(t.id,next.season,next.episode))}" aria-label="Next episode" data-episode-nav="next">Next${uiIcon('chevron-right')}</a>`;
  return `<button class="ui-btn primary" disabled aria-label="Final episode" data-episode-nav="next">Next${uiIcon('chevron-right')}</button>`;
 }
 // The episode drawer: a modal dialog, opened with showModal(). Its seasons are pills and its episodes are links to their play routes.
 private drawer(t:Title){return `<dialog class="movies-drawer ui-glass-sheet" aria-label="Select episode">${this.drawerContent(t)}</dialog>`;}
 private drawerContent(t:Title){
  const shown=this.drawerSeasonOf(t);
  const pills=t.seasons.map(s=>`<button class="ui-pill" data-drawer-season="${s.number}" aria-pressed="${s.number===shown?.number}">${escape(s.name)}</button>`).join('');
  let rows:string;
  if(shown&&this.drawerLoading===shown.number)rows='<p class="movies-episodes-status" role="status">Loading episodes…</p>';
  else if(shown&&this.drawerError?.season===shown.number)rows=`<p class="movies-episodes-status" role="status">${escape(this.drawerError.message)}</p><button class="ui-btn secondary movies-drawer-retry" data-drawer-season="${shown.number}">Retry episodes</button>`;
  else if(shown?.episodes.length)rows=shown.episodes.map(e=>this.drawerRow(t,shown,e)).join('');
  else rows='<p class="movies-episodes-status">Episode metadata has not been included in this snapshot.</p>';
  return `<span class="ui-drawer-handle" aria-hidden="true"></span><div class="movies-drawer-head"><h2>Episodes</h2><button class="icon-button" data-action="close-drawer" aria-label="Close episode list">${uiIcon('close')}</button></div><div class="movies-drawer-seasons" role="group" aria-label="Seasons">${pills}</div><div class="movies-drawer-list">${rows}</div>`;
 }
 // The season the drawer shows: the one a pill chose, else the season that is playing.
 private drawerSeasonOf(t:Title){return t.seasons.find(s=>s.number===this.drawerSeason)??t.seasons.find(s=>s.number===this.route.season);}
 private drawerRow(t:Title,season:Season,e:Episode){
  const current=season.number===this.route.season&&e.number===this.route.episode,meta=e.runtime?formatRuntime(e.runtime):(e.airDate??'');
  const image=this.artImage([...(e.still?[asset(e.still)]:[]),...(t.backdrop?[asset(t.backdrop)]:[]),asset(t.poster)],'movies-drawer-still','alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"');
  return `<a class="movies-drawer-row" href="${escape(playHash(t.id,season.number,e.number))}"${current?' aria-current="true"':''}><span class="movies-drawer-thumb">${image}<span class="ui-chip">EP ${e.number}</span></span><span class="movies-drawer-text"><strong>${escape(e.name)}</strong>${meta?`<small>${escape(meta)}</small>`:''}</span></a>`;
 }
 // Draws the drawer again in place, so an open drawer stays open and focus stays on the control that had it.
 private refreshDrawer(){
  const dialog=this.root.querySelector<HTMLDialogElement>('dialog.movies-drawer'),t=this.currentTitle();
  if(!dialog||!t)return;
  const active=dialog.contains(document.activeElement)?document.activeElement as HTMLElement:undefined;
  const finder=active&&finderFor(active);
  dialog.innerHTML=this.drawerContent(t);
  markImages(dialog);
  if(active){
   const hit=(finder?finder(dialog):[]).find(candidate=>!candidate.matches(':disabled'));
   (hit??dialog.querySelector<HTMLElement>('[aria-current="true"]')??dialog.querySelector<HTMLElement>('[data-action="close-drawer"]'))?.focus({preventScroll:true});
  }
 }
 private openDrawer(trigger?:Element){
  const dialog=this.root.querySelector<HTMLDialogElement>('dialog.movies-drawer');if(!dialog||dialog.open)return;
  // The drawer takes the reader's attention, so an Up next countdown stops while it is open.
  this.cancelNext();
  // Each opening lists the season that is playing.
  this.drawerSeason=undefined;this.drawerError=undefined;this.refreshDrawer();
  openSheet(dialog,trigger);
  (dialog.querySelector<HTMLElement>('[aria-current="true"]')??dialog.querySelector<HTMLElement>('[data-action="close-drawer"]'))?.focus();
 }
 private closeDrawer(){const dialog=this.root.querySelector<HTMLDialogElement>('dialog.movies-drawer');if(dialog?.open)dialog.close();}
 // A season pill shows that season's episodes. A season that is not loaded is asked for first, in the background.
 private pickDrawerSeason(number:number){
  const t=this.currentTitle(),season=t?.seasons.find(s=>s.number===number);if(!t||!season)return;
  this.drawerSeason=number;this.drawerError=undefined;
  if(!season.episodes.length&&this.dynamicIds.has(t.id)&&!this.loadedSeasons.has(t.id+':s'+number))void this.loadDrawerSeason(t.id,number);
  else this.refreshDrawer();
 }
 // Asks for one season's episodes in the background. The stream and an open drawer stay as they are; the drawer and the previous control then update in place.
 private async loadDrawerSeason(id:string,number:number){
  const request=++this.drawerRequest;this.drawerAbort?.abort();const controller=this.drawerAbort=new AbortController();
  this.drawerLoading=number;this.drawerError=undefined;this.refreshDrawer();
  try{
   const {data}=await cachedJson('/api/movies?'+new URLSearchParams({id,season:String(number)}),controller.signal);
   const title=parseCatalog({titles:[data.title],source:'tmdb'},true).titles[0];
   if(request!==this.drawerRequest||this.route.id!==id)return;
   if(!title||title.id!==id)throw new Error('Episode details are unavailable.');
   this.storeTitle(id,title,number);this.drawerLoading=undefined;if(this.route.play)this.refreshWatchPanel();else this.renderKeepingFocus();
  }catch(error){
   if(request!==this.drawerRequest||this.route.id!==id||controller.signal.aborted)return;
   this.drawerLoading=undefined;this.drawerError={season:number,message:movieNetworkMessage(error,'Episodes')};this.refreshDrawer();
  }
 }
 // Updates the previous control and the drawer in place, so the stream and an open drawer are left as they are.
 private refreshWatchPanel(){
  const t=this.currentTitle(),previous=this.root.querySelector<HTMLElement>('.movies-episode-controls [data-episode-nav="previous"]');
  if(t&&previous&&this.route.season!==undefined&&this.route.episode!==undefined){
   const template=document.createElement('template');template.innerHTML=this.previousControl(t,this.route.season,this.route.episode);
   previous.replaceWith(template.content.firstElementChild!);
  }
  this.refreshDrawer();
 }
 // The watch page is redrawn in place when its screen still shows this title, so a control on the page never restarts the stream.
 // Any other page renders as before.
 private redrawPlayer(){
  const title=this.currentTitle();
  if(this.route.play&&title&&this.root.querySelector<HTMLElement>('.movies-screen')?.dataset.title===title.id)this.refreshPlayer(title);
  else this.render();
 }
 // The resume pill shows the position a stream starts from, for four seconds. Stopping the stream or pausing it clears it.
 private showResumePill(seconds:number){
  const pill=this.root.querySelector<HTMLElement>('.movies-resume-pill');if(!pill)return;
  clearTimeout(this.resumeTimer);
  pill.textContent=`Resumed at ${formatClock(seconds)}`;pill.hidden=false;
  this.resumeTimer=setTimeout(()=>{pill.hidden=true;this.resumeTimer=undefined;},4000);
 }
 private clearResumePill(){
  clearTimeout(this.resumeTimer);this.resumeTimer=undefined;
  const pill=this.root.querySelector<HTMLElement>('.movies-resume-pill');if(pill)pill.hidden=true;
 }
 private mobileNav(){const sections:[MovieKind,string,'grid'|'film'|'tv'|'bookmark'][]=[['all','Home','grid'],['movie','Movies','film'],['tv','TV Shows','tv'],['list','My list','bookmark']];return sections.map(([kind,name,icon])=>`<button class="ui-tab" data-kind="${kind}" aria-pressed="${this.kind===kind&&!this.route.id}">${uiIcon(icon)}<span>${name}</span></button>`).join('')+`<button class="ui-tab" data-action="study">${uiIcon('study')}<span>Study</span></button>`;}
 private render(){
  const title=this.catalog.titles.find(t=>t.id===this.route.id);
  // Fullscreen on this title's own screen refreshes that screen in place, so its frame and overlay stay, even while the season is pending.
  if(this.route.play&&title&&this.screenFullscreen()&&this.root.querySelector<HTMLElement>('.movies-screen')?.dataset.title===title.id){this.refreshPlayer(title);return;}
  this.releaseMedia();
  // A rail of another page with the same name starts at its beginning, so only a redraw of this page keeps the scroll. A season
  // picked on a title page redraws the same page, so the season and episode at the end of its address do not count.
  const page=location.hash.replace(/\/season\/\d+(\/episode\/\d+)?$/,''),scrolls=page===this.railPage?this.railScrolls():new Map<string,number>();
  // A title whose details are pending shows the loading text, never a not-found message. A play route builds its player once the details have loaded.
  this.root.innerHTML=this.header()+(!this.ready?`<div class="movies-empty"><h1 tabindex="-1">${this.failed?'The collection is unavailable':'Opening the collection…'}</h1><p>${this.failed?escape(this.loadError||'Connect to this site and try again. Movies are separate from the games offline pack.'):'Your next story is on its way.'}</p>${this.failed?'<button class="ui-btn secondary" data-action="retry">Try again</button>':''}</div>`:this.notFound?`<div class="movies-empty"><h1 tabindex="-1">That page could not be found.</h1><a href="#/movies">Back to browsing</a></div>`:this.route.id?(()=>{const t=this.catalog.titles.find(t=>t.id===this.route.id);return this.pendingTitle&&(this.route.play||!t)?LOADING_TITLE:t?(this.route.play?this.player(t):this.detail(t)):'<div class="movies-empty"><h1 tabindex="-1">Title not found</h1><p>This title is not in the catalog snapshot.</p><a href="#/movies">Browse the collection</a></div>';})():this.browse());this.tabbar.innerHTML=this.mobileNav();this.root.querySelector('.movies-top')?.after(this.tabbar);
  markImages(this.root);
  this.renderDetailError();
  this.footerAttribution();
  this.restoreRailScrolls(scrolls);
  this.railPage=page;
  updateRails(this.root);
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
  const retry=document.createElement('button');retry.className='ui-btn secondary small';retry.textContent='Retry title';retry.dataset.action='retry-title';notice.append(' ',retry);
 }
 private bindPlayer(){
  this.ended=false;this.frameDuration=undefined;this.frameReported=false;this.videoReported=false;
  this.video=this.root.querySelector('video')??undefined;
  this.frame=this.root.querySelector('iframe')??undefined;
  if(this.frame){const title=this.catalog.titles.find(t=>t.id===this.route.id)!;this.progressKey=mediaKey(title,this.route);this.frameTime=this.storage.data.progress[this.progressKey]??0;this.lastSave=0;}
  if(this.video){
   const video=this.video,t=this.catalog.titles.find(t=>t.id===this.route.id)!;
   this.progressKey=mediaKey(t,this.route);this.lastSave=0;const key=this.progressKey;
   video.addEventListener('loadedmetadata',()=>{if(this.video!==video)return;const time=this.storage.data.progress[key];if(time&&Number.isFinite(video.duration)&&time<video.duration-2){video.currentTime=time;if(time>=START_THRESHOLD&&!this.suspended&&!document.hidden)this.showResumePill(time);}});
   video.addEventListener('play',()=>{if(this.video===video&&!document.hidden&&!this.root.closest('[inert]'))this.suspended=false;});
   video.addEventListener('ended',()=>{if(this.video===video)this.episodeEnded();});
   // A seek to the saved position also fires timeupdate while the video is paused, so only playback counts as a report.
   video.addEventListener('timeupdate',()=>{if(this.video!==video)return;if(!video.paused)this.videoReported=true;this.rearm(video.currentTime,video.duration);if(this.videoReported&&!this.ended&&Date.now()-this.lastSave>5000)this.saveProgress(video.currentTime);});
   video.addEventListener('pause',()=>{if(this.video===video&&this.videoPlayed(video))this.saveProgress(video.currentTime);});
   video.addEventListener('error',()=>{if(this.video!==video)return;const status=this.root.querySelector('#movies-player-status');if(status)status.textContent='The local file could not be played.';});
  }
  if(this.frame&&this.providerId)this.bindAttempt(this.frame,this.providerId);
  else this.endSession();
  if(this.suspended||document.hidden)this.pause();
 }
  // A ready or a progress report is a sign of life for the supervisor. Only the frame's own window can send one, so the page's own messages do not count.
 private providerMessage=(event:MessageEvent)=>{
  if(!this.frame||!this.providerId||event.source!==this.frame.contentWindow)return;
  const signal=providerSignal(this.providerId,event.origin,event.data);if(!signal)return;
  if(signal.kind==='ready'){this.supervisor?.message('ready');return;}
  this.frameReported=true;
  this.supervisor?.message('progress');
  if(signal.kind==='ended'){this.episodeEnded();return;}
  this.frameTime=signal.currentTime;
  if(signal.duration)this.frameDuration=signal.duration;
  // A report more than 5 seconds before the end ends a finished state. A report without a duration uses the one known for this frame.
  this.rearm(signal.currentTime,signal.duration??this.frameDuration??NaN);
  if(signal.duration&&signal.duration-signal.currentTime<=1)this.episodeEnded();
  if(signal.ended)this.episodeEnded();
  if(!this.ended&&Date.now()-this.lastSave>5000)this.saveProgress(this.frameTime);
 };
 // Another tab changed the saved data. Only a change to My list, or to the titles in progress, shows: a position alone leaves the page as it is.
 // A title or watch page updates its list controls in place, and Home or My list redraws.
 private onStorage=(event:StorageEvent)=>{
  if(event.key!==MOVIES_KEY&&event.key!==null)return;
  const before=this.memberships();
  if(!this.storage.reload()||this.memberships()===before||this.notFound)return;
  if(this.route.id){this.refreshListControls();return;}
  // A browse page is redrawn in place, so a typed query keeps its search field. Its node and text stay as they are.
  if(this.kind==='list'||(this.kind==='all'&&!this.query.trim()&&this.genre==='All'))this.renderBrowseState();
 };
 // What a viewer can see of the saved data: the titles in My list, and the titles with a position above zero.
 private memberships(){return `${this.storage.data.list.join(',')}|${[...new Set(Object.entries(this.storage.data.progress).filter(([,time])=>time>0).map(([key])=>key.split(':')[0]))].sort().join(',')}`;}
 // The list controls of a title or watch page, and a series' primary action, follow a change from another tab in place. The page and the player keep their state and focus.
 private refreshListControls(){
  const id=this.route.id;if(!id)return;
  const selected=this.storage.data.list.includes(id);
  for(const button of within(this.root,'[data-list]').filter(e=>e.dataset.list===id))button.innerHTML=`${uiIcon(selected?'check':'plus')}${selected?'In my list':'Add to my list'}`;
  const t=this.currentTitle(),actions=this.root.querySelector<HTMLElement>('.movies-detail .movies-actions');
  if(!t||t.kind!=='tv'||!actions)return;
  const primary=actions.querySelector<HTMLElement>(':scope > a.movies-primary'),next=this.seriesPrimary(t);
  if(!primary){if(next)actions.insertAdjacentHTML('afterbegin',next);return;}
  const focused=document.activeElement===primary;
  if(!next){primary.remove();if(focused)actions.querySelector<HTMLElement>('[data-list]')?.focus({preventScroll:true});return;}
  const template=document.createElement('template');template.innerHTML=next;const fresh=template.content.firstElementChild as HTMLElement;
  primary.replaceWith(fresh);if(focused)fresh.focus({preventScroll:true});
 }
 // A provider frame that our frame-src policy blocks fails its live attempt. The listener only reads the event.
 private violation=(event:SecurityPolicyViolationEvent)=>{if(event.effectiveDirective==='frame-src')this.supervisor?.violation();};
 private click=(event:MouseEvent)=>{
  const control=(event.target as Element).closest<HTMLElement>('a,button');
  const play=control?.dataset.playRoute??(control?.dataset.play?titleHash(control.dataset.play)+'/play':control?.getAttribute('href'));
  const playRoute=play?parseMovieRoute(play):undefined;
  if(control&&playRoute?.play){
   const title=this.lookup(playRoute.id!);
   this.confirmedPlayback='';
   if(title?.source.type!=='archive'){
    event.preventDefault();
    this.warnBeforePlayback(control,()=>{this.confirmedPlayback=play!;if(location.hash===play){this.suspended=false;this.renderKeepingFocus();}else location.hash=play!;});return;
   }
  }
  if(control?.dataset.action==='resume-stream'||control?.dataset.action==='reload-stream'){
   const title=this.currentTitle();
   if(title?.source.type!=='archive'){
    event.preventDefault();this.confirmedPlayback='';
    this.warnBeforePlayback(control,()=>{this.confirmedPlayback=this.playbackHash();this.suspended=false;this.renderKeepingFocus();});return;
   }
  }

  // The drawer row of the episode already playing would set the address it has. The drawer closes instead, as its close button does.
  const playing=(event.target as Element).closest<HTMLElement>('.movies-drawer-row[aria-current="true"]');
  if(playing){event.preventDefault();this.closeDrawer();this.root.querySelector<HTMLElement>('[data-action="episodes"]')?.focus({preventScroll:true});return;}
  const target=(event.target as Element).closest<HTMLElement>('button');if(!target)return;
  if(target.dataset.kind){this.query='';this.genre='All';this.resetRemote();this.showSection(target.dataset.kind as MovieKind);}
  if(target.dataset.list){const id=target.dataset.list,title=this.lookup(id);this.storage.toggle(id,title?snapshotOf(title):undefined);this.redrawPlayer();within(this.root,'[data-list]').find(e=>e.dataset.list===id)?.focus({preventScroll:true});}
  if(target.dataset.playRoute)location.hash=target.dataset.playRoute;
  if(target.dataset.play)location.hash=titleHash(target.dataset.play)+'/play';
  if(target.dataset.season)this.pickSeason(Number(target.dataset.season));
  if(target.dataset.drawerSeason)this.pickDrawerSeason(Number(target.dataset.drawerSeason));
  if(target.dataset.titleSeason&&this.route.id)void this.loadDrawerSeason(this.route.id,Number(target.dataset.titleSeason));
  const server=STREAM_PROVIDERS.find(provider=>provider.id===target.dataset.server);if(server)this.switchProvider(server.id);
  switch(target.dataset.action){case 'search':{this.kind='all';this.genre='All';if(location.hash!=='#/movies'){this.focusSearch=true;location.hash='#/movies';}else{this.render();this.searchFocus();}break;}case 'catalog-page':void this.fetchCatalog(Number(target.dataset.page));break;case 'retry-rails':this.retryRails();break;case 'retry-search':void this.fetchCatalog(this.remoteRequestedPage);break;case 'retry-title':if(this.route.id)void this.loadTitle(this.route.id,this.route.season,true);break;case 'next-server':this.switchProvider(nextServer(this.providerId));break;case 'retry-servers':this.retryServers();break;case 'episodes':this.openDrawer(target);break;case 'close-drawer':this.closeDrawer();this.root.querySelector<HTMLElement>('[data-action="episodes"]')?.focus({preventScroll:true});break;case 'reload-stream':this.stopVideo();this.suspended=false;this.renderKeepingFocus();break;case 'study':this.pause();this.study();break;case 'retry':void this.load();break;case 'play-next':this.playNext();break;case 'cancel-next':this.cancelNext(true);break;case 'fullscreen':void this.toggleFullscreen();break;case 'resume-stream':this.suspended=false;this.renderKeepingFocus();break;case 'reset':this.query='';this.genre='All';this.resetRemote();this.showSection('all');break;case 'clear':this.storage.clear();this.render();this.root.querySelector<HTMLElement>('[data-action="clear"]')?.focus();break;}
 };
 // A section is a route. The current section re-renders in place; any other one changes the address, and navigate() shows it.
 private showSection(kind:MovieKind){
  if(location.hash===kindHash(kind)){this.render();this.root.scrollTop=0;this.root.querySelector<HTMLElement>('h1')?.focus({preventScroll:true});}
  else{this.homeNavigation=true;location.hash=kindHash(kind);}
 }
 // A pick by the user starts a new playback session on that server. A failover moves on inside the session, so its budget counts across servers.
 private switchProvider(providerId:StreamProviderId,manual=true){
  if(this.currentTitle()?.source.type==='archive'||this.confirmedPlayback!==this.playbackHash())return;
  if(providerId===this.providerId)return;
  this.suspended=false;
  if(manual){
   const title=this.currentTitle();
   this.pickedServer=providerId;this.pickedKey=title?mediaKey(title,this.route):undefined;this.exhausted=false;this.failoverNote='';
   this.stopVideo();this.redrawPlayer();
   this.root.querySelector<HTMLElement>(`[data-server="${providerId}"]`)?.focus({preventScroll:true});
  }else{
   // The redraw rebuilds the episode controls, so an open drawer is shown again on the new ones.
   const open=!!this.root.querySelector<HTMLDialogElement>('dialog.movies-drawer')?.open;
   this.releaseMedia();
   this.keepingFocus(()=>{this.redrawPlayer();const drawer=this.root.querySelector<HTMLDialogElement>('dialog.movies-drawer');if(open&&drawer)openSheet(drawer);});
  }
 }
 private retryServers(){
  const title=this.currentTitle();if(!title)return;
  clearFailures(mediaKey(title,this.route));
  this.pickedServer=undefined;this.pickedKey=undefined;this.exhausted=false;this.failoverNote='';this.suspended=false;
  this.stopVideo();this.redrawPlayer();
  this.root.querySelector<HTMLElement>('.movies-screen')?.focus({preventScroll:true});
 }
 private failOver(next:StreamProviderId,failed:StreamProviderId){
  this.failoverNote=`Server ${serverNumber(failed)} ${this.failureWording()}. Trying Server ${serverNumber(next)}…`;
  this.switchProvider(next,false);
 }
 // A server that had played stopped. One that never reported playback did not start. The failure is reported while its attempt is still current.
 private failureWording(){return this.supervisor?.played?'stopped':"didn't start";}
 // Every automatic attempt has failed, so the panel offers Try again.
 private exhaust(){this.exhausted=true;this.failoverNote='';this.keepingFocus(()=>this.redrawPlayer());}
 // The first sign of playback remembers the server for the next title and clears the failover line.
 private worked(provider:StreamProviderId){
  this.storage.setProvider(provider);
  this.failoverNote='';this.setFailoverText();
 }
 private supervisorEvents():SupervisorEvents{
  return {
   status:(state,provider)=>this.attemptStatus(state,provider),
   switchTo:(next,failed)=>this.failOver(next,failed),
   slow:provider=>this.showSlow(provider),
   exhausted:()=>this.exhaust(),
   working:provider=>this.worked(provider),
  };
 }
 // A provider frame starts an attempt in the playback session. Its load and its messages drive the supervisor, which reports back here.
 private bindAttempt(frame:HTMLIFrameElement,provider:StreamProviderId){
  const key=this.progressKey;
  let supervisor=this.supervisor;
  if(!supervisor||this.supervisorKey!==key){supervisor?.stop();supervisor=new PlaybackSupervisor(key,providerOrder(this.storage.data.provider),this.supervisorEvents());this.supervisor=supervisor;this.supervisorKey=key;}
  this.frameStart=this.storage.data.progress[key]??0;this.lifeShown=false;
  frame.addEventListener('load',()=>{if(this.frame===frame)this.supervisor?.loaded();});
  supervisor.start(provider,this.pickedServer===provider&&this.pickedKey===key);
 }
 // The overlay covers the screen only while an attempt connects, so a loaded provider page takes its own clicks. The server buttons carry each attempt's state.
 private attemptStatus(state:AttemptState,provider:StreamProviderId){
  const overlay=this.root.querySelector<HTMLElement>('.movies-connecting');
  if(overlay)overlay.hidden=state!=='connecting';
  if(state==='connecting'){this.clearSlow();this.setServerState(provider,'trying');return;}
  // A server that cannot report never shows that it plays, so it stays idle once its frame has loaded.
  if(state==='loaded'){this.setServerState(provider,streamProvider(provider).signals==='none'?'idle':'trying');return;}
  this.clearSlow();
  if(state==='ready'||state==='playing'){
   this.setServerState(provider,'working');this.showLife(provider);
   // A manual pick that comes back is working, so the line that said it failed no longer applies.
   if(this.supervisor?.manual){this.failoverNote='';this.setFailoverText();}
   return;
  }
  if(state==='failed'){
   this.setServerState(provider,'failed');
   // A pick the user made does not switch by itself, so its failure names the next server to try.
   if(this.supervisor?.manual){this.failoverNote=`Server ${serverNumber(provider)} ${this.failureWording()}. Try Server ${serverNumber(nextServer(provider))}.`;this.setFailoverText();}
   return;
  }
  if(state==='idle'){const button=this.root.querySelector<HTMLElement>(`[data-server="${provider}"]`);if(button?.dataset.state==='trying')button.dataset.state='idle';}
 }
 // The Resumed pill waits for the first sign of life, and never shows for a server that cannot resume.
 private showLife(provider:StreamProviderId){
  if(this.lifeShown)return;
  this.lifeShown=true;
  if(!this.suspended&&streamProvider(provider).resume!=='none'&&this.frameStart>=START_THRESHOLD)this.showResumePill(this.frameStart);
 }
 // A server that cannot report would look slow for good, so it never gets the prompt. A stale event for another server is ignored.
 private showSlow(provider:StreamProviderId){
  if(provider!==this.providerId||streamProvider(provider).signals==='none'||this.root.querySelector('.movies-slow-row'))return;
  // The prompt's button runs the next-server action, which switches by hand as the server buttons do.
  this.root.querySelector('.movies-servers')?.insertAdjacentHTML('beforebegin',`<div class="movies-slow-row" role="status"><p class="movies-slow">Taking a while? Try another server.</p><button class="ui-btn secondary small" data-action="next-server">Try Server ${serverNumber(nextServer(provider))}</button></div>`);
 }
 // The prompt leaves with its attempt, and with the media that carried it.
 private clearSlow(){this.root.querySelector('.movies-slow-row')?.remove();}
 private setServerState(provider:StreamProviderId,state:string){const button=this.root.querySelector<HTMLElement>(`[data-server="${provider}"]`);if(button)button.dataset.state=state;}
 private setFailoverText(){const line=this.root.querySelector<HTMLElement>('.movies-failover');if(line)line.textContent=this.failoverNote;}
 private searchFocus(){const search=this.root.querySelector<HTMLInputElement>('#movies-search');search?.focus({preventScroll:true});search?.scrollIntoView({block:'center'});}
 private input=(event:Event)=>{
  if((event.target as HTMLElement).id!=='movies-search')return;
  // Text still being composed is not a query yet. The composed text is searched when the composition ends.
  if((event as InputEvent).isComposing)return;
  this.searchTyped(event.target as HTMLInputElement);
 };
 private compositionEnd=(event:CompositionEvent)=>{if((event.target as HTMLElement).id==='movies-search')this.searchTyped(event.target as HTMLInputElement);};
 // The typed text is the query. The page is redrawn around the field, which keeps its node, its focus and its caret.
 private searchTyped(input:HTMLInputElement){
  this.query=input.value;
  const request=this.remoteRequest();
  // A page with no request drops its results. A request the page already wants keeps running. A new one stops the old, and a search waits out its debounce.
  if(!request)this.resetRemote();
  else if(request.key!==this.remoteWanted){this.stopRemote();this.remoteWanted=request.key;this.remoteLoading=true;this.searchTimer=setTimeout(()=>void this.fetchCatalog(1),request.family==='q'?280:0);}
  const top=this.root.scrollTop;this.refreshBrowse();this.root.scrollTop=top;
 }
 private change=(event:Event)=>{
  const input=event.target as HTMLSelectElement;
  if(input.id==='movies-auto-next'){const value=(event.target as HTMLInputElement).checked;this.preferences.setAutoNext(value);if(!value)this.cancelNext();}
  if(input.id==='movies-genre'){
   this.genre=input.value;
   const request=this.remoteRequest();
   if(!request)this.resetRemote();
   // A genre that starts a request renders with its loading status. Otherwise the page re-renders with the titles it has.
   if(request&&request.key!==this.remoteWanted)void this.fetchCatalog(1);
   else this.renderBrowseState();
  }
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
  // The change event for entering can arrive late, even after an exit, so a granted request records the state itself.
  // An exit is then still recognised, and cancels the Up next countdown.
  if(this.fullscreenElement()){this.wasFullscreen=true;this.fullscreenTarget=screen;}
  if(!screen.isConnected||this.suspended||document.hidden)await this.exitFullscreen();
 }
 private fullscreenChange=()=>{
  const active=!!this.fullscreenElement();
  if(active)this.fullscreenTarget=this.fullscreenElement();
  if(this.wasFullscreen&&!active){const intentional=this.intentionalExit;this.intentionalExit=false;if(!intentional)this.browserExit();}
  this.wasFullscreen=active;
  const button=this.root.querySelector('[data-action="fullscreen"]');button?.setAttribute('aria-pressed',String(this.screenFullscreen()));
 };
 // The browser consumed the Escape that left fullscreen, so the exit stands in for it, as the games' browser exit does. An open episode
 // drawer takes it as its cancel. Otherwise Up next is cancelled, and Study opens on its next article unless the page is hidden or
 // suspended, the view is disposed, or the screen has left the page.
 private browserExit(){
  if(this.warning?.open){const cancel=new Event('cancel',{cancelable:true});this.warning.dispatchEvent(cancel);return;}
  const drawer=this.root.querySelector<HTMLDialogElement>('dialog.movies-drawer');
  if(drawer?.open){const cancel=new Event('cancel',{cancelable:true});if(drawer.dispatchEvent(cancel))drawer.close();return;}
  this.cancelNext(true);
  if(this.disposed||this.suspended||document.hidden||!this.fullscreenTarget?.isConnected)return;
  this.pause();this.study(true);
 }
 private refreshPlayer(title:Title){
  const screen=this.root.querySelector<HTMLElement>('.movies-screen'),player=screen?.parentElement;if(!screen||!player)return;
  const template=document.createElement('template');template.innerHTML=this.player(title);const next=template.content.firstElementChild!;
  const nextFrame=next.querySelector('iframe'),nextVideo=next.querySelector('video');
  // The screen stays on the page, so its connecting overlay takes the server name of the player that replaces it.
  const label=screen.querySelector('.movies-connecting p'),freshLabel=next.querySelector('.movies-connecting p');if(label&&freshLabel)label.textContent=freshLabel.textContent;
  const preserveFrame=!!this.frame&&!!nextFrame&&this.frame.dataset.provider===nextFrame.dataset.provider&&this.frame.dataset.mediaKey===nextFrame.dataset.mediaKey;
  // A local video keeps its element while its file and episode are the same, as a provider frame does, so it goes on from where it is.
  const preserveVideo=!!this.video&&!!nextVideo&&this.video.getAttribute('src')===nextVideo.getAttribute('src')&&this.video.dataset.mediaKey===nextVideo.dataset.mediaKey;
  if(preserveFrame)this.frame!.title=nextFrame!.title;
  else if(!preserveVideo){this.releaseMedia();screen.querySelector('.movies-media')!.replaceChildren(...next.querySelector('.movies-media')!.childNodes);}
  // A slow prompt on a frame that stays belongs to the attempt that is still running, so it stays too.
  for(const child of [...player.children])if(child!==screen&&!(preserveFrame&&child.classList.contains('movies-slow-row')))child.remove();
  let before=true;for(const child of [...next.children]){if(child.classList.contains('movies-screen'))before=false;else if(before)player.insertBefore(child,screen);else player.append(child);}
  if(!preserveFrame&&!preserveVideo)this.bindPlayer();this.renderDetailError();this.fullscreenChange();
 }
 // The one write path for playback progress. A finished title saves 0, and an early report never replaces a saved resume point.
 private saveProgress(time:number){
  if(!this.progressKey)return;
  const finished=this.ended,at=finished?0:time;
  if(keepsResume(this.storage.data.progress[this.progressKey],at,finished))return;
  // A native video reports its own duration once its metadata has loaded. A provider frame reports one in its messages.
  const video=this.video,duration=video?(Number.isFinite(video.duration)&&video.duration>0?video.duration:undefined):this.frameDuration;
  const title=this.route.id?this.lookup(this.route.id):undefined;
  this.storage.progress(this.progressKey,at,duration,title?snapshotOf(title):undefined);
  this.lastSave=Date.now();
 }
 private rearm(time:number,duration:number){if(this.ended&&Number.isFinite(duration)&&duration>0&&duration-time>5){this.ended=false;this.cancelNext();}}
 private episodeEnded(){
  const title=this.route.id?this.lookup(this.route.id):undefined;if(this.suspended||this.ended||!this.route.play||!title)return;
  this.ended=true;this.frameTime=0;this.saveProgress(0);
  // A finished film is saved at 0 and leaves Continue watching. Only an episode goes on to Up next.
  if(title.kind!=='tv')return;
  const next=nextEpisode(title,this.route.season!,this.route.episode!);if(!next||!this.preferences.autoNext())return;
  this.cancelNext();const generation=this.countdownGeneration;
  const show=()=>{
   if(generation!==this.countdownGeneration||!this.ended||!this.preferences.autoNext())return;
   const overlay=this.root.querySelector<HTMLElement>('.movies-next');if(!overlay)return;
   this.nextHash=`${titleHash(title.id)}/season/${next.season}/episode/${next.episode}/play`;
   const label=`Up next: S${next.season} · E${next.episode}${next.name?' — '+next.name:''}`;
   overlay.innerHTML=`<h2>${escape(label)}</h2><p class="movies-next-countdown">Playing in 10</p><div class="movies-next-actions"><button class="ui-btn primary" data-action="play-next">Play now</button><button class="ui-btn secondary" data-action="cancel-next">Cancel</button></div><div class="movies-next-bar" aria-hidden="true"><span style="width: 100%"></span></div>`;overlay.hidden=false;this.tabbar.dataset.hidden='true';
   const announcement=this.root.querySelector('.movies-next-announcement');if(announcement)announcement.textContent=label+'. Playing in 10 seconds.';
   // The island stays shown only while a keyboard focus is inside it. Any other focus there would sit on a hidden tab.
   if(!this.tabbar.querySelector(':focus-visible')){const before=document.activeElement;this.nextReturn=before===this.root||before===document.body?undefined:before;overlay.querySelector<HTMLElement>('[data-action="play-next"]')?.focus({preventScroll:true});}
   let seconds=10;this.countdown=setInterval(()=>{if(!this.preferences.autoNext()){this.cancelNext();return;}seconds--;if(seconds<=0)this.playNext();else {const count=overlay.querySelector('.movies-next-countdown');if(count)count.textContent='Playing in '+seconds;const bar=overlay.querySelector<HTMLElement>('.movies-next-bar>span');if(bar)bar.style.width=`${seconds*10}%`;}},1000);
  };
  if(this.fullscreenElement()&&(this.fullscreenElement()===this.frame||this.fullscreenElement()===this.video))void this.exitFullscreen().then(show);else show();
 }
 private cancelNext(focus=false){
  this.countdownGeneration++;clearInterval(this.countdown);this.countdown=undefined;this.nextHash='';
  const back=this.nextReturn;this.nextReturn=undefined;
  const overlay=this.root.querySelector<HTMLElement>('.movies-next');const visible=overlay&&!overlay.hidden;if(overlay)overlay.hidden=true;if(visible)this.hideTabbar.reset();
  const announcement=this.root.querySelector('.movies-next-announcement');if(announcement)announcement.textContent='';
  if(focus&&visible)(this.isPageControl(back)?back:this.root.querySelector<HTMLElement>('.movies-screen'))?.focus({preventScroll:true});
 }
 private playNext(){const hash=this.nextHash;this.cancelNext();if(hash&&this.preferences.autoNext()){this.confirmedPlayback='';location.hash=hash;}}
 // A control of the page itself. The root, a provider frame and a video take their own keys, so focus never rests on them.
 private isPageControl(target:EventTarget|null|undefined):target is HTMLElement{
  return target instanceof HTMLElement&&target!==this.root&&this.root.contains(target)&&!(target instanceof HTMLIFrameElement||target instanceof HTMLVideoElement);
 }
 // Not every browser applies scroll-padding-top to focus scrolling, so once the browser has scrolled, a focused control still
 // under the sticky header moves clear of it. The header's own controls, the root, players and dialogs are left alone.
 private revealFocus=(event:FocusEvent)=>{
  const target=event.target;
  if(!this.isPageControl(target)||target.closest('.movies-top,dialog'))return;
  // The browser's own focus scroll is done by the next task. The check runs then, not on an animation frame: WebKit can run
  // a frame long after it was asked for, and a late check would move the page after the reader has scrolled on.
  window.setTimeout(()=>{
   const header=this.root.querySelector('.movies-top');
   if(document.activeElement!==target||!header)return;
   const bottom=header.getBoundingClientRect().bottom,box=target.getBoundingClientRect();
   if(box.top<bottom&&box.height<this.root.clientHeight-bottom)this.root.scrollTop-=bottom-box.top;
  },0);
 };
 private keydown=(event:KeyboardEvent)=>{if(event.key==='Enter'&&this.nextHash&&!(event.target as Element).closest('a,button,input,select,textarea,dialog')){event.preventDefault();this.playNext();}};
 pause(){this.dismissWarning();this.confirmedPlayback='';this.suspended=true;this.cancelNext();this.closeDrawer();this.clearResumePill();this.endSession();if(this.video){if(this.videoPlayed(this.video))this.saveProgress(this.video.currentTime);this.video.pause();}if(this.frame){if(this.frameReported)this.saveProgress(this.frameTime);this.frame.remove();this.frame=undefined;const media=this.root.querySelector('.movies-media');if(media)media.innerHTML='<div class="movies-player-unavailable"><h2>Stream paused</h2><p>The external player was unloaded while you read or left the tab.</p><button class="ui-btn primary" data-action="resume-stream">Resume stream</button></div>';}}
 // Ends the stream and its playback session: the watchdogs stop, and the failover budget and the tried servers go with them.
 // WebKit fires timeupdate only about every 250 ms, so a video can play and stop before the first one. Its played ranges still count.
 private videoPlayed(video:HTMLVideoElement){if(hasPlayed(video))this.videoReported=true;return this.videoReported;}
 private stopVideo(){this.endSession();this.closeDrawer();this.releaseMedia();}
 // Takes the stream and the local video off the screen. The session stays, so a failover or a redraw carries its budget on.
 // It leaves the playback session running: a new title or episode ends the session through stopVideo on navigation.
 private releaseMedia(){this.cancelNext();this.clearResumePill();this.clearSlow();if(this.frame&&this.frameReported)this.saveProgress(this.frameTime);this.frame?.remove();this.frame=undefined;if(this.video){const video=this.video;if(this.videoPlayed(video))this.saveProgress(video.currentTime);this.video=undefined;video.pause();video.removeAttribute('src');video.load();}}
 private endSession(){this.supervisor?.stop();this.supervisor=undefined;this.supervisorKey='';}
 dispose(){this.dismissWarning();this.disposed=true;this.disposeRails();this.disposeImages();this.hideTabbar.dispose();this.yieldGuard.disconnect();this.abort.abort();this.railsRequest++;this.railsAbort?.abort();for(const section of Object.values(this.sectionRails)){section.request++;section.abort?.abort();}this.metadataAbort?.abort();this.detailAbort?.abort();this.searchRequest++;this.detailRequest++;this.drawerRequest++;this.drawerAbort?.abort();clearTimeout(this.searchTimer);this.stopVideo();document.removeEventListener('visibilitychange',this.onVisibility);document.removeEventListener('fullscreenchange',this.fullscreenChange);document.removeEventListener('webkitfullscreenchange',this.fullscreenChange);window.removeEventListener('message',this.providerMessage);window.removeEventListener('storage',this.onStorage);document.removeEventListener('securitypolicyviolation',this.violation);this.root.remove();document.body.classList.remove('movies-active');}
}
