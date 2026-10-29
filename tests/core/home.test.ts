import {expect,test} from 'vitest';
import {games} from '../../src/core/catalog';
import {uiIcon} from '../../src/ui/icons';
import type {GameId} from '../../src/core/types';
import {RAILS,featured,homeMarkup,relativeTime,type HomeState} from '../../src/library/home';

const DAY=86_400_000;
const NOW=Date.UTC(2026,9,29,12);
const LAUNCH='<a class="movies-launch" href="#/movies" aria-label="Movies &amp; TV"><h2>Movies &amp; TV</h2></a>';
const state=(over:Partial<HomeState>={}):HomeState=>({search:'',onlyFavourites:false,favourites:[],best:()=>0,savedAt:()=>undefined,now:NOW,...over});
const cardTitles=(html:string)=>[...html.matchAll(/class="game-card[^"]*" href="[^"]*" aria-label="Play ([^"]+)"/g)].map(match=>match[1]);
const continueTitles=(html:string)=>[...html.matchAll(/class="continue-card[^"]*" href="[^"]*" aria-label="Continue ([^"]+)"/g)].map(match=>match[1]);
const heroOf=(html:string)=>html.match(/<section class="arcade-hero[\s\S]*?<\/section>/)?.[0]??'';

test('each game appears once, in catalog order, across three rails',()=>{
  const html=homeMarkup(state(),LAUNCH);
  expect(html.match(/class="game-card/g)).toHaveLength(21);
  const expected=RAILS.flatMap(rail=>games.filter(game=>game.genre===rail.genre).map(game=>game.title));
  expect(cardTitles(html)).toEqual(expected);
  expect(new Set(cardTitles(html)).size).toBe(21);
  const heads=RAILS.map(rail=>html.indexOf(`<h2>${rail.title.replace(/&/g,'&amp;')}</h2>`));
  expect(heads.every(at=>at>=0)).toBe(true);
  expect([...heads].sort((a,b)=>a-b)).toEqual(heads);
  expect(html.match(/class="game-card[^>]*href="([^"]+)"/)?.[1]).toBe('#/collection/1');
  expect(cardTitles(html)[0]).toBe('Block Blast');
});

test('searching shows one results section and no hero',()=>{
  const html=homeMarkup(state({search:'snake'}),LAUNCH);
  expect(html).not.toContain('arcade-hero');
  expect(html.match(/<section class="ui-rail"/g)).toHaveLength(1);
  expect(html).toContain('<h2>Results</h2>');
  expect(html.match(/class="game-card/g)).toHaveLength(1);
  expect(cardTitles(html)).toEqual(['Snake']);
});

test('empty favourites keep the existing guidance',()=>{
  const html=homeMarkup(state({onlyFavourites:true}),LAUNCH);
  expect(html).toContain('Your favourites live here. Open a game and tap its star to add it.');
  expect(html).toContain('<h2>Favourites</h2>');
  expect(html).not.toContain('arcade-hero');
});

test('the hero shows the newest save and nothing without one',()=>{
  const saves:Partial<Record<GameId,number>>={tower:NOW-5*60_000,snake:NOW-60_000};
  const saved=state({savedAt:id=>saves[id]});
  expect(featured(saved)).toEqual({game:games.find(game=>game.id==='snake'),mode:'continue'});
  expect(homeMarkup(saved,LAUNCH)).toContain('Continue playing');
  expect(featured(state())).toBeUndefined();
  const none=homeMarkup(state(),LAUNCH);
  expect(none).not.toContain('arcade-hero');
  expect(none).not.toContain('Game of the day');
});

test('continue cards are named Continue {title}, newest first, at most 10',()=>{
  // Twelve games are saved; later catalog entries were saved more recently, so the order is not catalog order.
  const savedAt=(id:GameId)=>{const index=games.findIndex(game=>game.id===id);return index<12?NOW-(100-index)*60_000:undefined;};
  const html=homeMarkup(state({savedAt}),LAUNCH);
  expect(continueTitles(html)).toEqual(games.slice(2,12).reverse().map(game=>game.title));
  expect(html).toContain('<h2>Continue playing</h2>');
});

test('continue cards reuse the shared card parts and keep the continue name',()=>{
  const html=homeMarkup(state({savedAt:()=>NOW-90_000}),LAUNCH);
  const card=html.match(/<a class="continue-card[^"]*"[\s\S]*?<\/a>/)?.[0]??'';
  expect(card).toContain('aria-label="Continue Block Blast"');
  expect(card).toContain('<span class="ui-card-poster">');
  expect(card).toContain('<span class="ui-card-placeholder" aria-hidden="true">');
  expect(card).toContain('<span class="ui-card-title">Block Blast</span>');
  expect(card).toContain('<span class="ui-card-meta">Saved 1 min ago</span>');
  expect(card).not.toContain('game-card');
  expect(card).not.toContain('continue-cover');
});

test('no hero control is named Play {title}',()=>{
  const hero=heroOf(homeMarkup(state({savedAt:()=>NOW-60_000}),LAUNCH));
  expect(hero).not.toMatch(/aria-label="Play /);
  expect(hero).toMatch(/>Continue<\/a>/);
});

test('relativeTime thresholds',()=>{
  const cases:Array<[number,string]>=[
    [-5_000,'just now'],[0,'just now'],[59_999,'just now'],[60_000,'1 min ago'],[59*60_000,'59 min ago'],
    [3_600_000,'1 h ago'],[23*3_600_000,'23 h ago'],[24*3_600_000,'yesterday'],[47*3_600_000,'yesterday'],
    [48*3_600_000,'2 days ago'],[6*DAY,'6 days ago'],
  ];
  for(const [age,text] of cases)expect(relativeTime(NOW-age,NOW)).toBe(text);
});

test('the hero favourite button shows its state in the label and icon, without aria-pressed',()=>{
  const saved=state({savedAt:()=>NOW-60_000});
  const id=featured(saved)!.game.id;
  const off=heroOf(homeMarkup(saved,LAUNCH));
  expect(off).toContain(`data-hero-favourite="${id}">`);
  expect(off).not.toContain('aria-pressed');
  expect(off).toContain(uiIcon('star'));
  expect(off).toContain('Add to favourites</button>');
  const on=heroOf(homeMarkup({...saved,favourites:[id]},LAUNCH));
  expect(on).toContain(`data-hero-favourite="${id}">`);
  expect(on).not.toContain('aria-pressed');
  expect(on).toContain(uiIcon('check'));
  expect(on).toContain('In favourites</button>');
});

test('card meta shows the best score, a save or New',()=>{
  const html=homeMarkup(state({best:id=>id==='snake'?42:0,savedAt:id=>id==='tower'?NOW-1000:undefined}),LAUNCH);
  expect(html).toContain('<span class="ui-card-meta">Arcade · Best 42</span>');
  expect(html).toContain('<span class="ui-card-meta">Arcade · Saved</span>');
  expect(html).toContain('<span class="ui-card-meta">Puzzle · New</span>');
  expect(html).toContain('<span class="ui-chip rating">★ 42</span>');
});

test('the Movies launch opens the library grid and carries no game-card class',()=>{
  const html=homeMarkup(state(),LAUNCH);
  expect(html).toContain('<h1 class="sr-only">Mauri Study Notes · Games</h1>');
  expect(html.indexOf(`<div class="game-grid" aria-label="Game library">${LAUNCH}`)).toBeGreaterThanOrEqual(0);
  expect(html).not.toMatch(/class="game-card[^"]*"[^>]*aria-label="Movies/);
});

test('footer carries the copy, links and the leaderboards action',()=>{
  const html=homeMarkup(state(),LAUNCH);
  expect(html).toContain('<footer class="site-footer ui-footer">');
  expect(html).toContain('<strong>Mauri Study Notes</strong><span>Games, films and revision in one place</span>');
  expect(html).toContain('<nav class="ui-footer-links" aria-label="Footer"><a href="#/collection">Games</a><a href="#/movies/browse/movie">Movies</a><a href="#/movies/browse/tv">TV Shows</a><button type="button" data-action="leaderboards">Leaderboards</button></nav>');
  expect(html).toContain('<p>21 games. No ads. Optional accounts.</p>');
});
