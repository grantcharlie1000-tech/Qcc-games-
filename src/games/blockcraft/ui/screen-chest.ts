// Chest and barrel screens (vanilla ChestMenu): 27 slots from the chest block entity, or 54 for a
// large chest. Two chests with the same facing side by side (along the axis across their fronts)
// form a large chest; in a longer row chests pair from the row's start, so every chest finds the
// same partner. The left half (seen from the front) is the top three rows, as in vanilla.
import {blockDef,FACING_VECTOR,rotateCW,type Facing} from '../data/blocks';
import type {BlockSource,ChestEntity,Game,Vec3} from '../engine/contracts';
import {SlotMenu,arraySlot,playerSlots,screenRule,type MenuSlot} from './slots';
import {blockScreenValid,playerInventoryHtml,slotGrid,type ScreenBuild} from './screen-common';

function chestFacing(world:BlockSource,x:number,y:number,z:number):Facing|null{
  const id=world.get(x,y,z);if(id<0)return null;
  const d=blockDef(id);return d.family==='chest'&&d.facing?d.facing:null;
}
/** The chest blocks shown by opening the chest at `at`: [top half, bottom half] for a large chest, else [at]. */
export function chestPositions(world:BlockSource,at:Vec3):Vec3[]{
  const facing=chestFacing(world,at.x,at.y,at.z);if(!facing)return[at];
  // "Left" seen by a player looking at the front (the front faces +facing): rotateCW(facing).
  const [lx,lz]=FACING_VECTOR[rotateCW(facing)];
  const same=(k:number)=>chestFacing(world,at.x+lx*k,at.y,at.z+lz*k)===facing;
  let start=0;while(start>-64&&same(start-1))start--;
  const index=-start,partner=index%2===0?1:-1;
  if(!same(partner))return[at];
  const other={x:at.x+lx*partner,y:at.y,z:at.z+lz*partner};
  // The chest further toward the viewer's left is the top half.
  return partner>0?[other,at]:[at,other];
}
function containerSlots(entity:ChestEntity,offset:number):MenuSlot[]{
  if(entity.items.length<27)for(let i=entity.items.length;i<27;i++)entity.items.push(null);
  return Array.from({length:27},(_,i)=>arraySlot(entity.items,i,'container',`Chest slot ${offset+i+1}`));
}
export function buildChest(game:Game,menu:SlotMenu,at?:Vec3):ScreenBuild|null{
  if(!at)return null;
  const id=game.world.get(at.x,at.y,at.z);
  const barrel=id>=0&&blockDef(id).family==='barrel';
  let positions=barrel?[at]:chestPositions(game.world,at);
  let entities=positions.map(p=>game.blockEntities.get(p.x,p.y,p.z));
  // A partner without its block entity (not loaded yet) opens the clicked chest alone.
  if(positions.length>1&&entities.some(e=>e?.kind!=='chest')){positions=[at];entities=[game.blockEntities.get(at.x,at.y,at.z)];}
  if(entities.some(e=>e?.kind!=='chest'))return null;
  const slots=entities.flatMap((e,k)=>containerSlots(e as ChestEntity,k*27));
  menu.setup([...slots,...playerSlots(game.inventory)],screenRule((m,i)=>m.moveSlot(i,m.indexes('container'))));
  const large=positions.length>1,title=barrel?'Barrel':large?'Large Chest':'Chest';
  const centre={x:at.x+.5,y:at.y+.5,z:at.z+.5};
  const checks=positions.map(p=>blockScreenValid(game,p,barrel?['barrel']:['chest']));
  return{id:'chest',title,kind:large?'chest-large':'chest',
    html:`${slotGrid(menu,menu.indexes('container'),9,'bc-container',title)}${playerInventoryHtml(menu)}`,
    valid:()=>checks.every(c=>c()),
    opened:()=>game.sounds.play('chest_open',centre),closed:()=>game.sounds.play('chest_close',centre)};
}
