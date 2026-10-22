/**
 * Corn Clicker rules engine. Pure TypeScript with no DOM access: the UI and the tests drive it
 * through tick(now), click(now) and the purchase/garden/prestige methods.
 * All production derives from elapsed wall-clock time, never from frame counts.
 */
import {Big} from './big';
import {
  PRODUCERS,PRODUCER_IDS,producerById,UPGRADES,upgradeById,PRICE_GROWTH,ACHIEVEMENTS,BUTTER_BASE_PER_ACHIEVEMENT,SKINS,PRESTIGE,PERMS,permById,
  VARIETIES,varietyById,GARDEN,GOLDEN,FESTIVALS,FESTIVAL,SCARECROW,SCARECROW_COOLDOWN,PESTS,
  type ProducerId,type Upgrade,type Requirement,type Feature,type Achievement,type PermEffect,type VarietyId,type GoldenKind,type FestivalId,type ScarecrowBonus,type SkinId,type GardenEffect,
} from './data';
import {freshRun,freshState,type State,type Pest} from './state';

export type BuyAmount=1|10|100|'max';
export type GameEvent=
 |{type:'achievement';id:string}
 |{type:'golden-spawn'}|{type:'golden-expired'}
 |{type:'golden';kind:GoldenKind;amount?:Big;twin:boolean}
 |{type:'festival-start';id:FestivalId}|{type:'festival-end';id:FestivalId}
 |{type:'pest-spawn'}|{type:'pest-pop';amount:Big}
 |{type:'mutation';variety:VarietyId;plot:number;discovered:boolean}
 |{type:'offline';seconds:number;earned:Big;capped:boolean}
 |{type:'effect-end';kind:GoldenKind}
 |{type:'clock'};

/** A gap longer than this between ticks counts as time away (offline rules). */
export const ACTIVE_GAP_SECONDS=60;
/** Offline gaps longer than this are implausible clock jumps; they are still capped by the allowance. */
const MAX_STEP=1;
const LOG_GROWTH=Math.log10(PRICE_GROWTH);

export class CornGame {
  s:State;
  readonly events:GameEvent[]=[];
  private cache:{cps?:Big;base?:Big;rates?:Map<ProducerId,Big>;click?:Big}={};
  private recentClicks:number[]=[];
  constructor(state?:State,now=Date.now()){this.s=state??freshState(now);}

  /** Increments whenever production-affecting state changes; the UI uses it to cache derived values. */
  version=0;
  /** Invalidate derived values after any state change that affects production. */
  touch(){this.cache={};this.version++;}
  random():number {
    // mulberry32, persisted in the save so restores are deterministic.
    let t=(this.s.rng=(this.s.rng+0x6D2B79F5)>>>0);
    t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  }
  private between(min:number,max:number){return min+(max-min)*this.random();}

  // ───────────── Permanent upgrades ─────────────
  private perm<K extends PermEffect['kind']>(kind:K):Extract<PermEffect,{kind:K}>[] {
    const out:Extract<PermEffect,{kind:K}>[]=[];
    for(const id of this.s.perms){const e=permById.get(id)?.effect;if(e?.kind===kind)out.push(e as Extract<PermEffect,{kind:K}>);}
    return out;
  }
  private permPct(kind:'global'|'producerDiscount'|'upgradeDiscount'|'goldenFreq'|'goldenLife'|'goldenDuration'|'gardenGrowth'|'festivalFreq'|'butter'|'stormDuration'):number {
    return this.perm(kind).reduce((sum,e)=>sum+(e as {pct:number}).pct,0);
  }
  canBuyPerm(id:string):boolean {
    const p=permById.get(id);
    return !!p&&!this.s.perms.has(id)&&this.s.seeds>=p.cost&&(!p.requires||this.s.perms.has(p.requires));
  }
  buyPerm(id:string):boolean {
    if(!this.canBuyPerm(id))return false;
    this.s.seeds-=permById.get(id)!.cost;this.s.perms.add(id);this.touch();return true;
  }

  // ───────────── Features and modifiers ─────────────
  has(feature:Feature):boolean {return this.s.upgrades.has(`feature-${feature}`);}
  owned(id:ProducerId){return this.s.producers[id];}
  totalOwned(){return PRODUCER_IDS.reduce((n,id)=>n+this.s.producers[id],0);}
  butterPct():number {
    let per=BUTTER_BASE_PER_ACHIEVEMENT;
    for(const id of this.s.upgrades){const e=upgradeById.get(id)?.effect;if(e?.kind==='butter')per+=e.perAchievement;}
    return this.s.achievements.size*per*(1+this.permPct('butter')/100);
  }
  gardenSize():number {return this.s.producers.greenhouse>=GARDEN.bigSizeGreenhouses?GARDEN.bigSize:GARDEN.size;}
  plotActive(i:number):boolean {const n=this.gardenSize();return i%4<n&&Math.floor(i/4)<n;}
  /** Total percentage from mature garden plants of a given effect type. */
  gardenPct(effect:GardenEffect):number {
    if(!this.has('garden'))return 0;
    let pct=0;
    this.s.garden.plots.forEach((p,i)=>{if(p&&this.plotActive(i)&&this.mature(i)){const v=varietyById[p.v];if(v.effect===effect)pct+=v.pct;}});
    return pct;
  }
  scarecrow(b:ScarecrowBonus):boolean {return this.has('scarecrow')&&this.s.scarecrow.bonuses.includes(b);}
  scarecrowSlots():number {return this.perm('scarecrowSlot').length?2:1;}
  festival(){return this.has('festival')&&this.s.festival.active?FESTIVALS[this.s.festival.active.id]:undefined;}

  // ───────────── Production ─────────────
  private manyHands():number {
    let value=0;
    for(const u of UPGRADES)if(u.effect.kind==='manyHands'&&this.s.upgrades.has(u.id))value=value===0?u.effect.value:value*u.effect.value;
    return value;
  }
  /** Bonus from Many Hands for each farmhand and each click. */
  handsBonus():number {const v=this.manyHands();return v?v*(this.totalOwned()-this.s.producers.farmhand):0;}
  /** Production of one unit of a producer before global multipliers. */
  unitRate(id:ProducerId):Big {
    const rates=this.cache.rates??=new Map();
    const cached=rates.get(id);if(cached)return cached;
    const p=producerById[id];
    let mult=1,synergy=0;
    for(const uid of this.s.upgrades){
      const e=upgradeById.get(uid)?.effect;if(!e)continue;
      if(e.kind==='producer'&&e.target===id)mult*=e.mult;
      if(e.kind==='synergy'){
        if(e.low===id)synergy+=e.lowPerHigh*this.s.producers[e.high];
        if(e.high===id)synergy+=e.highPerLow*this.s.producers[e.low];
      }
    }
    let rate=Big.of(p.baseRate).mul(mult).mul(1+synergy);
    if(id==='farmhand')rate=rate.add(this.handsBonus()*mult);
    rates.set(id,rate);return rate;
  }
  producerOutput(id:ProducerId):Big {return this.unitRate(id).mul(this.s.producers[id]).mul(this.permanentMult());}
  /** Multipliers that persist (no golden, festival or pest effects). */
  permanentMult():number {
    let flavour=0;
    for(const id of this.s.upgrades){const e=upgradeById.get(id)?.effect;if(e?.kind==='global')flavour+=e.pct;}
    return (1+flavour/100)*(1+this.butterPct()/100)*(1+this.s.seedsClaimed*PRESTIGE.bonusPerSeed)*(1+this.permPct('global')/100)
      *(1+this.gardenPct('production')/100)*(this.scarecrow('watchful')?1.05:1);
  }
  temporaryMult():number {
    return (this.s.golden.effects.bumper?GOLDEN.effects.bumper.mult:1)*(this.festival()?.production??1);
  }
  /** Production without temporary boosts or pest siphoning (used offline and for garden prices). */
  baseCps():Big {
    if(this.cache.base)return this.cache.base;
    let raw=Big.ZERO;
    for(const id of PRODUCER_IDS)if(this.s.producers[id])raw=raw.add(this.unitRate(id).mul(this.s.producers[id]));
    return this.cache.base=raw.mul(this.permanentMult());
  }
  /** Production including active boosts, before pests siphon their share. */
  cps():Big {return this.cache.cps??=this.baseCps().mul(this.temporaryMult());}
  siphonFraction():number {
    if(!this.cornpocalypseActive())return 0;
    return Math.min(0.9,this.s.pests.list.length*PESTS.siphon*(this.scarecrow('guard')?0.5:1));
  }
  /** What actually reaches the bank each second. */
  effectiveCps():Big {return this.cps().mul(1-this.siphonFraction());}
  clickMult():number {
    let mult=1;
    for(const id of this.s.upgrades){const e=upgradeById.get(id)?.effect;if(e?.kind==='click')mult*=e.mult;}
    for(const e of this.perm('click'))mult*=e.mult;
    return mult*(1+(this.gardenPct('click')+(this.scarecrow('flapper')?15:0))/100)*(this.festival()?.click??1);
  }
  clickCpsFraction():number {
    let f=0;
    for(const id of this.s.upgrades){const e=upgradeById.get(id)?.effect;if(e?.kind==='clickCps')f+=e.fraction;}
    for(const e of this.perm('clickCps'))f+=e.fraction;
    return f;
  }
  clickValue():Big {
    if(this.cache.click)return this.cache.click;
    let v=Big.of(1+this.handsBonus()).mul(this.clickMult()).add(this.cps().mul(this.clickCpsFraction()));
    if(this.s.golden.effects.storm)v=v.mul(GOLDEN.effects.storm.mult);
    return this.cache.click=v;
  }

  // ───────────── Prices and purchases ─────────────
  private producerDiscount(){return 1-this.permPct('producerDiscount')/100;}
  /** Price of the producer bought when `owned` are already owned. Ceiled while exact. */
  unitPrice(id:ProducerId,owned:number):Big {
    const raw=Big.fromLog10(Math.log10(producerById[id].baseCost*this.producerDiscount())+owned*LOG_GROWTH);
    return raw.e<15?Big.of(Math.ceil(raw.toNumber()-1e-9)):raw;
  }
  bulkCost(id:ProducerId,count:number):Big {
    const owned=this.s.producers[id];
    if(count<=0)return Big.ZERO;
    if(count<=300){let total=Big.ZERO;for(let i=0;i<count;i++)total=total.add(this.unitPrice(id,owned+i));return total;}
    // Geometric series: p0 (r^k − 1)/(r − 1).
    return this.unitPrice(id,owned).mul(Big.fromLog10(count*LOG_GROWTH).sub(1)).div(PRICE_GROWTH-1);
  }
  maxAffordable(id:ProducerId,budget:Big=this.s.kernels):number {
    const p0=this.unitPrice(id,this.s.producers[id]);
    if(budget.lt(p0))return 0;
    const x=budget.mul(PRICE_GROWTH-1).div(p0).add(1);
    const limit=1e6-this.s.producers[id];
    const estimate=Math.min(limit,Math.max(1,Math.floor(x.log10()/LOG_GROWTH)));
    if(estimate<=300){
      // Exact: accumulate ceiled unit prices until the budget runs out.
      let total=Big.ZERO,k=0;
      while(k<limit&&k<=301){const next=total.add(this.unitPrice(id,this.s.producers[id]+k));if(next.gt(budget))break;total=next;k++;}
      return k;
    }
    let k=estimate;
    while(k>0&&this.bulkCost(id,k).gt(budget))k--;
    return k;
  }
  /** Resolve a buy-amount choice to a concrete count (at least 1, for displaying a price). */
  quantity(id:ProducerId,amount:BuyAmount):number {return amount==='max'?Math.max(1,this.maxAffordable(id)):amount;}
  /** Production gained by buying `count` more of a producer, at current multipliers. */
  gainFor(id:ProducerId,count:number):Big {
    const before=this.baseCps();
    this.s.producers[id]+=count;this.touch();
    const after=this.baseCps();
    this.s.producers[id]-=count;this.touch();
    return after.sub(before).clampZero().mul(this.temporaryMult());
  }
  buyProducer(id:ProducerId,amount:BuyAmount):number {
    const count=amount==='max'?this.maxAffordable(id):amount;
    if(count<=0)return 0;
    const cost=this.bulkCost(id,count);
    if(!this.spend(cost))return 0;
    this.s.producers[id]+=count;this.s.run.producersBought+=count;this.s.life.producersBought+=count;
    this.touch();return count;
  }
  /** Removes kernels only when affordable; balances never go negative. */
  spend(cost:Big):boolean {
    if(cost.isNegative()||this.s.kernels.lt(cost))return false;
    this.s.kernels=this.s.kernels.sub(cost).clampZero();return true;
  }
  revealed(id:ProducerId):boolean {
    const index=PRODUCER_IDS.indexOf(id);
    return index===0||this.s.producers[id]>0||this.s.run.earned.gte(producerById[id].baseCost*0.35)||(index>0&&this.s.producers[PRODUCER_IDS[index-1]]>0&&this.s.kernels.gte(producerById[id].baseCost*0.35));
  }
  upgradePrice(u:Upgrade):Big {return Big.of(u.price*(1-this.permPct('upgradeDiscount')/100));}
  requirementMet(r:Requirement):boolean {
    switch(r.type){
      case 'owned':return this.s.producers[r.producer]>=r.count;
      case 'pair':return this.s.producers[r.low]>=r.count&&this.s.producers[r.high]>=r.count;
      case 'clicks':return this.s.run.clicks>=r.count;
      case 'earned':return this.s.run.earned.gte(r.amount);
      case 'golden':return this.s.life.golden>=r.count;
      case 'achievements':return this.s.achievements.size>=r.count;
    }
  }
  /** Progress 0..1 towards a requirement (for hints). */
  requirementProgress(r:Requirement):number {
    switch(r.type){
      case 'owned':return Math.min(1,this.s.producers[r.producer]/r.count);
      case 'pair':return Math.min(1,(Math.min(this.s.producers[r.low],r.count)+Math.min(this.s.producers[r.high],r.count))/(2*r.count));
      case 'clicks':return Math.min(1,this.s.run.clicks/r.count);
      case 'earned':return Math.min(1,Math.max(0,this.s.run.earned.log10()/Math.log10(r.amount)));
      case 'golden':return Math.min(1,this.s.life.golden/r.count);
      case 'achievements':return Math.min(1,this.s.achievements.size/r.count);
    }
  }
  availableUpgrades():Upgrade[] {
    return UPGRADES.filter(u=>!this.s.upgrades.has(u.id)&&this.requirementMet(u.req)).sort((a,b)=>a.price-b.price);
  }
  /** Locked upgrades that are closest to unlocking, for the "coming soon" row. */
  upcomingUpgrades(limit=3):Upgrade[] {
    return UPGRADES.filter(u=>!this.s.upgrades.has(u.id)&&!this.requirementMet(u.req)&&this.requirementProgress(u.req)>0.25&&
      (u.req.type!=='owned'&&u.req.type!=='pair'||this.revealed(u.req.type==='owned'?u.req.producer:u.req.high)))
      .sort((a,b)=>this.requirementProgress(b.req)-this.requirementProgress(a.req)||a.price-b.price).slice(0,limit);
  }
  buyUpgrade(id:string):boolean {
    const u=upgradeById.get(id);
    if(!u||this.s.upgrades.has(id)||!this.requirementMet(u.req))return false;
    if(!this.spend(this.upgradePrice(u)))return false;
    this.s.upgrades.add(id);this.s.run.upgradesBought++;this.s.life.upgradesBought++;
    if(u.effect.kind==='unlock'&&u.effect.feature==='festival'&&!this.s.festival.active)this.s.festival.next=Math.min(this.s.festival.next,240);
    if(u.effect.kind==='unlock'&&u.effect.feature==='cornpocalypse')this.s.pests.next=30;
    this.touch();return true;
  }

  // ───────────── Clicking ─────────────
  click(now=Date.now()):Big {
    const value=this.clickValue();
    this.earn(value);
    this.s.run.clicks++;this.s.life.clicks++;
    this.s.run.clickEarned=this.s.run.clickEarned.add(value);this.s.life.clickEarned=this.s.life.clickEarned.add(value);
    this.recentClicks.push(now);
    while(this.recentClicks.length&&now-this.recentClicks[0]>2000)this.recentClicks.shift();
    this.s.life.bestBurst=Math.max(this.s.life.bestBurst,this.recentClicks.length);
    return value;
  }
  private earn(amount:Big){
    this.s.kernels=this.s.kernels.add(amount);
    this.s.run.earned=this.s.run.earned.add(amount);this.s.life.earned=this.s.life.earned.add(amount);
  }

  // ───────────── Time ─────────────
  /** Advance to wall-clock time `now`. Returns the seconds credited. */
  tick(now:number):number {
    const elapsed=(now-this.s.lastTick)/1000;
    if(!Number.isFinite(elapsed)||elapsed<0){
      // The clock went backwards: credit nothing and continue from the new time.
      this.s.lastTick=now;if(elapsed<-2)this.events.push({type:'clock'});return 0;
    }
    this.s.lastTick=now;
    if(elapsed<=ACTIVE_GAP_SECONDS){this.advance(elapsed);return elapsed;}
    return this.away(elapsed);
  }
  /** Active play: everything runs at full rate in ≤1 s steps so effects expire mid-gap. */
  advance(seconds:number){
    let left=seconds;
    while(left>1e-9){const dt=Math.min(MAX_STEP,left);this.step(dt);left-=dt;}
  }
  private step(dt:number){
    const cps=this.cps(),siphon=this.siphonFraction();
    this.earn(cps.mul(dt*(1-siphon)));
    if(siphon>0){
      const share=cps.mul(dt*siphon/this.s.pests.list.length);
      for(const p of this.s.pests.list)p.stolen=p.stolen.add(share);
    }
    if(cps.gt(this.s.run.bestCps))this.s.run.bestCps=cps;
    if(cps.gt(this.s.life.bestCps))this.s.life.bestCps=cps;
    this.s.run.playSeconds+=dt;this.s.life.playSeconds+=dt;
    this.expireEffects(dt);
    this.goldenTimers(dt);
    this.festivalTimers(dt,true);
    this.pestTimers(dt);
    this.growGarden(dt);
    this.s.scarecrow.cooldown=Math.max(0,this.s.scarecrow.cooldown-dt);
  }
  private expireEffects(dt:number){
    for(const kind of ['bumper','storm'] as const){
      const e=this.s.golden.effects[kind];if(!e)continue;
      e.remaining-=dt;
      if(e.remaining<=0){delete this.s.golden.effects[kind];this.events.push({type:'effect-end',kind});this.touch();}
    }
  }
  /** Offline allowance in seconds and the fraction of base production paid while away. */
  offlineAllowance():{seconds:number;rate:number} {
    const hours=PRESTIGE.offlineBaseHours+this.perm('offlineHours').reduce((n,e)=>n+e.hours,0);
    const rate=Math.max(PRESTIGE.offlineBaseRate,...this.perm('offlineRate').map(e=>e.rate));
    return {seconds:hours*3600,rate};
  }
  /** Time away: base production at the offline rate up to the allowance; boosts tick down by real time. */
  away(seconds:number):number {
    const {seconds:allowance,rate}=this.offlineAllowance();
    const credited=Math.min(seconds,allowance);
    const earned=this.baseCps().mul(credited*rate);
    this.earn(earned);
    this.s.run.offlineEarned=this.s.run.offlineEarned.add(earned);this.s.life.offlineEarned=this.s.life.offlineEarned.add(earned);
    this.expireEffects(seconds);
    if(this.s.golden.onScreen){this.s.golden.onScreen=null;this.scheduleGolden();}
    this.festivalTimers(seconds,false);
    this.s.scarecrow.cooldown=Math.max(0,this.s.scarecrow.cooldown-seconds);
    // Garden growth continues for the credited time, in coarse steps.
    let left=credited;
    while(left>0){const dt=Math.min(GARDEN.mutationInterval,left);this.growGarden(dt);left-=dt;}
    this.s.lastOffline={seconds,earned,capped:seconds>allowance};
    this.s.life.offlineReturns++;
    this.events.push({type:'offline',seconds,earned,capped:seconds>allowance});
    this.touch();return credited;
  }

  // ───────────── Golden cobs ─────────────
  goldenFreqMult():number {
    let pct=this.permPct('goldenFreq')+this.gardenPct('goldenFreq')+(this.scarecrow('lucky')?15:0);
    for(const id of this.s.upgrades){const e=upgradeById.get(id)?.effect;if(e?.kind==='golden')pct+=e.freq*100;}
    return (1+pct/100)*(this.festival()?.goldenFreq??1);
  }
  goldenLife():number {
    let pct=this.permPct('goldenLife');
    for(const id of this.s.upgrades){const e=upgradeById.get(id)?.effect;if(e?.kind==='golden')pct+=e.life*100;}
    return GOLDEN.lifetime*(1+pct/100);
  }
  goldenDurationMult(kind:GoldenKind):number {
    let pct=this.permPct('goldenDuration')+this.gardenPct('goldenDuration');
    for(const id of this.s.upgrades){const e=upgradeById.get(id)?.effect;if(e?.kind==='golden')pct+=e.duration*100;}
    if(kind==='storm')pct+=this.permPct('stormDuration');
    return 1+pct/100;
  }
  private scheduleGolden(){this.s.golden.next=this.between(GOLDEN.minDelay,GOLDEN.maxDelay);}
  private pickGolden():GoldenKind {
    const entries=Object.entries(GOLDEN.effects) as [GoldenKind,{weight:number}][];
    let roll=this.random()*entries.reduce((n,[,e])=>n+e.weight,0);
    for(const [kind,e] of entries){roll-=e.weight;if(roll<0)return kind;}
    return 'lucky';
  }
  spawnGolden(){
    const life=this.goldenLife();
    this.s.golden.onScreen={x:this.between(0.08,0.82),y:this.between(0.18,0.78),life,maxLife:life,kind:this.pickGolden()};
    this.events.push({type:'golden-spawn'});
  }
  private goldenTimers(dt:number){
    const g=this.s.golden;
    if(g.onScreen){
      g.onScreen.life-=dt;
      if(g.onScreen.life<=0){g.onScreen=null;this.scheduleGolden();this.events.push({type:'golden-expired'});}
      return;
    }
    g.next-=dt*this.goldenFreqMult();
    if(g.next<=0)this.spawnGolden();
  }
  /**
   * Stacking: Lucky pays instantly using current (boosted) production. Bumper and Storm multiply
   * each other, but collecting an effect that is already running only refreshes its timer to the
   * longer of the two; the same multiplier never applies twice.
   */
  collectGolden():GameEvent|undefined {
    const g=this.s.golden.onScreen;if(!g)return undefined;
    this.s.golden.onScreen=null;
    this.s.run.golden++;this.s.life.golden++;
    let amount:Big|undefined;
    if(g.kind==='lucky'){
      amount=Big.min(this.s.kernels.mul(GOLDEN.luckyBankFraction),this.cps().mul(GOLDEN.luckySeconds)).add(GOLDEN.luckyFlat);
      this.earn(amount);
    }else{
      const duration=GOLDEN.effects[g.kind].duration*this.goldenDurationMult(g.kind);
      const current=this.s.golden.effects[g.kind];
      this.s.golden.effects[g.kind]={remaining:Math.max(current?.remaining??0,duration),duration:Math.max(current?.remaining??0,duration)};
    }
    this.touch();
    const twinChance=this.perm('goldenTwin').reduce((n,e)=>n+e.chance,0);
    const twin=twinChance>0&&this.random()<twinChance;
    if(twin)this.spawnGolden();else this.scheduleGolden();
    const event:GameEvent={type:'golden',kind:g.kind,amount,twin};
    this.events.push(event);return event;
  }

  // ───────────── Festivals ─────────────
  private festivalTimers(dt:number,active:boolean){
    if(!this.has('festival'))return;
    const f=this.s.festival;
    if(f.active){
      f.active.remaining-=dt;
      if(f.active.remaining<=0){const id=f.active.id;f.active=null;this.scheduleFestival();this.events.push({type:'festival-end',id});this.touch();}
    }else if(active){
      f.next-=dt;
      if(f.next<=0)this.startFestival();
    }
  }
  private scheduleFestival(){this.s.festival.next=this.between(FESTIVAL.minDelay,FESTIVAL.maxDelay)*(1-this.permPct('festivalFreq')/100);}
  startFestival(id?:FestivalId){
    const ids=Object.keys(FESTIVALS) as FestivalId[];
    const chosen=id??ids[Math.floor(this.random()*ids.length)];
    this.s.festival.active={id:chosen,remaining:FESTIVAL.duration};
    this.s.run.festivals++;this.s.life.festivals++;
    this.events.push({type:'festival-start',id:chosen});this.touch();
  }

  // ───────────── Scarecrow ─────────────
  setScarecrow(bonuses:ScarecrowBonus[]):boolean {
    if(!this.has('scarecrow')||this.s.scarecrow.cooldown>0)return false;
    const next=[...new Set(bonuses)].filter(b=>b in SCARECROW).slice(0,this.scarecrowSlots());
    if(next.join()===this.s.scarecrow.bonuses.join())return false;
    this.s.scarecrow={bonuses:next,cooldown:this.s.scarecrow.bonuses.length?SCARECROW_COOLDOWN:0};
    this.touch();return true;
  }

  // ───────────── Cornpocalypse ─────────────
  cornpocalypseActive(){return this.has('cornpocalypse')&&this.s.pests.enabled;}
  private pestTimers(dt:number){
    if(!this.cornpocalypseActive())return;
    const p=this.s.pests;
    if(p.list.length>=PESTS.max)return;
    p.next-=dt;
    if(p.next<=0){
      p.list.push({id:p.nextId++,stolen:Big.ZERO,angle:Math.floor(this.random()*360)});
      p.next=this.between(PESTS.minDelay,PESTS.maxDelay);
      this.events.push({type:'pest-spawn'});this.touch();
    }
  }
  /** Popping returns everything the pest siphoned, with interest. */
  popPest(id:number):Big|undefined {
    const index=this.s.pests.list.findIndex(p=>p.id===id);
    if(index<0)return undefined;
    const [pest]=this.s.pests.list.splice(index,1) as [Pest];
    const amount=pest.stolen.mul(PESTS.payout);
    this.earn(amount);this.s.run.pests++;this.s.life.pests++;
    this.events.push({type:'pest-pop',amount});this.touch();
    return amount;
  }
  popAllPests():Big {let total=Big.ZERO;for(const p of [...this.s.pests.list])total=total.add(this.popPest(p.id)??Big.ZERO);return total;}
  setCornpocalypse(enabled:boolean){
    if(!enabled)this.popAllPests();
    this.s.pests.enabled=enabled;if(enabled)this.s.pests.next=Math.max(this.s.pests.next,30);this.touch();
  }

  // ───────────── Garden ─────────────
  growthMult():number {return 1+(this.permPct('gardenGrowth')+(this.scarecrow('gardener')?30:0))/100;}
  mature(i:number):boolean {const p=this.s.garden.plots[i];return !!p&&p.age>=varietyById[p.v].growSeconds;}
  /** Growth stage 0..3 for artwork. */
  stage(i:number):0|1|2|3 {
    const p=this.s.garden.plots[i];if(!p)return 0;
    const f=p.age/varietyById[p.v].growSeconds;
    return f>=1?3:f>=0.55?2:f>=0.2?1:0;
  }
  plantCost(v:VarietyId):Big {return Big.max(Big.of(50),this.baseCps().mul(varietyById[v].plantSeconds)).floor();}
  harvestValue(i:number):Big {
    const p=this.s.garden.plots[i];if(!p||!this.mature(i))return Big.ZERO;
    return Big.max(Big.of(100),this.baseCps().mul(varietyById[p.v].harvestSeconds)).floor();
  }
  plant(i:number,v:VarietyId):boolean {
    if(!this.has('garden')||!this.plotActive(i)||this.s.garden.plots[i]||!this.s.garden.discovered.has(v))return false;
    if(!this.spend(this.plantCost(v)))return false;
    this.s.garden.plots[i]={v,age:0};this.s.life.planted++;this.touch();return true;
  }
  /** Harvests a mature plant for kernels, or clears an unripe one for nothing. */
  harvest(i:number):Big|undefined {
    const p=this.s.garden.plots[i];if(!p)return undefined;
    const value=this.harvestValue(i);
    this.s.garden.plots[i]=null;
    if(!value.isZero()){this.earn(value);this.s.run.harvests++;this.s.life.harvests++;}
    this.touch();return value;
  }
  private neighbours(i:number):number[] {
    const n=this.gardenSize(),x=i%4,y=Math.floor(i/4),out:number[]=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;
      if(nx>=0&&ny>=0&&nx<n&&ny<n)out.push(ny*4+nx);
    }
    return out;
  }
  /** Which varieties could sprout in empty plot i given its mature neighbours. */
  mutationCandidates(i:number):VarietyId[] {
    const counts=new Map<VarietyId,number>();
    for(const j of this.neighbours(i))if(this.mature(j)){const v=this.s.garden.plots[j]!.v;counts.set(v,(counts.get(v)??0)+1);}
    return VARIETIES.filter(v=>v.parents&&(v.parents[0]===v.parents[1]?(counts.get(v.parents[0])??0)>=2:counts.has(v.parents[0])&&counts.has(v.parents[1]))).map(v=>v.id);
  }
  private growGarden(dt:number){
    if(!this.has('garden'))return;
    const g=this.s.garden,mult=this.growthMult();
    let changed=false;
    g.plots.forEach((p,i)=>{if(p&&this.plotActive(i)){const was=this.mature(i);p.age+=dt*mult;if(!was&&this.mature(i))changed=true;}});
    if(changed)this.touch();
    g.mutationClock+=dt;
    while(g.mutationClock>=GARDEN.mutationInterval){
      g.mutationClock-=GARDEN.mutationInterval;
      for(let i=0;i<16;i++){
        if(!this.plotActive(i)||g.plots[i])continue;
        for(const v of this.mutationCandidates(i)){
          if(this.random()<varietyById[v].mutationChance){
            const discovered=!g.discovered.has(v);
            g.plots[i]={v,age:0};g.discovered.add(v);this.s.life.mutations++;
            this.events.push({type:'mutation',variety:v,plot:i,discovered});break;
          }
        }
      }
    }
  }

  // ───────────── Achievements and skins ─────────────
  achievementValue(a:Achievement):number {
    const c=a.check,s=this.s;
    switch(c.type){
      case 'clicks':return s.life.clicks;
      case 'clickEarned':return s.life.clickEarned.toNumber();
      case 'clickBurst':return s.life.bestBurst;
      case 'runEarned':return s.run.earned.toNumber();
      case 'lifeEarned':return s.life.earned.toNumber();
      case 'cps':return this.cps().toNumber();
      case 'own':return s.producers[c.producer];
      case 'ownTotal':return this.totalOwned();
      case 'golden':return s.life.golden;
      case 'upgrades':return s.run.upgradesBought;
      case 'replants':return s.life.replants;
      case 'seedsClaimed':return s.seedsClaimed;
      case 'harvests':return s.life.harvests;
      case 'mutations':return s.life.mutations;
      case 'discovered':return s.garden.discovered.size;
      case 'pests':return s.life.pests;
      case 'festivals':return s.life.festivals;
      case 'planted':return s.life.planted;
      case 'offline':return s.life.offlineReturns;
      case 'skinsChanged':return s.life.skinsChanged;
    }
  }
  achievementProgress(a:Achievement):number {
    const value=this.achievementValue(a),target=a.check.target;
    if(a.check.type==='runEarned'||a.check.type==='cps'||a.check.type==='clickEarned')return value<=1?0:Math.min(1,Math.log10(value)/Math.log10(target));
    return Math.min(1,value/target);
  }
  checkAchievements():string[] {
    const fresh:string[]=[];
    for(const a of ACHIEVEMENTS){
      if(this.s.achievements.has(a.id))continue;
      if(this.achievementValue(a)>=a.check.target){this.s.achievements.add(a.id);fresh.push(a.id);this.events.push({type:'achievement',id:a.id});}
    }
    if(fresh.length)this.touch();
    return fresh;
  }
  /** The unearned achievement closest to completion. */
  nextAchievement():Achievement|undefined {
    let best:Achievement|undefined,score=-1;
    for(const a of ACHIEVEMENTS){
      if(this.s.achievements.has(a.id)||a.secret)continue;
      if(a.check.type==='own'&&!this.revealed(a.check.producer))continue;
      const p=this.achievementProgress(a);if(p>score){score=p;best=a;}
    }
    return best;
  }
  skinUnlocked(id:SkinId):boolean {return this.s.achievements.size>=(SKINS.find(s=>s.id===id)?.achievements??Infinity);}
  setSkin(id:SkinId):boolean {
    if(!this.skinUnlocked(id)||this.s.skin===id)return false;
    this.s.skin=id;this.s.life.skinsChanged++;return true;
  }

  // ───────────── Prestige: Replant ─────────────
  static seedsFor(lifetimeEarned:Big):number {
    const ratio=lifetimeEarned.div(PRESTIGE.seedUnit);
    if(ratio.lt(1))return 0;
    return Math.floor(Big.fromLog10(ratio.log10()/3).toNumber()+1e-9);
  }
  /** Seeds the next Replant would award: every seed earned by lifetime production not already claimed. */
  seedsAvailable():number {return Math.max(0,CornGame.seedsFor(this.s.life.earned)-this.s.seedsClaimed);}
  /** Progress towards the next seed beyond those currently available. */
  nextSeedProgress():{progress:number;needed:Big} {
    const total=CornGame.seedsFor(this.s.life.earned),target=Math.max(total,this.s.seedsClaimed)+1;
    const lo=Big.of(Math.max(total,this.s.seedsClaimed)).pow(3).mul(PRESTIGE.seedUnit),hi=Big.of(target).pow(3).mul(PRESTIGE.seedUnit);
    const span=hi.sub(lo),done=this.s.life.earned.sub(lo).clampZero();
    return {progress:span.isZero()?0:Math.min(1,done.div(span).toNumber()),needed:hi.sub(this.s.life.earned).clampZero()};
  }
  /** Production bonus a Replant would give, as a multiplier relative to now. */
  replant():number {
    const claim=this.seedsAvailable();
    if(claim<1)return 0;
    const s=this.s;
    s.seeds+=claim;s.seedsClaimed+=claim;s.life.replants++;
    s.kernels=Big.ZERO;
    for(const id of PRODUCER_IDS)s.producers[id]=0;
    for(const e of this.perm('start'))for(const [id,n] of Object.entries(e.producers))s.producers[id as ProducerId]+=n??0;
    s.upgrades.clear();
    s.run=freshRun();
    s.golden={next:this.between(...GOLDEN.firstDelay),onScreen:null,effects:{}};
    s.festival={next:FESTIVAL.minDelay,active:null};
    s.pests={list:[],next:PESTS.minDelay,enabled:s.pests.enabled,nextId:s.pests.nextId};
    s.garden.plots=Array(16).fill(null);s.garden.mutationClock=0;
    s.scarecrow.cooldown=0;
    this.touch();return claim;
  }
  /** Everything except options is wiped. */
  hardReset(now:number){
    const options=this.s.options,tutorial=this.s.tutorial;
    this.s=freshState(now);this.s.options=options;this.s.tutorial=tutorial;this.touch();
  }
}
export {PRODUCERS,PERMS};
