import {describe,it,expect} from 'vitest';
import {createFlight,flap,advance,restoreFlight,gateAt,visibleGates,STEP,BIRD_X,RADIUS,FLOOR,GATE_WIDTH} from '../../../src/games/flappy-bird/model';

describe('Flappy Bird original reed flight',()=>{
  it('starts on an explicit flap, rises, falls, and freezes after loss',()=>{
    const s=createFlight(42);advance(s,1);expect(s.tick).toBe(0);
    flap(s);advance(s,.1);expect(s.y).toBeLessThan(260);
    advance(s,2);expect(s.phase).toBe('over');const frozen={...s};flap(s);advance(s,1);expect(s).toEqual(frozen);
  });
  it('replays the same actions at 30, 60 and 144 render Hz',()=>{
    const runs=[30,60,144].map(hz=>{const s=createFlight(17);flap(s);for(let beat=0;beat<2;beat++){flap(s);for(let i=0;i<hz/2;i++)advance(s,1/hz);}return s;});
    expect(runs[0].phase).toBe('running');expect(runs[0].tick).toBe(120);expect(runs[0]).toEqual(runs[1]);expect(runs[1]).toEqual(runs[2]);
  });
  it('generates reproducible bounded gates with enough travel time and variation',()=>{
    const centers=new Set<number>();for(let seed=1;seed<=64;seed++)for(let i=0;i<100;i++){
      const g=gateAt(seed,i),next=gateAt(seed,i+1);expect(g).toEqual(gateAt(seed,i));
      expect(g.top).toBeGreaterThanOrEqual(70);expect(g.bottom).toBeLessThanOrEqual(FLOOR-60);
      expect(g.bottom-g.top).toBeGreaterThanOrEqual(150-1e-10);expect(Math.abs(next.center-g.center)).toBeLessThanOrEqual(60);
      expect(next.distance-g.distance-GATE_WIDTH).toBeGreaterThan(150);centers.add(g.center);
    }expect(centers.size).toBeGreaterThan(100);
  });
  it('a simple timed pilot clears 100 seeded gates using the real simulation',()=>{
    for(const seed of [1,8,42,0xffffffff]){
      const s=createFlight(seed);flap(s);
      for(let i=0;i<25000&&s.score<100&&s.phase==='running';i++){
        const target=visibleGates(s).find(g=>g.x+GATE_WIDTH>=BIRD_X-RADIUS)!;
        if(s.y>target.center+22&&s.vy>0)flap(s);
        advance(s,STEP);
      }
      expect(s.phase,`seed ${seed} score ${s.score}`).toBe('running');expect(s.score).toBe(100);
    }
  });
  it('collides with both gate ends and scores only fully cleared gates once',()=>{
    const s=createFlight(1);flap(s);const g=gateAt(1,0);
    s.tick=Math.floor((g.distance-BIRD_X-RADIUS)/135/STEP);s.y=g.top-8;s.vy=0;advance(s,.04);expect(s.phase).toBe('over');
    const low=createFlight(1);flap(low);low.tick=Math.floor((g.distance-BIRD_X-RADIUS)/135/STEP);low.y=g.bottom+8;advance(low,.04);expect(low.phase).toBe('over');
    const pass=createFlight(1);flap(pass);pass.tick=Math.ceil((g.distance+GATE_WIDTH-BIRD_X+RADIUS)/135/STEP);pass.y=g.center;pass.vy=0;advance(pass,STEP);expect(pass.score).toBe(1);advance(pass,STEP);expect(pass.score).toBe(1);
  });
  it('round trips a fractional frame and rejects malformed or contradictory saves',()=>{
    const s=createFlight(99);flap(s);advance(s,.123);const copy=restoreFlight(JSON.parse(JSON.stringify(s)))!;expect(copy).toEqual(s);
    for(let i=0;i<10;i++){advance(copy,STEP);advance(s,STEP);}expect(copy).toEqual(s);
    for(const value of [null,{}, {...s,seed:0},{...s,y:NaN},{...s,tick:1.5},{...s,score:100},{...s,phase:'oops'},{...s,accumulator:1}])expect(restoreFlight(value)).toBeNull();
  });
});

it('lets a diagonal near miss pass the rounded reed corner without a false collision',()=>{
  const s=createFlight(1);flap(s);const gate=gateAt(1,0);
  // The center moves from (407.75, top+4) to (408.875, top+6.53125).
  // Both the endpoints and the entire segment stay >12px from the corner at (420,top).
  s.tick=270;s.y=gate.top+4;s.vy=300;advance(s,STEP);expect(s.phase).toBe('running');
});
