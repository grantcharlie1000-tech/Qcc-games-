// Interaction service: the crosshair target (block outline ray and entity ray), mining with vanilla break times and
// crack stages, attacks with the modern cooldown (combat.ts), right clicks with both hands (use.ts, placement.ts),
// pick block, dropping and swapping hands. Input is handled on the 20 Hz tick like vanilla's handleKeybinds, reading
// pressed() edges as well as down() so clicks shorter than a frame or a tick still register.
import {AIR,B,OUTLINE_BOX,SOLID,blockDef,isLiquid,type BlockId} from '../data/blocks';
import {ITEMS,itemDef,stack,type ItemStack} from '../data/items';
import type {BlockSource,Entity,Game,InteractionService,RayHit} from '../engine/contracts';
export {traceOutline};
import {createCombat} from './combat';
import {blockXp,canHarvest,lootDrops} from './loot';
import {acted,mainHand,offHand,traceOutline,type Hand,type Hit,type Result} from './use-hands';
import {bowPower,releaseItemUse,tickItemUse,useBlock,useItem,useItemOn,useOnEntity,useProgress,type ItemUse} from './use';

export const REACH=4.5,CREATIVE_REACH=5,ENTITY_REACH=3;
/** Delay ticks after a break: survival waits 5 ticks after a mined block (vanilla); creative repeats every 4 ticks (200 ms)
 *  while attack is held (the break tick itself does not count down). */
export const DESTROY_DELAY=5,CREATIVE_DESTROY_DELAY=3;
/** Ticks between repeated uses while right click is held, and the attack lock after swinging at air (survival). */
export const RIGHT_CLICK_DELAY=4,MISS_TIME=10;
/** Breaking exhaustion (vanilla 0.005 per block). */
export const BREAK_EXHAUSTION=.005;

// ---- Break times ----------------------------------------------------------------------------------------------------
export interface MiningConditions{onGround:boolean;underwater:boolean}
const SWORD_EFFICIENT=new Set(['pumpkin','melon','cactus']);
/** Tool speed against a block (vanilla getDestroySpeed): the tier speed for the matching tool, shears on leaves 15 and wool 5,
 *  swords 1.5 on leaves, plants and gourds, hoes on leaves; 1 otherwise. */
export function toolSpeed(id:BlockId,held:ItemStack|null):number{
  const tool=held?itemDef(held.id)?.tool:undefined;if(!tool)return 1;
  const def=blockDef(id),leaves=def.family.endsWith('_leaves');
  if(tool.kind==='shears')return leaves?15:def.family.endsWith('_wool')?5:1;
  if(tool.kind==='sword')return leaves||SWORD_EFFICIENT.has(def.family)||def.sound==='plant'?tool.speed:1;
  if(tool.kind==='hoe'&&leaves)return tool.speed;
  return tool.kind===def.tool?tool.speed:1;
}
/** Progress per tick toward breaking (1 = broken): speed / hardness / (30 if harvestable else 100), ÷ 5 off the ground and
 *  ÷ 5 with the head under water. Infinity for hardness 0, 0 for unbreakable blocks. */
export function destroyProgress(id:BlockId,held:ItemStack|null,c:MiningConditions):number{
  const def=blockDef(id);if(def.hardness<0)return 0;if(def.hardness===0)return Infinity;
  let speed=toolSpeed(id,held);
  if(c.underwater)speed/=5;
  if(!c.onGround)speed/=5;
  return speed/def.hardness/(canHarvest(id,held)?30:100);
}
/** Whole ticks of mining needed: 0 = breaks on the click, Infinity = never. */
export function breakTicks(id:BlockId,held:ItemStack|null,c:MiningConditions):number{
  const p=destroyProgress(id,held,c);
  return p>=1?0:p<=0?Infinity:Math.ceil(1/p-1e-9);
}

const sameHit=(a:RayHit|null,b:RayHit)=>!!a&&a.x===b.x&&a.y===b.y&&a.z===b.z&&a.nx===b.nx&&a.ny===b.ny&&a.nz===b.nz&&a.id===b.id;

/** Item a pick-block on this state gives: the item placing its family, else its own item (seeds for crops, dirt for farmland). */
export function pickItem(id:BlockId):string|null{
  const def=blockDef(id);if(def.shape==='air'||def.liquid)return null;
  const own=ITEMS.get(def.family);
  if(own?.places===def.family)return own.id;
  return def.item&&ITEMS.has(def.item)?def.item:null;
}
/** The other half of a door or bed at (x,y,z), if it is still there. */
export function partnerOf(world:BlockSource,x:number,y:number,z:number,def=blockDef(world.get(x,y,z))):{x:number;y:number;z:number;id:BlockId}|null{
  let px=x,py=y,pz=z;
  if(def.door)py=def.door.half==='lower'?y+1:y-1;
  else if(def.bed&&def.facing){const s=def.bed.part==='foot'?-1:1,v={north:[0,-1],south:[0,1],east:[1,0],west:[-1,0]}[def.facing];px=x+v[0]*s;pz=z+v[1]*s;}
  else return null;
  const id=world.get(px,py,pz);if(id<=0)return null;
  const o=blockDef(id);
  if(o.family!==def.family)return null;
  if(def.door&&o.door?.half===def.door.half)return null;
  if(def.bed&&(o.bed?.part===def.bed.part||o.facing!==def.facing))return null;
  return{x:px,y:py,z:pz,id};
}

export function createInteraction(game:Game):InteractionService{
  const combat=createCombat(game);
  const main:Hand=mainHand(game),off:Hand=offHand(game),hands=[main,off];
  const scratch:Hit={x:0,y:0,z:0,nx:0,ny:0,nz:0,id:0,distance:0,px:0,py:0,pz:0};
  const cooldowns=new Map<string,number>();
  let target:Hit|null=null,entityTarget:Entity|null=null;
  // Mining state (vanilla MultiPlayerGameMode).
  let breaking:{x:number;y:number;z:number;progress:number}|null=null,destroying=false,destroyTicks=0,destroyItem:string|null=null,destroyDelay=0;
  let missTime=0,rightClickDelay=0,lastHeld:string|null=null,partial=0;
  let using:ItemUse|null=null;const usingView={item:'',progress:0};
  let fovScaled=false,editToast=false;
  const creative=()=>game.settings.mode==='creative';
  const heldId=()=>game.inventory.held()?.id??null;
  const isSword=(s:ItemStack|null)=>!!s&&itemDef(s.id)?.tool?.kind==='sword';

  function updateTarget(){
    if(game.state!=='playing'&&game.state!=='screen'&&game.state!=='paused'){target=null;entityTarget=null;return;}
    const eye=game.player.eye(),l=game.player.look(),reach=creative()?CREATIVE_REACH:REACH;
    const hit=traceOutline(game.world,eye.x,eye.y,eye.z,l.x,l.y,l.z,reach,scratch);
    const ent=game.entities.raycast(eye,l,hit?Math.min(ENTITY_REACH,hit.distance):ENTITY_REACH);
    entityTarget=ent?ent.entity:null;
    if(!hit||entityTarget)target=null;
    else if(target&&sameHit(target,hit))Object.assign(target,hit);
    else target={...hit};
  }
  function showSelection(){
    const box=target&&game.state!=='dead'?OUTLINE_BOX[target.id]:null;
    game.render.setSelection(box&&target&&box.length===6?{minX:target.x+box[0],minY:target.y+box[1],minZ:target.z+box[2],maxX:target.x+box[3],maxY:target.y+box[4],maxZ:target.z+box[5]}:null);
  }

  // ---- Mining ------------------------------------------------------------------------------------------------------
  function conditions(){const p=game.player.state;return{onGround:p.onGround||p.flying,underwater:p.headInWater};}
  /** Aborting a block also restarts the attack cooldown (vanilla stopDestroyBlock). */
  function stopDestroy(){
    if(!destroying&&!breaking)return;
    if(destroying)combat.reset();
    destroying=false;breaking=null;destroyTicks=0;game.render.setBreaking(null,0);
  }
  /** Vanilla wear for a mined block: tools 1 (swords 2) when the block has hardness; shears 1 except fire. */
  function mineWear(def:ReturnType<typeof blockDef>,held:ItemStack|null):number{
    const tool=held?itemDef(held.id)?.tool:undefined;if(!tool)return 0;
    if(tool.kind==='shears')return def.family==='fire'?0:1;
    return def.hardness!==0?tool.kind==='sword'?2:1:0;
  }
  /** Removes a block as the player: partner halves, ice melt, sound, particles, stats, event, then survival drops, xp,
   *  tool wear and exhaustion. */
  function breakBlock(x:number,y:number,z:number){
    const w=game.world,id=w.get(x,y,z);if(id<=0)return;
    const def=blockDef(id),held=game.inventory.held(),survival=!creative();
    const partner=partnerOf(w,x,y,z,def);
    if(!w.set(x,y,z,AIR,'player')){if(w.editsFull&&!editToast){editToast=true;game.ui.toast('This world cannot hold more changes');}return;}
    const drops=survival?lootDrops(id,held,game.random):[];
    if(partner&&w.set(partner.x,partner.y,partner.z,AIR,'player')&&survival)drops.push(...lootDrops(partner.id,null,game.random));
    if(survival&&def.family==='ice'){const below=w.get(x,y-1,z);if(below>0&&(SOLID[below]||isLiquid(below)))w.set(x,y,z,B.water,'player');}
    const centre={x:x+.5,y:y+.5,z:z+.5};
    if(def.family==='fire')game.sounds.play('fizz',centre,{volume:.5,pitch:2.6});
    else game.sounds.play(`break:${def.sound}`,centre,{pitch:.8});
    game.render.spawnParticles('block',centre.x,centre.y,centre.z,{block:id,count:32,spread:.45});
    game.stats.mined++;
    game.events.emit('blockBroken',{x,y,z,id,byPlayer:true});
    if(!survival)return;
    const r=game.random;
    for(const s of drops)game.entities.dropItem(s,x+.5+(r()-.5)*.5,y+.5+(r()-.5)*.5-.125,z+.5+(r()-.5)*.5,{x:(r()*.2-.1)*20,y:4,z:(r()*.2-.1)*20});
    const xp=canHarvest(id,held)?blockXp(id,r):0;
    if(xp>0)game.entities.dropXp(xp,centre.x,centre.y,centre.z);
    const wear=mineWear(def,held);if(wear)game.inventory.damageHeld(wear);
    game.survival.addExhaustion(BREAK_EXHAUSTION);
  }
  function setStage(){
    if(!breaking)return;
    const stage=breaking.progress>0?Math.min(9,Math.floor(breaking.progress*10)):-1;
    game.render.setBreaking(stage>=0?breaking:null,Math.max(0,stage));
  }
  function startDestroy(t:Hit):void{
    if(creative()){breakBlock(t.x,t.y,t.z);destroyDelay=CREATIVE_DESTROY_DELAY;return;}
    if(destroying&&breaking&&breaking.x===t.x&&breaking.y===t.y&&breaking.z===t.z)return;
    stopDestroy();
    if(destroyProgress(t.id,game.inventory.held(),conditions())>=1){breakBlock(t.x,t.y,t.z);return;}
    destroying=true;breaking={x:t.x,y:t.y,z:t.z,progress:0};destroyTicks=0;destroyItem=heldId();
  }
  function continueDestroy(t:Hit):void{
    if(destroyDelay>0){destroyDelay--;return;}
    if(creative()){destroyDelay=CREATIVE_DESTROY_DELAY;breakBlock(t.x,t.y,t.z);return;}
    if(!(destroying&&breaking&&breaking.x===t.x&&breaking.y===t.y&&breaking.z===t.z&&destroyItem===heldId())){startDestroy(t);return;}
    const id=game.world.get(t.x,t.y,t.z);if(id<=0){stopDestroy();return;}
    breaking.progress+=destroyProgress(id,game.inventory.held(),conditions());
    const def=blockDef(id);
    if(destroyTicks%4===0){
      game.sounds.play(`hit:${def.sound}`,{x:t.x+.5,y:t.y+.5,z:t.z+.5},{volume:.25,pitch:.5});
      game.render.swing();
    }
    destroyTicks++;
    // One crack particle on the hit face each tick.
    game.render.spawnParticles('block',t.px+t.nx*.05,t.py+t.ny*.05,t.pz+t.nz*.05,{block:id,count:1,spread:.1});
    if(breaking.progress>=1-1e-6){
      destroying=false;breaking=null;game.render.setBreaking(null,0);
      breakBlock(t.x,t.y,t.z);destroyDelay=DESTROY_DELAY;
    }else setStage();
  }
  /** A click of attack: hit the entity, start mining the block, or swing at air. Returns true if a block broke. */
  function startAttack():boolean{
    if(missTime>0)return false;
    if(entityTarget){combat.attack(entityTarget);return false;}
    if(!target){
      if(!creative())missTime=MISS_TIME;
      combat.reset();game.render.swing();return false;
    }
    const t=target;game.render.swing();
    if(creative()&&isSword(game.inventory.held()))return false;
    startDestroy(t);
    return game.world.get(t.x,t.y,t.z)!==t.id;
  }
  function continueAttack(down:boolean){
    if(!down)missTime=0;
    if(missTime>0||using)return;
    if(down&&target&&!entityTarget&&!(creative()&&isSword(game.inventory.held())))continueDestroy(target);
    else stopDestroy();
  }

  // ---- Using -------------------------------------------------------------------------------------------------------
  function startUsing(u:ItemUse){using=u;usingView.item=u.item;usingView.progress=0;}
  function stopUsing(){
    using=null;
    if(fovScaled){fovScaled=false;game.render.setFovScale(1);}
  }
  const finishSwing=(r:Result)=>{if(r==='success')game.render.swing();};
  /** A right click: vanilla startUseItem with both hands. */
  function startUse(){
    if(destroying)return;
    rightClickDelay=RIGHT_CLICK_DELAY;
    const sneaking=game.player.state.sneaking,anyItem=!!game.inventory.held()||!!game.inventory.offhand;
    for(const hand of hands){
      const s=hand.get();
      if(entityTarget){
        const r=useOnEntity(game,hand,entityTarget);
        if(acted(r)){finishSwing(r);return;}
      }else if(target){
        const hit=target;
        if(!(sneaking&&anyItem)){
          const r=useBlock(game,hand,hit);
          if(acted(r)){finishSwing(r);return;}
        }
        if(s&&(cooldowns.get(s.id)??0)<=0){
          const r=useItemOn(game,hand,hit,s);
          if(acted(r)){finishSwing(r);return;}
          if(r==='fail')return;
        }
      }
      if(s){
        const r=useItem(game,hand,s,startUsing,cooldowns);
        if(acted(r)){finishSwing(r);return;}
      }
    }
  }
  function tickUsing(){
    const u=using!;
    if(!tickItemUse(game,u)){stopUsing();return;}
    usingView.progress=useProgress(u);
    if(!game.input.down('use')){releaseItemUse(game,u);stopUsing();}
  }

  // ---- Pick block --------------------------------------------------------------------------------------------------
  function suitableSlot(){
    const inv=game.inventory;
    for(let i=0;i<9;i++){const j=(inv.selected+i)%9;if(!inv.slots[j])return j;}
    return inv.selected;
  }
  function pick(){
    const inv=game.inventory;
    let id:string|null=null;
    if(entityTarget){if(creative()&&ITEMS.has(`${entityTarget.kind}_spawn_egg`))id=`${entityTarget.kind}_spawn_egg`;}
    else if(target)id=pickItem(target.id);
    if(!id)return;
    const found=inv.slots.findIndex(s=>!!s&&s.id===id&&!s.damage);
    if(found>=0&&found<9){inv.select(found);return;}
    if(found<0&&!creative())return;
    const slot=suitableSlot();
    if(found>=9){const swap=inv.slots[slot];inv.setSlot(slot,inv.slots[found]);inv.setSlot(found,swap);inv.select(slot);return;}
    const current=inv.slots[slot];
    if(current){const free=inv.slots.findIndex(s=>!s);if(free>=0)inv.setSlot(free,current);}
    inv.setSlot(slot,stack(id,1));inv.select(slot);
  }

  const service:InteractionService={
    get target(){return target;},
    get entityTarget(){return entityTarget;},
    get attackCharge(){return combat.charge(partial);},
    get using(){return using?usingView:null;},
    get breaking(){return breaking;},
    blockDrops:(id,tool)=>lootDrops(id,tool,game.random),
    frame(dt){
      partial=Math.min(1,partial+dt*20);
      updateTarget();showSelection();
      if(game.state!=='playing'&&(breaking||destroying))stopDestroy();
      if(using?.kind==='bow'){
        const f=Math.min(1,(using.ticks+partial)/20);
        game.render.setFovScale(1-f*f*.15);fovScaled=true;
      }
    },
    tick(){
      partial=0;combat.tick();
      if(rightClickDelay>0)rightClickDelay--;
      for(const [id,t] of cooldowns){if(t<=1)cooldowns.delete(id);else cooldowns.set(id,t-1);}
      if(game.state!=='playing'){stopDestroy();if(using)stopUsing();missTime=0;return;}
      const input=game.input;
      updateTarget();
      const held=heldId();
      if(held!==lastHeld){lastHeld=held;combat.reset();}
      if(input.pressed('swapHands')){game.inventory.swapHands();if(using)stopUsing();}
      if(input.pressed('dropStack')){if(game.inventory.held()){game.inventory.dropHeld(true);game.render.swing();}}
      else if(input.pressed('drop')){if(game.inventory.held()){game.inventory.dropHeld(false);game.render.swing();}}
      let broke=false;
      if(using){input.pressed('attack');input.pressed('use');input.pressed('pick');}
      else{
        if(input.pressed('attack'))broke=startAttack();
        if(input.pressed('use'))startUse();
        if(input.pressed('pick'))pick();
      }
      if(input.down('use')&&rightClickDelay===0&&!using)startUse();
      if(using)tickUsing();
      continueAttack(input.down('attack')&&!broke);
      showSelection();
    },
    reset(){
      target=null;entityTarget=null;breaking=null;destroying=false;destroyTicks=0;destroyDelay=0;missTime=0;rightClickDelay=0;
      using=null;cooldowns.clear();combat.reset();lastHeld=null;editToast=false;
      if(fovScaled){fovScaled=false;game.render.setFovScale(1);}
    },
    dispose(){using=null;breaking=null;}
  };
  return service;
}
export {bowPower};
