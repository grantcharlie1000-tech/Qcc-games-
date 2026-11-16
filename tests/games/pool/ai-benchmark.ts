import {plan} from '../../../src/games/pool/ai';
import {advance,placeCue,shoot,type Difficulty} from '../../../src/games/pool/game';
import {layouts,scenario} from './ai-scenarios';

// Frozen before production edits: calibration bands are design goals, not a
// claim that these labels correspond to measured human pool ratings.
const bands={easy:{routine:[.65,.9],precision:[.15,.5]},medium:{routine:[.9,1],precision:[.5,.8]},hard:{routine:[.98,1],precision:[.8,1]}} satisfies Record<Difficulty,Record<string,number[]>>;
export function runBenchmark(heldOut=false,validationSeed?:number){
  const rows=[];
  for(const difficulty of ['easy','medium','hard'] as const){
    for(const layout of layouts)for(let i=0;i<16;i++){
      const seed=(validationSeed??(heldOut?100003:11))+i*7919;
      const s=scenario(layout,difficulty,seed),before=JSON.stringify(s);
      const start=performance.now(),job=plan(s);let yields=0,maxSliceMs=0;
      let next;
      do{const slice=performance.now();next=job.next();maxSliceMs=Math.max(maxSliceMs,performance.now()-slice);yields++;}while(!next.done);
      const ms=performance.now()-start,p=next.value;
      if(JSON.stringify(s)!==before)throw new Error('Planner mutated live state');
      if(p.place&&!placeCue(s,p.place.x,p.place.y))throw new Error('Invalid placement');
      if(!shoot(s,p))throw new Error('Invalid shot');
      let steps=0;while(s.phase==='moving'&&steps++<30000)advance(s);
      if(s.phase==='moving')throw new Error('Unfinished shot');
      const success=s.foul===null&&(s.winner===1||s.turn===1);
      rows.push({difficulty,layout:layout.name,tier:layout.tier,seed,success,foul:s.foul,loss:s.winner===0,ms,maxSliceMs,yields,shot:p});
    }
  }
  const calibration=[];let squaredError=0;
  for(const difficulty of ['easy','medium','hard'] as const)for(const tier of ['routine','precision'] as const){
    const samples=rows.filter(r=>r.difficulty===difficulty&&r.tier===tier),rate=samples.filter(r=>r.success).length/samples.length;
    const [lo,hi]=bands[difficulty][tier],distance=Math.max(0,lo-rate,rate-hi);
    squaredError+=distance*distance;
    calibration.push({difficulty,tier,pots:samples.filter(r=>r.success).length,n:samples.length,rate,band:[lo,hi],fouls:samples.filter(r=>r.foul).length,losses:samples.filter(r=>r.loss).length});
  }
  const times=rows.map(r=>r.ms).sort((a,b)=>a-b);
  return {summary:{heldOut,seedBase:validationSeed??(heldOut?100003:11),shots:rows.length,calibrationError:Math.sqrt(squaredError/6),calibration,plannerMs:{p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1)},maxSliceMs:Math.max(...rows.map(r=>r.maxSliceMs))},rows};
}
