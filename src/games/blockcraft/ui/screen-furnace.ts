// Furnace screen (vanilla AbstractFurnaceMenu) over the furnace block entity: input, fuel (fuels and
// empty buckets only) and output, with the flame (fuel left) and arrow (cooking) progress.
// Taking output pays the stored experience and emits itemCrafted.
import type {ItemStack} from '../data/items';
import type {FurnaceEntity,Game,Vec3} from '../engine/contracts';
import {SlotMenu,mainHotbarRule,playerSlots,screenRule,type MenuSlot} from './slots';
import {arrowHtml,blockScreenValid,playerInventoryHtml,slotHtml,type ScreenBuild} from './screen-common';

const copy=(s:ItemStack|null)=>s?{...s}:null;
const clamp01=(v:number)=>Number.isFinite(v)?Math.max(0,Math.min(1,v)):0;
/** Seconds to cook one item (contracts: FurnaceEntity.cook). */
export const COOK_SECONDS=10;
export function isFuel(game:Game,id:string):boolean{try{return game.crafting.fuelSeconds(id)>0;}catch{return false;}}
export function canSmelt(game:Game,id:string):boolean{try{return !!game.crafting.smelt(id);}catch{return false;}}
/** Pays out the furnace's stored experience (vanilla rounds the fraction up at random). */
export function payFurnaceXp(game:Game,furnace:FurnaceEntity){
  const xp=furnace.xp;if(!(xp>0))return;
  furnace.xp=0;
  let points=Math.floor(xp);if(game.random()<xp-points)points++;
  if(points>0)game.survival.addXp(points);
}
export function furnaceSlots(game:Game,f:FurnaceEntity):MenuSlot[]{
  return[
    {section:'input',label:'Furnace input',get:()=>f.input,set:s=>{f.input=copy(s);}},
    {section:'fuel',label:'Furnace fuel',get:()=>f.fuel,set:s=>{f.fuel=copy(s);},
      mayPlace:s=>isFuel(game,s.id)||s.id==='bucket',limit:s=>s.id==='bucket'?1:64},
    {section:'output',label:'Furnace output',get:()=>f.output,set:s=>{f.output=copy(s);},mayPlace:()=>false,
      onTake:taken=>{payFurnaceXp(game,f);game.events.emit('itemCrafted',{stack:{...taken},station:'furnace'});}}
  ];
}
export function buildFurnace(game:Game,menu:SlotMenu,at?:Vec3):ScreenBuild|null{
  const f=at&&game.blockEntities.get(at.x,at.y,at.z);
  if(!f||f.kind!=='furnace')return null;
  menu.setup([...furnaceSlots(game,f),...playerSlots(game.inventory)],screenRule((m,i)=>{
    const s=m.slots[i].get();if(!s)return false;
    if(canSmelt(game,s.id))return m.moveSlot(i,m.indexes('input'));
    if(isFuel(game,s.id))return m.moveSlot(i,m.indexes('fuel'));
    return mainHotbarRule(m,i);
  }));
  const [input]=menu.indexes('input'),[fuel]=menu.indexes('fuel'),[output]=menu.indexes('output');
  const html=`<div class="bc-furnace"><div class="bc-furnace-in">${slotHtml(menu,input)}<span class="bc-flame" aria-hidden="true"><i></i></span>${slotHtml(menu,fuel,'bc-s-fuel')}</div>`+
    `${arrowHtml(true)}<div class="bc-furnace-out">${slotHtml(menu,output,'bc-s-big')}</div></div>${playerInventoryHtml(menu)}`;
  return{id:'furnace',title:'Furnace',kind:'furnace',html,valid:blockScreenValid(game,at,['furnace']),
    progress:()=>({flame:f.burnTotal>0?clamp01(f.burn/f.burnTotal):0,arrow:clamp01(f.cook/COOK_SECONDS)})};
}
