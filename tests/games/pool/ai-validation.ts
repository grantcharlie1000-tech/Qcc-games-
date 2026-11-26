import {planNow} from '../../../src/games/pool/ai';
import {advance,createGame,placeCue,shoot,type Difficulty,type PoolState} from '../../../src/games/pool/game';

function play(s:PoolState){
  const p=planNow(s);
  if(p.place&&!placeCue(s,p.place.x,p.place.y))throw new Error('Invalid placement');
  if(!shoot(s,p))throw new Error('Invalid shot');
  let steps=0;while(s.phase==='moving'&&steps++<30000)advance(s);
  if(s.phase==='moving')throw new Error('Unfinished shot');
}

/** Held-out whole racks, alternating seats with player 0 breaking. No layout filters. */
export function runValidation(){
  const rows:{stronger:Difficulty;weaker:Difficulty;seed:number;strongerSeat:number;winner:Difficulty|null;shots:number;fouls:number;foulRate:number;maxConsecutiveFouls:number;stalled:boolean;earlyLoss:boolean;finished:boolean}[]=[];
  const pairs:readonly (readonly [Difficulty,Difficulty])[]=[['medium','easy'],['hard','medium'],['hard','easy']];
  for(const [stronger,weaker] of pairs)for(const seed of [7301,29123,81799])for(const seat of [0,1]){
    const s=createGame('two','hard',seed,1,[0,0],0);
    const levels:readonly Difficulty[]=seat===0?[stronger,weaker]:[weaker,stronger];
    let fouls=0,consecutiveFouls=0,maxConsecutiveFouls=0,earlyLoss=false;
    while(s.phase!=='over'&&s.shots<160){
      s.difficulty=levels[s.turn];play(s);
      if(s.foul){fouls++;consecutiveFouls++;}else consecutiveFouls=0;
      maxConsecutiveFouls=Math.max(maxConsecutiveFouls,consecutiveFouls);
    }
    if(s.phase==='over'&&s.foul)earlyLoss=true;
    const foulRate=fouls/s.shots,stalled=maxConsecutiveFouls>=6||foulRate>.5;
    rows.push({stronger,weaker,seed,strongerSeat:seat,winner:s.winner===null?null:levels[s.winner],shots:s.shots,fouls,foulRate,maxConsecutiveFouls,stalled,earlyLoss,finished:s.phase==='over'});
  }
  return {summary:{passed:rows.every(r=>r.finished&&!r.stalled),racks:rows.length,finished:rows.filter(r=>r.finished).length,stalled:rows.filter(r=>r.stalled).length,totalFouls:rows.reduce((n,r)=>n+r.fouls,0),maxConsecutiveFouls:Math.max(...rows.map(r=>r.maxConsecutiveFouls)),maxShots:Math.max(...rows.map(r=>r.shots)),maxFoulRate:Math.max(...rows.map(r=>r.foulRate)),pairs:pairs.map(([stronger,weaker])=>{
    const games=rows.filter(r=>r.stronger===stronger&&r.weaker===weaker);
    return {stronger,weaker,wins:games.filter(r=>r.winner===stronger).length,losses:games.filter(r=>r.winner===weaker).length,unfinished:games.filter(r=>!r.finished).length};
  })},rows};
}
