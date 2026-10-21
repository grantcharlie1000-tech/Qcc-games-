// Item tooltips, accessible slot labels and durability bars (pure, shared by every screen).
import {itemDef,type ItemStack} from '../data/items';

const ROMAN=['','I','II','III','IV','V'];
const SLOT_NAME={head:'Head',chest:'Body',legs:'Legs',feet:'Feet'} as const;
const title=(s:string)=>s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const num=(n:number)=>Number.isInteger(n)?String(n):String(Math.round(n*100)/100);

export function itemName(stack:ItemStack|null):string{return stack?itemDef(stack.id)?.displayName??title(stack.id):'';}
/** Remaining uses and the total, for items that wear out. */
export function durabilityOf(stack:ItemStack):{left:number;max:number}|null{
  const max=itemDef(stack.id)?.durability;return max?{left:max-(stack.damage??0),max}:null;
}
/** Tooltip lines: name, then vanilla-style stats (attack, armour, food) and durability. */
export function tooltipLines(stack:ItemStack):string[]{
  const def=itemDef(stack.id);if(!def)return[title(stack.id)];
  const lines=[def.displayName];
  // Weapons and digging tools carry attack modifiers; shears have none in vanilla.
  if(def.tool&&def.tool.kind!=='shears'){
    lines.push('When in Main Hand:',` ${num(def.tool.damage)} Attack Damage`,` ${num(def.tool.attackSpeed)} Attack Speed`);
  }
  if(def.armor){
    lines.push(`When on ${SLOT_NAME[def.armor.slot]}:`,` +${def.armor.points} Armor`);
    if(def.armor.toughness)lines.push(` +${def.armor.toughness} Armor Toughness`);
  }
  if(def.food){
    const f=def.food;
    if(f.hunger)lines.push(`Restores ${f.hunger} hunger (${num(f.hunger/2)} shanks)`,`Saturation ${num(f.saturation)}`);
    if(f.clearsEffects)lines.push('Removes all status effects');
    for(const [effect,seconds,chance,level] of f.effects??[]){
      const time=`${Math.floor(seconds/60)}:${String(Math.round(seconds%60)).padStart(2,'0')}`;
      lines.push(`${title(effect)}${(level??1)>1?` ${ROMAN[level??1]??level}`:''} (${time})${chance<1?`, ${Math.round(chance*100)}% chance`:''}`);
    }
  }
  if(def.spawns)lines.push(`Spawns a ${title(def.spawns)}`);
  const d=durabilityOf(stack);if(d)lines.push(`Durability: ${d.left} / ${d.max}`);
  return lines;
}
/** Accessible name of a slot and what it holds, e.g. "Hotbar slot 1: Oak Planks, 64". */
export function slotLabel(position:string,stack:ItemStack|null):string{
  if(!stack)return`${position}: empty`;
  const d=durabilityOf(stack),parts=[itemName(stack)];
  if(stack.count>1)parts.push(String(stack.count));
  if(d&&d.left<d.max)parts.push(`durability ${d.left} of ${d.max}`);
  return`${position}: ${parts.join(', ')}`;
}
/** Vanilla item bar: shown once damaged, 13/16 wide at full, hue from green (new) to red (worn). */
export function durabilityBar(stack:ItemStack|null):{width:number;color:string}|null{
  if(!stack?.damage)return null;
  const d=durabilityOf(stack);if(!d)return null;
  const f=Math.max(0,d.left/d.max),width=Math.round(13-(stack.damage*13)/d.max)/13;
  return{width:Math.max(0,width),color:hsv(f/3)};
}
function hsv(h:number):string{
  // Saturation and value 1.
  const i=Math.floor(h*6),f=h*6-i,q=1-f,t=f;
  const [r,g,b]=[[1,t,0],[q,1,0],[0,1,t],[0,q,1],[t,0,1],[1,0,q]][((i%6)+6)%6];
  const hex=(v:number)=>Math.round(v*255).toString(16).padStart(2,'0');
  return`#${hex(r)}${hex(g)}${hex(b)}`;
}
