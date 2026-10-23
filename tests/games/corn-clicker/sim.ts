/** A simple player bot used by the pacing tests and the balancing script. */
import {CornGame} from '../../../src/games/corn-clicker/model';
import {PRODUCERS,type ProducerId} from '../../../src/games/corn-clicker/data';
import {Big} from '../../../src/games/corn-clicker/big';
import {freshState} from '../../../src/games/corn-clicker/state';

export interface SimOptions {seconds:number;clicksPerSecond:number;game?:CornGame;golden?:boolean;garden?:boolean;log?:(t:number,g:CornGame)=>void}
export interface SimResult {game:CornGame;firstProducer:number;purchases:number[];firstGarden:number;seedTimes:Record<number,number>}

/** Buys the best payback item every simulated second; clicks golden cobs when `golden`. */
export function simulate(o:SimOptions):SimResult {
  // A fixed RNG seed keeps golden cobs and garden rolls, and so the pacing assertions, reproducible.
  const g=o.game??new CornGame(freshState(0,1),0);
  let now=g.s.lastTick,firstProducer=-1,firstGarden=-1,clickDebt=0;
  const purchases:number[]=[],seedTimes:Record<number,number>={};
  for(let t=1;t<=o.seconds;t++){
    now+=1000;
    clickDebt+=o.clicksPerSecond;
    for(;clickDebt>=1;clickDebt--)g.click(now);
    g.tick(now);
    if(o.golden&&g.s.golden.onScreen)g.collectGolden();
    // An obsessive gardener: harvest everything ripe and replant the best-paying known variety.
    if(o.garden&&g.has('garden'))for(let i=0;i<16;i++){
      if(!g.plotActive(i))continue;
      if(g.s.garden.plots[i]&&g.mature(i))g.harvest(i);
      if(!g.s.garden.plots[i])g.plant(i,g.s.garden.discovered.has('candy')?'candy':'sweet');
    }
    g.checkAchievements();
    // Buy loop: pick the cheapest-payback option among producers and upgrades.
    for(let guard=0;guard<50;guard++){
      const cps=g.effectiveCps().add(Big.of(o.clicksPerSecond).mul(g.clickValue()));
      let best:{score:number;buy:()=>boolean}|undefined;
      for(const p of PRODUCERS){
        if(!g.revealed(p.id))continue;
        const cost=g.unitPrice(p.id,g.s.producers[p.id]);
        const gain=g.gainFor(p.id,1);
        if(gain.isZero())continue;
        const score=cost.div(gain).toNumber()+Math.max(0,cost.sub(g.s.kernels).div(cps).toNumber());
        if(!best||score<best.score)best={score,buy:()=>g.buyProducer(p.id as ProducerId,1)>0};
      }
      for(const u of g.availableUpgrades()){
        const price=g.upgradePrice(u);
        // Approximate an upgrade's value by trying it.
        const before=cps;g.s.upgrades.add(u.id);g.touch();
        const after=g.effectiveCps().add(Big.of(o.clicksPerSecond).mul(g.clickValue()));
        g.s.upgrades.delete(u.id);g.touch();
        const gain=after.sub(before);
        const feature=u.effect.kind==='unlock'||u.effect.kind==='golden';
        // Treat a feature or golden upgrade as worth roughly a 25% production boost.
        const score=feature?price.div(cps.mul(0.25)).toNumber()+Math.max(0,price.sub(g.s.kernels).div(cps).toNumber()):gain.lte(0)?Infinity:price.div(gain).toNumber()+Math.max(0,price.sub(g.s.kernels).div(cps).toNumber());
        if(!best||score<best.score)best={score,buy:()=>g.buyUpgrade(u.id)};
      }
      if(!best||!best.buy())break;
      purchases.push(t);
      if(firstProducer<0&&g.totalOwned()>0)firstProducer=t;
      if(firstGarden<0&&g.has('garden'))firstGarden=t;
    }
    const seeds=g.seedsAvailable();
    for(const n of [1,5,10,25,50,100])if(seeds>=n&&seedTimes[n]===undefined)seedTimes[n]=t;
    o.log?.(t,g);
  }
  return {game:g,firstProducer,purchases,firstGarden,seedTimes};
}
