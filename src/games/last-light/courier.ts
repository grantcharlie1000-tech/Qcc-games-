import {petPose} from './affection';
import {PLAYER_H,PLAYER_W,type Events,type Run} from './model';

export type CourierAction='idle'|'run'|'rise'|'fall'|'wall'|'dash'|'land'|'respawn'|'celebrate'|'brake'|'interact'|'pet'|'hurt'|'brace';
interface Particle {x:number;y:number;vx:number;vy:number;life:number;duration:number;kind:'dust'|'ember'}
interface Echo {x:number;y:number;facing:number;life:number}
interface Stride {back:readonly[number,number,number,number];front:readonly[number,number,number,number];bob:number;arm:number}
const STRIDES:readonly Stride[]=[
 {back:[8,27,4,32],front:[16,26,20,29],bob:0,arm:-2},
 {back:[8,28,6,33],front:[17,28,19,32],bob:1,arm:-1},
 {back:[10,28,11,32],front:[15,29,17,33],bob:0,arm:0},
 {back:[12,27,15,30],front:[13,28,11,32],bob:-1,arm:2},
 {back:[16,26,20,29],front:[8,27,4,32],bob:0,arm:2},
 {back:[17,28,19,32],front:[8,28,6,33],bob:1,arm:1},
 {back:[15,29,17,33],front:[10,28,11,32],bob:0,arm:0},
 {back:[13,28,11,32],front:[12,27,15,30],bob:-1,arm:-2},
];
const STILL:Stride={back:[9,28,8,33],front:[15,28,15,33],bob:0,arm:0};
const COLORS={outline:'#15202b',deep:'#293d48',hood:'#52766f',hoodLight:'#92ac8c',hoodShade:'#324f50',cloth:'#466b64',clothLight:'#8a9e7d',clothShade:'#2c4748',stitch:'#b8b897',skin:'#e6c5a4',skinShade:'#ba8d77',hair:'#57443c',scarf:'#b36449',scarfLight:'#e5a36a',scarfShade:'#783e3b',leather:'#725446',leatherLight:'#ac8260',trousers:'#394755',trouserLight:'#687484',sole:'#b8a68a',metal:'#e4c18b'};

/** Presentation state only: it never changes collision, input, scores or saved progress. */
export class Courier {
 private source:Run|undefined;
 private stage=-1;
 private deaths=-1;
 private clock=0;
 private gait=0;
 private landing=0;
 private wasGrounded=false;
 private lastFoot=-1;
 private echoWait=0;
 private cloth=0;private lantern=0;private lanternVelocity=0;private previousVx=0;private previousVy=0;private impact=0;
 private readonly particles:Particle[]=Array.from({length:20},()=>({x:0,y:0,vx:0,vy:0,life:0,duration:1,kind:'dust'}));
 private readonly echoes:Echo[]=Array.from({length:4},()=>({x:0,y:0,facing:1,life:0}));

 private sync(s:Run){
  if(this.source===s&&this.stage===s.stage&&this.deaths===s.deaths&&s.clock>=this.clock)return;
  this.source=s;this.stage=s.stage;this.deaths=s.deaths;this.clock=s.clock;this.gait=0;this.landing=0;this.wasGrounded=s.grounded;this.lastFoot=-1;this.echoWait=0;this.cloth=0;this.lantern=0;this.lanternVelocity=0;this.previousVx=s.vx;this.previousVy=s.vy;this.impact=0;
  for(const p of this.particles)p.life=0;
  for(const echo of this.echoes)echo.life=0;
 }
 tick(s:Run,events:Events,dt:number){
  this.sync(s);this.clock=s.clock;
  this.cloth+=(-s.vx*s.facing*.018-this.cloth)*(1-Math.exp(-dt*11));
  const acceleration=(s.vx-this.previousVx)/Math.max(.001,dt);this.previousVx=s.vx;
  this.lanternVelocity+=(-this.lantern*100-this.lanternVelocity*14-acceleration*.014)*dt;
  this.lantern+=this.lanternVelocity*dt;this.lantern=Math.max(-4,Math.min(4,this.lantern));
  this.landing=Math.max(0,this.landing-dt);this.echoWait=Math.max(0,this.echoWait-dt);
  if(events.death){this.landing=0;for(const echo of this.echoes)echo.life=0;for(const p of this.particles)p.life=0;}
  if(events.land&&!events.death&&(!this.wasGrounded||events.jump)){this.landing=.18;this.impact=Math.min(1,Math.abs(this.previousVy)/650+.3);this.dust(s,7);}
  if(events.jump&&!events.death){this.landing=0;this.dust(s,3);}
  if(s.grounded&&Math.abs(s.vx)>20){
   // Foot cadence follows distance, so slowing down does not produce a running-in-place cycle.
   this.gait+=Math.abs(s.vx)*dt/62;
   const foot=Math.floor(this.gait*2);
   if(foot!==this.lastFoot){this.lastFoot=foot;this.dust(s,1);}
  }else this.lastFoot=-1;
  for(const p of this.particles)if(p.life>0){p.life=Math.max(0,p.life-dt);p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=(p.kind==='dust'?65:-12)*dt;}
  for(const echo of this.echoes)echo.life=Math.max(0,echo.life-dt);
  if(s.dashLeft>0&&this.echoWait===0){
   const echo=this.echoes.find(e=>e.life===0);
   if(echo)Object.assign(echo,{x:s.x,y:s.y,facing:s.facing,life:.13});
   const ember=this.particles.find(p=>p.life===0);
   if(ember)Object.assign(ember,{x:s.x+8,y:s.y+12,vx:-s.facing*35,vy:-12,life:.25,duration:.25,kind:'ember'});
   this.echoWait=.032;
  }
  this.wasGrounded=s.grounded;this.previousVy=s.vy;
 }
 private dust(s:Run,count:number){
  for(let i=0;i<count;i++){
   const p=this.particles.find(p=>p.life===0);if(!p)break;
   const duration=.18+i*.025;
   Object.assign(p,{x:s.x+PLAYER_W/2+(i-count/2)*3,y:s.y+PLAYER_H-1,vx:(i-count/2)*17-s.vx*.1,vy:-18-i*5,life:duration,duration,kind:'dust'});
  }
 }
 action(s:Run):CourierAction {
  this.sync(s);
  if(s.respawn>0)return 'respawn';
  if(s.phase!=='playing')return 'celebrate';
  if(s.dashLeft>0)return 'dash';
  if(s.pet)return 'pet';
  if(s.grounded){if(s.previousInteract)return 'interact';if(s.facing*s.vx< -35)return 'brake';if(this.landing>0)return 'land';return Math.abs(s.vx)>20?'run':'idle';}
  if(s.wall&&s.vy>=0)return 'wall';
  if(s.clock===0)return 'idle';
  return s.vy< -25?'rise':'fall';
 }
 draw(c:CanvasRenderingContext2D,s:Run,accent:string,reduced:boolean,presentation?:{action:CourierAction;facing:number;settle?:number}){
  this.sync(s);
  const affection=petPose(s,reduced),action=presentation?.action??this.action(s),face=presentation?.facing??affection?.facing??(action==='wall'?s.wall:s.facing),pet=affection?.weight??0;
  if(!reduced){
   for(const echo of this.echoes)if(echo.life>0){
    c.save();c.globalAlpha=echo.life/.13*.20;c.translate(Math.round(echo.x+8),Math.round(echo.y+24));c.scale(echo.facing,1);
    c.fillStyle='#a8e1e5';c.fillRect(-5,-32,12,10);c.fillRect(-8,-23,18,14);c.fillRect(-13,-22,8,3);c.fillRect(-10,-9,9,4);c.restore();
   }
   for(const p of this.particles)if(p.life>0){c.save();c.globalAlpha=p.life/p.duration*.6;c.fillStyle=p.kind==='dust'?'#c4b6a1':accent;c.fillRect(Math.round(p.x),Math.round(p.y),p.kind==='dust'?2:1,p.kind==='dust'?1:2);c.restore();}
  }
  const airborne=!s.grounded&&s.clock>0&&s.respawn===0;
  c.save();c.globalAlpha*=s.respawn>0&&!reduced?Math.max(.3,1-s.respawn/.35):1;
  const squash=action==='land'&&!reduced?(presentation?.settle??this.landing/.18*this.impact):0;
  c.translate(Math.round(s.x+PLAYER_W/2),Math.round(s.y+PLAYER_H));c.scale(face*(1+squash*.1),1-squash*.08);c.translate(-12,-34);
  const gait=this.gait*8,frame=STRIDES[Math.floor(gait)%STRIDES.length],next=STRIDES[(Math.floor(gait)+1)%STRIDES.length],blend=gait%1;
  const interpolate=(a:readonly number[],b:readonly number[])=>a.map((v,i)=>v+(b[i]-v)*blend) as unknown as Stride['front'];
  const stride:Stride=action==='run'?{front:interpolate(frame.front,next.front),back:interpolate(frame.back,next.back),bob:frame.bob+(next.bob-frame.bob)*blend,arm:frame.arm+(next.arm-frame.arm)*blend}:STILL;
  const bob=reduced?0:action==='run'?stride.bob:action==='idle'?Math.round(Math.sin(s.clock*2.7)*.6):0;
  const crouch=action==='brace'?7:action==='hurt'?3:action==='pet'?Math.round(pet*5):action==='land'&&!reduced?Math.ceil(2*(presentation?.settle??this.landing/.18)):0;
  const lean=action==='hurt'?-3:action==='brace'?1:action==='pet'?Math.round(pet*3):action==='dash'?3:action==='rise'?1:action==='wall'?2:action==='brake'?-2:action==='run'?1:0;
  const by=bob+crouch;
  const back=action==='brace'?[5,30,4,33]:action==='hurt'?[7,27,3,32]:action==='pet'?[7,29,5,33]:action==='land'?[7,28,5,33]:action==='brake'?[8,28,5,33]:action==='interact'?[9,28,7,33]:action==='rise'?[8,25,4,28]:action==='fall'?[8,27,6,31]:action==='dash'?[6,26,1,29]:action==='wall'?[8,27,5,32]:stride.back;
  const front=action==='brace'?[20,30,22,33]:action==='hurt'?[18,29,21,33]:action==='pet'?[18,29,20,33]:action==='land'?[17,28,19,33]:action==='brake'?[17,27,21,33]:action==='interact'?[16,28,16,33]:action==='rise'?[16,25,17,29]:action==='fall'?[16,28,18,33]:action==='dash'?[16,28,21,31]:action==='wall'?[19,25,22,28]:stride.front;
  this.leg(c,10,24+crouch,back,true); // rear leg sits behind the coat and satchel
  // The scarf narrows toward its tip. Its wave travels away from the knot,
  // while local-space inertia keeps turns readable in either direction.
  const tail=action==='dash'?11:action==='run'||airborne?9:5;
  for(let i=2;i>=0;i--){
   const moving=action==='run'||airborne;
   const wave=reduced?0:Math.round(Math.sin(s.clock*(moving?11:2.7)-i*.85)*(moving?1.5:.35));
   const x=7-i*(tail/3)+(reduced?0:this.cloth*i*.12);
   const y=14+by+wave+(moving?-i:i*2),width=6-i;
   this.rect(c,COLORS.outline,x-1,y-1,width+2,4);
   this.rect(c,i===2?COLORS.scarfShade:COLORS.scarf,x,y,width,2);
   if(i<2)this.rect(c,COLORS.scarfLight,x+1,y,width-1,1);
  }
  // Rear elbow counterbalances the carrying arm; it stays behind the bag.
  const rearElbow=action==='run'?7-stride.arm:action==='dash'?2:6;
  this.line(c,9+lean,16+by,rearElbow,21+by,4,COLORS.outline);
  this.line(c,9+lean,16+by,rearElbow,21+by,2,COLORS.clothShade);
  // Padded leather satchel, flap, stitched border and brass clasp.
  this.rect(c,COLORS.outline,1+lean,15+by,9,13);this.rect(c,COLORS.leather,2+lean,16+by,7,10);
  this.rect(c,COLORS.leatherLight,2+lean,16+by,7,3);this.rect(c,'#bc9a74',3+lean,20+by,1,4);this.rect(c,COLORS.metal,6+lean,19+by,2,2);
  // Layered jacket: collar, side shadow, lapel, diagonal strap and split tails.
  this.rect(c,COLORS.outline,7+lean,14+by,12,14);this.rect(c,COLORS.clothShade,7+lean,15+by,11,12);
  this.rect(c,COLORS.cloth,9+lean,15+by,8,11);this.rect(c,COLORS.clothLight,15+lean,16+by,2,9);
  const hem=reduced?0:Math.round(this.cloth*.22);
  this.rect(c,COLORS.outline,6+lean+hem,24+by,6,5);this.rect(c,COLORS.cloth,7+lean+hem,24+by,5,4);this.rect(c,COLORS.clothShade,13+lean,24+by,6,3);
  this.rect(c,COLORS.stitch,8+lean+hem,26+by,3,1);this.rect(c,COLORS.stitch,15+lean,25+by,3,1);
  for(let i=0;i<5;i++){this.rect(c,COLORS.leather,9+lean+i,15+by+i,2,3);}
  this.rect(c,COLORS.metal,13+lean,19+by,3,2);this.rect(c,COLORS.deep,14+lean,19+by,1,1);
  this.rect(c,COLORS.leather,9+lean,23+by,8,2);this.rect(c,COLORS.metal,14+lean,23+by,2,1);
  this.leg(c,14,24+crouch,front,false);
  // Reference-led tailoring: folded pocket, cuff patch and warm metal catches.
  this.rect(c,'#2c4748',10+lean,20+by,3,3);this.rect(c,'#a9ae86',10+lean,20+by,3,1);
  this.rect(c,'#b69768',8+lean,25+by,1,1);this.rect(c,'#b69768',11+lean,26+by,1,1);
  this.rect(c,'#3b5550',16+lean,21+by,1,3);
  this.rect(c,'#cfb180',2+lean,18+by,1,1);this.rect(c,'#cfb180',2+lean,23+by,1,1);this.rect(c,'#403d35',7+lean,23+by,1,2);
  // Hood has a scalloped silhouette, rim stitches, a shaded face and loose hair.
  this.rect(c,COLORS.outline,8+lean,0+by,7,2);this.rect(c,COLORS.outline,6+lean,2+by,12,2);this.rect(c,COLORS.outline,4+lean,3+by,16,9);this.rect(c,COLORS.outline,6+lean,12+by,13,3);
  this.rect(c,COLORS.hoodShade,5+lean,4+by,14,9);this.rect(c,COLORS.hood,8+lean,1+by,7,3);this.rect(c,COLORS.hood,7+lean,3+by,10,2);
  this.rect(c,COLORS.hood,5+lean,5+by,6,7);this.rect(c,COLORS.hoodLight,7+lean,3+by,8,1);this.rect(c,COLORS.hoodLight,5+lean,5+by,2,4);
  this.rect(c,'#b78e57',10+lean,4+by,9,1);this.rect(c,'#d9b876',10+lean,5+by,1,7);
  this.rect(c,COLORS.deep,11+lean,5+by,9,8);this.rect(c,COLORS.skinShade,12+lean,6+by,7,7);this.rect(c,COLORS.skin,13+lean,6+by,6,5);
  this.rect(c,COLORS.skin,19+lean,8+by,2,2);this.rect(c,COLORS.hair,11+lean,5+by,7,2);this.rect(c,COLORS.hair,11+lean,7+by,2,3);
  const blink=!reduced&&action==='idle'&&s.clock%4.8>4.65;
  this.rect(c,COLORS.outline,17+lean,(blink?9:8)+by,2,blink?1:2);if(!blink)this.rect(c,'#f4e6cb',18+lean,8+by,1,1);
  if(action==='dash'||action==='brake'||action==='hurt'||action==='brace')this.rect(c,COLORS.hair,16+lean,7+by,3,1);
  if(action==='celebrate'||action==='interact')this.rect(c,COLORS.skinShade,17+lean,11+by,2,1);
  else this.rect(c,'#aa796b',16+lean,12+by,2,1);this.rect(c,COLORS.scarfShade,7+lean,13+by,12,3);this.rect(c,COLORS.scarf,9+lean,13+by,11,2);this.rect(c,COLORS.scarfLight,13+lean,13+by,6,1);
  // The forward glove carries a lantern; running swings the arm and chain.
  let handX=21+lean+(action==='run'?stride.arm:0),handY=21+by;
  if(action==='hurt'){handX=19;handY=15+by;}else if(action==='brace'){handX=23;handY=18+by;}else if(action==='pet'){handX=21+lean+pet*(Math.abs(s.pet!.x-s.x-8)-22-lean)+(affection?.stroke??0)*2;handY=21+by-pet*12;}else if(action==='rise'){handX=22;handY=17;}else if(action==='fall'){handX=23;handY=19;}else if(action==='dash'){handX=25;handY=18;}else if(action==='wall'){handX=24;handY=11;}else if(action==='celebrate'){handX=22;handY=7;}else if(action==='interact'){handX=23;handY=13;}else if(action==='brake'){handX=20;handY=18;}else if(action==='land'){handX=22;handY=20+by;}
  this.line(c,17+lean,16+by,handX-1,handY-1,4,COLORS.outline);this.line(c,17+lean,16+by,handX-1,handY-1,2,COLORS.clothLight);
  this.rect(c,action==='pet'?COLORS.skin:COLORS.leather,handX-2,handY-1,4,3);this.rect(c,COLORS.leatherLight,handX,handY-1,2,1);
  const swing=reduced?0:action==='run'?Math.round(Math.sin(this.gait*Math.PI*2)*2):0;
  const lx=action==='pet'?handX+(4-handX)*pet:handX+swing+(reduced?0:Math.round(this.lantern)),ly=action==='pet'?handY+3+(23-handY)*pet:handY+3;
  if(action==='pet'){this.line(c,9+lean,17+by,lx,ly-3,4,COLORS.outline);this.line(c,9+lean,17+by,lx,ly-3,2,COLORS.clothShade);this.rect(c,COLORS.leather,lx-2,ly-3,4,3);}
  this.rect(c,COLORS.outline,lx-3,ly-1,7,10);this.rect(c,COLORS.metal,lx-1,ly-3,3,1);this.rect(c,COLORS.leatherLight,lx-2,ly-2,1,3);this.rect(c,COLORS.leatherLight,lx+2,ly-2,1,3);
  this.rect(c,accent+'14',lx-8,ly-5,17,17);this.rect(c,accent+'25',lx-4,ly-1,9,10);
  this.rect(c,COLORS.metal,lx-2,ly+1,5,6);this.rect(c,accent,lx-1,ly+2,3,4);this.rect(c,'#fff3ce',lx,ly+2+(reduced?0:Math.floor(s.clock*9)%2),1,3);
  this.rect(c,COLORS.leather,lx-3,ly,7,1);this.rect(c,COLORS.leather,lx-3,ly+7,7,1);this.rect(c,'#fff0bd',18+lean,10+by,1,2);
  c.restore();
 }
 /** Contact shadow cast onto the surface below rather than pinned to the
  * feet: it stays on the ground during jumps, narrowing and fading with height. */
 drawShadow(c:CanvasRenderingContext2D,s:Run,surface:number|undefined){
  if(surface===undefined)return;
  const height=Math.max(0,surface-(s.y+PLAYER_H)),reach=150;
  if(height>=reach)return;
  const k=1-height/reach,width=Math.max(6,Math.round(22*(.45+.55*k)));
  c.save();c.globalAlpha*=.35+.65*k;c.fillStyle='#0c142244';
  c.fillRect(Math.round(s.x+PLAYER_W/2-width/2),Math.round(surface),width,2);c.restore();
 }
 private leg(c:CanvasRenderingContext2D,hipX:number,hipY:number,joints:readonly number[],rear:boolean){
  const [kx,ky,fx,fy]=joints;
  this.line(c,hipX,hipY,kx,ky,5,COLORS.outline);this.line(c,kx,ky,fx,fy-2,4,COLORS.outline);
  this.line(c,hipX,hipY,kx,ky,3,rear?COLORS.deep:COLORS.trousers);this.line(c,kx,ky,fx,fy-2,2,rear?COLORS.trousers:COLORS.trouserLight);
  this.rect(c,COLORS.leather,fx-2,fy-2,5,3);this.rect(c,COLORS.leatherLight,fx,fy-2,3,1);this.rect(c,COLORS.sole,fx-2,Math.min(33,fy),6,1);
 }
 private rect(c:CanvasRenderingContext2D,color:string,x:number,y:number,w:number,h:number){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);}
 private line(c:CanvasRenderingContext2D,x1:number,y1:number,x2:number,y2:number,width:number,color:string){
  const steps=Math.max(Math.abs(x2-x1),Math.abs(y2-y1),1),half=Math.floor(width/2);c.fillStyle=color;
  for(let i=0;i<=steps;i++)c.fillRect(Math.round(x1+(x2-x1)*i/steps)-half,Math.round(y1+(y2-y1)*i/steps)-half,width,width);
 }
}
