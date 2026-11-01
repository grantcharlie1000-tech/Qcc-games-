import {PHASES,type Entity,type InputFrame,type Phase,type Seat,type Simulation} from '../sim';
export const NET_VERSION=1,ENTITY_STRIDE=18,INPUT_STRIDE=10;
const int=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
export interface Snapshot{epoch:number;round:number;tick:number;time:number;phase:Phase;timer:number;scores:[number,number];winner:0|1;entities:Entity[]}
/** [seat, xyz cm, velocity cm/s, yaw/pitch mrad, hp, mag, reserve, flags, gun, reload ms, E, D, ack]. */
export function packEntity(e:Entity):number[]{return[e.seat,Math.round(e.x*100),Math.round(e.y*100),Math.round(e.z*100),Math.round(e.vx*100),Math.round(e.vy*100),Math.round(e.vz*100),Math.round(e.yaw*1000),Math.round(e.pitch*1000),e.hp,e.ammo,e.reserve,(e.crouch?1:0)|(e.ground?2:0)|(e.bot?4:0)|(e.team<<3)|(e.away!==null?16:0)|(e.jumpHeld?32:0),e.weapon,Math.round(e.reload*1000),e.kills,e.deaths,e.ack];}
export function unpackEntity(p:unknown,seats:readonly Seat[]=[]):Entity|null{
 if(!Array.isArray(p)||p.length!==ENTITY_STRIDE||!p.every(Number.isInteger))return null;
 const [seat,x,y,z,vx,vy,vz,yaw,pitch,hp,ammo,reserve,flags,weapon,reload,kills,deaths,ack]=p;
 if(!int(seat,0,9)||!int(x,-5200,5200)||!int(y,-200,2000)||!int(z,-4200,4200)||![vx,vy,vz].every(v=>int(v,-3000,3000))||!int(yaw,-3142,3142)||!int(pitch,-1450,1450)||!int(hp,0,255)||!int(ammo,0,100)||!int(reserve,0,1000)||!int(flags,0,63)||!int(weapon,0,1)||!int(reload,0,10000)||!int(kills,0,10000)||!int(deaths,0,10000)||!int(ack,0,1e9))return null;
 const meta=seats.find(s=>s.seat===seat);return{seat,name:meta?.name??`Bot ${seat}`,peer:meta?.peer,team:flags&8?1:0,bot:!!(flags&4),x:x/100,y:y/100,z:z/100,vx:vx/100,vy:vy/100,vz:vz/100,yaw:yaw/1000,pitch:pitch/1000,hp,ammo,reserve,mags:[30,12],reserves:[150,72],crouch:!!(flags&1),ground:!!(flags&2),weapon,reload:reload/1000,kills,deaths,ack,nextFire:0,away:flags&16?0:null,jumpHeld:!!(flags&32)};
}
export function packSnapshot(s:Simulation,epoch:number):(string|number)[]{return['s',NET_VERSION,epoch,s.round,s.tick,Math.round(s.time),PHASES.indexOf(s.phase),Math.round(s.timer*1000),...s.scores,s.winner,s.entities.length,...s.entities.flatMap(packEntity)];}
export function unpackSnapshot(p:unknown,seats:readonly Seat[]=[]):Snapshot|null{
 if(!Array.isArray(p)||p[0]!=='s'||p[1]!==NET_VERSION||p.length<12||!p.slice(1).every(Number.isInteger))return null;
 const [,version,epoch,round,tick,time,phase,timer,score0,score1,winner,count]=p;
 if(!int(epoch,1,Number.MAX_SAFE_INTEGER)||!int(round,1,10000)||!int(tick,0,1e9)||!int(time,0,1e9)||!int(phase,0,PHASES.length-1)||!int(timer,0,1e6)||!int(score0,0,1000)||!int(score1,0,1000)||!int(winner,0,1)||!int(count,1,10)||p.length!==12+count*ENTITY_STRIDE)return null;
 const entities:Entity[]=[];for(let n=0;n<count;n++){const e=unpackEntity(p.slice(12+n*ENTITY_STRIDE,12+(n+1)*ENTITY_STRIDE),seats);if(!e||entities.some(x=>x.seat===e.seat))return null;entities.push(e);}
 return{epoch,round,tick,time,phase:PHASES[phase],timer:timer/1000,scores:[score0,score1],winner:winner as 0|1,entities};
}
export function packInputs(epoch:number,round:number,frames:readonly InputFrame[]):(number|string)[]{return['i',epoch,round,...frames.slice(-3).flatMap(i=>[i.seq,Math.round(i.at),Math.round(i.view),i.x,i.z,Math.round(Math.atan2(Math.sin(i.yaw),Math.cos(i.yaw))*1000),Math.round(i.pitch*1000),i.buttons,i.weapon,0])];}
export function unpackInputs(p:unknown):{epoch:number;round:number;frames:InputFrame[]}|null{
 if(!Array.isArray(p)||p[0]!=='i'||!int(p[1],1,Number.MAX_SAFE_INTEGER)||!int(p[2],1,10000)||p.length<3+INPUT_STRIDE||p.length>3+3*INPUT_STRIDE||(p.length-3)%INPUT_STRIDE)return null;
 const frames:InputFrame[]=[];for(let n=3;n<p.length;n+=INPUT_STRIDE){const [seq,at,view,x,z,yaw,pitch,buttons,weapon,reserved]=p.slice(n,n+INPUT_STRIDE);if(!int(seq,1,1e9)||!int(at,0,1e9)||!int(view,0,1e9)||!int(x,-127,127)||!int(z,-127,127)||!int(yaw,-3142,3142)||!int(pitch,-1450,1450)||!int(buttons,0,127)||!int(weapon,0,1)||reserved!==0)return null;frames.push({seq,at,view,x,z,yaw:yaw/1000,pitch:pitch/1000,buttons,weapon});}
 return{epoch:p[1],round:p[2],frames};
}
