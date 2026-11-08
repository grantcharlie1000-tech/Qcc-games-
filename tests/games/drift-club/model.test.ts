import {describe,expect,it} from 'vitest';
import {COURSES,DEFAULT_SHOT,LENGTH,WIDTH,RADIUS,TARGET,capacity,endOver,fresh,hasSpin,points,readMatch,replay,seatAt,slide,totals,type Puck,type Shot} from '../../../src/games/drift-club/model';

const shot=(angle:number,power:number,spin:Shot['spin']=0):Shot=>({angle,power,spin});
const last=(track:Puck[][])=>track.at(-1)!;
describe('Drift Club tour',()=>{
  it('a takeout can reduce a settled score',()=>{
    const first=last(slide([],shot(0,59),0));
    expect(totals(first)).toEqual([5,0]);
    const next=last(slide(first,shot(0,75),1));
    expect(points(next[0])).toBe(1);
    expect(totals(next).reduce((a,b)=>a+b)).toBe(4);
  });
  it('banks, gates and the final ring each contribute to the same shot',()=>{
    const [p]=last(slide([],shot(-28,96),0,2));
    expect(p.bonus).toBe(3);expect(points(p,2)).toBe(8);
    expect(points({...p,z:3},2)).toBe(0);
  });
  it('curl changes lateral movement in opposite directions and deterministic replay restores positions',()=>{
    const l=last(slide([],shot(0,60,-1),0))[0],r=last(slide([],shot(0,60,1),0))[0];
    expect(l.x).toBeLessThan(-.4);expect(r.x).toBeCloseTo(-l.x);
    const m=fresh();m.shots=[shot(0,60,-1),shot(4,76)];
    expect(replay(m)).toEqual(last(slide([l],m.shots[1],0)));
  });
  it('a curl is limited per player per court and the hammer rotates',()=>{
    const m=fresh('duel');
    m.shots=[shot(0,60,-1)];expect(hasSpin(m,-1)).toBe(true);
    m.shots.push(shot(0,60));expect(hasSpin(m,-1)).toBe(false);
    expect(readMatch({...m,shots:[...m.shots,shot(1,60,-1)]})).toBeNull();
    while(m.shots.length<8)m.shots.push(shot(0,60));
    expect(endOver(m)).toBe(true);m.end++;
    expect(seatAt(m.mode,8)).toBe(1);expect(seatAt(m.mode,16)).toBe(0);expect(hasSpin(m,-1)).toBe(true);
    expect(replay(m)).toEqual([]);
  });
  it('rejects invalid persisted or wire histories before simulating',()=>{
    for(const input of [null,{}, {...fresh(),end:2},{...fresh(),shots:Array(5).fill(DEFAULT_SHOT)},{...fresh(),shots:[shot(70,60)]},{...fresh(),shots:[shot(0,Infinity)]},{...fresh(),shots:[{angle:1,power:50,spin:4}]}])expect(readMatch(input)).toBeNull();
    expect(readMatch(fresh())).toEqual(fresh());expect(capacity('duel')).toBe(8);
  });
  it('all courses contain the same four scoring bands around their own target',()=>{
    for(const [i,course] of COURSES.entries())for(const [offset,n] of [[0,8],[1,5],[2,3],[3,1],[4,0]])expect(points({x:course.targetX+offset,z:TARGET,seat:0,bonus:0},i)).toBe(n);
  });
  it('high-speed bank shots resolve to bounded finite positions in all three courses',()=>{
    for(const i of [0,1,2])for(const angle of [-46,-17,0,19,46]){
      const frames=slide([],shot(angle,100,1),0,i);
      expect(frames.length).toBeLessThan(260);
      for(const [p] of frames){expect(Math.abs(p.x)).toBeLessThanOrEqual(WIDTH-RADIUS+.001);expect(Math.abs(p.z)).toBeLessThanOrEqual(LENGTH-RADIUS+.001);}
    }
  });
});
