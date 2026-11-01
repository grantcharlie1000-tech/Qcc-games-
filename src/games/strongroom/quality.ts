export type Tier='potato'|'low'|'medium'|'high';
export const TIERS:readonly Tier[]=['potato','low','medium','high'];
export const QUALITY={
 potato:{scale:.6,dpr:1,shadows:0,post:'off',sky:'gradient',texture:256,dressing:'off',lights:0,lod:0,animationHz:15,fog:70,far:80,draws:80,triangles:100000,particles:48,debris:1,decals:24,tracer:3,smoke:6,voices:12,bots:5,thinkHz:5},
 low:{scale:.75,dpr:1,shadows:0,post:'off',sky:'baked',texture:512,dressing:'large',lights:0,lod:15,animationHz:15,fog:90,far:100,draws:120,triangles:200000,particles:96,debris:2,decals:48,tracer:2,smoke:10,voices:16,bots:5,thinkHz:8},
 medium:{scale:1,dpr:1.5,shadows:1024,post:'fxaa',sky:'baked',texture:512,dressing:'full',lights:4,lod:25,animationHz:30,fog:120,far:130,draws:200,triangles:400000,particles:192,debris:4,decals:96,tracer:1,smoke:16,voices:24,bots:9,thinkHz:10},
 high:{scale:1,dpr:2,shadows:2048,post:'bloom',sky:'atmosphere',texture:1024,dressing:'full',lights:8,lod:40,animationHz:60,fog:160,far:170,draws:350,triangles:800000,particles:384,debris:6,decals:192,tracer:1,smoke:24,voices:32,bots:9,thinkHz:10}
} as const;
export function defaultTier(d:{touch:boolean;cores?:number;memory?:number;ua:string;gpu?:string}):Tier{
 if(/Mali-G5|Mali-G7[0-2]|PowerVR|Adreno [3-5]|UHD Graphics 6|HD Graphics/i.test(d.gpu??''))return 'potato';
 if(d.touch)return (d.cores??8)<=4||(d.memory??8)<=4?'potato':'low';
 return /CrOS/.test(d.ua)?'low':'medium';
}
export const isTier=(x:unknown):x is Tier=>TIERS.includes(x as Tier);
export function hostRates(tier:Tier,passed:boolean){return {tickHz:tier==='potato'||!passed?30:60,snapshotHz:tier==='potato'?15:20,maxTeam:passed&&(tier==='medium'||tier==='high')?5:3};}
export class AutoQuality{
 scale:number;pending:Tier|null=null;lowered=false;
 private frames:{ms:number;at:number}[]=[];private slow:number|null=null;private fast:number|null=null;private changed=-Infinity;
 constructor(public tier:Tier,public manual:boolean,private touch:boolean){this.scale=QUALITY[tier].scale;}
 sample(ms:number,now:number,hidden:boolean):boolean{
  if(hidden||!Number.isFinite(ms)||ms<=0){this.frames=[];this.slow=this.fast=null;return false;}
  this.frames.push({ms,at:now});while(this.frames[0]?.at<now-2000)this.frames.shift();
  if(this.frames.length<10)return false;
  const values=this.frames.map(f=>f.ms).sort((a,b)=>a-b),p90=values[Math.floor((values.length-1)*.9)];
  const target=this.touch||this.tier==='potato'||this.tier==='low'?33.3:16.7;
  this.slow=p90>target*1.15?this.slow??now:null;this.fast=p90<target*.7?this.fast??now:null;
  if(now-this.changed<4000)return false;
  if(this.slow!==null&&now-this.slow>=3000){
   if(this.scale>.5){this.scale=Math.max(.5,Math.round((this.scale-.1)*100)/100);this.changed=now;this.lowered=true;return true;}
   if(!this.manual&&this.tier!=='potato')this.pending=TIERS[TIERS.indexOf(this.tier)-1];
  }
  if(this.fast!==null&&now-this.fast>=10000&&this.scale<QUALITY[this.tier].scale){this.scale=Math.min(QUALITY[this.tier].scale,Math.round((this.scale+.1)*100)/100);this.changed=now;this.fast=now;return true;}
  return false;
 }
 roundEnd(){if(!this.pending)return false;this.tier=this.pending;this.pending=null;this.scale=Math.min(this.scale,QUALITY[this.tier].scale);return true;}
 set(tier:Tier,manual=true){this.tier=tier;this.manual=manual;this.pending=null;this.scale=QUALITY[tier].scale;this.frames=[];this.slow=this.fast=null;}
}
export class HostGuard{
 thinkHz:number;farAnimationHz=15;private sum=0;private count=0;private since=0;private stage=0;
 constructor(hz:number){this.thinkHz=hz;}
 setTier(hz:number){this.thinkHz=this.stage>0?Math.max(4,hz/2):hz;this.sum=0;this.count=0;this.since=performance.now();}
 sample(ms:number,now:number){
  this.sum+=ms;this.count++;if(now-this.since<5000)return;
  if(this.sum/this.count>6){if(this.stage===0){this.thinkHz=Math.max(4,this.thinkHz/2);console.info('Strongroom: reduced bot thinking to keep host simulation within budget.');}else this.farAnimationHz=10;this.stage++;}
  this.sum=0;this.count=0;this.since=now;
 }
}
