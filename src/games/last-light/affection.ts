import type {Run} from './model';
export const PET_DURATION=1.25;
export interface Petting {platform:number;x:number;y:number;started:number}
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
/** Reach, three gentle strokes, then return to the standing pose. */
export function petPose(s:Run,reduced:boolean){
 if(!s.pet)return null;
 const age=Math.max(0,s.clock-s.pet.started),reach=clamp(age/.22),recover=clamp((PET_DURATION-age)/.22);
 const weight=Math.min(reach,recover),contact=age>=.22&&age<1.05?1:0;
 return {age,weight,contact,stroke:reduced?0:contact*Math.sin((age-.22)*Math.PI*7.2),facing:Math.sign(s.pet.x-(s.x+8))||s.facing};
}
