// HUD and menus: the vanilla Java 1.20/1.21 in-game GUI drawn as DOM layers over the canvas.
//  - World overlays (z-index 5): the inverting crosshair with the attack-charge indicator, the damage flash and the
//    low-health vignette.
//  - HUD (z-index 10), laid out in GUI pixels at the vanilla positions around the bottom centre and scaled by the
//    GUI scale (hud-model's hudLayout): hearts (absorption, blinking, low-health shake, regeneration wave, poison),
//    hunger shanks (jitter at zero saturation, hunger effect), armour, air bubbles, the experience bar and level,
//    the hotbar with item icons, counts and durability bars, the selection frame, the offhand slot, the held item
//    name in the pixel font, compass and clock readouts (large dials beside the hotbar while held, and animated
//    compass and clock icons in the slots like the vanilla item textures), and the F3 debug overlay. F1
//    (ROOT_FLAGS.hudHidden) hides it all.
//  - Menus (z-index 30, ui/menus.ts): start, game menu, death and lost-graphics screens.
// The layout publishes CSS variables on game.root: --bc-gui (GUI scale), --bc-hud-bottom (hotbar lift, clear of the
// shell's corner buttons), --bc-hud-bars (top of the bars), --bc-hud-top (top of the whole stack) and
// --bc-hud-actionbar (the ui's action-bar toast, placed by hud.css). Each is in CSS px above the safe-area inset.
import './hud.css';
import {iconUrl} from '../art/items';
import {itemDef} from '../data/items';
import {ROOT_FLAGS} from '../engine/constants';
import type {Game,HudService,ItemStack} from '../engine/contracts';
import {attackIndicator,barsView,clockText,compassAngle,debugLines,debugRightLines,durabilityBar,heldName,HealthTracker,HeldNameTimer,hudLayout,
  RARITY_COLOURS,stackHeights,stackInsets,sunAngle,type BarIcon,type HudLayout} from './hud-model';
import {clockUrl,compassUrl,CLOCK_FRAMES,COMPASS_FRAMES,dialFrame,digitsUrl,hasGlyphs,hotbarUrl,hudIconUrl,offhandUrl,selectionUrl,textUrl,
  textWidth,xpBarUrl} from './hud-art';
import {createMenus} from './menus';

/** Readout dial size in GUI pixels (the 16 px dial art at 1.5×). */
const DIAL=24;
const SHOWN_STATES=new Set(['playing','screen','paused','dead']);
const ROOT_VARS=['--bc-gui','--bc-hud-bottom','--bc-hud-bars','--bc-hud-top','--bc-hud-actionbar'];
/** Vanilla ItemStack.popTime after a pickup: 5 ticks. */
const POP_MS=250;

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
function setHidden(el:HTMLElement,hidden:boolean){if(el.hidden!==hidden)el.hidden=hidden;}

/** One item stack drawn like a vanilla slot: 16×16 icon, durability bar and count. */
class StackView{
  readonly el=document.createElement('span');
  readonly img=document.createElement('img');private dur=document.createElement('i');private bar=document.createElement('b');private count=document.createElement('i');
  id='';n=-1;private damage=-1;private src='';
  constructor(){
    this.el.className='bc-stack';this.img.alt='';this.img.draggable=false;this.dur.className='bc-dur';this.count.className='bc-count';
    this.dur.append(this.bar);this.el.append(this.img,this.dur,this.count);this.dur.hidden=true;this.img.hidden=true;this.count.hidden=true;
  }
  /** `icon` replaces the item's own icon (the animated compass and clock dials). Returns true when the stack changed. */
  update(stack:ItemStack|null,icon?:string):boolean{
    const id=stack?.id??'',n=stack?.count??0,damage=stack?.damage??0,src=id?icon??iconUrl(id):'';
    if(src!==this.src){this.src=src;this.img.hidden=!src;if(src)this.img.src=src;else this.img.removeAttribute('src');}
    if(id===this.id&&n===this.n&&damage===this.damage)return false;
    if(n!==this.n){
      const text=n>1?String(n):'';this.count.hidden=!text;
      if(text){const c=this.count.style;c.backgroundImage=url(digitsUrl(text,'count'));c.left=`${17-6*text.length}px`;c.width=`${6*text.length}px`;}
    }
    const bar=durabilityBar(stack);this.dur.hidden=!bar;
    if(bar){this.bar.style.width=`${bar.step}px`;this.bar.style.background=bar.color;}
    this.id=id;this.n=n;this.damage=damage;return true;
  }
  /** Forget what is drawn so the next update redraws (new world). */
  invalidate(){this.id='\u0000';this.n=-1;this.damage=-1;this.src='\u0000';}
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
    <p class="bc-held-name" role="status"><span class="bc-held-label"></span><i class="bc-held-text" aria-hidden="true"></i></p>
    <div class="bc-readouts" hidden><i class="bc-dial" data-dial="compass" role="img" hidden></i><i class="bc-dial" data-dial="clock" role="img" hidden></i></div>
  </div>`;
  const debug=make('bc-debug');debug.setAttribute('aria-hidden','true');
  debug.innerHTML='<div class="bc-debug-col"></div><div class="bc-debug-col"></div>';
  game.root.append(fx,crosshair,hud,debug);
  const q=<T extends HTMLElement>(root:HTMLElement,s:string)=>root.querySelector<T>(s)!;
  const gui=q(hud,'.bc-gui'),bars=q(hud,'.bc-bars'),heartsEl=q(hud,'.bc-hearts'),armorEl=q(hud,'.bc-armor'),foodEl=q(hud,'.bc-food'),airEl=q(hud,'.bc-air');
  const xpEl=q(hud,'.bc-xp'),xpFillEl=q(hud,'.bc-xp-fill'),levelEl=q(hud,'.bc-level'),hotbarBg=q(hud,'.bc-hotbar-bg'),hotbar=q(hud,'.bc-hotbar');
  const selection=q(hud,'.bc-selection'),offhandEl=q(hud,'.bc-offhand'),heldEl=q(hud,'.bc-held-name'),readouts=q(hud,'.bc-readouts');
  const heldLabel=q(heldEl,'.bc-held-label'),heldText=q(heldEl,'.bc-held-text');
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
  /** Icon elements of one bar, created as needed (hearts grow with max health and absorption). */
  function iconPool(parent:HTMLElement){
    const els:HTMLElement[]=[];
    return(icons:readonly BarIcon[],patterns:boolean)=>{
      while(els.length<icons.length){const e=make('bc-icon','i');parent.append(e);els.push(e);}
      els.forEach((e,i)=>{const icon=icons[i];setHidden(e,!icon);if(icon){layers(e,icon.layers,patterns);box(e,icon.x,icon.bottom);}});
    };
  }
  const drawHearts=iconPool(heartsEl),drawArmor=iconPool(armorEl),drawFood=iconPool(foodEl),drawAir=iconPool(airEl);

  // ---- State --------------------------------------------------------------------------------------------
  const tracker=new HealthTracker();
  let layout:HudLayout=hudLayout(1280,720,false),layoutDirty=true,touch=false,colorBlind=false,reduced=false;
  const heldTimer=new HeldNameTimer();
  let lastTick=-1,lastHurtTick=-1000,heldId='\u0000',heldOpacity=-1,selected=-1,barsLabel='',level=-1;
  let fpsFrames=0,fpsStart=0,fps=0,debugAt=0,barsTop=49,stackKey='',state='',crossKey='',compassFrame=-1,clockFrame=-1,readoutMode:'right'|'slots'='slots';
  let readoutKey='',lowHealth=false,pickedUp:string|null=null;
  const cur=new Float64Array(18),prev=new Float64Array(18).fill(NaN);
  let resize:ResizeObserver|null=null;

  function applyLayout(){
    layoutDirty=false;
    const w=game.root.clientWidth||window.innerWidth,h=game.root.clientHeight||window.innerHeight;
    layout=hudLayout(w,h,touch);
    const st=game.root.style,s=layout.scale;
    st.setProperty('--bc-gui',String(s));st.setProperty('--bc-hud-bottom',`${layout.bottom}px`);
    gui.style.transform=`translateX(${(layout.shift*s).toFixed(2)}px) scale(${s})`;
    // Large readout dials sit right of the hotbar when there is room (clear of the shell's corner buttons). Narrow
    // screens have no free space beside or above the bars (touch controls, action bar), so there the animated slot
    // icons are the readouts and the dials stay only for assistive technology.
    const right=w/2+(91+layout.shift+4+DIAL*2+2)*s;
    readoutMode=right<=w-8&&(right<=w-150||layout.bottom>=40)?'right':'slots';
    readouts.dataset.place=readoutMode;
    stackKey='';placeStack();
  }
  function setVisibility(){
    const s=game.state;if(s===state)return;state=s;
    const shown=SHOWN_STATES.has(s);
    hud.dataset.shown=String(shown);fx.dataset.shown=String(shown);crosshair.dataset.shown=String(s==='playing');
  }
  function resetHealth(){tracker.reset(game.survival.health);lastHurtTick=-1000;prev.fill(NaN);}

  // ---- Bars -----------------------------------------------------------------------------------------------
  function renderBars(tick:number){
    const blinking=reduced?tracker.recent(tick):tracker.blinking(tick);
    const view=barsView(game,{tick,lagHealth:tracker.lagHealth,blinking,reduced});
    drawHearts(view.hearts,colorBlind);drawArmor(view.armor,false);drawFood(view.food,colorBlind);drawAir(view.air,false);
    if(view.top!==barsTop){barsTop=view.top;placeStack();}
    xpFillEl.style.width=`${view.xp}px`;
    if(view.level!==level){
      level=view.level;setHidden(levelEl,level<=0);
      if(level>0){const t=String(level);levelEl.style.backgroundImage=url(digitsUrl(t,'level'));levelEl.dataset.level=t;box(levelEl,-3*t.length-1,27,6*t.length+1,9);}
    }
    if(view.label!==barsLabel){barsLabel=view.label;bars.setAttribute('aria-label',view.label);}
  }
  /** Redraws the bars only when an input changed (or every tick while something animates). */
  function updateBars(tick:number){
    const s=game.survival,p=game.player.state;
    const shake=Math.ceil(s.health)+Math.ceil(s.absorption)<=4,regen=s.hasEffect('regeneration'),jitter=s.saturation<=0,blink=tracker.recent(tick);
    const animated=blink||!reduced&&(shake||regen||jitter);
    cur[0]=s.health;cur[1]=s.maxHealth;cur[2]=s.absorption;cur[3]=s.food;cur[4]=s.saturation>0?1:0;cur[5]=s.air;cur[6]=p.headInWater?1:0;
    cur[7]=s.armorPoints();cur[8]=s.xpLevel;cur[9]=s.xpProgress;cur[10]=s.hasEffect('poison')?1:0;cur[11]=regen?1:0;cur[12]=s.hasEffect('hunger')?1:0;
    cur[13]=colorBlind?1:0;cur[14]=reduced?1:0;cur[15]=animated?tick:-1;cur[16]=tracker.lagHealth;cur[17]=s.maxAir;
    let changed=false;for(let i=0;i<cur.length;i++)if(cur[i]!==prev[i]){changed=true;prev[i]=cur[i];}
    if(changed)renderBars(tick);
  }

  // ---- Hotbar, held name, crosshair, readouts --------------------------------------------------------------
  function stackLabel(stack:ItemStack){
    const def=itemDef(stack.id),name=def?.displayName??stack.id,max=def?.durability;
    return`${name}${stack.count>1?` ×${stack.count}`:''}${stack.damage&&max?`, durability ${max-stack.damage} of ${max}`:''}`;
  }
  const slotLabel=(stack:ItemStack|null,i:number)=>`${stack?stackLabel(stack):'Empty'}, slot ${i+1}`;
  /** The vanilla pickup "pop": the icon starts squashed (half width, 1.5× height) and springs back over 5 ticks. */
  function pop(view:StackView){
    if(reduced||typeof view.img.animate!=='function')return;
    view.img.animate([{transform:'scale(.5,1.5)'},{transform:'scale(1,1)'}],{duration:POP_MS,easing:'linear'});
  }
  /** Compass and clock icons in slots animate like the vanilla item textures (needle toward spawn, time dial). */
  const dialIcon=(id:string|undefined)=>id==='compass'&&compassFrame>=0?compassUrl(compassFrame):id==='clock'&&clockFrame>=0?clockUrl(clockFrame):undefined;
  function updateHotbar(){
    const inv=game.inventory;
    for(let i=0;i<9;i++){
      const st=inv.slots[i]??null,view=slotViews[i],before=view.id===st?.id?view.n:0;
      if(!view.update(st,dialIcon(st?.id)))continue;
      slots[i].setAttribute('aria-label',slotLabel(st,i));
      if(pickedUp&&st&&st.id===pickedUp&&st.count>before)pop(view);
    }
    pickedUp=null;
    if(inv.selected!==selected){
      if(selected>=0)slots[selected]?.setAttribute('aria-pressed','false');
      selected=inv.selected;slots[selected]?.setAttribute('aria-pressed','true');box(selection,-92+selected*20,-1,24,24);
    }
    const off=inv.offhand;setHidden(offhandEl,!off);
    if(offhandView.update(off,dialIcon(off?.id)))offhandEl.setAttribute('aria-label',off?`Offhand: ${stackLabel(off)}`:'Offhand: empty');
  }
  function tickHeldName(tick:number){
    const held=game.inventory.held();
    heldTimer.update(held,tick);
    const id=held?.id??'';
    if(id===heldId)return;
    heldId=id;
    const n=held?heldName(held):null,pixel=!!n&&hasGlyphs(n.text);
    heldLabel.textContent=n?.text??'';
    heldLabel.className=pixel?'bc-held-label bc-sr':'bc-held-label';
    heldLabel.style.color=n?RARITY_COLOURS[n.rarity]:'';
    setHidden(heldText,!pixel);
    if(n&&pixel){const s=heldText.style;s.backgroundImage=url(textUrl(n.text,RARITY_COLOURS[n.rarity]));s.width=`${textWidth(n.text)}px`;}
  }
  /** Held item name, action bar and readouts above the bars at the vanilla heights; publishes the bars top, the
   *  action bar and the stack top for other layers (they follow armour and extra heart rows, and creative). */
  function placeStack(){
    const creative=game.settings.mode==='creative',{name}=stackHeights(barsTop,creative);
    const key=`${barsTop}:${creative}:${readoutMode}:${layout.scale}:${layout.bottom}`;if(key===stackKey)return;stackKey=key;
    heldEl.style.bottom=`${name}px`;
    const inset=stackInsets(layout,barsTop,creative),st=game.root.style;
    st.setProperty('--bc-hud-bars',`${inset.bars.toFixed(1)}px`);st.setProperty('--bc-hud-actionbar',`${inset.actionbar.toFixed(1)}px`);
    st.setProperty('--bc-hud-top',`${inset.top.toFixed(1)}px`);
    box(readouts,readoutMode==='right'?95:0,0);
  }
  function updateHeldName(){
    const o=heldId?heldTimer.opacity:0;
    if(o===heldOpacity)return;heldOpacity=o;
    heldEl.style.opacity=o.toFixed(3);setHidden(heldEl,o<=0);
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
  /** Dial frames for every compass and clock on the hotbar or offhand, and the readouts of the held ones. */
  function updateReadouts(now:number){
    const inv=game.inventory,main=inv.held()?.id,off=inv.offhand?.id;
    const hasCompass=main==='compass'||off==='compass',hasClock=main==='clock'||off==='clock',key=`${+hasCompass}${+hasClock}`;
    if(key!==readoutKey){readoutKey=key;setHidden(readouts,!hasCompass&&!hasClock);setHidden(compassEl,!hasCompass);setHidden(clockEl,!hasClock);}
    let anyCompass=hasCompass,anyClock=hasClock;
    for(let i=0;i<9;i++){const id=inv.slots[i]?.id;if(id==='compass')anyCompass=true;else if(id==='clock')anyClock=true;}
    if(anyCompass){
      const p=game.player.state,sp=p.spawn,near=Math.hypot(sp.x-p.x,sp.z-p.z)<.5;
      // At the spawn point itself the needle spins, like a compass with nowhere to point (still with reduced motion).
      const angle=near?(reduced?0:now/400):compassAngle(p.x,p.z,p.yaw,sp.x,sp.z),frame=dialFrame(angle,COMPASS_FRAMES);
      if(frame!==compassFrame){
        compassFrame=frame;compassEl.style.backgroundImage=url(compassUrl(frame));
        const deg=Math.round(angle*180/Math.PI);
        compassEl.setAttribute('aria-label',near?'Compass: you are at the world spawn':`Compass: spawn is ${deg===0?'straight ahead':`${Math.abs(deg)} degrees to the ${deg>0?'right':'left'}`}`);
      }
    }
    if(anyClock){
      const frame=dialFrame(sunAngle(game.time.dayTime),CLOCK_FRAMES);
      if(frame!==clockFrame){clockFrame=frame;clockEl.style.backgroundImage=url(clockUrl(frame));clockEl.setAttribute('aria-label',`Clock: ${clockText(game.time.dayTime)}`);}
    }
  }
  function updateEffects(){
    const s=game.survival,low=game.settings.mode==='survival'&&!s.dead&&s.health>0&&Math.ceil(s.health)+Math.ceil(s.absorption)<=4;
    if(low!==lowHealth){lowHealth=low;vignette.dataset.on=String(low);}
  }
  /** A short red flash at the screen edges when hurt (the renderer's 'hurt' tint covers the centre). Reduced motion:
   *  dimmer and shorter, without the pulse of the low-health vignette. */
  function damageFlash(){
    if(game.settings.mode!=='survival'||typeof flash.animate!=='function')return;
    flash.getAnimations?.().forEach(a=>a.cancel());
    flash.animate([{opacity:reduced?.3:.5},{opacity:0}],{duration:reduced?250:450,easing:'ease-out'});
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
    lines.forEach((l,i)=>{const span=col.children[i] as HTMLElement;if(span.textContent!==l)span.textContent=l;setHidden(span,!l);});
  }

  // ---- Input on the HUD --------------------------------------------------------------------------------
  hotbar.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest<HTMLButtonElement>('.bc-slot');if(b)game.inventory.select(Number(b.dataset.slot));},{signal});
  // Taps on the hotbar must not reach the canvas's touch look / mining.
  hotbar.addEventListener('pointerdown',e=>e.stopPropagation(),{signal});

  const service:HudService={
    showMenu(kind){menus.show(kind);},
    init(){
      touch=game.input.touch;
      // Relayout at once: frames stop while the game is paused, but the HUD still shows behind the pause menu.
      if(typeof ResizeObserver==='function'){resize=new ResizeObserver(()=>applyLayout());resize.observe(game.root);}
      else window.addEventListener('resize',()=>applyLayout(),{signal});
      offs.push(
        game.events.on('stateChanged',()=>{setVisibility();menus.refresh();}),
        game.events.on('settingsChanged',()=>{menus.refresh();hud.dataset.mode=game.settings.mode;crossKey='-';placeStack();}),
        game.events.on('modeChanged',({mode})=>{hud.dataset.mode=mode;placeStack();}),
        game.events.on('playerDamaged',({amount})=>{if(amount>0){lastHurtTick=game.time.tick;damageFlash();}}),
        game.events.on('playerDied',({message})=>menus.setDeathMessage(message)),
        game.events.on('itemPickedUp',({stack})=>{pickedUp=stack.id;}),
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
        tickHeldName(tick);
      }
      if(game.settings.mode==='survival')updateBars(tick);
      updateReadouts(now);updateHotbar();updateHeldName();updateCrosshair();updateEffects();
    },
    reset(){
      heldTimer.reset();heldId='\u0000';heldOpacity=-1;selected=-1;crossKey='-';compassFrame=clockFrame=-1;lastTick=-1;level=-1;readoutKey='';pickedUp=null;
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
