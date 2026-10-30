import './theme.css';
import './movies/style.css';
import type {MoviesView} from './movies/view';
import type {MovieStorage} from './movies/storage';
import {collectionHash,entryHash,entryFromHash} from './core/navigation';
import mauriMark from './assets/mauri-mark.svg?raw';
import {uiIcon} from './ui/icons';
import {autoHideTabbar} from './ui/tabbar';
import {openSheet} from './ui/sheet';
import './style.css';
import './game-viewport.css';
import {games, artUrl, loadGame} from './core/catalog';
import type {GameId, GameInstance} from './core/types';
import * as store from './core/storage';
import {playSound} from './core/audio';
import {activateUpdate, cacheAll, checkForUpdates, watchUpdates} from './core/offline';
import {StudyView} from './study/view';
import {reloadAfterActivation} from './core/update';
import {fitGameStage} from './core/viewport-fit';
import {attachFullscreen,syncPlaySurface} from './core/play-surface';
import {AccountsClient} from './accounts/client';
import {AccountsView} from './accounts/view';
import {LeaderboardView} from './leaderboard/view';
import {SCORED_GAMES,MINESWEEPER_RANKINGS,scoredGame} from './leaderboard/shared';
import {LeaderboardSidebar} from './leaderboard/sidebar';

const icon=(name:string)=>{
  const paths:Record<string,string>={menu:'<path d="M4 7h16M4 12h10"/>',back:'<path d="m14 5-7 7 7 7M7 12h14"/>',star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',pause:'<path d="M8 5v14M16 5v14"/>',play:'<path d="m8 4 12 8-12 8z"/>',restart:'<path d="M4 5v6h6M4 11a8 8 0 1 1 1 7"/>',rules:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',fullscreen:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',exitfs:'<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>'};
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.grid}</svg>`;
};
const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`<nav class="app-tabbar ui-tabbar" aria-label="Sections"><a class="ui-tab" href="#/collection" aria-current="page">${uiIcon('grid')}<span>Games</span></a><a class="ui-tab" href="#/movies/browse/movie">${uiIcon('film')}<span>Movies</span></a><a class="ui-tab" href="#/movies/browse/tv">${uiIcon('tv')}<span>TV Shows</span></a><a class="ui-tab" href="#/movies/list">${uiIcon('bookmark')}<span>My list</span></a><button class="ui-tab" data-action="study">${uiIcon('study')}<span>Study</span></button><button class="ui-tab" type="button" data-action="menu" aria-label="Open menu" aria-haspopup="dialog">${uiIcon('menu')}<span>Menu</span></button></nav><main id="content"></main>
<dialog id="menu" class="ui-glass-sheet" aria-labelledby="menu-title"><form method="dialog" class="dialog-head"><h2 id="menu-title" class="menu-brand">${mauriMark}<span>Mauri Study Notes</span></h2><button class="icon-button" aria-label="Close menu">${icon('close')}</button></form><label class="search-label" for="search">Find a game</label><input id="search" type="search" placeholder="Search the ${games.length} games" autocomplete="off"><div class="setting-list menu-filters"><label><span>Favourites only</span><input type="checkbox" id="favourites-only"></label></div><div class="setting-list"><label><span>Sound</span><input type="checkbox" id="sound"></label><label><span>Reduce motion</span><input type="checkbox" id="motion"></label><label><span>Colour-blind patterns</span><input type="checkbox" id="colour"></label></div><section class="account-menu" aria-label="Account"><p id="account-summary" class="muted"></p><button id="open-accounts" class="game-button secondary">Log in / Sign up</button><button id="logout-account" class="game-button secondary" hidden>Log out</button><button id="switch-account" class="game-button secondary" hidden>Switch account</button><button id="sync-account" class="game-button secondary" hidden>Sync now</button><p id="account-sync-status" class="muted" role="status"></p></section><button id="open-leaderboards" class="game-button secondary leaderboard-menu-button">Leaderboards</button><button id="open-study" class="game-button secondary study-menu-button">Study Mode</button><p id="study-menu-summary" class="muted study-menu-summary"></p><section id="update-notice" hidden><p id="update-status" class="muted" role="status"></p><button id="reload-update" class="game-button" aria-describedby="update-status" hidden>Reload to update</button></section><button class="game-button offline-button">Make all games available offline</button><progress id="download-progress" hidden></progress><p id="offline-status" class="muted">Download once while online. Caching is specific to this browser and device and may be restricted or cleared by device policy.</p><p id="storage-status" class="muted"></p><p class="menu-note">${games.length} games. No ads. Optional accounts.<br>Made for a little time to play.</p></dialog>
<dialog id="rules-dialog" class="ui-glass-sheet" aria-labelledby="rules-title"><form method="dialog" class="dialog-head"><h2 id="rules-title">How to play</h2><button class="icon-button" aria-label="Close rules">${icon('close')}</button></form><p id="rules-text"></p><button class="game-button rules-done">Let’s play</button></dialog><div class="sr-only" id="announcer" aria-live="polite"></div>`;
const content=document.querySelector<HTMLElement>('#content')!;
const menu=document.querySelector<HTMLDialogElement>('#menu')!;
const rulesDialog=document.querySelector<HTMLDialogElement>('#rules-dialog')!;
// The tab bar island hides on scroll down and shows on scroll up. It is bound once to the window; reset() runs on every route and leave.
const tabbar=autoHideTabbar(document.querySelector<HTMLElement>('.app-tabbar')!,window);
const preferences=store.settings();
const accounts=new AccountsClient();
const accountView=new AccountsView(accounts,()=>{if(activeId)setPaused(true);},finishEntry);
const leaderboards=new LeaderboardView(()=>{pausedForDialog=false;if(activeId)setPaused(true);accountView.open();});
let leaderboardSidebar:LeaderboardSidebar|undefined;
let onlyFavourites=false, search='', instance:GameInstance|undefined, activeId:GameId|undefined;
let paused=false, generation=0, autosave:number|undefined, pausedForDialog=false;
let initialized=false, resumeAfterStudy=false, focusBeforeStudy:HTMLElement|null=null, scrollBeforeStudy={x:0,y:0};
let focusLabelBeforeStudy:string|null=null;
let accountRoutePending=false;
let libraryScroll={x:0,y:0};
let movies:MoviesView|undefined;
// The saved Movies data is one copy for the page, so it outlives each MoviesView and keeps unsaved changes across a visit to the games.
let movieStorage:MovieStorage|undefined;
let movieScroll={x:0,y:0};
let stopFitting:(()=>void)|undefined;
let detachFullscreen:(()=>void)|undefined;
const referenceGames=new Set<GameId>(['animal-stack','water-sort','color-blocks','ball-run','neon-coil','blockcraft']);
// Responsive WebGL layouts fill the standard stage; a scale transform would break pointer mapping.
const fillGames=new Set<GameId>(['minesweeper','globle','corn-clicker','slipline','quadfall','fivefold']);

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
}, returnFromStudy, reloadForUpdate);

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
let updateReady=false,updateBusy=false,updateRequest=0,updateFailure='';
// Any new reading intent cancels the old request, even if the reader returns
// to its starting article before activation finishes.
study.root.addEventListener('change',event=>{if(updateBusy&&(event.target as Element).id==='study-topic')updateRequest++;});
study.root.addEventListener('study-article-change',()=>{if(updateBusy)updateRequest++;});
function showUpdate(message:string){
  const notice=document.querySelector<HTMLElement>('#update-notice')!;
  notice.hidden=!message;document.querySelector('#update-status')!.textContent=message;
  // While an update is ready the offline download is secondary, so the reload is the menu's one tinted action. A failed check
  // shows the notice with no reload, and the download keeps its tint.
  document.querySelector('.offline-button')!.classList.toggle('secondary',updateReady);
  document.querySelector<HTMLButtonElement>('#reload-update')!.hidden=!updateReady;document.querySelector<HTMLButtonElement>('#reload-update')!.disabled=updateBusy;
  study.setUpdateStatus(message,updateReady,updateBusy);
}
async function reloadForUpdate(){
  if(!updateReady||updateBusy)return;
  const request=++updateRequest,gameGeneration=generation,route=location.hash,article=study.session.article()?.id;
  updateFailure='';updateBusy=true;showUpdate('Saving your game and starting the update…');
  const result=await reloadAfterActivation(()=>{const saved=setPaused(true);return store.flushPending()&&saved;},activateUpdate,()=>location.reload(),()=>request===updateRequest&&generation===gameGeneration&&location.hash===route&&study.session.article()?.id===article);
  updateBusy=false;
  if(result==='save-failed'){updateFailure='Your game could not be saved on this device. Keep this tab open. Free some storage and try again before reloading.';showUpdate(updateFailure);}
  if(result==='cancelled')showUpdate('An update is ready. Reload when you are ready; your game will be saved first.');
  if(result==='activation-failed'){updateFailure='The update could not start. Your game remains open. Try again when online.';showUpdate(updateFailure);}
}
document.querySelector('#reload-update')!.addEventListener('click',reloadForUpdate);
watchUpdates(import.meta.url,status=>{
  const newlyReady=status.available&&!updateReady;updateReady=status.available;
  showUpdate(updateFailure||status.message);
  if(newlyReady)announce('An update is ready. Open the menu, or use Reload to update in Study, when you are ready.');
});
function setChromeInert(value:boolean):void{
  document.querySelector<HTMLElement>('.app-tabbar')!.inert=value;
}
function leave(saveProgress=true){
  movies?.dispose();movies=undefined;
  setChromeInert(false);
  tabbar.reset();
  detachFullscreen?.();detachFullscreen=undefined;
  leaderboardSidebar?.dispose();leaderboardSidebar=undefined;
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
  content.innerHTML=`<h1 class="sr-only">Mauri Study Notes · Games</h1>${filtered?'<div class="library-filter"><p class="library-filter-text"></p><button type="button" class="game-button secondary" data-action="show-all">Show all games</button></div>':''}<div class="game-grid" aria-label="Game library">${items.map(g=>`<a class="game-card" href="${entryHash(g.id)}" aria-label="Play ${g.title}" style="--card:${g.color};--ink:${g.ink};--accent:${g.accent}"><h2>${g.title}</h2><span class="title-line"></span><img src="${artUrl(g.id)}" alt="" width="320" height="400" fetchpriority="${['color-blocks','water-sort'].includes(g.id)?'high':'auto'}" draggable="false"></a>`).join('')}</div>${items.length?'':'<p class="empty-library">'+(onlyFavourites?'Your favourites live here. Open a game and tap its star to add it.':'No games found. Try another name.')+'</p>'}`;
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
  if(!value&&updateBusy)updateRequest++;
  // A game may finish its asynchronous mount while a chapter is open.
  if(!value&&study.isOpen)return true;
  paused=value;
  if(!instance)return true;
  value?instance.pause():instance.resume();
  const button=document.querySelector<HTMLButtonElement>('#pause-game');
  if(button){button.innerHTML=icon(value?'play':'pause');button.setAttribute('aria-label',value?'Resume game':'Pause game');}
  const overlay=document.querySelector<HTMLElement>('#pause-overlay');if(overlay)overlay.hidden=!value;
  return value?save():true;
}
function updateStudySummary(){
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
  if(!activeId)return 'Your chapter is ready to read offline.';
  if(!instance)return 'Your game will remain paused while you read.';
  if(!saved)return 'Game paused. This save failed, but your game remains open in memory for this visit.';
  return store.canRetain()?'Game paused. Progress saved on this device.':'Game paused. Progress is held in memory for this visit.';
}
function openStudy(advance=false){
  movies?.pause();
  if(study.isOpen)return;
  focusBeforeStudy=document.activeElement instanceof HTMLElement?document.activeElement:null;
  focusLabelBeforeStudy=focusBeforeStudy?.closest('#game-stage')?focusBeforeStudy.getAttribute('aria-label'):null;
  scrollBeforeStudy={x:scrollX,y:scrollY};
  resumeAfterStudy=!!activeId&&(!paused||pausedForDialog);
  const saved=setPaused(true); // Pause and serialize synchronously, before painting the chapter.
  pausedForDialog=false;
  if(menu.open)menu.close();if(rulesDialog.open)rulesDialog.close();if(leaderboards.root.open)leaderboards.root.close();
  if(advance)study.advanceArticle();
  hideArcade();study.showArticle(studyMessage(saved));
}
function returnFromStudy(){
  if(updateBusy)updateRequest++;
  if(!initialized)return;
  study.hide();showArcade();updateStudySummary();
  if(accountRoutePending){accountRoutePending=false;resumeAfterStudy=false;focusBeforeStudy=null;void route();return;}
  if(resumeAfterStudy&&!document.hidden)setPaused(false);
  resumeAfterStudy=false;
  window.scrollTo(scrollBeforeStudy.x,scrollBeforeStudy.y);
  // The restored position is not the reader's scroll, so the tab bar re-bases on it.
  tabbar.reset();
  const replacement=focusLabelBeforeStudy?[...document.querySelectorAll<HTMLElement>('#game-stage [aria-label]')]
    .find(element=>element.getAttribute('aria-label')===focusLabelBeforeStudy&&!element.matches(':disabled')):undefined;
  const target=focusBeforeStudy?.isConnected&&!focusBeforeStudy.closest('dialog')?focusBeforeStudy:replacement;
  (target??document.querySelector<HTMLElement>(activeId?'#game-stage':'.app-tabbar [data-action="menu"]'))?.focus({preventScroll:true});
  focusBeforeStudy=null;focusLabelBeforeStudy=null;
}

async function route(){
  if(!initialized)return;
  tabbar.reset();
  accountRoutePending=false;
  // Explicit browser/hash navigation leaves the reading view as well as the old game.
  if(study.isOpen){study.hide();showArcade();resumeAfterStudy=false;focusBeforeStudy=null;focusLabelBeforeStudy=null;}
  const isMovies=location.hash==='#/movies'||location.hash.startsWith('#/movies/');
  if(isMovies){
    if(movies){movies.navigate(location.hash);return;}
    if(!activeId)movieScroll={x:scrollX,y:scrollY};
    if(menu.open)menu.close();
    if(rulesDialog.open)rulesDialog.close();
    if(leaderboards.root.open)leaderboards.root.close();
    const token=++generation;leave();
    setChromeInert(true);
    content.innerHTML='<div class="loading"><p>Opening Movies &amp; TV…</p><a class="game-button secondary" href="#/collection">Back to games</a></div>';
    try{
      const [{MoviesView},storage]=await Promise.all([import('./movies/view'),import('./movies/storage')]);if(token!==generation)return;
      movieStorage??=new storage.MovieStorage();
      movies=new MoviesView(content,movieStorage,openStudy,preferences.reducedMotion,{autoNext:()=>preferences.autoNextEpisode,setAutoNext:value=>{preferences.autoNextEpisode=value;store.write('settings',preferences);}});
      movies.navigate(location.hash);
    }catch{if(token===generation)content.innerHTML='<div class="game-error"><p>Movies &amp; TV could not load.</p><a class="game-button secondary" href="#/collection">Back to games</a></div>';}
    return;
  }
  const wasInMovies=!!movies;
  const requested=entryFromHash(location.hash);
  const id=requested&&games.some(g=>g.id===requested)?requested:undefined;
  // Keep a game link's options (an online invite) when the address is made canonical.
  const canonical=id?entryHash(id)+(location.hash.match(/\?.*$/)?.[0]??''):collectionHash;
  if(location.hash!==canonical)history.replaceState(null,'',location.pathname+location.search+canonical);
  const wasInGame=!!activeId;
  if(id&&!wasInGame)libraryScroll={x:scrollX,y:scrollY};
  if(leaderboards.root.open){pausedForDialog=false;leaderboards.root.close();}
  const token=++generation;leave();
  // A restored scroll position is part of the navigation, so the tab bar re-bases on it rather than counting it as a scroll.
  if(!id){library();if(wasInMovies)requestAnimationFrame(()=>{window.scrollTo(movieScroll.x,movieScroll.y);tabbar.reset();document.querySelector<HTMLElement>('.app-tabbar .ui-tab[href="#/collection"]')?.focus({preventScroll:true});});if(wasInGame)requestAnimationFrame(()=>{if(!activeId){window.scrollTo(libraryScroll.x,libraryScroll.y);tabbar.reset();}});return;}
  const info=games.find(g=>g.id===id)!;activeId=id;document.body.classList.add('in-game');syncViewportLock();window.scrollTo(0,0);
  content.innerHTML=`<section class="game-view" data-game-id="${id}" data-reference-game="${referenceGames.has(id)}" aria-label="${info.title}">
    <div class="game-toolbar">
      <a class="icon-button" href="${collectionHash}" aria-label="Back to game library">${icon('back')}</a><h1 id="game-title">${info.title}</h1>
      <button id="favourite-game" class="icon-button" aria-label="Favourite ${info.title}" aria-pressed="${store.favourites().includes(id)}">${icon('star')}</button>
      <button id="pause-game" class="icon-button" aria-label="Pause game">${icon('pause')}</button>
      <button id="restart-game" class="icon-button" aria-label="Restart game">${icon('restart')}</button>
      <button id="rules-game" class="icon-button" aria-label="Game rules">${icon('rules')}</button>
      <button id="fullscreen-game" class="icon-button" type="button" aria-label="Enter full screen" aria-pressed="false" title="Enter full screen">${icon('fullscreen')}</button>
      <button id="game-menu" class="icon-button game-menu-button" aria-label="Open menu">${icon('menu')}</button>
    </div>
    <div class="game-metrics"><span id="game-score"><span class="metric-label">${referenceGames.has(id)?id==='animal-stack'?'SOLO':'SCORE':'Score'}</span><strong>0</strong></span><span id="game-level"></span><span id="game-best"><span class="metric-label">${referenceGames.has(id)?'RECORD':'Best'}</span><strong>${store.highScore(id)}</strong><svg class="record-crown" viewBox="0 0 28 12" aria-hidden="true"><path d="m2 9-1-7 7 4 6-6 6 6 7-4-1 7z" fill="currentColor"/></svg></span></div>
    <div class="stage-wrap"><div id="game-stage" tabindex="-1"><p class="loading">Getting your game ready…</p></div><div id="pause-overlay" hidden><div><h2>Paused</h2><button id="resume-game" class="game-button">Keep playing</button></div></div></div>
    <p id="game-status" role="status"${id==='pool'?' aria-hidden="true"':''}></p></section>`;
  const fullscreenButton=document.querySelector<HTMLButtonElement>('#fullscreen-game')!;
  detachFullscreen=attachFullscreen(fullscreenButton,state=>{
    fullscreenButton.setAttribute('aria-pressed',String(state.expanded));
    const label=state.expanded?'Exit full screen':'Enter full screen';
    const hint='This browser keeps its own controls. The game fills the screen.';
    fullscreenButton.setAttribute('aria-label',state.fallback&&state.expanded?`${label}. ${hint}`:label);
    fullscreenButton.title=state.fallback&&state.expanded?hint:label;
    fullscreenButton.innerHTML=icon(state.expanded?'exitfs':'fullscreen');
  },()=>{
    if(!activeId||study.isOpen)return;
    // Some browsers consume Escape when they leave fullscreen. Give any open
    // dialog its usual cancel behavior before treating that exit as Study.
    const dialog=accountView.root.open?accountView.root:menu.open?menu:rulesDialog.open?rulesDialog:leaderboards.root.open?leaderboards.root:undefined;
    if(dialog){const cancel=new Event('cancel',{cancelable:true});if(dialog.dispatchEvent(cancel))dialog.close();return;}
    if(instance?.dismissMenu?.())return;
    openStudy(true);
  });
  if(LeaderboardSidebar.supports(id))leaderboardSidebar=new LeaderboardSidebar(id,info.title,leaderboards.sync,()=>{pausedForDialog=!paused;setPaused(true);leaderboards.open(id);});
  document.querySelector('#game-menu')!.addEventListener('click',event=>{if(instance?.openMenu)instance.openMenu();else openMenu(event.currentTarget as Element);});
  try {
    const loaded=await loadGame(id);if(token!==generation)return;
    let newRecordFlushed=false;
    const flushMilestone=()=>queueMicrotask(()=>{if(token!==generation)return;save();void accounts.flush(false,false).catch(()=>{});if(!document.hidden)void leaderboards.sync.flush().catch(()=>{});});
    const stage=document.querySelector<HTMLElement>('#game-stage')!;stage.replaceChildren();
    const mounted=await loaded.mount(stage,{
      id,settings:preferences,highScore:store.highScore(id),
      setScore(score){
        if(token!==generation)return;
        document.querySelector('#game-score strong')!.textContent=String(Math.floor(score));
        const previous=store.highScore(id),next=id==='minesweeper'?0:store.recordScore(id,score);
        leaderboards.sync.queue(id,Math.floor(next));
        if(next>previous&&!newRecordFlushed){newRecordFlushed=true;flushMilestone();}
        document.querySelector('#game-best strong')!.textContent=String(Math.floor(next));
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
    const saved=store.savedGame(id);
    if(saved!==undefined){try{instance.restore(saved);}catch{announce('The previous save was not compatible. Starting a fresh game.');}}
    if(!referenceGames.has(id)&&!fillGames.has(id))stopFitting=fitGameStage(stage,stage.parentElement!);
    document.querySelector('#pause-game')!.addEventListener('click',()=>setPaused(!paused));
    document.querySelector('#resume-game')!.addEventListener('click',()=>setPaused(false));
    document.querySelector('#restart-game')!.addEventListener('click',()=>{if(instance?.restart()===false)return;newRecordFlushed=false;setPaused(false);save();});
    document.querySelector('#rules-game')!.addEventListener('click',event=>{
      pausedForDialog=!paused;setPaused(true);
      document.querySelector('#rules-text')!.textContent=loaded.rules;openSheet(rulesDialog,event.currentTarget as Element);
    });
    document.querySelector('#favourite-game')!.addEventListener('click',event=>{
      const selected=store.toggleFavourite(id);
      (event.currentTarget as HTMLButtonElement).setAttribute('aria-pressed',String(selected));
      announce(selected?'Added to favourites':'Removed from favourites');storageStatus();
    });
    autosave=window.setInterval(()=>{if(!paused&&!document.hidden)save();},5000);
    if(paused||study.isOpen||document.hidden||menu.open||rulesDialog.open||leaderboards.root.open){
      if(!document.hidden&&(menu.open||rulesDialog.open))pausedForDialog=true;
      setPaused(true);
    }
    if(!study.isOpen&&!menu.open&&!rulesDialog.open&&!leaderboards.root.open)stage.focus();
  }catch(error){
    if(token!==generation)return;
    const stage=document.querySelector('#game-stage')!;
    stage.innerHTML=`<p class="game-error"></p><a class="game-button" href="${collectionHash}">Back to library</a>`;
    stage.querySelector('.game-error')!.textContent=error instanceof Error?error.message:'Could not load this game.';
  }
}

// The trigger is the control that opened the menu, so the sheet grows from it. Without one, the sheet grows from its bottom centre.
function openMenu(trigger?:Element|null){
  updateAccountMenu();
  pausedForDialog=!!activeId&&!paused;if(activeId)setPaused(true);
  openSheet(menu,trigger);void checkForUpdates();
}
document.querySelector('.app-tabbar [data-action="menu"]')!.addEventListener('click',event=>openMenu(event.currentTarget as Element));
document.querySelector('.app-tabbar [data-action="study"]')!.addEventListener('click',()=>openStudy());
function dialogClosed(){
  if(menu.open||rulesDialog.open||leaderboards.root.open||accountView.root.open)return;
  const resume=pausedForDialog;pausedForDialog=false;
  if(resume&&!study.isOpen&&!document.hidden)setPaused(false);
}
menu.addEventListener('close',()=>{if(updateBusy)updateRequest++;dialogClosed();if(!activeId&&!movies&&!location.hash.startsWith('#/movies')&&!study.isOpen)library();});
rulesDialog.addEventListener('close',dialogClosed);
leaderboards.root.addEventListener('close',dialogClosed);
document.querySelector('#open-leaderboards')!.addEventListener('click',()=>{
  const resume=pausedForDialog||!!activeId&&!paused;
  pausedForDialog=false;if(menu.open)menu.close();if(activeId)setPaused(true);
  leaderboards.open(activeId);pausedForDialog=resume;
});
document.querySelector('.rules-done')!.addEventListener('click',()=>rulesDialog.close());
document.querySelector('#open-study')!.addEventListener('click',()=>openStudy());
document.querySelector<HTMLInputElement>('#favourites-only')!.addEventListener('change',event=>{
  onlyFavourites=(event.target as HTMLInputElement).checked;
  if(activeId)location.hash=collectionHash;else library();
});
document.querySelector<HTMLInputElement>('#search')!.addEventListener('input',event=>{
  search=(event.target as HTMLInputElement).value;if(activeId)location.hash=collectionHash;else library();
});
for(const [selector,key] of [['#sound','sound'],['#motion','reducedMotion'],['#colour','colorBlind']] as const){
  const input=document.querySelector<HTMLInputElement>(selector)!;input.checked=preferences[key];
  input.addEventListener('change',()=>{
    preferences[key]=input.checked;store.write('settings',preferences);
    document.documentElement.classList.toggle('reduce-motion',preferences.reducedMotion);storageStatus();
  });
}
document.documentElement.classList.toggle('reduce-motion',preferences.reducedMotion);
document.querySelector<HTMLButtonElement>('.offline-button')!.addEventListener('click',async event=>{
  const button=event.currentTarget as HTMLButtonElement,progress=document.querySelector<HTMLProgressElement>('#download-progress')!,status=document.querySelector('#offline-status')!;
  button.disabled=true;progress.hidden=false;status.textContent='Downloading the arcade…';
  try {
    const total=await cacheAll((done,count)=>{progress.max=count;progress.value=done;status.textContent=`Downloaded ${done} of ${count} files`;});
    button.textContent='Offline pack downloaded';
    status.textContent=`All ${total} files downloaded on this browser. Device policy or storage eviction can still remove cached files.`;
  }catch(error){status.textContent=error instanceof Error?error.message:'Download failed. Try again when online.';}
  finally{button.disabled=false;}
});

window.addEventListener('hashchange',()=>void route());
window.addEventListener('pagehide',()=>{save();movies?.pause();void accounts.flush(true,false).catch(()=>{});});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&instance)setPaused(true);});
// Capture on window precedes native dialog cancellation and game-local Escape handlers.
window.addEventListener('keydown',event=>{
  // Inert affects DOM targets, not document/window listeners retained by games.
  // Stop their handlers while preserving native reading/keyboard defaults.
  if(accountView.root.open||document.querySelector('dialog.movies-warning[open]'))return;
  if(study.isOpen&&event.key==='Escape'&&study.dismissPrivacy()){event.preventDefault();event.stopImmediatePropagation();return;}
  if(event.key==='Escape'&&(menu.open||rulesDialog.open||leaderboards.root.open))return;
  if(!study.isOpen&&event.key==='Escape'&&instance?.dismissMenu?.()){event.preventDefault();event.stopImmediatePropagation();return;}
  if(study.isOpen&&event.key!=='Escape'){event.stopImmediatePropagation();return;}
  if(event.key!=='Escape'||(!activeId&&!movies&&!study.isOpen))return;
  event.preventDefault();event.stopImmediatePropagation();
  if(!event.repeat){if(study.isOpen)study.advanceArticle();else openStudy(true);}
},{capture:true});
window.addEventListener('keyup',event=>{if(study.isOpen)event.stopImmediatePropagation();},{capture:true});
updateStudySummary();
void checkForUpdates();
function beginStudy(){
 if(study.session.topic()){initialized=true;showArcade();void route();}
 else {hideArcade();study.showPicker();}
}
function finishEntry(){
 if(!initialized&&!study.isOpen)beginStudy();
 else if(initialized){showArcade();void route();}
 updateAccountMenu();
}
function updateAccountMenu(){
 const session=accounts.session();
 document.querySelector('#account-summary')!.textContent=session?`Signed in as ${session.username}`:'Playing as guest';
 document.querySelector<HTMLElement>('#open-accounts')!.hidden=!!session;
 document.querySelector<HTMLElement>('#logout-account')!.hidden=!session;
 document.querySelector<HTMLElement>('#switch-account')!.hidden=!session;
 document.querySelector<HTMLElement>('#sync-account')!.hidden=!session;
 document.querySelector('#account-sync-status')!.textContent=accounts.message;
 Object.assign(preferences,store.settings());
 for(const [selector,key] of [['#sound','sound'],['#motion','reducedMotion'],['#colour','colorBlind']] as const)document.querySelector<HTMLInputElement>(selector)!.checked=preferences[key];
 document.documentElement.classList.toggle('reduce-motion',preferences.reducedMotion);
}
accounts.beforeIdentityChange=()=>{generation++;leave(false);};
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
let signingOut=false;
async function logoutAccount(switching=false){
 if(signingOut)return;signingOut=true;
 const buttons=['#logout-account','#switch-account'].map(id=>document.querySelector<HTMLButtonElement>(id)!);
 for(const button of buttons)button.disabled=true;
 try{
  if(activeId)setPaused(true);
  await accounts.logout();menu.close();
  if(switching)accountView.open();else finishEntry();
 }finally{signingOut=false;for(const button of buttons)button.disabled=false;}
}
document.querySelector('#logout-account')!.addEventListener('click',()=>void logoutAccount());
document.querySelector('#switch-account')!.addEventListener('click',()=>void logoutAccount(true));
accounts.start(false);updateAccountMenu();
if(accounts.session()||store.read('accounts:guest',false))beginStudy();
else accountView.open();
