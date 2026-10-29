import {games,artUrl} from '../core/catalog';
import type {GameInfo} from '../core/catalog';
import type {GameId} from '../core/types';
import {entryHash} from '../core/navigation';
import {uiIcon} from '../ui/icons';
import mauriMark from '../assets/mauri-mark.svg?raw';

export interface HomeState{search:string;onlyFavourites:boolean;favourites:readonly GameId[];best(id:GameId):number;savedAt(id:GameId):number|undefined;now:number}
export const RAILS:ReadonlyArray<{genre:GameInfo['genre'];title:string;subtitle:string}>=[
  {genre:'Puzzle',title:'Puzzle games',subtitle:'Think it through'},
  {genre:'Arcade',title:'Arcade action',subtitle:'Quick reflexes'},
  {genre:'Classic',title:'Classics & sandbox',subtitle:'Take your time'},
];
const DAY=86_400_000;
const esc=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const count=(n:number)=>`${n} ${n===1?'game':'games'}`;

// The newest save leads; with no saves, the hero is the game of the day, which changes each day.
export function featured(state:HomeState):{game:GameInfo;mode:'continue'|'daily'}{
  let latest:{game:GameInfo;at:number}|undefined;
  for(const game of games){const at=state.savedAt(game.id);if(at!==undefined&&(!latest||at>latest.at))latest={game,at};}
  if(latest)return {game:latest.game,mode:'continue'};
  return {game:games[Math.floor(state.now/DAY)%games.length],mode:'daily'};
}

export function relativeTime(then:number,now:number):string{
  const age=now-then;
  if(age<60_000)return 'just now';
  if(age<3_600_000)return `${Math.floor(age/60_000)} min ago`;
  if(age<86_400_000)return `${Math.floor(age/3_600_000)} h ago`;
  if(age<172_800_000)return 'yesterday';
  return `${Math.floor(age/86_400_000)} days ago`;
}

function gameCard(game:GameInfo,state:HomeState,priority:boolean):string{
  const best=state.best(game.id);
  const status=best>0?`Best ${best}`:state.savedAt(game.id)!==undefined?'Saved':'New';
  return `<a class="game-card ui-card" href="${entryHash(game.id)}" aria-label="Play ${esc(game.title)}" style="--card:${game.color};--ink:${game.ink};--accent:${game.accent}"><span class="ui-card-poster"><span class="ui-card-placeholder" aria-hidden="true">${uiIcon('image')}</span><img class="ui-card-img" src="${artUrl(game.id)}" alt="" width="320" height="400" decoding="async" draggable="false"${priority?' fetchpriority="high"':''}><span class="ui-card-chips"><span class="ui-chip">${esc(game.genre)}</span>${best>0?`<span class="ui-chip rating">★ ${best}</span>`:''}</span><span class="ui-card-play" aria-hidden="true">${uiIcon('play')}</span></span><span class="ui-card-caption"><h3 class="ui-card-title">${esc(game.title)}</h3><span class="ui-card-meta">${esc(game.genre)} · ${status}</span></span></a>`;
}

function continueCard(game:GameInfo,at:number,now:number):string{
  return `<a class="continue-card ui-card" href="${entryHash(game.id)}" aria-label="Continue ${esc(game.title)}"><span class="ui-card-poster"><span class="ui-card-placeholder" aria-hidden="true">${uiIcon('image')}</span><img class="ui-card-img" src="${artUrl(game.id)}" alt="" width="320" height="180" decoding="async" draggable="false"></span><span class="ui-card-caption"><span class="ui-card-title">${esc(game.title)}</span><span class="ui-card-meta">Saved ${relativeTime(at,now)}</span></span></a>`;
}

function heroMarkup(state:HomeState,pick:{game:GameInfo;mode:'continue'|'daily'}):string{
  const {game,mode}=pick;
  const at=state.savedAt(game.id);
  const best=state.best(game.id);
  const favourite=state.favourites.includes(game.id);
  return `<section class="arcade-hero ui-hero" aria-labelledby="arcade-hero-title"><img class="ui-hero-backdrop" src="${artUrl(game.id)}" alt=""><span class="ui-hero-shade"></span><div class="ui-hero-content ui-container"><div class="ui-hero-badges"><span class="ui-chip">${mode==='continue'?'Continue playing':'Game of the day'}</span><span class="ui-chip">${esc(game.genre)}</span>${best>0?`<span class="ui-chip rating">★ ${best}</span>`:''}</div><h2 class="ui-hero-title" id="arcade-hero-title">${esc(game.title)}</h2><p class="ui-hero-meta">${esc(game.genre)} · ${at!==undefined?`Saved ${relativeTime(at,state.now)}`:'New'}</p><p class="ui-hero-overview">${esc(game.blurb)}</p><div class="ui-hero-actions"><a class="ui-btn primary" href="${entryHash(game.id)}">${uiIcon('play')}${mode==='continue'?'Continue':'Play now'}</a><button class="ui-btn secondary" data-hero-favourite="${game.id}">${uiIcon(favourite?'check':'star')}${favourite?'In favourites':'Add to favourites'}</button></div></div><img class="ui-hero-poster" src="${artUrl(game.id)}" alt=""></section>`;
}

function railMarkup(id:string,title:string,subtitle:string,total:number,row:string):string{
  return `<section class="ui-rail" data-rail="${id}"><div class="ui-rail-head"><h2>${esc(title)}</h2><span class="ui-count">${count(total)}</span><p class="ui-rail-sub">${esc(subtitle)}</p></div><div class="ui-rail-body"><button class="ui-rail-arrow prev" data-scroll="-1" aria-label="Previous ${esc(title)}">${uiIcon('chevron-left')}</button><div class="ui-rail-row">${row}</div><button class="ui-rail-arrow next" data-scroll="1" aria-label="Next ${esc(title)}">${uiIcon('chevron-right')}</button></div></section>`;
}

function resultsMarkup(state:HomeState,matches:GameInfo[],priority:()=>boolean):string{
  const body=matches.length
    ?`<div class="ui-grid">${matches.map(game=>gameCard(game,state,priority())).join('')}</div>`
    :`<p class="empty-library">${state.onlyFavourites?'Your favourites live here. Open a game and tap its star to add it.':'No games found. Try another name.'}</p>`;
  return `<section class="ui-rail" data-rail="results"><div class="ui-rail-head"><h2>${state.onlyFavourites?'Favourites':'Results'}</h2><span class="ui-count">${count(matches.length)}</span></div>${body}</section>`;
}

function footerMarkup():string{
  return `<footer class="site-footer ui-footer"><div class="ui-footer-brand"><span class="ui-brand-tile">${mauriMark}</span><strong>Mauri Study Notes</strong><span>Games, films and revision in one place</span></div><nav class="ui-footer-links" aria-label="Footer"><a href="#/collection">Games</a><a href="#/movies/browse/movie">Movies</a><a href="#/movies/browse/tv">TV Shows</a><button type="button" data-action="leaderboards">Leaderboards</button></nav><p>${games.length} games. No ads. Optional accounts.</p></footer>`;
}

// The hero is left out while filtering. `launch` is the Movies & TV card, which sits at the top of the library grid.
export function homeMarkup(state:HomeState,launch:string):string{
  const filtering=state.search!==''||state.onlyFavourites;
  const needle=state.search.toLowerCase();
  let shown=0;
  const priority=()=>shown++<2;
  let rails='';
  if(filtering){
    const matches=games.filter(game=>(!state.onlyFavourites||state.favourites.includes(game.id))&&game.title.toLowerCase().includes(needle));
    rails=resultsMarkup(state,matches,priority);
  }else{
    const saved=games.map(game=>({game,at:state.savedAt(game.id)})).filter((item):item is {game:GameInfo;at:number}=>item.at!==undefined).sort((a,b)=>b.at-a.at).slice(0,10);
    if(saved.length)rails+=railMarkup('continue','Continue playing','Pick up where you left off',saved.length,saved.map(item=>continueCard(item.game,item.at,state.now)).join(''));
    for(const section of RAILS){
      const items=games.filter(game=>game.genre===section.genre);
      rails+=railMarkup(section.genre.toLowerCase(),section.title,section.subtitle,items.length,items.map(game=>gameCard(game,state,priority())).join(''));
    }
  }
  return `<h1 class="sr-only">Mauri Study Notes · Games</h1>${filtering?'':heroMarkup(state,featured(state))}<div class="game-grid" aria-label="Game library">${launch}${rails}</div>${footerMarkup()}`;
}
