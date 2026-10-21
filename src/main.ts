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
import {LeaderboardView} from './leaderboard/view';

const icon=(name:string)=>{
  const paths:Record<string,string>={menu:'<path d="M4 7h16M4 12h10"/>',back:'<path d="m14 5-7 7 7 7M7 12h14"/>',star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',pause:'<path d="M8 5v14M16 5v14"/>',play:'<path d="m8 4 12 8-12 8z"/>',restart:'<path d="M4 5v6h6M4 11a8 8 0 1 1 1 7"/>',rules:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>'};
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.grid}</svg>`;
};
const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`<header class="topbar"><button class="hamburger icon-button" aria-label="Open menu">${icon('menu')}</button><div class="count-pill" aria-label="${games.length} games">${icon('grid')}<strong>${games.length}</strong></div><button class="favourites-pill" aria-pressed="false">${icon('star')}<span>FAVOURITES</span></button></header><main id="content"></main>
<dialog id="menu"><form method="dialog" class="dialog-head"><h2>Pocket Arcade</h2><button class="icon-button" aria-label="Close menu">${icon('close')}</button></form><label class="search-label" for="search">Find a game</label><input id="search" type="search" placeholder="Search the ${games.length} games" autocomplete="off"><div class="setting-list"><label><span>Sound</span><input type="checkbox" id="sound"></label><label><span>Reduce motion</span><input type="checkbox" id="motion"></label><label><span>Colour-blind patterns</span><input type="checkbox" id="colour"></label></div><button id="open-leaderboards" class="game-button secondary leaderboard-menu-button">Leaderboards</button><button id="open-study" class="game-button secondary study-menu-button">Study Mode</button><p id="study-menu-summary" class="muted study-menu-summary"></p><section id="update-notice" hidden><p id="update-status" class="muted" role="status"></p><button id="reload-update" class="game-button" aria-describedby="update-status" hidden>Reload to update</button></section><button class="game-button offline-button">Make all games available offline</button><progress id="download-progress" hidden></progress><p id="offline-status" class="muted">Download once while online. Caching is specific to this browser and device and may be restricted or cleared by device policy.</p><p id="storage-status" class="muted"></p><p class="menu-note">${games.length} games. No ads. No accounts.<br>Made for a little time to play.</p></dialog>
<dialog id="rules-dialog"><form method="dialog" class="dialog-head"><h2>How to play</h2><button class="icon-button" aria-label="Close rules">${icon('close')}</button></form><p id="rules-text"></p><button class="game-button rules-done">Let’s play</button></dialog><div class="sr-only" id="announcer" aria-live="polite"></div>`;
const content=document.querySelector<HTMLElement>('#content')!;
const menu=document.querySelector<HTMLDialogElement>('#menu')!;
const rulesDialog=document.querySelector<HTMLDialogElement>('#rules-dialog')!;
const preferences=store.settings();
const leaderboards=new LeaderboardView();
let onlyFavourites=false, search='', instance:GameInstance|undefined, activeId:GameId|undefined;
let paused=false, generation=0, autosave:number|undefined, pausedForDialog=false;
let initialized=false, resumeAfterStudy=false, focusBeforeStudy:HTMLElement|null=null, scrollBeforeStudy={x:0,y:0};
let focusLabelBeforeStudy:string|null=null;
let libraryScroll={x:0,y:0};
let stopFitting:(()=>void)|undefined;
const referenceGames=new Set<GameId>(['animal-stack','water-sort','color-blocks','ball-run','neon-coil']);
// Responsive WebGL layouts fill the standard stage; a scale transform would break pointer mapping.
const fillGames=new Set<GameId>(['globle']);

function syncViewportLock(){
  document.documentElement.classList.toggle('game-viewport',!!activeId&&!document.body.classList.contains('study-active'));
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
  try {const durable=store.saveGame(activeId,instance.serialize());storageStatus();return durable;}
  catch {announce('This game could not save this time.');return false;}
}
let updateReady=false,updateBusy=false,updateRequest=0,updateFailure='';
// Any new topic intent cancels the old request, even if the reader returns to
// its starting topic before activation finishes.
study.root.addEventListener('change',event=>{if(updateBusy&&(event.target as Element).id==='study-topic')updateRequest++;});
function showUpdate(message:string){
  const notice=document.querySelector<HTMLElement>('#update-notice')!;
  notice.hidden=!message;document.querySelector('#update-status')!.textContent=message;
  document.querySelector<HTMLButtonElement>('#reload-update')!.hidden=!updateReady;document.querySelector<HTMLButtonElement>('#reload-update')!.disabled=updateBusy;
  study.setUpdateStatus(message,updateReady,updateBusy);
}
async function reloadForUpdate(){
  if(!updateReady||updateBusy)return;
  const request=++updateRequest,gameGeneration=generation,route=location.hash,topic=study.session.topic()?.id;
  updateFailure='';updateBusy=true;showUpdate('Saving your game and starting the update…');
  const result=await reloadAfterActivation(()=>{const saved=setPaused(true);return store.flushPending()&&saved;},activateUpdate,()=>location.reload(),()=>request===updateRequest&&generation===gameGeneration&&location.hash===route&&study.session.topic()?.id===topic);
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
function leave(){
  stopFitting?.();stopFitting=undefined;
  save();instance?.dispose();instance=undefined;activeId=undefined;
  clearInterval(autosave);paused=false;pausedForDialog=false;
  document.body.classList.remove('in-game');
  syncViewportLock();
}
function library(){
  const items=games.filter(g=>(!onlyFavourites||store.favourites().includes(g.id))&&g.title.toLowerCase().includes(search.toLowerCase()));
  content.innerHTML=`<h1 class="sr-only">Pocket Arcade game library</h1><div class="game-grid" aria-label="Game library">${items.map(g=>`<a class="game-card" href="#/game/${g.id}" aria-label="Play ${g.title}" style="--card:${g.color};--ink:${g.ink};--accent:${g.accent}"><h2>${g.title}</h2><span class="title-line"></span><img src="${artUrl(g.id)}" alt="" width="320" height="400" fetchpriority="${['color-blocks','water-sort'].includes(g.id)?'high':'auto'}" draggable="false"></a>`).join('')}</div>${items.length?'':'<p class="empty-library">'+(onlyFavourites?'Your favourites live here. Open a game and tap its star to add it.':'No games found. Try another name.')+'</p>'}`;
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
function openStudy(){
  if(study.isOpen)return;
  focusBeforeStudy=document.activeElement instanceof HTMLElement?document.activeElement:null;
  focusLabelBeforeStudy=focusBeforeStudy?.closest('#game-stage')?focusBeforeStudy.getAttribute('aria-label'):null;
  scrollBeforeStudy={x:scrollX,y:scrollY};
  resumeAfterStudy=!!activeId&&(!paused||pausedForDialog);
  const saved=setPaused(true); // Pause and serialize synchronously, before painting the chapter.
  pausedForDialog=false;
  if(menu.open)menu.close();if(rulesDialog.open)rulesDialog.close();if(leaderboards.root.open)leaderboards.root.close();
  hideArcade();study.showArticle(studyMessage(saved));
}
function returnFromStudy(){
  if(updateBusy)updateRequest++;
  if(!initialized)return;
  study.hide();showArcade();updateStudySummary();
  if(resumeAfterStudy&&!document.hidden)setPaused(false);
  resumeAfterStudy=false;
  window.scrollTo(scrollBeforeStudy.x,scrollBeforeStudy.y);
  const replacement=focusLabelBeforeStudy?[...document.querySelectorAll<HTMLElement>('#game-stage [aria-label]')]
    .find(element=>element.getAttribute('aria-label')===focusLabelBeforeStudy&&!element.matches(':disabled')):undefined;
  const target=focusBeforeStudy?.isConnected&&!focusBeforeStudy.closest('dialog')?focusBeforeStudy:replacement;
  (target??document.querySelector<HTMLElement>(activeId?'#game-stage':'.hamburger'))?.focus({preventScroll:true});
  focusBeforeStudy=null;focusLabelBeforeStudy=null;
}

async function route(){
  if(!initialized)return;
  // Explicit browser/hash navigation leaves the reading view as well as the old game.
  if(study.isOpen){study.hide();showArcade();resumeAfterStudy=false;focusBeforeStudy=null;focusLabelBeforeStudy=null;}
  const requested=location.hash.match(/^#\/game\/([a-z-]+)/)?.[1] as GameId|undefined;
  const id=requested&&games.some(g=>g.id===requested)?requested:undefined;
  const wasInGame=!!activeId;
  if(id&&!wasInGame)libraryScroll={x:scrollX,y:scrollY};
  if(leaderboards.root.open){pausedForDialog=false;leaderboards.root.close();}
  const token=++generation;leave();
  if(!id){library();if(wasInGame)requestAnimationFrame(()=>{if(!activeId)window.scrollTo(libraryScroll.x,libraryScroll.y);});return;}
  const info=games.find(g=>g.id===id)!;activeId=id;document.body.classList.add('in-game');syncViewportLock();window.scrollTo(0,0);
  content.innerHTML=`<section class="game-view" data-game-id="${id}" data-reference-game="${referenceGames.has(id)}" aria-label="${info.title}">
    <div class="game-toolbar">
      <a class="icon-button" href="#/" aria-label="Back to game library">${icon('back')}</a><h1 id="game-title">${info.title}</h1>
      <button id="favourite-game" class="icon-button" aria-label="Favourite ${info.title}" aria-pressed="${store.favourites().includes(id)}">${icon('star')}</button>
      <button id="pause-game" class="icon-button" aria-label="Pause game">${icon('pause')}</button>
      <button id="restart-game" class="icon-button" aria-label="Restart game">${icon('restart')}</button>
      <button id="rules-game" class="icon-button" aria-label="Game rules">${icon('rules')}</button>
      <button id="game-menu" class="icon-button game-menu-button" aria-label="Open menu">${icon('menu')}</button>
    </div>
    <div class="game-metrics"><span id="game-score"><span class="metric-label">${referenceGames.has(id)?id==='animal-stack'?'SOLO':'SCORE':'Score'}</span><strong>0</strong></span><span id="game-level"></span><span id="game-best"><span class="metric-label">${referenceGames.has(id)?'RECORD':'Best'}</span><strong>${store.highScore(id)}</strong><svg class="record-crown" viewBox="0 0 28 12" aria-hidden="true"><path d="m2 9-1-7 7 4 6-6 6 6 7-4-1 7z" fill="currentColor"/></svg></span></div>
    <div class="stage-wrap"><div id="game-stage" tabindex="-1"><p class="loading">Getting your game ready…</p></div><div id="pause-overlay" hidden><div><h2>Paused</h2><button id="resume-game" class="game-button">Keep playing</button></div></div></div>
    <p id="game-status" role="status"></p></section>`;
  document.querySelector('#game-menu')!.addEventListener('click',openMenu);
  try {
    const loaded=await loadGame(id);if(token!==generation)return;
    const stage=document.querySelector<HTMLElement>('#game-stage')!;stage.replaceChildren();
    const mounted=await loaded.mount(stage,{
      id,settings:preferences,highScore:store.highScore(id),
      setScore(score){
        if(token!==generation)return;
        document.querySelector('#game-score strong')!.textContent=String(Math.floor(score));
        const next=store.recordScore(id,score);
        leaderboards.sync.queue(id,Math.floor(next));
        document.querySelector('#game-best strong')!.textContent=String(Math.floor(next));
      },
      setLevel(level){if(token===generation)document.querySelector('#game-level')!.textContent=String(level);},
      setStatus(text){if(token===generation)document.querySelector('#game-status')!.textContent=text;},
      announce,
      save(data){if(token!==generation)return;store.saveGame(id,data);storageStatus();},
      sound(kind){if(token===generation&&!paused&&!study.isOpen)playSound(preferences.sound,kind);}
    });
    if(token!==generation){mounted.dispose();return;}
    instance=mounted;
    const saved=store.savedGame(id);
    if(saved!==undefined){try{instance.restore(saved);}catch{announce('The previous save was not compatible. Starting a fresh game.');}}
    if(!referenceGames.has(id)&&!fillGames.has(id))stopFitting=fitGameStage(stage,stage.parentElement!);
    document.querySelector('#pause-game')!.addEventListener('click',()=>setPaused(!paused));
    document.querySelector('#resume-game')!.addEventListener('click',()=>setPaused(false));
    document.querySelector('#restart-game')!.addEventListener('click',()=>{instance?.restart();setPaused(false);save();});
    document.querySelector('#rules-game')!.addEventListener('click',()=>{
      pausedForDialog=!paused;setPaused(true);
      document.querySelector('#rules-text')!.textContent=loaded.rules;rulesDialog.showModal();
    });
    document.querySelector('#favourite-game')!.addEventListener('click',event=>{
      const selected=store.toggleFavourite(id);
      (event.currentTarget as HTMLButtonElement).setAttribute('aria-pressed',String(selected));
      announce(selected?'Added to favourites':'Removed from favourites');storageStatus();
    });
    autosave=window.setInterval(save,5000);
    if(paused||study.isOpen||document.hidden||menu.open||rulesDialog.open||leaderboards.root.open){
      if(!document.hidden&&(menu.open||rulesDialog.open))pausedForDialog=true;
      setPaused(true);
    }
    if(!study.isOpen&&!menu.open&&!rulesDialog.open&&!leaderboards.root.open)stage.focus();
  }catch(error){
    if(token!==generation)return;
    const stage=document.querySelector('#game-stage')!;
    stage.innerHTML='<p class="game-error"></p><a class="game-button" href="#/">Back to library</a>';
    stage.querySelector('.game-error')!.textContent=error instanceof Error?error.message:'Could not load this game.';
  }
}

function openMenu(){
  pausedForDialog=!!activeId&&!paused;if(activeId)setPaused(true);menu.showModal();void checkForUpdates();
}
document.querySelector('.hamburger')!.addEventListener('click',openMenu);
function dialogClosed(){
  if(menu.open||rulesDialog.open||leaderboards.root.open)return;
  const resume=pausedForDialog;pausedForDialog=false;
  if(resume&&!study.isOpen&&!document.hidden)setPaused(false);
}
menu.addEventListener('close',()=>{if(updateBusy)updateRequest++;dialogClosed();if(!activeId&&!study.isOpen)library();});
rulesDialog.addEventListener('close',dialogClosed);
leaderboards.root.addEventListener('close',dialogClosed);
document.querySelector('#open-leaderboards')!.addEventListener('click',()=>{
  const resume=pausedForDialog||!!activeId&&!paused;
  pausedForDialog=false;if(menu.open)menu.close();if(activeId)setPaused(true);
  leaderboards.open(activeId);pausedForDialog=resume;
});
document.querySelector('.rules-done')!.addEventListener('click',()=>rulesDialog.close());
document.querySelector('#open-study')!.addEventListener('click',openStudy);
document.querySelector('.favourites-pill')!.addEventListener('click',event=>{
  onlyFavourites=!onlyFavourites;
  (event.currentTarget as HTMLElement).setAttribute('aria-pressed',String(onlyFavourites));
  if(activeId)location.hash='#/';else library();
});
document.querySelector<HTMLInputElement>('#search')!.addEventListener('input',event=>{
  search=(event.target as HTMLInputElement).value;if(activeId)location.hash='#/';else library();
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
window.addEventListener('pagehide',save);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&instance)setPaused(true);});
// Capture on window precedes native dialog cancellation and game-local Escape handlers.
window.addEventListener('keydown',event=>{
  // Inert affects DOM targets, not document/window listeners retained by games.
  // Stop their handlers while preserving native reading/keyboard defaults.
  if(study.isOpen&&event.key!=='Escape'){event.stopImmediatePropagation();return;}
  if(event.key!=='Escape'||(!activeId&&!study.isOpen))return;
  event.preventDefault();event.stopImmediatePropagation();
  if(!event.repeat&&!study.isOpen)openStudy();
},{capture:true});
window.addEventListener('keyup',event=>{if(study.isOpen)event.stopImmediatePropagation();},{capture:true});
updateStudySummary();
void checkForUpdates();
if(study.session.topic()){initialized=true;void route();}
else {hideArcade();study.showPicker();}
