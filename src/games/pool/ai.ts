/**
 * Computer opponent. It lists makeable pots geometrically (ghost-ball aim, clear lanes, cut and pocket-entry
 * angles), then plays the most promising ones through the real physics with several speeds and spins and keeps
 * the result with the best outcome and cue-ball position. Without a pot it plays a safety that leaves the
 * opponent the hardest next shot. Difficulty sets how many options it explores and how accurately it strikes.
 * `plan` is a generator so the game can spread the work across animation frames.
 */
import {R,L,W,HEAD_X,POCKETS,segmentDistance,simulate,emptyLog,powerSpeed,strike,type Ball} from './physics';
import {legalFirst,validPlacement,isOnEight,groupOf,rng,other,type PoolState,type ShotInput} from './game';

export interface Plan extends ShotInput{place:{x:number;y:number}|null;target:number|null}
interface Candidate{angle:number;target:number;pocket:number;ease:number;dist:number;travel:number;cut:number}

const MU_ROLL_G=.015*9.81;
const laneClear=(balls:readonly Ball[],ax:number,ay:number,bx:number,by:number,ignore:number[],width=2*R-.001)=>
  !balls.some(b=>b.on&&!ignore.includes(b.id)&&segmentDistance(b.x,b.y,ax,ay,bx,by)<width);

/** Where to send an object ball for a pocket: a little inside the mouth. */
function pocketAim(p:typeof POCKETS[number]){return {x:p.mx+p.dx*.012,y:p.my+p.dy*.012};}

/** Makeable pots for the shooter from the cue ball's current spot. */
export function candidates(balls:readonly Ball[],cue:{x:number;y:number},targets:readonly number[]):Candidate[]{
  const out:Candidate[]=[];
  for(const id of targets){
    const b=balls[id];if(!b.on)continue;
    for(let p=0;p<POCKETS.length;p++){
      const pocket=POCKETS[p],aim=pocketAim(pocket);
      let tx=aim.x-b.x,ty=aim.y-b.y;const travel=Math.hypot(tx,ty);tx/=travel;ty/=travel;
      // Entry angle: side pockets accept a narrow range, corners a wide one.
      const entry=-(tx*pocket.dx+ty*pocket.dy);
      if(entry>-(pocket.side?.55:.35))continue;
      const gx=b.x-tx*2*R,gy=b.y-ty*2*R;
      if(gx<R*.9||gx>L-R*.9||gy<R*.9||gy>W-R*.9)continue;
      let cx=gx-cue.x,cy=gy-cue.y;const dist=Math.hypot(cx,cy);if(dist<1e-6)continue;cx/=dist;cy/=dist;
      const cut=cx*tx+cy*ty;if(cut<.2)continue;
      if(!laneClear(balls,cue.x,cue.y,gx,gy,[0,id]))continue;
      if(!laneClear(balls,b.x,b.y,aim.x,aim.y,[0,id],2*R-.004))continue;
      // Thicker, shorter shots into wider openings are easier.
      const ease=cut*cut*(pocket.side?.85:1)/(1+dist*.9+travel*1.3);
      out.push({angle:Math.atan2(cy,cx),target:id,pocket:p,ease,dist,travel,cut});
    }
  }
  return out.sort((a,b)=>b.ease-a.ease);
}
/** Cue power that sends the object ball comfortably past the pocket mouth. */
function powerFor(c:Candidate,extra=1){
  // Rolling speed needed at the object ball, carried back through the cut and the cue ball's own roll.
  const need=Math.sqrt(2*MU_ROLL_G*(c.travel+.35))*1.25/Math.max(.3,c.cut);
  const cue=Math.sqrt(need*need+2*MU_ROLL_G*c.dist)*1.2*extra;
  // Invert the eased power curve.
  let lo=0,hi=1;for(let i=0;i<24;i++){const mid=(lo+hi)/2;if(powerSpeed(mid)<cue)lo=mid;else hi=mid;}
  return Math.max(.08,Math.min(1,hi));
}

/** Heuristic value of the best pot available from a cue position: 0 (nothing) to about 1. */
export function bestEase(balls:readonly Ball[],cue:{x:number;y:number},targets:readonly number[]){
  const c=candidates(balls,cue,targets);return c.length?c[0].ease:0;
}

function score(s:PoolState,plan:Plan):number{
  const player=s.turn,copy=JSON.parse(JSON.stringify(s)) as PoolState;
  const balls=copy.balls;
  if(plan.place)Object.assign(balls[0],{x:plan.place.x,y:plan.place.y,on:true});
  const onEight=!s.breakShot&&isOnEight(s);
  const legal=new Set(legalFirst(s));
  const log=emptyLog();
  // Strike exactly like the game does.
  strike(balls[0],plan.angle,plan.power,plan.spinX,plan.spinY);
  simulate(balls,log,25);
  const pots=log.pots.filter(p=>p.id!==0);
  const foul=log.scratch||log.first===null||!legal.has(log.first)||(!pots.length&&!log.railAfterContact);
  const eight=pots.find(p=>p.id===8);
  if(eight)return !foul&&onEight&&eight.pocket===plan.called?1000:-1000;
  if(foul)return -300;
  const group=s.groups[player];
  const mine=group??(pots.find(p=>groupOf(p.id))?groupOf(pots.find(p=>groupOf(p.id))!.id):null);
  const own=pots.filter(p=>mine&&groupOf(p.id)===mine).length;
  if(own){
    // Value the leave: the best next pot from where the cue ball stopped.
    copy.groups=[...s.groups] as PoolState['groups'];
    if(!group&&mine){copy.groups[player]=mine;copy.groups[other(player)]=mine==='solids'?'stripes':'solids';}
    const next=legalFirst(copy,player);
    const leave=next.length?bestEase(balls,balls[0],next):.5;
    return 200+own*20+leave*120;
  }
  // Safety: the less the opponent can see, the better.
  const theirs=s.groups[other(player)];
  const oppTargets=theirs?balls.filter(b=>b.on&&groupOf(b.id)===theirs).map(b=>b.id):balls.filter(b=>b.on&&b.id!==0&&b.id!==8).map(b=>b.id);
  const opp=bestEase(balls,balls[0],oppTargets.length?oppTargets:[8]);
  return -40-opp*160;
}

const ACCURACY={easy:{angle:.022,power:.12,options:3,variants:2,think:.9},medium:{angle:.0075,power:.06,options:5,variants:4,think:.8},hard:{angle:.0016,power:.025,options:8,variants:7,think:.7}} as const;
export const thinkTime=(s:PoolState)=>ACCURACY[s.difficulty].think;

export function* plan(s:PoolState):Generator<void,Plan>{
  const settings=ACCURACY[s.difficulty],random=rng((s.seed^Math.imul(s.shots+1,2654435761))>>>0);
  const targets=legalFirst(s);
  const onEight=!s.breakShot&&isOnEight(s);
  const cue=s.balls[0];
  // The break: hard and square into the apex, from a spot slightly off-centre.
  if(s.breakShot){
    const place=s.hand?{x:HEAD_X-.02,y:W/2+(random()-.5)*.18}:null;
    const from=place??cue,apex=s.balls.filter(b=>b.on&&b.id!==0).reduce((a,b)=>b.x<a.x?b:a);
    const angle=Math.atan2(apex.y-from.y,apex.x-from.x)+(random()-.5)*settings.angle;
    return {angle,power:s.difficulty==='easy'?.85:1,spinX:0,spinY:-.1,called:null,place,target:apex.id};
  }
  // Ball in hand: choose the spot with the easiest pot, preferring a little angle for position.
  let place:Plan['place']=null;
  if(s.hand){
    let best={x:cue.x,y:cue.y,v:-1};
    const xs=s.hand==='kitchen'?11:22,ys=11;
    for(let i=0;i<xs;i++){
      for(let j=0;j<ys;j++){
        const x=(s.hand==='kitchen'?R+.02+(HEAD_X-R-.03)*i/(xs-1):R+.03+(L-2*R-.06)*i/(xs-1)),y=R+.03+(W-2*R-.06)*j/(ys-1);
        if(!validPlacement(s,x,y))continue;
        const c=candidates(s.balls,{x,y},targets)[0];
        const v=c?c.ease*(c.cut>.97?.9:1):0;
        if(v>best.v)best={x,y,v};
      }
      yield;
    }
    place={x:best.x,y:best.y};
  }
  const from=place??cue;
  const balls=place?s.balls.map(b=>b.id===0?{...b,x:from.x,y:from.y}:b):s.balls;
  const options=candidates(balls,from,targets).slice(0,settings.options);
  const spins:[number,number][]=[[0,0],[0,.5],[0,-.5],[0,.9],[0,-.9],[.5,0],[-.5,0]];
  const powers=[1,1.4,.8,1.9];
  let best:Plan|null=null,bestScore=-Infinity;
  const consider=(p:Plan)=>{const v=score(s,p);if(v>bestScore){bestScore=v;best=p;}};
  for(const c of options){
    for(let k=0;k<settings.variants;k++){
      const [spinX,spinY]=spins[k%spins.length],extra=powers[Math.floor(k/2)%powers.length];
      consider({angle:c.angle,power:powerFor(c,extra),spinX,spinY,called:onEight?c.pocket:null,place,target:c.target});
      yield;
    }
  }
  // Nothing worth potting: try safeties and kicks at every legal ball.
  if(bestScore<150){
    for(const id of targets){
      const b=balls[id];if(!b.on)continue;
      const direct=Math.atan2(b.y-from.y,b.x-from.x),d=Math.hypot(b.x-from.x,b.y-from.y),cutRange=Math.asin(Math.min(1,2*R/d))*.85;
      for(const off of [0,-.5,.5,-.85,.85])for(const power of [.32,.45]){
        consider({angle:direct+off*cutRange,power,spinX:0,spinY:0,called:onEight?0:null,place,target:id});
        yield;
      }
    }
    if(bestScore<-250){
      // Hidden: sweep the table for a one-rail kick.
      for(const power of [.55,.8])for(let i=0;i<120;i++){consider({angle:i*Math.PI/60,power,spinX:0,spinY:0,called:onEight?0:null,place,target:null});yield;}
    }
  }
  const chosen:Plan=best??{angle:0,power:.5,spinX:0,spinY:0,called:onEight?0:null,place,target:null};
  // Human-like error, seeded so replays and tests are repeatable.
  const gauss=()=>{let t=0;for(let i=0;i<4;i++)t+=random();return (t-2)/.58;};
  return {...chosen,angle:chosen.angle+gauss()*settings.angle,power:Math.max(.05,Math.min(1,chosen.power*(1+gauss()*settings.power)))};
}
/** Run a plan to completion synchronously (tests and tooling). */
export function planNow(s:PoolState):Plan{const g=plan(s);for(;;){const r=g.next();if(r.done)return r.value;}}
