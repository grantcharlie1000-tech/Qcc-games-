// Fire and lava ignition after vanilla Java 1.20 FireBlock and LavaFluid.randomTick.
//  - Fire ticks every 30-39 ticks. It goes out when it can no longer stay (no sturdy block below and no flammable
//    neighbour), in rain with chance 0.2 + 0.03 × age, when nothing nearby burns (after age 3, or at once off a sturdy
//    base), or at age 15 one time in four over a non-burnable base. It ages by 0..1 per tick.
//  - Each neighbour burns with its burn odds (in 300 sideways, 250 up or down; 50 fewer in humid or snowy biomes): it is
//    destroyed without drops, or catches fire itself; burning TNT is primed instead (80-tick fuse).
//  - Fire spreads into air cells within x±1, z±1, y-1..+4 that touch flammable blocks: chance
//    (ignite odds + 40 + 7 × difficulty) / (age + 30) in 100 (+100 per block above the first), not in rain.
//  - Lava random ticks: one or two steps up and sideways set fire in air beside something flammable (stopped by solid
//    blocks), or, one time in three, fire on top of flammable blocks beside the lava.
import {AIR,BLOCKS,FULL_CUBE,SOLID,blockId} from '../data/blocks';
import {biomeDef} from '../data/biomes';
import {CH} from '../engine/constants';
import {canSurvive} from '../engine/support';
import type {BlockSource,Difficulty,WeatherService} from '../engine/contracts';
import {KIND_FIRE,NEIGHBOURS,posKey,type Sim} from './ticks-core';

export const FIRE=blockId('fire'),TNT=blockId('tnt');
/** Vanilla FireBlock.bootStrap odds by block family: [ignite (spread toward), burn (consumed)]. */
const ODDS_BY_FAMILY:Record<string,readonly [number,number]>={
  bookshelf:[30,20],tnt:[15,100],short_grass:[60,100],fern:[60,100],dead_bush:[60,100],coal_block:[5,5],moss_block:[5,100],
  dandelion:[60,100],poppy:[60,100],blue_orchid:[60,100],allium:[60,100],cornflower:[60,100],oxeye_daisy:[60,100],
  oak_slab:[5,20],oak_stairs:[5,20]
};
export const FIRE_ODDS={ignite:new Uint8Array(256),burn:new Uint8Array(256)};
/** Blocks lava sets fire beside (vanilla ignitedByLava): the registry's flammable blocks and everything fire burns. */
export const LAVA_IGNITES=new Uint8Array(256);
for(const d of BLOCKS){
  const f=d.family;
  const odds=ODDS_BY_FAMILY[f]??(f.endsWith('_planks')?[5,20]:f.endsWith('_log')?[5,5]:f.endsWith('_leaves')?[30,60]:f.endsWith('_wool')?[30,60]:null);
  if(odds){FIRE_ODDS.ignite[d.id]=odds[0];FIRE_ODDS.burn[d.id]=odds[1];}
  LAVA_IGNITES[d.id]=+(d.flammable||!!odds);
}
/** Blocks with a full top face to rest on (vanilla isFaceSturdy(UP)): every full cube but leaves (glass, ice and double
 *  slabs too, as the shared 'fire' support rule counts them) and top slabs. */
const STURDY_TOP=new Uint8Array(256);
for(const d of BLOCKS)STURDY_TOP[d.id]=+(FULL_CUBE[d.id]===1&&!d.family.endsWith('_leaves')||d.slab==='top');
const canBurn=(id:number)=>id>0&&FIRE_ODDS.ignite[id]>0;
const sturdy=(id:number)=>id>0&&STURDY_TOP[id]===1;
/** Fire touches something it can burn. */
function validLocation(w:BlockSource,x:number,y:number,z:number){
  return canBurn(w.get(x+1,y,z))||canBurn(w.get(x-1,y,z))||canBurn(w.get(x,y+1,z))||canBurn(w.get(x,y-1,z))||canBurn(w.get(x,y,z+1))||canBurn(w.get(x,y,z-1));
}
/** FireBlock.canSurvive: a sturdy block below or a flammable neighbour (fire also clings to the sides of burning blocks).
 *  Everything the shared rule (engine/support.ts SupportRule 'fire', used by flint and steel and lightning) accepts stays,
 *  so fire placed by another area is never put out on its first tick; on top of it, the vanilla cases that rule leaves
 *  out: top slabs below, and neighbours with FireBlock ignite odds (short grass, flowers). Next to an unloaded chunk it is
 *  given the benefit of the doubt. fireTick's burn-out uses the same sturdy test, so a lone fire on glass or ice burns
 *  as long as one on stone. */
export function fireCanSurvive(w:BlockSource,x:number,y:number,z:number):boolean{
  if(canSurvive(w,FIRE,x,y,z)||sturdy(w.get(x,y-1,z))||validLocation(w,x,y,z))return true;
  for(let i=0;i<6;i++){const n=NEIGHBOURS[i];if(w.get(x+n[0],y+n[1],z+n[2])<0)return true;}
  return false;
}
/** Ignite odds of an air cell: the best of its neighbours. */
function igniteOdds(w:BlockSource,x:number,y:number,z:number){
  if(w.get(x,y,z)!==AIR)return 0;
  let best=0;
  for(let i=0;i<6;i++){const n=NEIGHBOURS[i],id=w.get(x+n[0],y+n[1],z+n[2]);if(id>0&&FIRE_ODDS.ignite[id]>best)best=FIRE_ODDS.ignite[id];}
  return best;
}
function nearRain(weather:WeatherService,x:number,y:number,z:number){
  return weather.isRainingOn(x,y,z)||weather.isRainingOn(x-1,y,z)||weather.isRainingOn(x+1,y,z)||weather.isRainingOn(x,y,z-1)||weather.isRainingOn(x,y,z+1);
}
const DIFFICULTY:Record<Difficulty,number>={peaceful:0,easy:1,normal:2,hard:3};
/** Vanilla INCREASED_FIRE_BURNOUT biomes present here. */
const HUMID=new Set(['jungle','mushroom_fields','swamp','snowy_peaks']);
export const fireDelay=(sim:Sim)=>30+sim.randInt(10);

/** Scheduled fire tick. */
export function fireTick(sim:Sim,x:number,y:number,z:number):void{
  const w=sim.blocks;if(w.get(x,y,z)!==FIRE)return;
  const key=posKey(x,y,z),game=sim.game,weather=game.weather;
  sim.schedule(x,y,z,fireDelay(sim),KIND_FIRE);
  if(!fireCanSurvive(w,x,y,z)){sim.set(x,y,z,AIR,'tick');return;}
  const age=sim.fireAge.get(key)??0,raining=weather.state!=='clear';
  if(raining&&nearRain(weather,x,y,z)&&sim.rand()<.2+age*.03){sim.set(x,y,z,AIR,'tick');return;}
  const aged=Math.min(15,age+(sim.randInt(3)>>1));
  if(aged!==age)sim.fireAge.set(key,aged);
  const below=w.get(x,y-1,z);
  if(!validLocation(w,x,y,z)){
    if(!sturdy(below)||age>3)sim.set(x,y,z,AIR,'tick');
    return;
  }
  if(age===15&&sim.randInt(4)===0&&!canBurn(below)){sim.set(x,y,z,AIR,'tick');return;}
  const humid=HUMID.has(biomeDef(game.world.biomeAt(x,z)).name),k=humid?-50:0;
  burnOut(sim,x+1,y,z,300+k,age);burnOut(sim,x-1,y,z,300+k,age);
  burnOut(sim,x,y-1,z,250+k,age);burnOut(sim,x,y+1,z,250+k,age);
  burnOut(sim,x,y,z-1,300+k,age);burnOut(sim,x,y,z+1,300+k,age);
  const difficulty=DIFFICULTY[game.settings.difficulty]??2;
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=4;dy++){
    if(!dx&&!dy&&!dz)continue;
    const tx=x+dx,ty=y+dy,tz=z+dz;
    if(ty<0||ty>=CH)continue;
    const odds=igniteOdds(w,tx,ty,tz);if(odds<=0)continue;
    let chance=Math.floor((odds+40+difficulty*7)/(age+30));
    if(humid)chance=Math.floor(chance/2);
    if(chance>0&&sim.randInt(dy>1?100+(dy-1)*100:100)<=chance&&!(raining&&nearRain(weather,tx,ty,tz)))
      sim.placeFire(tx,ty,tz,Math.min(15,age+(sim.randInt(5)>>2)));
  }
}
/** FireBlock.checkBurnOut: the block burns away or catches; TNT primes. */
function burnOut(sim:Sim,x:number,y:number,z:number,chance:number,age:number){
  const id=sim.blocks.get(x,y,z);if(id<=0)return;
  const burn=FIRE_ODDS.burn[id];if(!burn||sim.randInt(chance)>=burn)return;
  // The burnt block becomes fire (where fire can stay) or air.
  if(!(sim.randInt(age+10)<5&&!sim.game.weather.isRainingOn(x,y,z)&&sim.placeFire(x,y,z,Math.min(age+(sim.randInt(5)>>2),15))))sim.set(x,y,z,AIR,'tick');
  if(id===TNT&&sim.primeTnt(x,y,z,80,false))sim.game.sounds.play('fuse',{x:x+.5,y:y+.5,z:z+.5});
}

/** LavaFluid.randomTick. */
export function lavaRandomTick(sim:Sim,x:number,y:number,z:number):void{
  const w=sim.blocks,steps=sim.randInt(3);
  if(steps>0){
    let px=x,py=y,pz=z;
    for(let i=0;i<steps;i++){
      px+=sim.randInt(3)-1;py++;pz+=sim.randInt(3)-1;
      if(py>=CH)return;
      const id=w.get(px,py,pz);if(id<0)return;
      if(id===AIR){
        if(lavaIgnitable(w,px,py,pz)){sim.placeFire(px,py,pz,0);return;}
      }else if(SOLID[id])return;
    }
  }else for(let i=0;i<3;i++){
    const px=x+sim.randInt(3)-1,pz=z+sim.randInt(3)-1,id=w.get(px,y,pz);
    if(id<0)return;
    if(y+1<CH&&w.get(px,y+1,pz)===AIR&&LAVA_IGNITES[id])sim.placeFire(px,y+1,pz,0);
  }
}
function lavaIgnitable(w:BlockSource,x:number,y:number,z:number){
  for(let i=0;i<6;i++){const n=NEIGHBOURS[i],id=w.get(x+n[0],y+n[1],z+n[2]);if(id>0&&LAVA_IGNITES[id])return true;}
  return false;
}
