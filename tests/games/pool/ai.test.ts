import {describe,expect,it} from 'vitest';
import {createGame,shoot,advance,placeCue,type PoolState} from '../../../src/games/pool/game';
import {planNow,candidates} from '../../../src/games/pool/ai';
import {R,L,W} from '../../../src/games/pool/physics';

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
