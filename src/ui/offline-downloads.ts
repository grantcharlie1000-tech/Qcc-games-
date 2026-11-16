import type {GameInfo} from '../core/catalog';
import type {GameId} from '../core/types';
import {offlineManifest,downloadedGames,downloadGame,removeDownloadedGame} from '../core/offline';
import './offline-downloads.css';

export function mountOfflineDownloads(target:HTMLElement,games:GameInfo[]):void{
 target.innerHTML='<details class="offline-downloads"><summary>Download games</summary><p class="muted">Save games on this device to play without internet. Multiplayer and leaderboards still need a connection.</p><div class="offline-game-list"></div><p class="muted offline-download-status" role="status" aria-live="polite"></p></details>';
 const details=target.querySelector<HTMLDetailsElement>('details')!;
 const list=target.querySelector<HTMLElement>('.offline-game-list')!;
 const status=target.querySelector<HTMLElement>('.offline-download-status')!;
 let busy=false,token=0;
 const size=(bytes:number)=>bytes>=1048576?(bytes/1048576).toFixed(1)+' MB':Math.max(1,Math.ceil(bytes/1024))+' KB';
 async function refresh(){
  if(!details.open||busy)return;
  const current=++token;
  list.textContent='Loading downloads…';
  try{
   const manifest=await offlineManifest();
   const saved=await downloadedGames(manifest);
   if(current!==token||!details.open)return;
   list.replaceChildren();
   for(const game of games){
    const info=manifest.games[game.id];
    if(!info)continue;
    const ready=saved.has(game.id);
    const item=document.createElement('div');item.className='offline-game-row';
    const name=document.createElement('span');name.textContent=game.title+' · '+size(info.bytes);
    const button=document.createElement('button');button.type='button';button.className='game-button secondary';button.textContent=ready?'Remove':'Download';button.setAttribute('aria-label',(ready?'Remove offline download for ':'Download ')+game.title);
    button.addEventListener('click',async()=>{
     if(busy)return;
     busy=true;
     list.querySelectorAll('button').forEach(button=>(button as HTMLButtonElement).disabled=true);
     try{
      if(ready){status.textContent='Removing '+game.title+'…';await removeDownloadedGame(game.id as GameId);}
      else{
       status.textContent='Downloading '+game.title+'…';
       await downloadGame(game.id as GameId,(done,total)=>{button.textContent=done+' / '+total;status.textContent='Downloading '+game.title+': '+Math.round(done/Math.max(1,total)*100)+'%';});
      }
      status.textContent=ready?'Removed '+game.title+'.':game.title+' is ready to play offline.';
     }catch(error){status.textContent=error instanceof Error?error.message:'Offline download failed. Try again online.';}
     finally{busy=false;void refresh();}
    });
    item.append(name,button);list.append(item);
   }
   if(!navigator.onLine)status.textContent='Offline. Previously downloaded games remain playable.';
  }catch(error){if(current!==token)return;list.textContent='';status.textContent=error instanceof Error?error.message:'Downloads unavailable.';}
 }
 details.addEventListener('toggle',()=>{if(details.open)void refresh();});
 window.addEventListener('online',()=>{if(details.open)void refresh();});
}
