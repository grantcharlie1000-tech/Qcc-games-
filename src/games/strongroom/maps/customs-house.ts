/** Customs House geometry follows DESIGN §6.4. This data has no Three.js dependency. */
// @ts-expect-error -- the licensed donor theme is kept in its original JavaScript module.
import {HARBOR} from '../engine/world/maps/harbor.js';

export type SiteId='A'|'B';
export type SpawnChoice='quay'|'yard';
export type MapBox=[number,number,number,number,number,number,string,string?];
export interface MapPanel{id:number;axis:'x'|'z';x:number;y:number;z:number;cols:number;rows:number;material:'drywall'|'wood';thickness?:number;opening?:'door'|'window';startBarricaded?:boolean;wall?:string;lintel?:boolean}
export interface MapOpening{id:string;wall:string;axis:'x'|'z';x:number;y:number;z:number;width:number;height:number;kind:'door'|'window';outside:boolean}
type Spawn={x:number;y:number;z:number;yaw:number};
type Wall={id:string;axis:'x'|'z';line:number;start:number;end:number;soft:boolean;openings:[number,number,'door'|'window'][];softSpans?:[number,number][]};
const walls:Wall[]=[
 {id:'north',axis:'x',line:-11,start:-14,end:14,soft:false,openings:[[-10,-9,'window'],[0,2,'door'],[9,10,'window']],softSpans:[[11,13]]},
 {id:'south',axis:'x',line:11,start:-14,end:14,soft:false,openings:[[-11,-10,'window'],[-2,-1,'window'],[8,10,'door']],softSpans:[[0,2]]},
 {id:'west',axis:'z',line:-14,start:-11,end:11,soft:false,openings:[[-7,-6,'window'],[-1,0,'door']],softSpans:[[5,7]]},
 {id:'east',axis:'z',line:14,start:-11,end:11,soft:false,openings:[[-7,-6,'window'],[-1,0,'door'],[5,7,'door']]},
 {id:'corridor-north',axis:'x',line:-2,start:-14,end:14,soft:true,openings:[[-7,-6,'door'],[1,3,'door'],[9,10,'door']]},
 {id:'corridor-south',axis:'x',line:1,start:-14,end:14,soft:true,openings:[[-11,-10,'door'],[-2,-1,'door'],[7,8,'door']]},
 {id:'a-lobby',axis:'z',line:-4,start:-11,end:-2,soft:true,openings:[[-6,-5,'door']]},
 {id:'lobby-office',axis:'z',line:6,start:-11,end:-2,soft:true,openings:[]},
 {id:'server-b',axis:'z',line:-6,start:1,end:11,soft:true,openings:[[6,7,'door']]},
 {id:'b-loading',axis:'z',line:4,start:1,end:11,soft:true,openings:[[8,9,'door']]},
];
const solids:MapBox[]=[
 [-34.5,34.5,-1,0,-30.5,30.5,'ground','concrete'],
 [-34.5,34.5,0,4,-30.5,-29.5,'wallB'],[-34.5,34.5,0,4,29.5,30.5,'wallB'],
 [-34.5,-33.5,0,4,-29.5,29.5,'wallB'],[33.5,34.5,0,4,-29.5,29.5,'wallB'],
 [-14.15,14.15,3,3.4,-11.15,11.15,'wallN'],
 [-14.15,14.15,3.4,3.6,-11.15,-10.85,'trim'],[-14.15,14.15,3.4,3.6,10.85,11.15,'trim'],
 [-14.15,-13.85,3.4,3.6,-10.85,10.85,'trim'],[13.85,14.15,3.4,3.6,-10.85,10.85,'trim'],
];
const panels:MapPanel[]=[],openings:MapOpening[]=[];
function slab(w:Wall,start:number,end:number,y0=0,y1=3){
 const t=.15;
 solids.push(w.axis==='x'?[start,end,y0,y1,w.line-t,w.line+t,'wallN']:[w.line-t,w.line+t,y0,y1,start,end,'wallN']);
}
function soft(w:Wall,start:number,end:number,y=0,rows=6){
 for(let at=start;at<end-.001;){const width=Math.min(2,end-at);panels.push({id:panels.length,wall:w.id,axis:w.axis,x:w.axis==='x'?at:w.line,y,z:w.axis==='z'?at:w.line,cols:Math.round(width*2),rows,material:'drywall',thickness:.2,...(y>0?{lintel:true}:{})});at+=width;}
}
for(const w of walls){
 const cuts=[w.start,w.end,...w.openings.flatMap(([a,b])=>[a,b]),...(w.softSpans??[]).flat()];cuts.sort((a,b)=>a-b);
 for(let n=1;n<cuts.length;n++){
  const a=cuts[n-1],b=cuts[n];if(b-a<.001)continue;const mid=(a+b)/2;
  const opening=w.openings.find(([lo,hi])=>mid>lo&&mid<hi);
  if(opening){const window=opening[2]==='window';if(window)slab(w,a,b,0,1);if(w.soft)soft(w,a,b,window?2:2.25,2);else slab(w,a,b,window?2:2.25,3);}
  else if(w.soft||(w.softSpans??[]).some(([lo,hi])=>mid>lo&&mid<hi))soft(w,a,b);else slab(w,a,b);
 }
 const counts={door:0,window:0};
 for(const [a,b,kind] of w.openings){
  const window=kind==='window',id=`${w.id}-${kind}-${++counts[kind]}`;
  const opening:MapOpening={id,wall:w.id,axis:w.axis,x:w.axis==='x'?a:w.line,y:window?1:0,z:w.axis==='z'?a:w.line,width:b-a,height:window?1:2.25,kind,outside:!w.soft};openings.push(opening);
  panels.push({id:panels.length,wall:w.id,axis:w.axis,x:opening.x,y:window?1:.25,z:opening.z,cols:Math.round((b-a)*2),rows:window?2:4,material:'wood',thickness:.08,opening:kind,startBarricaded:false});
 }
}

const cover:{room:string;id:string;box:MapBox}[]=[];
function box(room:string,id:string,x:number,z:number,w:number,d:number,h:number,mat='wood'){
 const b:MapBox=[x-w/2,x+w/2,0,h,z-d/2,z+d/2,mat];cover.push({room,id,box:b});solids.push(b);
}
// Sizes use width × depth × height as in the coordinate table; positions leave the authored spawns free.
for(const [n,x] of [-12,-9,-6].entries())box('A',`filing-${n}`,x,-7.5,2,.5,2,'metal');
box('A','table',-11,-5.3,1.6,.8,.9);
box('Lobby','reception',-1.1,-6.5,3,.8,1.1);box('Lobby','bench-0',-1.2,-9.5,2,.5,.5);box('Lobby','bench-1',4.3,-7.8,2,.5,.5);
for(const [n,[x,z]] of [[8,-9],[11,-9],[8,-4.3],[11,-4.3]].entries())box('Office',`desk-${n}`,x,z,1.4,.7,.75);
box('Office','cabinet',13,-8.4,1,.5,1.8,'metal');box('Corridor','vending',5,-.5,.9,.8,1.9,'metal');
for(const [n,x] of [-12.5,-11,-8.5].entries())box('Server',`rack-${n}`,x,6,.6,3,2,'metalDark');
box('B','counter',-1,4.6,4,.7,1.1);box('B','trolley-0',-4.5,7.8,.8,.6,.9,'metal');box('B','trolley-1',2.5,7,.8,.6,.9,'metal');
const props:({kind:string;x:number;y?:number;z:number;w?:number;h?:number;d?:number;size?:number;mat?:string;room?:string})[]=[
 {kind:'crate',x:6,z:3,size:1.2,room:'Loading'}, {kind:'crate',x:10.7,z:3.4,size:1.4,room:'Loading'},
 {kind:'crate',x:6.5,z:5.5,size:1.3,room:'Loading'}, {kind:'crate',x:12,z:9.3,size:1.2,room:'Loading'},
 // Quay and Yard screens keep the attacker spawn pads behind hard cover.
 {kind:'container',x:-6,y:1.3,z:-19,w:5.8,h:2.6,d:2.5,mat:'accentB'},
 {kind:'container',x:0,y:1.3,z:-19,w:5.8,h:2.6,d:2.5,mat:'accentA'},
 {kind:'container',x:6,y:1.3,z:-19,w:5.8,h:2.6,d:2.5,mat:'accentB'},
 {kind:'container',x:18,y:1.3,z:18,w:5.8,h:2.6,d:2.5,mat:'accentA'},
 {kind:'container',x:24,y:1.3,z:18,w:5.8,h:2.6,d:2.5,mat:'accentA'},
 {kind:'container',x:-23,y:1.3,z:-15,w:5.8,h:2.6,d:2.5,mat:'accentB'},
 {kind:'container',x:-25,y:1.3,z:6,w:2.5,h:2.6,d:5.8,mat:'accentA'},
 {kind:'container',x:23,y:1.3,z:0,w:2.5,h:2.6,d:5.8,mat:'accentB'},
 {kind:'container',x:-6,y:1.3,z:20,w:5.8,h:2.6,d:2.5,mat:'accentB'},
];
box('Loading','pallets',11,5.7,1.2,1,.8);
const decor=[[-9,1.25,-10.8,2,.9,.15,'metalDark'],[-1,1.3,10.8,6,2.2,.15,'metalDark']] as (number|string)[][];
const spawn=(x:number,z:number,yaw:number):Spawn=>({x,y:.03,z,yaw});
const attackSpawns={
 quay:[-6,-3.6,-1.2,1.2,3.6,6].map(x=>spawn(x,-27,Math.PI)),
 yard:Array.from({length:6},(_,i)=>spawn(27+2*Math.cos(i*Math.PI/3),25+2*Math.sin(i*Math.PI/3),Math.atan2(.6,.8))),
};
const defenderSpawns={A:[[-12,-9],[-9,-9],[-6,-9],[-12,-4],[-9,-4],[-6,-4]].map(([x,z])=>spawn(x,z,0)),B:[[-4,3],[-1,3],[2,3],[-4,9],[-1,9],[2,9]].map(([x,z])=>spawn(x,z,Math.PI))};
const strongrooms=[{name:'A' as const,center:[-9,1.2,-6.5] as [number,number,number],box:[-13.6,0,-10.6,-4.4,3,-2.4] as [number,number,number,number,number,number]},
 {name:'B' as const,center:[-1,1.2,6] as [number,number,number],box:[-5.6,0,1.4,3.6,3,10.6] as [number,number,number,number,number,number]}];
const propBoxes:MapBox[]=props.map(p=>p.kind==='crate'?[p.x-p.size!/2,p.x+p.size!/2,0,p.size!,p.z-p.size!/2,p.z+p.size!/2,'crate']:[p.x-p.w!/2,p.x+p.w!/2,0,p.h!,p.z-p.d!/2,p.z+p.d!/2,'metal']);
const panelBoxes:MapBox[]=panels.filter(p=>p.material==='drywall').map(p=>p.axis==='x'?[p.x,p.x+p.cols*.5,p.y,p.y+p.rows*.5,p.z-.1,p.z+.1,'wallN']:[p.x-.1,p.x+.1,p.y,p.y+p.rows*.5,p.z,p.z+p.cols*.5,'wallN']);
const blockers=[...solids,...propBoxes,...panelBoxes].filter(b=>b[3]>.1&&b[2]<1.9);
function visible(a:readonly number[],b:readonly number[],margin=.36){
 for(const box of blockers){let lo=0,hi=1;
  for(const [axis,min,max] of [[0,box[0]-margin,box[1]+margin],[2,box[4]-margin,box[5]+margin]] as const){
   const d=b[axis]-a[axis];if(Math.abs(d)<1e-9){if(a[axis]<min||a[axis]>max){lo=2;break;}continue;}
   const t0=(min-a[axis])/d,t1=(max-a[axis])/d;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(lo>hi)break;
  }
  if(lo<=hi&&hi>=0&&lo<=1)return false;
 }
 return true;
}
const nodes:Record<string,[number,number,number]>={};
function node(id:string,x:number,z:number){const xyz:[number,number,number]=[x,.03,z];if(visible(xyz,xyz))nodes[id]=xyz;}
for(const [id,x,z] of [['a',-9,-6.5],['lobby',1,-6.5],['office',10,-6.5],['corridor',0,-.5],['server',-10,6],['b',-1,6],['loading',9,6],['a-west',-12.7,-3.5],['a-east',-5.2,-4],['lobby-west',-2,-3.5],['lobby-east',4.5,-4],['office-west',7,-6],['office-east',12.5,-3],['server-west',-12.5,2.5],['server-east',-7,9],['b-west',-4.8,5.8],['b-east',2.8,5.8],['loading-west',5.2,9],['loading-east',12.5,7.5]] as const)node(id,x,z);
node('a-shelf-gap-west',-10.5,-7.5);node('a-shelf-gap-east',-7.5,-7.5);
for(const x of [-10.5,-7.5]){node(`a-shelf-${x}-north`,x,-8.6);node(`a-shelf-${x}-south`,x,-6.4);}
for(const o of openings){const x=o.x+(o.axis==='x'?o.width/2:0),z=o.z+(o.axis==='z'?o.width/2:0);node(`${o.id}-minus`,x+(o.axis==='z'?-.8:0),z+(o.axis==='x'?-.8:0));node(`${o.id}-plus`,x+(o.axis==='z'?.8:0),z+(o.axis==='x'?.8:0));}
for(const z of [-18,18])for(const x of [-18,-12,-6,0,6,12,18])node(`outside-${x}-${z}`,x,z);
for(const x of [-20,20])for(const z of [-12,-6,0,6,12])node(`outside-${x}-${z}`,x,z);
node('quay-west',-12,-24);node('quay-east',12,-24);node('yard-south',18,25);node('yard-east',29,12);
for(const [pad,list] of Object.entries(attackSpawns))list.forEach((s,i)=>node(`spawn-${pad}-${i}`,s.x,s.z));
for(const [site,list] of Object.entries(defenderSpawns))list.forEach((s,i)=>node(`spawn-${site}-${i}`,s.x,s.z));
const breachEdges:{a:string;b:string;panel:number}[]=[];
const cutPanels=new Set([...panelIds('corridor-north',-10,-8),...panelIds('a-lobby',-9,-7),...panelIds('south',0,2),...panelIds('b-loading',5,7)]);
for(const p of panels.filter(p=>cutPanels.has(p.id))){
 const a=`breach-${p.id}-minus`,b=`breach-${p.id}-plus`;
 for(const fraction of [.5,.125,.875]){
  const x=p.x+(p.axis==='x'?p.cols*.5*fraction:0),z=p.z+(p.axis==='z'?p.cols*.5*fraction:0);
  const ap:[number,number,number]=[x+(p.axis==='z'?-.8:0),.03,z+(p.axis==='x'?-.8:0)],bp:[number,number,number]=[x+(p.axis==='z'?.8:0),.03,z+(p.axis==='x'?.8:0)];
  if(!visible(ap,ap)||!visible(bp,bp))continue;nodes[a]=ap;nodes[b]=bp;break;
 }
 if(nodes[a]&&nodes[b])breachEdges.push({a,b,panel:p.id});
}
const edges:[string,string][]=[];const nodeEntries=Object.entries(nodes);
for(let a=0;a<nodeEntries.length;a++)for(let b=a+1;b<nodeEntries.length;b++){const [aKey,ap]=nodeEntries[a],[bKey,bp]=nodeEntries[b];if(Math.hypot(ap[0]-bp[0],ap[2]-bp[2])<=15&&visible(ap,bp))edges.push([aKey,bKey]);}
// Windows remain explicit vault links; regular A* uses doors until its controller can vault.
const vaultEdges=openings.filter(o=>o.kind==='window').map(o=>({a:`${o.id}-minus`,b:`${o.id}-plus`,vault:true,opening:o.id}));
function panelIds(wall:string,start:number,end:number){return panels.filter(p=>p.material==='drywall'&&p.y===0&&p.wall===wall&&(p.axis==='x'?p.x:p.z)<end&&(p.axis==='x'?p.x+p.cols*.5:p.z+p.cols*.5)>start).map(p=>p.id);}
const aReinforce=[...panelIds('corridor-north',-10,-8),...panelIds('corridor-north',-5,-4),...panelIds('a-lobby',-9,-7),...panelIds('a-lobby',-4,-2)];
const bReinforce=[...panelIds('south',0,2),...panelIds('server-b',2,4),...panelIds('server-b',8,10),...panelIds('b-loading',2,4),...panelIds('b-loading',5,7),...panelIds('corridor-south',-5,-3),...panelIds('corridor-south',1,3)];
export const CUSTOMS_HOUSE={
 id:'customs-house',bounds:{x0:-34,x1:34,z0:-30,z1:30},buildingFootprint:{x0:-14,x1:14,z0:-11,z1:11},
 theme:{...HARBOR.theme,fogNear:48,fogFar:90},solids,stairs:[],arches:[],props,decor,panels,openings,cover,
 lights:[{color:0xffd7aa,intensity:4,distance:12,pos:[1,2.7,-6.5]},{color:0xc6e1ff,intensity:3,distance:12,pos:[0,2.7,-.5]},{color:0xffd7aa,intensity:3,distance:12,pos:[-9,2.7,-6.5]},{color:0xffd7aa,intensity:3,distance:12,pos:[-1,2.7,6]}],
 cameras:[{id:'C1',position:[0,3.1,-11.4],facing:[0,0,-1]},{id:'C2',position:[14.4,3.1,11.4],facing:[1,0,1]},{id:'C3',position:[-13.5,2.6,-1.5],facing:[1,0,0]},{id:'C4',position:[13.5,2.6,10.5],facing:[-1,0,-1]}],
 spawns:{t:attackSpawns.quay,ct:defenderSpawns.A},attackSpawns,defenderSpawns,strongrooms,bombSites:strongrooms,
 siteData:{A:{reinforcePanels:aReinforce,cutSpots:[{wall:'corridor-north',range:[-10,-8],from:[-9,0,-.5]},{wall:'a-lobby',range:[-9,-7],from:[-2.5,0,-8]}]},B:{reinforcePanels:bReinforce,cutSpots:[{wall:'south',range:[0,2],from:[1,0,12.5]},{wall:'b-loading',range:[5,7],from:[5.5,0,6]}]}},
 navigation:{nodes,edges,vaultEdges,breachEdges,attackRoutes:{A:[{name:'main lobby',nodes:['spawn-quay-0','lobby','corridor','a']}],B:[{name:'loading route',nodes:['spawn-yard-0','loading','b']}]},defenseAreas:[{name:'Records Vault',sector:'A',anchor:'a',nodes:['a','a-east']},{name:'Cash Cage',sector:'B',anchor:'b',nodes:['b','b-east']}]},
};
