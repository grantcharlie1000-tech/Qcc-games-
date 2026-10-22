// Chest and barrel screens (vanilla ChestMenu): 27 slots from the chest block entity, or 54 for a
// large chest. Two chests with the same facing side by side (along the axis across their fronts)
// form a large chest; in a longer row chests pair from the row's start, so every chest finds the
// same partner. The left half (seen from the front) is the top three rows, as in vanilla.
// A chest (either half) under a redstone-conducting block cannot open (vanilla ChestBlock.isChestBlockedAt); barrels can.
// Laid out like vanilla's 3-row and 6-row container screens.
import {blockDef,FACING_VECTOR,FULL_CUBE,OPAQUE,rotateCW,type Facing} from '../data/blocks';
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
/** Full opaque blocks that vanilla marks isRedstoneConductor(never), and chests (their real shape is not a full
 *  block), so they leave a lid free: stacked chests and a chest under a lamp block both open. */
const LID_FREE=new Set(['chest','glowstone','redstone_block']);
/** A redstone conductor right above the chest keeps its lid shut: here a full opaque cube, except LID_FREE. */
export function chestBlocked(world:BlockSource,at:Vec3):boolean{
  const id=world.get(at.x,at.y+1,at.z);
  return id>0&&OPAQUE[id]===1&&FULL_CUBE[id]===1&&!LID_FREE.has(blockDef(id).family);
}
/** Vanilla ContainerScreen geometry for `rows` rows of 9 (3: chest and barrel, 6: large chest): 114 + 18 px a row tall,
 *  the container's frames from (7, 17), the player's main rows 13 px below them and "Inventory" at height − 94. */
export function chestLayout(rows:number){
  const height=114+rows*18,main=17+rows*18+13;
  return{size:{width:176,height},title:{x:8,y:6},container:{x:7,y:17},main,label:height-94};
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
  if(!barrel&&positions.some(p=>chestBlocked(game.world,p)))return null;
  const slots=entities.flatMap((e,k)=>containerSlots(e as ChestEntity,k*27));
  menu.setup([...slots,...playerSlots(game.inventory)],screenRule((m,i)=>m.moveSlot(i,m.indexes('container'))));
  const large=positions.length>1,title=barrel?'Barrel':large?'Large Chest':'Chest';
  const centre={x:at.x+.5,y:at.y+.5,z:at.z+.5};
  const checks=positions.map(p=>blockScreenValid(game,p,barrel?['barrel']:['chest']));
  const L=chestLayout(large?6:3);
  return{id:'chest',title,kind:large?'chest-large':'chest',gui:L.size,titleAt:L.title,
    html:`${slotGrid(menu,menu.indexes('container'),9,'bc-container',title,L.container)}${playerInventoryHtml(menu,L.main,L.label)}`,
    valid:()=>checks.every(c=>c()),
    opened:()=>game.sounds.play('chest_open',centre),closed:()=>game.sounds.play('chest_close',centre)};
}
