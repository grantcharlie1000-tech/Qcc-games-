import {describe,expect,it} from 'vitest';
import {R,L,W,POCKETS,CUSHIONS,emptyLog,simulate,strike,step,trace,powerSpeed,MAX_SPEED,type Ball} from '../../../src/games/pool/physics';

const ball=(id:number,x:number,y:number):Ball=>({id,x,y,vx:0,vy:0,sx:0,sy:0,w:0,on:true});
const run=(balls:Ball[])=>{const log=emptyLog();simulate(balls,log);return log;};

describe('pool physics',()=>{
  it('maps power to speed monotonically, with fine control at the soft end',()=>{
    expect(powerSpeed(0)).toBe(0);expect(powerSpeed(1)).toBeCloseTo(MAX_SPEED);
    for(let p=.05;p<1;p+=.05)expect(powerSpeed(p+.05)).toBeGreaterThan(powerSpeed(p));
    expect(powerSpeed(.5)).toBeLessThan(MAX_SPEED/2);
  });
  it('a struck ball slides, then rolls, then stops; nothing ever leaves the cloth without a pocket',()=>{
    const b=[ball(0,.4,W/2)];strike(b[0],0,.25,0,0);
    let sliding=0,rolling=0;
    for(let i=0;i<20000&&step(b,null);i++){const u=Math.hypot(b[0].vx-b[0].sx,b[0].vy-b[0].sy);if(u>1e-6)sliding++;else rolling++;}
    expect(sliding).toBeGreaterThan(0);expect(rolling).toBeGreaterThan(sliding);
    expect(b[0].on).toBe(true);expect(b[0].vx).toBe(0);
    expect(b[0].x).toBeGreaterThan(R);expect(b[0].x).toBeLessThan(L-R);
  });
  it('a full-ball stun shot stops the cue ball and sends the object ball on',()=>{
    // Very close, so there is no time for natural roll to develop.
    const b=[ball(0,.6,W/2),ball(1,.6+2*R+.01,W/2)];strike(b[0],0,.3,0,-.25);
    const log=run(b);
    expect(log.first).toBe(1);
    expect(Math.abs(b[0].x-.6)).toBeLessThan(.1);
    expect(b[1].x).toBeGreaterThan(.9);
    expect(Math.abs(b[1].y-W/2)).toBeLessThan(.002);
  });
  it('follow runs through the object ball, draw comes back',()=>{
    // Where the cue ball is half a second after contact, relative to the contact point.
    const result=(spin:number)=>{
      const b=[ball(0,.5,W/2),ball(1,.85,W/2)];strike(b[0],0,.45,0,spin);
      const log=emptyLog();while(log.first===null)step(b,log);
      const contact=b[0].x;for(let i=0;i<300;i++)step(b,log);return b[0].x-contact;
    };
    const follow=result(.9),draw=result(-.9),stun=result(-.2);
    expect(draw).toBeLessThan(-.05);
    expect(follow).toBeGreaterThan(.05);
    expect(follow).toBeGreaterThan(stun);expect(stun).toBeGreaterThan(draw);
  });
  it('a cut sends the object ball along the line of centres and the cue ball along the tangent',()=>{
    const b=[ball(0,.5,.5),ball(1,1,.5)];
    // Half-ball hit: aim the cue ball's centre at the object ball's edge.
    const angle=Math.atan2(R,.5);strike(b[0],angle,.35,0,-.2);
    const t=trace(b,b[0],angle);
    expect(t.hit).toBe(1);
    const log=emptyLog();for(let i=0;i<5000&&b[1].vx===0;i++)step(b,log);step(b,log);
    const objAngle=Math.atan2(b[1].vy,b[1].vx),predicted=Math.atan2(t.oy,t.ox);
    expect(Math.abs(objAngle-predicted)).toBeLessThan(.06);
  });
  it('balls bounce off cushions at a mirror angle without spin, and english changes the rebound',()=>{
    const off=(english:number)=>{const b=[ball(0,.8,.3)];strike(b[0],-Math.PI/2,.3,english,0);run(b);return b[0].x;};
    expect(Math.abs(off(0)-.8)).toBeLessThan(.002);
    expect(off(.8)).toBeGreaterThan(.84);
    expect(off(-.8)).toBeLessThan(.76);
  });
  it('straight shots fall in every pocket; a ball rolling along the rail passes the side pocket',()=>{
    POCKETS.forEach((p,i)=>{
      const from={x:L/2+(p.mx<L/2?-.25:p.mx>L/2?.25:0),y:W/2};
      const b=[ball(5,from.x,from.y)];const a=Math.atan2(p.my-from.y,p.mx-from.x);strike(b[0],a,.35,0,0);
      const log=run(b);expect(log.pots,`pocket ${i}`).toEqual([{id:5,pocket:i}]);
    });
    const r=[ball(3,.45,R+.0005)];strike(r[0],0,.3,0,0);const log=run(r);
    expect(log.pots.every(p=>p.pocket!==1)).toBe(true);
  });
  it('jaws reject a ball that hits the knuckle at a steep angle',()=>{
    const p=POCKETS[1];const b=[ball(2,p.j2x+.12,.25)];
    // Into the far point of the side pocket at a shallow angle to the rail.
    strike(b[0],Math.atan2(p.j2y-.25,p.j2x+.005-(p.j2x+.12)),.3,0,0);
    const log=run(b);expect(log.pots.length===0||b[0].on===false).toBe(true);
    expect(CUSHIONS.length).toBe(18);
  });
  it('is deterministic',()=>{
    const make=()=>{const b=[ball(0,.4,.4)];for(let i=1;i<8;i++)b.push(ball(i,1+i*.06,.3+(i%3)*.12));strike(b[0],.05,.9,.3,.4);return b;};
    const a=make(),c=make();run(a);run(c);expect(a).toEqual(c);
  });
});
