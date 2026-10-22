// Blockcraft's online messages. The host is authoritative: guests send requests (block edits, drops, hits, spawns, container
// slot changes) and their own position; the host answers with the world snapshot, numbered block updates, compact entity and
// player states, time and weather, and personal effects (damage, items, experience). Everything a peer receives is checked
// here before use.
import {BLOCK_COUNT} from '../data/blocks';
import {parseStack,type ItemStack} from '../data/items';
import {CH} from '../engine/constants';
/** engine/game SNAPSHOT_VERSION (a unit test keeps them equal; importing it here would be circular). */
const SAVE_FORMAT=2;
import type {DamageKind,MirrorState} from '../engine/contracts';

/** Bump when terrain generation changes: guests regenerate the world from the seed and must get the same blocks. */
export const WORLD_GENERATION_VERSION=1;
/** Bump when these messages change. */
export const NET_VERSION=1;
/** Peers must agree on all three. */
export const BLOCKCRAFT_ONLINE_VERSION=`blockcraft-net${NET_VERSION}-gen${WORLD_GENERATION_VERSION}-save${SAVE_FORMAT}`;
export const MAX_PLAYERS=4;
/** Ids of guest avatars on a guest's own entity list (host entity ids stay far below). */
export const AVATAR_ID_BASE=2**30;

export const MAX_COORD=30_000_000;
const finite=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const int=(v:unknown,min:number,max:number):v is number=>Number.isInteger(v)&&(v as number)>=min&&(v as number)<=max;
export const isCoord=(v:unknown):v is number=>finite(v,-MAX_COORD,MAX_COORD);
export const isBlockPos=(x:unknown,y:unknown,z:unknown)=>int(x,-MAX_COORD,MAX_COORD)&&int(y,0,CH-1)&&int(z,-MAX_COORD,MAX_COORD);
export const isBlockId=(v:unknown):v is number=>int(v,0,BLOCK_COUNT-1);
export const stackOrNull=(v:unknown):ItemStack|null=>v===null||v===undefined?null:parseStack(v);

/** Flat edit lists: x, y, z, from, to per edit (requests) or x, y, z, id (updates). */
export function validFlat(list:unknown,stride:number,max:number):list is number[]{
  if(!Array.isArray(list)||list.length%stride||list.length>max*stride)return false;
  for(let i=0;i<list.length;i+=stride){
    if(!isBlockPos(list[i],list[i+1],list[i+2]))return false;
    for(let k=3;k<stride;k++)if(!isBlockId(list[i+k]))return false;
  }
  return true;
}

// ---- Entity states -------------------------------------------------------------------------------------------------
/** [id, x·100, y·100, z·100, yaw·1000, headYaw·1000, pitch·1000, health·10, hurtTime, deathTime, flags] */
export type PackedState=number[];
const FLAG_FIRE=1,FLAG_BABY=2,FLAG_GROUND=4;
export function packState(id:number,s:MirrorState):PackedState{
  return[id,Math.round(s.x*100),Math.round(s.y*100),Math.round(s.z*100),Math.round(s.yaw*1000),Math.round(s.headYaw*1000),Math.round(s.pitch*1000),
    Math.round(Math.max(0,s.health)*10),s.hurtTime|0,s.deathTime|0,(s.fire>0?FLAG_FIRE:0)|(s.baby?FLAG_BABY:0)|(s.onGround?FLAG_GROUND:0)];
}
export function unpackState(p:unknown):{id:number;state:MirrorState}|null{
  if(!Array.isArray(p)||p.length!==11||!p.every(n=>Number.isInteger(n)))return null;
  const [id,x,y,z,yaw,head,pitch,health,hurt,death,flags]=p as number[];
  if(!int(id,-(2**31),2**31)||!isCoord(x/100)||!finite(y/100,-200,CH+200)||!isCoord(z/100))return null;
  return{id,state:{x:x/100,y:y/100,z:z/100,yaw:yaw/1000,headYaw:head/1000,pitch:pitch/1000,health:Math.min(1e6,health/10),
    hurtTime:Math.min(20,Math.max(0,hurt)),deathTime:Math.min(40,Math.max(0,death)),fire:flags&FLAG_FIRE?20:0,baby:!!(flags&FLAG_BABY),onGround:!!(flags&FLAG_GROUND)}};
}

// ---- Players ----------------------------------------------------------------------------------------------------------
export interface PlayerState{id:string;name:string;seat:number;x:number;y:number;z:number;yaw:number;pitch:number;health:number;
  dead:boolean;sneaking:boolean;away:boolean;held:string|null}
export function parsePlayerState(v:unknown):PlayerState|null{
  if(!v||typeof v!=='object')return null;
  const p=v as Record<string,unknown>;
  if(typeof p.id!=='string'||p.id.length>80||typeof p.name!=='string'||p.name.length>16||!int(p.seat,0,15))return null;
  if(!isCoord(p.x)||!finite(p.y,-200,CH+400)||!isCoord(p.z)||!finite(p.yaw,-1e3,1e3)||!finite(p.pitch,-2,2)||!finite(p.health,0,1e4))return null;
  return{id:p.id,name:p.name,seat:p.seat as number,x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch,health:p.health,dead:p.dead===true,sneaking:p.sneaking===true,
    away:p.away===true,held:typeof p.held==='string'&&p.held.length<=64?p.held:null};
}
/** A guest's report about itself (sent about 20 times a second while it plays). */
export interface SelfReport{x:number;y:number;z:number;yaw:number;pitch:number;sneaking:boolean;health:number;dead:boolean;away:boolean;
  held:string|null;
  /** Inventory room: empty slots and the item ids with room in a partial stack (the host only attracts items that fit). */
  empty:number;partial:string[];
  /** Entity ids the guest saw updates for but has no data for (it asks for a full record). */
  need:number[]}
export function parseSelf(v:Record<string,unknown>):SelfReport|null{
  if(!isCoord(v.x)||!finite(v.y,-200,CH+400)||!isCoord(v.z)||!finite(v.yaw,-1e3,1e3)||!finite(v.pitch,-2,2)||!finite(v.health,0,1e4))return null;
  const partial=Array.isArray(v.partial)?v.partial.filter((s):s is string=>typeof s==='string'&&s.length<=64).slice(0,64):[];
  const need=Array.isArray(v.need)?v.need.filter(n=>Number.isInteger(n)).slice(0,64) as number[]:[];
  return{x:v.x,y:v.y,z:v.z,yaw:v.yaw,pitch:v.pitch,sneaking:v.sneaking===true,health:v.health,dead:v.dead===true,away:v.away===true,
    held:typeof v.held==='string'&&v.held.length<=64?v.held:null,empty:int(v.empty,0,64)?v.empty:0,partial,need};
}

export const DAMAGE_KINDS:readonly DamageKind[]=['player','mob','projectile','fall','lava','fire','explosion','drown','starve','void','cactus','suffocate','magic','lightning'];
export const SHARED_SETTINGS=['mode','difficulty','keepInventory','daylightCycle','mobSpawning','weatherCycle'] as const;

/** Container slots a guest may change: chest indexes 0..26, or furnace input, fuel, output and its stored experience. */
export type SlotName=number|'input'|'fuel'|'output'|'xp';
export function parseSlotName(v:unknown):SlotName|null{
  if(int(v,0,26))return v;
  return v==='input'||v==='fuel'||v==='output'||v==='xp'?v:null;
}
