// Host checks for a guest's block edits. A guest applies its own edit at once (so building feels immediate) and sends what
// changed; the host accepts the whole action only when every cell still holds what the guest saw (the first of two
// simultaneous edits wins), lies within reach, and the change is something a player could do with the item in hand.
// A refused action is answered with the host's blocks, which the guest puts back.
import {IS_LEAVES,IS_LOG} from '../world/growth';
import {AIR,SOLID,blockDef,type BlockId} from '../data/blocks';
import {itemDef,type ItemStack} from '../data/items';
import type {BlockSource,GameMode,PlayerView} from '../engine/contracts';

/** Eye-to-block-centre distance accepted (creative reach 5, plus movement during the network delay). */
export const EDIT_REACH=8;
/** Cells one action may change (a door or bed is 2, bone meal growing a tree up to about 60). */
export const MAX_ACTION_EDITS=96;
export type EditRefusal='paused'|'unloaded'|'conflict'|'reach'|'unbreakable'|'not-allowed'|'occupied'|'rate'|'too-many';
export const REFUSAL_TEXT:Record<EditRefusal,string>={
  paused:'The host has paused the game.',unloaded:'That part of the world is not loaded on the host.',
  conflict:'Someone else changed that block first.',reach:'That block is out of reach.',unbreakable:'That block cannot be broken.',
  'not-allowed':'That change is not possible with the item in your hand.',occupied:'A player is standing there.',
  rate:'Too many changes at once. Slow down a little.','too-many':'Too many changes in one action.'
};

/** Is `from` → `to` something a player holding `held` could cause? */
export function plausibleChange(from:BlockId,to:BlockId,held:ItemStack|null,mode:GameMode):EditRefusal|null{
  if(from===to)return null;
  const f=blockDef(from),t=blockDef(to);
  if(mode==='creative')return null;
  if(f.hardness<0&&!f.liquid&&!f.replaceable)return 'unbreakable';
  if(to===AIR)return null;// mining, scooping, the other half of a door or bed
  if(f.family===t.family)return null;// doors, trapdoors, crops, furnace states, facings
  const def=held?itemDef(held.id):undefined;
  if(t.liquid)return def?.use==='water_bucket'||def?.use==='lava_bucket'||f.family==='ice'?null:'not-allowed';
  if(def?.places===t.family)return f.replaceable||from===AIR||f.liquid?null:'not-allowed';
  // Bone meal and seeds grow plants, trees and moss; nothing else.
  if(def?.use==='bone_meal'||def?.use==='seeds')return IS_LOG[to]||IS_LEAVES[to]||t.sound==='plant'||t.family.includes('moss')||t.family==='farmland'?null:'not-allowed';
  if(def?.use==='flint_and_steel')return t.family==='fire'?null:'not-allowed';
  // Tools change a block into its tilled, path, stripped or scraped form only.
  const kind=def?.tool?.kind;
  if(kind==='hoe')return t.family==='farmland'||t.family==='dirt'?null:'not-allowed';
  if(kind==='shovel')return t.family.includes('path')?null:'not-allowed';
  if(kind==='axe')return t.family.startsWith('stripped_')||t.family.includes('copper')?null:'not-allowed';
  // Placing a block can replace what grows or lies in the cell next to it (snow layers, short grass).
  if(f.replaceable&&from!==AIR&&to===AIR)return null;
  return 'not-allowed';
}

export interface EditContext{world:BlockSource;player:PlayerView;held:ItemStack|null;mode:GameMode;players:readonly PlayerView[]}
/** Checks a flat [x, y, z, from, to, ...] list; null when every edit may be applied. */
export function checkEdits(list:readonly number[],c:EditContext):EditRefusal|null{
  if(list.length/5>MAX_ACTION_EDITS)return 'too-many';
  // Each cell once, and a real change: a repeated cell would let one block be mined over and over.
  const cells=new Set<string>();
  for(let i=0;i<list.length;i+=5){
    const key=`${list[i]},${list[i+1]},${list[i+2]}`;
    if(cells.has(key)||list[i+3]===list[i+4])return 'not-allowed';
    cells.add(key);
  }
  const ex=c.player.x,ey=c.player.y+c.player.eyeHeight,ez=c.player.z;
  for(let i=0;i<list.length;i+=5){
    const x=list[i],y=list[i+1],z=list[i+2],from=list[i+3],to=list[i+4];
    const now=c.world.get(x,y,z);
    if(now<0)return 'unloaded';
    if(now!==from)return 'conflict';
    if(Math.hypot(x+.5-ex,y+.5-ey,z+.5-ez)>EDIT_REACH+(list.length>10?6:0))return 'reach';
    const verdict=plausibleChange(from,to,c.held,c.mode);if(verdict)return verdict;
    if(SOLID[to]&&!SOLID[from]&&c.players.some(p=>p!==c.player&&!p.dead&&overlaps(p,x,y,z)))return 'occupied';
  }
  return null;
}
const overlaps=(p:PlayerView,x:number,y:number,z:number)=>{
  const hw=p.width/2-.001;
  return p.x+hw>x&&p.x-hw<x+1&&p.z+hw>z&&p.z-hw<z+1&&p.y+p.height-.001>y&&p.y<y+1;
};

/** A token bucket per guest: `rate` edits a second, bursts up to `burst`. */
export class RateLimit{
  private tokens:number;private last:number;
  constructor(private rate:number,private burst:number,now:number){this.tokens=burst;this.last=now;}
  take(n:number,now:number):boolean{
    this.tokens=Math.min(this.burst,this.tokens+(now-this.last)/1000*this.rate);this.last=now;
    if(this.tokens<n)return false;
    this.tokens-=n;return true;
  }
}
