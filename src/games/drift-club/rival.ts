import {COURSES,START,TARGET,hasSpin,seatAt,slide,totals,type Match,type Puck,type Shot,type Spin} from './model';

/** The harbour pilot tries draws and takeouts using the same court and delivery limits as a human. */
export function chooseRivalShot(match:Match,pucks:readonly Puck[]):Shot{
  const course=COURSES[match.end],seat=seatAt(match.mode,match.shots.length);
  const targetAngles=new Set([0,-6,6,-14,14,-30,30]);
  for(const p of pucks){
    if(p.seat===seat)continue;
    targetAngles.add(Math.round(Math.atan2(p.x,START-p.z)*180/Math.PI));
  }
  let best:Shot={angle:0,power:62,spin:0},highest=-Infinity;
  for(const spin of [0,-1,1] as Spin[]){
    if(!hasSpin(match,spin))continue;
    for(const angle of targetAngles)for(const power of [59,65,72,82,96]){
      const shot={angle:Math.max(-46,Math.min(46,angle)),power,spin};
      const landed=slide(pucks,shot,seat,match.end,true)[0],scores=totals(landed,match.end);
      const puck=landed.at(-1)!,distance=Math.hypot(puck.x-course.targetX,puck.z-TARGET);
      const value=scores[seat]-scores[1-seat]-.045*distance-(spin?.22:0);
      if(value>highest){highest=value;best=shot;}
    }
  }
  return best;
}
