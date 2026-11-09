import {CHAPTERS,rescueNameFor} from './story';
import {applyChallenge} from './challenge-data';
export interface Rect {x:number;y:number;w:number;h:number}
export type Surface='stone'|'crumble'|'moving'|'spring'|'ice'|'belt';
export type Setting='roofs'|'canal'|'tower'|'garden'|'factory'|'cavern'|'bridge'|'sky';
export type Goal='shelter'|'rescue'|'relay'|'ferry'|'engine'|'escape'|'signal'|'dawn';
export interface Platform extends Rect {id:number;kind:Surface;travel?:number;speed?:number;direction?:number;axis?:'x'|'y';branch?:boolean}
export interface Hazard extends Rect {kind:'spikes'|'saw'|'laser'|'steam';travel?:number;period?:number;offset?:number}
export interface Pickup {x:number;y:number;kind:'spark'|'key'|'dash';id:number}
export interface Station {id:number;platform:number;x:number;y:number;kind:'lamp'|'survivor'|'valve'|'bell';label:string}
export interface Checkpoint {x:number;y:number;platform:number}
export interface Level {id:number;name:string;world:number;hint:string;platforms:Platform[];hazards:Hazard[];pickups:Pickup[];checkpoint:Checkpoint;exit:Rect;gate?:Rect;spawn:{x:number;y:number};width:number;height:number;setting:Setting;goal:Goal;stations:Station[];mainCount:number;wind:number;water:number|null;pressure?:number}
export const WORLDS=[
 {name:'The Old Quarter',sky:'#202d40',far:'#2b3b52',near:'#3a4b5b',stone:'#637078',edge:'#a5b3b0',accent:'#f3c77a',glow:'#ffb76b',flora:'#779b8b'},
 {name:'Mossworks',sky:'#142f32',far:'#20423e',near:'#315d4d',stone:'#526e60',edge:'#a8bf8b',accent:'#c8df87',glow:'#d9e990',flora:'#8fbd74'},
 {name:'The Clockworks',sky:'#312833',far:'#49343e',near:'#63464b',stone:'#866d61',edge:'#d0ad7e',accent:'#f0b36f',glow:'#ffac62',flora:'#ad7e63'},
 {name:'Frostline',sky:'#202e49',far:'#2b4261',near:'#3b5976',stone:'#718fa4',edge:'#c1e3e9',accent:'#c0ebf0',glow:'#aee6ed',flora:'#9bc1c5'},
 {name:'The Afterglow',sky:'#2b294a',far:'#42395c',near:'#625071',stone:'#80748d',edge:'#c7b5d1',accent:'#ffda9e',glow:'#ffcf9a',flora:'#aaa6c6'},
] as const;
// These are authored spaces, in route order, not a generated horizontal obstacle strip.
// x,y,width,surface (s stone, c crumble, m shuttle, l lift, b spring, i ice, >/< belt).
// Branches connect back to the route; their sparks reward exploration, never block progress.
// Return circuits descend to open plazas; side terraces leave room above mission
// fixtures. Keep these pockets authored: squeezing them into a common row hides
// the destination behind the outbound route and removes the quiet landing beat.
const MAPS:readonly [Setting,Goal,string,string][]=[
 ['roofs','shelter','24,400,220;280,352,164;490,400,210;734,344,180;958,304,220','90,288,92;260,224,120;440,224,120;640,248,120'],
 ['tower','rescue','24,400,240;304,344,180;524,288,180;744,232,190;550,168,180;326,112,180;60,56,260','940,344,160;1160,280,180;950,216,150;740,144,150'],
 ['canal','ferry','24,400,230;300,436,140,m;490,400,170;740,456,164;970,408,210','200,336,110;360,280,130;560,296,150;770,344,150'],
 ['roofs','relay','24,400,220;280,344,180;500,288,180;730,344,190;970,400,220;760,512,240;480,568,230;160,568,280','638,218,130;840,218,150;1044,272,190'],
 ['bridge','escape','24,400,240;290,376,150,c;500,340,140,c;700,396,180;930,344,150,c;1140,304,230','270,460,200;520,460,220;790,460,190;1030,410,160'],
 ['cavern','signal','24,400,220;290,456,180;520,512,190;760,456,170;970,400,180;1200,344,260','300,336,150;500,330,160;730,332,150;940,276,140'],
 ['tower','engine','24,400,240;300,352,170;510,304,160;720,256,180;940,208,200;720,144,170;450,88,250','280,440,170;490,436,160;700,372,170;920,312,180'],
 ['bridge','signal','24,400,220;280,344,180;510,288,170;730,240,190;970,192,170;1190,136,220','280,460,180;530,400,170;760,344,180;1000,296,180'],
 ['garden','engine','24,400,220;280,352,170;490,408,180;720,352,180;960,296,260','170,336,100;300,272,150;510,264,160;720,208,160'],
 ['canal','rescue','24,400,230;290,456,170;510,512,180;740,456,180;960,400,180;1170,344,270','260,336,180;500,336,170;730,326,160;950,270,170'],
 ['garden','relay','24,400,240;310,344,160,b;540,280,180;770,344,180;1000,400,240;780,520,240;490,584,240;160,600,290','680,210,140;880,212,160;1100,272,190'],
 ['tower','shelter','24,400,240;300,344,180;540,288,180;330,224,170;100,160,170;320,96,190;560,40,280','790,350,190;1040,288,180;810,216,160;570,160,180'],
 ['garden','escape','24,400,230;290,376,160,c;510,328,170;740,272,150,c;960,320,180;1200,264,230','300,460,180;540,452,160;740,396,180;980,412,170'],
 ['factory','engine','24,400,230;300,344,170,m;540,288,170;770,232,170,l;1000,176,220','280,460,170;510,452,180;750,388,170;970,324,180'],
 ['cavern','rescue','24,400,220;280,456,180;500,512,190;740,568,180;960,512,170;1180,456,230','290,336,160;490,336,170;720,392,180;940,400,180'],
 ['garden','signal','24,400,230;290,344,180;520,288,170;740,232,180;970,288,180;1200,344,240;980,456,190;720,520,280','310,462,170;540,470,160;520,394,170;730,344,160'],
 ['factory','engine','24,400,240;300,368,170,>;530,312,180;770,368,170,<;1000,312,180;1230,256,270','150,324,120;340,260,140;550,204,160;790,204,160'],
 ['tower','relay','24,400,240;310,344,170;530,288,180,l;760,232,170;540,160,180;300,96,190;60,32,280','990,304,180;1220,240,190;990,176,170;760,112,170'],
 ['factory','rescue','24,400,240;300,456,170,<;530,512,180;760,456,170,>;990,400,180;1230,344,270','310,332,160;530,330,160;770,322,170;1000,266,170'],
 ['bridge','escape','24,400,230;300,368,150,c;510,312,170;730,368,150,c;950,312,170;1180,256,220','300,456,180;530,444,160;740,436,180;970,400,150'],
 ['factory','engine','24,400,230;300,344,170,>;530,288,180;760,232,180;990,176,180;770,112,180;530,56,230','300,462,170;530,444,180;770,380,180;1000,312,170'],
 ['canal','ferry','24,400,240;310,448,170,m;540,400,170;770,448,180,m;1010,400,190;1250,344,280','310,332,150;520,276,180;760,276,180;1020,268,180'],
 ['tower','signal','24,400,230;300,344,170;520,288,180,l;750,232,180;980,176,180;1210,120,230','290,460,160;520,420,170;750,364,160;980,308,170'],
 ['factory','relay','24,400,230;300,344,170,>;520,288,180;750,344,180,<;980,400,230;770,504,230;490,568,230;170,568,280','660,218,150;870,224,170;1100,280,170'],
 ['bridge','rescue','24,400,240;310,368,170,i;530,312,180,i;760,368,180;990,312,180,i;1220,256,230','310,460,170;520,448,180;750,436,170;980,400,160'],
 ['cavern','engine','24,400,230;300,456,180,i;540,512,180;780,456,180,i;1020,400,180;1260,344,280','310,332,170;530,276,180;770,276,170;1010,272,180'],
 ['tower','signal','24,400,240;310,344,170;540,288,170,i;770,232,180;550,168,180;320,112,180;24,56,280','1030,328,170;1260,264,180;1040,200,160;810,136,160'],
 ['bridge','escape','24,400,230;300,352,170,i;530,296,170,c;760,240,180;1000,296,180,i;1240,240,230','300,460,180;540,444,170;780,380,180;1100,364,200'],
 ['canal','ferry','24,400,230;300,448,170,m;540,392,180,i;780,448,170,m;1010,392,180;1250,336,280','300,332,170;530,276,180;770,276,180;1010,262,180'],
 ['garden','relay','24,400,230;300,344,170;530,288,180,i;760,344,180;1000,400,230;790,516,230;510,580,230;170,600,290','670,218,150;880,224,170;1110,280,190'],
 ['cavern','rescue','24,400,230;300,456,180;540,512,180;780,568,180,i;1020,512,180;1260,456,230','300,332,180;540,336,180;780,392,180;1020,400,180'],
 ['sky','signal','24,400,240;310,344,170;540,288,180;780,232,170;1020,176,180;1260,120,230','300,462,180;540,412,180;780,356,180;1020,300,180'],
 ['sky','shelter','24,400,240;320,360,180;580,304,180;840,360,170;1090,304,180;1340,248,230','300,460,190;560,440,180;800,420,180;1050,384,180'],
 ['tower','rescue','24,400,240;310,344,180;540,288,180;780,232,180;550,168,180;320,112,180;24,56,280','1040,326,190;1290,262,180;1060,198,170;820,134,170'],
 ['sky','relay','24,400,230;310,344,170;540,288,180;780,344,180;1020,400,230;810,512,240;510,576,240;170,576,290','680,218,160;900,224,170;1130,280,170'],
 ['bridge','escape','24,400,230;320,368,160,c;550,312,170;800,256,160,c;1040,200,180;1290,144,230','310,460,180;550,448,170;790,384,180;1030,324,180'],
 ['factory','engine','24,400,230;310,344,180;550,288,180;790,232,180;1030,176,180;800,112,180;550,56,230','310,462,170;550,444,180;790,380,180;1030,312,180'],
 ['sky','ferry','24,400,240;320,448,170,m;560,392,180;800,448,180,m;1040,392,180;1290,336,300','310,332,180;550,276,180;790,276,180;1040,260,180'],
 ['tower','signal','24,400,240;310,344,180;550,288,180;790,232,180;1030,176,180;1270,120,230;1040,56,180;790,0,230','310,462,170;550,412,180;790,356,180;1030,300,180'],
 ['sky','dawn','24,400,240;310,344,180;550,288,180;790,232,180;1030,288,180;1270,344,250;1050,456,210;780,512,220;510,568,220;170,584,290','400,216,180;630,152,180;860,96,200'],
];
const SURFACES:Record<string,Surface>={s:'stone',c:'crumble',m:'moving',l:'moving',b:'spring',i:'ice','>':'belt','<':'belt'};
function parse(text:string,offset=0,branch=false):Platform[]{return text.split(';').filter(Boolean).map((row,i)=>{const [x,y,w,code='s']=row.split(',');return {id:offset+i,x:+x,y:+y,w:+w,h:28,kind:SURFACES[code],axis:code==='l'?'y':'x',travel:code==='l'?24:18,speed:.75,direction:code==='<'?-1:1,branch};});}
export const LEVEL_COUNT=40;
export function createLevel(index:number):Level {
 if(!Number.isInteger(index)||index<0||index>=LEVEL_COUNT)throw new RangeError('Unknown Last Light stage');
 const [setting,goal,route,branch]=MAPS[index],world=Math.floor(index/8),chapter=CHAPTERS[index];
 const main=parse(route),platforms=[...main,...parse(branch,main.length,true)],end=main.at(-1)!;
 const {hazards,pressure,wind}=applyChallenge(index,platforms,main.length);
 // A checkpoint is a place to read the next encounter. Stronger shuttles and
 // belts must never carry the landing away from a restored save's fixed spawn.
 const middle=Math.floor(main.length/2),cp=main[middle].kind==='stone'?main[middle]:main.slice(1,middle).reverse().find(p=>p.kind==='stone')??main[0];
 const stationPlatforms=goal==='shelter'?[]:goal==='relay'||goal==='signal'||goal==='dawn'?[main[2],platforms[main.length+2],main[Math.min(main.length-2,4)]]:goal==='engine'?[main[2],main[main.length-2]]:[main[Math.max(1,main.length-2)]];
 const kind=goal==='rescue'?'survivor':goal==='engine'?'valve':goal==='ferry'?'bell':'lamp';
 const labels=kind==='survivor'?[rescueNameFor(index)]:kind==='valve'?['Intake wheel','Return wheel']:kind==='bell'?['Departure bell']:['West light','Hidden light','East light'];
 const stations:Station[]=stationPlatforms.map((p,id)=>({id,platform:p.id,x:p.x+p.w*.5,y:p.y,kind,label:labels[id]??'Signal light'}));
 const pickups:Pickup[]=[main[1],platforms[main.length+1],platforms.at(-1)!].map((p,id)=>({id,x:p.x+p.w*.65,y:p.y-30,kind:'spark'}));
 if(index>=3){const p=main[Math.min(3,main.length-2)];pickups.push({id:3,x:p.x+p.w*.8,y:p.y-52,kind:'dash'});}
 return {id:index,name:chapter.name,world,setting,goal,platforms,hazards,pickups,stations,mainCount:main.length,checkpoint:{x:cp.x+20,y:cp.y,platform:cp.id},exit:{x:end.x+end.w*.55,y:end.y-56,w:38,h:56},spawn:{x:72,y:main[0].y-24},width:Math.max(...platforms.map(p=>p.x+p.w))+110,height:Math.max(600,...platforms.map(p=>p.y+140)),hint:chapter.task,wind:wind??(world===3&&setting!=='cavern'?24:0),water:setting==='canal'?Math.max(...main.map(p=>p.y))+68:null,...(pressure===undefined?{}:{pressure})};
}
export const LEVELS:readonly Level[]=Array.from({length:LEVEL_COUNT},(_,i)=>createLevel(i));
