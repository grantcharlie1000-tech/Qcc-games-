// Dropped items ('item') and experience orbs ('xp_orb'), after Java 1.20 ItemEntity and ExperienceOrb.
//  - Items: data {stack, pickup}; pick-up delay counts down (32767 = never), equal stacks within 0.5 blocks merge every
//    2 ticks while moving (40 at rest) when the total fits one stack (the bigger stack absorbs the smaller, keeping the
//    longer delay and the younger age); a gentle magnet pulls ready items within 2.5 blocks of the player's body toward
//    it; the player picks them up when its box grown by (1, 0.5, 1) touches them (inventory.add, `itemPickedUp`, `pop`).
//    They despawn at age 6000 (5 minutes); lava, fire and cacti destroy them.
//  - Orbs: data {points, count}; vanilla values (2477, 1237, ... 3, 1) split a reward; the player attracts them within 8
//    blocks; one orb of a merged group is collected every 2 ticks (survival.addXp, which plays `orb`); same-value orbs
//    merge every 20 ticks; despawn at age 6000.
import {maxStack,parseStack,sameItem,stack as makeStack,type ItemStack} from '../data/items';
import type {Entity,EntityKind,EntityService,Game} from '../engine/contracts';

export const ITEM_DESPAWN_AGE=6000;
export const DEFAULT_PICKUP_DELAY=10;
/** Pick-up delay that never runs out (vanilla infinite pickup delay). */
export const NO_PICKUP=32767;
/** Magnet reach from the player's body centre, blocks, and its pull per tick (blocks/second added). */
export const MAGNET_RADIUS=2.5,MAGNET_PULL=1.2;
/** Vanilla orb sizes, largest first. */
export const XP_VALUES=[2477,1237,617,307,149,73,37,17,7,3,1] as const;
/** Largest orb value not above `points` (ExperienceOrb.getExperienceValue). */
export function xpOrbValue(points:number):number{for(const v of XP_VALUES)if(points>=v)return v;return 1;}
/** Splits a reward into vanilla orb values. */
export function splitXp(points:number):number[]{
  const out:number[]=[];let left=Math.floor(points);
  while(left>0&&out.length<512){const v=xpOrbValue(left);out.push(v);left-=v;}
  return out;
}
/** Orb icon 0..10 for a value (vanilla ExperienceOrb.getIcon). */
export function xpIcon(points:number):number{
  const t=[2477,1237,617,307,149,73,37,17,7,3];
  for(let i=0;i<t.length;i++)if(points>=t[i])return 10-i;
  return 0;
}

export interface ItemData{stack:ItemStack;pickup:number}
export interface OrbData{points:number;count:number}
const intIn=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;

/** Does the player's box grown by (1, 0.5, 1) touch the entity box? */
export function touchesPlayer(game:Game,e:Entity):boolean{
  const p=game.player.state,pw=game.player.width/2+1+e.width/2;
  return Math.abs(p.x-e.x)<pw&&Math.abs(p.z-e.z)<pw&&e.y<p.y+game.player.height+.5&&e.y+e.height>p.y-.5;
}

export function createItemKinds(game:Game,service:()=>EntityService):{item:EntityKind;xp:EntityKind}{
  const scratch:Entity[]=[];
  let lastOrbPickup=-1e9;
  const playerReady=()=>!game.survival.dead&&game.state!=='dead';
  function mergeable(e:Entity){
    const d=e.data as unknown as ItemData;
    return !e.removed&&d.pickup!==NO_PICKUP&&e.age<ITEM_DESPAWN_AGE&&d.stack.count<maxStack(d.stack.id);
  }
  function mergeItems(e:Entity){
    if(!mergeable(e))return;
    const list=service().near(e.x,e.y+e.height/2,e.z,1,o=>o!==e&&o.kind==='item',scratch);
    for(let i=0;i<list.length;i++){
      const o=list[i];
      if(Math.abs(o.x-e.x)>.5+e.width||Math.abs(o.z-e.z)>.5+e.width||Math.abs(o.y-e.y)>e.height||!mergeable(o))continue;
      const a=e.data as unknown as ItemData,b=o.data as unknown as ItemData;
      if(!sameItem(a.stack,b.stack)||a.stack.count+b.stack.count>maxStack(a.stack.id))continue;
      // The bigger stack absorbs the smaller one (ItemEntity.tryToMerge).
      const [target,source,ts,ss]=a.stack.count<b.stack.count?[o,e,b,a]:[e,o,a,b];
      ts.stack.count+=ss.stack.count;ts.pickup=Math.max(ts.pickup,ss.pickup);target.age=Math.min(target.age,source.age);
      service().remove(source);
      if(source===e)return;
    }
  }
  function pickUp(e:Entity,d:ItemData){
    const s=d.stack,left=game.inventory.add({...s}),taken=s.count-Math.max(0,left);
    if(taken<=0)return;
    game.events.emit('itemPickedUp',{stack:makeStack(s.id,taken,s.damage)});
    game.sounds.play('pop',{x:e.x,y:e.y,z:e.z},{volume:.2,pitch:((game.random()-game.random())*.7+1)*2});
    if(left<=0)service().remove(e);else s.count=left;
  }
  const item:EntityKind={
    kind:'item',category:'item',width:.25,height:.25,maxHealth:5,render:'item',pickable:false,
    physics:{gravity:16,drag:.98,stepHeight:0},
    item:e=>(e.data as unknown as ItemData).stack??null,
    init(e){
      const d=e.data,s=parseStack(d.stack);
      if(!s){e.removed=true;return;}
      d.stack=s;d.pickup=intIn(d.pickup,0,NO_PICKUP)?d.pickup:DEFAULT_PICKUP_DELAY;
    },
    tick(e){
      const d=e.data as unknown as ItemData;
      if(d.pickup>0&&d.pickup!==NO_PICKUP)d.pickup--;
      if(e.age>=ITEM_DESPAWN_AGE){service().remove(e);return;}
      const moving=Math.abs(e.vx)+Math.abs(e.vy)+Math.abs(e.vz)>.02;
      if(e.age%(moving?2:40)===0)mergeItems(e);
      if(e.removed||d.pickup!==0||!playerReady())return;
      if(touchesPlayer(game,e)){pickUp(e,d);return;}
      const p=game.player.state,dx=p.x-e.x,dy=p.y+game.player.height/2-(e.y+e.height/2),dz=p.z-e.z,dist=Math.hypot(dx,dy,dz);
      if(dist<MAGNET_RADIUS&&dist>1e-3){
        const k=MAGNET_PULL*(1-dist/MAGNET_RADIUS*.5)/dist;
        e.vx+=dx*k;e.vz+=dz*k;e.vy+=dy*k+(e.onGround?.8:0);
      }
    },
    restoreData(data){
      const s=parseStack(data.stack);if(!s)return null;
      return{stack:s,pickup:intIn(data.pickup,0,NO_PICKUP)?data.pickup:0};
    }
  };
  const xp:EntityKind={
    kind:'xp_orb',category:'xp',width:.5,height:.5,maxHealth:5,render:'item',pickable:false,
    physics:{gravity:12,drag:.98,stepHeight:0},
    init(e){
      const d=e.data;
      if(!intIn(d.points,1,32767)){e.removed=true;return;}
      d.count=intIn(d.count,1,1024)?d.count:1;
    },
    tick(e){
      const d=e.data as unknown as OrbData;
      if(e.age>=ITEM_DESPAWN_AGE){service().remove(e);return;}
      // Same-value orbs close together merge into one (ExperienceOrb.scanForEntities, every 20 ticks).
      if(e.age%20===1){
        const list=service().near(e.x,e.y+e.height/2,e.z,.75,o=>o!==e&&o.kind==='xp_orb'&&(o.data as unknown as OrbData).points===d.points,scratch);
        for(let i=0;i<list.length;i++){
          const o=list[i],od=o.data as unknown as OrbData;
          if(Math.abs(o.x-e.x)>.5+e.width||Math.abs(o.z-e.z)>.5+e.width||Math.abs(o.y-e.y)>e.height)continue;
          d.count=Math.min(1024,d.count+od.count);e.age=Math.min(e.age,o.age);service().remove(o);
        }
      }
      if(lastOrbPickup>game.time.tick)lastOrbPickup=-1e9;// the clock restarted (new world)
      if(!playerReady()||!touchesPlayer(game,e)||game.time.tick-lastOrbPickup<2)return;
      lastOrbPickup=game.time.tick;
      game.survival.addXp(d.points);
      if(--d.count<=0)service().remove(e);
    },
    restoreData(data){
      if(!intIn(data.points,1,32767))return null;
      return{points:data.points,count:intIn(data.count,1,1024)?data.count:1};
    }
  };
  return{item,xp};
}
