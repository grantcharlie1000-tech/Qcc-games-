import {describe,expect,it} from 'vitest';
import {createGame,shoot,advance,placeCue,type PoolState} from '../../../src/games/pool/game';
import {planNow,candidates} from '../../../src/games/pool/ai';
import {R,L,W} from '../../../src/games/pool/physics';
import {layouts,scenario} from './ai-scenarios';

const play=(s:PoolState)=>{const p=planNow(s);if(p.place)expect(placeCue(s,p.place.x,p.place.y)).toBe(true);expect(shoot(s,p)).toBe(true);while(s.phase==='moving')advance(s);return p;};
const table=(cue:[number,number],others:[number,number,number][],groups:PoolState['groups']=['solids','stripes'],difficulty:PoolState['difficulty']='hard')=>{
  const s=createGame('ai',difficulty,11);s.breakShot=false;s.hand=null;s.groups=groups;s.turn=1;
  for(const b of s.balls){b.on=false;}
  Object.assign(s.balls[0],{x:cue[0],y:cue[1],on:true});
  for(const [id,x,y] of others)Object.assign(s.balls[id],{x,y,on:true});
  s.potted=s.balls.filter(b=>!b.on&&b.id).map(b=>b.id);
  return s;
};

describe('computer opponent',()=>{
  it('finishes a hanging eight instead of deliberately fouling, including ball in hand',()=>{
    for(const difficulty of ['easy','medium','hard'] as const)for(const hand of [null,'table'] as const){
      let wins=0;
      for(const seed of [11,7301,81799,118796]){
        const s=table([.328,.309],[[8,1.919,.029]],['solids','stripes'],difficulty);
        s.seed=seed;s.hand=hand;
        const p=play(s);
        expect(p.called,`${difficulty}, hand ${hand}`).toBe(2);
        if(s.winner===1)wins++;
        if(difficulty==='hard'){
          expect(s.foul,`hard, hand ${hand}`).toBeNull();
          expect(s.winner,`hard, hand ${hand}`).toBe(1);
        }
      }
      // Easy/Medium may make execution errors; they must still choose the pot
      // and be able to finish, rather than selecting a no-contact foul forever.
      expect(wins,`${difficulty}, hand ${hand}`).toBeGreaterThan(0);
    }
  });
  it.each([
    {pocket:0,cx:1.652,cy:.309,x:.061,y:.029},
    {pocket:1,cx:.99,cy:.7,x:.99,y:.029},
    {pocket:2,cx:.328,cy:.309,x:1.919,y:.029},
    {pocket:3,cx:1.652,cy:.681,x:.061,y:.961},
    {pocket:4,cx:.99,cy:.29,x:.99,y:.961},
    {pocket:5,cx:.328,cy:.681,x:1.919,y:.961},
  ])('hard calls and pots a hanging eight in pocket $pocket',({pocket,cx,cy,x,y})=>{
    for(const hand of [null,'table'] as const){
      const s=table([cx,cy],[[8,x,y]]);s.hand=hand;
      const p=play(s);
      expect(p.called).toBe(pocket);
      expect(s.foul).toBeNull();expect(s.winner).toBe(1);
    }
  });
  it('does not spoil a simulated hard pot into a no-cushion foul',()=>{
    for(const name of ['straight-corner','called-eight']){
      const layout=layouts.find(l=>l.name===name)!;
      const s=scenario(layout,'hard',118796);
      play(s);
      expect(s.foul,name).toBeNull();
      expect(s.winner===1||s.turn===1,name).toBe(true);
    }
  });
  it('easy makes routine pots consistently while remaining beatable',()=>{
    let pots=0;
    for(const layout of layouts.filter(l=>l.tier==='routine'))for(let i=0;i<16;i++){
      const s=scenario(layout,'easy',11+i*7919);play(s);
      if(!s.foul&&(s.winner===1||s.turn===1))pots++;
    }
    expect(pots).toBeGreaterThanOrEqual(52);
    expect(pots).toBeLessThanOrEqual(72);
  },20000);
  it('medium controls routine shot speed across another seed set',()=>{
    let pots=0;
    for(const layout of layouts.filter(l=>l.tier==='routine'))for(let i=0;i<16;i++){
      const s=scenario(layout,'medium',100003+i*7919);play(s);
      if(!s.foul&&(s.winner===1||s.turn===1))pots++;
    }
    expect(pots).toBeGreaterThanOrEqual(72);
  },20000);
  it('medium can make precision pots without hard-level perfection',()=>{
    let pots=0;
    for(const layout of layouts.filter(l=>l.tier==='precision'))for(let i=0;i<16;i++){
      const s=scenario(layout,'medium',100003+i*7919);play(s);
      if(!s.foul&&(s.winner===1||s.turn===1))pots++;
    }
    expect(pots).toBeGreaterThanOrEqual(40);
    expect(pots).toBeLessThanOrEqual(64);
  },20000);
  it('finds and makes a straightforward pot on hard',()=>{
    // Stripe 10 sits in front of the top-right corner pocket, eight elsewhere.
    const s=table([1.2,.5],[[10,1.7,.25],[8,.4,.7],[3,.6,.2]]);
    expect(candidates(s.balls,s.balls[0],[10]).length).toBeGreaterThan(0);
    play(s);
    expect(s.balls[10].on).toBe(false);expect(s.foul).toBeNull();expect(s.turn).toBe(1);
  });
  it('calls the pocket it shoots the 8 into, and wins',()=>{
    const s=table([1.2,.5],[[8,1.7,.25],[3,.6,.2]]);
    const p=play(s);
    expect(p.called).not.toBeNull();expect(s.phase).toBe('over');expect(s.winner).toBe(1);
  });
  it('plays a legal safety when nothing is pottable and never picks an illegal first ball',()=>{
    // Its only ball is frozen to the end rail with the cue ball far away.
    const s=table([.3,.5],[[12,L-R-.0005,W/2],[2,.9,.5],[8,1.4,.15]]);
    play(s);
    expect(s.foul).toBeNull();
  });
  it('places ball in hand somewhere legal and useful',()=>{
    const s=table([1,.5],[[9,1.6,.3],[1,.5,.3],[8,.9,.8]]);s.hand='table';
    const p=planNow(s);expect(p.place).not.toBeNull();
    play(s);expect(s.balls[9].on).toBe(false);
  });
  it('plays whole racks to a finish at every level',()=>{
    for(const difficulty of ['easy','medium','hard'] as const){
      const s=createGame('two',difficulty,21);let shots=0;
      while(s.phase!=='over'&&shots++<160)play(s);
      expect(s.phase).toBe('over');
    }
  },60000);
});
