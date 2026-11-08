export interface Rect { x:number;y:number;w:number;h:number }
export type Surface = 'stone'|'crumble'|'moving'|'spring'|'ice'|'belt';
export interface Platform extends Rect {id:number;kind:Surface;travel?:number;speed?:number;direction?:number}
export interface Hazard extends Rect {kind:'spikes'|'saw'|'laser';travel?:number;period?:number;offset?:number}
export interface Pickup {x:number;y:number;kind:'spark'|'key'|'dash';id:number}
export interface Checkpoint {x:number;y:number;platform:number}
export interface Level {id:number;name:string;world:number;hint:string;platforms:Platform[];hazards:Hazard[];pickups:Pickup[];checkpoint:Checkpoint;exit:Rect;gate?:Rect;spawn:{x:number;y:number};width:number;height:number}
export const WORLDS = [
 {name:'The Old Quarter',sky:'#232b3b',far:'#30394a',near:'#394557',stone:'#62616b',edge:'#99929a',accent:'#f3c77a',glow:'#ffb76b',flora:'#7a9980'},
 {name:'Mossworks',sky:'#1c3032',far:'#294340',near:'#365149',stone:'#59695b',edge:'#97a680',accent:'#bbd887',glow:'#d9e990',flora:'#8bbd79'},
 {name:'The Clockworks',sky:'#35262d',far:'#4a3036',near:'#604047',stone:'#795b59',edge:'#bd9279',accent:'#f0b36f',glow:'#ffac62',flora:'#ac785b'},
 {name:'Frostline',sky:'#202b42',far:'#2d3e57',near:'#3c5369',stone:'#63778d',edge:'#b6d5dd',accent:'#c0ebf0',glow:'#aee6ed',flora:'#8fb5b5'},
 {name:'The Afterglow',sky:'#292035',far:'#3e2f4b',near:'#55435e',stone:'#76637d',edge:'#b29ab8',accent:'#f1c68e',glow:'#ffcf9a',flora:'#a295b5'},
] as const;
const NAMES = [
 ['A Small Beginning','Rooftop Hops','Mind the Gap','Old Brick Road','The Broken Bridge','A Light to Follow','Under the Eaves','Quarter’s End'],
 ['Overgrown','Soft Landing','Roots & Ruins','The Glasshouse','Borrowed Ground','Green Machines','Lost in the Vines','The Garden Gate'],
 ['First Shift','Belt & Braces','The Night Shift','Clockwork Crossing','Teeth of the City','Against the Grain','Perfect Timing','The Great Mechanism'],
 ['Cold Feet','Thin Ice','A Winter Crossing','Frozen in Time','Snowfall Express','The Long Thaw','Below Zero','North Star'],
 ['Embers','High Wire','Fading Signals','One Last Key','Above the Clouds','The Narrow Way','The Last Ascent','Bring Back the Dawn'],
];
// Fixed route scores, not random generation. Each row specifies the platforms' vertical offsets.
const ROUTES = [
 [0,0,-24,-24,0,-24,0], [0,-32,-64,-32,0,-32,-64,0],
 [0,0,-48,-48,-16,-48,-16,0], [0,-48,-16,-64,-32,0,-48,-16,0],
 [0,-24,0,-48,-48,-16,-64,-32,0], [0,-48,-64,-32,-64,-16,-48,-16,0],
 [0,-32,-64,-32,-64,-32,0,-48,-16,0], [0,-32,-64,-48,-16,-48,-64,-32,-48,-16,0],
];
export const LEVEL_COUNT=40;
export function createLevel(index:number):Level {
 if(!Number.isInteger(index)||index<0||index>=LEVEL_COUNT)throw new RangeError('Unknown Last Light stage');
 const world=Math.floor(index/8),stage=index%8,route=ROUTES[stage];
 const platforms:Platform[]=[],hazards:Hazard[]=[],pickups:Pickup[]=[];
 let x=24,pickup=0;
 route.forEach((rise,i)=>{
  const first=i===0,last=i===route.length-1;
  const w=first?204:last?180:112+((i+stage)%3)*16;
  const y=400+rise;
  let kind:Surface='stone';
  if(!first&&!last&&i!==Math.floor(route.length/2)){
   if(world===0&&stage>=4&&i===2)kind='crumble';
   if(world===1)kind=i%3===0?'moving':i%3===1?'crumble':'spring';
   if(world===2)kind=i%3===0?'moving':i%3===1?'belt':'crumble';
   if(world===3)kind=i%3===0?'moving':i%3===1?'ice':'spring';
   if(world===4)kind=(['crumble','moving','belt','spring'] as const)[i%4];
  }
  platforms.push({id:i,x,y,w,h:first||last?176:28,kind,travel:kind==='moving'?20+stage:undefined,speed:.7+stage*.035,direction:i%2?1:-1});
  if(!first&&!last){
   // Three sparks per stage, placed on the main route or just above a jump.
   if([1,Math.floor(route.length/2),route.length-2].includes(i))pickups.push({id:pickup++,x:x+w/2,y:y-38,kind:'spark'});
   if(world>=1&&i===route.length-3)pickups.push({id:pickup++,x:x+w/2,y:y-64,kind:'key'});
   if(world>=2&&i===2)pickups.push({id:pickup++,x:x+w-12,y:y-56,kind:'dash'});
   // Hazards leave a landing margin on both sides. Checkpoint platform stays safe.
   if(i!==Math.floor(route.length/2)&&kind!=='moving'&&kind!=='spring'){
    if((world>=1||stage>=2)&&i%3===2)hazards.push({kind:'spikes',x:x+w/2-12,y:y-10,w:24,h:10});
    if(world>=2&&i%4===3)hazards.push({kind:'saw',x:x+w/2-10,y:y-24,w:20,h:20,travel:26,period:2.8,offset:i});
    if(world>=3&&i===route.length-2)hazards.push({kind:'laser',x:x+w/2-3,y:y-88,w:6,h:88,period:3.2,offset:stage*.3});
   }
  }
  x+=w+(first?48:52+((i*3+stage)%4)*10+world*3);
 });
 const end=platforms[platforms.length-1],mid=platforms[Math.floor(platforms.length/2)];
 const hints=[
  stage===0?'Carry the light to the beacon. Move with A / D or ← / →. Space to jump.':stage===1?'Hold jump to go higher. A quick tap makes a small hop.':stage===2?'Watch for spikes. You can jump a little after leaving an edge.':stage===3?'Shift or X dashes in the direction you face. Landing refills your dash.':'Cracked platforms fall away. Keep moving; the flag saves your place.',
  'Mossworks: ride moving platforms, bounce on springs, and find the key before the gate.',
  'Clockworks: belts push your feet. Dash over saws. Blue crystals refill your air dash.',
  'Frostline: ice carries your momentum. Lasers pulse on and off; wait for the dark beat.',
  'Afterglow: all your skills, one last climb. Jump against a wall to kick away from it.',
 ][world];
 return {id:index,name:NAMES[world][stage],world,hint:stage===0||world===0?hints:'Find the key, pass the checkpoint, and carry the light to the beacon.',platforms,hazards,pickups,checkpoint:{x:mid.x+24,y:mid.y,platform:mid.id},exit:{x:end.x+end.w-62,y:end.y-56,w:32,h:56},gate:world>=1?{x:end.x+38,y:end.y-72,w:12,h:72}:undefined,spawn:{x:72,y:400-24},width:end.x+end.w+32,height:576};
}
export const LEVELS:readonly Level[]=Array.from({length:LEVEL_COUNT},(_,i)=>createLevel(i));
