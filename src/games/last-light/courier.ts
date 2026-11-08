import {PLAYER_H,PLAYER_W,type Events,type Run} from './model';

export type CourierAction='idle'|'run'|'rise'|'fall'|'wall'|'dash'|'land'|'respawn'|'celebrate';
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
const COLORS={outline:'#15202b',deep:'#293d48',hood:'#658c86',hoodLight:'#a5c3ac',hoodShade:'#3c615f',cloth:'#547e76',clothLight:'#87aa91',clothShade:'#304e50',stitch:'#b8b897',skin:'#e6c5a4',skinShade:'#ba8d77',hair:'#57443c',scarf:'#bb615e',scarfLight:'#ec9b79',scarfShade:'#803f4c',leather:'#725446',leatherLight:'#ac8260',trousers:'#394755',trouserLight:'#687484',sole:'#b8a68a',metal:'#e4c18b'};

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
 private readonly particles:Particle[]=Array.from({length:20},()=>({x:0,y:0,vx:0,vy:0,life:0,duration:1,kind:'dust'}));
 private readonly echoes:Echo[]=Array.from({length:4},()=>({x:0,y:0,facing:1,life:0}));

 private sync(s:Run){
  if(this.source===s&&this.stage===s.stage&&this.deaths===s.deaths&&s.clock>=this.clock)return;
  this.source=s;this.stage=s.stage;this.deaths=s.deaths;this.clock=s.clock;this.gait=0;this.landing=0;this.wasGrounded=s.grounded;this.lastFoot=-1;this.echoWait=0;
  for(const p of this.particles)p.life=0;
  for(const echo of this.echoes)echo.life=0;
 }
 tick(s:Run,events:Events,dt:number){
  this.sync(s);this.clock=s.clock;this.landing=Math.max(0,this.landing-dt);this.echoWait=Math.max(0,this.echoWait-dt);
  if(events.death){this.landing=0;for(const echo of this.echoes)echo.life=0;for(const p of this.particles)p.life=0;}
  if(events.land&&!events.death&&(!this.wasGrounded||events.jump)){this.landing=.14;this.dust(s,5);}
  if(events.jump&&!events.death){this.landing=0;this.dust(s,3);}
  if(s.grounded&&Math.abs(s.vx)>20){
   // Foot cadence follows distance, so slowing down does not produce a running-in-place cycle.
   this.gait+=Math.abs(s.vx)*dt/46;
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
  this.wasGrounded=s.grounded;
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
  if(s.grounded){if(this.landing>0)return 'land';return Math.abs(s.vx)>20?'run':'idle';}
  if(s.wall&&s.vy>=0)return 'wall';
  if(s.clock===0)return 'idle';
  return s.vy< -25?'rise':'fall';
 }
 draw(c:CanvasRenderingContext2D,s:Run,accent:string,reduced:boolean){
  this.sync(s);
  const action=this.action(s),face=action==='wall'?s.wall:s.facing;
  if(!reduced){
   for(const echo of this.echoes)if(echo.life>0){
    c.save();c.globalAlpha=echo.life/.13*.20;c.translate(Math.round(echo.x+8),Math.round(echo.y+24));c.scale(echo.facing,1);
    c.fillStyle='#a8e1e5';c.fillRect(-5,-32,12,10);c.fillRect(-8,-23,18,14);c.fillRect(-13,-22,8,3);c.fillRect(-10,-9,9,4);c.restore();
   }
   for(const p of this.particles)if(p.life>0){c.save();c.globalAlpha=p.life/p.duration*.6;c.fillStyle=p.kind==='dust'?'#c4b6a1':accent;c.fillRect(Math.round(p.x),Math.round(p.y),p.kind==='dust'?2:1,p.kind==='dust'?1:2);c.restore();}
  }
  const airborne=!s.grounded&&s.clock>0&&s.respawn===0;
  c.fillStyle='#0c142244';c.fillRect(Math.round(s.x-3),Math.round(s.y+24),22,2);
  c.save();c.globalAlpha=s.respawn>0&&!reduced?Math.max(.3,1-s.respawn/.35):1;
  c.translate(Math.round(s.x+PLAYER_W/2),Math.round(s.y+PLAYER_H));c.scale(face,1);c.translate(-12,-34);
  const stride=action==='run'?STRIDES[Math.floor(this.gait*8)%STRIDES.length]:STILL;
  const bob=reduced?0:action==='run'?stride.bob:action==='idle'?Math.round(Math.sin(s.clock*2.7)*.6):0;
  const crouch=action==='land'&&!reduced?Math.ceil(3*this.landing/.14):0;
  const lean=action==='dash'?3:action==='rise'?1:action==='wall'?2:0;
  const by=bob+crouch;
  const back=action==='rise'?[8,25,4,28]:action==='fall'?[8,27,6,31]:action==='dash'?[6,26,1,29]:action==='wall'?[8,27,5,32]:stride.back;
  const front=action==='rise'?[16,25,17,29]:action==='fall'?[16,28,18,33]:action==='dash'?[16,28,21,31]:action==='wall'?[19,25,22,28]:stride.front;
  this.leg(c,10,24+crouch,back,true); // rear leg sits behind the coat and satchel
  // A three-joint scarf keeps its silhouette during movement and settles at rest.
  const wind=reduced?0:Math.sin(s.clock*14)*2,tail=action==='dash'?13:action==='run'||airborne?10:6;
  for(let i=2;i>=0;i--){
   const x=6-i*(tail/3),y=13+by+(reduced?0:Math.round(Math.sin(s.clock*11-i*.85)*(action==='idle'?1:2)))-(action==='dash'?i:0);
   this.rect(c,COLORS.outline,x-2,y-1,7,5);this.rect(c,i===2?COLORS.scarfShade:COLORS.scarf,x-1,y,7,3);this.rect(c,COLORS.scarfLight,x,y,4,1);
  }
  // Padded leather satchel, flap, stitched border and brass clasp.
  this.rect(c,COLORS.outline,1+lean,15+by,9,13);this.rect(c,COLORS.leather,2+lean,16+by,7,10);
  this.rect(c,COLORS.leatherLight,2+lean,16+by,7,3);this.rect(c,'#bc9a74',3+lean,20+by,1,4);this.rect(c,COLORS.metal,6+lean,19+by,2,2);
  // Layered jacket: collar, side shadow, lapel, diagonal strap and split tails.
  this.rect(c,COLORS.outline,7+lean,14+by,12,14);this.rect(c,COLORS.clothShade,7+lean,15+by,11,12);
  this.rect(c,COLORS.cloth,9+lean,15+by,8,11);this.rect(c,COLORS.clothLight,15+lean,16+by,2,9);
  this.rect(c,COLORS.cloth,7+lean,24+by,5,4);this.rect(c,COLORS.clothShade,13+lean,24+by,6,3);
  this.rect(c,COLORS.stitch,8+lean,26+by,3,1);this.rect(c,COLORS.stitch,15+lean,25+by,3,1);
  for(let i=0;i<5;i++){this.rect(c,COLORS.leather,9+lean+i,15+by+i,2,3);}
  this.rect(c,COLORS.metal,13+lean,19+by,3,2);this.rect(c,COLORS.deep,14+lean,19+by,1,1);
  this.rect(c,COLORS.leather,9+lean,23+by,8,2);this.rect(c,COLORS.metal,14+lean,23+by,2,1);
  this.leg(c,14,24+crouch,front,false);
  // Hood has a scalloped silhouette, rim stitches, a shaded face and loose hair.
  this.rect(c,COLORS.outline,6+lean,1+by,12,2);this.rect(c,COLORS.outline,4+lean,3+by,16,9);this.rect(c,COLORS.outline,6+lean,12+by,13,3);
  this.rect(c,COLORS.hoodShade,5+lean,4+by,14,9);this.rect(c,COLORS.hood,7+lean,2+by,10,3);
  this.rect(c,COLORS.hood,5+lean,5+by,6,7);this.rect(c,COLORS.hoodLight,7+lean,3+by,8,1);this.rect(c,COLORS.hoodLight,5+lean,5+by,2,4);
  this.rect(c,COLORS.deep,10+lean,5+by,10,8);this.rect(c,COLORS.skinShade,12+lean,6+by,7,7);this.rect(c,COLORS.skin,13+lean,6+by,6,5);
  this.rect(c,COLORS.skin,19+lean,8+by,2,2);this.rect(c,COLORS.hair,11+lean,5+by,7,2);this.rect(c,COLORS.hair,11+lean,7+by,2,3);
  const blink=!reduced&&action==='idle'&&s.clock%4.8>4.65;
  this.rect(c,COLORS.outline,17+lean,(blink?9:8)+by,2,blink?1:2);if(!blink)this.rect(c,'#f4e6cb',18+lean,8+by,1,1);
  this.rect(c,'#aa796b',16+lean,12+by,3,1);this.rect(c,COLORS.scarfShade,7+lean,13+by,12,3);this.rect(c,COLORS.scarf,9+lean,13+by,11,2);this.rect(c,COLORS.scarfLight,13+lean,13+by,6,1);
  // The forward glove carries a lantern; running swings the arm and chain.
  let handX=21+lean+(action==='run'?stride.arm:0),handY=21+by;
  if(action==='rise'){handX=22;handY=17;}else if(action==='fall'){handX=23;handY=19;}else if(action==='dash'){handX=25;handY=18;}else if(action==='wall'){handX=24;handY=11;}else if(action==='celebrate'){handX=22;handY=7;}
  this.line(c,17+lean,16+by,handX-1,handY-1,4,COLORS.outline);this.line(c,17+lean,16+by,handX-1,handY-1,2,COLORS.clothLight);
  this.rect(c,COLORS.leather,handX-2,handY-1,4,3);this.rect(c,COLORS.leatherLight,handX,handY-1,2,1);
  const swing=reduced?0:action==='run'?Math.round(Math.sin(this.gait*Math.PI*2)*2):Math.round(Math.sin(s.clock*3)*.6);
  const lx=handX+swing,ly=handY+3;
  this.rect(c,COLORS.outline,lx-3,ly-1,7,10);this.rect(c,COLORS.metal,lx-1,ly-3,3,1);this.rect(c,COLORS.leatherLight,lx-2,ly-2,1,3);this.rect(c,COLORS.leatherLight,lx+2,ly-2,1,3);
  this.rect(c,accent+'14',lx-8,ly-5,17,17);this.rect(c,accent+'25',lx-4,ly-1,9,10);
  this.rect(c,COLORS.metal,lx-2,ly+1,5,6);this.rect(c,accent,lx-1,ly+2,3,4);this.rect(c,'#fff3ce',lx,ly+2+(reduced?0:Math.floor(s.clock*9)%2),1,3);
  this.rect(c,COLORS.leather,lx-3,ly,7,1);this.rect(c,COLORS.leather,lx-3,ly+7,7,1);this.rect(c,'#fff0bd',18+lean,10+by,1,2);
  // One airborne cloth pixel follows through after the body, without rotating the sprite grid.
  if(!reduced&&airborne)this.rect(c,COLORS.scarfShade,3-tail,15+by+Math.round(wind),3,1);
  c.restore();
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
