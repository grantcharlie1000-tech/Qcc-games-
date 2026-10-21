// HUD and menus: the vanilla Java 1.20/1.21 in-game GUI drawn as DOM layers over the canvas.
//  - World overlays (z-index 5): the inverting crosshair with the attack-charge indicator, the damage flash and the
//    low-health vignette.
//  - HUD (z-index 10), laid out in GUI pixels at the vanilla positions around the bottom centre and scaled by the
//    GUI scale (hud-model's hudLayout): hearts (absorption, blinking, low-health shake, regeneration wave, poison),
//    hunger shanks (jitter at zero saturation, hunger effect), armour, air bubbles, the experience bar and level,
//    the hotbar with item icons, counts and durability bars, the selection frame, the offhand slot, the held item
//    name, compass and clock readouts, and the F3 debug overlay. F1 (ROOT_FLAGS.hudHidden) hides it all.
//  - Menus (z-index 30, ui/menus.ts): start, game menu, death and lost-graphics screens.
// The layout publishes CSS variables on game.root (--bc-gui, --bc-hud-bottom, --bc-hud-bars, --bc-hud-top) that
// place the ui's action-bar toast and can keep the touch controls above the bars.
import './hud.css';
import {iconUrl} from '../art/items';
import {itemDef} from '../data/items';
import {ROOT_FLAGS} from '../engine/constants';
import type {Game,HudService,ItemStack} from '../engine/contracts';
import {airBubbles,armorIcons,attackIndicator,compassAngle,debugLines,debugRightLines,durabilityBar,foodIcons,heartIcons,heldName,heldNameFade,
  heldNameOpacity,HealthTracker,hudLayout,regenIndex,RARITY_COLOURS,sunAngle,tickRandom,xpFill,clockText,type HudLayout} from './hud-model';
import {clockUrl,compassUrl,CLOCK_FRAMES,COMPASS_FRAMES,dialFrame,digitsUrl,hotbarUrl,hudIconUrl,offhandUrl,selectionUrl,xpBarUrl} from './hud-art';
import {createMenus} from './menus';

/** Readout dial size in GUI pixels (the 16 px dial art at 1.5×). */
const DIAL=24;
const SHOWN_STATES=new Set(['playing','screen','paused','dead']);
const ROOT_VARS=['--bc-gui','--bc-hud-bottom','--bc-hud-bars','--bc-hud-top','--bc-hud-actionbar'];

function box(el:HTMLElement,left:number,bottom:number,width?:number,height?:number){
  const s=el.style;s.left=`${left}px`;s.bottom=`${bottom}px`;if(width!==undefined)s.width=`${width}px`;if(height!==undefined)s.height=`${height}px`;
}
const url=(u:string)=>`url("${u}")`;
/** Sets an element's icon layers (top first, hud-art icon names) only when they change; `data-icon` names them. */
function layers(el:HTMLElement,names:readonly string[],patterns:boolean){
  const key=names.join(' ')+(patterns?' +patterns':'');
  if(el.dataset.icon===key)return;
  el.dataset.icon=key;el.style.backgroundImage=names.map(n=>url(hudIconUrl(n,patterns))).join(',');
}

/** One item stack drawn like a vanilla slot: 16×16 icon, durability bar and count. */
class StackView{
  readonly el=document.createElement('span');
  private img=document.createElement('img');private dur=document.createElement('i');private bar=document.createElement('b');private count=document.createElement('i');
  private id='';private n=-1;private damage=-1;
  constructor(){
    this.el.className='bc-stack';this.img.alt='';this.img.draggable=false;this.dur.className='bc-dur';this.count.className='bc-count';
    this.dur.append(this.bar);this.el.append(this.img,this.dur,this.count);this.dur.hidden=true;this.img.hidden=true;
  }
  /** Returns true when something changed. */
  update(stack:ItemStack|null):boolean{
    const id=stack?.id??'',n=stack?.count??0,damage=stack?.damage??0;
    if(id===this.id&&n===this.n&&damage===this.damage)return false;
    if(id!==this.id){this.img.hidden=!id;if(id)this.img.src=iconUrl(id);else this.img.removeAttribute('src');}
    if(n!==this.n){
      const text=n>1?String(n):'';this.count.hidden=!text;
      if(text){const c=this.count.style;c.backgroundImage=url(digitsUrl(text,'count'));c.left=`${17-6*text.length}px`;c.width=`${6*text.length}px`;}
    }
    const bar=durabilityBar(stack);this.dur.hidden=!bar;
    if(bar){this.bar.style.width=`${bar.step}px`;this.bar.style.background=bar.color;}
    this.id=id;this.n=n;this.damage=damage;return true;
  }
  /** Forget what is drawn so the next update redraws (new world). */
  invalidate(){this.id='\u0000';this.n=-1;this.damage=-1;}
}

export function createHud(game:Game):HudService{
  const abort=new AbortController(),signal=abort.signal,offs:(()=>void)[]=[];
  const make=(cls:string,tag='div')=>{const e=document.createElement(tag);e.className=cls;return e;};

  // ---- DOM ------------------------------------------------------------------------------------------
  const crosshair=make('bc-crosshair');crosshair.setAttribute('aria-hidden','true');
  crosshair.innerHTML='<i class="bc-cross"></i><i class="bc-attack-bar" hidden><b></b></i><i class="bc-attack-full" hidden></i>';
  const fx=make('bc-hud-fx');fx.setAttribute('aria-hidden','true');fx.innerHTML='<div class="bc-vignette"></div><div class="bc-flash"></div>';
  const hud=make('bc-hud');
  hud.innerHTML=`<div class="bc-gui">
    <div class="bc-bars" role="img"><div class="bc-hearts"></div><div class="bc-armor"></div><div class="bc-food"></div><div class="bc-air"></div>
      <i class="bc-xp"><b class="bc-xp-fill"></b></i><i class="bc-level"></i></div>
    <i class="bc-hotbar-bg" aria-hidden="true"></i>
    <div class="bc-hotbar" role="toolbar" aria-label="Hotbar"></div>
    <i class="bc-selection" aria-hidden="true"></i>
    <div class="bc-offhand" role="img" hidden></div>
    <p class="bc-held-name" role="status"></p>
    <div class="bc-readouts" hidden><i class="bc-dial" data-dial="compass" role="img" hidden></i><i class="bc-dial" data-dial="clock" role="img" hidden></i></div>
  </div>`;
  const debug=make('bc-debug');debug.setAttribute('aria-hidden','true');
  debug.innerHTML='<div class="bc-debug-col"></div><div class="bc-debug-col"></div>';
  game.root.append(fx,crosshair,hud,debug);
  const q=<T extends HTMLElement>(root:HTMLElement,s:string)=>root.querySelector<T>(s)!;
  const gui=q(hud,'.bc-gui'),bars=q(hud,'.bc-bars'),heartsEl=q(hud,'.bc-hearts'),armorEl=q(hud,'.bc-armor'),foodEl=q(hud,'.bc-food'),airEl=q(hud,'.bc-air');
  const xpEl=q(hud,'.bc-xp'),xpFillEl=q(hud,'.bc-xp-fill'),levelEl=q(hud,'.bc-level'),hotbarBg=q(hud,'.bc-hotbar-bg'),hotbar=q(hud,'.bc-hotbar');
  const selection=q(hud,'.bc-selection'),offhandEl=q(hud,'.bc-offhand'),heldEl=q(hud,'.bc-held-name'),readouts=q(hud,'.bc-readouts');
  const compassEl=q(hud,'[data-dial=compass]'),clockEl=q(hud,'[data-dial=clock]');
  const vignette=q(fx,'.bc-vignette'),flash=q(fx,'.bc-flash');
  const attackBar=q(crosshair,'.bc-attack-bar'),attackBarFill=q(crosshair,'.bc-attack-bar b'),attackFull=q(crosshair,'.bc-attack-full');
  const [debugLeft,debugRight]=[...debug.querySelectorAll<HTMLElement>('.bc-debug-col')];
  const menus=createMenus(game);

  // Static art and positions (GUI pixels from the bottom centre).
  hotbarBg.style.backgroundImage=url(hotbarUrl());box(hotbarBg,-91,0,182,22);
  selection.style.backgroundImage=url(selectionUrl());
  offhandEl.style.backgroundImage=url(offhandUrl());box(offhandEl,-120,0,22,22);
  xpEl.style.backgroundImage=url(xpBarUrl(false));box(xpEl,-91,24,182,5);xpFillEl.style.backgroundImage=url(xpBarUrl(true));
  q(crosshair,'.bc-cross').style.backgroundImage=url(hudIconUrl('crosshair',false));
  attackBar.style.backgroundImage=url(hudIconUrl('attack_background',false));attackBarFill.style.backgroundImage=url(hudIconUrl('attack_progress',false));
  attackFull.style.backgroundImage=url(hudIconUrl('attack_full',false));
  const slots:HTMLButtonElement[]=[],slotViews:StackView[]=[];
  for(let i=0;i<9;i++){
    const b=document.createElement('button');b.type='button';b.className='bc-slot';b.dataset.slot=String(i);b.setAttribute('aria-pressed','false');
    const v=new StackView();b.append(v.el);box(b,-90+i*20,1,20,20);hotbar.append(b);slots.push(b);slotViews.push(v);
  }
  const offhandView=new StackView();offhandEl.append(offhandView.el);
  const armorIconsEls=Array.from({length:10},(_,j)=>{const e=make('bc-icon','i');armorEl.append(e);return e;});
  const foodEls=Array.from({length:10},()=>{const e=make('bc-icon','i');foodEl.append(e);return e;});
  const airEls=Array.from({length:10},(_,j)=>{const e=make('bc-icon','i');box(e,82-8*j,40);airEl.append(e);return e;});
  const heartEls:HTMLElement[]=[];

  // ---- State --------------------------------------------------------------------------------------------
  const tracker=new HealthTracker();
  let layout:HudLayout=hudLayout(1280,720,false),layoutDirty=true,touch=false,colorBlind=false,reduced=false;
  let lastTick=-1,lastHurtTick=-1000,heldTimer=0,prevHeld:ItemStack|null=null,heldId='\u0000',selected=-1,barsLabel='';
  let fpsFrames=0,fpsStart=0,fps=0,debugAt=0,barsTop=49,stackKey='',state='',crossKey='',compassFrame=-1,clockFrame=-1,readoutMode:'right'|'above'='above';
  const cur=new Float64Array(20),prev=new Float64Array(20).fill(NaN);
  let resize:ResizeObserver|null=null;

  function applyLayout(){
    layoutDirty=false;
    const w=game.root.clientWidth||window.innerWidth,h=game.root.clientHeight||window.innerHeight;
    layout=hudLayout(w,h,touch);
    const st=game.root.style,s=layout.scale;
    st.setProperty('--bc-gui',String(s));st.setProperty('--bc-hud-bottom',`${layout.bottom}px`);
    st.setProperty('--bc-hud-bars',`${layout.bars}px`);st.setProperty('--bc-hud-top',`${layout.top}px`);
    gui.style.transform=`translateX(${(layout.shift*s).toFixed(2)}px) scale(${s})`;
    // Readouts sit right of the hotbar when there is room (clear of the shell's corner buttons), else above the bars.
    const right=w/2+(91+layout.shift+4+DIAL*2+2)*s;
    readoutMode=right<=w-8&&(right<=w-150||layout.bottom>=40)?'right':'above';
    readouts.dataset.place=readoutMode;
    stackKey='';placeStack();
  }
  function setVisibility(){
    const s=game.state;if(s===state)return;state=s;
    const shown=SHOWN_STATES.has(s);
    hud.dataset.shown=String(shown);fx.dataset.shown=String(shown);crosshair.dataset.shown=String(s==='playing');
  }
  function resetHealth(){tracker.reset(game.survival.health);lastHurtTick=-1000;prev.fill(NaN);}
  const iconName=(base:string,fill:'full'|'half')=>`${base}_${fill}`;

  // ---- Bars -----------------------------------------------------------------------------------------------
  function renderBars(tick:number){
    const s=game.survival,p=game.player.state;
    const random=reduced?null:tickRandom(tick);
    const max=Math.max(s.maxHealth,tracker.lagHealth,Math.ceil(s.health));
    const regen=!reduced&&s.hasEffect('regeneration')?regenIndex(tick,max):-1;
    const blinking=reduced?tracker.recent(tick):tracker.blinking(tick);
    const poisoned=s.hasEffect('poison');
    const hearts=heartIcons({health:s.health,maxHealth:s.maxHealth,absorption:s.absorption,lagHealth:tracker.lagHealth,blinking,regenIndex:regen,poisoned,random});
    while(heartEls.length<hearts.icons.length){const e=make('bc-icon','i');heartsEl.append(e);heartEls.push(e);}
    heartEls.forEach((e,i)=>{
      const h=hearts.icons[i];e.hidden=!h;if(!h)return;
      const kind=h.type==='poison'?'heart_poison':'heart',list:string[]=[];
      if(h.fill)list.push(iconName(kind,h.fill));
      if(h.lost)list.push(`${iconName(kind,h.lost)}_blink`);
      if(h.absorb)list.push(iconName('heart_absorb',h.absorb));
      list.push(h.blinkContainer?'heart_container_blink':'heart_container');
      layers(e,list,colorBlind);box(e,-91+h.x,30+h.up);
    });
    const armour=armorIcons(s.armorPoints()),armorBottom=40+(hearts.rows-1)*hearts.rowHeight;
    barsTop=Math.max(49,armour.length?armorBottom+9:30+(hearts.rows-1)*hearts.rowHeight+9);placeStack();
    armorIconsEls.forEach((e,j)=>{
      const a=armour[j];e.hidden=!a;if(!a)return;
      layers(e,a==='empty'?['armor_empty']:[`armor_${a}`,'armor_empty'],false);
      box(e,-91+j*8,armorBottom);
    });
    const hunger=s.hasEffect('hunger');
    foodIcons(s.food,s.saturation,hunger,tick,random).forEach((f,k)=>{
      const e=foodEls[k],container=hunger?'food_hunger_container':'food_container';
      layers(e,f.fill?[`food_${hunger?'hunger_':''}${f.fill}`,container]:[container],colorBlind);
      box(e,-91+f.x,30+f.up);
    });
    const air=airBubbles(s.air,s.maxAir,p.headInWater);
    airEls.forEach((e,j)=>{
      const kind=!air?null:j<air.full?'air':j<air.full+air.popping?'air_bursting':null;
      e.hidden=!kind;if(kind)layers(e,[kind],false);
    });
    const fill=xpFill(s.xpProgress);xpFillEl.style.width=`${fill}px`;
    levelEl.hidden=s.xpLevel<=0;
    if(s.xpLevel>0){const t=String(s.xpLevel);levelEl.style.backgroundImage=url(digitsUrl(t,'level'));levelEl.dataset.level=t;box(levelEl,-3*t.length-1,27,6*t.length+1,9);}
    const label=`Health ${Math.ceil(s.health)/2} of ${s.maxHealth/2} hearts${s.absorption>0?`, ${Math.ceil(s.absorption)/2} absorption`:''}, food ${s.food/2} of 10`
      +`${armour.length?`, armour ${s.armorPoints()}`:''}${air?`, air ${air.full} of 10`:''}, experience level ${s.xpLevel}`;
    if(label!==barsLabel){barsLabel=label;bars.setAttribute('aria-label',label);}
  }
  function updateBars(tick:number){
    const s=game.survival,p=game.player.state;
    const shake=Math.ceil(s.health)+Math.ceil(s.absorption)<=4,regen=s.hasEffect('regeneration'),jitter=s.saturation<=0,blink=tracker.recent(tick);
    const animated=blink||!reduced&&(shake||regen||jitter);
    cur[0]=s.health;cur[1]=s.maxHealth;cur[2]=s.absorption;cur[3]=s.food;cur[4]=s.saturation>0?1:0;cur[5]=s.air;cur[6]=p.headInWater?1:0;
    cur[7]=s.armorPoints();cur[8]=s.xpLevel;cur[9]=xpFill(s.xpProgress);cur[10]=s.hasEffect('poison')?1:0;cur[11]=regen?1:0;cur[12]=s.hasEffect('hunger')?1:0;
    cur[13]=colorBlind?1:0;cur[14]=reduced?1:0;cur[15]=animated?tick:-1;cur[16]=tracker.lagHealth;cur[17]=s.maxAir;
    let changed=false;for(let i=0;i<18;i++)if(cur[i]!==prev[i]){changed=true;prev[i]=cur[i];}
    if(changed)renderBars(tick);
  }

  // ---- Hotbar, held name, crosshair, readouts --------------------------------------------------------------
  function stackLabel(stack:ItemStack){
    const def=itemDef(stack.id),name=def?.displayName??stack.id,max=def?.durability;
    return`${name}${stack.count>1?` ×${stack.count}`:''}${stack.damage&&max?`, durability ${max-stack.damage} of ${max}`:''}`;
  }
  const slotLabel=(stack:ItemStack|null,i:number)=>`${stack?stackLabel(stack):'Empty'}, slot ${i+1}`;
  function updateHotbar(){
    const inv=game.inventory;
    for(let i=0;i<9;i++){const st=inv.slots[i]??null;if(slotViews[i].update(st))slots[i].setAttribute('aria-label',slotLabel(st,i));}
    if(inv.selected!==selected){
      if(selected>=0)slots[selected]?.setAttribute('aria-pressed','false');
      selected=inv.selected;slots[selected]?.setAttribute('aria-pressed','true');box(selection,-92+selected*20,-1,24,24);
    }
    const off=inv.offhand;offhandEl.hidden=!off;
    if(offhandView.update(off))offhandEl.setAttribute('aria-label',off?`Offhand: ${stackLabel(off)}`:'Offhand: empty');
  }
  function tickHeldName(){
    const held=game.inventory.held();
    heldTimer=heldNameFade(prevHeld,held,heldTimer);prevHeld=held;
    const id=held?.id??'';
    if(id!==heldId){
      heldId=id;
      if(held){const n=heldName(held);heldEl.textContent=n.text;heldEl.style.color=RARITY_COLOURS[n.rarity];}else heldEl.textContent='';
    }
  }
  /** Held item name, action bar and readouts above the bars: the vanilla heights (59 and 68 px from the bottom),
   *  lifted when extra heart rows push the armour row up so they never overlap it. */
  function placeStack(){
    const creative=game.settings.mode==='creative',name=creative?36:Math.max(50,barsTop+1),action=Math.max(64,name+14);
    const key=`${name}:${action}:${readoutMode}:${layout.scale}:${layout.bottom}`;if(key===stackKey)return;stackKey=key;
    heldEl.style.bottom=`${name}px`;
    game.root.style.setProperty('--bc-hud-actionbar',`${(layout.bottom+action*layout.scale).toFixed(1)}px`);
    if(readoutMode==='right')box(readouts,95,0);else box(readouts,0,action+14);
  }
  function updateHeldName(){
    const o=heldId?heldNameOpacity(heldTimer):0;
    heldEl.style.opacity=o.toFixed(3);heldEl.hidden=o<=0;
  }
  function updateCrosshair(){
    const it=game.interaction,target=it.entityTarget,held=game.inventory.held();
    const living=!!target&&!target.removed&&target.health>0&&target.deathTime===0;
    const speed=held?itemDef(held.id)?.tool?.attackSpeed??4:4;
    const ind=attackIndicator(it.attackCharge,living,speed);
    const key=!ind?'':ind.kind==='full'?'f':`b${ind.width}`;
    if(key===crossKey)return;crossKey=key;
    attackFull.hidden=ind?.kind!=='full';attackBar.hidden=ind?.kind!=='bar';
    if(ind?.kind==='bar')attackBarFill.style.width=`${ind.width}px`;
  }
  function updateReadouts(){
    const inv=game.inventory,main=inv.held()?.id,off=inv.offhand?.id;
    const hasCompass=main==='compass'||off==='compass',hasClock=main==='clock'||off==='clock';
    readouts.hidden=!hasCompass&&!hasClock;compassEl.hidden=!hasCompass;clockEl.hidden=!hasClock;
    if(hasCompass){
      const p=game.player.state,sp=p.spawn,near=Math.hypot(sp.x-p.x,sp.z-p.z)<.5;
      // At the spawn point itself the needle spins, like a compass with nowhere to point.
      const angle=near?performance.now()/400:compassAngle(p.x,p.z,p.yaw,sp.x,sp.z),frame=dialFrame(angle,COMPASS_FRAMES);
      if(frame!==compassFrame){compassFrame=frame;compassEl.style.backgroundImage=url(compassUrl(frame));
        compassEl.setAttribute('aria-label',near?'Compass: you are at the world spawn':`Compass: spawn is ${Math.round(angle*180/Math.PI)} degrees ${angle>=0?'right':'left'} of where you look`);}
    }
    if(hasClock){
      const frame=dialFrame(sunAngle(game.time.dayTime),CLOCK_FRAMES);
      if(frame!==clockFrame){clockFrame=frame;clockEl.style.backgroundImage=url(clockUrl(frame));clockEl.setAttribute('aria-label',`Clock: ${clockText(game.time.dayTime)}`);}
    }
  }
  function updateEffects(){
    const s=game.survival,low=game.settings.mode==='survival'&&!s.dead&&Math.ceil(s.health)+Math.ceil(s.absorption)<=4&&s.health>0;
    const v=String(low);if(vignette.dataset.on!==v)vignette.dataset.on=v;
  }
  function damageFlash(){
    if(game.settings.mode!=='survival'||typeof flash.animate!=='function')return;
    flash.getAnimations?.().forEach(a=>a.cancel());
    flash.animate([{opacity:reduced?.3:.55},{opacity:0}],{duration:reduced?300:450,easing:'ease-out'});
  }
  function updateDebug(now:number){
    if(game.root.dataset[ROOT_FLAGS.debug]!=='true'||now-debugAt<100)return;debugAt=now;
    const e=game.entities,lines=debugLines(game,fps,{passive:e.count('passive'),hostile:e.count('hostile'),water:e.count('water')});
    const right=debugRightLines(game,game.root.clientWidth,game.root.clientHeight,layout.scale);
    fillColumn(debugLeft,lines);fillColumn(debugRight,right);
  }
  function fillColumn(col:HTMLElement,lines:string[]){
    while(col.childElementCount<lines.length)col.append(document.createElement('span'));
    while(col.childElementCount>lines.length)col.lastElementChild!.remove();
    lines.forEach((l,i)=>{const span=col.children[i] as HTMLElement;if(span.textContent!==l)span.textContent=l;span.hidden=!l;});
  }

  // ---- Input on the HUD --------------------------------------------------------------------------------
  hotbar.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest<HTMLButtonElement>('.bc-slot');if(b)game.inventory.select(Number(b.dataset.slot));},{signal});
  hotbar.addEventListener('pointerdown',e=>e.stopPropagation(),{signal});

  const service:HudService={
    showMenu(kind){menus.show(kind);},
    init(){
      touch=game.input.touch;
      if(typeof ResizeObserver==='function'){resize=new ResizeObserver(()=>{layoutDirty=true;});resize.observe(game.root);}
      else window.addEventListener('resize',()=>{layoutDirty=true;},{signal});
      offs.push(
        game.events.on('stateChanged',()=>{setVisibility();menus.refresh();}),
        game.events.on('settingsChanged',()=>{menus.refresh();hud.dataset.mode=game.settings.mode;crossKey='-';}),
        game.events.on('modeChanged',({mode})=>{hud.dataset.mode=mode;placeStack();}),
        game.events.on('playerDamaged',({amount})=>{if(amount>0){lastHurtTick=game.time.tick;damageFlash();}}),
        game.events.on('playerDied',({message})=>menus.setDeathMessage(message)),
        game.events.on('playerRespawned',resetHealth),
        game.events.on('restored',resetHealth),
        game.events.on('worldReset',resetHealth)
      );
      hud.dataset.mode=game.settings.mode;setVisibility();resetHealth();applyLayout();
    },
    frame(){
      // Frame counter for F3: frames per real second (dt is capped, so it cannot measure slow frames).
      const now=performance.now();fpsFrames++;
      if(!fpsStart)fpsStart=now;else if(now-fpsStart>=1000||!fps&&now-fpsStart>=250){fps=fpsFrames*1000/(now-fpsStart);fpsFrames=0;fpsStart=now;}
      if(game.input.touch!==touch){touch=game.input.touch;layoutDirty=true;menus.refresh();}
      const cb=game.context.settings.colorBlind,rm=game.reducedMotion;
      if(cb!==colorBlind||rm!==reduced){colorBlind=cb;reduced=rm;fx.dataset.reduced=String(rm);}
      if(layoutDirty)applyLayout();
      setVisibility();
      updateDebug(now);
      if(hud.dataset.shown!=='true')return;
      const tick=game.time.tick;
      if(tick!==lastTick){
        lastTick=tick;
        const h=game.survival.health;
        tracker.update(h,tick,Math.ceil(h)<tracker.renderHealth||tick-lastHurtTick<10);
        tickHeldName();
      }
      if(game.settings.mode==='survival')updateBars(tick);
      updateHotbar();updateHeldName();updateCrosshair();updateReadouts();updateEffects();
    },
    reset(){
      prevHeld=null;heldTimer=0;heldId='\u0000';selected=-1;crossKey='-';compassFrame=clockFrame=-1;lastTick=-1;
      for(const v of [...slotViews,offhandView])v.invalidate();
      resetHealth();
    },
    dispose(){
      abort.abort();resize?.disconnect();for(const off of offs.splice(0))off();
      menus.dispose();fx.remove();crosshair.remove();hud.remove();debug.remove();
      for(const v of ROOT_VARS)game.root.style.removeProperty(v);
    }
  };
  return service;
}
