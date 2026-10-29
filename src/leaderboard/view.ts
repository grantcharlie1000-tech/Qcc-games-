import {games} from '../core/catalog';
import type {GameId} from '../core/types';
import {LeaderboardSync} from './client';
import {scoredGame,MINESWEEPER_RANKINGS,type LeaderboardKey,type Board} from './shared';
import {formatScore} from './format';
import './style.css';
export class LeaderboardView {
 readonly root=document.createElement('dialog');
 readonly sync=new LeaderboardSync();
 private request=0;
 constructor(private signIn:()=>void){
  this.root.id='leaderboard-dialog';this.root.setAttribute('aria-labelledby','leaderboard-title');
  this.root.innerHTML=`<form method="dialog" class="dialog-head"><h2 id="leaderboard-title">Leaderboards</h2><button class="icon-button" aria-label="Close leaderboards">×</button></form>
   <p class="muted">Best scores from players online. One personal best per player, per game.</p>
   <label for="leaderboard-game">Game</label><select id="leaderboard-game" class="game-select">${games.filter(g=>g.id!=='pool'&&g.id!=='minesweeper'&&scoredGame(g.id)).map(g=>`<option value="${g.id}">${g.title}</option>`).join('')}${MINESWEEPER_RANKINGS.map((key,i)=>`<option value="${key}">Minesweeper · ${['Easy','Medium','Hard','Score'][i]}</option>`).join('')}</select>
   <p class="lb-status muted" role="status"></p>
   <table class="lb-table"><caption class="sr-only">Top 25 scores</caption><thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Score</th></tr></thead><tbody></tbody></table>
   <p class="lb-personal muted"></p>
   <button class="game-button secondary lb-refresh" type="button">Refresh scores</button>
   <section class="lb-login"><p class="muted">Log in to share scores. Guest games and progress stay on this device.</p><button class="game-button" type="button">Log in / Sign up</button></section>`;
  document.body.append(this.root);
  void this.sync.flush().catch(()=>{});
  this.select.addEventListener('change',()=>void this.refresh());
  this.root.querySelector('.lb-refresh')!.addEventListener('click',()=>void this.refresh());
  this.root.querySelector('.lb-login button')!.addEventListener('click',()=>{this.root.close();this.signIn();});
  this.root.addEventListener('close',()=>this.request++);
  window.addEventListener('online',()=>void this.sync.flush().then(()=>{if(this.root.open)void this.refresh();}).catch(()=>{}));
 }
 private get select(){return this.root.querySelector<HTMLSelectElement>('#leaderboard-game')!;}
 private status(text:string){this.root.querySelector('.lb-status')!.textContent=text;}
 open(game?:LeaderboardKey){
  if(game==='minesweeper')game='minesweeper-score';
  if(game&&game!=='pool'&&scoredGame(game))this.select.value=game;
  this.root.querySelector<HTMLElement>('.lb-login')!.hidden=!!this.sync.profile()&&!this.sync.needsLogin;
  this.root.showModal();void this.refresh();
 }
 private paint(board:Board|null,game=this.select.value as LeaderboardKey){
  const tbody=this.root.querySelector('tbody')!;tbody.replaceChildren();
  for(const entry of board?.entries??[]){
   const row=document.createElement('tr');if(entry.playerId===board?.player?.playerId)row.className='lb-you';
   for(const value of [entry.rank,entry.name+(entry.account?' · account':'')+(entry.playerId===board?.player?.playerId?' · You':''),formatScore(game,entry.score)]){
    const cell=document.createElement('td');cell.textContent=String(value);row.append(cell);
   }tbody.append(row);
  }
  const mine=board?.player;
  this.root.querySelector('.lb-personal')!.textContent=mine?`Your rank: ${mine.rank} · Best: ${formatScore(game,mine.score)}`:this.sync.profile()?'Play and score to earn your place.':'Log in to share your scores.';
 }
 private async refresh(){
  const id=++this.request,game=this.select.value as LeaderboardKey;this.paint(null);this.status('Loading shared scores…');
  let pending=false;
  try{await this.sync.flush();}catch{pending=true;}
  try{
   const board=await this.sync.load(game);if(id!==this.request||!this.root.open)return;this.paint(board,game);
   this.root.querySelector<HTMLElement>('.lb-login')!.hidden=!!this.sync.profile()&&!this.sync.needsLogin;
   this.status(this.sync.needsLogin?'Log in again to share your scores. Your progress stays on this device.':pending?'Your scores are waiting to sync. Showing the latest shared scores.':board.entries.length?'Updated from the online leaderboard.':'No scores yet. Be the first to play!');
  }catch(error){
   if(id!==this.request||!this.root.open)return;
   const cached=this.sync.cached(game);this.paint(cached,game);
   this.root.querySelector<HTMLElement>('.lb-login')!.hidden=!!this.sync.profile()&&!this.sync.needsLogin;
   this.status(this.sync.needsLogin&&error instanceof Error?error.message:cached?'Offline or unavailable · showing previously loaded scores. Your scores will sync when connected.':'Online leaderboard unavailable. You can keep playing; your scores are saved on this device.');
  }
 }
}
