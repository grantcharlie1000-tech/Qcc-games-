import {capacity,endOver,fresh,points,courseIndex,seatAt,slide,totals,type Match,type Puck} from './model';
export interface Logbook {best:number;masterBest:number;bank:boolean;gate:boolean;pilot:boolean;masterFinished:boolean}
export const newBook=():Logbook=>({best:0,masterBest:0,bank:false,gate:false,pilot:false,masterFinished:false});
export const masterOpen=(b:Logbook)=>b.best>=24||b.pilot;
export const medal=(n:number)=>n>=60?'Gold':n>=42?'Silver':n>=24?'Bronze':'';
export function readBook(value:unknown):Logbook {
  const b=newBook();if(!value||typeof value!=='object')return b;
  const v=value as Record<string,unknown>;
  for(const k of ['best','masterBest'] as const)if(typeof v[k]==='number'&&Number.isInteger(v[k])&&v[k]>=0&&v[k]<=132)b[k]=v[k];
  for(const k of ['bank','gate','pilot','masterFinished'] as const)b[k]=v[k]===true;
  return b;
}
export function recordDelivery(b:Logbook,m:Match,p:Puck,scores:number[]){
  if(m.mode==='duel')return;
  if(p.seat===0 && points(p,courseIndex(m))>0){if(p.bonus&1)b.bank=true;if(p.bonus&2)b.gate=true;}
  if(m.end!==2||!endOver(m))return;
  if(m.mode==='solo')b.best=Math.max(b.best,scores[0]);
  if(m.mode==='rival'&&scores[0]>scores[1])b.pilot=true;
  if(m.mode==='master'){b.masterFinished=true;b.masterBest=Math.max(b.masterBest,scores[0]);}
}
/** Accepted shots are durable even when a player leaves during the animation. */
export function recoverProgress(book:Logbook,match:Match){
  if(match.mode==='duel')return;
  const prefix=fresh(match.mode),carried=[0,0];
  let court:Puck[]=[];
  for(const shot of match.shots){
    if(endOver(prefix)){
      const done=totals(court,courseIndex(prefix));
      carried[0]+=done[0];carried[1]+=done[1];court=[];prefix.end++;
    }
    const owner=seatAt(prefix.mode,prefix.shots.length);
    court=slide(court,shot,owner,courseIndex(prefix),true)[0];prefix.shots.push(shot);
    const score=prefix.shots.length===capacity(prefix.mode)*3?totals(court,courseIndex(prefix)):[0,0];
    recordDelivery(book,prefix,court.at(-1)!,[carried[0]+score[0],carried[1]+score[1]]);
  }
}
