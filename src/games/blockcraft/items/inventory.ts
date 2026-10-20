// STUB inventory (owned by the inventory & screens agent). 36 slots + armour + offhand with
// stacking. This version starts with a creative-style hotbar of blocks.
import {maxStack,parseStack,sameItem,stack,itemDef,type ItemStack} from '../data/items';
import type {Game,InventoryService} from '../engine/contracts';

const START=['grass_block','dirt','stone','cobblestone','oak_planks','oak_log','glass','torch','crafting_table'];
export function createInventory(game:Game):InventoryService{
  const slots:(ItemStack|null)[]=new Array(36).fill(null),armor:(ItemStack|null)[]=[null,null,null,null];
  const listeners=new Set<()=>void>();
  const changed=()=>{for(const l of listeners)l();};
  function fill(){slots.fill(null);START.forEach((id,i)=>{slots[i]=stack(id,maxStack(id));});}
  fill();
  const inv:InventoryService={
    slots,armor,offhand:null,selected:0,
    held:()=>slots[inv.selected],
    select(i){inv.selected=((i%9)+9)%9;changed();},
    add(s){
      let left=s.count;const limit=maxStack(s.id);
      for(let i=0;i<36&&left>0;i++){const t=slots[i];if(t&&sameItem(t,s)&&t.count<limit){const n=Math.min(left,limit-t.count);t.count+=n;left-=n;}}
      for(let i=0;i<36&&left>0;i++)if(!slots[i]){const n=Math.min(left,limit);slots[i]={...s,count:n};left-=n;}
      changed();return left;
    },
    consumeHeld(n=1){if(game.settings.mode==='creative')return;const h=slots[inv.selected];if(!h)return;h.count-=n;if(h.count<=0)slots[inv.selected]=null;changed();},
    damageHeld(n=1){
      if(game.settings.mode==='creative')return;const h=slots[inv.selected],d=h&&itemDef(h.id);const max=d?.tool?.durability;if(!h||!max)return;
      h.damage=(h.damage??0)+n;if(h.damage>=max){slots[inv.selected]=null;game.sounds.play('tool_break');}changed();
    },
    damageArmor(){},
    armorIn:slot=>armor[['head','chest','legs','feet'].indexOf(slot)],
    count:id=>slots.reduce((n,s)=>n+(s?.id===id?s.count:0),0),
    remove(id,count){let left=count;for(let i=0;i<36&&left>0;i++){const s=slots[i];if(s?.id===id){const n=Math.min(left,s.count);s.count-=n;left-=n;if(!s.count)slots[i]=null;}}changed();return count-left;},
    setSlot(i,s){slots[i]=s;changed();},
    dropHeld(all){const h=slots[inv.selected];if(!h)return;const n=all?h.count:1,e=game.player.eye(),l=game.player.look();
      game.entities.dropItem({...h,count:n},e.x,e.y-.3,e.z,{x:l.x*6,y:l.y*6+1,z:l.z*6});h.count-=n;if(!h.count)slots[inv.selected]=null;changed();},
    dropAll(){},
    clear(){slots.fill(null);armor.fill(null);changed();},
    onChange(l){listeners.add(l);return()=>listeners.delete(l);},
    reset(){fill();armor.fill(null);inv.selected=0;changed();},
    serialize:()=>({slots,armor,selected:inv.selected}),
    restore(v){
      const d=v as {slots?:unknown[];armor?:unknown[];selected?:unknown};if(!d||!Array.isArray(d.slots)||d.slots.length!==36)return;
      d.slots.forEach((s,i)=>{slots[i]=s===null?null:parseStack(s);});
      if(Array.isArray(d.armor)&&d.armor.length===4)d.armor.forEach((s,i)=>{armor[i]=s===null?null:parseStack(s);});
      if(Number.isInteger(d.selected)&&(d.selected as number)>=0&&(d.selected as number)<9)inv.selected=d.selected as number;
      changed();
    }
  };
  return inv;
}
