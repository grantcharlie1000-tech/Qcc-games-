// HUD model: pure functions (no DOM) that turn game state into what the HUD draws, with the numbers of the
// vanilla Java Edition 1.20/1.21 in-game GUI. Coordinates are GUI pixels relative to the bottom centre of the
// screen (the vanilla hotbar is 182 px wide, centred; hearts start at its left edge, shanks at its right edge).
import {CS} from '../engine/constants';
import {itemDef,type ItemStack} from '../data/items';
import {biomeDef} from '../data/biomes';
import {blockDef} from '../data/blocks';
import type {Game} from '../engine/contracts';

export type Fill='full'|'half'|null;
export type HeartType='normal'|'poison';

// ---- Hearts ---------------------------------------------------------------------------------------
export interface HeartInput{
  /** Current health and its maximum, half-hearts. */
  health:number;maxHealth:number;absorption:number;
  /** The health shown one second ago (Gui.displayHealth): the white "lost" layer while blinking. */
  lagHealth:number;
  /** In the white blink phase after a health change. */
  blinking:boolean;
  /** Heart index lifted by the regeneration wave, or -1. */
  regenIndex:number;
  poisoned:boolean;
  /** Per-tick random for the low-health shake; null disables shaking (reduced motion). */
  random:(()=>number)|null;
}
export interface HeartIcon{
  /** Main fill layer, golden absorption layer and white lost-health layer. */
  fill:Fill;absorb:Fill;lost:Fill;
  /** The container uses its white blinking outline. */
  blinkContainer:boolean;
  type:HeartType;
  row:number;col:number;
  /** x from the hotbar's left edge; `up` = pixels above the first row's position. */
  x:number;up:number;
}
export interface HeartLayout{icons:HeartIcon[];rows:number;rowHeight:number}

const halfOrFull=(index2:number,value:number):Fill=>index2<value?(index2+1===value?'half':'full'):null;

/** Gui.renderHearts: one container per heart (max health and absorption), rows of ten that compress when many. */
export function heartIcons(o:HeartInput):HeartLayout{
  const current=Math.ceil(o.health),shown=Math.ceil(o.lagHealth);
  const max=Math.max(o.maxHealth,Math.max(shown,current)),absorption=Math.ceil(Math.max(0,o.absorption));
  const rows=Math.ceil((max+absorption)/2/10);
  const rowHeight=Math.min(10,Math.max(10-(rows-2),3));
  const hearts=Math.ceil(max/2),golden=Math.ceil(absorption/2),healthCells=hearts*2;
  const shake=current+absorption<=4&&o.random!==null;
  const type:HeartType=o.poisoned?'poison':'normal';
  const icons:HeartIcon[]=[];
  for(let i=0;i<hearts+golden;i++){
    const row=Math.floor(i/10),col=i%10;
    let up=row*rowHeight;
    if(shake)up-=Math.floor(o.random!()*2);
    if(i<hearts&&i===o.regenIndex)up+=2;
    const cell=i*2;
    let absorb:Fill=null;
    if(i>=hearts){const k=cell-healthCells;if(k<absorption)absorb=k+1===absorption?'half':'full';}
    icons.push({fill:halfOrFull(cell,current),absorb,lost:o.blinking?halfOrFull(cell,shown):null,blinkContainer:o.blinking,type,row,col,x:col*8,up});
  }
  return{icons,rows,rowHeight};
}
/** Index of the heart lifted by the regeneration wave this tick (tickCount % ceil(maxHealth + 5)). */
export const regenIndex=(tick:number,maxHealth:number)=>tick%Math.ceil(maxHealth+5);

/** Gui's health bookkeeping: blinks 20 ticks after damage (10 after healing while still invulnerable) and keeps the
 *  previous value for one second (the white "lost" layer). Ticks replace vanilla's milliseconds (20 ticks = 1 s). */
export class HealthTracker{
  renderHealth=20;lagHealth=20;blinkUntil=0;private lastChange=-1000;
  reset(health:number){const h=Math.ceil(health);this.renderHealth=h;this.lagHealth=h;this.blinkUntil=0;this.lastChange=-1000;}
  update(health:number,tick:number,invulnerable:boolean){
    const h=Math.ceil(health);
    if(h<this.renderHealth&&invulnerable){this.lastChange=tick;this.blinkUntil=tick+20;}
    else if(h>this.renderHealth&&invulnerable){this.lastChange=tick;this.blinkUntil=tick+10;}
    if(tick-this.lastChange>20||tick<this.lastChange){this.lagHealth=h;this.lastChange=tick;}
    this.renderHealth=h;
  }
  blinking(tick:number){return this.blinkUntil>tick&&Math.floor((this.blinkUntil-tick)/3)%2===1;}
  /** Still inside the blink window (reduced motion shows the lost layer steadily instead of blinking). */
  recent(tick:number){return this.blinkUntil>tick;}
}

// ---- Hunger, armour, air, experience ----------------------------------------------------------------
export interface FoodIcon{fill:Fill;hunger:boolean;x:number;up:number}
/** Gui.renderFood: ten shanks drawn from the right edge leftwards; they jitter when saturation is 0. */
export function foodIcons(food:number,saturation:number,hungerEffect:boolean,tick:number,random:(()=>number)|null):FoodIcon[]{
  const out:FoodIcon[]=[],jitter=saturation<=0&&random!==null&&tick%(food*3+1)===0;
  for(let k=0;k<10;k++){
    const up=jitter?-(Math.floor(random!()*3)-1):0;
    out.push({fill:k*2+1<food?'full':k*2+1===food?'half':null,hunger:hungerEffect,x:173-k*8,up:up||0});
  }
  return out;
}
/** Armour row above the hearts: shown only with armour points. */
export function armorIcons(points:number):('full'|'half'|'empty')[]{
  if(points<=0)return[];
  return Array.from({length:10},(_,j)=>j*2+1<points?'full':j*2+1===points?'half':'empty');
}
/** Air bubbles above the shanks while the eyes are in water or the air is refilling; the last one pops. */
export function airBubbles(air:number,maxAir:number,eyeInWater:boolean):{full:number;popping:number}|null{
  const a=Math.min(air,maxAir);
  if(!eyeInWater&&a>=maxAir)return null;
  const full=Math.max(0,Math.ceil((a-2)*10/maxAir));
  return{full,popping:Math.max(0,Math.ceil(a*10/maxAir)-full)};
}
/** Experience bar fill in pixels: (int)(progress * 183), at most the 182 px bar. */
export function xpFill(progress:number){return Number.isFinite(progress)?Math.min(182,Math.max(0,Math.floor(progress*183))):0;}

// ---- Hotbar decorations ------------------------------------------------------------------------------
/** Mth.hsvToRgb (channels truncated like the game). */
export function hsvToRgb(h:number,s:number,v:number):string{
  const i=Math.floor(h*6)%6,f=h*6-Math.floor(h*6),p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s);
  const [r,g,b]=i===0?[v,t,p]:i===1?[q,v,p]:i===2?[p,v,t]:i===3?[p,q,v]:i===4?[t,p,v]:[v,p,q];
  const hex=(c:number)=>Math.max(0,Math.min(255,Math.floor(c*255))).toString(16).padStart(2,'0');
  return`#${hex(r)}${hex(g)}${hex(b)}`;
}
/** Item durability bar: width 0..13 (round(13 - damage*13/max)) and colour hue from red to green. Null when undamaged. */
export function durabilityBar(stack:ItemStack|null):{step:number;color:string}|null{
  if(!stack||!stack.damage)return null;
  const max=itemDef(stack.id)?.durability;if(!max)return null;
  const left=Math.max(0,(max-stack.damage)/max);
  return{step:Math.max(0,Math.min(13,Math.round(13-stack.damage*13/max))),color:hsvToRgb(left/3,1,1)};
}
/** Crosshair attack indicator: a 16 px bar filling while the attack recharges, or the "full" mark when aiming at a
 *  living target with a weapon slower than 4 attacks per second (delay over 5 ticks). Null = nothing drawn. */
export function attackIndicator(charge:number,targetLiving:boolean,attackSpeed:number):{kind:'bar';width:number}|{kind:'full'}|null{
  if(targetLiving&&charge>=1&&20/attackSpeed>5)return{kind:'full'};
  if(charge<1)return{kind:'bar',width:Math.max(0,Math.floor(charge*17))};
  return null;
}
/** Gui.tick's toolHighlightTimer: 40 ticks after a different item is selected, counting down while it stays. */
export function heldNameFade(previous:ItemStack|null,current:ItemStack|null,timer:number):number{
  if(!current)return 0;
  if(previous&&previous.id===current.id)return Math.max(0,timer-1);
  return 40;
}
/** Text alpha of the held item name: full until the last 10 ticks, then fading. */
export function heldNameOpacity(timer:number){return Math.min(255,Math.floor(timer*256/10))/255;}
export type Rarity='common'|'uncommon'|'rare'|'epic';
export const RARITY_COLOURS:Record<Rarity,string>={common:'#ffffff',uncommon:'#ffff55',rare:'#55ffff',epic:'#ff55ff'};
const RARITY:Record<string,Rarity>={golden_apple:'rare'};
export function heldName(stack:ItemStack):{text:string;rarity:Rarity}{
  return{text:itemDef(stack.id)?.displayName??stack.id,rarity:RARITY[stack.id]??'common'};
}

// ---- Compass and clock ---------------------------------------------------------------------------------
const wrapAngle=(a:number)=>{a%=Math.PI*2;if(a>Math.PI)a-=Math.PI*2;else if(a<=-Math.PI)a+=Math.PI*2;return a;};
/** Compass needle angle (radians clockwise from straight up) toward the spawn point, relative to the view. */
export function compassAngle(px:number,pz:number,yaw:number,sx:number,sz:number){
  return wrapAngle(Math.atan2(sx-px,-(sz-pz))+yaw);
}
/** Clock dial: radians clockwise of the sun from the top (0 at noon, π at midnight). Linear like the sky. */
export function sunAngle(dayTime:number){return wrapAngle((dayTime-6000)/24000*Math.PI*2);}
/** 24-hour wall clock time (dayTime 0 = 06:00). */
export function clockText(dayTime:number){
  const t=((Math.floor(dayTime)%24000)+24000)%24000,h=(Math.floor(t/1000)+6)%24,m=Math.floor(t%1000*60/1000);
  return`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

// ---- Layout -------------------------------------------------------------------------------------------
/** GUI pixels from the screen bottom to the top of the action-bar line (hotbar 22, bars, held name, action bar). */
export const HUD_STACK=75;
/** Left of the offhand slot and right of the hotbar, GUI pixels from the screen centre. */
const GROUP_LEFT=120,GROUP_RIGHT=91,MARGIN=8;
/** The shell's small buttons occupy the bottom-right corner (about 150×40 px). */
const SHELL_W=150,SHELL_H=40;
export interface HudLayout{
  /** CSS px per GUI pixel. */
  scale:number;
  /** GUI pixels the whole group moves right of centre so the offhand slot fits narrow screens. */
  shift:number;
  /** CSS px between the screen bottom and the hotbar (clear of the shell buttons). */
  bottom:number;
  /** CSS px from the screen bottom to the top of the hotbar, bars and action bar. */
  top:number;
  /** CSS px from the screen bottom to the top of the bars (armour and air rows). */
  bars:number;
}
function place(w:number,scale:number):{shift:number;bottom:number}{
  const shift=Math.max(0,Math.ceil((MARGIN-(w/2-GROUP_LEFT*scale))/scale*1000)/1000);
  const right=w/2+(GROUP_RIGHT+shift)*scale;
  return{shift,bottom:right>w-SHELL_W?SHELL_H:0};
}
/** Desktop: the vanilla automatic GUI scale (largest integer keeping 320×240 GUI pixels). Touch: large enough for
 *  fingers (slots ≥ 26 px) while the HUD stays under 42 % of the height. Both fit the width with the offhand slot. */
export function hudLayout(w:number,h:number,touch:boolean):HudLayout{
  const fit=Math.floor(Math.max(.5,(w-MARGIN*2)/(GROUP_LEFT+GROUP_RIGHT))*100)/100;
  let scale:number;
  if(touch){
    scale=Math.min(fit,2.5);
    let p=place(w,scale);
    const tall=(h*.42-p.bottom)/HUD_STACK;
    if(tall<scale){scale=Math.max(Math.min(1.3,fit),Math.floor(tall*100)/100);p=place(w,scale);}
  }else{
    scale=1;while(320*(scale+1)<=w&&240*(scale+1)<=h)scale++;
    scale=Math.min(scale,fit);
  }
  const {shift,bottom}=place(w,scale);
  return{scale,shift,bottom,top:bottom+HUD_STACK*scale,bars:bottom+50*scale};
}

// ---- Debug overlay (F3) ----------------------------------------------------------------------------------
const FACINGS=[['north','Towards negative Z'],['west','Towards negative X'],['south','Towards positive Z'],['east','Towards positive X']] as const;
/** Facing as the F3 screen shows it: direction name and vanilla yaw/pitch degrees (yaw 180 = north, pitch down-positive). */
export function facingInfo(yaw:number,pitch:number){
  const deg=yaw*180/Math.PI,sector=((Math.round(deg/90)%4)+4)%4;
  let vYaw=(180-deg)%360;if(vYaw>180)vYaw-=360;else if(vYaw<=-180)vYaw+=360;
  const [name,towards]=FACINGS[sector];
  return{name,towards,yaw:Math.round(vYaw*10)/10,pitch:Math.round(-pitch*1800/Math.PI)/10};
}
export interface MobCounts{passive:number;hostile:number;water:number}
/** Left column of the F3 screen. */
export function debugLines(game:Game,fps:number,mobs:MobCounts):string[]{
  const p=game.player.state,r=game.render.info(),t=game.time;
  const bx=Math.floor(p.x),by=Math.floor(p.y),bz=Math.floor(p.z),cx=Math.floor(bx/CS),cz=Math.floor(bz/CS);
  const f=facingInfo(p.yaw,p.pitch),light=game.world.lightAt(bx,by,bz),sky=light>>4,block=light&15;
  return[
    `Blockcraft (${game.settings.mode}, ${game.settings.difficulty})`,
    `${Math.round(fps)} fps, scale ${game.render.resolutionScale.toFixed(2)}`,
    `Draw calls: ${r.drawCalls}, triangles: ${r.triangles}`,
    `C: ${r.chunks} drawn, ${game.world.chunks.size} loaded`,
    `Entities: ${game.entities.all().length}`,
    `Mobs: ${mobs.passive} passive, ${mobs.hostile} hostile, ${mobs.water} water`,
    '',
    `XYZ: ${p.x.toFixed(3)} / ${p.y.toFixed(3)} / ${p.z.toFixed(3)}`,
    `Block: ${bx} ${by} ${bz}`,
    `Chunk: ${cx} ${cz}, in chunk ${bx-cx*CS} ${by} ${bz-cz*CS}`,
    `Facing: ${f.name} (${f.towards}) (${f.yaw.toFixed(1)} / ${f.pitch.toFixed(1)})`,
    `Light: ${game.world.brightnessAt(bx,by,bz)} (${sky} sky, ${block} block)`,
    `Biome: ${biomeDef(game.world.biomeAt(bx,bz)).displayName}`,
    `Day ${t.day}, time ${t.dayTime} (${clockText(t.dayTime)})`,
    `Weather: ${game.weather.state} (rain ${game.weather.intensity.toFixed(2)}, thunder ${game.weather.thunder.toFixed(2)})`
  ];
}
/** Right column of the F3 screen: display, target and held item. */
export function debugRightLines(game:Game,width:number,height:number,guiScale:number):string[]{
  const lines=[`Display: ${Math.round(width)}x${Math.round(height)}, GUI scale ${guiScale.toFixed(2)}`,
    `Render distance setting: ${game.settings.view}, FOV ${game.settings.fov}`];
  const t=game.interaction.target;
  if(t){
    const def=blockDef(t.id);
    lines.push('',`Targeted Block: ${t.x}, ${t.y}, ${t.z}`,def.displayName);
  }
  const e=game.interaction.entityTarget;
  if(e)lines.push('','Targeted Entity',`${e.kind} (${Math.ceil(e.health)}/${e.maxHealth})`);
  const held=game.inventory.held();
  if(held)lines.push('',`Held: ${held.id}${held.count>1?` x${held.count}`:''}`);
  return lines;
}

/** Per-tick deterministic random (the GUI reseeds with tickCount * 312871 every frame, so jitter changes per tick). */
export function tickRandom(tick:number):()=>number{
  let s=(Math.imul(tick|0,312871)^0x9e3779b9)>>>0;
  return()=>{s=(s+0x6d2b79f5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
}
