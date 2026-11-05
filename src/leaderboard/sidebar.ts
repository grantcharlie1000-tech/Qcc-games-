import * as store from '../core/storage';
import type {GameId} from '../core/types';
import type {LeaderboardSync} from './client';
import {scoredGame,MINESWEEPER_RANKINGS,type LeaderboardKey,type Board} from './shared';
import {formatScore} from './format';
const trophy='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3zm0 4H6v1a2 2 0 0 0 1 1.7zm10 0v2.7A2 2 0 0 0 18 8V7z" fill="currentColor"/></svg>';
/**
 * A floating, collapsible companion to the opt-in leaderboard dialog. It overlays the
 * page instead of taking layout space, so the game never moves or shrinks for it.
 */
export class LeaderboardSidebar {
 readonly root=document.createElement('aside');
 private readonly wide=matchMedia('(min-width: 1160px) and (hover: hover) and (pointer: fine)');
 private key:LeaderboardKey;
 private disposed=false;private request=0;private busy=false;private refreshPending=false;private lastLoaded=0;private unsubscribe:()=>void;
 constructor(game:GameId,title:string,private sync:LeaderboardSync,open:(key:LeaderboardKey)=>void){
  const saved=store.savedGame('minesweeper') as {level?:unknown}|undefined;
  const levelKey=saved?.level==='intermediate'?'minesweeper-medium':saved?.level==='expert'?'minesweeper-hard':'minesweeper-easy';
  const choice=store.read<unknown>('leaderboard:ms-panel-key',null);
  this.key=game==='minesweeper'?(MINESWEEPER_RANKINGS.includes(choice as typeof MINESWEEPER_RANKINGS[number])?choice as typeof MINESWEEPER_RANKINGS[number]:levelKey):game;
  this.root.className='lb-sidebar ui-glass-sheet';this.root.setAttribute('aria-label',`${title} leaderboard`);
  this.root.innerHTML=`<button class="lb-toggle" type="button" aria-expanded="false" aria-controls="lb-panel">${trophy}<span>Top scores</span></button>
   <div class="lb-panel" id="lb-panel" hidden>
    <div class="lb-head"><div class="lb-heading">${trophy}<h2><span>Top scores</span><small></small></h2></div><button class="lb-collapse" type="button" aria-label="Hide top scores"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
    ${game==='minesweeper'?`<div class="lb-segments" role="radiogroup" aria-label="Ranking">${MINESWEEPER_RANKINGS.map((key,i)=>`<button type="button" role="radio" data-key="${key}" aria-checked="${key===this.key}" tabindex="${key===this.key?0:-1}">${['Easy','Med','Hard','Score'][i]}</button>`).join('')}</div>`:''}
    <p class="lb-status muted" role="status"></p>
    <div class="lb-scroll" tabindex="0" role="region" aria-label="Top scores"><table class="lb-table"><caption class="sr-only">Top scores</caption><colgroup><col class="lb-c-rank"><col><col class="lb-c-score"></colgroup><thead class="sr-only"><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col">Score</th></tr></thead><tbody></tbody></table></div>
    <div class="lb-actions"><button class="lb-open" type="button"></button><button class="lb-refresh" type="button" aria-label="Refresh"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M5.5 9a7 7 0 0 1 12-2L20 12M4 12l2.5 5a7 7 0 0 0 12-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
   </div>`;
  this.root.querySelector('.lb-head small')!.textContent=title;
  // Keep all focused-list keydowns out of game shortcuts, including Shift before
  // Shift+Space/Tab. Native scrolling and focus movement still run; keyup may
  // reach the game to release any controls held before focus entered the list.
  this.root.querySelector<HTMLElement>('.lb-scroll')!.addEventListener('keydown',event=>event.stopPropagation());
  // A pointer click hands focus back to the game so Space/arrow keys keep playing instead of re-pressing a panel button.
  const toggle=(open:boolean)=>(event:Event)=>{this.setExpanded(open);if((event as MouseEvent).detail>0)document.querySelector<HTMLElement>('#game-stage')?.focus({preventScroll:true});};
  this.root.querySelector('.lb-toggle')!.addEventListener('click',toggle(true));
  this.root.querySelector('.lb-collapse')!.addEventListener('click',toggle(false));
  this.root.querySelector('.lb-open')!.addEventListener('click',()=>open(this.key));
  const segments=this.root.querySelector<HTMLElement>('.lb-segments');
  if(segments){
   const buttons=Array.from(segments.querySelectorAll<HTMLButtonElement>('button'));
   const choose=(button:HTMLButtonElement)=>{
    this.key=button.dataset.key as LeaderboardKey;
    for(const item of buttons){const selected=item===button;item.setAttribute('aria-checked',String(selected));item.tabIndex=selected?0:-1;}
    store.write('leaderboard:ms-panel-key',this.key);this.request++;this.lastLoaded=0;this.paint(null);
    if(this.active())void this.refresh();else if(this.wide.matches&&this.expanded&&!document.hidden)this.offline();
   };
   for(const button of buttons)button.addEventListener('click',event=>{choose(button);if(event.detail>0)document.querySelector<HTMLElement>('#game-stage')?.focus({preventScroll:true});});
   segments.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const current=buttons.findIndex(button=>button.getAttribute('aria-checked')==='true');const next=buttons[(current+(['ArrowRight','ArrowDown'].includes(event.key)?1:-1)+buttons.length)%buttons.length]!;choose(next);next.focus();});
  }
  this.root.querySelector('.lb-refresh')!.addEventListener('click',event=>{void this.refresh();if((event as MouseEvent).detail>0)document.querySelector<HTMLElement>('#game-stage')?.focus({preventScroll:true});});
  // A sibling of the game view, positioned fixed, so it never enters the game's layout or fit transform.
  document.querySelector('.game-view')!.after(this.root);
  this.wide.addEventListener('change',this.visibility);window.addEventListener('online',this.online);
  this.unsubscribe=sync.onSynced(game=>{if(game===this.key)void this.refresh();});
  document.addEventListener('visibilitychange',this.visibility);window.addEventListener('offline',this.visibility);
  this.setExpanded(store.read<boolean>('leaderboard:panel-open',false)===true,false);
 }
 private get expanded(){return this.root.querySelector('.lb-toggle')!.getAttribute('aria-expanded')==='true';}
 private setExpanded(open:boolean,remember=true){
  const toggle=this.root.querySelector<HTMLButtonElement>('.lb-toggle')!,panel=this.root.querySelector<HTMLElement>('.lb-panel')!;
  const hadFocus=this.root.contains(document.activeElement);
  toggle.setAttribute('aria-expanded',String(open));toggle.hidden=open;panel.hidden=!open;this.root.classList.toggle('open',open);
  if(remember)store.write('leaderboard:panel-open',open);
  this.label();
  if(hadFocus)(open?this.root.querySelector<HTMLElement>('.lb-collapse'):toggle)!.focus();
  const fresh=this.lastLoaded&&Date.now()-this.lastLoaded<=180000;
  this.visibility();if(open&&this.active()&&fresh)void this.refresh();
 }
 private visibility=()=>{this.root.hidden=!this.wide.matches;if(this.active()){if(!this.lastLoaded||Date.now()-this.lastLoaded>180000)void this.refresh();}else{this.request++;if(this.wide.matches&&this.expanded&&!document.hidden)this.offline();}};
 private offline(){this.paint(this.sync.cached(this.key));this.status('Offline · showing saved rankings.');}
 private active(){return !this.disposed&&this.wide.matches&&this.expanded&&!document.hidden&&navigator.onLine;}
 private online=()=>{void this.refresh();};
 private label(){this.root.querySelector('.lb-open')!.textContent='All rankings';}
 private status(text:string){this.root.querySelector('.lb-status')!.textContent=text;}
 private paint(board:Board|null){
  const body=this.root.querySelector('tbody')!;body.replaceChildren();
  for(const entry of board?.entries??[]){const row=document.createElement('tr');const you=entry.playerId===board?.player?.playerId;if(you)row.className='lb-you';
   for(const value of [entry.rank,entry.name+(entry.account?' · account':''),formatScore(this.key,entry.score)]){const cell=document.createElement('td');cell.textContent=String(value);row.append(cell);}
   row.children[1]!.setAttribute('title',entry.name+(you?' (you)':''));body.append(row);}
  this.root.querySelector<HTMLElement>('.lb-table')!.hidden=!board?.entries.length;
 }
 private async refresh(){
  if(!this.active())return;
  if(this.busy){this.refreshPending=true;return;}
  const request=++this.request;this.label();
  this.busy=true;
  if(!this.root.querySelector('tbody')!.childElementCount)this.status('Loading…');
  try{const board=await this.sync.load(this.key);if(this.disposed||request!==this.request)return;this.paint(board);this.lastLoaded=Date.now();
   const mine=board.player;this.status(mine?`You: #${mine.rank} · ${formatScore(this.key,mine.score)}`:board.entries.length?'':'No scores yet');}
  catch{if(this.disposed||request!==this.request)return;const cached=this.sync.cached(this.key);this.paint(cached);this.status(cached?'Offline · showing saved rankings.':'Rankings unavailable right now.');}
  finally{this.busy=false;if(this.refreshPending){this.refreshPending=false;void this.refresh();}}
 }
 dispose(){this.unsubscribe();document.removeEventListener('visibilitychange',this.visibility);window.removeEventListener('offline',this.visibility);this.disposed=true;this.request++;this.wide.removeEventListener('change',this.visibility);window.removeEventListener('online',this.online);this.root.remove();}
 static supports(game:GameId){return scoredGame(game)&&game!=='pool';}
}
