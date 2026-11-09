import type {Goal,Hazard,Setting} from './levels';

/** Geometry is written in travel order. Each token is x,y,width,surface,
 * optional travel and speed; surfaces are s/c/m/l/b/i/>/<. Branch ledges
 * follow the main route in the resulting level and never hold objectives. */
export interface CampaignRoute {
 setting:Setting;
 goal:Goal;
 route:string;
 branches:string;
 /** Three branch-relative platform indices carrying optional memories. */
 memories:readonly [number,number,number];
 /** Main-route platform index and an in-world destination name. */
 stations:readonly (readonly [number,string])[];
 checkpoints:readonly number[];
 sectors:readonly (readonly [number,string])[];
 hazards:readonly HazardPlacement[];
 pressure?:number;
 wind?:number;
}
export interface HazardPlacement {
 ledge:number;
 at:number;
 kind:Hazard['kind'];
 height:number;
 width:number;
 travel?:number;
 period?:number;
 offset?:number;
 disabledBy?:number;
 duty?:number;
}
export const spike=(ledge:number,at=.5,width=26):HazardPlacement=>({ledge,at,kind:'spikes',height:10,width});
export const steam=(ledge:number,at=.5,height=88,offset=0,period=3.2,disabledBy?:number,duty?:number):HazardPlacement=>({ledge,at,kind:'steam',height,width:18,period,offset,disabledBy,duty});
export const laser=(ledge:number,at=.5,height=110,offset=0,period=3.4,disabledBy?:number,duty?:number):HazardPlacement=>({ledge,at,kind:'laser',height,width:18,period,offset,disabledBy,duty});
export const saw=(ledge:number,at=.5,travel=26,offset=0,period=3):HazardPlacement=>({ledge,at,kind:'saw',height:24,width:24,travel,period,offset});
