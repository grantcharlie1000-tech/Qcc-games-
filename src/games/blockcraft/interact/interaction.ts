// STUB interaction (owned by the interaction agent: mining speed by tool and hardness with crack
// stages, loot tables, placement rules and orientations, block use (doors, beds, tables,
// furnaces, chests, TNT), item use (food, buckets, hoes, bone meal, bows), melee with cooldown).
// This version: timed mining, simple drops, block placement with facing, opening screens.
import {blockDef,BLOCKS,stateFor,facingFromYaw,REPLACEABLE,AIR,isLiquid,OUTLINE_BOX,type BlockId,type Facing} from '../data/blocks';
import {itemDef,stack} from '../data/items';
import {raycast} from '../engine/physics';
import type {Entity,Game,InteractionService,ItemStack,RayHit} from '../engine/contracts';

export const REACH=4.5,CREATIVE_REACH=5;
function blockDrops(id:BlockId,tool:ItemStack|null):ItemStack[]{
  const def=blockDef(id),stats=tool?itemDef(tool.id)?.tool:undefined;
  const harvest=!def.requiresTool||!!stats&&stats.kind===def.tool&&stats.level>=def.harvestLevel;
  return harvest&&def.item&&itemDef(def.item)?[stack(def.item)]:[];
}
export function createInteraction(game:Game):InteractionService{
  let target:RayHit|null=null,entityTarget:Entity|null=null,breaking:{x:number;y:number;z:number;progress:number}|null=null,cooldown=0,placeCooldown=0;
  function update(){
    const eye=game.player.eye(),l=game.player.look(),reach=game.settings.mode==='creative'?CREATIVE_REACH:REACH;
    target=raycast(game.world,eye.x,eye.y,eye.z,l.x,l.y,l.z,reach);
    const hit=game.entities.raycast(eye,l,Math.min(3,reach));
    entityTarget=hit&&(!target||hit.distance<target.distance)?hit.entity:null;
    const box=target&&!entityTarget?OUTLINE_BOX[target.id]:null;
    game.render.setSelection(box&&target&&box.length?{minX:target.x+box[0],minY:target.y+box[1],minZ:target.z+box[2],maxX:target.x+box[3],maxY:target.y+box[4],maxZ:target.z+box[5]}:null);
  }
  function mineTime(id:number){
    const def=blockDef(id),held=game.inventory.held(),tool=held?itemDef(held.id)?.tool:undefined;
    if(def.hardness<0)return Infinity;
    const right=!!tool&&tool.kind===def.tool,harvest=!def.requiresTool||right&&tool!.level>=def.harvestLevel;
    return def.hardness*(harvest?1.5:5)/(right?tool!.speed:1);
  }
  function finishBreak(x:number,y:number,z:number,id:number){
    const def=blockDef(id),creative=game.settings.mode==='creative';
    game.world.set(x,y,z,AIR,'player');game.stats.mined++;
    game.events.emit('blockBroken',{x,y,z,id,byPlayer:true});game.sounds.play(`break:${def.sound}`,{x,y,z});
    if(!creative){
      const held=game.inventory.held();
      for(const s of blockDrops(id,held))game.entities.dropItem(s,x+.5,y+.3,z+.5);
      if(held&&itemDef(held.id)?.tool)game.inventory.damageHeld(1);
    }
  }
  function place():boolean{
    if(!target)return false;
    const held=game.inventory.held(),def=held&&itemDef(held.id);if(!def?.places)return false;
    let {x,y,z}=target;
    if(!REPLACEABLE[target.id]||isLiquid(target.id)&&false){x+=target.nx;y+=target.ny;z+=target.nz;}
    const existing=game.world.get(x,y,z);if(existing<0||!REPLACEABLE[existing])return false;
    const p=game.player.state;
    const family=def.places;let state=stateFor(family,{})??BLOCKS.find(b=>b.family===family);
    if(!state)return false;
    if(family==='torch'&&target.ny!==1){
      const facing:Facing|undefined=target.nx===1?'east':target.nx===-1?'west':target.nz===1?'south':target.nz===-1?'north':undefined;
      if(!facing)return false;state=stateFor('wall_torch',{facing})!;
    }else if(state.facing)state=stateFor(family,{facing:facingFromYaw(p.yaw)})??state;
    if(state.solid&&x+1>p.x-.3&&x<p.x+.3&&z+1>p.z-.3&&z<p.z+.3&&y+1>p.y&&y<p.y+1.8)return false;
    if(!game.world.set(x,y,z,state.id,'player'))return false;
    game.stats.placed++;game.inventory.consumeHeld(1);game.render.swing();
    game.events.emit('blockPlaced',{x,y,z,id:state.id});game.sounds.play(`place:${state.sound}`,{x,y,z});
    return true;
  }
  function use(){
    if(entityTarget){const k=game.entities.kind(entityTarget.kind);if(k?.interact?.(entityTarget,game,game.inventory.held()))return;}
    if(target&&!game.player.state.sneaking){
      const def=blockDef(target.id);
      if(def.family==='crafting_table'){game.ui.open('crafting_table',target);return;}
      if(def.blockEntity==='furnace'){game.ui.open('furnace',target);return;}
      if(def.blockEntity==='chest'){game.ui.open('chest',target);return;}
    }
    place();
  }
  const service:InteractionService={
    get target(){return target;},get entityTarget(){return entityTarget;},attackCharge:1,using:null,get breaking(){return breaking;},blockDrops,
    frame(dt){
      if(game.state!=='playing'){breaking=null;game.render.setBreaking(null,0);return;}
      update();const input=game.input;cooldown=Math.max(0,cooldown-dt);placeCooldown=Math.max(0,placeCooldown-dt);
      if(input.pressed('pick')&&target&&game.settings.mode==='creative'){
        const id=blockDef(target.id).item;if(id){const i=game.inventory.slots.findIndex(s=>s?.id===id);if(i>=0&&i<9)game.inventory.select(i);else game.inventory.setSlot(game.inventory.selected,stack(id,64));}
      }
      if(input.pressed('drop'))game.inventory.dropHeld(false);
      if(input.pressed('dropStack'))game.inventory.dropHeld(true);
      if(input.pressed('swapHands'))game.inventory.swapHands();
      // Press edges catch clicks shorter than a frame on slow devices.
      if((input.pressed('use')||input.down('use'))&&placeCooldown<=0){use();placeCooldown=.25;}
      if(input.pressed('attack')||input.down('attack')){
        if(entityTarget&&cooldown<=0){
          const held=game.inventory.held(),dmg=held?itemDef(held.id)?.tool?.damage??1:1,l=game.player.look();
          game.entities.damage(entityTarget,dmg,{kind:'player',byPlayer:true,knockback:{x:l.x,z:l.z,strength:5}});game.render.swing();cooldown=.5;return;
        }
        if(!target){breaking=null;game.render.setBreaking(null,0);return;}
        if(game.settings.mode==='creative'){if(cooldown<=0){finishBreak(target.x,target.y,target.z,target.id);game.render.swing();cooldown=.2;}return;}
        if(!breaking||breaking.x!==target.x||breaking.y!==target.y||breaking.z!==target.z)breaking={x:target.x,y:target.y,z:target.z,progress:0};
        const time=mineTime(target.id);breaking.progress+=time<=0?1:dt/time;game.render.swing();
        game.render.setBreaking(breaking,Math.min(9,Math.floor(breaking.progress*10)));
        if(breaking.progress>=1){finishBreak(target.x,target.y,target.z,target.id);breaking=null;game.render.setBreaking(null,0);}
      }else if(breaking){breaking=null;game.render.setBreaking(null,0);}
    },
    reset(){target=null;breaking=null;}
  };
  return service;
}
