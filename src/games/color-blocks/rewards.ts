import type {Breakdown,PlaceResult} from './model';
export const PRAISE=['','Good!','Great!','Excellent!','Amazing!'];
/** Compact explanation of one move's points, listing only the terms that applied. */
export function describeBreakdown(b:Breakdown):string{
 const terms:[number,string][]=[[b.placement,b.placement===1?'block':'blocks'],[b.lines,'lines'],[b.combo,'combo'],[b.colours,'colour'],[b.allClear,'all clear']];
 return terms.filter(([v])=>v>0).map(([v,label])=>`${v} ${label}`).join(' + ');
}
/** Reward priority: all-clear / new best, then colour, then combo, then praise. One primary, the rest merged. */
export function rewardLabel(r:Pick<PlaceResult,'lines'|'colorsGone'|'allClear'|'gained'>,combo:number,newBest:boolean):{primary:string;secondary:string;big:boolean}|null{
 const parts:string[]=[];
 if(newBest)parts.push('New best!');
 if(r.allClear)parts.push('All clear!');
 if(r.colorsGone.length)parts.push(r.colorsGone.length===1?'Colour gone!':`${r.colorsGone.length} colours gone!`);
 if(r.lines&&combo>1)parts.push(`Combo ${combo}`);
 if(r.lines&&!parts.length)parts.push(PRAISE[Math.min(4,r.lines)]);
 if(!parts.length)return null;
 return {primary:parts[0],secondary:[...parts.slice(1,3),`+${r.gained}`].join(' · '),big:newBest||r.allClear||r.colorsGone.length>1||r.lines>=3};
}
