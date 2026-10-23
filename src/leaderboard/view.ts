import {games} from '../core/catalog';
import * as store from '../core/storage';
import type {GameId} from '../core/types';
import {LeaderboardSync} from './client';
import {scoredGame,SCORED_GAMES,type Board} from './shared';
import {formatScore} from './format';
import './style.css';
export class LeaderboardView {
 readonly root=document.createElement('dialog');
 readonly sync=new LeaderboardSync();
 private request=0;
 constructor(){
  this.root.id='leaderboard-dialog';this.root.setAttribute('aria-labelledby','leaderboard-title');
  this.root.innerHTML=`<form method="dialog" class="dialog-head"><h2 id="leaderboard-title">Leaderboards</h2><button class="icon-button" aria-label="Close leaderboards">×</button></form>
   <p class="muted">Best scores from players online. One personal best per player, per game.</p>
   <label for="leaderboard-game">Game</label><select id="leaderboard-game" class="game-select">${games.filter(g=>g.id!=='pool'&&scoredGame(g.id)).map(g=>`<option value="${g.id}">${g.title}</option>`).join('')}</select>
   <p class="lb-status muted" role="status"></p>
   <table class="lb-table"><caption class="sr-only">Top 25 scores</caption><thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Score</th></tr></thead><tbody></tbody></table>
   <p class="lb-personal muted"></p>
   <button class="game-button secondary lb-refresh" type="button">Refresh scores</button>
   <form class="lb-profile"><label for="leaderboard-name">Your public nickname</label><input id="leaderboard-name" type="text" minlength="2" maxlength="24" required autocomplete="nickname" placeholder="Choose a nickname"><p class="muted">Joining shares your best scores and nickname. Your player identity stays in this browser. Offline scores sync when you reconnect.</p><button class="game-button" type="submit">Join leaderboard</button></form>`;
  document.body.append(this.root);
  void this.sync.flush().catch(()=>{});
  this.select.addEventListener('change',()=>void this.refresh());
  this.root.querySelector('.lb-refresh')!.addEventListener('click',()=>void this.refresh());
  this.root.querySelector('.lb-profile')!.addEventListener('submit',event=>{event.preventDefault();void this.join();});
  this.root.addEventListener('close',()=>this.request++);
  window.addEventListener('online',()=>void this.sync.flush().then(()=>{if(this.root.open)void this.refresh();}).catch(()=>{}));
 }
 private get select(){return this.root.querySelector<HTMLSelectElement>('#leaderboard-game')!;}
 private status(text:string){this.root.querySelector('.lb-status')!.textContent=text;}
 open(game?:GameId){
  if(game&&game!=='pool'&&scoredGame(game))this.select.value=game;
  const profile=this.sync.profile();this.root.querySelector<HTMLInputElement>('#leaderboard-name')!.value=profile?.name??'';
  this.root.querySelector('.lb-profile button')!.textContent=profile?'Save nickname':'Join leaderboard';
  this.root.showModal();void this.refresh();
 }
 private async join(){
  try{
   this.sync.join(this.root.querySelector<HTMLInputElement>('#leaderboard-name')!.value);
   for(const game of SCORED_GAMES)this.sync.queue(game,store.highScore(game));
   this.root.querySelector('.lb-profile button')!.textContent='Save nickname';
   await this.refresh();
  }catch(error){this.status(error instanceof Error?error.message:'Could not save your nickname.');}
 }
 private paint(board:Board|null,game=this.select.value as GameId){
  const tbody=this.root.querySelector('tbody')!;tbody.replaceChildren();
  for(const entry of board?.entries??[]){
   const row=document.createElement('tr');if(entry.playerId===board?.player?.playerId)row.className='lb-you';
   for(const value of [entry.rank,entry.name+(entry.playerId===board?.player?.playerId?' · You':''),formatScore(game,entry.score)]){
    const cell=document.createElement('td');cell.textContent=String(value);row.append(cell);
   }tbody.append(row);
  }
  const mine=board?.player;
  this.root.querySelector('.lb-personal')!.textContent=mine?`Your rank: ${mine.rank} · Best: ${formatScore(game,mine.score)}`:this.sync.profile()?'Play and score to earn your place.':'Join to share your scores.';
 }
 private async refresh(){
  const id=++this.request,game=this.select.value as GameId;this.paint(null);this.status('Loading shared scores…');
  let pending=false;
  try{await this.sync.flush();}catch{pending=true;}
  try{
   const board=await this.sync.load(game);if(id!==this.request||!this.root.open)return;this.paint(board,game);
   this.status(pending?'Your scores are waiting to sync. Showing the latest shared scores.':board.entries.length?'Updated from the online leaderboard.':'No scores yet. Be the first to play!');
  }catch{
   if(id!==this.request||!this.root.open)return;
   const cached=this.sync.cached(game);this.paint(cached,game);
   this.status(cached?'Offline or unavailable · showing previously loaded scores. Your scores will sync when connected.':'Online leaderboard unavailable. You can keep playing; your scores are saved on this device.');
  }
 }
}
