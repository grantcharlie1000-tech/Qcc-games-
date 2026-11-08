export type Mode = 'solo' | 'duel' | 'rival' | 'master';
export type Spin = -1 | 0 | 1;
export interface Shot { angle: number; power: number; spin: Spin }
export interface Puck { x: number; z: number; seat: number; bonus: number }
interface Body extends Puck { vx: number; vz: number }
export interface Match { mode: Mode; end: number; shots: Shot[] }
export interface Course {
  names: [string,string]; targetX:number; pegs: [number,number][]; current:number;
  gate: [number,number] | null; tip:string;
}
export const COURSES:Course[]=[
  {names:['Sunset Pier','Candlelight Pier'],targetX:0,pegs:[[-2.15,.5],[2.15,.5]],current:0,gate:null,tip:'Bank off a side rail for +1 if the puck finishes in a ring.'},
  {names:['Tidal Narrows','Frostwater Pass'],targetX:-.42,pegs:[[-1.1,1.6],[1.9,-1.6]],current:3,gate:null,tip:'The striped current pulls right. Curl left or use the far rail.'},
  {names:['Beacon Reach','North Star Quay'],targetX:.38,pegs:[[-1.65,2.6],[1.7,-2.1]],current:-1.6,gate:[.65,.25],tip:'Thread the gold gate for +2. The puck must still finish in a ring.'},
  {names:['Breakwater','Holly Breakwater'],targetX:-.45,pegs:[[0,2.6],[-2.2,-1.2],[1.45,-2.2]],current:0,gate:[-1.1,.5],tip:'The centre lane is blocked. Draw around the guard and through the left gate.'},
  {names:['Switchback Sound','Snowbell Sound'],targetX:.5,pegs:[[-1.35,3.2],[.8,.05],[-.9,-2.35]],current:-4.2,gate:[1.85,.7],tip:'A strong left current meets the slalom. Keep a right curl in reserve.'},
  {names:['Lantern Hook','Solstice Hook'],targetX:0,pegs:[[0,3.4],[-1.7,.65],[1.6,.3],[.15,-2.4]],current:3.8,gate:[-.6,-.95],tip:'Protect your scoring pucks. The final guard rewards a wide bank.'},
];
export const singles=(mode:Mode)=>mode==='solo'||mode==='master';
export const courseIndex=(m:Match,end=m.end)=>end+(m.mode==='master'?3:0);
export const WIDTH = 3.8, LENGTH = 9, RADIUS = .43, START = 7.1, TARGET = -4.8;
export const FPS = 60;
export const DEFAULT_SHOT: Shot = {angle: 0, power: 60, spin:0};
export const capacity = (mode: Mode) => singles(mode) ? 4 : 8;
export const seatAt = (mode: Mode, i: number) => singles(mode) ? 0 : (i+Math.floor(i/8))%2;
export const fresh = (mode: Mode = 'solo'): Match => ({mode,end:0,shots:[]});
export const endCount = (m:Match) => m.shots.length-m.end*capacity(m.mode);
export const endOver = (m:Match) => endCount(m)===capacity(m.mode);
export function hasSpin(m:Match,spin:Spin){
  if(!spin)return true;
  return !m.shots.slice(m.end*capacity(m.mode)).some((s,i)=>seatAt(m.mode,m.end*capacity(m.mode)+i)===seatAt(m.mode,m.shots.length)&&s.spin===spin);
}
export function validShot(value: unknown): value is Shot {
  if (!value || typeof value !== 'object') return false;
  const {angle, power, spin} = value as Shot;
  return Number.isInteger(angle) && Math.abs(angle) <= 46 && Number.isInteger(power) && power >= 10 && power <= 100 && (spin===0||spin===1||spin===-1);
}
export function readMatch(value: unknown): Match | null {
  if (!value || typeof value !== 'object') return null;
  const {mode, end, shots} = value as Match;
  if ((mode !== 'solo' && mode !== 'duel' && mode !== 'rival' && mode!=='master') || !Number.isInteger(end)||end<0||end>=3||!Array.isArray(shots) || shots.length < end*capacity(mode)||shots.length > (end+1)*capacity(mode) || !shots.every(validShot)) return null;
  const m=fresh(mode);
  for(const s of shots){
    if(endOver(m))m.end++;
    if(!hasSpin(m,s.spin))return null;
    m.shots.push({angle:s.angle,power:s.power,spin:s.spin});
  }
  m.end=end;return m;
}
export function points(p: Puck,course=0): number {
  const d = Math.hypot(p.x-COURSES[course].targetX, p.z - TARGET);
  return (d <= .72 ? 8 : d <= 1.55 ? 5 : d <= 2.53 ? 3 : d <= 3.25 ? 1 : 0)+(d<=3.25?p.bonus:0);
}
export function totals(pucks: readonly Puck[],course=0): [number, number] {
  const scores: [number, number] = [0, 0];
  for (const p of pucks) scores[p.seat] += points(p,course);
  return scores;
}
function collide(a: Body, b: Body) {
  const dx=b.x-a.x, dz=b.z-a.z, d=Math.hypot(dx,dz);
  if (d >= RADIUS*2) return;
  const nx=d > 0 ? dx/d : 1, nz=d > 0 ? dz/d : 0;
  const overlap=(RADIUS*2-d)*.5;
  a.x-=nx*overlap; a.z-=nz*overlap; b.x+=nx*overlap; b.z+=nz*overlap;
  const speed=(a.vx-b.vx)*nx+(a.vz-b.vz)*nz;
  if(speed <= 0) return;
  const impulse=speed*.92;
  a.vx-=impulse*nx; a.vz-=impulse*nz; b.vx+=impulse*nx; b.vz+=impulse*nz;
}
function move(b: Body, course:Course,spin:Spin) {
  const v=Math.hypot(b.vx,b.vz);
  const previousZ=b.z;
  if (v > 0) {
    const drift=(b.z > -1 && b.z < 3.4 ? course.current : 0)+spin*2.7;
    const turn=drift/(FPS*14),vx=b.vx;
    b.vx=vx*Math.cos(turn)-b.vz*Math.sin(turn);b.vz=vx*Math.sin(turn)+b.vz*Math.cos(turn);
    const next=Math.max(0,v-7/FPS);
    const travel=(v+next)/(2*FPS*v);
    b.x+=b.vx*travel; b.z+=b.vz*travel;
    b.vx*=next/v; b.vz*=next/v;
  }
  const wall=WIDTH-RADIUS, end=LENGTH-RADIUS;
  if(Math.abs(b.x)>wall){b.x=Math.sign(b.x)*wall;b.vx=-Math.sign(b.x)*Math.abs(b.vx)*.88;b.bonus|=1;}
  if(Math.abs(b.z)>end){b.z=Math.sign(b.z)*end;b.vz=-Math.sign(b.z)*Math.abs(b.vz)*.75;}
  if(course.gate && previousZ>course.gate[1]&&b.z<=course.gate[1]&&Math.abs(b.x-course.gate[0])<=.72)b.bonus|=2;
  for(const [x,z] of course.pegs){
    const dx=b.x-x,dz=b.z-z,d=Math.hypot(dx,dz),r=RADIUS+.34;
    if(d>=r)continue;
    const nx=d?dx/d:1,nz=d?dz/d:0;
    b.x=x+nx*r;b.z=z+nz*r;
    const speed=b.vx*nx+b.vz*nz;
    if(speed<0){b.vx-=1.85*speed*nx;b.vz-=1.85*speed*nz;}
  }
}
/** One deterministic run supplies both the animation frames and its final scoring positions. */
export function slide(settled: readonly Puck[], shot: Shot, seat: number,course=0,finalOnly=false): Puck[][] {
  const a=shot.angle*Math.PI/180, speed=4.4+shot.power*.131;
  const bodies:Body[]=settled.map(p=>({...p,vx:0,vz:0}));
  bodies.push({x:0,z:START,seat,bonus:0,vx:Math.sin(a)*speed,vz:-Math.cos(a)*speed});
  const snapshot=()=>bodies.map(({x,z,seat,bonus})=>({x,z,seat,bonus}));
  const frames=finalOnly?[]:[snapshot()];
  for(let tick=0;tick<260;tick++){
    for(const b of bodies) move(b,COURSES[course],b===bodies.at(-1)?shot.spin:0);
    for(let i=0;i<bodies.length;i++) for(let j=i+1;j<bodies.length;j++) collide(bodies[i],bodies[j]);
    if(!finalOnly)frames.push(snapshot());
    if(bodies.every(b=>Math.abs(b.vx)+Math.abs(b.vz)<.002))break;
  }
  return finalOnly?[snapshot()]:frames;
}
export function replay(match: Match, end=match.end): Puck[] {
  let pucks:Puck[]=[];
  const start=end*capacity(match.mode);
  match.shots.slice(start,start+capacity(match.mode)).forEach((s,i)=>{pucks=slide(pucks,s,seatAt(match.mode,start+i),courseIndex(match,end),true)[0];});
  return pucks;
}
