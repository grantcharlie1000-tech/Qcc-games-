import * as store from '../core/storage';
import type {GameId} from '../core/types';
import type {LeaderboardSync} from './client';
import {scoredGame,type Board,type LeaderboardKey} from './shared';
import {formatScore} from './format';
const trophy='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3zm0 4H6v1a2 2 0 0 0 1 1.7zm10 0v2.7A2 2 0 0 0 18 8V7z" fill="currentColor"/></svg>';
/**
 * A floating, collapsible companion to the opt-in leaderboard dialog. It overlays the
 * page instead of taking layout space, so the game never moves or shrinks for it.
 */
export class LeaderboardSidebar {
 readonly root=document.createElement('aside');
 private readonly wide=matchMedia('(min-width: 720px)');
 private disposed=false;private request=0;private busy=false;private refreshPending=false;private timer:ReturnType<typeof setTimeout>|undefined;private unsubscribe:()=>void;
 private readonly game:LeaderboardKey;
 constructor(game:GameId,title:string,private sync:LeaderboardSync,open:()=>void){
  this.game=game==='minesweeper'?'minesweeper-score':game;
  this.root.className='lb-sidebar';this.root.setAttribute('aria-label',`${title} leaderboard`);
  this.root.innerHTML=`<button class="lb-toggle" type="button" aria-expanded="false" aria-controls="lb-panel">${trophy}<span>Top scores</span></button>
   <div class="lb-panel" id="lb-panel" hidden>
    <div class="lb-head"><h2><span>Top scores</span><small></small></h2><button class="icon-button lb-collapse" type="button" aria-label="Hide top scores"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
    <p class="lb-status muted" role="status"></p>
    <div class="lb-scroll"><table class="lb-table"><caption class="sr-only">Top scores</caption><thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col">Score</th></tr></thead><tbody></tbody></table></div>
    <div class="lb-actions"><button class="game-button secondary lb-open" type="button"></button><button class="game-button secondary lb-refresh" type="button">Refresh</button></div>
   </div>`;
  this.root.querySelector('.lb-head small')!.textContent=title;
  // A pointer click hands focus back to the game so Space/arrow keys keep playing instead of re-pressing a panel button.
  const toggle=(open:boolean)=>(event:Event)=>{this.setExpanded(open);if((event as MouseEvent).detail>0)document.querySelector<HTMLElement>('#game-stage')?.focus({preventScroll:true});};
  this.root.querySelector('.lb-toggle')!.addEventListener('click',toggle(true));
  this.root.querySelector('.lb-collapse')!.addEventListener('click',toggle(false));
  this.root.querySelector('.lb-open')!.addEventListener('click',open);
  this.root.querySelector('.lb-refresh')!.addEventListener('click',()=>void this.refresh());
  // A sibling of the game view, positioned fixed, so it never enters the game's layout or fit transform.
  document.querySelector('.game-view')!.after(this.root);
  this.wide.addEventListener('change',this.visibility);window.addEventListener('online',this.online);
  this.unsubscribe=sync.onSynced(game=>{if(game===this.game)void this.refresh();});
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
  this.visibility();
 }
 private visibility=()=>{this.root.hidden=!this.wide.matches;clearTimeout(this.timer);if(this.active())void this.refresh();else{this.request++;if(this.wide.matches&&this.expanded&&!document.hidden)this.offline();}};
 private offline(){this.paint(this.sync.cached(this.game));this.status('Offline · showing saved rankings.');}
 private active(){return !this.disposed&&this.wide.matches&&this.expanded&&!document.hidden&&navigator.onLine;}
 private schedule(){clearTimeout(this.timer);if(this.active())this.timer=setTimeout(()=>void this.refresh(),30000);}
 private online=()=>{void this.refresh();};
 private label(){this.root.querySelector('.lb-open')!.textContent='All rankings';}
 private status(text:string){this.root.querySelector('.lb-status')!.textContent=text;}
 private paint(board:Board|null){
  const body=this.root.querySelector('tbody')!;body.replaceChildren();
  for(const entry of board?.entries??[]){const row=document.createElement('tr');const you=entry.playerId===board?.player?.playerId;if(you)row.className='lb-you';
   for(const value of [entry.rank,entry.name+(entry.account?' · account':''),formatScore(this.game,entry.score)]){const cell=document.createElement('td');cell.textContent=String(value);row.append(cell);}
   row.children[1]!.setAttribute('title',entry.name+(you?' (you)':''));body.append(row);}
  this.root.querySelector<HTMLElement>('.lb-table')!.hidden=!board?.entries.length;
 }
 private async refresh(){
  if(!this.active())return;
  if(this.busy){this.refreshPending=true;return;}
  const request=++this.request;this.label();
  this.busy=true;clearTimeout(this.timer);
  if(!this.root.querySelector('tbody')!.childElementCount)this.status('Loading…');
  try{const board=await this.sync.load(this.game);if(this.disposed||request!==this.request)return;this.paint(board);
   const mine=board.player;this.status(mine?`You: #${mine.rank} · ${formatScore(this.game,mine.score)}`:board.entries.length?'Best score per player.':'No scores yet. Be the first!');}
  catch{if(this.disposed||request!==this.request)return;const cached=this.sync.cached(this.game);this.paint(cached);this.status(cached?'Offline · showing saved rankings.':'Rankings unavailable right now.');}
  finally{this.busy=false;if(this.refreshPending){this.refreshPending=false;void this.refresh();}else this.schedule();}
 }
 dispose(){clearTimeout(this.timer);this.unsubscribe();document.removeEventListener('visibilitychange',this.visibility);window.removeEventListener('offline',this.visibility);this.disposed=true;this.request++;this.wide.removeEventListener('change',this.visibility);window.removeEventListener('online',this.online);this.root.remove();}
 static supports(game:GameId){return scoredGame(game)&&game!=='pool';}
}
