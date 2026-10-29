import './style.css';
import {uiIcon} from '../ui/icons';
import {bindRails,updateRails} from '../ui/rails';
import {markImages,watchImages} from '../ui/images';
import {autoHideTabbar} from '../ui/tabbar';
import mauriMark from '../assets/mauri-mark.svg?raw';
import {frameSource,FRAME_SANDBOX,FRAME_ALLOW,STREAM_PROVIDERS,START_THRESHOLD,streamProvider,providerSignal} from './provider';
import type {StreamProviderId} from './provider';
import {filterTitles,kindHash,licensedSource,mediaKey,nextEpisode,parseCatalog,parseMovieRoute,parseRails,titleHash} from './model';
import type {CastMember,Catalog,Episode,MovieKind,MovieRoute,Rail,Season,Title} from './model';
import {MovieStorage,snapshotOf,keepsResume} from './storage';
import type {ContinueItem,TitleSnapshot} from './storage';
import {formatClock,formatRuntime,initials} from './format';
import {cachedJson,SEARCH_STALE} from './query';
import {movieJson,movieNetworkMessage,MovieNetworkError} from './network';
const base=import.meta.env.BASE_URL;
const escape=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
// Absolute same-origin URLs also resolve correctly inside CSS custom properties in /assets/ stylesheets.
const asset=(v:string)=>v.startsWith('https://')?v:new URL(base+v,document.baseURI).href;
const cardMeta=(t:Title)=>[t.year?String(t.year):'',t.kind==='tv'?'Series':'Movie'].filter(Boolean).join(' · ');
// A title saved in storage carries what a card or a Continue watching tile needs. Genres, overview and seasons arrive when the title loads.
const fromSnapshot=(s:TitleSnapshot):Title=>({id:s.id,kind:s.kind,name:s.name,year:s.year,genres:[],overview:'',poster:s.poster,backdrop:s.backdrop,seasons:[]});
// The title page while its details load. A play route shows it until its season has loaded, so the player is built only once.
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
interface SectionRails {rails:Rail[];error:boolean;requested:boolean;request:number;abort?:AbortController}
// A full-catalog request: a search of two characters or more, or a section's genre. Its key names it, and its family says whether it is a search (q) or a genre (g).
interface RemoteRequest {family:'q'|'g';key:string;params:Record<string,string>}
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
 private video?:HTMLVideoElement;
 private frame?:HTMLIFrameElement;
 private preferExternal=false;
 private providerId:StreamProviderId='framextv';
 private frameTime=0;
 // The duration the provider frame last reported for the media on screen. A native video reads its own.
 private frameDuration?:number;
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
 // The not-found page is on screen for an invalid route. A valid route clears it, and a late answer never replaces it.
 private notFound=false;
 private rails:Rail[]=[];
 private railsError=false;
 private railsRequest=0;
 private railsAbort?:AbortController;
 // Set once the home has asked for its rails. A failed request is asked again only through Retry.
 private railsRequested=false;
 // Each section has its own rails, asked the first time it shows.
 private sectionRails:Record<'movie'|'tv',SectionRails>={movie:{rails:[],error:false,requested:false,request:0},tv:{rails:[],error:false,requested:false,request:0}};
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
 constructor(container:HTMLElement,private study:()=>void,private reducedMotion:boolean,origin?:DOMRect,private preferences:PlaybackPreferences={autoNext:()=>true,setAutoNext:()=>{}}){
  this.root.className='movies-view';this.root.setAttribute('aria-label','Movies and TV');this.root.tabIndex=-1;
  container.replaceChildren(this.root);document.body.classList.add('movies-active');
  this.root.addEventListener('error',event=>{const image=event.target;if(image instanceof HTMLImageElement){const failed=image.getAttribute('src');if(failed)this.failedImages.add(failed);if(image.dataset.poster&&image.src!==image.dataset.poster){image.src=image.dataset.poster;delete image.dataset.poster;}else if(image.classList.contains('movies-detail-art')){image.closest('.movies-detail-inner')?.classList.add('movies-detail-bare');image.remove();}else image.style.opacity='0';}},{capture:true});
  this.root.addEventListener('load',event=>{const image=event.target;if(image instanceof HTMLImageElement&&image.matches('img.ui-card-img,img.ui-hero-backdrop')){const src=image.getAttribute('src');if(src)this.seenImages.add(src);}},{capture:true});
  this.root.addEventListener('click',this.click);
  this.root.addEventListener('click',event=>{
   const control=(event.target as Element).closest<HTMLElement>('a[href^="#"],button');
   if(control instanceof HTMLAnchorElement)this.lastActivatedHref=control.getAttribute('href')||'';
   // On a browse page the control pressed records the card or tile it belongs to, so Back can return focus there. A control without a title records none.
   if(control&&!this.route.id){this.returnFocus=control.dataset.title||'';this.returnRail=control.dataset.title?control.closest<HTMLElement>('[data-rail]')?.dataset.rail||'':'';}
  },{capture:true});
  this.root.addEventListener('input',this.input);
  this.root.addEventListener('change',this.change);
  this.root.addEventListener('keydown',this.keydown);
  this.root.addEventListener('focusin',this.revealFocus);
  this.disposeImages=watchImages(this.root);
  this.tabbar.setAttribute('aria-label','Mobile movies navigation');
  this.disposeRails=bindRails(this.root,()=>this.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Movies scrolls inside its own overlay, so the island's hide-on-scroll follows that scroller rather than the window.
  this.hideTabbar=autoHideTabbar(this.tabbar,this.root);
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
   const pending=!!this.route.id&&this.needsDetails(this.route);this.pendingTitle=pending;this.renderKeepingFocus();
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
   if(id!==this.searchRequest||this.remoteRequest()?.key!==request.key)return;
   const parsed=parseCatalog({titles:data.titles,source:'tmdb'});
   this.remoteTitles=parsed.titles;this.remoteKey=request.key;
   for(const title of parsed.titles)this.dynamicIds.add(title.id);
   this.remotePage=Number.isInteger(data.page)?data.page:page;
   this.remotePages=Number.isInteger(data.totalPages)?Math.max(1,Math.min(500,data.totalPages)):1;
   this.remoteLoading=false;this.renderBrowseState();
  }catch(error){
   if(id!==this.searchRequest||this.remoteRequest()?.key!==request.key||controller.signal.aborted)return;
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
   state.rails=rails;state.error=rails.length===0;
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
 private async loadTitle(id:string,season?:number){
  const request=++this.detailRequest;this.detailAbort?.abort();const controller=this.detailAbort=new AbortController();this.pendingTitle=true;this.detailError='';if(this.screenFullscreen())this.renderDetailError();else this.render();
  try{
   const params=new URLSearchParams({id});if(season)params.set('season',String(season));
   const {data}=await cachedJson('/api/movies?'+params,controller.signal);const parsed=parseCatalog({titles:[data.title],source:'tmdb'});const title=parsed.titles[0];
   if(request!==this.detailRequest||this.route.id!==id)return;
   if(!title)throw new Error('Title details are unavailable.');
   const previous=this.catalog.titles.find(t=>t.id===id);
   if(previous)for(const item of title.seasons)if(!item.episodes.length)item.episodes=previous.seasons.find(s=>s.number===item.number)?.episodes??[];
   this.catalog={...this.catalog,titles:[...this.catalog.titles.filter(t=>t.id!==id),title]};
   this.dynamicIds.add(id);this.loadedDetails.add(id);
   if(season)this.loadedSeasons.add(id+':s'+season);
   else for(const item of title.seasons)if(item.episodes.length)this.loadedSeasons.add(id+':s'+item.number);
   this.pendingTitle=false;this.renderKeepingFocus();
  }catch(error){
   if(request!==this.detailRequest||this.route.id!==id)return;
   if(controller.signal.aborted)return;
   this.pendingTitle=false;this.detailError=error instanceof MovieNetworkError&&error.status===404?'':movieNetworkMessage(error,'Title details');if(this.screenFullscreen())this.renderDetailError();else this.render();
  }
 }
 // A built-in title asks the API once, in the background, for what the API adds. Nothing shows while the request runs, and a failure leaves
 // the bundled page as it is. The page re-renders only while it still shows this title and is not playing, and keeps its focus.
 private async enrichTitle(id:string){
  if(this.askedBuiltIn.has(id)||!this.bundledIds.has(id))return;
  this.askedBuiltIn.add(id);
  try{
   const {data}=await cachedJson('/api/movies?'+new URLSearchParams({id}),this.abort.signal);
   const detail=parseCatalog({titles:[data.title],source:'tmdb'}).titles[0];
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
  const input=this.root.querySelector<HTMLInputElement>('#movies-search');
  const focusedInput=!!input&&input===document.activeElement;
  const start=input?.selectionStart,top=this.root.scrollTop;
  // The focused control is recorded by what it is before the render, and the control that matches it takes focus after the render.
  const active=document.activeElement instanceof HTMLElement&&document.activeElement!==this.root&&this.root.contains(document.activeElement)?document.activeElement:undefined;
  const finder=active&&finderFor(active),region=active?regionOf(active):'';
  this.render();
  if(focusedInput){const next=this.root.querySelector<HTMLInputElement>('#movies-search');next?.focus({preventScroll:true});if(start!==null&&start!==undefined)next?.setSelectionRange(start,start);}
  else if(active)this.restoreFocus(finder?finder(this.root):[],region);
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
  this.applyRoute(hash);
  // Every route shows the island again, and scroll travel counts from wherever the new page lands.
  this.hideTabbar.reset();
 }
 private applyRoute(hash:string){
  const next=parseMovieRoute(hash);
  if(!next){this.route={play:false};this.notFound=true;this.render();return;}
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
  this.stopVideo();this.suspended=false;this.preferExternal=false;this.route=next;this.notFound=false;
  // A section change resets its genre, as the section buttons do. The typed query stays.
  const kind=next.id?this.kind:(next.kind??'all');if(kind!==this.kind)this.genre='All';this.kind=kind;
  // A page that is not a title brings its full-catalog request in line with its query and genre.
  if(!next.id)this.syncRemote();
  const title=this.catalog.titles.find(t=>t.id===next.id);
  // A route whose title details are not loaded yet is pending before the page renders, so a play route shows the loading text, not a player.
  const pending=this.ready&&this.needsDetails(next);this.pendingTitle=pending;
  if(inPlace&&title)this.refreshPlayer(title);else this.render();
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
 // The image a card, tile or hero requests: its first candidate that has not failed in this view, with the next usable candidate as the
 // fallback that the error listener switches to. When every candidate failed there is no image, so the placeholder shows alone.
 private artImage(candidates:string[],className:string,attributes:string){
  const usable=[...new Set(candidates)].filter(url=>!this.failedImages.has(url));
  if(!usable.length)return '';
  const [src,fallback]=usable;
  return `<img class="${className}${this.seenImages.has(src)?' is-seen':''}"${fallback?` data-poster="${escape(fallback)}"`:''} src="${escape(src)}" ${attributes}>`;
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
 private footer(){return `<footer class="movies-footer" aria-label="Credits and privacy"><strong>Your screen. Your privacy.</strong><p>My list and playback progress stay on this device. Full-catalog searches go through QCC’s metadata service to TMDB. Real posters and backdrops load from TMDB; its image server receives ordinary image requests.</p><p>${this.catalog.source==='tmdb'?`${this.catalog.attributionLogo?`<img class="movies-tmdb" src="${asset(this.catalog.attributionLogo)}" alt="TMDB" width="100" height="40">`:''}This product uses the TMDB API but is not endorsed or certified by TMDB.`:'Starter selection · Real title artwork from TMDB. Original summaries. Ratings are not supplied. This is not a live trending feed.'}</p>${this.catalog.updated?`<p>Catalog snapshot: ${escape(this.catalog.updated)}</p>`:''}<p>Streaming is provided by an external service. QCC does not verify its availability or distribution rights. Movies are excluded from game offline downloads.</p><button data-action="clear">Clear my list &amp; playback progress</button><p class="movies-storage" role="status">${this.storage.durable?'Saved only on this device.':'Browser storage is unavailable. Changes last only for this visit.'}</p></footer>`;}
 private browse(){
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
  return `${head}<div class="movies-browse">${this.filterBar()}<div id="movies-results">${body}</div>${this.footer()}</div>`;
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
  const status=state.error?'<p class="movies-rails-status" role="status" tabindex="-1">Showing the starter selection. The full catalog is unavailable right now. <button class="ui-btn secondary small" data-action="retry-rails">Retry</button></p>':'';
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
  const source=licensedSource(this.licenses,mediaKey(hero,route))??frameSource(hero,route);
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
  if(this.kind==='list'&&!this.savedTitles().length)return `<div class="movies-empty"><h2>Your list is empty</h2><p>Open a title and choose Add to my list to save it here.</p><button data-action="reset">Explore all titles</button></div>`;
  const count=`${filtered.length} ${filtered.length===1?'title':'titles'}`;
  // The count line announces a filtered result. An unfiltered My list shows its count in its title block instead.
  const filtering=!!this.query.trim()||this.genre!=='All';
  const body=filtered.length?`<div class="movies-results-grid ui-grid">${filtered.map(t=>this.card(t)).join('')}</div>`:`<div class="movies-empty"><h2>No titles found</h2><p>Try another title or clear your filters. ${this.kind==='list'?'My list search covers the titles saved on this device.':'Search covers this catalog snapshot only.'}</p><button data-action="reset">Explore all titles</button></div>`;
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
  const retry=this.remoteError?` <button data-action="retry-search">${genre?'Retry':'Retry search'}</button>`:'';
  const pages=answers&&this.remotePages>1?`<div class="movies-pagination"><button data-action="catalog-page" data-nav="previous" data-page="${this.remotePage-1}"${this.remotePage<=1?' disabled':''}>Previous</button><span>Page ${this.remotePage} of ${this.remotePages}</span><button data-action="catalog-page" data-nav="next" data-page="${this.remotePage+1}"${this.remotePage>=this.remotePages?' disabled':''}>Next</button></div>`:'';
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
 private renderKeepingFocus(){
  const active=document.activeElement instanceof HTMLElement&&document.activeElement!==this.root&&this.root.contains(document.activeElement)?document.activeElement:undefined;
  const finder=active&&finderFor(active),region=active?regionOf(active):'';
  const top=this.root.scrollTop;
  this.render();
  if(active)this.restoreFocus(finder?finder(this.root):[],region);
  this.root.scrollTop=top;
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
  const rows=season?.episodes.length?season.episodes.map(e=>this.episodeRow(t,season,e)).join(''):`<p class="movies-episodes-status">${this.pendingTitle?'Loading episodes…':'Episode metadata has not been included in this snapshot.'}</p>`;
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
  const name=escape(t.name),selected=this.storage.data.list.includes(t.id),season=this.shownSeason(t);
  const source=t.kind==='movie'?(licensedSource(this.licenses,mediaKey(t,this.route))??frameSource(t,this.route)):undefined;
  const saved=this.storage.data.progress[t.id]??0;
  const chips=[`<span class="ui-chip">${t.kind==='tv'?'Series':'Movie'}</span>`,t.year?`<span class="ui-chip">${escape(String(t.year))}</span>`:'',t.rating===undefined?'':`<span class="ui-chip rating">★ ${t.rating.toFixed(1)}</span>`,t.runtime?`<span class="ui-chip">${escape(formatRuntime(t.runtime))}</span>`:''].join('');
  const backdrop=this.artImage([...(t.backdrop?[asset(t.backdrop)]:[]),asset(t.poster)],'movies-detail-backdrop-img','alt="" referrerpolicy="no-referrer"');
  const poster=this.artImage([asset(t.poster)],'movies-detail-art',`alt="Poster for ${name}" width="320" height="480" referrerpolicy="no-referrer"`);
  const primary=t.kind==='movie'
   ?`<button class="movies-primary ui-btn primary" data-play="${escape(t.id)}"${source?'':' disabled aria-describedby="movies-unavailable"'}>${uiIcon('play')}Play movie</button>`
   :this.seriesPrimary(t);
  // A movie's saved position is offered as a resume point only from START_THRESHOLD seconds, as the player itself starts there.
  const resume=t.kind==='movie'&&source&&saved>=START_THRESHOLD?`<small class="movies-resume">Resume at ${escape(formatClock(saved))}</small>`:'';
  const list=`<button class="ui-btn secondary" data-list="${escape(t.id)}">${uiIcon(selected?'check':'plus')}${selected?'In my list':'Add to my list'}</button>`;
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
 private player(t:Title){
  const episode=t.seasons.find(s=>s.number===this.route.season)?.episodes.find(e=>e.number===this.route.episode);
  const source=!this.preferExternal&&(t.kind==='movie'||episode)?licensedSource(this.licenses,mediaKey(t,this.route)):undefined;
  const provider=streamProvider(this.providerId);
  const external=frameSource(t,this.route,this.providerId,this.storage.data.progress[mediaKey(t,this.route)]??0);
  const back=titleHash(t.id)+(episode?`/season/${this.route.season}/episode/${this.route.episode}`:'');
  return `<div class="movies-player"><a class="movies-detail-back" href="${escape(back)}">← Back to ${escape(t.name)}</a><p class="movies-eyebrow">QCC SCREEN / ${t.kind==='tv'?'SERIES':'CINEMA'}</p><h1 tabindex="-1">${escape(t.name)}</h1>${episode?`<h2>S${this.route.season} · E${episode.number} — ${escape(episode.name)}</h2>`:''}<div class="movies-screen" data-title="${escape(t.id)}" tabindex="-1" aria-label="Player area"><div class="movies-media">${source?`<video controls playsinline preload="metadata" referrerpolicy="no-referrer" aria-label="${escape(t.name)} player" src="${asset(source.path)}"></video>`:external?`<iframe class="movies-provider-frame" data-provider="${this.providerId}" data-media-key="${escape(mediaKey(t,this.route))}" src="${escape(external)}" title="${escape(t.name)} streaming player" sandbox="${FRAME_SANDBOX}" allow="${FRAME_ALLOW}" referrerpolicy="no-referrer" allowfullscreen></iframe>`:`<div class="movies-player-unavailable"><span aria-hidden="true">▷</span><h2>Playback unavailable</h2><p>${t.kind==='tv'&&!episode?'This episode is not in the current catalog.':'This title has no valid provider identifier.'}</p><p>Choose a title with a supported movie or series identifier.</p><a class="movies-primary" href="${escape(back)}">Return to title</a></div>`}</div><div class="movies-next" role="dialog" aria-label="Up next" hidden></div><p class="movies-next-announcement sr-only" role="status" aria-live="polite"></p><button data-action="fullscreen" class="movies-fullscreen"${this.fullscreenSupported()?'':' hidden'} aria-pressed="false">Full screen</button></div>${t.kind==='tv'?`<label class="movies-auto-next"><input type="checkbox" id="movies-auto-next"${this.preferences.autoNext()?' checked':''}> Auto next episode</label>`:''}<p id="movies-player-status" role="status">${source?`Licensed under ${escape(source.license)} · ${escape(source.credit)}. Progress stays on this device.`:external?`External player provided by ${provider.name}. It and its streaming providers receive your IP address and normal playback requests and may serve ads or use cookies. Availability and distribution rights are not verified by QCC. No account data or watchlist is sent by QCC.`:'No provider identifier is available for this title.'}</p>${external&&!source?`<div class="movies-source-controls" role="group" aria-label="Streaming source"><label for="movies-source">Source <select id="movies-source" aria-describedby="movies-source-help">${STREAM_PROVIDERS.map(item=>`<option value="${item.id}"${item.id===this.providerId?' selected':''}>${item.name}</option>`).join('')}</select></label><button data-action="next-source">Try another source</button><button data-action="reload-stream">Reload player</button><p id="movies-source-help">Player blocked or not loading? Try another source. Your episode stays selected. ${provider.resume==='none'?'This source may start at the beginning and cannot share playback progress.':'Playback position resumes where supported.'}</p></div>`:''}</div>`;
 }
 private mobileNav(){const sections:[MovieKind,string,'grid'|'film'|'tv'|'bookmark'][]=[['all','Home','grid'],['movie','Movies','film'],['tv','TV Shows','tv'],['list','My list','bookmark']];return sections.map(([kind,name,icon])=>`<button class="ui-tab" data-kind="${kind}" aria-pressed="${this.kind===kind&&!this.route.id}">${uiIcon(icon)}<span>${name}</span></button>`).join('')+`<button class="ui-tab" data-action="study">${uiIcon('study')}<span>Study</span></button>`;}
 private render(){
  const title=this.catalog.titles.find(t=>t.id===this.route.id);
  // Fullscreen on this title's own screen refreshes that screen in place, so its frame and overlay stay, even while the season is pending.
  if(this.route.play&&title&&this.screenFullscreen()&&this.root.querySelector<HTMLElement>('.movies-screen')?.dataset.title===title.id){this.refreshPlayer(title);return;}
  // Any other play route whose season is still loading shows the loading text. The player is built once its details have loaded.
  const loadingPlay=this.route.play&&!!this.route.id&&this.pendingTitle;
  this.stopVideo();
  this.root.innerHTML=this.header()+(!this.ready?`<div class="movies-empty"><h1 tabindex="-1">${this.failed?'The collection is unavailable':'Opening the collection…'}</h1><p>${this.failed?escape(this.loadError||'Connect to this site and try again. Movies are separate from the games offline pack.'):'Your next story is on its way.'}</p>${this.failed?'<button data-action="retry">Try again</button>':''}</div>`:this.notFound?`<div class="movies-empty"><h1>That page could not be found.</h1><a href="#/movies">Back to browsing</a></div>`:this.route.id?(()=>{const t=this.catalog.titles.find(t=>t.id===this.route.id);return loadingPlay?LOADING_TITLE:t?(this.route.play?this.player(t):this.detail(t)):'<div class="movies-empty"><h1>Title not found</h1><p>This title is not in the catalog snapshot.</p><a href="#/movies">Browse the collection</a></div>';})():this.browse());this.tabbar.innerHTML=this.mobileNav();this.root.append(this.tabbar);
  markImages(this.root);
  if(this.route.id&&this.pendingTitle){
   const main=this.root.querySelector<HTMLElement>('.movies-empty');
   if(main){main.querySelector('h1')!.textContent='Loading title details…';const p=main.querySelector('p');if(p)p.textContent='Fetching current movie and episode information.';}
  }
  this.renderDetailError();
  if(this.dynamicIds.size){
   const paragraphs=this.root.querySelectorAll<HTMLElement>('.movies-footer p');
   if(paragraphs[1])paragraphs[1].textContent='Search and metadata use the TMDB database. This product uses the TMDB API but is not endorsed or certified by TMDB.';
  }
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
  const retry=document.createElement('button');retry.textContent='Retry title';retry.dataset.action='retry-title';notice.append(' ',retry);
 }
 private bindPlayer(){
  this.ended=false;this.frameDuration=undefined;
  this.video=this.root.querySelector('video')??undefined;
  this.frame=this.root.querySelector('iframe')??undefined;
  if(this.frame){const title=this.catalog.titles.find(t=>t.id===this.route.id)!;this.progressKey=mediaKey(title,this.route);this.frameTime=this.storage.data.progress[this.progressKey]??0;this.lastSave=0;}
  if(this.video){
   const video=this.video,t=this.catalog.titles.find(t=>t.id===this.route.id)!;
   this.progressKey=mediaKey(t,this.route);this.lastSave=0;const key=this.progressKey;
   video.addEventListener('loadedmetadata',()=>{if(this.video!==video)return;const time=this.storage.data.progress[key];if(time&&Number.isFinite(video.duration)&&time<video.duration-2)video.currentTime=time;});
   video.addEventListener('play',()=>{if(this.video===video&&!document.hidden&&!this.root.closest('[inert]'))this.suspended=false;});
   video.addEventListener('ended',()=>{if(this.video===video)this.episodeEnded();});
   video.addEventListener('timeupdate',()=>{if(this.video!==video)return;this.rearm(video.currentTime,video.duration);if(!this.ended&&Date.now()-this.lastSave>5000)this.saveProgress(video.currentTime);});
   video.addEventListener('pause',()=>{if(this.video===video)this.saveProgress(video.currentTime);});
   video.addEventListener('error',()=>{if(this.video!==video)return;const status=this.root.querySelector('#movies-player-status');if(status){status.textContent='The local file could not be played. ';const button=document.createElement('button');button.dataset.action='external-stream';button.textContent='Use external player';status.append(button);}});
  }
  if(this.suspended||document.hidden)this.pause();
 }
 private providerMessage=(event:MessageEvent)=>{
  if(!this.frame||event.source!==this.frame.contentWindow)return;
  const signal=providerSignal(this.providerId,event.origin,event.data);if(!signal||signal.kind==='ready')return;
  if(signal.kind==='ended'){this.episodeEnded();return;}
  this.frameTime=signal.currentTime;
  if(signal.duration)this.frameDuration=signal.duration;
  // A report more than 5 seconds before the end ends a finished state. A report without a duration uses the one known for this frame.
  this.rearm(signal.currentTime,signal.duration??this.frameDuration??NaN);
  if(signal.duration&&signal.duration-signal.currentTime<=1)this.episodeEnded();
  if(signal.ended)this.episodeEnded();
  if(!this.ended&&Date.now()-this.lastSave>5000)this.saveProgress(this.frameTime);
 };
 private click=(event:MouseEvent)=>{
  const target=(event.target as Element).closest<HTMLElement>('button');if(!target)return;
  if(target.dataset.kind){this.query='';this.genre='All';this.resetRemote();this.showSection(target.dataset.kind as MovieKind);}
  if(target.dataset.list){const id=target.dataset.list,title=this.lookup(id);this.storage.toggle(id,title?snapshotOf(title):undefined);this.render();within(this.root,'[data-list]').find(e=>e.dataset.list===id)?.focus({preventScroll:true});}
  if(target.dataset.playRoute)location.hash=target.dataset.playRoute;
  if(target.dataset.play)location.hash=titleHash(target.dataset.play)+'/play';
  if(target.dataset.season)this.pickSeason(Number(target.dataset.season));
  switch(target.dataset.action){case 'search':{this.kind='all';this.genre='All';if(location.hash!=='#/movies'){this.focusSearch=true;location.hash='#/movies';}else{this.render();this.searchFocus();}break;}case 'catalog-page':void this.fetchCatalog(Number(target.dataset.page));break;case 'retry-rails':this.retryRails();break;case 'retry-search':void this.fetchCatalog(this.remoteRequestedPage);break;case 'retry-title':if(this.route.id)void this.loadTitle(this.route.id,this.route.season);break;case 'next-source':this.switchProvider(STREAM_PROVIDERS[(STREAM_PROVIDERS.findIndex(provider=>provider.id===this.providerId)+1)%STREAM_PROVIDERS.length].id,'next-source');break;case 'reload-stream':this.stopVideo();this.suspended=false;this.render();break;case 'study':this.pause();this.study();break;case 'retry':void this.load();break;case 'play-next':this.playNext();break;case 'cancel-next':this.cancelNext(true);break;case 'fullscreen':void this.toggleFullscreen();break;case 'resume-stream':this.suspended=false;this.render();break;case 'external-stream':this.preferExternal=true;this.render();break;case 'reset':this.query='';this.genre='All';this.resetRemote();this.showSection('all');break;case 'clear':this.storage.clear();this.render();this.root.querySelector<HTMLElement>('[data-action="clear"]')?.focus();break;}
 };
 // A section is a route. The current section re-renders in place; any other one changes the address, and navigate() shows it.
 private showSection(kind:MovieKind){
  if(location.hash===kindHash(kind)){this.render();this.root.scrollTop=0;this.root.querySelector<HTMLElement>('h1')?.focus({preventScroll:true});}
  else{this.homeNavigation=true;location.hash=kindHash(kind);}
 }
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
  const request=this.remoteRequest();
  // A page with no request drops its results. A request the page already wants keeps running. A new one stops the old, and a search waits out its debounce.
  if(!request)this.resetRemote();
  else if(request.key!==this.remoteWanted){this.stopRemote();this.remoteWanted=request.key;this.remoteLoading=true;this.searchTimer=setTimeout(()=>void this.fetchCatalog(1),request.family==='q'?280:0);}
  const top=this.root.scrollTop;this.render();const input=this.root.querySelector<HTMLInputElement>('#movies-search');input?.focus({preventScroll:true});if(start!==null)input?.setSelectionRange(start,start);this.root.scrollTop=top;
 };
 private change=(event:Event)=>{
  const input=event.target as HTMLSelectElement;
  if(input.id==='movies-source'){const provider=STREAM_PROVIDERS.find(provider=>provider.id===input.value);if(provider)this.switchProvider(provider.id);}
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
 // Not every browser applies scroll-padding-top to focus scrolling, so once the browser has scrolled, a focused control still
 // under the sticky header moves clear of it. The header's own controls, the root, players and dialogs are left alone.
 private revealFocus=(event:FocusEvent)=>{
  const target=event.target;
  if(!(target instanceof HTMLElement)||target===this.root||target instanceof HTMLIFrameElement||target instanceof HTMLVideoElement||target.closest('.movies-top,dialog'))return;
  requestAnimationFrame(()=>{
   const header=this.root.querySelector('.movies-top');
   if(document.activeElement!==target||!header)return;
   const bottom=header.getBoundingClientRect().bottom,box=target.getBoundingClientRect();
   if(box.top<bottom&&box.height<this.root.clientHeight-bottom)this.root.scrollTop-=bottom-box.top;
  });
 };
 private keydown=(event:KeyboardEvent)=>{if(event.key==='Enter'&&this.nextHash&&!(event.target as Element).closest('button')){event.preventDefault();this.playNext();}};
 pause(){this.suspended=true;this.cancelNext();if(this.video){this.saveProgress(this.video.currentTime);this.video.pause();}if(this.frame){this.saveProgress(this.frameTime);this.frame.remove();this.frame=undefined;const media=this.root.querySelector('.movies-media');if(media)media.innerHTML='<div class="movies-player-unavailable"><h2>Stream paused</h2><p>The external player was unloaded while you read or left the tab.</p><button class="movies-primary" data-action="resume-stream">Resume stream</button></div>';}}
 private stopVideo(){this.cancelNext();if(this.frame)this.saveProgress(this.frameTime);this.frame?.remove();this.frame=undefined;if(this.video){const video=this.video;this.saveProgress(video.currentTime);this.video=undefined;video.pause();video.removeAttribute('src');video.load();}}
 dispose(){this.disposeRails();this.disposeImages();this.hideTabbar.dispose();this.abort.abort();this.railsRequest++;this.railsAbort?.abort();for(const section of Object.values(this.sectionRails)){section.request++;section.abort?.abort();}this.metadataAbort?.abort();this.detailAbort?.abort();this.searchRequest++;this.detailRequest++;clearTimeout(this.searchTimer);this.stopVideo();document.removeEventListener('visibilitychange',this.onVisibility);document.removeEventListener('fullscreenchange',this.fullscreenChange);document.removeEventListener('webkitfullscreenchange',this.fullscreenChange);window.removeEventListener('message',this.providerMessage);this.root.remove();document.body.classList.remove('movies-active');}
}
