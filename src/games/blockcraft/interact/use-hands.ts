// Hands and results shared by placement, item use and the interaction service. Vanilla tries the main hand, then
// the offhand, for every right click: a hand that passes lets the other hand act.
import {itemDef,maxStack,stack,type ItemStack} from '../data/items';
import type {Game,RayHit} from '../engine/contracts';

/** A block hit with the exact point the ray met the block's outline (world space). */
export interface Hit extends RayHit{px:number;py:number;pz:number}
/** Vanilla InteractionResult: success swings the arm, consume acts without a swing, pass lets the next step or hand try,
 *  fail stops the whole click. */
export type Result='success'|'consume'|'pass'|'fail';
export const acted=(r:Result)=>r==='success'||r==='consume';

export interface Hand{
  readonly offhand:boolean;
  get():ItemStack|null;
  /** Uses up `n` items (nothing in creative); container remainders (bucket, bowl) replace the stack or go to the inventory. */
  consume(n?:number):void;
  /** Wears the item by `n` (nothing in creative); it breaks with the tool_break sound when worn out. */
  damage(n?:number):void;
  set(s:ItemStack|null):void;
}
export function mainHand(game:Game):Hand{
  const inv=game.inventory;
  return{offhand:false,get:()=>inv.held(),consume:n=>inv.consumeHeld(n??1),damage:n=>inv.damageHeld(n??1),set:s=>inv.setSlot(inv.selected,s)};
}
export function offHand(game:Game):Hand{
  const inv=game.inventory,creative=()=>game.settings.mode==='creative';
  return{offhand:true,get:()=>inv.offhand,set:s=>inv.setOffhand(s),
    consume(n=1){
      const s=inv.offhand;if(!s||creative())return;
      const rest=itemDef(s.id)?.remainder;
      if(s.count<=n){inv.setOffhand(rest?stack(rest):null);return;}
      inv.setOffhand({...s,count:s.count-n});
      if(rest)give(game,stack(rest));
    },
    damage(n=1){
      const s=inv.offhand,max=s&&itemDef(s.id)?.durability;if(!s||!max||creative())return;
      const wear=(s.damage??0)+n;
      if(wear>=max){inv.setOffhand(null);game.sounds.play('tool_break',game.player.state);}
      else inv.setOffhand({...s,damage:wear});
    }};
}
/** Adds a stack to the inventory and drops what does not fit at the player's feet. */
export function give(game:Game,s:ItemStack):void{
  const left=game.inventory.add(s);
  if(left>0){const p=game.player.state;game.entities.dropItem({...s,count:left},p.x,p.y+.5,p.z);}
}
/** Vanilla ItemUtils.createFilledResult: one item of the hand becomes `filled` (a bucket of water, milk...). Creative keeps
 *  the empty container and only adds the filled one when the inventory has none. */
export function fillHand(game:Game,hand:Hand,filled:string):void{
  if(game.settings.mode==='creative'){if(game.inventory.count(filled)===0)give(game,stack(filled));return;}
  const s=hand.get();if(!s)return;
  if(s.count<=1&&maxStack(filled)>=1){hand.set(stack(filled));return;}
  hand.set({...s,count:s.count-1});give(game,stack(filled));
}
