import type {Hazard,Platform,Surface} from './levels';

type Ledge=number|'b0'|'b1'|'b2'|'b3';
interface Placement {ledge:Ledge;at:number;kind:Hazard['kind'];height:number;width:number;travel?:number;period?:number;offset?:number}
interface SurfaceChange {ledge:Ledge;kind:Surface;axis?:'x'|'y';travel?:number;speed?:number;direction?:number}
interface Challenge {surfaces?:SurfaceChange[];hazards:Placement[];shift?:[Ledge,number,number][];pressure?:number;wind?:number}
const spike=(ledge:Ledge,at:number,width=24):Placement=>({ledge,at,kind:'spikes',height:10,width});
const steam=(ledge:Ledge,at:number,height=72,offset=0,period=3.2):Placement=>({ledge,at,kind:'steam',height,width:16,period,offset});
const laser=(ledge:Ledge,at:number,height=96,offset=0,period=3.2):Placement=>({ledge,at,kind:'laser',height,width:16,period,offset});
const saw=(ledge:Ledge,at:number,travel=22,offset=0,period=2.8):Placement=>({ledge,at,kind:'saw',height:24,width:24,travel,period,offset});
const surface=(ledge:Ledge,kind:Surface,direction=1):SurfaceChange=>({ledge,kind,direction});
const mover=(ledge:Ledge,axis:'x'|'y',travel:number,speed:number):SurfaceChange=>({ledge,kind:'moving',axis,travel,speed});

/** Each encounter has an approach, a commitment and a quiet landing. Hazards
 * are anchored to authored ledges instead of periodically skipping mission
 * platforms. Fractions are hazard centres; saw travel is its full amplitude.
 * Tall vents/gates ask for a readable off-phase, low teeth for jump control.
 * The final ledge, spawn and mission interaction centres stay clear. */
const CHALLENGES:readonly Challenge[]=[
 // Old Quarter: movement, ferry timing, then short jump and crumble decisions.
 {hazards:[]},
 {hazards:[]},
 {surfaces:[mover(1,'x',28,.9)],hazards:[spike(2,.65)]},
 {hazards:[spike(1,.38),spike(5,.65)]},
 {hazards:[spike(2,.62),spike('b2',.5)],pressure:88},
 {surfaces:[surface('b1','crumble')],hazards:[spike(1,.38),spike(3,.65)]},
 {surfaces:[surface('b1','crumble')],hazards:[spike(1,.38),spike(3,.68)]},
 {surfaces:[surface('b1','crumble')],hazards:[spike(1,.38),spike(3,.65)]},
 // Mossworks: spring trajectories and branch commitment; the first vent has
 // a stationary approach before the factory's independent shuttle and lift.
 {surfaces:[surface('b0','crumble')],hazards:[spike(1,.32),spike(3,.85),spike('b1',.25)]},
 {surfaces:[surface(1,'crumble'),surface('b1','spring')],hazards:[spike(2,.65),spike(3,.65)]},
 {surfaces:[surface('b0','crumble')],hazards:[spike(3,.42),spike(5,.65),spike('b1',.25)]},
 {surfaces:[surface('b0','crumble'),surface('b2','spring')],hazards:[spike(2,.65),spike(4,.65),spike('b1',.25)]},
 {shift:[[2,120,0],[3,90,0],[4,50,0]],surfaces:[surface('b1','crumble')],hazards:[spike(2,.65),spike(4,.68),spike('b2',.5)],pressure:104},
 {surfaces:[mover(1,'x',32,1),mover(3,'y',32,1.1)],hazards:[steam(2,.85,72,.8),steam('b0',.5,64,2),spike('b2',.25)]},
 {surfaces:[surface(3,'spring')],hazards:[spike(1,.32),steam(2,.65,64,1.5),spike('b1',.25)]},
 {surfaces:[surface(1,'crumble'),surface('b1','spring')],hazards:[spike(3,.65),steam(5,.65,72,.7),spike(6,.5)]},
 // Clockworks: each mechanism gets a safe reading ledge, then two mechanisms
 // appear in sequence. Offsets stagger gates instead of synchronizing a wall.
 {surfaces:[surface('b1','crumble')],hazards:[steam(1,.45,72,.9),steam(3,.65,80,2.1),saw('b2',.45,16)]},
 {shift:[[1,140,0],[2,130,0],[3,120,0],['b2',70,0]],surfaces:[mover(2,'y',34,1.05),mover('b0','x',32,1.1)],hazards:[steam(1,.28,72,.4),steam(3,.65,80,1.9),saw(5,.18,16),spike('b1',.25)]},
 {surfaces:[surface('b0','crumble')],hazards:[steam(1,.28,72,.9),steam(2,.65,80,2),saw('b2',.5,18)]},
 {surfaces:[surface('b0','crumble')],hazards:[steam(2,.7,80,1.7),saw(4,.83,12),steam('b2',.65,32,.4)],pressure:116},
 {surfaces:[surface('b1','crumble')],hazards:[steam(1,.28,80,.5),steam(3,.65,80,2),saw(4,.65,20),spike('b3',.25)]},
 {surfaces:[mover(1,'x',40,1.1),mover(3,'x',36,1.3),surface('b0','belt')],hazards:[steam(2,.65,80,.7),steam(4,.85,72,2.1),saw('b2',.4,20)]},
 {surfaces:[mover(2,'y',34,1.15),surface('b0','belt',-1)],hazards:[steam(1,.28,80,.6),saw(3,.6,20),steam('b1',.25,64,2)]},
 {surfaces:[surface('b0','crumble')],hazards:[steam(1,.28,80,.6),steam(3,.5,80,2.2),saw(5,.6,28),steam(6,.65,80,1.1),spike('b1',.25)]},
 // Frostline: read a gate before entering ice, brake on broad landings, then
 // combine that momentum with shuttles, falling ledges and exposed wind.
 {surfaces:[surface('b1','crumble')],hazards:[laser(1,.5,96,.5),laser(2,.65,88,2.1),saw(3,.62,22),spike('b2',.5)]},
 {surfaces:[surface('b0','crumble')],hazards:[laser(1,.28,96,.6),laser(3,.7,96,2.2),saw('b2',.5,22)]},
 {surfaces:[surface('b0','ice'),surface('b1','crumble')],hazards:[laser(1,.28,96,.6),steam(3,.65,60,2),saw(5,.18,18),spike('b1',.25)]},
 {surfaces:[surface('b1','crumble')],hazards:[laser(1,.28,88,.8),spike(2,.65),saw(4,.83,12),laser('b2',.65,88,2.2)],pressure:128},
 {surfaces:[mover(1,'x',36,1.15),mover(3,'x',40,1.3),surface('b0','ice'),surface('b1','crumble')],hazards:[laser(2,.65,80,.7),laser(4,.85,88,2.2),saw('b2',.5,22)]},
 {surfaces:[surface(1,'ice'),surface('b0','crumble'),surface('b1','ice')],hazards:[laser(1,.28,96,.7),laser(3,.5,96,2.3),saw(5,.6,28),laser(6,.65,96,1.1),spike('b1',.25)]},
 {surfaces:[surface('b0','spring'),surface('b1','crumble')],hazards:[laser(1,.28,96,.5),steam(2,.65,80,2),saw(3,.65,22),laser('b2',.5,88,1.3)]},
 {surfaces:[surface(3,'ice'),surface('b0','crumble'),mover('b1','x',36,1.2)],hazards:[laser(1,.28,96,.6),laser(2,.85,88,2.1),laser(3,.65,96,1.3),saw('b3',.25,18)]},
 // Afterglow: retain the roomy destinations, but ask for the learned movement
 // combinations on their approaches. The two wider launches reward air dash.
 {shift:[[2,100,0],[3,40,0],[4,40,0],[5,40,0]],surfaces:[surface(1,'ice'),surface(4,'crumble'),surface('b0','spring'),surface('b1','ice')],hazards:[laser(1,.28,96,.5),saw(2,.65,24),laser(3,.65,96,2),spike(4,.65),spike('b1',.25)],wind:32},
 {surfaces:[surface(1,'ice'),surface(4,'spring'),mover('b0','x',30,1.25),surface('b1','crumble')],hazards:[laser(1,.28,96,.5),steam(2,.65,80,2),saw(3,.65,24),spike('b1',.25)]},
 {surfaces:[surface(1,'ice'),mover(3,'x',40,1.25),surface('b0','crumble')],hazards:[laser(1,.28,96,.5),saw(5,.65,24),steam(6,.65,88,2),laser('b1',.25,96,1.3)],wind:32},
 {shift:[[2,110,0],[3,50,0]],surfaces:[surface('b0','ice'),surface('b1','crumble')],hazards:[steam(2,.65,80,1.7),spike(3,.6),saw(4,.83,12),laser('b2',.5,88,.5)],pressure:140,wind:28},
 {surfaces:[surface(1,'belt',-1),surface(3,'ice'),surface('b0','spring'),surface('b1','crumble')],hazards:[steam(1,.28,88,.5),laser(3,.65,84,2.1),saw(4,.65,22),spike('b1',.25)]},
 {surfaces:[mover(1,'x',42,1.2),mover(3,'x',44,1.35),surface(2,'ice'),surface('b0','spring'),surface('b1','ice')],hazards:[laser(2,.65,80,.5),steam(4,.85,88,2.1),saw('b2',.5,24),spike('b3',.25)],wind:36},
 {surfaces:[surface(1,'belt'),surface(5,'ice'),surface(6,'crumble'),surface('b0','spring'),surface('b1','crumble')],hazards:[steam(1,.28,88,.5),laser(3,.65,96,2),saw(5,.65,24),spike(6,.65),spike('b1',.25)]},
 {surfaces:[surface(1,'ice'),surface(6,'crumble'),surface(8,'ice'),surface('b0','spring'),surface('b1','crumble')],hazards:[laser(1,.28,96,.5),saw(3,.55,28),steam(5,.65,88,2),spike(6,.65),laser(8,.65,96,1),spike('b1',.25)],wind:36},
];

export function applyChallenge(index:number,platforms:Platform[],mainCount:number):{hazards:Hazard[];pressure?:number;wind?:number} {
 const challenge=CHALLENGES[index],ledge=(id:Ledge)=>platforms[typeof id==='number'?id:mainCount+Number(id.slice(1))];
 for(const [id,x,y] of challenge.shift??[]){const p=ledge(id);p.x+=x;p.y+=y;}
 for(const {ledge:id,...change} of challenge.surfaces??[])Object.assign(ledge(id),change);
 const hazards=challenge.hazards.map(({ledge:id,at,kind,height,width,travel,period,offset}):Hazard=>{
  const p=ledge(id);
  return {kind,x:p.x+p.w*at-width/2,y:p.y-height-(kind==='saw'?12:0),w:width,h:height,travel,period,offset};
 });
 return {hazards,pressure:challenge.pressure,wind:challenge.wind};
}
