import type {Enemy} from './enemies';
import {CHAPTERS,rescueNameFor} from './story';
import {applyChallenge} from './challenge-data';
import {CAMPAIGN_ROUTES} from './route-data';
import type {Place} from './route-build';
export interface Rect {x:number;y:number;w:number;h:number}
export type Surface='stone'|'crumble'|'moving'|'spring'|'ice'|'belt'|'grate';
export type Setting='roofs'|'canal'|'tower'|'garden'|'factory'|'cavern'|'bridge'|'sky';
export type Goal='shelter'|'rescue'|'relay'|'ferry'|'engine'|'escape'|'signal'|'dawn';
export interface Platform extends Rect {id:number;kind:Surface;travel?:number;speed?:number;direction?:number;axis?:'x'|'y';branch?:boolean;crumbleDelay?:number;tag?:string}
export interface Hazard extends Rect {platform?:number;kind:'spikes'|'saw'|'laser'|'steam'|'crusher';travel?:number;period?:number;offset?:number;disabledBy?:number;duty?:number}
export interface Pickup {x:number;y:number;kind:'spark'|'key'|'dash';id:number}
export interface Station {id:number;platform:number;x:number;y:number;kind:'lamp'|'survivor'|'valve'|'bell';label:string}
export interface Checkpoint {x:number;y:number;platform:number}
export interface Level {id:number;name:string;world:number;hint:string;platforms:Platform[];hazards:Hazard[];enemies:Enemy[];pickups:Pickup[];checkpoint:Checkpoint;exit:Rect;gate?:Rect;spawn:{x:number;y:number};width:number;height:number;setting:Setting;goal:Goal;stations:Station[];mainCount:number;wind:number;water:number|null;berth?:{x:number;y:number};pressure?:number;checkpoints?:Checkpoint[];sectors?:{name:string;platform:number}[];places?:readonly Place[]}
export const WORLDS=[
 {name:'The Old Quarter',sky:'#202d40',far:'#2b3b52',near:'#3a4b5b',stone:'#637078',edge:'#a5b3b0',accent:'#f3c77a',glow:'#ffb76b',flora:'#779b8b'},
 {name:'Mossworks',sky:'#142f32',far:'#20423e',near:'#315d4d',stone:'#526e60',edge:'#a8bf8b',accent:'#c8df87',glow:'#d9e990',flora:'#8fbd74'},
 {name:'The Clockworks',sky:'#312833',far:'#49343e',near:'#63464b',stone:'#866d61',edge:'#d0ad7e',accent:'#f0b36f',glow:'#ffac62',flora:'#ad7e63'},
 {name:'Frostline',sky:'#202e49',far:'#2b4261',near:'#3b5976',stone:'#718fa4',edge:'#c1e3e9',accent:'#c0ebf0',glow:'#aee6ed',flora:'#9bc1c5'},
 {name:'The Afterglow',sky:'#2b294a',far:'#42395c',near:'#625071',stone:'#80748d',edge:'#c7b5d1',accent:'#ffda9e',glow:'#ffcf9a',flora:'#aaa6c6'},
] as const;
// Geometry and encounters are authored per chapter in the three campaign files.
// All mandatory fixtures sit on the route; optional ledges hold memories only.
const SURFACES:Record<string,Surface>={s:'stone',e:'stone',c:'crumble',m:'moving',l:'moving',b:'spring',i:'ice','>':'belt','<':'belt',g:'grate'};
function parse(text:string,offset=0,branch=false):Platform[]{
 return text.split(';').filter(Boolean).map((row,i)=>{
  const [x,y,w,code='s',travel,speed,crumbleDelay,height]=row.split(',');
  // An eighth field gives a solid its own height: a chimney stack or a pier, standing clear of other landings.
  return {id:offset+i,x:+x,y:+y,w:+w,h:height?+height:code==='g'?12:code==='e'?8:28,kind:SURFACES[code],axis:code==='l'?'y':'x',travel:travel?+travel:code==='l'?24:28,speed:speed?+speed:.9,direction:code==='<'?-1:1,branch,crumbleDelay:crumbleDelay?+crumbleDelay:undefined};
 });
}
export const LEVEL_COUNT=40;
export function createLevel(index:number):Level {
 if(!Number.isInteger(index)||index<0||index>=LEVEL_COUNT)throw new RangeError('Unknown Last Light stage');
 const authored=CAMPAIGN_ROUTES[index],{setting,goal}=authored,world=Math.floor(index/8),chapter=CHAPTERS[index];
 const main=parse(authored.route),branches=parse(authored.branches,main.length,true),platforms=[...main,...branches],end=main.at(-1)!;
 if(authored.tags)for(const p of platforms)if(authored.tags[p.id])p.tag=authored.tags[p.id];
 if(goal==='ferry'&&setting==='canal'){
  for(let i=main.length-3;i<main.length;i++)main[i].y=main[i-1].y+56;
 }
 const {hazards,pressure,wind}=applyChallenge(index,platforms,main.length);
 const checkpoints:Checkpoint[]=authored.checkpoints.map(id=>{const p=main[id];return {x:p.x+28,y:p.y,platform:id};});
 // Keep the historical field for saved runs; current runs use the ordered array.
 const checkpoint=checkpoints[Math.floor(checkpoints.length/2)]??{x:main[0].x+28,y:main[0].y,platform:0};
 const kind=authored.stationKind??(goal==='rescue'?'survivor':goal==='engine'?'valve':goal==='ferry'?'bell':'lamp');
 const stations:Station[]=authored.stations.map(([platform,label],id)=>{
  const p=main[platform];return {id,platform,x:p.x+p.w*.5,y:p.y,kind,label:goal==='rescue'?rescueNameFor(index):label};
 });
 const enemies:Enemy[]=(authored.enemies??[]).map((e,id)=>{const p=main[e.ledge];return {id,platform:p.id,kind:e.kind,x:p.x+p.w*e.at,y:p.y-(e.kind==='moth'?48:0),travel:e.travel,period:e.period??3.4,offset:e.offset??0};});
 const pickups:Pickup[]=authored.memories.map((id,number)=>{const p=branches[id];return {id:number,x:p.x+p.w*.5,y:p.y-30,kind:'spark'};});
 // From level 4 a dash refill hangs over the fifth landing.
 if(index>=3){const p=main[Math.min(4,main.length-2)];pickups.push({id:3,x:p.x+p.w*.72,y:p.y-44,kind:'dash'});}
 return {
  id:index,name:chapter.name,world,setting,goal,platforms,hazards,enemies,pickups,stations,mainCount:main.length,
  checkpoint,checkpoints,sectors:authored.sectors.map(([platform,name])=>({platform,name})),
  ...(goal==='ferry'?{berth:{x:end.x+end.w+66,y:end.y}}:{}),
  exit:{x:goal==='ferry'?end.x+end.w-44:end.x+end.w*(authored.exit??.55),y:end.y-56,w:38,h:56},spawn:{x:72,y:main[0].y-24},
  width:Math.max(...platforms.map(p=>p.x+p.w))+(goal==='ferry'?320:110),height:Math.max(600,...platforms.map(p=>p.y+160)),
  hint:chapter.task,wind:wind??0,water:authored.water??(setting==='canal'?(goal==='ferry'?end.y+8:Math.max(...platforms.map(p=>p.y))+76):null),
  ...(pressure===undefined?{}:{pressure}),...(authored.places?{places:authored.places}:{}),
 };
}
export const LEVELS:readonly Level[]=Array.from({length:LEVEL_COUNT},(_,i)=>createLevel(i));
