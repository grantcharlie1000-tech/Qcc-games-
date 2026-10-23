/**
 * Corn Clicker interface and lifecycle. Owns the DOM, input, rendering cadence, persistence glue
 * and cross-tab ownership. Rules live in model.ts; content lives in data.ts.
 */
import type {GameContext} from '../../core/types';
import {canRetain} from '../../core/storage';
import {cobArt,producerArt,sceneArt,goldenArt,pestArt,scarecrowArt,kernelArt,kernelUrl,seedArt,butterArt,mouseArt,sparkleArt} from './art';
import {Big,format,type NumberStyle} from './big';
import {
  PRODUCERS,PRODUCER_IDS,producerById,FESTIVAL,PESTS,UPGRADES,upgradeById,ACHIEVEMENTS,achievementById,SKINS,PERMS,permById,PRESTIGE,GOLDEN,FESTIVALS,SCARECROW,NEWS,VARIETIES,varietyById,
  type ProducerId,type Upgrade,type ScarecrowBonus,type SkinId,type PermPath,
} from './data';
import {CornGame,ACTIVE_GAP_SECONDS,type BuyAmount,type GameEvent} from './model';
import {freshState,serialize,deserialize,exportString,importString,SaveError,type State} from './state';
import {TabGuard,readDiskSave,revisionOf,addBackup,listBackups} from './persistence';
import {Sfx,type Cue} from './audio';
import {GardenView} from './garden-view';
import {cornScore} from './score';
import {duration,longDuration,effectText,requirementText,achievementTarget,goldenResult,festivalText} from './text';

type Sub='farm'|'garden'|'goals'|'stats'|'replant'|'options';
type Top='cob'|'shop'|'farm';
const SUBS:[Sub,string][]=[['farm','Farm'],['garden','Garden'],['goals','Goals'],['stats','Stats'],['replant','Replant'],['options','Options']];
const BACKUP_EVERY_MS=10*60*1000;
const esc=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

interface Tip {id:string;text:string;tab?:Top;sub?:Sub;show(g:CornGame):boolean;done(g:CornGame):boolean}
const TIPS:Tip[]=[
  {id:'click',text:'Click the cob!',tab:'cob',show:()=>true,done:g=>g.s.life.clicks>=10},
  {id:'buy',text:'Buy a Farmhand in the Shop.',tab:'shop',show:g=>g.s.kernels.gte(15),done:g=>g.totalOwned()>0},
  {id:'upgrade',text:'An upgrade is ready in the Shop.',tab:'shop',show:g=>g.availableUpgrades().length>0,done:g=>g.s.life.upgradesBought>0},
  {id:'bulk',text:'Try ×10 or Max to buy in bulk.',tab:'shop',show:g=>g.totalOwned()>=12,done:()=>false},
  {id:'golden',text:'Catch the golden cob! (G)',show:g=>!!g.s.golden.onScreen,done:g=>g.s.life.golden>0},
  {id:'garden',text:'The Garden is open.',tab:'farm',sub:'garden',show:g=>g.has('garden'),done:g=>g.s.life.planted>0},
  {id:'replant',text:'You can Replant for Golden Seeds.',tab:'farm',sub:'replant',show:g=>g.seedsAvailable()>=1,done:g=>g.s.life.replants>0},
];

export class CornClicker {
  private game:CornGame;
  private readonly root:HTMLElement;
  private readonly sfx=new Sfx();
  private readonly guard:TabGuard;
  private paused=false;private passive=false;private disposed=false;private pausedAt=0;
  private raf=0;private heartbeat=0;private saveTimer=0;
  private amount:BuyAmount=1;
  private top:Top='cob';private sub:Sub='farm';
  private lastUi=0;private lastSlow=0;private lastAchievements=0;private lastBackup=listBackups()[0]?.at??0;private lastSaved=0;
  private newsIndex=-1;private newsAt=0;
  private sig:Record<string,string>={};
  private gainCache=new Map<string,Big>();private gainVersion=-1;
  private readonly icons=new Map<string,string>();
  private readonly garden:GardenView;
  private readonly kernelUrl=`url("${kernelUrl()}")`;
  private lastPointerType='mouse';
  private tooltipFor:HTMLElement|null=null;
  /** On touch, the upgrade explained by the first tap; a second tap on it buys. */
  private touchArmed:HTMLElement|null=null;
  private modalReturn:HTMLElement|null=null;
  private keyboardAwardAt=0;
  private readonly el:{[k:string]:HTMLElement};

  constructor(container:HTMLElement,private readonly ctx:GameContext){
    const now=Date.now();
    const state=freshState(now);
    state.options.sound=ctx.settings.sound;
    this.game=new CornGame(state,now);
    this.root=document.createElement('div');
    this.root.className='cc-root';this.root.dataset.top=this.top;
    this.root.innerHTML=this.template();
    container.append(this.root);
    const q=(s:string)=>this.root.querySelector<HTMLElement>(s)!;
    this.el={kernels:q('.cc-kernels-num'),cps:q('.cc-cps'),cpc:q('.cc-cpc'),hudK:q('.cc-hud-k'),hudC:q('.cc-hud-c'),buffs:q('.cc-buffs'),cob:q('.cc-cob'),fx:q('.cc-fx'),pests:q('.cc-pests'),
      tip:q('.cc-tip'),goal:q('.cc-goal-main'),unlock:q('.cc-goal-unlock'),saved:q('.cc-saved'),ticker:q('.cc-ticker'),news:q('.cc-news'),scene:q('.cc-scene'),farmBar:q('.cc-farm-bar'),
      upgrades:q('.cc-upgrades'),upcoming:q('.cc-upcoming'),producers:q('.cc-producers'),golden:q('.cc-golden-layer'),toasts:q('.cc-toasts'),tooltip:q('.cc-tooltip'),
      modal:q('.cc-modal'),card:q('.cc-modal-card'),goals:q('#cc-sub-goals'),stats:q('#cc-sub-stats'),replant:q('#cc-sub-replant'),options:q('#cc-sub-options'),upgCount:q('.cc-upg-count')};
    this.garden=new GardenView(q('#cc-sub-garden'),{
      game:()=>this.game,style:()=>this.style(),changed:()=>this.requestSave(),canAct:()=>this.canAct(),
      feedback:(kind,text,at)=>{this.play(kind==='deny'?'deny':kind==='plant'?'plant':'harvest');if(kind==='plant')this.announce(text);else this.toast(text,'info');if(at&&kind==='harvest')this.burst(at,6);},
    });
    this.bind();
    this.guard=new TabGuard(()=>this.lostOwnership());
    if(!this.guard.claim())this.becomePassive();
    this.applyOptions();
    this.renderAll();
    this.start();
  }

  // ───────────────────────── Template ─────────────────────────
  private template():string {
    const tab=(id:Top,label:string)=>`<button type="button" role="tab" class="cc-tab" id="cc-tab-${id}" aria-controls="cc-pane-${id}" aria-selected="${id==='cob'}" tabindex="${id==='cob'?0:-1}" data-top="${id}">${label}</button>`;
    return `<div class="cc-hud" aria-hidden="true"><span><b class="cc-hud-k">0</b> kernels</span><span><b class="cc-hud-c">0</b>/s</span></div>
<section class="cc-col cc-left" id="cc-pane-cob" role="tabpanel" aria-labelledby="cc-tab-cob" aria-label="Cob">
  <div class="cc-counters"><p class="cc-kernels"><span class="cc-kernels-num">0</span> <span class="cc-kernels-label">kernels</span></p>
  <p class="cc-rates"><span><b class="cc-cps">0</b>/s</span><span><b class="cc-cpc">1</b>/click</span></p></div>
  <div class="cc-buffs"></div>
  <div class="cc-cob-stage"><div class="cc-pests"></div>
    <button type="button" class="cc-cob" aria-label="Harvest the cob">${cobArt(this.game.s.skin)}</button>
    <div class="cc-fx" aria-hidden="true"></div></div>
  <div class="cc-tip" hidden><p></p><button type="button" class="cc-btn cc-btn-quiet cc-tip-done">Got it</button></div>
  <div class="cc-goal"><p class="cc-goal-main"></p><p class="cc-goal-unlock" hidden></p></div>
  <p class="cc-saved"></p>
</section>
<section class="cc-col cc-mid" id="cc-pane-farm" role="tabpanel" aria-labelledby="cc-tab-farm" aria-label="Farm">
  <div class="cc-ticker" aria-label="Corn news"><p class="cc-news"></p></div>
  <div class="cc-subtabs" role="tablist" aria-label="Farm sections">${SUBS.map(([id,label])=>`<button type="button" role="tab" class="cc-subtab" id="cc-subtab-${id}" data-sub="${id}" aria-controls="cc-sub-${id}" aria-selected="${id==='farm'}" tabindex="${id==='farm'?0:-1}">${label}</button>`).join('')}</div>
  <div class="cc-subs">${SUBS.map(([id])=>`<div class="cc-sub" id="cc-sub-${id}" role="tabpanel" aria-labelledby="cc-subtab-${id}" tabindex="0"${id==='farm'?'':' hidden'}>${id==='farm'?'<div class="cc-farm-bar"></div><div class="cc-scene" role="img" aria-label="Your farm"></div>':''}</div>`).join('')}</div>
</section>
<section class="cc-col cc-right" id="cc-pane-shop" role="tabpanel" aria-labelledby="cc-tab-shop" aria-label="Shop">
  <h2 class="cc-h">Upgrades <span class="cc-upg-count"></span></h2>
  <div class="cc-upgrades" role="list" aria-label="Available upgrades"></div>
  <div class="cc-upcoming" hidden></div>
  <div class="cc-buy-row" role="radiogroup" aria-label="Buy amount">${([1,10,100,'max'] as BuyAmount[]).map(a=>`<button type="button" role="radio" class="cc-amount" data-amount="${a}" aria-checked="${a===1}">${a==='max'?'Max':'×'+a}</button>`).join('')}</div>
  <h2 class="cc-h cc-sr">Producers</h2>
  <div class="cc-producers" role="list" aria-label="Producers"></div>
</section>
<nav class="cc-tabs" role="tablist" aria-label="Corn Clicker sections">${tab('cob','Cob')}${tab('shop','Shop')}${tab('farm','Farm')}</nav>
<div class="cc-golden-layer"></div>
<div class="cc-toasts" role="status" aria-live="polite"></div>
<div class="cc-tooltip" role="tooltip" id="cc-tooltip" hidden></div>
<div class="cc-modal" hidden><div class="cc-modal-card" role="dialog" aria-modal="true" aria-labelledby="cc-modal-title"></div></div>`;
  }

  // ───────────────────────── Lifecycle (GameInstance) ─────────────────────────
  private start(){
    if(this.disposed||this.paused||this.passive)return;
    cancelAnimationFrame(this.raf);clearInterval(this.heartbeat);
    const frame=()=>{this.frame();this.raf=requestAnimationFrame(frame);};
    this.raf=requestAnimationFrame(frame);
    // Keeps production and autosave moving when frames are throttled (occluded windows).
    this.heartbeat=window.setInterval(()=>this.simulate(),1000);
  }
  private stop(){cancelAnimationFrame(this.raf);clearInterval(this.heartbeat);this.raf=0;this.heartbeat=0;}
  pause(){
    if(this.paused||this.disposed)return;
    if(!this.passive){this.simulate();this.flushSave();}
    this.paused=true;this.pausedAt=Date.now();this.stop();this.guard.release();this.hideTooltip();
  }
  resume(){
    if(!this.paused||this.disposed)return;
    this.paused=false;
    if(this.passive)return;
    if(!this.guard.claim()){this.becomePassive();return;}
    if(!this.adoptNewerDiskSave()){
      // A short pause (menu, rules, Study) freezes the farm, golden cob included.
      // Longer absences are left for the next tick to pay as time away.
      const gap=Date.now()-this.pausedAt;
      if(gap>=0&&gap<=ACTIVE_GAP_SECONDS*1000)this.game.s.lastTick=Math.min(Date.now(),this.game.s.lastTick+gap);
    }
    this.start();
  }
  /** The toolbar's Restart starts a brand-new farm, after confirmation. */
  restart(){
    if(this.passive){this.toast('This farm is running in another tab. Choose “Play here instead” first.','warn');return;}
    this.confirm('Start a brand-new farm?','This erases every kernel, producer, upgrade, achievement, Golden Seed and garden discovery. A backup is kept in Options → Backups in case you change your mind.','Erase everything',()=>{
      addBackup(this.ownedSnapshot(),'Before starting a new farm');
      this.game.hardReset(Date.now());this.afterLoad();this.flushSave();this.toast('A fresh farm. Every cob starts with a single kernel.','info');
    });
  }
  serialize():unknown {
    if(!this.guard.owner||this.passive)return undefined;
    return this.ownedSnapshot();
  }
  private ownedSnapshot():Record<string,unknown> {
    this.game.s.rev++;this.lastSaved=Date.now();
    return serialize(this.game.s);
  }
  restore(data:unknown){
    const now=Date.now();
    let state:State;
    try{state=deserialize(data,now);}
    catch(error){
      const backup=listBackups().find(b=>{try{deserialize(b.data,now);return true;}catch{return false;}});
      addBackup(data,'Unreadable save (kept for recovery)');
      if(!backup)throw error;
      state=deserialize(backup.data,now);
      setTimeout(()=>this.toast(`Your save could not be read, so the backup from ${new Date(backup.at).toLocaleString()} was restored.`,'warn'),0);
    }
    this.load(state,now);
  }
  private load(state:State,now:number){
    if(state.lastTick>now+60_000){
      // Saved "in the future": the clock moved back. Start counting from now, crediting nothing.
      state.lastTick=now;setTimeout(()=>this.toast('Your device clock changed, so no time away was counted.','warn'),0);
    }
    this.game=new CornGame(state,now);
    this.afterLoad();
  }
  private afterLoad(){this.sig={skinCount:String(this.game.s.achievements.size)};this.gainVersion=-1;this.garden.reset();this.root.querySelector('.cc-cob')!.innerHTML=cobArt(this.game.s.skin);this.applyOptions();this.renderAll();}
  dispose(){
    this.disposed=true;this.stop();clearTimeout(this.saveTimer);
    this.guard.dispose();this.sfx.dispose();this.garden.dispose();
    removeEventListener('keydown',this.onKey);removeEventListener('resize',this.hideTooltip);
    this.root.remove();
  }

  // ───────────────────────── Multiple tabs ─────────────────────────
  /** Load a save another tab wrote while this one was paused. Returns whether it did. */
  private adoptNewerDiskSave():boolean {
    const disk=readDiskSave();
    if(revisionOf(disk)<=this.game.s.rev)return false;
    try{this.load(deserialize(disk,Date.now()),Date.now());return true;}catch{return false;}
  }
  private lostOwnership(){
    if(this.passive||this.disposed)return;
    // Write our final state once so the tab taking over continues from it.
    this.simulate();this.ctx.save(this.ownedSnapshot());
    this.becomePassive();
  }
  private becomePassive(){
    this.passive=true;this.stop();this.updateSaved();
    this.openModal(`<h2 id="cc-modal-title">Playing in another tab</h2><p>Corn Clicker is already running in another tab or window. To keep your progress safe, only one copy runs at a time.</p>
      <div class="cc-row"><button type="button" class="cc-btn" data-act="takeover">Play here instead</button></div>`,card=>{
      card.querySelector('[data-act=takeover]')!.addEventListener('click',()=>this.takeOver());
    },false);
  }
  private takeOver(){
    this.guard.claim(true);
    this.card('<h2 id="cc-modal-title">Bringing your farm over…</h2><p>Collecting the latest save from the other tab.</p>');
    // The other tab saves as soon as it sees the claim; give it a moment, then load the newest save.
    setTimeout(()=>{
      if(this.disposed)return;
      const disk=readDiskSave();
      // This tab changed nothing while it was inactive, so the stored save is always the one to continue.
      if(disk!==undefined){try{this.load(deserialize(disk,Date.now()),Date.now());}catch{/* keep current */}}
      this.passive=false;this.closeModal();if(!this.paused)this.start();this.updateSaved();
    },600);
  }

  // ───────────────────────── Saving ─────────────────────────
  /** Save soon after a significant action (coalesced). */
  private requestSave(){
    if(this.saveTimer)return;
    this.saveTimer=window.setTimeout(()=>{this.saveTimer=0;this.flushSave();},700);
  }
  private flushSave(){
    clearTimeout(this.saveTimer);this.saveTimer=0;
    if(this.passive||!this.guard.owner||this.disposed)return;
    this.ctx.save(this.ownedSnapshot());this.updateSaved();
    // Lifetime kernels are the leaderboard score; the host keeps the best and syncs it.
    this.ctx.setScore(cornScore(this.game.s.life.earned));
  }
  private updateSaved(){
    const el=this.el.saved;
    let text:string;
    if(this.passive)text='Paused: this farm is open in another tab.';
    else if(!canRetain())text='Storage is blocked or full: progress lasts only for this visit. Use Options → Export to keep it.';
    else{const ago=(Date.now()-this.lastSaved)/1000;text=this.lastSaved===0?'Autosaves every few seconds.':ago<5?'Saved just now.':`Saved ${duration(ago)} ago.`;}
    if(el.textContent!==text)el.textContent=text;
    el.classList.toggle('cc-warn',this.passive||!canRetain());
  }

  // ───────────────────────── Main loop ─────────────────────────
  private simulate(){
    if(this.passive||this.paused||this.disposed)return;
    this.game.tick(Date.now());
    const now=Date.now();
    if(now-this.lastAchievements>500){this.lastAchievements=now;this.game.checkAchievements();}
    this.drainEvents();
    if(now-this.lastBackup>BACKUP_EVERY_MS){this.lastBackup=now;addBackup(serialize(this.game.s),'Automatic backup');}
  }
  private frame(){
    this.simulate();
    const now=performance.now();
    this.updateGolden();
    if(now-this.lastUi<100)return;
    this.lastUi=now;
    this.updateCounters();this.updateBuffs();this.updateShop();
    if(now-this.lastSlow>500){this.lastSlow=now;this.slowUpdate();}
  }
  private renderAll(){this.updateCounters();this.updateBuffs();this.updateShop();this.slowUpdate();this.updateGolden();}
  private slowUpdate(){
    this.updateTabs();this.updateTip();this.updateGoal();this.updateSaved();this.updatePests();this.updateTicker();
    if(!this.isHidden('farm')){this.updateScene();this.updateFarmBar();}
    if(!this.isHidden('garden'))this.garden.update();
    if(!this.isHidden('goals'))this.updateGoals();
    if(!this.isHidden('stats'))this.updateStats();
    if(!this.isHidden('replant'))this.updateReplant();
    if(!this.isHidden('options'))this.updateOptionsLive();
    this.refreshTooltip();
  }
  /** A middle-column section is hidden when it is not the selected sub-tab (or the farm column is off-screen on a phone). */
  private isHidden(sub:Sub){return this.sub!==sub||this.narrow()&&this.top!=='farm';}
  private narrow(){return this.root.clientWidth<900;}
  private style():NumberStyle {return this.game.s.options.numbers;}
  private f(value:Big|number,decimals=false){return format(value,this.style(),decimals);}

  // ───────────────────────── Events from the model ─────────────────────────
  private drainEvents(){
    const events=this.game.events.splice(0);
    // Several achievements at once (e.g. after time away) share one notification.
    const earned=events.filter(e=>e.type==='achievement');
    if(earned.length>1){
      const names=earned.map(e=>achievementById.get((e as {id:string}).id)!.name);
      this.toast(`${earned.length} achievements unlocked!`,'achievement');
      this.play('achievement');this.skinToast();this.requestSave();
    }
    for(const e of events)if(e.type!=='achievement'||earned.length===1)this.handle(e);
  }
  private skinToast(){
    const count=this.game.s.achievements.size,known=Number(this.sig.skinCount??count);
    this.sig.skinCount=String(count);
    for(const skin of SKINS)if(skin.achievements>known&&skin.achievements<=count)this.toast(`New skin: ${skin.name}`,'achievement');
  }
  private handle(e:GameEvent){
    switch(e.type){
      case 'achievement':{
        const a=achievementById.get(e.id)!;
        this.toast(`Achievement: ${a.name}`,'achievement');this.play('achievement');this.skinToast();
        this.requestSave();break;
      }
      case 'golden-spawn':this.announce('A golden cob appeared! Press G to collect it.');break;
      case 'golden-expired':this.announce('The golden cob faded away.');break;
      case 'effect-end':break;
      case 'festival-start':this.toast(`${FESTIVALS[e.id].name}! ${FESTIVALS[e.id].desc}`,'gold');this.play('festival');break;
      case 'festival-end':break;
      case 'pest-spawn':this.announce('A mutant pest latched onto the cob. Pop it to get its kernels back with interest.');break;
      case 'mutation':{
        const v=varietyById[e.variety];
        this.toast(e.discovered?`New variety: ${v.name}!`:`${v.name} sprouted!`,e.discovered?'gold':'info');
        if(e.discovered)this.play('achievement');this.requestSave();break;
      }
      case 'offline':this.showOffline(e.seconds,e.earned,e.capped);this.flushSave();break;
      case 'clock':this.toast('Your device clock moved backwards. No time was counted for the change.','warn');break;
      case 'golden':case 'pest-pop':break;
    }
  }

  // ───────────────────────── Input binding ─────────────────────────
  private bind(){
    const cob=this.el.cob as HTMLButtonElement;
    // One award per input: pointer presses award on pointerdown (each finger once); keys award on
    // a non-repeating keydown; a click with no pointer/keyboard source (assistive tech) awards too.
    cob.addEventListener('pointerdown',event=>{
      if(event.pointerType==='mouse'&&event.button!==0)return;
      this.lastPointerType=event.pointerType;
      this.harvestClick(event.clientX,event.clientY);
    });
    cob.addEventListener('keydown',event=>{
      if(event.key!==' '&&event.key!=='Enter')return;
      event.preventDefault();
      if(event.repeat)return;
      this.keyboardAwardAt=performance.now();
      const r=cob.getBoundingClientRect();this.harvestClick(r.left+r.width/2,r.top+r.height*0.4);
    });
    cob.addEventListener('click',event=>{
      if(event.detail!==0||performance.now()-this.keyboardAwardAt<500)return;
      const r=cob.getBoundingClientRect();this.harvestClick(r.left+r.width/2,r.top+r.height*0.4);
    });
    cob.addEventListener('contextmenu',event=>event.preventDefault());
    this.root.addEventListener('pointerdown',event=>{this.lastPointerType=event.pointerType;},true);
    // Tabs
    this.root.querySelector('.cc-tabs')!.addEventListener('click',event=>{const t=(event.target as Element).closest<HTMLElement>('[data-top]');if(t)this.setTop(t.dataset.top as Top,true);});
    this.root.querySelector('.cc-subtabs')!.addEventListener('click',event=>{const t=(event.target as Element).closest<HTMLElement>('[data-sub]');if(t)this.setSub(t.dataset.sub as Sub,true);});
    for(const list of ['.cc-tabs','.cc-subtabs'])this.root.querySelector(list)!.addEventListener('keydown',event=>this.tabKeys(event as KeyboardEvent));
    // Shop
    this.root.querySelector('.cc-buy-row')!.addEventListener('click',event=>{
      const b=(event.target as Element).closest<HTMLElement>('[data-amount]');if(!b)return;
      this.setAmount(b.dataset.amount==='max'?'max':Number(b.dataset.amount) as BuyAmount);
    });
    this.root.querySelector('.cc-buy-row')!.addEventListener('keydown',event=>{
      const e=event as KeyboardEvent;if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
      e.preventDefault();const order:BuyAmount[]=[1,10,100,'max'];const i=order.indexOf(this.amount)+(e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:1);
      this.setAmount(order[(i+4)%4]);this.root.querySelector<HTMLElement>(`[data-amount="${this.amount}"]`)!.focus();
    });
    this.el.producers.addEventListener('click',event=>{const b=(event.target as Element).closest<HTMLElement>('[data-producer]');if(b)this.buyProducer(b.dataset.producer as ProducerId,b);});
    this.el.upgrades.addEventListener('click',event=>{const b=(event.target as Element).closest<HTMLElement>('[data-upgrade]');if(b)this.clickUpgrade(b);});
    // Tooltips: hover (mouse), focus (keyboard) and first tap (touch).
    this.root.addEventListener('pointerover',event=>{if(event.pointerType==='mouse'){const t=(event.target as Element).closest<HTMLElement>('[data-tip]');if(t)this.showTooltip(t);}});
    this.root.addEventListener('pointerout',event=>{if(event.pointerType==='mouse'){const t=(event.target as Element).closest<HTMLElement>('[data-tip]');if(t&&!t.contains(event.relatedTarget as Node))this.hideTooltip();}});
    this.root.addEventListener('focusin',event=>{const t=(event.target as Element).closest<HTMLElement>('[data-tip]');if(t)this.showTooltip(t);else this.hideTooltip();});
    this.root.addEventListener('focusout',event=>{if(!(event.relatedTarget instanceof Element&&event.relatedTarget.closest('[data-tip]')))this.hideTooltip();});
    this.root.querySelectorAll('.cc-producers,.cc-upgrades,.cc-subs').forEach(el=>el.addEventListener('scroll',this.hideTooltip,{passive:true}));
    addEventListener('resize',this.hideTooltip);
    // Golden cob and pests
    this.el.golden.addEventListener('click',event=>{if((event.target as Element).closest('.cc-golden'))this.collectGolden();});
    this.el.pests.addEventListener('click',event=>{const b=(event.target as Element).closest<HTMLElement>('[data-pest]');if(b)this.popPest(Number(b.dataset.pest),b);});
    this.el.buffs.addEventListener('click',event=>{if((event.target as Element).closest('[data-act=pop-all]'))this.popAll();});
    this.root.querySelector('.cc-tip-done')!.addEventListener('click',()=>{const id=this.el.tip.dataset.tip;if(id)this.game.s.tutorial.add(id);this.updateTip();this.requestSave();});
    addEventListener('keydown',this.onKey);
    this.bindPanels();
  }
  private readonly onKey=(event:KeyboardEvent)=>{
    if(this.paused||this.passive||event.ctrlKey||event.metaKey||event.altKey||!this.root.isConnected)return;
    const target=event.target as HTMLElement|null;
    if(target&&(target.closest('input,textarea,select')||target.isContentEditable))return;
    if(!this.el.modal.hidden)return;
    if((event.key==='g'||event.key==='G')&&!event.repeat&&this.game.s.golden.onScreen){event.preventDefault();this.collectGolden();}
  };
  private tabKeys(event:KeyboardEvent){
    const tabs=[...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role=tab]:not([hidden])')];
    const i=tabs.indexOf(document.activeElement as HTMLElement);if(i<0)return;
    let next=-1;
    if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(i+1)%tabs.length;
    else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(i-1+tabs.length)%tabs.length;
    else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;
    if(next<0)return;
    event.preventDefault();tabs[next].focus();tabs[next].click();
  }
  setTop(top:Top,focus=false){
    this.top=top;this.root.dataset.top=top;
    this.root.querySelectorAll<HTMLElement>('.cc-tab').forEach(t=>{const on=t.dataset.top===top;t.setAttribute('aria-selected',String(on));t.tabIndex=on?0:-1;t.classList.remove('cc-attention');});
    this.hideTooltip();this.slowUpdate();
    if(focus)this.root.querySelector<HTMLElement>(`#cc-tab-${top}`)?.focus();
  }
  setSub(sub:Sub,focus=false){
    this.sub=sub;
    this.root.querySelectorAll<HTMLElement>('.cc-subtab').forEach(t=>{const on=t.dataset.sub===sub;t.setAttribute('aria-selected',String(on));t.tabIndex=on?0:-1;});
    this.root.querySelectorAll<HTMLElement>('.cc-sub').forEach(p=>{p.hidden=p.id!==`cc-sub-${sub}`;});
    if(sub==='replant')this.game.s.tutorial.add('replant-seen');
    this.hideTooltip();this.slowUpdate();
    if(focus)this.root.querySelector<HTMLElement>(`#cc-subtab-${sub}`)?.focus();
  }
  private setAmount(amount:BuyAmount){
    this.amount=amount;
    this.root.querySelectorAll<HTMLElement>('.cc-amount').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.amount===String(amount))));
    this.updateShop();
  }

  // ───────────────────────── Clicking and feedback ─────────────────────────
  /** Gameplay input only counts while this tab runs the farm and the game is not paused. */
  private canAct(){return !this.paused&&!this.passive&&!this.disposed;}
  private harvestClick(x:number,y:number){
    if(this.passive||this.paused)return;
    this.simulate();
    const value=this.game.click(performance.now());
    this.play('pop');
    this.squash();
    this.floater(x,y,`+${this.f(value,true)}`);
    const level=this.game.s.options.particles;
    if(level!=='off')this.particles(x,y,level==='full'?4:1);
    if(this.game.s.life.clicks%25===0)this.requestSave();
    this.updateCounters();
  }
  private calm():boolean {
    return this.game.s.options.reducedMotion||this.ctx.settings.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  private squash(){
    const body=this.el.cob.querySelector('img');if(!body)return;
    body.getAnimations?.().forEach(a=>a.cancel());
    if(this.calm()){body.animate?.([{filter:'brightness(1.15)'},{filter:'none'}],{duration:120});return;}
    body.animate?.([{transform:'scale(1,1)'},{transform:'scale(1.06,.9)',offset:.35},{transform:'scale(.98,1.03)',offset:.7},{transform:'scale(1,1)'}],{duration:180,easing:'cubic-bezier(.23,1,.32,1)'});
  }
  private fxOrigin(){return this.el.fx.getBoundingClientRect();}
  private floater(x:number,y:number,text:string){
    const layer=this.el.fx;if(layer.childElementCount>70)return;
    const o=this.fxOrigin(),span=document.createElement('span');
    span.className='cc-float';span.textContent=text;
    span.style.left=`${x-o.left}px`;span.style.top=`${y-o.top}px`;
    layer.append(span);
    const calm=this.calm();
    const a=span.animate?.(calm?[{opacity:1},{opacity:0}]:[{transform:'translate(-50%,-20%)',opacity:1},{transform:'translate(-50%,-160%)',opacity:0}],{duration:calm?700:900,easing:'cubic-bezier(.23,1,.32,1)'});
    if(a)a.onfinish=()=>span.remove();else setTimeout(()=>span.remove(),900);
  }
  private particles(x:number,y:number,count:number){
    if(this.calm())return;
    const layer=this.el.fx,o=this.fxOrigin();
    for(let i=0;i<count&&layer.childElementCount<70;i++){
      const p=document.createElement('span');p.className='cc-particle';p.style.backgroundImage=this.kernelUrl;
      p.style.left=`${x-o.left}px`;p.style.top=`${y-o.top}px`;layer.append(p);
      const angle=Math.random()*Math.PI*2,dist=40+Math.random()*60,dx=Math.cos(angle)*dist,dy=Math.sin(angle)*dist-30,spin=Math.random()*540-270;
      const a=p.animate?.([{transform:'translate(-50%,-50%) rotate(0)',opacity:1},{transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy+70}px)) rotate(${spin}deg)`,opacity:0}],{duration:650+Math.random()*250,easing:'cubic-bezier(.2,.6,.4,1)'});
      if(a)a.onfinish=()=>p.remove();else setTimeout(()=>p.remove(),800);
    }
  }
  private burst(at:HTMLElement,count:number){
    if(this.game.s.options.particles==='off')return;
    const r=at.getBoundingClientRect();
    // Bursts outside the cob column still need a visible layer: use the golden layer.
    const layer=this.el.golden,o=layer.getBoundingClientRect();
    if(this.calm())return;
    for(let i=0;i<count;i++){
      const p=document.createElement('span');p.className='cc-particle';p.style.backgroundImage=this.kernelUrl;
      p.style.left=`${r.left+r.width/2-o.left}px`;p.style.top=`${r.top+r.height/2-o.top}px`;layer.append(p);
      const angle=Math.random()*Math.PI*2,dist=30+Math.random()*50;
      const a=p.animate?.([{transform:'translate(-50%,-50%)',opacity:1},{transform:`translate(calc(-50% + ${Math.cos(angle)*dist}px),calc(-50% + ${Math.sin(angle)*dist}px)) rotate(200deg)`,opacity:0}],{duration:700,easing:'cubic-bezier(.23,1,.32,1)'});
      if(a)a.onfinish=()=>p.remove();else setTimeout(()=>p.remove(),700);
    }
  }
  private play(cue:Cue){this.sfx.enabled=this.game.s.options.sound;this.sfx.volume=this.game.s.options.volume;this.sfx.play(cue);}
  private announce(text:string){this.ctx.announce(text);}
  private toast(text:string,kind:'achievement'|'gold'|'info'|'warn'){
    const box=this.el.toasts;
    while(box.childElementCount>=4)box.firstElementChild!.remove();
    const t=document.createElement('p');t.className=`cc-toast cc-toast-${kind}`;t.textContent=text;box.append(t);
    if(!this.calm())t.animate?.([{opacity:0,transform:'translateY(-8px) scale(.97)'},{opacity:1,transform:'none'}],{duration:220,easing:'cubic-bezier(.23,1,.32,1)'});
    setTimeout(()=>{const a=t.animate?.([{opacity:1},{opacity:0}],{duration:200});if(a)a.onfinish=()=>t.remove();else t.remove();},kind==='warn'?7000:4200);
  }

  // ───────────────────────── Counters, buffs, golden, pests ─────────────────────────
  private updateCounters(){
    const g=this.game,k=this.f(g.s.kernels),cps=this.f(g.effectiveCps(),true),cpc=this.f(g.clickValue(),true);
    if(this.el.kernels.textContent!==k){this.el.kernels.textContent=k;this.el.hudK.textContent=k;}
    if(this.el.cps.textContent!==cps){this.el.cps.textContent=cps;this.el.hudC.textContent=cps;}
    if(this.el.cpc.textContent!==cpc){this.el.cpc.textContent=cpc;this.el.cob.setAttribute('aria-label',`Harvest the cob: ${cpc} kernels per click. You have ${k} kernels.`);}
  }
  private updateBuffs(){
    const g=this.game,chips:string[]=[];
    const chip=(cls:string,name:string,detail:string,left:number,total:number,title:string)=>chips.push(`<div class="cc-buff ${cls}" title="${esc(title)}"><span class="cc-buff-name">${name}</span><span class="cc-buff-detail">${detail}</span><span class="cc-buff-bar" style="--left:${Math.max(0,Math.min(1,left/total))}"></span></div>`);
    for(const kind of ['bumper','storm'] as const){
      const e=g.s.golden.effects[kind];
      if(e)chip(`cc-buff-${kind}`,GOLDEN.effects[kind].name,`×${GOLDEN.effects[kind].mult} · ${duration(e.remaining)}`,e.remaining,e.duration,GOLDEN.effects[kind].desc+' Collecting the same effect again refreshes its timer instead of stacking.');
    }
    const fest=g.has('festival')?g.s.festival.active:null;
    if(fest)chip('cc-buff-festival',FESTIVALS[fest.id].name,duration(fest.remaining),fest.remaining,FESTIVAL.duration,FESTIVALS[fest.id].desc);
    if(g.cornpocalypseActive()&&g.s.pests.list.length){
      const stolen=Big.sum(g.s.pests.list.map(p=>p.stolen));
      chips.push(`<div class="cc-buff cc-buff-pests"><span class="cc-buff-name">${g.s.pests.list.length} pest${g.s.pests.list.length>1?'s':''}</span><span class="cc-buff-detail" title="Holding ${this.f(stolen)} kernels">−${Math.round(g.siphonFraction()*100)}%</span><button type="button" class="cc-mini" data-act="pop-all">Pop all</button></div>`);
    }
    const html=chips.join('');
    if(this.sig.buffs!==html){this.sig.buffs=html;this.el.buffs.innerHTML=html;}
  }
  private updateGolden(){
    const g=this.game.s.golden.onScreen,layer=this.el.golden;
    let button=layer.querySelector<HTMLButtonElement>('.cc-golden');
    if(!g){button?.remove();return;}
    if(!button){
      button=document.createElement('button');button.type='button';button.className='cc-golden';
      button.innerHTML=`${goldenArt()}<span class="cc-golden-bar" aria-hidden="true"><span></span></span>`;
      layer.append(button);
      if(!this.calm())button.animate?.([{opacity:0,transform:'scale(.6)'},{opacity:1,transform:'scale(1)'}],{duration:260,easing:'cubic-bezier(.23,1,.32,1)'});
    }
    button.style.left=`${g.x*100}%`;button.style.top=`${g.y*100}%`;
    button.style.setProperty('--life',String(Math.max(0,g.life/g.maxLife)));
    button.classList.toggle('cc-fading',g.life<3);
    const label=`Golden cob: collect it (${Math.ceil(g.life)} seconds left, or press G)`;
    if(button.getAttribute('aria-label')!==label)button.setAttribute('aria-label',label);
  }
  private collectGolden(){
    if(!this.canAct())return;
    const g=this.game.s.golden.onScreen;if(!g)return;
    const button=this.el.golden.querySelector<HTMLElement>('.cc-golden');
    if(button)this.burst(button,12);
    const event=this.game.collectGolden();
    if(event?.type!=='golden')return;
    const seconds=event.kind==='lucky'?0:this.game.s.golden.effects[event.kind]?.remaining??0;
    const text=goldenResult(event.kind,event.amount,this.style(),seconds)+(event.twin?' Twin!':'');
    this.toast(text,'gold');this.announce(text);this.play('golden');
    this.drainEvents();this.updateGolden();this.updateBuffs();this.requestSave();
  }
  private updatePests(){
    const g=this.game,list=g.cornpocalypseActive()?g.s.pests.list:[];
    const sig=list.map(p=>p.id).join();
    if(this.sig.pests!==sig){
      this.sig.pests=sig;
      this.el.pests.innerHTML=list.map(p=>`<button type="button" class="cc-pest" data-pest="${p.id}" style="--a:${p.angle}deg">${this.icon('pest',pestArt)}</button>`).join('');
    }
    this.el.pests.querySelectorAll<HTMLElement>('.cc-pest').forEach(b=>{
      const p=list.find(x=>x.id===Number(b.dataset.pest));
      if(p)b.setAttribute('aria-label',`Mutant pest holding ${this.f(p.stolen)} kernels: pop it for ${this.f(p.stolen.mul(PESTS.payout))}`);
    });
  }
  private popPest(id:number,at:HTMLElement){
    if(!this.canAct())return;
    this.burst(at,8);
    const amount=this.game.popPest(id);
    if(amount){this.play('pest');this.toast(`+${this.f(amount)}`,'info');}
    this.drainEvents();this.updatePests();this.updateBuffs();this.requestSave();
  }
  private popAll(){
    if(!this.canAct())return;
    const n=this.game.s.pests.list.length;if(!n)return;
    const total=this.game.popAllPests();
    this.play('pest');this.toast(`+${this.f(total)}`,'info');
    this.drainEvents();this.updatePests();this.updateBuffs();this.requestSave();
  }

  // ───────────────────────── Shop ─────────────────────────
  private icon(key:string,make:()=>string){let svg=this.icons.get(key);if(!svg){svg=make();this.icons.set(key,svg);}return svg;}
  private producerIcon(id:ProducerId){return this.icon(id,()=>producerArt(id));}
  private upgradeIcon(u:Upgrade):string {
    const e=u.effect;
    switch(e.kind){
      case 'producer':return this.producerIcon(e.target);
      case 'synergy':return `<span class="cc-pair">${this.producerIcon(e.low)}${this.producerIcon(e.high)}</span>`;
      case 'golden':return this.icon('golden',goldenArt);
      case 'butter':return this.icon('butter',butterArt);
      case 'unlock':return e.feature==='scarecrow'?this.icon('scarecrow-straw',()=>scarecrowArt('straw')):e.feature==='cornpocalypse'?this.icon('pest',pestArt):e.feature==='garden'?this.icon('seed',seedArt):this.icon('sparkle',sparkleArt);
      case 'click':case 'clickCps':return this.icon('mouse',mouseArt);
      case 'manyHands':return `<span class="cc-click-icon">${this.producerIcon('farmhand')}</span>`;
      case 'global':return `<span class="cc-flavour" style="--hue:${(Number(u.id.split('-')[1])*47)%360}deg">${this.icon('kernel',kernelArt)}</span>`;
    }
  }
  private gain(id:ProducerId,count:number):Big {
    if(this.gainVersion!==this.game.version){this.gainVersion=this.game.version;this.gainCache.clear();}
    const key=`${id}:${count}:${this.game.temporaryMult()}`;
    let v=this.gainCache.get(key);
    if(!v){v=this.game.gainFor(id,count);this.gainCache.set(key,v);}
    return v;
  }
  private updateShop(){
    const g=this.game,style=this.style();
    // Producers: owned or nearly affordable ones, plus one mystery row for the next.
    const shown=PRODUCERS.filter(p=>g.revealed(p.id));
    const mystery=PRODUCERS.find(p=>!g.revealed(p.id));
    const sig=shown.map(p=>p.id).join()+(mystery?.id??'');
    if(this.sig.producers!==sig){
      this.sig.producers=sig;
      this.el.producers.innerHTML=shown.map(p=>`<button type="button" class="cc-prod" role="listitem" data-producer="${p.id}" data-tip="producer:${p.id}" aria-describedby="cc-tooltip">
        <span class="cc-prod-icon">${this.producerIcon(p.id)}</span>
        <span class="cc-prod-main"><span class="cc-prod-name">${p.name}</span><span class="cc-prod-price"><span class="cc-prod-qty"></span> <span class="cc-cost"></span></span></span>
        <span class="cc-prod-owned"></span></button>`).join('')+(mystery?`<div class="cc-prod cc-mystery" role="listitem"><span class="cc-prod-icon">?</span><span class="cc-prod-main"><span class="cc-prod-name">???</span></span></div>`:'');
    }
    for(const row of this.el.producers.querySelectorAll<HTMLElement>('[data-producer]')){
      const id=row.dataset.producer as ProducerId,owned=g.s.producers[id];
      const qty=g.quantity(id,this.amount),cost=g.bulkCost(id,qty),afford=g.s.kernels.gte(cost)&&(this.amount!=='max'||g.maxAffordable(id)>0);
      const gain=this.gain(id,qty);
      const set=(sel:string,text:string)=>{const el=row.querySelector(sel)!;if(el.textContent!==text)el.textContent=text;};
      set('.cc-prod-qty',qty>1||this.amount!==1?`×${qty}`:'');
      set('.cc-cost',this.f(cost));set('.cc-prod-owned',owned?String(owned):'');
      row.classList.toggle('cc-poor',!afford);
      row.setAttribute('aria-disabled',String(!afford));
      const label=`${producerById[id].name}: own ${owned}. Buy ${qty} for ${format(cost,style)} kernels, +${format(gain,style,true)} per second.${afford?'':' Not enough kernels.'}`;
      if(row.getAttribute('aria-label')!==label)row.setAttribute('aria-label',label);
    }
    // Upgrades
    const available=g.availableUpgrades();
    const usig=available.map(u=>u.id).join();
    if(this.sig.upgrades!==usig){
      this.sig.upgrades=usig;
      this.el.upgrades.innerHTML=available.length?available.map(u=>`<button type="button" class="cc-upg cc-upg-${u.group}" role="listitem" data-upgrade="${u.id}" data-tip="upgrade:${u.id}" aria-describedby="cc-tooltip">${this.upgradeIcon(u)}</button>`).join('')
        :'';
      this.el.upgCount.textContent=available.length?`(${available.length})`:'';
    }
    for(const b of this.el.upgrades.querySelectorAll<HTMLElement>('[data-upgrade]')){
      const u=upgradeById.get(b.dataset.upgrade!)!,price=g.upgradePrice(u),afford=g.s.kernels.gte(price);
      b.classList.toggle('cc-poor',!afford);b.setAttribute('aria-disabled',String(!afford));
      const label=`${u.name}: ${effectText(u)} Costs ${format(price,style)} kernels.${afford?'':' Not enough kernels.'}`;
      if(b.getAttribute('aria-label')!==label)b.setAttribute('aria-label',label);
    }
    const upcoming=g.upcomingUpgrades(4);
    const csig=upcoming.map(u=>u.id).join();
    if(this.sig.upcoming!==csig){
      this.sig.upcoming=csig;
      this.el.upcoming.innerHTML=upcoming.length?`<span class="cc-upcoming-label">Coming soon</span>${upcoming.map(u=>`<button type="button" class="cc-upg cc-locked" data-tip="locked:${u.id}" aria-describedby="cc-tooltip" aria-label="Locked upgrade ${esc(u.name)}: unlocks when you ${esc(requirementText(u.req,style))}.">${this.upgradeIcon(u)}</button>`).join('')}`:'';
    }
  }
  private buyProducer(id:ProducerId,row:HTMLElement){
    if(!this.canAct())return;
    if(this.passive)return;
    this.simulate();
    const g=this.game,before=g.s.producers[id];
    const bought=g.buyProducer(id,this.amount);
    if(!bought){
      this.play('deny');
      return;
    }
    this.play('buy');this.burst(row.querySelector('.cc-prod-icon')??row,Math.min(8,2+bought));
    this.announce(`Bought ${bought} ${bought===1?producerById[id].name:producerById[id].plural}. You now own ${before+bought}.`);
    this.updateShop();this.updateCounters();this.requestSave();
    if(this.tooltipFor===row)this.showTooltip(row);
  }
  private clickUpgrade(b:HTMLElement){
    if(!this.canAct())return;
    if(this.passive)return;
    // Touch: the first tap explains, the second tap buys.
    if(this.lastPointerType==='touch'&&this.touchArmed!==b){this.touchArmed=b;this.showTooltip(b);return;}
    this.touchArmed=null;
    const u=upgradeById.get(b.dataset.upgrade!)!;
    this.simulate();
    if(!this.game.buyUpgrade(u.id)){this.play('deny');return;}
    this.play('upgrade');this.burst(b,8);this.hideTooltip();
    this.announce(`Bought ${u.name}. ${effectText(u)}`);
    if(u.effect.kind==='unlock')this.toast(`Unlocked: ${u.name}`,'gold');
    this.updateShop();this.updateCounters();this.slowUpdate();this.requestSave();
    // Keep keyboard focus in the upgrade list after the bought button disappears.
    this.el.upgrades.querySelector<HTMLElement>('[data-upgrade]')?.focus({preventScroll:true});
  }

  // ───────────────────────── Tooltips ─────────────────────────
  private tooltipHtml(spec:string):string {
    const g=this.game,style=this.style();
    const [kind,id]=spec.split(':');
    if(kind==='producer'){
      const p=producerById[id as ProducerId],owned=g.s.producers[p.id],qty=g.quantity(p.id,this.amount);
      const total=g.producerOutput(p.id),share=g.baseCps().isZero()?0:total.div(g.baseCps()).toNumber()*100;
      const next=UPGRADES.find(u=>u.effect.kind==='producer'&&u.effect.target===p.id&&!g.s.upgrades.has(u.id)&&!g.requirementMet(u.req));
      return `<strong>${p.name}</strong><p class="cc-tt-flavour">${p.desc}</p>
        <p>Each produces <b>${format(g.unitRate(p.id).mul(g.permanentMult()),style,true)}</b>/s. ${owned?`Your ${owned} produce <b>${format(total,style,true)}</b>/s (${share.toFixed(1)}% of production).`:''}</p>
        <p>Buy ${qty}: <b>${format(g.bulkCost(p.id,qty),style)}</b> kernels for <b>+${format(this.gain(p.id,qty),style,true)}</b>/s.</p>
        ${next&&next.req.type==='owned'?`<p class="cc-muted">Next upgrade unlocks at ${next.req.count} owned.</p>`:''}`;
    }
    if(kind==='ach'){const a=achievementById.get(id)!,got=g.s.achievements.has(id);return a.secret&&!got?'<strong>???</strong><p>Secret.</p>':`<strong>${a.name}</strong><p>${a.desc}</p>${got?'<p class="cc-muted">Earned</p>':''}`;}
    const u=upgradeById.get(id);if(!u)return '';
    const price=g.upgradePrice(u);
    if(kind==='locked')return `<strong>${u.name}</strong> <span class="cc-muted">(locked)</span><p>${effectText(u)}</p><p>Unlocks when you ${requirementText(u.req,style)} (${Math.floor(g.requirementProgress(u.req)*100)}% there).</p><p>Price: ${format(price,style)} kernels.</p>`;
    return `<strong>${u.name}</strong><p>${effectText(u)}</p><p>Price: <b>${format(price,style)}</b> kernels${g.s.kernels.gte(price)?'':` (need ${format(price.sub(g.s.kernels),style)} more)`}.</p>
      <p class="cc-muted">Unlocked because you ${requirementText(u.req,style)}.</p><p class="cc-tt-flavour">“${u.flavour}”</p>${this.lastPointerType==='touch'?'<p class="cc-muted">Tap again to buy.</p>':''}`;
  }
  private showTooltip(target:HTMLElement){
    const spec=target.dataset.tip;if(!spec)return;
    const tip=this.el.tooltip;
    tip.innerHTML=this.tooltipHtml(spec);tip.hidden=false;this.tooltipFor=target;
    const r=target.getBoundingClientRect(),root=this.root.getBoundingClientRect(),w=Math.min(300,root.width-16);
    tip.style.width=`${w}px`;
    const h=tip.offsetHeight;
    let left=r.left-root.left-w-10;
    if(left<8)left=Math.min(root.width-w-8,Math.max(8,r.left-root.left+r.width/2-w/2));
    let top=left===r.left-root.left-w-10?r.top-root.top:r.bottom-root.top+8;
    if(top+h>root.height-8)top=Math.max(8,r.top-root.top-h-8);
    tip.style.left=`${left}px`;tip.style.top=`${top}px`;
  }
  private readonly hideTooltip=()=>{this.el.tooltip.hidden=true;this.tooltipFor=null;this.touchArmed=null;};
  private refreshTooltip(){if(this.tooltipFor){if(this.tooltipFor.isConnected&&!this.el.tooltip.hidden)this.el.tooltip.innerHTML=this.tooltipHtml(this.tooltipFor.dataset.tip!);else this.hideTooltip();}}

  // ───────────────────────── Tabs, tips, goals ─────────────────────────
  private updateTabs(){
    const g=this.game;
    const gardenVisible=g.has('garden')||g.s.life.planted>0;
    const replantVisible=g.seedsAvailable()>0||g.s.seedsClaimed>0||g.s.life.earned.gte(PRESTIGE.seedUnit*0.3);
    const set=(sub:Sub,visible:boolean)=>{const t=this.root.querySelector<HTMLElement>(`#cc-subtab-${sub}`)!;if(t.hidden===visible){t.hidden=!visible;if(visible&&!this.calm())t.animate?.([{opacity:0},{opacity:1}],{duration:300});}};
    set('garden',gardenVisible);set('replant',replantVisible);
    if((this.sub==='garden'&&!gardenVisible)||(this.sub==='replant'&&!replantVisible))this.setSub('farm');
  }
  private updateTip(){
    const g=this.game,tip=TIPS.find(t=>!g.s.tutorial.has(t.id)&&!t.done(g)&&t.show(g));
    // Completed tips are remembered so they never return.
    for(const t of TIPS)if(!g.s.tutorial.has(t.id)&&t.done(g))g.s.tutorial.add(t.id);
    const el=this.el.tip;
    if(!tip){el.hidden=true;delete el.dataset.tip;return;}
    if(el.dataset.tip!==tip.id){el.dataset.tip=tip.id;el.querySelector('p')!.textContent=tip.text;el.hidden=false;}
    this.root.querySelectorAll('.cc-tab').forEach(t=>t.classList.toggle('cc-attention',!!tip.tab&&(t as HTMLElement).dataset.top===tip.tab&&this.top!==tip.tab));
    if(tip.sub)this.root.querySelector(`#cc-subtab-${tip.sub}`)?.classList.toggle('cc-attention',this.sub!==tip.sub);
  }
  /** One short line under the cob: what to save for next. The next unlock lives in Goals. */
  private updateGoal(){
    const g=this.game,style=this.style(),cps=g.effectiveCps();
    let goal='';
    if(g.seedsAvailable()>0&&g.s.life.replants===0)goal=`Replant ready: ${g.seedsAvailable()} seed${g.seedsAvailable()>1?'s':''}`;
    else if(g.totalOwned()===0)goal=`Next: Farmhand · ${format(g.unitPrice('farmhand',0),style)}`;
    else{
      const target=[
        ...g.availableUpgrades().map(u=>({name:u.name,cost:g.upgradePrice(u)})),
        ...PRODUCERS.filter(p=>g.revealed(p.id)).map(p=>({name:p.name,cost:g.unitPrice(p.id,g.s.producers[p.id])})),
      ].sort((a,b)=>a.cost.cmp(b.cost)).find(o=>o.cost.gt(g.s.kernels));
      if(target)goal=`Next: ${target.name}${cps.isZero()?'':` · ${duration(target.cost.sub(g.s.kernels).div(cps).toNumber())}`}`;
    }
    if(this.el.goal.textContent!==goal)this.el.goal.textContent=goal;
  }
  private unlockText():string {
    const g=this.game,style=this.style();
    const feature=UPGRADES.find(u=>u.group==='feature'&&!g.s.upgrades.has(u.id)&&!g.requirementMet(u.req));
    const hidden=PRODUCERS.find(p=>!g.revealed(p.id));
    return feature?`${feature.name}: ${requirementText(feature.req,style)}`:hidden?`${hidden.name}: around ${format(hidden.baseCost*0.35,style)} kernels`:'Everything unlocked!';
  }
  private updateTicker(){
    const g=this.game;
    this.el.ticker.hidden=!g.s.options.ticker;
    if(!g.s.options.ticker||performance.now()-this.newsAt<10000&&this.newsIndex>=0)return;
    this.newsAt=performance.now();
    const pool=NEWS.filter(n=>(!n.after||g.s.producers[n.after]>0)&&(!n.minClicks||g.s.life.clicks>=n.minClicks));
    // Prefer headlines about the newest producers now and then.
    this.newsIndex=Math.floor(Math.random()*pool.length);
    const p=this.el.news;p.textContent=pool[this.newsIndex]?.text??'';
    if(!this.calm())p.animate?.([{opacity:0,transform:'translateX(24px)'},{opacity:1,transform:'none'}],{duration:450,easing:'cubic-bezier(.23,1,.32,1)'});
  }

  // ───────────────────────── Farm scene ─────────────────────────
  /** Controls for the late-game farm features: scarecrow bonus, festival timer and the Cornpocalypse. */
  private updateFarmBar(){
    const g=this.game,s=g.s,parts:string[]=[];
    if(g.has('scarecrow')){
      const names=s.scarecrow.bonuses.map(b=>SCARECROW[b].name).join(' + ');
      parts.push(`<button type="button" class="cc-chip${names?'':' cc-attention'}" data-act="scarecrow">Scarecrow: ${names||'choose a bonus'}${s.scarecrow.cooldown>0?` · ${duration(s.scarecrow.cooldown)}`:''}</button>`);
    }
    if(g.has('festival'))parts.push(`<span class="cc-chip cc-chip-info">${s.festival.active?`${FESTIVALS[s.festival.active.id].name}: ${duration(s.festival.active.remaining)} left`:`Next fair in about ${duration(s.festival.next)} of play`}</span>`);
    if(g.has('cornpocalypse'))parts.push(`<button type="button" class="cc-chip" data-act="pests" aria-pressed="${s.pests.enabled}">Cornpocalypse: ${s.pests.enabled?`on (${s.pests.list.length}/8 pests)`:'paused'}</button>`);
    const html=parts.join('');
    const bar=this.el.farmBar;
    if(this.sig.farmBar!==html){
      const focused=(document.activeElement as HTMLElement|null)?.dataset?.act;
      this.sig.farmBar=html;bar.innerHTML=html;bar.hidden=!html;
      if(focused&&bar.contains(document.activeElement)===false)bar.querySelector<HTMLElement>(`[data-act=${focused}]`)?.focus({preventScroll:true});
    }
  }
  private chooseScarecrow(){
    const g=this.game,slots=g.scarecrowSlots(),current=new Set(g.s.scarecrow.bonuses),cool=g.s.scarecrow.cooldown;
    const type=slots>1?'checkbox':'radio';
    this.openModal(`<h2 id="cc-modal-title">Scarecrow bonus</h2><p>${slots>1?'Choose up to two bonuses.':'Choose one bonus.'} After changing, the scarecrow needs ${duration(60)} to settle before the next change.</p>
      ${cool>0?`<p class="cc-warn">Settling in: ${duration(cool)} until you can change again.</p>`:''}
      <fieldset class="cc-crow-options"${cool>0?' disabled':''}><legend class="cc-sr">Bonuses</legend>${(Object.keys(SCARECROW) as ScarecrowBonus[]).map(b=>`<label class="cc-crow-option"><input type="${type}" name="cc-crow" value="${b}"${current.has(b)?' checked':''}><span class="cc-crow-art">${this.icon('crow'+SCARECROW[b].hat,()=>scarecrowArt(SCARECROW[b].hat))}</span><span><strong>${SCARECROW[b].name}</strong><small>${SCARECROW[b].desc}</small></span></label>`).join('')}</fieldset>
      <p class="cc-error" role="alert"></p>
      <div class="cc-row"><button type="button" class="cc-btn cc-btn-quiet" data-act="close">Cancel</button><button type="button" class="cc-btn" data-act="apply"${cool>0?' disabled':''}>Apply</button></div>`,card=>{
      card.querySelector('[data-act=apply]')!.addEventListener('click',()=>{
        const chosen=[...card.querySelectorAll<HTMLInputElement>('input:checked')].map(i=>i.value as ScarecrowBonus);
        if(chosen.length>slots){card.querySelector('.cc-error')!.textContent=`Your scarecrow can hold ${slots} bonus${slots>1?'es':''}.`;return;}
        if(!chosen.length){card.querySelector('.cc-error')!.textContent='Choose a bonus.';return;}
        if(this.game.setScarecrow(chosen)){this.play('upgrade');this.toast(`Scarecrow set: ${chosen.map(b=>SCARECROW[b].name).join(' + ')}.`,'info');this.requestSave();}
        this.closeModal();this.slowUpdate();
      });
    });
  }
  private updateScene(){
    const g=this.game,s=g.s;
    const stage=s.producers.dimension||s.producers.singularity||s.producers.corniverse?3:s.producers.orbital||s.producers.lunar||s.producers.cloner||s.producers.time?2:s.producers.factory||s.producers.lab||s.producers.hydroponic||s.producers.robot||s.producers.weather||s.producers.megafarm?1:0;
    const copies=(n:number)=>n<=0?0:Math.min(8,1+Math.floor(Math.log2(n)));
    const lots=PRODUCER_IDS.filter(id=>s.producers[id]>0);
    const fest=g.has('festival')?s.festival.active?.id??'':'';
    const crow=g.has('scarecrow')?s.scarecrow.bonuses[0]??'watchful':'';
    const sig=[stage,lots.map(id=>`${id}${copies(s.producers[id])}`).join(),fest,crow].join('|');
    if(this.sig.scene===sig)return;
    const previous=new Set((this.sig.scene??'').split('|')[1]?.split(',').map(x=>x.replace(/\d+$/,''))??[]);
    this.sig.scene=sig;
    const hat=crow?SCARECROW[crow as ScarecrowBonus].hat:'straw';
    this.el.scene.innerHTML=`<div class="cc-backdrop">${this.icon('scene'+stage,()=>sceneArt(stage as 0|1|2|3))}</div>
      ${fest?`<div class="cc-bunting" aria-hidden="true"></div><p class="cc-fair-banner">${FESTIVALS[fest as keyof typeof FESTIVALS].name}!</p>`:''}
      ${crow?`<div class="cc-scarecrow" title="Scarecrow: ${SCARECROW[crow as ScarecrowBonus].name}">${this.icon('crow'+hat,()=>scarecrowArt(hat))}</div>`:''}
      <div class="cc-lots">${lots.length?lots.map(id=>`<div class="cc-lot${previous.has(id)?'':' cc-new'}" data-lot="${id}" title="${s.producers[id]} ${s.producers[id]===1?producerById[id].name:producerById[id].plural}">
        ${Array.from({length:copies(s.producers[id])},(_,i)=>`<span class="cc-lot-icon" style="--i:${i}">${this.producerIcon(id)}</span>`).join('')}<span class="cc-lot-count">${s.producers[id]}</span></div>`).join('')
        :'<p class="cc-scene-empty">An empty field, waiting for its first Farmhand.</p>'}</div>`;
    this.el.scene.setAttribute('aria-label',lots.length?`Your farm: ${lots.map(id=>`${s.producers[id]} ${s.producers[id]===1?producerById[id].name:producerById[id].plural}`).join(', ')}`:'Your farm: an empty field');
  }

  // ───────────────────────── Goals ─────────────────────────
  private updateGoals(){
    const g=this.game,count=g.s.achievements.size;
    if(this.sig.goals!==`${count}|${g.s.skin}`){
      this.sig.goals=`${count}|${g.s.skin}`;
      const nextSkin=SKINS.find(s=>s.achievements>count);
      this.el.goals.innerHTML=`<div class="cc-butter"><span class="cc-butter-icon">${this.icon('butter',butterArt)}</span><div class="cc-grow">
        <p><b>Butter Bonus +${g.butterPct().toFixed(0)}%</b> <span class="cc-muted">${count}/${ACHIEVEMENTS.length}</span></p>
        <div class="cc-meter" role="meter" aria-label="Butter Bonus" aria-valuemin="0" aria-valuemax="${ACHIEVEMENTS.length}" aria-valuenow="${count}"><span style="--fill:${count/ACHIEVEMENTS.length}"></span></div>
        ${nextSkin?`<p class="cc-muted">Next skin at ${nextSkin.achievements}</p>`:''}</div></div>
        <div class="cc-next-ach"></div>
        <div class="cc-skins" role="radiogroup" aria-label="Cob skin">${SKINS.map(s=>{const open=g.skinUnlocked(s.id);
          return `<button type="button" role="radio" class="cc-skin${open?'':' cc-locked'}" data-skin="${s.id}" aria-checked="${g.s.skin===s.id}" aria-label="${s.name}${open?'':`: needs ${s.achievements} achievements`}" title="${s.name}"${open?'':' aria-disabled="true"'}>${open?this.icon('skin-'+s.id,()=>cobArt(s.id)):'<span class="cc-lock" aria-hidden="true">?</span>'}</button>`;}).join('')}</div>
        <ul class="cc-achievements" aria-label="Achievements">${ACHIEVEMENTS.map(a=>{const got=g.s.achievements.has(a.id);const hide=a.secret&&!got;
          return `<li class="cc-ach${got?' cc-got':''}" tabindex="0" data-tip="ach:${a.id}" aria-label="${esc(hide?'Secret achievement':`${a.name}: ${a.desc}${got?' Earned.':''}`)}">${got?this.icon('kernel',kernelArt):''}</li>`;}).join('')}</ul>`;
    }
    const next=g.nextAchievement();
    const box=this.el.goals.querySelector<HTMLElement>('.cc-next-ach')!;
    const html=`${next?`<p><span class="cc-muted">Next:</span> <b>${next.name}</b> · ${next.desc}</p><div class="cc-meter" role="meter" aria-label="Progress to ${esc(next.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(g.achievementProgress(next)*100)}"><span style="--fill:${g.achievementProgress(next)}"></span></div>`:''}<p><span class="cc-muted">Unlock:</span> ${this.unlockText()}</p>`;
    if(box.innerHTML!==html)box.innerHTML=html;
  }

  // ───────────────────────── Stats ─────────────────────────
  private updateStats(){
    const g=this.game,s=g.s,r=s.run,l=s.life,f=(v:Big|number)=>this.f(v);
    const off=g.offlineAllowance();
    const rows:[string,string,string][]=[
      ['Kernels harvested',f(r.earned),f(l.earned)],['Cob clicks',r.clicks.toLocaleString('en-GB'),l.clicks.toLocaleString('en-GB')],
      ['Kernels from clicking',f(r.clickEarned),f(l.clickEarned)],['Golden cobs collected',String(r.golden),String(l.golden)],
      ['Producers bought',String(r.producersBought),String(l.producersBought)],['Upgrades bought',String(r.upgradesBought),String(l.upgradesBought)],
      ['Best production',`${f(r.bestCps)}/s`,`${f(l.bestCps)}/s`],['Earned while away',f(r.offlineEarned),f(l.offlineEarned)],
      ['Garden harvests',String(r.harvests),String(l.harvests)],['Pests popped',String(r.pests),String(l.pests)],['Festivals',String(r.festivals),String(l.festivals)],
      ['Time played',duration(r.playSeconds),duration(l.playSeconds)],
    ];
    const html=`<table class="cc-stats"><caption class="cc-sr">Statistics</caption><thead><tr><th scope="col">Statistic</th><th scope="col">This run</th><th scope="col">Lifetime</th></tr></thead><tbody>
      ${rows.map(([a,b,c])=>`<tr><th scope="row">${a}</th><td>${b}</td><td>${c}</td></tr>`).join('')}</tbody></table>
      <p class="cc-muted">Replants ${l.replants} · Seeds ${s.seedsClaimed} (+${(s.seedsClaimed*PRESTIGE.bonusPerSeed*100).toFixed(0)}%) · Varieties ${s.garden.discovered.size}/${VARIETIES.length}</p>
      <p class="cc-muted">Away: ${Math.round(off.rate*100)}% production for up to ${longDuration(off.seconds)}.</p>`;
    if(this.sig.stats!==html){this.sig.stats=html;this.el.stats.innerHTML=html;}
  }

  // ───────────────────────── Replant ─────────────────────────
  private updateReplant(){
    const g=this.game,s=g.s,style=this.style(),available=g.seedsAvailable(),next=g.nextSeedProgress();
    const bonusNow=s.seedsClaimed*PRESTIGE.bonusPerSeed*100,bonusAfter=(s.seedsClaimed+available)*PRESTIGE.bonusPerSeed*100;
    const paths:[PermPath,string][]=[['active','Clicking'],['idle','Idle'],['golden','Golden'],['general','Farm']];
    const html=`<div class="cc-seed-head"><span class="cc-seed-icon">${this.icon('seed',seedArt)}</span><div class="cc-grow">
      <p class="cc-big"><b>+${available}</b> seed${available===1?'':'s'}</p>
      <div class="cc-meter" role="meter" aria-label="Progress to the next Golden Seed" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(next.progress*100)}"><span style="--fill:${next.progress}"></span></div>
      <p class="cc-muted">Next seed ${(next.progress*100).toFixed(0)}% · You have ${s.seeds} · Bonus +${bonusNow.toFixed(0)}%${available?` → +${bonusAfter.toFixed(0)}%`:''}</p></div></div>
      <div class="cc-reset-lists"><div><h3 class="cc-h3">Resets</h3><p>Kernels, producers, upgrades, garden plants</p></div>
      <div><h3 class="cc-h3">Keeps</h3><p>Achievements, skins, varieties, seeds, permanent upgrades</p></div></div>
      <button type="button" class="cc-btn cc-btn-gold" data-act="replant"${available?'':' disabled'}>${available?`Replant for ${available} Golden Seed${available===1?'':'s'}`:'Replant'}</button>
      ${paths.map(([path,label])=>`<h4 class="cc-h4">${label}</h4><div class="cc-perms">${PERMS.filter(p=>p.path===path).map(p=>{
        const owned=s.perms.has(p.id),locked=!!p.requires&&!s.perms.has(p.requires),can=g.canBuyPerm(p.id);
        return `<button type="button" class="cc-perm${owned?' cc-owned':''}${can?'':' cc-poor'}" data-perm="${p.id}" aria-disabled="${!can}" title="${esc(p.desc)}${locked?` Needs ${esc(permById.get(p.requires!)!.name)}.`:''}"><strong>${p.name}</strong><small>${p.desc}</small>
          <span class="cc-perm-cost">${owned?'Owned':`${p.cost} seed${p.cost===1?'':'s'}`}</span></button>`;}).join('')}</div>`).join('')}`;
    if(this.sig.replant!==html){
      const focused=(document.activeElement as HTMLElement|null)?.dataset?.perm;
      this.sig.replant=html;this.el.replant.innerHTML=html;
      if(focused)this.el.replant.querySelector<HTMLElement>(`[data-perm="${focused}"]`)?.focus({preventScroll:true});
    }
  }
  private confirmReplant(){
    const g=this.game,available=g.seedsAvailable(),style=this.style();
    if(available<1)return;
    this.confirm(`Replant for ${available} Golden Seed${available===1?'':'s'}?`,
      `Production bonus +${(g.s.seedsClaimed*PRESTIGE.bonusPerSeed*100).toFixed(0)}% → +${((g.s.seedsClaimed+available)*PRESTIGE.bonusPerSeed*100).toFixed(0)}%. Kernels, producers and upgrades reset.`,
      'Replant',()=>{
        addBackup(this.ownedSnapshot(),'Before replanting');
        const claimed=this.game.replant();
        this.afterLoad();this.flushSave();this.play('achievement');
        this.toast(`Replanted! +${claimed} seeds`,'gold');
        this.game.checkAchievements();this.drainEvents();
      });
  }

  // ───────────────────────── Options ─────────────────────────
  private updateOptionsLive(){
    const o=this.game.s.options;
    if(this.sig.options!=='built'){
      this.sig.options='built';
      this.el.options.innerHTML=`<h3 class="cc-h3">Sound and motion</h3>
        <label class="cc-opt"><span>Sound effects</span><input type="checkbox" data-opt="sound"></label>
        <label class="cc-opt"><span>Volume</span><input type="range" min="0" max="1" step="0.05" data-opt="volume"></label>
        <label class="cc-opt"><span>Reduce motion <small>(also follows the arcade menu and your device setting)</small></span><input type="checkbox" data-opt="reducedMotion"></label>
        <label class="cc-opt"><span>Particle effects</span><select data-opt="particles"><option value="full">Full</option><option value="low">Low</option><option value="off">Off</option></select></label>
        <label class="cc-opt"><span>Number style</span><select data-opt="numbers"><option value="short">Short (1.23 M)</option><option value="long">Long (1.23 million)</option><option value="scientific">Scientific (1.23e6)</option></select></label>
        <label class="cc-opt"><span>News ticker</span><input type="checkbox" data-opt="ticker"></label>
        <h3 class="cc-h3">Saving</h3>
        <p class="cc-muted">The farm saves itself every few seconds and after big purchases. Export a save code to keep a copy or move it to another browser.</p>
        <div class="cc-row"><button type="button" class="cc-btn" data-act="save">Save now</button><button type="button" class="cc-btn cc-btn-quiet" data-act="export">Export save</button><button type="button" class="cc-btn cc-btn-quiet" data-act="import">Import save</button></div>
        <h3 class="cc-h3">Backups</h3><div class="cc-backups"></div>
        <h3 class="cc-h3">Help</h3><div class="cc-row"><button type="button" class="cc-btn cc-btn-quiet" data-act="tutorial">Show tips again</button><button type="button" class="cc-btn cc-btn-danger" data-act="reset">Start a new farm…</button></div>`;
    }
    for(const input of this.el.options.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-opt]')){
      if(document.activeElement===input)continue;
      const key=input.dataset.opt as keyof typeof o;
      if(input instanceof HTMLInputElement&&input.type==='checkbox')input.checked=!!o[key];else input.value=String(o[key]);
    }
    const backups=listBackups();
    const bsig=backups.map(b=>b.at).join();
    const box=this.el.options.querySelector<HTMLElement>('.cc-backups')!;
    if(box.dataset.sig!==bsig){
      box.dataset.sig=bsig;
      box.innerHTML=backups.length?`<ul class="cc-backup-list">${backups.map((b,i)=>`<li><span>${esc(b.reason)} · ${new Date(b.at).toLocaleString()}</span><button type="button" class="cc-mini" data-backup="${i}">Restore</button></li>`).join('')}</ul>`
        :'<p class="cc-muted">Backups are taken every 10 minutes and before replanting, importing or starting over.</p>';
    }
  }
  private bindPanels(){
    this.el.farmBar.addEventListener('click',event=>{
      const act=(event.target as Element).closest<HTMLElement>('[data-act]')?.dataset.act;
      if(act==='scarecrow')this.chooseScarecrow();
      if(act==='pests'){
        const on=!this.game.s.pests.enabled,n=this.game.s.pests.list.length,total=on?Big.ZERO:this.game.popAllPests();
        this.game.setCornpocalypse(on);this.drainEvents();
        this.toast(on?'The Cornpocalypse resumes: pests will return.':`Cornpocalypse paused${n?`: ${n} pests left and returned ${this.f(total)} kernels`:''}.`,'info');
        this.requestSave();this.slowUpdate();
      }
    });
    this.el.scene.addEventListener('click',event=>{if((event.target as Element).closest('.cc-scarecrow'))this.chooseScarecrow();});
    this.el.replant.addEventListener('click',event=>{
      const t=event.target as Element;
      if(t.closest('[data-act=replant]'))this.confirmReplant();
      const perm=t.closest<HTMLElement>('[data-perm]');
      if(perm){
        const p=permById.get(perm.dataset.perm!)!;
        if(this.game.buyPerm(p.id)){this.play('upgrade');this.toast(`${p.name}: ${p.desc}`,'gold');this.flushSave();this.sig.replant='';this.updateReplant();this.updateCounters();}
        else if(!this.game.s.perms.has(p.id)){this.play('deny');this.toast(p.requires&&!this.game.s.perms.has(p.requires)?`${p.name} needs ${permById.get(p.requires)!.name} first.`:`${p.name} costs ${p.cost} Golden Seeds.`,'info');}
      }
    });
    this.el.goals.addEventListener('click',event=>{
      const b=(event.target as Element).closest<HTMLElement>('[data-skin]');if(!b)return;
      const id=b.dataset.skin as SkinId;
      if(!this.game.skinUnlocked(id)){this.toast(`Earn ${SKINS.find(s=>s.id===id)!.achievements} achievements to unlock this skin.`,'info');return;}
      if(this.game.setSkin(id)){this.el.cob.innerHTML=cobArt(id);this.play('upgrade');this.requestSave();this.updateGoals();this.root.querySelector<HTMLElement>(`[data-skin="${id}"]`)?.focus();}
    });
    this.el.options.addEventListener('change',event=>{
      const input=event.target as HTMLInputElement|HTMLSelectElement,key=input.dataset.opt;if(!key)return;
      const o=this.game.s.options as unknown as Record<string,unknown>;
      o[key]=input instanceof HTMLInputElement&&input.type==='checkbox'?input.checked:input instanceof HTMLInputElement&&input.type==='range'?Number(input.value):input.value;
      this.applyOptions();this.sig.producers='';this.sig.stats='';this.sig.replant='';this.renderAll();this.requestSave();
      if(key==='sound'&&this.game.s.options.sound)this.play('buy');
    });
    this.el.options.addEventListener('input',event=>{const input=event.target as HTMLInputElement;if(input.dataset.opt==='volume'){this.game.s.options.volume=Number(input.value);this.play('pop');}});
    this.el.options.addEventListener('click',event=>{
      const t=event.target as Element,act=t.closest<HTMLElement>('[data-act]')?.dataset.act,backup=t.closest<HTMLElement>('[data-backup]');
      if(act==='save'){this.flushSave();this.toast(canRetain()?'Saved.':'Storage is blocked, so the save only lasts for this visit. Use Export to keep a copy.',canRetain()?'info':'warn');}
      if(act==='export')this.showExport();
      if(act==='import')this.showImport();
      if(act==='tutorial'){this.game.s.tutorial.clear();this.toast('Tips will appear again as they become relevant.','info');this.requestSave();}
      if(act==='reset')this.restart();
      if(backup){
        const b=listBackups()[Number(backup.dataset.backup)];if(!b)return;
        this.confirm('Restore this backup?',`${b.reason}, saved ${new Date(b.at).toLocaleString()}. Your current farm is backed up first, so you can switch back.`,'Restore backup',()=>{
          try{const state=deserialize(b.data,Date.now());addBackup(this.ownedSnapshot(),'Before restoring a backup');state.lastTick=state.clockMax=Date.now();state.rev=this.game.s.rev+1;this.load(state,Date.now());this.flushSave();this.toast('Backup restored.','info');}
          catch{this.toast('That backup could not be read.','warn');}
        });
      }
    });
  }
  private applyOptions(){
    const o=this.game.s.options;
    this.sfx.enabled=o.sound;this.sfx.volume=o.volume;
    this.root.classList.toggle('cc-calm',this.calm());
    this.root.dataset.particles=o.particles;
  }
  private showExport(){
    const code=exportString(this.ownedSnapshotForExport());
    this.openModal(`<h2 id="cc-modal-title">Export save</h2><p>Copy this code somewhere safe. Import it later to restore this farm.</p>
      <textarea class="cc-code" readonly rows="6" aria-label="Save code">${esc(code)}</textarea>
      <div class="cc-row"><button type="button" class="cc-btn" data-act="copy">Copy code</button><button type="button" class="cc-btn cc-btn-quiet" data-act="close">Done</button></div>`,card=>{
      const area=card.querySelector('textarea')!;area.select();
      card.querySelector('[data-act=copy]')!.addEventListener('click',async()=>{
        area.select();
        try{await navigator.clipboard.writeText(code);this.toast('Save code copied.','info');}
        catch{this.toast('Copy is blocked here: select the code and copy it manually.','warn');}
      });
    });
  }
  private ownedSnapshotForExport(){return serialize(this.game.s);}
  private showImport(){
    this.openModal(`<h2 id="cc-modal-title">Import save</h2><p>Paste a Corn Clicker save code. Your current farm is backed up first.</p>
      <textarea class="cc-code" rows="6" aria-label="Save code to import" placeholder="CORNCLICKER.…"></textarea><p class="cc-error" role="alert"></p>
      <div class="cc-row"><button type="button" class="cc-btn" data-act="do-import">Import</button><button type="button" class="cc-btn cc-btn-quiet" data-act="close">Cancel</button></div>`,card=>{
      card.querySelector('[data-act=do-import]')!.addEventListener('click',()=>{
        const text=card.querySelector('textarea')!.value,error=card.querySelector('.cc-error')!;
        try{
          const state=deserialize(importString(text),Date.now());
          // Imported saves never pay offline rewards: otherwise an old code could be imported repeatedly.
          state.lastTick=state.clockMax=Date.now();state.rev=Math.max(state.rev,this.game.s.rev)+1;
          addBackup(this.ownedSnapshot(),'Before importing a save');
          this.load(state,Date.now());this.flushSave();this.closeModal();this.toast('Save imported.','info');
        }catch(e){error.textContent=e instanceof SaveError?e.message:'That save code could not be read.';}
      });
    });
  }

  // ───────────────────────── Modals ─────────────────────────
  private openModal(html:string,bind?:(card:HTMLElement)=>void,closable=true){
    if(this.el.modal.hidden)this.modalReturn=document.activeElement as HTMLElement|null;
    this.el.modal.hidden=false;this.el.modal.dataset.closable=String(closable);
    for(const child of this.root.children)if(child!==this.el.modal&&child!==this.el.toasts)(child as HTMLElement).inert=true;
    this.card(html);bind?.(this.el.card);
    this.el.card.querySelectorAll('[data-act=close]').forEach(b=>b.addEventListener('click',()=>this.closeModal()));
    (this.el.card.querySelector<HTMLElement>('textarea,button'))?.focus();
    this.hideTooltip();
  }
  private card(html:string){this.el.card.innerHTML=html;}
  private closeModal(){
    this.el.modal.hidden=true;this.el.card.innerHTML='';
    for(const child of this.root.children)(child as HTMLElement).inert=false;
    const back=this.modalReturn;this.modalReturn=null;
    if(back?.isConnected)back.focus({preventScroll:true});else this.el.cob.focus({preventScroll:true});
  }
  private confirm(title:string,body:string,action:string,run:()=>void){
    this.openModal(`<h2 id="cc-modal-title">${esc(title)}</h2><p>${esc(body)}</p><div class="cc-row"><button type="button" class="cc-btn cc-btn-quiet" data-act="close">Cancel</button><button type="button" class="cc-btn cc-btn-danger" data-act="confirm">${esc(action)}</button></div>`,card=>{
      card.querySelector('[data-act=confirm]')!.addEventListener('click',()=>{this.closeModal();run();});
    });
  }
  private showOffline(seconds:number,earned:Big,capped:boolean){
    const off=this.game.offlineAllowance(),style=this.style();
    this.play('harvest');this.game.checkAchievements();
    this.openModal(`<h2 id="cc-modal-title">Welcome back!</h2><p class="cc-big"><b>+${format(earned,style)}</b></p><p class="cc-muted">Away ${longDuration(seconds)} · ${Math.round(off.rate*100)}% rate, up to ${longDuration(off.seconds)}${capped?' (limit reached)':''}</p>
      <div class="cc-row"><button type="button" class="cc-btn" data-act="close">Collect</button></div>`);
    this.announce(`Welcome back. Your farm harvested ${format(earned,style)} kernels while you were away.`);
  }
}

// Exported for tests and documentation.
export {BACKUP_EVERY_MS};
