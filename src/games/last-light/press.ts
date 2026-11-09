import type {Hazard} from './levels';
export function pressState(h:Hazard,t:number){
 const period=h.period??3.2,phase=(((t+(h.offset??0))%period+period)%period)/period;
 // Safe pause, an amber charge, a fast fall, a grounded impact, slow retraction.
 const warning=phase>=.36&&phase<.52;
 const extension=phase<.52?0:phase<.6?(phase-.52)/.08:phase<.73?1:1-(phase-.73)/.27;
 return {phase,warning,extension:Math.max(0,Math.min(1,extension)),impact:phase>=.6&&phase<.66};
}
export function pressAt(h:Hazard,t:number){return {x:h.x,y:h.y+pressState(h,t).extension*(h.travel??94),w:h.w,h:18};}
