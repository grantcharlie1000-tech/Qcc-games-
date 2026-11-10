import {saw,steam} from './campaign-types';
import {trail,C,G,H,L,M,T,type Opt,type Trail} from './route-build';

/** 02 · A Bell Above the Rain
 * The inside of the bell tower, climbed floor by floor. Each floor is oak let
 * into the walls; the stair between floors has lost most of its treads (open
 * treads: jump up through them, Down drops). Ropes and clock weights hang
 * down one open well through every floor into the flooded pit, so a miss on
 * a stair costs a flight and a miss over the well costs the run.
 * Between the ringing floor and the clock room the tower has twenty-two
 * storeys nobody has kept up: the rope loft, the ringers' loft, the peal
 * gallery, the keeper's room, the weight shaft, the carillon drum, the
 * pendulum case, the dead bell, the bat loft. Most of each floor is gone.
 * What crosses the well is a board, a rotten plank that will not hold, a
 * hoist pallet on its rope, or the pendulum's bob; four of the clock's
 * weights still ride their cables and lift a storey at a time; the drum's
 * hammer carriages run their shafts along the floors that are left.
 * The clock room's broken floor is still the first place the dash is asked
 * for; frame beams cross the well under the bells to Ivo's landing, and the
 * first of them is rotten. Past Ivo the belfry goes on up, and the gallery
 * door is across the top of it: a rotten plank on the bell cage, a wall
 * tread, the west loft, staging on the tie beams and the spire's collars,
 * the bell hoist's pallet over the whole height of the tower, and the east
 * staging down to the east loft and the gallery door. */
const STOREYS=22,RISE=176,D=STOREYS*RISE;
const tread=G,rotten=T('rotten',C(.6,12)),board=T('board',H(12)),pallet=(t:number,v=1.745)=>T('pallet',M(t,v,12)),weight=(v=1.3)=>T('weight',L(88,v,12));
type Piece=readonly [x:number,rise:number,w:number,o?:Opt,after?:(t:Trail)=>void];
/** One storey of the neglected middle of the tower: each piece is placed from that storey's floor line. */
const storey=(t:Trail,m:number,name:string|null,pieces:readonly Piece[])=>{
 if(name)t.sec(name).place('storey',name,{m});
 for(const [x,rise,w,o,after] of pieces){t.at(x,1048+D-RISE*m-rise,w,o);after?.(t);}
 return t;
};
const cp=(t:Trail)=>{t.cp();},cog=(at:number,travel:number,offset=0,period=3)=>(t:Trail)=>{t.hz(i=>saw(i,at,travel,offset,period));},bat=(at:number,travel:number,period=3.4)=>(t:Trail)=>{t.enemy('moth',at,travel,period);};
const t=trail(24,1400+D,240).here('Bell stair')
 .side(384,1400+D,240).side(480,1340+D,56,G).side(568,1280+D,56,G,true)
 .at(120,1340+D,56,G).at(40,1280+D,56,G).at(184,1224+D,80)
 .at(384,1224+D,160).here('The ringing floor').cp()
 .at(472,1164+D,56,G).at(552,1104+D,56,G);
storey(t,0,'The rope loft',[[384,0,80],[24,0,240,{},cp],[96,60,80,tread],[24,120,64,tread],[168,176,96]]);
storey(t,1,null,[[296,0,48,rotten],[380,0,64,board],[480,0,144],[568,60,56,tread],[496,120,56,tread],[392,176,88]]);
storey(t,2,'The ringers’ loft',[[300,0,56,board],[204,-4,56,pallet(36)],[24,0,120],[24,60,56,tread],[104,120,56,tread],[24,176,76,{},cp]]);
storey(t,3,null,[[168,0,96],[414,0,90],[544,0,80],[568,60,56,tread],[488,120,56,tread],[392,176,80]]);
storey(t,4,null,[[300,88,64,weight()],[168,176,96]]);
storey(t,5,'The keeper’s room',[[24,0,110,{},t=>{t.hz(i=>steam(i,.45,80,.4,3));}],[24,60,56,tread],[96,120,56,tread],[176,176,88,{},cp]]);
storey(t,6,null,[[292,0,48,rotten],[372,0,48,rotten],[456,0,168],[560,60,56,tread],[488,120,56,tread],[400,176,80]]);
storey(t,7,'The peal gallery',[[292,8,64,board],[180,0,72,board],[24,0,116],[24,60,56,tread],[100,120,56,tread],[24,176,72]]);
storey(t,8,null,[[160,0,104,{},cp],[440,0,184],[568,60,56,tread],[496,120,56,rotten],[400,176,80]]);
storey(t,9,null,[[300,88,64,weight(1.6)],[150,176,114]]);
storey(t,10,'The weight shaft',[[56,0,60,rotten],[24,60,48,tread],[92,120,48,tread],[150,176,114,{},cp]]);
storey(t,11,null,[[314,-4,56,pallet(34)],[440,0,184],[560,60,56,tread],[488,120,56,tread],[384,176,96]]);
storey(t,12,'The carillon drum',[[276,8,64,board],[160,0,80,rotten],[24,0,110],[40,60,56,tread],[120,120,56,tread],[24,176,92,{},cp]]);
storey(t,13,null,[[176,0,88],[312,0,40,board],[400,0,224,{},cog(.5,60)],[552,60,56,tread],[480,120,56,tread],[384,176,88]]);
storey(t,14,null,[[300,88,64,weight(1.6)],[24,176,240,{},t=>{t.cp().hz(i=>saw(i,.4,50,1));}]]);
storey(t,15,'The pendulum case',[[340,8,48,pallet(66)],[476,0,148],[568,60,56,tread],[488,120,64,tread],[392,176,88]]);
storey(t,16,null,[[296,0,56,rotten],[200,0,56,rotten],[24,0,136],[24,60,56,tread],[104,120,56,tread],[24,176,76,{},cp]]);
storey(t,17,'The dead bell',[[168,0,96],[296,24,56,board],[420,0,204,{},bat(.5,40)],[576,60,48,tread],[504,120,48,tread],[416,176,72]]);
storey(t,18,null,[[300,0,56,rotten],[150,0,114],[72,60,64,tread],[24,120,56,tread],[112,176,152,{},cp]]);
storey(t,19,'The bat loft',[[300,-4,56,pallet(30)],[400,0,224,{},bat(.6,50,3)],[560,60,56,tread],[480,120,56,rotten],[392,176,80]]);
storey(t,20,null,[[280,8,64,board],[170,0,70,rotten],[24,0,110],[24,60,56,tread],[88,120,56,tread],[150,176,114,{},cp]]);
storey(t,21,'Under the clock',[[300,88,64,weight()]]);
export const ROUTE_02=t
 .at(384,1048,80).at(24,1048,240).here('The clock room').cp()
 .at(96,988,80,G).at(24,928,64,G).at(168,872,96).cp()
 .at(456,872,168).here('Under the bells')
 .at(512,812,56,G).at(568,752,56,G).at(384,696,96)
 .at(24,696,240).cp().side(104,812,56,G,true)
 .at(120,636,56,G).at(40,576,56,G).at(184,520,80)
 .at(300,488,48,C(.6,12)).at(400,456,48,G)
 .at(496,424,128).here('Ivo’s landing').cp().station('Ivo')
 .at(400,364,56,G)
 .at(464,304,160).here('The bell loft').cp().side(568,248,56,G,true)
 .at(276,264,72,C(.55,12)).here('Over the bells')
 .at(168,220,64,G).at(52,156,56,G)
 .at(24,88,60).here('The west loft').cp()
 .at(120,16,88,H(12)).here('Inside the spire')
 .at(64,-56,64,H(12))
 .at(292,-40,64,M(90,1.2,12)).here('The bell hoist')
 .at(520,-56,64,H(12)).at(320,16,88,H(12))
 .at(424,120,200).here('The gallery door')
 .done({setting:'tower',goal:'rescue',exit:.62,water:1500+D});
/** How far the foot of the tower stands below where it stood before its middle storeys were climbed. */
export const TOWER_DROP=D,TOWER_STOREYS=STOREYS;
