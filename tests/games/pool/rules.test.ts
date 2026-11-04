import {describe,expect,it} from 'vitest';
import {createGame,nextRack,shoot,advance,placeCue,resolve,restoreGame,legalFirst,isOnEight,validPlacement,rackBalls,type PoolState} from '../../../src/games/pool/game';
import {R,L,W,HEAD_X,FOOT_X,emptyLog} from '../../../src/games/pool/physics';

const finish=(s:PoolState)=>{let n=0;while(s.phase==='moving'&&n++<100000)advance(s);};
/** Resolve a hand-made shot outcome. */
function judge(s:PoolState,log:Partial<ReturnType<typeof emptyLog>>,shooter:0|1=s.turn){
  s.phase='moving';s.shooter=shooter;s.onEight=!s.breakShot&&isOnEight(s,shooter);s.log={...emptyLog(),...log};
  for(const p of s.log.pots){s.balls[p.id].on=false;if(p.id&&!s.potted.includes(p.id))s.potted.push(p.id);}
  resolve(s);return s;
}
const midGame=(groups:PoolState['groups']=['solids','stripes'])=>{const s=createGame('two','medium',3);s.breakShot=false;s.hand=null;s.groups=groups;return s;};

describe('eight-ball rules',()=>{
  it('racks 15 balls in a tight triangle with the 8 in the middle and a solid and a stripe in the back corners',()=>{
    for(const seed of [1,2,3,99]){
      const b=rackBalls(seed);
      expect(new Set(b.map(x=>x.id)).size).toBe(16);
      expect(b.filter(x=>x.id&&x.x>=FOOT_X-.001).length).toBe(15);
      const eight=b[8];expect(Math.abs(eight.y-W/2)).toBeLessThan(.001);
      const back=b.filter(x=>x.id).sort((p,q)=>q.x-p.x).slice(0,5).sort((p,q)=>p.y-q.y);
      expect([back[0].id<8,back[4].id<8].sort()).toEqual([false,true]);
      for(let i=1;i<16;i++)for(let j=i+1;j<16;j++)expect(Math.hypot(b[i].x-b[j].x,b[i].y-b[j].y)).toBeGreaterThanOrEqual(2*R);
    }
  });
  it('breaks from the kitchen only, and a real break leaves an open table',()=>{
    const s=createGame('ai','medium',5);
    expect(s.hand).toBe('kitchen');
    expect(placeCue(s,HEAD_X+.1,W/2)).toBe(false);
    expect(placeCue(s,HEAD_X-.1,W/2-.1)).toBe(true);
    expect(shoot(s,{angle:Math.atan2(W/2-s.balls[0].y,FOOT_X-s.balls[0].x),power:1,spinX:0,spinY:0,called:null})).toBe(true);
    finish(s);
    expect(s.breakShot).toBe(false);expect(s.groups).toEqual([null,null]);
    expect(s.balls[8].on).toBe(true);
  });
  it('an illegal break re-racks for the opponent; a break scratch gives ball in hand behind the line',()=>{
    let s=createGame('two','medium',1);judge(s,{railBalls:[1,2],first:1});
    expect(s.turn).toBe(1);expect(s.breakShot).toBe(true);expect(s.hand).toBe('kitchen');expect(s.foul).toBe('Illegal break');
    s=createGame('two','medium',1);judge(s,{railBalls:[1,2,3,4,5],first:1,scratch:true,pots:[{id:0,pocket:0}]});
    expect(s.turn).toBe(1);expect(s.hand).toBe('kitchen');expect(s.breakShot).toBe(false);
    expect(s.balls[0].on).toBe(true);expect(s.balls[0].x).toBeLessThanOrEqual(HEAD_X);
  });
  it('re-spots the 8 when it drops on the break, clear of the cue ball, and the breaker shoots again',()=>{
    let s=createGame('two','medium',1);judge(s,{first:1,pots:[{id:8,pocket:2},{id:3,pocket:0}]});
    expect(s.balls[8].on).toBe(true);expect(s.turn).toBe(0);expect(s.potted).toEqual([3]);
    s=createGame('two','medium',1);Object.assign(s.balls[0],{x:FOOT_X+.01,y:W/2});
    judge(s,{first:1,pots:[{id:8,pocket:2}]});
    expect(s.turn).toBe(0);expect(Math.hypot(s.balls[8].x-s.balls[0].x,s.balls[8].y-s.balls[0].y)).toBeGreaterThanOrEqual(2*R);
  });
  it('assigns groups from the first legal pot after the break and keeps the turn',()=>{
    const s=midGame([null,null]);judge(s,{first:12,railAfterContact:true,pots:[{id:12,pocket:1},{id:3,pocket:4}]});
    expect(s.groups).toEqual(['stripes','solids']);expect(s.turn).toBe(0);expect(s.foul).toBeNull();
  });
  it('fouls: scratch, no contact, wrong ball first, 8 first on an open table, no cushion',()=>{
    const cases:[Partial<ReturnType<typeof emptyLog>>,string,PoolState['groups']][]=[
      [{first:2,scratch:true,pots:[{id:0,pocket:3}]},'Scratch',['solids','stripes']],
      [{first:null},'No ball hit',['solids','stripes']],
      [{first:10,railAfterContact:true},'Hit a stripe first',['solids','stripes']],
      [{first:8,railAfterContact:true},'Hit the 8 first',[null,null]],
      [{first:3,railAfterContact:false},'No cushion after contact',['solids','stripes']],
    ];
    for(const [log,foul,groups] of cases){
      const s=judge(midGame(groups),log);
      expect(s.foul).toBe(foul);expect(s.turn).toBe(1);expect(s.hand).toBe('table');expect(s.balls[0].on).toBe(true);
      expect(validPlacement(s,s.balls[0].x,s.balls[0].y)).toBe(true);
    }
  });
  it('a legal miss passes the turn; potting only the opponent’s ball also passes it',()=>{
    let s=judge(midGame(),{first:2,railAfterContact:true});expect(s.turn).toBe(1);expect(s.foul).toBeNull();expect(s.hand).toBeNull();
    s=judge(midGame(),{first:2,railAfterContact:true,pots:[{id:11,pocket:0}]});expect(s.turn).toBe(1);
  });
  it('the 8: wins in the called pocket, loses early, in the wrong pocket or with a foul',()=>{
    const onEight=()=>{const s=midGame();for(let i=1;i<=7;i++){s.balls[i].on=false;s.potted.push(i);}s.called=2;return s;};
    let s=onEight();expect(legalFirst(s)).toEqual([8]);expect(isOnEight(s)).toBe(true);
    judge(s,{first:8,pots:[{id:8,pocket:2}]});expect(s.phase).toBe('over');expect(s.winner).toBe(0);expect(s.wins).toEqual([1,0]);
    s=onEight();judge(s,{first:8,pots:[{id:8,pocket:5}]});expect(s.winner).toBe(1);expect(s.message).toMatch(/wrong pocket/);
    s=onEight();judge(s,{first:8,scratch:true,pots:[{id:8,pocket:2},{id:0,pocket:3}]});expect(s.winner).toBe(1);
    s=midGame();judge(s,{first:1,pots:[{id:8,pocket:2}]});expect(s.winner).toBe(1);expect(s.message).toMatch(/early/);
  });
  it('requires a called pocket when on the 8 and validates every shot input',()=>{
    const s=midGame();for(let i=1;i<=7;i++)s.balls[i].on=false;
    expect(shoot(s,{angle:0,power:.5,spinX:0,spinY:0,called:null})).toBe(false);
    expect(shoot(s,{angle:0,power:.5,spinX:0,spinY:0,called:6})).toBe(false);
    expect(shoot(s,{angle:NaN,power:.5,spinX:0,spinY:0,called:1})).toBe(false);
    expect(shoot(s,{angle:0,power:1.5,spinX:0,spinY:0,called:1})).toBe(false);
    expect(shoot(s,{angle:0,power:.5,spinX:1,spinY:1,called:1})).toBe(false);
    expect(shoot(s,{angle:0,power:.5,spinX:.6,spinY:.6,called:1})).toBe(true);
    expect(shoot(s,{angle:0,power:.5,spinX:0,spinY:0,called:1})).toBe(false);
  });
  it('ball in hand rejects overlaps, pockets and the cloth edge',()=>{
    const s=midGame();s.hand='table';const b=s.balls[5];
    expect(placeCue(s,b.x+R,b.y)).toBe(false);
    expect(placeCue(s,.01,.01)).toBe(false);
    expect(placeCue(s,R/2,W/2)).toBe(false);
    expect(placeCue(s,L/2,W/2)).toBe(true);
  });
  it('next rack alternates the break and keeps the match score',()=>{
    const s=createGame('ai','hard',8);s.wins=[2,1];const n=nextRack(s);
    expect(n.breaker).toBe(1);expect(n.turn).toBe(1);expect(n.wins).toEqual([2,1]);expect(n.rack).toBe(2);expect(n.difficulty).toBe('hard');
  });
  it('restores only well-formed saves, including mid-shot',()=>{
    const s=createGame('ai','easy',4);
    expect(restoreGame(JSON.parse(JSON.stringify(s)))).toEqual(s);
    shoot(s,{angle:0,power:.9,spinX:0,spinY:0,called:null});for(let i=0;i<200;i++)advance(s);
    const mid=restoreGame(JSON.parse(JSON.stringify(s)))!;expect(mid.phase).toBe('moving');
    finish(mid);finish(s);expect(mid).toEqual(s);
    const bad=(f:(x:any)=>void)=>{const c=JSON.parse(JSON.stringify(createGame()));f(c);return restoreGame(c);};
    expect(bad(c=>c.version=1)).toBeNull();
    expect(bad(c=>c.balls[3].x=NaN)).toBeNull();
    expect(bad(c=>c.balls.pop())).toBeNull();
    expect(bad(c=>c.groups=['solids','solids'])).toBeNull();
    expect(bad(c=>c.balls[1].vx=1)).toBeNull();
    expect(bad(c=>c.potted=[3])).toBeNull();
    expect(bad(c=>{c.balls[8].on=false;})).toBeNull();
    expect(bad(c=>c.message=5)).toBeNull();
    expect(restoreGame(null)).toBeNull();
    // An aim angle mid-swing (beyond ±π) is normalised rather than rejected.
    const swung=JSON.parse(JSON.stringify(createGame()));swung.aim.angle=5.28;
    expect(restoreGame(swung)!.aim.angle).toBeCloseTo(5.28-2*Math.PI);expect(restoreGame('x')).toBeNull();
  });
});
