import type {CampaignRoute,HazardPlacement} from './campaign-types';
import type {Goal,Setting} from './levels';

/** Routes of several minutes are written the way they are walked: each
 * landing is placed from the one before it (a gap and a rise), inside a named
 * place. The result is the same route string the short chapters use, plus what
 * the set painters need: which thing every landing is, and where each place
 * begins and ends. Nothing is generated; every landing is one authored call. */
export interface Opt {
 /** Surface code: s stone, e eave, c crumble, m mover (x), l lift (y), g grate, b spring, i ice, > < belts. */
 k?:string;
 /** Mover travel (amplitude) and speed (radians per second). */
 t?:number;v?:number;
 /** Crumble delay in seconds. */
 d?:number;
 /** Solid height. */
 h?:number;
 /** What this landing is, for the set painter. */
 tag?:string;
}
/** A place is one named, built thing along the route: a house, a shaft, a reach of water. */
export interface Place {kind:string;name:string;from:number;to:number;x0:number;x1:number;y0:number;y1:number;data?:Readonly<Record<string,number>>}
interface Spot {x:number;y:number;w:number;o:Opt}
const token=(s:Spot)=>{
 const {k='s',t,v,d,h}=s.o,fields=[s.x,s.y,s.w,k,t??'',v??'',d??'',h??''].map(String);
 while(fields.length>4&&fields.at(-1)==='')fields.pop();
 return fields.join(',');
};
export const G:Opt={k:'g'};
export const C=(d=.5,h=12):Opt=>({k:'c',d,h});
export const M=(t:number,v:number,h?:number):Opt=>({k:'m',t,v,h});
export const L=(t:number,v:number,h?:number):Opt=>({k:'l',t,v,h});
export const H=(h:number):Opt=>({h});
export const T=(tag:string,o:Opt={}):Opt=>({...o,tag});
export class Trail {
 private main:Spot[]=[];private side_:Spot[]=[];private tags:string[]=[];private sideTags:string[]=[];
 private role='';private next:string|undefined;
 private memories:number[]=[];private cps:number[]=[];private sectors:[number,string][]=[];private stations:[number,string][]=[];
 private hazards:HazardPlacement[]=[];private enemies:NonNullable<CampaignRoute['enemies']>[number][]=[];
 private places:Place[]=[];private marks=new Map<string,number>();
 constructor(x:number,y:number,w:number,o:Opt={}){this.put(x,y,w,o);}
 private get last(){return this.main.at(-1)!;}
 private put(x:number,y:number,w:number,o:Opt){
  if(this.next){this.sectors.push([this.main.length,this.next]);this.next=undefined;}
  this.main.push({x:Math.round(x),y:Math.round(y),w,o});this.tags.push(o.tag??this.role);
  const place=this.places.at(-1);if(place)place.to=this.main.length-1;
  return this;
 }
 /** Every landing from here on is this thing, until the next call. */
 tag(role:string){this.role=role;return this;}
 /** The next landing opens a named stretch of the route. */
 sec(name:string){this.next=name;return this;}
 /** The next landing opens a built place the set draws as one thing. */
 place(kind:string,name=kind,data?:Record<string,number>){this.places.push({kind,name,from:this.main.length,to:this.main.length,x0:0,x1:0,y0:0,y1:0,data});return this;}
 /** To the right of the last landing: gap between edges, rise (negative is up), width. */
 r(gap:number,dy:number,w:number,o:Opt={}){const p=this.last;return this.put(p.x+p.w+gap,p.y+dy,w,o);}
 /** To the left of the last landing. */
 l(gap:number,dy:number,w:number,o:Opt={}){const p=this.last;return this.put(p.x-gap-w,p.y+dy,w,o);}
 /** At a fixed x (a wall, a well, a column of rungs), a rise from the last landing. */
 x(x:number,dy:number,w:number,o:Opt={}){return this.put(x,this.last.y+dy,w,o);}
 /** At a fixed place in the world. */
 at(x:number,y:number,w:number,o:Opt={}){return this.put(x,y,w,o);}
 /** Rungs straight up (or down) from the last landing's column: count, rise each, width, offset. */
 rungs(count:number,dy:number,w:number,dx=0,o:Opt=G){const base=this.last;for(let i=1;i<=count;i++)this.put(base.x+dx,base.y+dy*i,w,o);return this;}
 /** Names the stretch that begins at the last landing. */
 here(name:string){this.sectors.push([this.main.length-1,name]);return this;}
 cp(){this.cps.push(this.main.length-1);return this;}
 mark(name:string){this.marks.set(name,this.main.length-1);return this;}
 id(name?:string){return name?this.marks.get(name)!:this.main.length-1;}
 station(label:string){this.stations.push([this.main.length-1,label]);return this;}
 hz(make:(ledge:number)=>HazardPlacement){this.hazards.push(make(this.main.length-1));return this;}
 enemy(kind:'crawler'|'moth',at:number,travel:number,period?:number,offset?:number){this.enemies.push({ledge:this.main.length-1,at,kind,travel,period,offset});return this;}
 /** An optional ledge off the route, placed from the last landing's top-left corner. */
 off(dx:number,dy:number,w:number,o:Opt={},memory=false){
  const p=this.last;if(memory)this.memories.push(this.side_.length);
  this.side_.push({x:Math.round(p.x+dx),y:Math.round(p.y+dy),w,o});this.sideTags.push(o.tag??this.role);return this;
 }
 /** An optional ledge at a fixed place in the world. */
 side(x:number,y:number,w:number,o:Opt={},memory=false){if(memory)this.memories.push(this.side_.length);this.side_.push({x,y,w,o});this.sideTags.push(o.tag??this.role);return this;}
 done(rest:{setting:Setting;goal:Goal}&Partial<CampaignRoute>):CampaignRoute {
  if(this.memories.length!==3)throw new Error(`A route carries three memories, not ${this.memories.length}`);
  for(const place of this.places){
   const spots=this.main.slice(place.from,place.to+1);
   place.x0=Math.min(...spots.map(s=>s.x-(s.o.k==='m'?s.o.t??28:0)));place.x1=Math.max(...spots.map(s=>s.x+s.w+(s.o.k==='m'?s.o.t??28:0)));
   place.y0=Math.min(...spots.map(s=>s.y-(s.o.k==='l'?s.o.t??24:0)));place.y1=Math.max(...spots.map(s=>s.y+(s.o.h??28)+(s.o.k==='l'?s.o.t??24:0)));
  }
  return {
   route:this.main.map(token).join(';'),branches:this.side_.map(token).join(';'),memories:this.memories as unknown as readonly [number,number,number],
   stations:this.stations,checkpoints:this.cps,sectors:this.sectors,hazards:this.hazards,...(this.enemies.length?{enemies:this.enemies}:{}),
   tags:[...this.tags,...this.sideTags],places:this.places,...rest,
  };
 }
}
export const trail=(x:number,y:number,w:number,o:Opt={})=>new Trail(x,y,w,o);
