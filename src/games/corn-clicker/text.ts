/** Player-facing descriptions generated from the data tables, so tooltips always match the rules. */
import {format,type Big,type NumberStyle} from './big';
import {producerById,GOLDEN,FESTIVALS,type Upgrade,type Requirement,type PermUpgrade,type Achievement} from './data';

export function duration(seconds:number):string {
  const s=Math.max(0,Math.ceil(seconds));
  if(s<60)return `${s}s`;
  const m=Math.floor(s/60),r=s%60;
  if(m<60)return `${m}:${String(r).padStart(2,'0')}`;
  const h=Math.floor(m/60);
  if(h<48)return `${h}h ${String(m%60).padStart(2,'0')}m`;
  return `${Math.floor(h/24)}d ${h%24}h`;
}
export function longDuration(seconds:number):string {
  const s=Math.max(0,Math.round(seconds)),h=Math.floor(s/3600),m=Math.floor(s%3600/60);
  if(h)return `${h} hour${h===1?'':'s'}${m?` ${m} minute${m===1?'':'s'}`:''}`;
  if(m)return `${m} minute${m===1?'':'s'}`;
  return `${s} second${s===1?'':'s'}`;
}

export function effectText(u:Upgrade):string {
  const e=u.effect;
  switch(e.kind){
    case 'producer':return `${producerById[e.target].plural} produce twice as much.`;
    case 'click':return `Clicking the cob earns ×${e.mult} kernels.`;
    case 'clickCps':return `Each click also earns ${e.fraction*100}% of your production per second.`;
    case 'manyHands':return e.value<1
      ?`Farmhands and each click gain +${e.value} kernels for every non-Farmhand producer you own.`
      :`Multiplies the Many Hands bonus by ×${e.value}.`;
    case 'global':return `All production +${e.pct}%.`;
    case 'synergy':return `${producerById[e.low].plural} gain +${e.lowPerHigh*100}% for each ${producerById[e.high].name}; ${producerById[e.high].plural} gain +${e.highPerLow*100}% for each ${producerById[e.low].name}.`;
    case 'golden':return [e.freq&&`Golden cobs appear ${e.freq*100}% more often`,e.life&&`stay ${e.life*100}% longer on screen`,e.duration&&`their effects last ${e.duration*100}% longer`].filter(Boolean).join(', ')+'.';
    case 'butter':return `Each achievement adds another +${e.perAchievement}% production to the Butter Bonus.`;
    case 'unlock':return {
      garden:'Unlocks the Garden: plant rare corn varieties, harvest them and discover mutations.',
      scarecrow:'Unlocks a Scarecrow companion with a selectable bonus.',
      festival:'Unlocks Harvest Festivals: a fair arrives every 15–25 minutes of play with a big temporary bonus.',
      cornpocalypse:'Starts the Cornpocalypse: mutant pests siphon 5% of production each, then pay it all back with 25% extra when popped.',
    }[e.feature];
  }
}
export function requirementText(r:Requirement,style:NumberStyle):string {
  switch(r.type){
    case 'owned':return `own ${r.count} ${r.count===1?producerById[r.producer].name:producerById[r.producer].plural}`;
    case 'pair':return `own ${r.count} ${producerById[r.low].plural} and ${r.count} ${producerById[r.high].plural}`;
    case 'clicks':return `click the cob ${r.count} times this run`;
    case 'earned':return `harvest ${format(r.amount,style)} kernels this run`;
    case 'golden':return `collect ${r.count} golden cob${r.count===1?'':'s'}`;
    case 'achievements':return `earn ${r.count} achievements`;
  }
}
export function permRequirement(p:PermUpgrade,name:(id:string)=>string):string {return p.requires?`Requires ${name(p.requires)}.`:'';}
export function achievementTarget(a:Achievement,style:NumberStyle):string {
  return a.check.type==='runEarned'||a.check.type==='cps'||a.check.type==='clickEarned'?format(a.check.target,style):a.check.target.toLocaleString('en-GB');
}
export function goldenResult(kind:'lucky'|'bumper'|'storm',amount:Big|undefined,style:NumberStyle,seconds:number):string {
  if(kind==='lucky')return `Lucky Harvest! +${format(amount??0,style)} kernels.`;
  const e=GOLDEN.effects[kind];
  return kind==='bumper'?`Bumper Crop! Production ×${e.mult} for ${Math.round(seconds)} seconds.`:`Kernel Storm! Clicks ×${e.mult} for ${Math.round(seconds)} seconds.`;
}
export const festivalText=(id:keyof typeof FESTIVALS)=>`${FESTIVALS[id].name}: ${FESTIVALS[id].desc}`;
