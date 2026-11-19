// The Downloads & Storage page at #/downloads.
import {games,artUrl} from '../core/catalog';
import {entryHash} from '../core/navigation';
import type {GameId} from '../core/types';
import {Downloads,megabytes,type Status} from './downloads';
import {checkForUpdate,updateWaiting} from './worker';
import './style.css';

// Games whose online rooms need the network. Their local modes play offline.
const ONLINE_MODES=new Set<GameId>(['pool','blockcraft','drift-club','breachline','chess']);
const LABEL:Record<Status['state'],string>={none:'',queued:'Waiting',downloading:'Downloading',ready:'Downloaded',update:'Update needed',failed:'Failed'};
const icon=(d:string)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON={download:icon('<path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/>'),play:icon('<path d="m8 5 11 7-11 7z"/>'),remove:icon('<path d="M5 7h14M10 7V5h4v2m-7 0 1 12h8l1-12"/>'),retry:icon('<path d="M4 5v6h6M4 11a8 8 0 1 1 2 6"/>'),stop:icon('<path d="M7 7h10v10H7z"/>')};

export class DownloadsView {
  private stop:()=>void;
  constructor(private root:HTMLElement,private downloads:Downloads){
    root.innerHTML=`<section class="dl-page" aria-labelledby="dl-title">
<header class="dl-head"><h1 id="dl-title">Downloads</h1><p class="dl-storage" aria-live="polite"></p></header>
${Downloads.supported()?`<div class="dl-actions"><button type="button" class="game-button secondary" data-dl="check">Check for updates</button><button type="button" class="game-button secondary" data-dl="clear">Delete all</button></div>
<p class="dl-note">Downloaded games play without internet. iOS may remove them if storage runs low.</p>
<p class="dl-note dl-online">Needs internet: online rooms, leaderboards, Movies &amp; TV, Social and Chat.</p>
<h2 class="dl-section" data-section="ready">On this device</h2><ul class="dl-list" data-list="ready"></ul>
<h2 class="dl-section">All games</h2><ul class="dl-list" data-list="all"></ul>`
:'<p class="dl-note">Downloads need the installed app or a secure connection. Open this site over HTTPS, then add it to your Home Screen.</p>'}
</section>`;
    root.addEventListener('click',this.click);
    this.stop=downloads.subscribe(id=>{if(id)this.paintRow(id);else{this.paintAll();void this.storage();}});
    void downloads.ready.then(()=>{this.paint();void this.storage();});
  }
  dispose(){this.stop();this.root.removeEventListener('click',this.click);}

  private row(id:GameId):string{
    const game=games.find(g=>g.id===id)!;
    return `<li class="dl-row" data-game="${id}"><img src="${artUrl(id)}" alt="" width="64" height="82" loading="lazy" decoding="async"><div class="dl-info"><strong>${game.title}</strong><span class="dl-meta"></span>${ONLINE_MODES.has(id)?'<span class="dl-meta dl-hint">Online rooms need internet</span>':''}<progress max="1" value="0" hidden></progress></div><div class="dl-buttons"></div></li>`;
  }
  private paint(){
    const all=this.root.querySelector<HTMLElement>('[data-list="all"]'),ready=this.root.querySelector<HTMLElement>('[data-list="ready"]');
    if(!all||!ready)return;
    const downloaded=new Set(this.downloads.downloaded());
    // The GTA IV entry is a local launcher, not an offline game download.
    ready.innerHTML=games.filter(g=>g.id!=='gta-iv-web'&&downloaded.has(g.id)).map(g=>this.row(g.id)).join('');
    all.innerHTML=games.filter(g=>g.id!=='gta-iv-web'&&!downloaded.has(g.id)).map(g=>this.row(g.id)).join('');
    ready.hidden=!downloaded.size;
    this.root.querySelector<HTMLElement>('[data-section="ready"]')!.hidden=!downloaded.size;
    this.paintAll();
    void this.storage();
  }
  private paintAll(){for(const row of this.root.querySelectorAll<HTMLElement>('.dl-row'))this.paintRow(row.dataset.game as GameId);}
  private paintRow(id:GameId){
    const row=this.root.querySelector<HTMLElement>(`.dl-row[data-game="${id}"]`);if(!row)return;
    const status=this.downloads.status(id);
    // Rows update in place: moving a finished game to the other list would shift the buttons under a finger.
    // The lists are sorted again the next time the page opens.
    const size=megabytes(status.total);
    const meta=row.querySelector<HTMLElement>('.dl-meta')!;
    meta.textContent=status.state==='downloading'?`${megabytes(status.done)} of ${size}`:[size,LABEL[status.state]].filter(Boolean).join(' · ');
    meta.dataset.state=status.state;
    meta.title=status.message??'';
    if(status.message&&status.state!=='ready')meta.textContent+=` · ${status.message}`;
    const bar=row.querySelector('progress')!;bar.hidden=status.state!=='downloading';bar.value=status.total?status.done/status.total:0;
    bar.setAttribute('aria-label',`${games.find(g=>g.id===id)!.title} download`);
    const title=games.find(g=>g.id===id)!.title;
    const button=(action:string,label:string,svg:string,primary=false)=>`<button type="button" class="dl-button${primary?' primary':''}" data-dl="${action}" aria-label="${label} ${title}">${svg}<span>${label}</span></button>`;
    const buttons=row.querySelector<HTMLElement>('.dl-buttons')!;
    const html=status.state==='ready'?button('play','Play',ICON.play,true)+button('remove','Delete',ICON.remove)
      :status.state==='downloading'||status.state==='queued'?button('remove','Stop',ICON.stop)
      :status.state==='update'?button('download','Update',ICON.retry,true)+button('remove','Delete',ICON.remove)
      :status.state==='failed'?button('download','Retry',ICON.retry,true)+button('remove','Delete',ICON.remove)
      :button('download','Download',ICON.download,true);
    // Rewriting buttons on every progress tick would drop focus and taps.
    if(buttons.dataset.state!==status.state){buttons.dataset.state=status.state;buttons.innerHTML=html;void this.storage();}
  }
  private async storage(){
    const line=this.root.querySelector('.dl-storage');if(!line)return;
    const stored=this.downloads.storedBytes();
    const estimate=await navigator.storage?.estimate?.().catch(()=>undefined);
    const free=estimate?.quota&&estimate.usage!==undefined?` · about ${megabytes(Math.max(0,estimate.quota-estimate.usage))} free`:'';
    line.textContent=`${this.downloads.downloaded().length} games · ${megabytes(stored)} used${free}`;
  }
  private click=async(event:Event)=>{
    const button=(event.target as Element).closest<HTMLButtonElement>('button[data-dl]');if(!button)return;
    const action=button.dataset.dl,id=button.closest<HTMLElement>('.dl-row')?.dataset.game as GameId|undefined;
    if(action==='download'&&id)this.downloads.download(id);
    else if(action==='play'&&id)location.hash=entryHash(id);
    else if(action==='remove'&&id)await this.downloads.remove(id);
    else if(action==='clear'){if(this.downloads.hasAny()&&confirm('Delete all downloaded games?'))await this.downloads.removeAll();}
    else if(action==='check'){
      button.disabled=true;button.textContent='Checking…';
      await this.downloads.verifyAll();
      const update=await checkForUpdate();
      button.disabled=false;button.textContent=update||updateWaiting()?'Update ready. Restart the app.':navigator.onLine?'Up to date':'Offline. Try later.';
      this.paint();
    }
  };
}
