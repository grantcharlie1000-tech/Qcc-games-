import {createMatch,step} from '../../../src/games/quad-clash/sim';
import {idleIntent,viewDir,type Fighter,type Intent,type Match} from '../../../src/games/quad-clash/state';
import {STEP,type ModeId,type PrimaryId} from '../../../src/games/quad-clash/config';
import type {MapId} from '../../../src/games/quad-clash/map';

/** A match with only the fighters listed kept alive (others parked far in the future), so tests control every shot. */
export function duel(opts:{mode?:ModeId;map?:MapId;primary?:PrimaryId;keep?:number[];seed?:number}={}):Match{
  const m=createMatch({mode:opts.mode??'brawl',map:opts.map??'quad',difficulty:'normal',primary:opts.primary??'bell',seed:opts.seed??5});
  const keep=new Set(opts.keep??[0,1]);
  for(const f of m.fighters)if(!keep.has(f.id)){f.alive=false;f.respawnAt=1e9;}
  for(const f of m.fighters)f.protectUntil=0;
  m.events.length=0;
  return m;
}
/** Puts fighter `b` `dist` metres straight ahead (north) of fighter `a` in the Quad's open west lane (x = -28). */
export function face(m:Match,a:Fighter,b:Fighter,dist:number){
  a.x=-28;a.z=22;a.y=0;a.yaw=0;a.pitch=0;a.vx=a.vy=a.vz=0;
  const d=viewDir(0,0);b.x=a.x+d.x*dist;b.z=a.z+d.z*dist;b.y=0;b.vx=b.vy=b.vz=0;b.yaw=Math.PI;
}
export function run(m:Match,seconds:number,intents:(t:number)=>(Intent|undefined)[]=()=>[]){
  const n=Math.round(seconds/STEP);
  for(let i=0;i<n;i++)step(m,STEP,intents(i));
}
export const hold=(f:Fighter,patch:Partial<Intent>={}):Intent=>({...idleIntent(f.yaw,f.pitch),...patch});
export const eventsOf=<T extends Match['events'][number]['type']>(m:Match,type:T)=>m.events.filter(e=>e.type===type) as Extract<Match['events'][number],{type:T}>[];
