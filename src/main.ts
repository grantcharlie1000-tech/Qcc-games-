import './theme.css';
import './festive/christmas.css';
import {ChristmasWelcome} from './festive/welcome';
import {applyFestiveTheme,christmas,setFestiveTheme,storedFestiveTheme} from './festive/festive';
import {mountSantaBanner} from './santa/banner';
import {mountPredictionsStrip} from './predictions/library-strip';
import './movies/style.css';
import type {MoviesView} from './movies/view';
import type {MovieStorage} from './movies/storage';
import {collectionHash,entryHash,entryFromHash} from './core/navigation';
import mauriMark from './assets/mauri-mark.svg?raw';
import {uiIcon} from './ui/icons';
import {autoHideTabbar} from './ui/tabbar';
import {bindGlass} from './ui/glass';
import {createSectionNavigation} from './ui/navigation';
import {suppressNavigationUnderSheets} from './ui/modal-navigation';
import {createGameDock} from './ui/floating-controls';
import {bindGameChrome} from './ui/game-chrome';
import {openSheet} from './ui/sheet';
import {trackInputMode} from './ui/focus';
import './style.css';
import './game-viewport.css';
import './ui/arcade-sheets.css';
import {games, artUrl, loadGame} from './core/catalog';
import type {GameId, GameInstance} from './core/types';
import * as store from './core/storage';
import {playSound} from './core/audio';
import {retireOffline} from './core/offline';
import {StudyView} from './study/view';
import {integrationEnabled} from './study/whetu-integration';
import {StudyPairingClient} from './study/whetu-pairing';
import {fitGameStage} from './core/viewport-fit';
import {attachFullscreen,syncPlaySurface} from './core/play-surface';
import {AccountsClient} from './accounts/client';
import {ChatClient} from './chat/client';
import {AppsLauncher} from './apps/launcher';
import type {AppDeps,AppView} from './apps/types';
import {AccountsView} from './accounts/view';
import {LeaderboardView} from './leaderboard/view';
import {LeaderboardSidebar} from './leaderboard/sidebar';
import {SCORED_GAMES,MINESWEEPER_RANKINGS,scoredGame} from './leaderboard/shared';
import {formatScore} from './leaderboard/format';
// Predictions is in the Menu by default (VITE_QCC_PREDICTIONS=off hides it). The server stays the gate: until
// predictions_config.enabled is set, the page says it is not open yet and every action is refused.
const PREDICTIONS_MENU=import.meta.env.VITE_QCC_PREDICTIONS!=='off';
// Remains off until the separate private runtime, verified account linking,
// same-origin routing and embedded-auth browser checks have all passed.
const WHETU_STUDY=integrationEnabled(import.meta.env.VITE_QCC_WHETU_STUDY);

// Before any game mounts: games read the seasonal theme when they draw.
applyFestiveTheme();
void retireOffline();

const icon=(name:string)=>{
  const paths:Record<string,string>={menu:'<path d="M4 9.5h16M4 14.5h10"/>',back:'<path d="m12 5-7 7 7 7M5 12h14"/>',star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',pause:'<path d="M8 5v14M16 5v14"/>',play:'<path d="m8 4 12 8-12 8z"/>',restart:'<path d="M4 5v6h6M4 11a8 8 0 1 1 1 7"/>',rules:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',fullscreen:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',exitfs:'<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>'};
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.grid}</svg>`;
};
// Before the window keydown handler below, so its key presses are already counted when it runs.
trackInputMode();
const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`<main id="content"></main>
<dialog id="menu" class="ui-glass-sheet" aria-labelledby="menu-title"><form method="dialog" class="dialog-head"><h2 id="menu-title" class="menu-brand">${mauriMark}<span>Mauri Study Notes</span></h2><button class="icon-button" aria-label="Close menu">${icon('close')}</button></form><label class="search-label" for="search">Find a game</label><input id="search" type="search" placeholder="Search the ${games.length} games" autocomplete="off"><div class="setting-list menu-filters"><label><span>Favourites only</span><input type="checkbox" id="favourites-only"></label></div><div class="setting-list"><label><span>Sound</span><input type="checkbox" id="sound"></label><label><span>Reduce motion</span><input type="checkbox" id="motion"></label><label><span>Colour-blind patterns</span><input type="checkbox" id="colour"></label><label><span>Christmas theme</span><input type="checkbox" id="festive"></label></div><section class="account-menu" aria-label="Account"><p id="account-summary" class="muted"></p><button id="open-accounts" class="game-button secondary">Log in / Sign up</button><button id="logout-account" class="game-button secondary" hidden>Log out</button><button id="switch-account" class="game-button secondary" hidden>Switch account</button><button id="sync-account" class="game-button secondary" hidden>Sync now</button><p id="account-sync-status" class="muted" role="status"></p></section><button id="open-leaderboards" class="game-button secondary leaderboard-menu-button">Leaderboards</button><a id="open-election" class="game-button secondary election-menu-button" href="#/election">Election results <span class="election-menu-live">Results</span></a>${PREDICTIONS_MENU?'<a id="open-predictions" class="game-button secondary predictions-menu-button" href="#/predictions">Predictions <span class="predictions-menu-note">Free credits</span></a>':''}<button id="open-study" class="game-button secondary study-menu-button">Study Mode</button><p id="study-menu-summary" class="muted study-menu-summary"></p><p id="storage-status" class="muted"></p><p class="menu-note">${games.length} games. No ads. Optional accounts.<br>Made for a little time to play.</p></dialog>
<dialog id="rules-dialog" class="ui-glass-sheet" aria-labelledby="rules-title"><form method="dialog" class="dialog-head"><h2 id="rules-title">How to play</h2><button class="icon-button" aria-label="Close rules">${icon('close')}</button></form><p id="rules-text"></p><button class="game-button rules-done">Let’s play</button></dialog><div class="sr-only" id="announcer" aria-live="polite"></div>`;
const navigation=createSectionNavigation('app');
navigation.bar.innerHTML=`<a class="ui-tab" href="#/collection" aria-current="page">${uiIcon('games')}<span>Games</span></a><a class="ui-tab" href="#/movies/browse/movie">${uiIcon('film')}<span>Movies</span></a><a class="ui-tab" href="#/movies/browse/tv" aria-label="TV Shows">${uiIcon('tv')}<span class="tab-tv">TV Shows</span></a><a class="ui-tab" href="#/movies/list">${uiIcon('bookmark')}<span>My list</span></a><button class="ui-tab" data-action="study">${uiIcon('study')}<span>Study</span></button>`;
app.prepend(navigation.root);
suppressNavigationUnderSheets();
const content=document.querySelector<HTMLElement>('#content')!;
const menu=document.querySelector<HTMLDialogElement>('#menu')!;
const rulesDialog=document.querySelector<HTMLDialogElement>('#rules-dialog')!;
// The tab bar island hides on scroll down and shows on scroll up. It is bound once to the window; reset() runs on every route and leave.
const tabbar=autoHideTabbar(document.querySelector<HTMLElement>('.app-tabbar')!,window);
bindGlass(document.querySelector<HTMLElement>('.app-menu')!);
const preferences=store.settings();
const accounts:AccountsClient=new AccountsClient(undefined,undefined,WHETU_STUDY?{strictIdentityChanges:true,beforeIdentityCommit:nextSession=>{closeWhetuForIdentityChange();return studyPairing!.select(nextSession?.token);}}:{});
const studyPairing:StudyPairingClient|undefined=WHETU_STUDY?new StudyPairingClient(()=>accounts.session()?.token):undefined;
const launcher=new AppsLauncher({accounts,chat:new ChatClient(()=>accounts.session()?.token??null),reducedMotion:()=>preferences.reducedMotion});
void launcher.probe();
const accountView=new AccountsView(accounts,()=>{if(activeId)setPaused(true);closeWhetuForIdentityChange();},finishEntry);
const christmasWelcome=new ChristmasWelcome(()=>{
  void route().then(()=>{
    if(!activeId&&!movies&&!appView&&!study.isOpen&&!document.querySelector('dialog[open]'))document.querySelector<HTMLElement>('.game-card')?.focus({preventScroll:true});
  });
});
const leaderboards=new LeaderboardView(()=>{pausedForDialog=false;if(activeId)setPaused(true);accountView.open();});
let gameMenu:HTMLDialogElement|undefined;
let gameChrome:ReturnType<typeof bindGameChrome>|undefined;
let leaderboardSidebar:LeaderboardSidebar|undefined;
let onlyFavourites=false, search='', instance:GameInstance|undefined, activeId:GameId|undefined;
let paused=false, generation=0, autosave:number|undefined, pausedForDialog=false;
let initialized=false, resumeAfterStudy=false, focusBeforeStudy:HTMLElement|null=null, scrollBeforeStudy={x:0,y:0};
let focusLabelBeforeStudy:string|null=null;
let accountRoutePending=false,signingOut=false;
let libraryScroll={x:0,y:0};
let movies:MoviesView|undefined;
// QCC Social, QCC Chat or the Santa Tracker: one lazy view at a time, replaced when another opens.
let appView:AppView|undefined,appKind:'social'|'chat'|'santa'|'election'|'predictions'|'study'|undefined;
// The saved Movies data is one copy for the page, so it outlives each MoviesView and keeps unsaved changes across a visit to the games.
let movieStorage:MovieStorage|undefined;
let movieScroll={x:0,y:0};
let stopFitting:(()=>void)|undefined;
let detachFullscreen:(()=>void)|undefined;
const referenceGames=new Set<GameId>(['animal-stack','water-sort','color-blocks','ball-run','neon-coil','blockcraft','crossy-road','quad-clash','femboy-obby']);
// Responsive layouts fill the standard stage; scaling their whole UI would shrink labels and controls.
const fillGames=new Set<GameId>(['minesweeper','globle','corn-clicker','slipline','quadfall','fivefold','pool','claimline']);
// Shell score/best text; Claimline's integer score is its peak share in hundredths of a percent.
const metricText=(id:GameId,score:number)=>id==='claimline'||id==='femboy-obby'?formatScore(id,score):String(Math.floor(score));

function syncViewportLock(){
  const playing=!!activeId&&!document.body.classList.contains('study-active');
  document.documentElement.classList.toggle('game-viewport',playing);
  // Study and the library can scroll and zoom. Escape still opens Study; leaving play also exits fullscreen.
  syncPlaySurface(playing);
}

const study=new StudyView(()=>{
  updateStudySummary();
  if(!initialized){
    initialized=true;study.hide();showArcade();void route();
  }else study.showArticle(studyMessage(true));
}, returnFromStudy);

store.probeStorage();
function storageStatus(){
  document.querySelector('#storage-status')!.textContent=store.canRetain()
    ?'Progress and favourites are saved on this device.'
    :'Storage is blocked or full. You can play, but progress will only last for this visit.';
}
storageStatus();
function announce(text:string){document.querySelector('#announcer')!.textContent=text;}
function save():boolean {
  if(!instance||!activeId)return true;
  try {
    // A game may return undefined when it has nothing of its own to save (e.g. another tab owns it).
    const data=instance.serialize();if(data===undefined)return true;
    const durable=store.saveGame(activeId,data);storageStatus();return durable;
  }
  catch {announce('This game could not save this time.');return false;}
}
function setChromeInert(value:boolean):void{
  const chrome=document.querySelector<HTMLElement>('.app-navigation')!;
  chrome.toggleAttribute('data-view-hidden',value);
  chrome.inert=value||chrome.hasAttribute('data-sheet-hidden');
}
/** Close private documents before any potentially slow account transition. */
function closeWhetuForIdentityChange(){
  if(WHETU_STUDY&&(appKind==='study'||location.hash==='#/study'))showWhetuIdentityHold();
}
function whetuIdentityPending(){return signingOut||(accountView.root.open&&accountView.isBusy);}
function showWhetuIdentityHold(){
  generation++;leave(false);
  document.querySelector('.app-tabbar a[href="#/collection"]')?.removeAttribute('aria-current');
  document.querySelector('.app-tabbar [data-action="study"]')?.setAttribute('aria-current','page');
  content.innerHTML='<section class="game-error"><h1>Study connection paused</h1><p>Finish your account change in the account menu or sign-in screen. Return to Study afterwards to check the current connection.</p><button type="button" class="game-button secondary">Return to Study</button></section>';
  content.querySelector('button')!.addEventListener('click',()=>void route());
}
function leave(saveProgress=true){
  movies?.dispose();movies=undefined;
  appView?.dispose();appView=undefined;appKind=undefined;document.body.classList.remove('social-active','chat-active','santa-active','election-active','predictions-active','whetu-study-active');
  if(WHETU_STUDY){document.querySelector('.app-tabbar [data-action="study"]')?.removeAttribute('aria-current');document.querySelector('.app-tabbar a[href="#/collection"]')?.setAttribute('aria-current','page');}
  setChromeInert(false);
  tabbar.reset();
  detachFullscreen?.();detachFullscreen=undefined;
  leaderboardSidebar?.dispose();leaderboardSidebar=undefined;
  // Send any queued best score now instead of waiting for the next batch.
  if(!document.hidden)void leaderboards.sync.flush().catch(()=>{});
  gameChrome?.dispose();gameChrome=undefined;
  gameMenu?.close();gameMenu=undefined;
  stopFitting?.();stopFitting=undefined;
  if(saveProgress){save();void accounts.flush(false,false).catch(()=>{});if(!document.hidden)void leaderboards.sync.flush().catch(()=>{});}instance?.dispose();instance=undefined;activeId=undefined;
  clearInterval(autosave);paused=false;pausedForDialog=false;
  document.body.classList.remove('in-game');
  syncViewportLock();
}
function filterNotice(){
  if(onlyFavourites&&search)return `Favourites matching “${search}”`;
  return onlyFavourites?'Showing your favourites':`Games matching “${search}”`;
}
function library(){
  const items=games.filter(g=>(!onlyFavourites||store.favourites().includes(g.id))&&g.title.toLowerCase().includes(search.toLowerCase()));
  const filtered=onlyFavourites||search!=='';
  // The notice text is user input, so it is filled in with textContent below, never through this template.
  content.innerHTML=`<h1 class="sr-only">Mauri Study Notes · Games</h1>${filtered?'<div class="library-filter"><p class="library-filter-text"></p><button type="button" class="game-button secondary" data-action="show-all">Show all games</button></div>':''}<div class="game-grid" aria-label="Game library">${items.map(g=>`<a class="game-card" href="${entryHash(g.id)}" tabindex="0" aria-label="Play ${g.title}" style="--card:${g.color};--ink:${g.ink};--accent:${g.accent}"><h2>${g.title}</h2><span class="title-line"></span><img src="${artUrl(g.id)}" alt="" width="320" height="400" fetchpriority="${['color-blocks','water-sort'].includes(g.id)?'high':'auto'}" draggable="false"></a>`).join('')}</div>${items.length?'':'<p class="empty-library">'+(onlyFavourites?'Your favourites live here. Open a game and tap its star to add it.':'No games found. Try another name.')+'</p>'}`;
  // Predictions sits in the middle of the unfiltered library, where the election strip used to be.
  if(!filtered)mountPredictionsStrip(content.querySelector('.game-grid')!);
  // The compact Santa countdown belongs to the seasonal theme and the unfiltered library.
  if(!filtered&&christmas())mountSantaBanner(content.querySelector('.game-grid')!);
  if(filtered){
    content.querySelector<HTMLElement>('.library-filter-text')!.textContent=filterNotice();
    content.querySelector('[data-action="show-all"]')!.addEventListener('click',showAllGames);
  }
}
function showAllGames(){
  onlyFavourites=false;search='';
  document.querySelector<HTMLInputElement>('#favourites-only')!.checked=false;
  document.querySelector<HTMLInputElement>('#search')!.value='';
  library();
  content.querySelector<HTMLElement>('.game-card')?.focus();
  announce('Showing all games');
}
function setPaused(value:boolean):boolean {
  // A game may finish its asynchronous mount while a chapter is open.
  if(!value&&study.isOpen)return true;
  paused=value;
  if(!instance)return true;
  value?instance.pause():instance.resume();
  const button=document.querySelector<HTMLButtonElement>('#pause-game');
  if(button){button.innerHTML=icon(value?'play':'pause')+`<span>${value?'Keep playing':'Pause game'}</span>`;button.setAttribute('aria-label',value?'Resume game':'Pause game');}
  const overlay=document.querySelector<HTMLElement>('#pause-overlay');if(overlay)overlay.hidden=!value;
  return value?save():true;
}
function updateStudySummary(){
  if(WHETU_STUDY){document.querySelector('#study-menu-summary')!.textContent='Study with Whetū. Your NCEAStudy account is required.';return;}
  const topic=study.session.topic();
  document.querySelector('#study-menu-summary')!.textContent=topic
    ?`${topic.subtitle}. Press Esc during a game to pause and read.`
    :'Choose a chapter for this session.';
}
function showArcade(){
  app.inert=false;app.removeAttribute('aria-hidden');document.body.classList.remove('study-active');
  syncViewportLock();
}
function hideArcade(){
  // Visibility preserves the game's layout/canvas dimensions; inert removes all input.
  document.body.classList.add('study-active');app.inert=true;app.setAttribute('aria-hidden','true');
  syncViewportLock();
}
function studyMessage(saved:boolean):string {
  if(!activeId)return 'Your chapter is ready to read.';
  if(!instance)return 'Your game will remain paused while you read.';
  if(!saved)return 'Game paused. This save failed, but your game remains open in memory for this visit.';
  return store.canRetain()?'Game paused. Progress saved on this device.':'Game paused. Progress is held in memory for this visit.';
}
function openStudy(advance=false){
  movies?.pause();appView?.pause();
  if(study.isOpen)return;
  focusBeforeStudy=document.activeElement instanceof HTMLElement?document.activeElement:null;
  focusLabelBeforeStudy=focusBeforeStudy?.closest('#game-stage')?focusBeforeStudy.getAttribute('aria-label'):null;
  scrollBeforeStudy={x:scrollX,y:scrollY};
  resumeAfterStudy=!!activeId&&(!paused||pausedForDialog);
  const saved=setPaused(true); // Pause and serialize synchronously, before painting the chapter.
  pausedForDialog=false;
  if(menu.open)menu.close();if(rulesDialog.open)rulesDialog.close();if(leaderboards.root.open)leaderboards.root.close();if(gameMenu?.open)gameMenu.close();if(launcher.sheet.open)launcher.sheet.close();
  if(advance)study.advanceArticle();
  hideArcade();study.showArticle(studyMessage(saved));
}
function returnFromStudy(){
  if(!initialized)return;
  study.hide();showArcade();updateStudySummary();
  if(accountRoutePending){accountRoutePending=false;resumeAfterStudy=false;focusBeforeStudy=null;void route();return;}
  if(resumeAfterStudy&&!document.hidden)setPaused(false);
  appView?.resume();
  resumeAfterStudy=false;
  window.scrollTo(scrollBeforeStudy.x,scrollBeforeStudy.y);
  // The restored position is not the reader's scroll, so the tab bar re-bases on it.
  tabbar.reset();
  const replacement=focusLabelBeforeStudy?[...document.querySelectorAll<HTMLElement>('#game-stage [aria-label]')]
    .find(element=>element.getAttribute('aria-label')===focusLabelBeforeStudy&&!element.matches(':disabled')):undefined;
  const target=focusBeforeStudy?.isConnected&&!focusBeforeStudy.closest('dialog')?focusBeforeStudy:replacement;
  (target??document.querySelector<HTMLElement>(activeId?'#game-stage':movies?'.movies-menu':'.app-navigation [data-action="menu"]'))?.focus({preventScroll:true});
  focusBeforeStudy=null;focusLabelBeforeStudy=null;
}

function appDeps():AppDeps{
  return {accounts,reducedMotion:()=>preferences.reducedMotion,openAccounts:()=>{if(activeId)setPaused(true);accountView.open();},
    openMenu:()=>openMenu(document.querySelector('.section-navigation:not(.app-navigation) [data-action="menu"]')),
    openApps:trigger=>launcher.open(trigger??undefined),appsBadge:launcher.subscribe,refreshAppsBadge:()=>launcher.refresh()};
}
async function route(){
  if(!initialized||christmasWelcome.root.open)return;
  const username=accounts.session()?.username;
  if(username&&!study.isOpen&&!document.querySelector('dialog[open]')&&christmasWelcome.shouldShow(username)){
    // Finish entry/Study first. Do not start a game behind the welcome. Dismissal
    // routes the latest hash, including Back/Forward used while the sheet is open.
    ++generation;leave();library();christmasWelcome.open(username);return;
  }
  tabbar.reset();
  accountRoutePending=false;
  // Explicit browser/hash navigation leaves the reading view as well as the old game.
  if(study.isOpen){study.hide();showArcade();resumeAfterStudy=false;focusBeforeStudy=null;focusLabelBeforeStudy=null;}
  if(WHETU_STUDY&&location.hash==='#/study'){
    // Closing an old frame is insufficient if Back/hash navigation can reopen
    // it before pending authentication, selection or revocation has settled.
    if(whetuIdentityPending()){showWhetuIdentityHold();return;}
    if(menu.open)menu.close();
    if(appView&&appKind==='study'){appView.navigate(location.hash);return;}
    if(rulesDialog.open)rulesDialog.close();
    if(leaderboards.root.open)leaderboards.root.close();
    if(launcher.sheet.open)launcher.sheet.close();
    const token=++generation;leave();
    content.innerHTML='<div class="loading"><p>Opening Study…</p><a class="game-button secondary" href="#/collection">Back to games</a></div>';
    try{
      const {WhetuStudyView}=await import('./study/whetu-view');if(token!==generation)return;
      if(whetuIdentityPending()){showWhetuIdentityHold();return;}
      appView=new WhetuStudyView(content,{signedIn:()=>!!accounts.session(),openAccounts:()=>accountView.open(),pairing:studyPairing!});appKind='study';
      document.body.classList.add('whetu-study-active');
      document.querySelector('.app-tabbar a[href="#/collection"]')?.removeAttribute('aria-current');
      document.querySelector('.app-tabbar [data-action="study"]')?.setAttribute('aria-current','page');
      appView.navigate(location.hash);window.scrollTo(0,0);
    }catch{if(token===generation)content.innerHTML='<div class="game-error"><p>Study could not open. Try again.</p><a class="game-button secondary" href="#/collection">Back to games</a></div>';}
    return;
  }
  const isMovies=location.hash==='#/movies'||location.hash.startsWith('#/movies/');
  if(isMovies){
    if(movies){movies.navigate(location.hash);return;}
    if(!activeId&&!appView)movieScroll={x:scrollX,y:scrollY};
    if(menu.open)menu.close();
    if(rulesDialog.open)rulesDialog.close();
    if(leaderboards.root.open)leaderboards.root.close();
    const token=++generation;leave();
    setChromeInert(true);
    content.innerHTML='<div class="loading"><p>Opening Movies &amp; TV…</p><a class="game-button secondary" href="#/collection">Back to games</a></div>';
    try{
      const [{MoviesView},storage]=await Promise.all([import('./movies/view'),import('./movies/storage')]);if(token!==generation)return;
      movieStorage??=new storage.MovieStorage();
      movies=new MoviesView(content,movieStorage,advance=>advance?openStudy(true):openStudyEntry(),()=>preferences.reducedMotion,{autoNext:()=>preferences.autoNextEpisode,setAutoNext:value=>{preferences.autoNextEpisode=value;store.write('settings',preferences);}},openMenu);
      movies.navigate(location.hash);
    }catch{if(token===generation)content.innerHTML='<div class="game-error"><p>Movies &amp; TV could not load.</p><a class="game-button secondary" href="#/collection">Back to games</a></div>';}
    return;
  }
  const appRoute=/^#\/(social|chat|santa|election|predictions)(\/|\?|$)/.exec(location.hash)?.[1] as 'social'|'chat'|'santa'|'election'|'predictions'|undefined;
  if(appRoute){
    if(appView&&appKind===appRoute){appView.navigate(location.hash);return;}
    if(!activeId&&!movies&&!appView)movieScroll={x:scrollX,y:scrollY};
    if(menu.open)menu.close();
    if(rulesDialog.open)rulesDialog.close();
    if(leaderboards.root.open)leaderboards.root.close();
    if(launcher.sheet.open)launcher.sheet.close();
    const token=++generation;leave();
    setChromeInert(true);
    const name=appRoute==='social'?'Social':appRoute==='chat'?'Chat':appRoute==='election'?'Results Desk':appRoute==='predictions'?'Predictions':'the Santa Tracker';
    content.innerHTML=`<div class="loading"><p>Opening ${name}…</p><a class="game-button secondary" href="#/collection">Back to games</a></div>`;
    try{
      // Constructors write into #content, so check the navigation is still current before building.
      const make:()=>AppView=appRoute==='predictions'?(PredictionsView=>()=>new PredictionsView(content,appDeps()))((await import('./predictions/view')).PredictionsView)
        :appRoute==='election'?(ElectionView=>()=>new ElectionView(content,{reducedMotion:()=>preferences.reducedMotion}))((await import('./election/view')).ElectionView)
        :appRoute==='santa'?(SantaView=>()=>new SantaView(content,{reducedMotion:()=>preferences.reducedMotion}))((await import('./santa/view')).SantaView)
        :(ViewClass=>()=>new ViewClass(content,appDeps()))(appRoute==='social'?(await import('./social/view')).SocialView:(await import('./chat/view')).ChatView);
      if(token!==generation)return;
      const view=make();
      if(token!==generation){view.dispose();return;}
      appView=view;appKind=appRoute;document.body.classList.add(`${appRoute}-active`);
      view.navigate(location.hash);
    }catch{if(token===generation)content.innerHTML=`<div class="game-error"><p>${name[0].toUpperCase()+name.slice(1)} couldn’t open. Check your connection and try again.</p><a class="game-button secondary" href="#/collection">Back to games</a></div>`;}
    return;
  }
  const wasInMovies=!!movies,wasInApp=!!appView;
  const requested=entryFromHash(location.hash);
  const id=requested&&games.some(g=>g.id===requested)?requested:undefined;
  // Keep a game link's options (an online invite) when the address is made canonical.
  const canonical=id?entryHash(id)+(location.hash.match(/\?.*$/)?.[0]??''):collectionHash;
  if(location.hash!==canonical)history.replaceState(null,'',location.pathname+location.search+canonical);
  const wasInGame=!!activeId;
  if(id&&!wasInGame&&!wasInApp)libraryScroll={x:scrollX,y:scrollY};
  if(leaderboards.root.open){pausedForDialog=false;leaderboards.root.close();}
  const token=++generation;leave();
  // A restored scroll position is part of the navigation, so the tab bar re-bases on it rather than counting it as a scroll.
  if(!id){library();if(wasInMovies||wasInApp)requestAnimationFrame(()=>{window.scrollTo(movieScroll.x,movieScroll.y);tabbar.reset();document.querySelector<HTMLElement>(wasInApp?'.app-tabbar [data-action="apps"]':'.app-tabbar .ui-tab[href="#/collection"]')?.focus({preventScroll:true});});if(wasInGame)requestAnimationFrame(()=>{if(!activeId){window.scrollTo(libraryScroll.x,libraryScroll.y);tabbar.reset();}});return;}
  const info=games.find(g=>g.id===id)!;activeId=id;document.body.classList.add('in-game');syncViewportLock();window.scrollTo(0,0);
  content.innerHTML=`<section class="game-view" data-game-id="${id}" data-reference-game="${referenceGames.has(id)}" aria-label="${info.title}">
    <div class="game-surface" aria-hidden="true"></div>
    <dialog id="game-options" class="ui-glass-sheet game-chrome-menu" aria-labelledby="game-title">
      <form method="dialog" class="dialog-head"><div><p class="game-menu-eyebrow">GAME MENU</p><h1 id="game-title">${info.title}<span class="sr-only"> menu</span></h1></div><button class="icon-button" aria-label="Close game menu">${icon('close')}</button></form>
      <div class="game-metrics"><span id="game-score"><span class="metric-label">Score</span><strong>0</strong></span><span id="game-level"></span><span id="game-best"><span class="metric-label">Best</span><strong>${metricText(id,store.highScore(id))}</strong></span></div>
      <div class="game-menu-options"></div>
      <div class="game-menu-actions">
        <button id="pause-game" class="game-menu-action" aria-label="Pause game">${icon('pause')}<span>Pause game</span></button>
        <button id="restart-game" class="game-menu-action" aria-label="Restart game">${icon('restart')}<span>Restart</span></button>
        <button id="rules-game" class="game-menu-action" aria-label="Game rules">${icon('rules')}<span>How to play</span></button>
        <button id="favourite-game" class="game-menu-action" aria-label="Favourite ${info.title}" aria-pressed="${store.favourites().includes(id)}">${icon('star')}<span>Favourite</span></button>
        <button id="fullscreen-game" class="game-menu-action" type="button" aria-label="Enter full screen" aria-pressed="false" title="Enter full screen">${icon('fullscreen')}<span>Full screen</span></button>
        <button id="game-settings" class="game-menu-action">${icon('menu')}<span>Settings</span></button>
        <button id="game-rankings" class="game-menu-action">${icon('star')}<span>Leaderboards</span></button>
        <button id="game-local-options" class="game-menu-action" hidden>Game options</button>
      </div>
      ${['maze-muncher','quadfall'].includes(id)?'<label class="game-touch-setting" hidden><span>Show touch controls</span><input id="game-touch-controls" type="checkbox"></label>':''}
    </dialog>
    <div class="stage-wrap"><div id="game-stage" tabindex="-1"><p class="loading">Getting your game ready…</p></div><div id="pause-overlay" hidden><div><h2>Paused</h2><button id="resume-game" class="game-button">Keep playing</button></div></div></div>
    <p id="game-status" role="status"${id==='pool'?' aria-hidden="true"':''}></p></section>`;
  gameMenu=document.querySelector<HTMLDialogElement>('#game-options')!;
  const currentMenu=gameMenu,view=document.querySelector<HTMLElement>('.game-view')!;
  const dock=createGameDock({backHref:collectionHash,backIcon:icon('back'),menuIcon:icon('pause'),pointerLock:id==='blockcraft'});
  view.querySelector('.game-surface')!.after(dock.root);
  if(LeaderboardSidebar.supports(id))leaderboardSidebar=new LeaderboardSidebar(id,games.find(game=>game.id===id)?.title??id,leaderboards.sync,key=>{pausedForDialog=!paused;setPaused(true);leaderboards.open(key);});
  const menuButton=dock.menu;
  const closeGameMenu=()=>{menuButton.setAttribute('aria-expanded','false');currentMenu.close();};
  const transferDialog=(open:()=>void)=>{const resume=pausedForDialog;pausedForDialog=false;closeGameMenu();open();pausedForDialog=resume;};
  const activateOption=(action:()=>void)=>{
    const resume=pausedForDialog;pausedForDialog=false;closeGameMenu();
    setPaused(false);action();if(!resume)setPaused(true);
  };
  currentMenu.addEventListener('close',()=>{if(token!==generation)return;menuButton.setAttribute('aria-expanded','false');dialogClosed();});
  menuButton.addEventListener('click',()=>{
    gameChrome?.options(currentMenu.querySelector<HTMLElement>('.game-menu-options')!,activateOption);
    pausedForDialog=!paused;setPaused(true);menuButton.setAttribute('aria-expanded','true');openSheet(currentMenu,menuButton);
  });
  document.querySelector('#game-settings')!.addEventListener('click',()=>transferDialog(()=>openMenu(menuButton)));
  document.querySelector('#game-rankings')!.addEventListener('click',()=>transferDialog(()=>leaderboards.open(id==='minesweeper'?'minesweeper-score':id)));
  const fullscreenButton=document.querySelector<HTMLButtonElement>('#fullscreen-game')!;
  detachFullscreen=attachFullscreen(fullscreenButton,state=>{
    fullscreenButton.setAttribute('aria-pressed',String(state.expanded));
    const label=state.expanded?'Exit full screen':'Enter full screen';
    const hint='This browser keeps its own controls. The game fills the screen.';
    fullscreenButton.setAttribute('aria-label',state.fallback&&state.expanded?`${label}. ${hint}`:label);
    fullscreenButton.title=state.fallback&&state.expanded?hint:label;
    fullscreenButton.innerHTML=icon(state.expanded?'exitfs':'fullscreen')+`<span>${label}</span>`;
  },()=>{
    if(!activeId||study.isOpen)return;
    // Some browsers consume Escape when they leave fullscreen. Give any open
    // dialog its usual cancel behavior before treating that exit as Study.
    const dialog=accountView.root.open?accountView.root:launcher.sheet.open?launcher.sheet:menu.open?menu:rulesDialog.open?rulesDialog:gameMenu?.open?gameMenu:leaderboards.root.open?leaderboards.root:undefined;
    if(dialog){const cancel=new Event('cancel',{cancelable:true});if(dialog.dispatchEvent(cancel))dialog.close();return;}
    if(instance?.dismissMenu?.())return;
    openStudy(true);
  });
  fullscreenButton.addEventListener('click',closeGameMenu);
  try {
    const loaded=await loadGame(id);if(token!==generation)return;
    let newRecordFlushed=false;
    const flushMilestone=()=>queueMicrotask(()=>{if(token!==generation)return;save();void accounts.flush(false,false).catch(()=>{});if(!document.hidden)void leaderboards.sync.flush().catch(()=>{});});
    const stage=document.querySelector<HTMLElement>('#game-stage')!;stage.replaceChildren();
    const mounted=await loaded.mount(stage,{
      id,settings:preferences,highScore:store.highScore(id),
      setScore(score){
        if(token!==generation)return;
        document.querySelector('#game-score strong')!.textContent=metricText(id,score);
        const previous=store.highScore(id),next=id==='minesweeper'?0:store.recordScore(id,score);
        leaderboards.sync.queue(id,Math.floor(next));
        if(next>previous&&!newRecordFlushed){newRecordFlushed=true;flushMilestone();}
        document.querySelector('#game-best strong')!.textContent=metricText(id,next);
      },
      submitRecord(key,score){
        if(token!==generation||id!=='minesweeper'||!MINESWEEPER_RANKINGS.includes(key as typeof MINESWEEPER_RANKINGS[number])||!Number.isInteger(score)||score<=0)return;
        const previous=store.read<number>('best:'+key,0),best=Math.max(previous,score);if(best>previous){store.write('best:'+key,best);leaderboards.sync.queue(key,best);flushMilestone();}
      },
      openRankings(key){if(token===generation&&scoredGame(key)){pausedForDialog=!paused;setPaused(true);leaderboards.open(key);}},
      setPaused(value){if(token===generation)setPaused(value);},
      openAppMenu(){if(token===generation)openMenu();},
      setLevel(level){if(token===generation)document.querySelector('#game-level')!.textContent=String(level);},
      setStatus(text){if(token!==generation)return;const status=document.querySelector('#game-status')!;if(status.textContent!==text&&/game over|run ended|run finished|you won|you win|play again|tower is complete|trail complete/i.test(text))flushMilestone();status.textContent=text;},
      announce,
      save(data){if(token!==generation)return;store.saveGame(id,data);storageStatus();},
      sound(kind){if(token===generation&&!paused&&!study.isOpen){playSound(preferences.sound,kind);if(kind==='lose')flushMilestone();}}
    });
    if(token!==generation){mounted.dispose();return;}
    instance=mounted;
    gameChrome=bindGameChrome(view,id);
    const localOptions=currentMenu.querySelector<HTMLButtonElement>('#game-local-options')!;
    localOptions.hidden=!instance.openMenu;
    localOptions.addEventListener('click',()=>{
      // A native game menu remembers its own resume intent. Preserve an explicit pause.
      const resume=pausedForDialog;pausedForDialog=false;closeGameMenu();
      if(resume)setPaused(false);
      instance?.openMenu?.();
    });
    if(['maze-muncher','quadfall'].includes(id)){
      const touch=currentMenu.querySelector<HTMLInputElement>('#game-touch-controls')!;
      touch.parentElement!.hidden=false;touch.checked=matchMedia('(any-pointer:coarse)').matches;
      view.dataset.touchControls=String(touch.checked);
      touch.addEventListener('change',()=>{view.dataset.touchControls=String(touch.checked);window.dispatchEvent(new Event('resize'));});
    }
    const saved=store.savedGame(id);
    if(saved!==undefined){try{instance.restore(saved);}catch{announce('The previous save was not compatible. Starting a fresh game.');}}
    if(!referenceGames.has(id)&&!fillGames.has(id))stopFitting=fitGameStage(stage,stage.parentElement!);
    document.querySelector('#pause-game')!.addEventListener('click',()=>{pausedForDialog=false;closeGameMenu();setPaused(!paused);});
    document.querySelector('#resume-game')!.addEventListener('click',()=>setPaused(false));
    document.querySelector('#restart-game')!.addEventListener('click',()=>{
      const resume=pausedForDialog;pausedForDialog=false;closeGameMenu();
      if(instance?.restart()===false){if(resume)setPaused(false);return;}
      newRecordFlushed=false;setPaused(false);save();
    });
    document.querySelector('#rules-game')!.addEventListener('click',event=>{
      const resume=pausedForDialog||!paused;setPaused(true);
      transferDialog(()=>{document.querySelector('#rules-text')!.textContent=loaded.rules;openSheet(rulesDialog,event.currentTarget as Element);});pausedForDialog=resume;
    });
    document.querySelector('#favourite-game')!.addEventListener('click',event=>{
      const selected=store.toggleFavourite(id);
      (event.currentTarget as HTMLButtonElement).setAttribute('aria-pressed',String(selected));
      announce(selected?'Added to favourites':'Removed from favourites');storageStatus();
    });
    autosave=window.setInterval(()=>{if(!paused&&!document.hidden)save();},5000);
    // A menu can open before the lazy game finishes mounting. Copy restored
    // options before pausing disables native controls, just as a normal open does.
    for(const sheet of document.querySelectorAll<HTMLDialogElement>('dialog.arcade-sheet[open]'))sheet.dataset.glassTone=view.dataset.glassTone!;
    if(currentMenu.open)gameChrome.options(currentMenu.querySelector<HTMLElement>('.game-menu-options')!,activateOption);
    if(paused||study.isOpen||document.hidden||menu.open||rulesDialog.open||gameMenu?.open||leaderboards.root.open){
      if(!document.hidden&&(menu.open||rulesDialog.open||gameMenu?.open))pausedForDialog=true;
      setPaused(true);
    }
    if(!study.isOpen&&!menu.open&&!rulesDialog.open&&!gameMenu?.open&&!leaderboards.root.open)stage.focus();
  }catch(error){
    if(token!==generation)return;
    const stage=document.querySelector('#game-stage')!;
    stage.innerHTML=`<p class="game-error"></p><a class="game-button" href="${collectionHash}">Back to library</a>`;
    stage.querySelector('.game-error')!.textContent=error instanceof Error?error.message:'Could not load this game.';
  }
}

// The trigger is the control that opened the menu, so the sheet grows from it. Without one, the sheet grows from its bottom centre.
function openMenu(trigger?:Element|null){
  const context=appKind??'games';
  menu.dataset.context=context;
  menu.querySelector('#menu-title span')!.textContent=context==='games'?'Mauri Study Notes':context==='study'?'Whetū Study settings':`QCC ${context==='chat'?'Chat':'Social'} settings`;
  updateAccountMenu();
  pausedForDialog=!!activeId&&!paused;if(activeId)setPaused(true);
  openSheet(menu,trigger);
}
document.querySelector('.app-navigation [data-action="menu"]')!.addEventListener('click',event=>openMenu(event.currentTarget as Element));
function openStudyEntry(){if(WHETU_STUDY){if(location.hash==='#/study')void route();else location.hash='#/study';}else openStudy();}
document.querySelector('.app-tabbar [data-action="study"]')!.addEventListener('click',openStudyEntry);
function dialogClosed(){
  if(menu.open||rulesDialog.open||gameMenu?.open||leaderboards.root.open||accountView.root.open)return;
  const resume=pausedForDialog;pausedForDialog=false;
  if(resume&&!study.isOpen&&!document.hidden)setPaused(false);
}
menu.addEventListener('close',()=>{dialogClosed();if(!activeId&&!movies&&!appView&&!/^#\/(movies|social|chat|santa|election|predictions|study)(\/|\?|$)/.test(location.hash)&&!study.isOpen)library();});
rulesDialog.addEventListener('close',dialogClosed);
leaderboards.root.addEventListener('close',dialogClosed);
document.querySelector('#open-leaderboards')!.addEventListener('click',()=>{
  const resume=pausedForDialog||!!activeId&&!paused;
  pausedForDialog=false;if(menu.open)menu.close();if(activeId)setPaused(true);
  leaderboards.open(activeId);pausedForDialog=resume;
});
document.querySelector('.rules-done')!.addEventListener('click',()=>rulesDialog.close());
document.querySelector('#open-study')!.addEventListener('click',openStudyEntry);
document.querySelector<HTMLInputElement>('#favourites-only')!.addEventListener('change',event=>{
  onlyFavourites=(event.target as HTMLInputElement).checked;
  if(activeId||movies||appView)location.hash=collectionHash;else library();
});
document.querySelector<HTMLInputElement>('#search')!.addEventListener('input',event=>{
  search=(event.target as HTMLInputElement).value;if(activeId||movies||appView)location.hash=collectionHash;else library();
});
for(const [selector,key] of [['#sound','sound'],['#motion','reducedMotion'],['#colour','colorBlind']] as const){
  const input=document.querySelector<HTMLInputElement>(selector)!;input.checked=preferences[key];
  input.addEventListener('change',()=>{
    preferences[key]=input.checked;store.write('settings',preferences);
    document.documentElement.classList.toggle('reduce-motion',preferences.reducedMotion);storageStatus();
  });
}
document.documentElement.classList.toggle('reduce-motion',preferences.reducedMotion);
// The Christmas theme is presentation only: it is stored outside saves and sync, and games pick up a change as they draw.
const festiveInput=document.querySelector<HTMLInputElement>('#festive')!;festiveInput.checked=storedFestiveTheme()==='christmas';
festiveInput.addEventListener('change',()=>{
  setFestiveTheme(festiveInput.checked?'christmas':'off');announce(festiveInput.checked?'Christmas theme on':'Christmas theme off');
  // Games build some artwork at mount, so an open game is saved and remounted (the same path as navigation) to show one theme throughout.
  if(activeId)void route();
});

window.addEventListener('hashchange',()=>void route());
window.addEventListener('pagehide',()=>{save();movies?.pause();appView?.pause();void accounts.flush(true,false).catch(()=>{});});
// A page restored from the back/forward cache missed its pagehide resume: live results start refreshing again.
window.addEventListener('pageshow',event=>{if(event.persisted&&appKind==='election'&&!study.isOpen)appView?.resume();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&instance){instance.dismissMenu?.();pausedForDialog=false;setPaused(true);}});
// Capture on window precedes native dialog cancellation and game-local Escape handlers.
window.addEventListener('keydown',event=>{
  // Inert affects DOM targets, not document/window listeners retained by games.
  // Stop their handlers while preserving native reading/keyboard defaults.
  if(accountView.root.open||christmasWelcome.root.open||document.querySelector('dialog.movies-warning[open]'))return;
  if(study.isOpen&&event.key==='Escape'&&study.dismissPrivacy()){event.preventDefault();event.stopImmediatePropagation();return;}
  if(event.key==='Escape'&&(menu.open||launcher.sheet.open||rulesDialog.open||gameMenu?.open||leaderboards.root.open||document.querySelector('dialog.apps-sheet[open],.apps-popover')))return;
  // The inline Social composer owns Escape while its mention picker is open.
  // Let its target handler dismiss suggestions before the shell opens Study.
  if(!study.isOpen&&event.key==='Escape'&&event.target instanceof Element&&event.target.matches('.social-textarea[aria-expanded="true"]'))return;
  if(!study.isOpen&&event.key==='Escape'&&instance?.dismissMenu?.()){event.preventDefault();event.stopImmediatePropagation();return;}
  if(study.isOpen&&event.key!=='Escape'){event.stopImmediatePropagation();return;}
  if(event.key!=='Escape'||(!activeId&&!movies&&!appView&&!study.isOpen))return;
  event.preventDefault();event.stopImmediatePropagation();
  if(!event.repeat){if(study.isOpen)study.advanceArticle();else openStudy(true);}
},{capture:true});
window.addEventListener('keyup',event=>{if(study.isOpen)event.stopImmediatePropagation();},{capture:true});
updateStudySummary();
function beginStudy(){
 if(WHETU_STUDY||study.session.topic()){initialized=true;showArcade();void route();}
 else {hideArcade();study.showPicker();}
}
function finishEntry(){
 if(!initialized&&!study.isOpen)beginStudy();
 else if(initialized){showArcade();void route();}
 updateAccountMenu();
}
function updateAccountMenu(){
 const session=accounts.session();
 document.querySelector('#account-summary')!.textContent=session?`Signed in as ${session.username}`:appKind&&appKind!=='santa'&&appKind!=='election'?'Not signed in':'Playing as guest';
 document.querySelector<HTMLElement>('#open-accounts')!.hidden=!!session;
 document.querySelector<HTMLElement>('#logout-account')!.hidden=!session;
 document.querySelector<HTMLElement>('#switch-account')!.hidden=!session;
 document.querySelector<HTMLElement>('#sync-account')!.hidden=!session;
 document.querySelector('#account-sync-status')!.textContent=accounts.message;
 Object.assign(preferences,store.settings());
 for(const [selector,key] of [['#sound','sound'],['#motion','reducedMotion'],['#colour','colorBlind']] as const)document.querySelector<HTMLInputElement>(selector)!.checked=preferences[key];
 document.documentElement.classList.toggle('reduce-motion',preferences.reducedMotion);
}
accounts.beforeIdentityChange=()=>{generation++;if(christmasWelcome.root.open)christmasWelcome.root.close();leave(false);};
let displayedAccount=accounts.session()?.token;
accounts.onChange(()=>{
 const identity=accounts.session()?.token,changed=identity!==displayedAccount;displayedAccount=identity;
 updateAccountMenu();
 if(activeId)document.querySelector('#favourite-game')?.setAttribute('aria-pressed',String(store.favourites().includes(activeId)));
 if(identity){for(const game of [...SCORED_GAMES.filter(id=>id!=='minesweeper'),...MINESWEEPER_RANKINGS])leaderboards.sync.queue(game,Math.floor(store.read<number>('best:'+game,0)));if(changed&&!document.hidden)void leaderboards.sync.flush().catch(()=>{});}
 if(changed&&initialized&&!accountView.root.open){if(study.isOpen)accountRoutePending=true;else void route();}
});
document.querySelector('#sync-account')!.addEventListener('click',()=>{save();void Promise.all([accounts.flush(),leaderboards.sync.flush()]).catch(()=>{});});
document.querySelector('#open-accounts')!.addEventListener('click',()=>{menu.close();accountView.open();});
async function logoutAccount(switching=false){
 if(signingOut)return;signingOut=true;
 const buttons=['#logout-account','#switch-account'].map(id=>document.querySelector<HTMLButtonElement>(id)!);
 for(const button of buttons)button.disabled=true;
 try{
  if(activeId)setPaused(true);
  closeWhetuForIdentityChange();
  await accounts.logout();signingOut=false;menu.close();
  if(switching)accountView.open();else finishEntry();
 }catch(error){accounts.message=error instanceof Error?error.message:'Could not sign out securely. Try again.';updateAccountMenu();}
 finally{signingOut=false;for(const button of buttons)button.disabled=false;}
}
document.querySelector('#logout-account')!.addEventListener('click',()=>void logoutAccount());
document.querySelector('#switch-account')!.addEventListener('click',()=>void logoutAccount(true));
accounts.start(false);updateAccountMenu();
if(accounts.session()||store.read('accounts:guest',false))beginStudy();
else accountView.open();
