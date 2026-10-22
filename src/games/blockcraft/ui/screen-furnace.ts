// Furnace screen (vanilla AbstractFurnaceMenu) over the furnace block entity: input, fuel (fuels and
// empty buckets only) and output, with the flame (fuel left) and arrow (cooking) progress.
// Taking output pays the stored experience and emits itemCrafted.
// Laid out like the vanilla 176×166 furnace: input over the flame over the fuel, the progress arrow, the large output.
import type {ItemStack} from '../data/items';
import type {FurnaceEntity,Game,Vec3} from '../engine/contracts';
import {SlotMenu,mainHotbarRule,playerSlots,screenRule,type MenuSlot} from './slots';
import {arrowHtml,blockScreenValid,placeStyle,playerInventoryHtml,slotHtml,type ScreenBuild} from './screen-common';

const copy=(s:ItemStack|null)=>s?{...s}:null;
const clamp01=(v:number)=>Number.isFinite(v)?Math.max(0,Math.min(1,v)):0;
/** Seconds to cook one item (contracts: FurnaceEntity.cook). */
export const COOK_SECONDS=10;
/** Vanilla FurnaceScreen geometry (GUI px; slot frames, the 14×14 flame, the 22×15 arrow, the output's 26×26 frame). */
export const FURNACE_LAYOUT={size:{width:176,height:166},input:{x:55,y:16},flame:{x:56,y:36},fuel:{x:55,y:52},arrow:{x:80,y:35},
  output:{x:111,y:30},main:83,label:72} as const;
export const FLAME_ROWS=14,ARROW_COLUMNS=22;
/** Gauges drawn in whole GUI pixels like vanilla: the flame shows ceil(fuel × 13) + 1 rows while lit, the arrow
 *  ceil(progress × 22) columns. */
export function furnaceGauges(flame:number,arrow:number):{flameRows:number;arrowColumns:number}{
  const f=clamp01(flame),a=clamp01(arrow);
  return{flameRows:f>0?Math.min(FLAME_ROWS,Math.ceil(f*(FLAME_ROWS-1))+1):0,arrowColumns:Math.min(ARROW_COLUMNS,Math.ceil(a*ARROW_COLUMNS))};
}
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
  const busy=game.net?.containerBusy?.([at]);if(busy){game.ui.toast(`${busy} is using that.`);return null;}
  game.events.emit('containerOpened',{positions:[at]});
  menu.setup([...furnaceSlots(game,f),...playerSlots(game.inventory)],screenRule((m,i)=>{
    const s=m.slots[i].get();if(!s)return false;
    if(canSmelt(game,s.id))return m.moveSlot(i,m.indexes('input'));
    if(isFuel(game,s.id))return m.moveSlot(i,m.indexes('fuel'));
    return mainHotbarRule(m,i);
  }));
  const L=FURNACE_LAYOUT;
  const [input]=menu.indexes('input'),[fuel]=menu.indexes('fuel'),[output]=menu.indexes('output');
  const html=slotHtml(menu,input,'',L.input)+`<span class="bc-flame bc-at" style="${placeStyle(L.flame)}" aria-hidden="true"><i></i></span>`+
    slotHtml(menu,fuel,'bc-s-fuel',L.fuel)+arrowHtml(true,false,L.arrow)+slotHtml(menu,output,'bc-s-big',L.output)+playerInventoryHtml(menu,L.main,L.label);
  return{id:'furnace',title:'Furnace',kind:'furnace',gui:L.size,titleAt:'center',html,valid:blockScreenValid(game,at,['furnace']),
    progress:()=>({flame:f.burnTotal>0?clamp01(f.burn/f.burnTotal):0,arrow:clamp01(f.cook/COOK_SECONDS)})};
}
