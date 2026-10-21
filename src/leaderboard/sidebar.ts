import type {GameId} from '../core/types';
import type {LeaderboardSync} from './client';
import {scoredGame,type Board} from './shared';
/** A read-only companion to the existing opt-in leaderboard dialog. */
export class LeaderboardSidebar {
 readonly root=document.createElement('aside');
 private readonly desktop=matchMedia('(min-width: 1100px)');
 private disposed=false;private request=0;private busy=false;private refreshPending=false;private timer:ReturnType<typeof setTimeout>|undefined;private unsubscribe:()=>void;
 constructor(private game:GameId,title:string,private sync:LeaderboardSync,open:()=>void){
  this.root.className='lb-sidebar';this.root.setAttribute('aria-label',`${title} leaderboard`);
  this.root.innerHTML='<h2></h2><p class="lb-status muted" role="status"></p><table class="lb-table"><caption class="sr-only">Top scores</caption><thead><tr><th>Rank</th><th>Player</th><th>Score</th></tr></thead><tbody></tbody></table><button class="game-button secondary" type="button">Join / view rankings</button><button class="game-button secondary lb-refresh" type="button">Refresh scores</button>';
  if(!scoredGame(game)){this.root.querySelector('table')!.hidden=true;this.root.querySelectorAll('button').forEach(b=>b.hidden=true);}
  this.root.querySelector('h2')!.textContent=`${title} leaderboard`;
  this.root.querySelector('button')!.addEventListener('click',open);
  this.root.querySelector('.lb-refresh')!.addEventListener('click',()=>void this.refresh());
  document.querySelector('#content')?.append(this.root);
  // Append beside, not inside, the transformed/fitted game surface.
  if(!this.root.isConnected)document.querySelector('.game-view')!.before(this.root);
  this.desktop.addEventListener('change',this.visibility);window.addEventListener('online',this.online);
  this.unsubscribe=sync.onSynced(game=>{if(game===this.game)void this.refresh();});
  document.addEventListener('visibilitychange',this.visibility);window.addEventListener('offline',this.visibility);
  this.visibility();
 }
 private visibility=()=>{this.root.hidden=!this.desktop.matches;clearTimeout(this.timer);if(this.active())void this.refresh();else{this.request++;if(this.desktop.matches&&!document.hidden)this.offline();}};
 private offline(){this.paint(this.sync.cached(this.game));this.root.querySelector('.lb-status')!.textContent=scoredGame(this.game)?'Offline · showing saved rankings when available.':'This game does not publish ranked scores yet.';}
 private active(){return !this.disposed&&this.desktop.matches&&window.innerWidth>=1100&&!document.hidden&&navigator.onLine;}
 private schedule(){clearTimeout(this.timer);if(this.active())this.timer=setTimeout(()=>void this.refresh(),30000);}
 private online=()=>{if(this.desktop.matches)void this.refresh();};
 private paint(board:Board|null){
  const body=this.root.querySelector('tbody')!;body.replaceChildren();
  for(const entry of board?.entries??[]){const row=document.createElement('tr');if(entry.playerId===board?.player?.playerId)row.className='lb-you';
   for(const value of [entry.rank,entry.name,entry.score.toLocaleString()]){const cell=document.createElement('td');cell.textContent=String(value);row.append(cell);}body.append(row);}
 }
 private async refresh(){
  if(!this.active())return;
  if(this.busy){this.refreshPending=true;return;}
  if(!this.root.getClientRects().length||getComputedStyle(this.root).visibility==='hidden'){this.schedule();return;}
  const request=++this.request,status=this.root.querySelector('.lb-status')!;
  if(!scoredGame(this.game)){status.textContent='This game does not publish ranked scores yet.';this.root.querySelector('table')!.hidden=true;this.root.querySelectorAll('button').forEach(b=>b.hidden=true);return;}
  this.busy=true;clearTimeout(this.timer);
  status.textContent='Loading shared scores…';
  try{const board=await this.sync.load(this.game);if(this.disposed||request!==this.request)return;this.paint(board);status.textContent=board.entries.length?'Best scores from players online.':'No scores yet. Be the first!';}
  catch{if(this.disposed||request!==this.request)return;const cached=this.sync.cached(this.game);this.paint(cached);status.textContent=cached?'Offline · previously loaded scores.':'Rankings unavailable. You can keep playing.';}
  finally{this.busy=false;if(this.refreshPending){this.refreshPending=false;void this.refresh();}else this.schedule();}
 }
 dispose(){clearTimeout(this.timer);this.unsubscribe();document.removeEventListener('visibilitychange',this.visibility);window.removeEventListener('offline',this.visibility);this.disposed=true;this.request++;this.desktop.removeEventListener('change',this.visibility);window.removeEventListener('online',this.online);this.root.remove();}
}
