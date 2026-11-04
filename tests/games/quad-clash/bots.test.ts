import {describe,expect,test} from 'vitest';
import {createMatch,standings} from '../../../src/games/quad-clash/sim';
import {createAi,stepWithBots,think} from '../../../src/games/quad-clash/bots';
import {STEP,type Difficulty,type ModeId} from '../../../src/games/quad-clash/config';
import type {MapId} from '../../../src/games/quad-clash/map';
import {duel,face} from './helpers';
import {navFor,nearestNode} from '../../../src/games/quad-clash/nav';
import {worldFor} from '../../../src/games/quad-clash/sim';

function botMatch(mode:ModeId,map:MapId,difficulty:Difficulty,seed:number,seconds:number){
  const m=createMatch({mode,map,difficulty,primary:'bell',seed});
  const ais=m.fighters.map(f=>createAi(f.id));
  let stuck=0,steps=0;const last=m.fighters.map(f=>[f.x,f.z]);
  while(!m.over&&steps<seconds/STEP){
    stepWithBots(m,ais,STEP,undefined,true);m.events.length=0;steps++;
    if(steps%60===0)m.fighters.forEach((f,i)=>{if(f.alive&&Math.hypot(f.x-last[i][0],f.z-last[i][1])<0.25&&!ais[i].visible)stuck++;last[i]=[f.x,f.z];});
  }
  return {m,stuck,seconds:steps*STEP};
}

describe('bots',()=>{
  test('identical seeds and inputs give identical matches',()=>{
    const a=botMatch('brawl','quad','normal',42,20).m,b=botMatch('brawl','quad','normal',42,20).m;
    expect(a.fighters.map(f=>[f.x,f.y,f.z,f.kills,f.health])).toEqual(b.fighters.map(f=>[f.x,f.y,f.z,f.kills,f.health]));
  });
  test.each([['brawl','quad'],['house','field'],['quad','quad'],['quad','field'],['brawl','campus'],['house','campus'],['quad','campus']] as const)('a %s match on %s plays out: bots move, fight and rarely get stuck',(mode,map)=>{
    const {m,stuck,seconds}=botMatch(mode,map,'normal',7,300);
    const kills=m.fighters.reduce((n,f)=>n+f.kills,0);
    expect(kills).toBeGreaterThan(20);
    // Fewer than 2% of fighter-seconds spent stationary away from a fight.
    expect(stuck/(seconds*m.fighters.length)).toBeLessThan(0.02);
    expect(standings(m)[0].kills).toBeGreaterThan(3);
    if(mode==='quad')expect(m.teamScores[0]+m.teamScores[1]).toBeGreaterThan(15);
  },30000);
  test('a bot that has reached a lost target location searches another area',()=>{
    const m=createMatch({mode:'house',map:'campus',difficulty:'normal',primary:'bell',seed:7});
    m.t=10;const f=m.fighters[1],ai=createAi(1);f.x=-5.5;f.y=0;f.z=25.5;
    ai.target=4;ai.lastSeen=10;ai.lastX=f.x;ai.lastY=f.y;ai.lastZ=f.z;ai.thinkAt=99;
    const nav=navFor(worldFor(m)),current=nearestNode(nav,f.x,f.y,f.z)!;
    think(m,f,ai,STEP);
    expect(ai.goal).not.toBe(current.id);expect(ai.path.length).toBeGreaterThan(1);
  });
  test('harder bots win more fights than easy bots',()=>{
    const score=(d:Difficulty)=>{let k=0;for(let s=1;s<=3;s++){const {m}=botMatch('brawl','quad',d,s,90);k+=m.fighters.reduce((n,f)=>n+f.kills,0)/m.t;}return k;};
    expect(score('hard')).toBeGreaterThan(score('easy'));
  },30000);
  test('a bot that sees you turns toward you and opens fire after its reaction time',()=>{
    const m=duel({keep:[0,1]});const [you,bot]=m.fighters;face(m,bot,you,15);
    bot.yaw=0.4;
    const ai=createAi(1);let firedAt=-1;
    for(let i=0;i<120&&firedAt<0;i++){const it=think(m,bot,ai,STEP);bot.yaw=it.yaw;bot.pitch=it.pitch;m.t+=STEP;if(it.fire)firedAt=m.t;}
    expect(ai.target).toBe(0);
    expect(firedAt).toBeGreaterThan(0.5);
    expect(Math.abs(bot.yaw)).toBeLessThan(0.25);
  });
  test('bots in Hold the Quad head for the zone',()=>{
    const {m}=botMatch('quad','field','easy',3,40);
    expect(m.teamScores[0]+m.teamScores[1]).toBeGreaterThan(0);
  },30000);
});
