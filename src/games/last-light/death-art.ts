import {Courier,type CourierAction} from './courier';
import {LEVELS,WORLDS,type Rect} from './levels';
import type {Run} from './model';
import {DEATH_DURATION,DEATH_IMPACT,type DeathCause} from './death';
type C=CanvasRenderingContext2D;
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const TINT:Record<DeathCause,string>={spikes:'#d8ac87',saw:'#d9c4a0',laser:'#a8ecf2',steam:'#edc4a2',crusher:'#c0b49a',enemy:'#d4a078',water:'#7bbfce',dark:'#a293c4',fall:'#f3c77a'};
function px(c:C,color:string,x:number,y:number,w=2,h=2){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);}
/** Analytic, cause-specific key poses on the native pixel grid. The courier
 * stays whole: no rotated sprites, scaled pixels, random pieces or screen flash. */
export class DeathAnimation {
 age=1;pose:Run|null=null;cameraX=0;cameraY=0;cause:DeathCause='fall';
 private frames:HTMLCanvasElement[]=[];
 private shadow:HTMLCanvasElement|null=null;private submerged:HTMLCanvasElement|null=null;private charge:HTMLCanvasElement|null=null;
 private contact:Rect|undefined;private enemyKind:'crawler'|'moth'|undefined;private kick=-1;
 get active(){return this.pose!==null&&this.age<DEATH_DURATION;}
 get impact(){return this.active&&this.age<DEATH_IMPACT;}
 begin(pose:Run,x:number,y:number,cause:DeathCause='fall',contact?:Rect,enemyKind?:'crawler'|'moth'){
  this.pose=pose;this.age=0;this.cameraX=x;this.cameraY=y;this.cause=cause;this.contact=contact;this.enemyKind=enemyKind;
  this.kick=contact?(Math.sign(pose.x+8-contact.x-contact.w/2)||-pose.facing):-pose.facing;
  const accent=WORLDS[LEVELS[pose.stage].world].accent;
  this.frames=(['fall','hurt','brace'] as CourierAction[]).map(action=>{
   const canvas=document.createElement('canvas');canvas.width=56;canvas.height=60;const c=canvas.getContext('2d')!;c.imageSmoothingEnabled=false;
   const ghost={...pose,x:20,y:24,pet:null,respawn:0,previousInteract:false,grounded:false,phase:'playing' as const};
   new Courier().draw(c,ghost,accent,true,{action,facing:pose.facing});return canvas;
  });
  const tint=(color:string)=>{const canvas=document.createElement('canvas');canvas.width=56;canvas.height=60;const c=canvas.getContext('2d')!;c.drawImage(this.frames[1],0,0);c.globalCompositeOperation='source-atop';c.fillStyle=color;c.fillRect(0,0,56,60);return canvas;};
  this.charge=tint('#9ad9df70');this.shadow=tint('#152031cc');this.submerged=tint('#426d8c99');
 }
 step(dt:number){this.age=Math.min(DEATH_DURATION,this.age+dt);if(this.age>=DEATH_DURATION)this.pose=null;}
 reset(){this.pose=null;this.age=1;this.frames=[];this.shadow=this.submerged=this.charge=null;}
 private body(c:C,x:number,y:number,frame:number){const art=this.frames[frame];if(art)c.drawImage(art,Math.round(x),Math.round(y));}
 private flecks(c:C,x:number,y:number,p:number,color:string,count=5){
  for(let i=0;i<count;i++){const side=i%2?1:-1;c.globalAlpha=(1-p)*.7;px(c,color,x+side*(2+p*(7+i*2)),y-p*(8+i*2)+p*p*19,1+i%2,1);}
 }
 drawBody(c:C,cx:number,cy:number,reduced:boolean){
  if(!this.impact||!this.pose||!this.frames.length)return;
  const s=this.pose,p=clamp(this.age/DEATH_IMPACT),move=clamp((this.age-.06)/.23),x=s.x-cx-20,y=s.y-cy-24,fx=s.x+8-cx,fy=s.y+24-cy,color=TINT[this.cause];
  const frame=this.age<.06?0:this.cause==='crusher'||this.age>.16?2:1;
  c.save();c.globalAlpha=1-clamp((this.age-.23)/.11);
  if(reduced){c.globalAlpha=1-p*.85;this.body(c,x,y,this.cause==='crusher'?2:1);px(c,color,fx-3,fy-37,6,1);c.restore();return;}
  switch(this.cause){
   case 'spikes':
    this.body(c,x+this.kick*Math.round(move*9),y-Math.round(Math.sin(move*Math.PI)*5),frame);
    this.flecks(c,fx,fy-2,p,color,4);break;
   case 'saw':
    this.body(c,x+this.kick*Math.round(move*19),y-Math.round(Math.sin(move*Math.PI)*9),frame);
    // One short directional scrape communicates the blade, not confetti.
    if(p<.65){px(c,'#f1d9aa',fx-this.kick*4,fy-16,Math.max(1,Math.round(9*(1-p))),1);this.flecks(c,fx,fy-17,p,color,5);}break;
   case 'laser':
    if(this.age<.08)c.drawImage(this.charge!,Math.round(x),Math.round(y));
    else for(let row=0;row<60;row+=2){if(move>(60-row)/60+.16)continue;c.drawImage(this.frames[1],0,row,56,2,Math.round(x),Math.round(y+row),56,2);}
    this.flecks(c,fx,fy-15,p,color,4);break;
   case 'steam':
    this.body(c,x+this.kick*Math.round(move*8),y-Math.round(move*6),frame);
    for(let i=0;i<6;i++){const q=clamp(move-i*.06);c.globalAlpha=(1-p)*.24;px(c,i%2?'#e6d9bc':'#bdc9c2',fx+(i%2?1:-1)*(3+q*9),fy-i*4-q*17,4,3);}break;
   case 'crusher':
    this.body(c,x,y,frame);
    this.flecks(c,fx,fy-2,p,color,6);break;
   case 'enemy':
    this.body(c,x+this.kick*Math.round(move*20),y-Math.round(Math.sin(move*Math.PI)*(this.enemyKind==='moth'?15:9)),frame);
    this.flecks(c,fx,fy-15,p,color,5);break;
   case 'water':{
    const surface=(this.contact?.y??LEVELS[s.stage].water??s.y+24)-cy,sink=Math.round(move*28);
    c.save();c.beginPath();c.rect(0,0,c.canvas.width,Math.max(0,surface));c.clip();this.body(c,x,y+sink,frame);c.restore();
    c.save();c.beginPath();c.rect(0,surface,c.canvas.width,c.canvas.height);c.clip();c.globalAlpha=(1-p)*.6;c.drawImage(this.submerged!,Math.round(x),Math.round(y+sink));c.restore();
    for(let i=0;i<6;i++){const side=i%2?1:-1;c.globalAlpha=(1-p)*.75;px(c,color,fx+side*(4+move*(10+i)),surface-Math.sin(move*Math.PI)*(5+i),2,2);}
    c.globalAlpha=(1-p)*.65;px(c,color,fx-6-move*22,surface,12+Math.round(move*44),1);break;
   }
   case 'dark':
    c.drawImage(this.shadow!,Math.round(x),Math.round(y));
    for(let col=0;col<56;col+=2){if((s.facing>0?col:56-col)/56<move)continue;c.drawImage(this.frames[1],col,0,2,60,Math.round(x+col),Math.round(y),2,60);}
    this.flecks(c,fx-move*15,fy-15,p,color,4);break;
   case 'fall':
    // Continue the original trajectory. Nothing pops up from below the view.
    this.body(c,x+Math.round(s.vx*move*.035),y+Math.round(move*move*27),frame);
    this.flecks(c,fx,fy-15,p,color,3);break;
  }
  c.restore();
 }
 drawTransition(c:C,_w:number,_h:number,run:Run,cx:number,cy:number,reduced:boolean){
  if(!this.active||this.impact)return;
  const p=clamp((this.age-DEATH_IMPACT)/(DEATH_DURATION-DEATH_IMPACT)),x=Math.round(run.x+8-cx),y=Math.round(run.y+12-cy),r=reduced?13:Math.round(8+p*13);
  // Checkpoint-local motes: no full-screen fade, expanding HUD rings or flashes.
  c.save();c.globalAlpha=(1-p)*.65;
  for(let i=0;i<6;i++){const a=i*Math.PI/3;px(c,WORLDS[LEVELS[run.stage].world].accent,x+Math.cos(a)*r,y+Math.sin(a)*r,1,2);}c.restore();
 }
}
