import {drawLift,drawServiceDoor,drawExitConnection} from './exit-art';
import {drawEnemy,drawPress} from './enemy-art';
import {clearDuration,departurePose,departureVisibility} from './departure';
import {DeathAnimation} from './death-art';
import {drawArchitecture} from './architecture';
import {drawCrumblingHazard} from './crumble-art';
import {drawEmitter,drawSpikes} from './hazard-art';
import {LEVELS,WORLDS,type Level} from './levels';
import {platformAt,hazardAt,hazardActive,hazardWarning,checkpointsFor,checkpointIndexFor,stationAt,type Events,type Run} from './model';
import {characterColor,rescueNameFor} from './story';
import {lantern,doorway,valve,bell,ferry,signalDish,lifeTree} from './props';
import {Courier} from './courier';
import {drawPlatform,clearTerrainCache} from './terrain';
import {drawSky,drawLife,drawGear,person,drawDepthFog} from './world';
import {Effects,completionOffset,drawCompletion,drawDawn,drawEndingSky} from './effects';
import {goalComposition,stationComposition,type GoalComposition,type StationArt} from './composition';
type C=CanvasRenderingContext2D;
function pixel(c:C,color:string,x:number,y:number,w:number,h:number){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);}
/** Small fixtures are authored at native pixel size, not shrunken scenic art. */
function relayCabinet(c:C,x:number,y:number,color:string,lit:boolean,garden=false,small=false){
 c.save();c.translate(Math.round(x),Math.round(y));
 const top=small?-36:-39;
 pixel(c,'#16262f',-21,top,42,-top);pixel(c,'#708785',-19,top+1,38,2);
 pixel(c,'#3b545d',-19,top+3,37,-top-5);pixel(c,'#8a9c91',-19,top+4,2,-top-8);pixel(c,'#273c47',16,top+4,2,-top-6);
 pixel(c,'#263b45',-14,top+7,28,15);pixel(c,'#b49a6b',-13,top+7,26,2);
 pixel(c,lit?color:'#49636b',-11,top+10,22,9);pixel(c,lit?'#fff0c1':'#8aa39b',-10,top+10,3,7);
 for(let i=0;i<3;i++){pixel(c,'#142e39',-11+i*8,top+12,5,1);pixel(c,lit?color:'#a38a65',-10+i*8,top+15,3,2);}
 for(const yy of [-12,-8]){pixel(c,'#213944',-12,yy,18,2);pixel(c,'#627d7d',-11,yy,17,1);}
 pixel(c,'#b99b66',11,-13,3,8);pixel(c,'#eed19a',11,-13,1,3);
 for(const xx of [-17,16])for(const yy of [top+5,-5]){pixel(c,'#172b36',xx,yy,3,3);pixel(c,'#b5c0a0',xx,yy,2,1);}
 pixel(c,'#172a35',-23,-3,46,5);pixel(c,'#a4ad94',-21,-3,42,1);pixel(c,'#4f676d',-21,-1,42,2);
 if(!small){
  if(garden){
   pixel(c,'#4c5140',-3,-60,5,23);pixel(c,'#a69a65',-3,-58,1,20);
   for(const [xx,yy] of [[-14,-52],[6,-57],[-8,-43],[14,-47]]){pixel(c,'#1c3c35',xx,yy,9,5);pixel(c,lit?'#8eaf72':'#657657',xx+1,yy,7,3);pixel(c,'#b8c68c',xx+2,yy,4,1);}
   pixel(c,'#162d34',-4,-48,9,10);pixel(c,lit?color:'#63806b',-2,-46,5,7);pixel(c,'#d5deb2',-1,-46,1,4);
  }else{
   pixel(c,'#1b2b34',-11,-60,3,23);pixel(c,'#829080',-10,-59,1,21);pixel(c,'#1b2b34',9,-60,3,23);pixel(c,'#a38c63',10,-59,1,21);
   pixel(c,'#1b2b34',-12,-65,25,4);pixel(c,'#baa170',-10,-65,20,1);lantern(c,0,-55,color,lit);
  }
 }
 c.restore();
}
function smallStation(c:C,x:number,y:number,color:string,lit:boolean,art:StationArt){
 c.save();c.translate(Math.round(x),Math.round(y));
 if(art==='smallLamp'){
  pixel(c,'#172a35',-4,-26,9,27);pixel(c,'#738985',-3,-25,2,23);pixel(c,'#b99d6f',-9,-2,19,3);lantern(c,0,-30,color,lit);
 }else if(art==='smallValve'){
  pixel(c,'#192b36',-5,-31,11,32);pixel(c,'#78908c',-3,-30,3,30);pixel(c,'#b29870',-10,-2,20,3);
  drawGear(c,0,-17,12,0,lit?color:'#b39161');pixel(c,'#223c47',-3,-20,6,6);pixel(c,'#b7c8a4',-2,-20,3,1);
 }else{
  pixel(c,'#1b2b35',-14,-34,3,35);pixel(c,'#b08d65',-13,-33,1,32);pixel(c,'#1b2b35',11,-34,3,35);pixel(c,'#927653',12,-33,1,32);pixel(c,'#b09b70',-14,-34,28,3);
  pixel(c,'#1b2b35',-7,-27,14,18);pixel(c,'#b89b65',-6,-26,12,17);pixel(c,'#e5ce94',-5,-25,3,14);pixel(c,'#c3a466',-10,-12,20,4);pixel(c,lit?color:'#7e6552',-2,-8,4,4);pixel(c,'#21333c',-14,0,28,2);
 }c.restore();
}
function smallGoal(c:C,p:GoalComposition,color:string,ready:boolean,lift=0){
 const {x,y,art}=p;
 if(art==='smallRelay'){relayCabinet(c,x,y,color,ready,false,true);return;}
 c.save();c.translate(Math.round(x),Math.round(y));
 if(art==='smallDoor'){
  pixel(c,'#1d2b37',-21,-48,42,48);pixel(c,'#899789',-19,-47,38,3);pixel(c,'#71847e',-19,-44,6,43);pixel(c,'#bec9ae',-19,-44,1,40);pixel(c,'#50666b',14,-44,5,43);
  for(let yy=-38;yy<-1;yy+=10){pixel(c,'#243c47',-18,yy,5,1);pixel(c,'#263d48',14,yy,4,1);}
  pixel(c,'#3b3637',-12,-44,26,44);pixel(c,ready?'#ad8153':'#685046',-10,-42,22,42);pixel(c,ready?'#edca8c':'#8e6c4c',-9,-40,4,40);
  for(const xx of [-4,3,10])pixel(c,'#473c37',xx,-40,1,39);pixel(c,color,6,-21,2,4);pixel(c,'#a0a98e',-21,-1,42,3);
 }else if(art==='smallSignal'){
  pixel(c,'#1b2c36',-23,-5,46,7);pixel(c,'#9bab98',-21,-5,42,2);pixel(c,'#526d73',-19,-3,38,3);
  pixel(c,'#20333e',-18,-24,36,20);pixel(c,'#7a9390',-16,-23,32,3);pixel(c,'#39545f',-16,-20,32,14);pixel(c,'#d4c09a',-13,-17,17,9);pixel(c,ready?color:'#618c90',-12,-16,15,7);
  for(let i=0;i<3;i++)pixel(c,'#193844',-9+i*4,-13-i,2,4+i);pixel(c,'#b4bca0',8,-17,5,5);pixel(c,'#253c47',9,-16,3,3);pixel(c,'#9e8d70',11,-29,2,9);pixel(c,ready?color:'#83938b',9,-30,6,2);
 }else if(art==='smallEngine'){
  for(const xx of [-22,18]){pixel(c,'#22323e',xx,-47,5,48);pixel(c,'#9a9b88',xx,-47,1,46);}
  pixel(c,'#1e303c',-23,-48,46,5);pixel(c,'#b6a481',-21,-48,42,1);drawGear(c,0,-31,12,0,ready?color:'#9a8d76');pixel(c,'#4b626b',-23,-8+lift,46,10);pixel(c,'#a0b19b',-22,-8+lift,44,2);
 }else{
  pixel(c,'#1b2d38',-12,-5,24,7);pixel(c,'#98a38b',-11,-5,22,1);pixel(c,'#5e7476',-8,-21,16,16);pixel(c,'#bdab7c',-9,-24,18,4);pixel(c,ready?color:'#405f69',-5,-19,10,10);pixel(c,'#d5dbc0',-4,-19,2,7);pixel(c,'#233d48',-7,-8,14,3);
 }c.restore();
}
function drawGoal(c:C,l:Level,s:Run,reduced:boolean,view:{width:number;height:number}){
 const p=goalComposition(l),{x,y,art,bounds}=p,theme=WORLDS[l.world],ready=true,t=reduced?0:s.clock;
 const offset=completionOffset(s,reduced,view),shift=offset.x;
 if(l.berth){
  const post=l.exit.x+l.exit.w+1;pixel(c,'#1a2e38',post,y-17,5,20);pixel(c,'#9c9e7a',post,y-17,5,2);pixel(c,'#617a77',post+1,y-14,1,15);
  if(s.phase==='playing'){c.strokeStyle='#a79874';c.lineWidth=1;c.beginPath();c.moveTo(post+2,y-10);c.quadraticCurveTo(x-62,y+5,x-52,y-4);c.stroke();}
 }
 if(l.goal==='engine'){drawLift(c,l,s,theme.accent,reduced,view);}else{
 c.save();c.translate(shift,art==='ferry'||art==='airship'?offset.y:0);c.beginPath();c.rect(bounds.x,bounds.y,bounds.w,bounds.h);c.clip();
 if(art==='ferry'||art==='airship'){
  c.globalAlpha*=departureVisibility(s,reduced);
  ferry(c,x,y-3-(reduced?0:Math.sin(t*2)*2),theme.accent,art==='airship');
  // The waterline masks the submerged lower hull, with a broken reflection.
  if(l.water!==null){pixel(c,'#153440',x-62,l.water,125,17);for(let i=0;i<5;i++)pixel(c,theme.edge+'88',x-47+i*22,l.water+(i%2),13,1);}
 }
 else if(art==='engine'){
  c.strokeStyle='#ac9978';c.lineWidth=2;c.strokeRect(x-26,y-88,52,88);pixel(c,'#5a5a5d',x-27,y-8+offset.y,54,8);drawGear(c,x,y-76,15,ready?t*.7:0,ready?theme.accent:'#8c8d88');
 }else if(art==='doorway'||art==='escape'){
  doorway(c,x,y,theme.accent,ready||l.goal==='escape');
  if(art==='escape'){pixel(c,'#7f877e',x+25,y-75,7,75);pixel(c,'#bba585',x+22,y-77,40,5);pixel(c,theme.accent,x+27,y-70,27,17);pixel(c,'#36434b',x+31,y-66,18,2);pixel(c,'#36434b',x+31,y-61,12,2);}
 }else if(art==='signal')signalDish(c,x,y,theme.accent,ready);
 else if(art==='lifeTree')lifeTree(c,x,y,theme.accent,ready);
 else if(art==='relay'||art==='gardenRelay')relayCabinet(c,x,y,theme.accent,ready,art==='gardenRelay');
 else if(art==='dawn'){
  pixel(c,'#354b56',x-10,y-32,20,32);pixel(c,'#91a2a0',x-10,y-32,20,3);pixel(c,'#536b72',x-7,y-28,3,26);pixel(c,'#b39b74',x-15,y-5,30,5);lantern(c,x,y-55,theme.accent,ready);
 }else smallGoal(c,p,theme.accent,ready,offset.y);
 c.restore();}
 if(s.phase==='playing'&&p.marker){
  const m=p.marker,mx=Math.round(m.x+m.w/2),my=Math.round(m.y+m.h/2);pixel(c,'#172b36',m.x,m.y,m.w,m.h);
  if(ready){pixel(c,theme.accent,mx-4,my-1,8,2);pixel(c,theme.accent,mx+2,my-3,2,6);pixel(c,theme.accent,mx+4,my-1,2,2);}
  else for(let i=0;i<l.stations.length;i++)pixel(c,s.activated.includes(l.stations[i].id)?theme.accent:'#718681',mx-(l.stations.length*4-1)/2+i*4,my-1,3,3);
 }
}
export class Scene {
 private ctx:CanvasRenderingContext2D;
 private readonly courier=new Courier();
 private readonly effects=new Effects();
 private readonly death=new DeathAnimation();
 private exitCamera:{x:number;y:number}|null=null;
 private cssWidth=0;private cssHeight=0;private lookAhead=24;
 get dying(){return this.death.active;}
 get deathCause(){return this.death.active?this.death.cause:'';}
 private source:Run|undefined;private stage=-1;private deaths=-1;
 private trace:{x:number;y:number}[]=[];private traceTime=0;
 width=640;height=480;cameraX=0;cameraY=0;
 constructor(readonly canvas:HTMLCanvasElement){const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('Canvas 2D is unavailable.');this.ctx=ctx;}
 resize(width:number,height:number){
  if(width===this.cssWidth&&height===this.cssHeight)return;this.cssWidth=width;this.cssHeight=height;
  const scale=height>width?Math.max(1,width/430):Math.max(1,Math.round(Math.min(height/360,width/640,2.5)));
  this.width=Math.max(200,Math.floor(width/scale));this.height=Math.max(160,Math.floor(height/scale));
  this.canvas.width=this.width;this.canvas.height=this.height;this.ctx.imageSmoothingEnabled=false;
  if(this.source){const target=this.target(this.source);this.cameraX=target.x;this.cameraY=target.y;}
 }
 step(s:Run,events:Events,dt:number){
  if(events.death&&events.deathPose){this.death.begin(events.deathPose,this.cameraX,this.cameraY,events.deathCause,events.deathHit,events.deathEnemy);this.sync(s,true);}
  else {this.sync(s);const wasImpact=this.death.impact;this.death.step(dt);if(wasImpact&&!this.death.impact){const target=this.target(s);this.cameraX=target.x;this.cameraY=target.y;}}
  if(events.clear)this.exitCamera={x:this.cameraX,y:this.cameraY};
  this.effects.step(s,events,dt);
  this.courier.tick(s,events,dt);this.traceTime+=dt;
  if(this.traceTime>.035){this.traceTime=0;this.trace.push({x:s.x+8,y:s.y+24});if(this.trace.length>20)this.trace.shift();}
  if(this.death.impact)return;
  this.lookAhead+=(s.facing*24-this.lookAhead)*(1-Math.exp(-dt*5));
  const target=this.target(s);this.cameraX+=(target.x-this.cameraX)*(1-Math.exp(-dt*8));this.cameraY+=(target.y-this.cameraY)*(1-Math.exp(-dt*7));
 }
 private sync(s:Run,keepDeath=false){
  if(this.source===s&&this.stage===s.stage&&this.deaths===s.deaths)return;
  const changedLevel=this.source!==s||this.stage!==s.stage;if(changedLevel)this.exitCamera=null;
  if(!keepDeath){this.death.reset();this.lookAhead=s.facing*24;const target=this.target(s);this.cameraX=target.x;this.cameraY=target.y;}
  this.trace=[];this.traceTime=0;this.effects.reset();this.source=s;this.stage=s.stage;this.deaths=s.deaths;
  if(changedLevel){clearTerrainCache();this.exitCamera=null;}
 }
 private target(s:Run,reduced=false){if(s.phase!=='playing'&&this.exitCamera){const lift=!reduced&&LEVELS[s.stage].goal==='engine'?completionOffset(s,false,this).y:0;return {x:this.exitCamera.x,y:this.exitCamera.y+lift};}const l=LEVELS[s.stage],cleared=s.phase!=='playing',offset=['ferry','engine'].includes(l.goal)?{x:0,y:0}:completionOffset(s,reduced,this);const x=cleared?l.exit.x+19+offset.x:s.x+8,y=cleared?l.exit.y+25+offset.y:s.y;return {x:Math.max(0,Math.min(Math.max(0,l.width-this.width),x-this.width*(cleared?.52:.43)+(cleared?0:this.lookAhead))),y:Math.max(-170,Math.min(Math.max(0,l.height-this.height),y-this.height*.57))};}
 draw(actual:Run,reduced:boolean){
  this.sync(actual);const s=this.death.impact?this.death.pose!:actual;
  const c=this.ctx,l=LEVELS[s.stage],theme=WORLDS[l.world],w=this.width,h=this.height;
  if(reduced&&!this.death.impact){const target=this.target(s,true);this.cameraX=target.x;this.cameraY=target.y;}
  const cx=Math.floor(this.death.impact?this.death.cameraX:this.cameraX),cy=Math.floor(this.death.impact?this.death.cameraY:this.cameraY),t=reduced?0:s.clock,elapsed=s.phase==='playing'?0:reduced?clearDuration(l):clearDuration(l)-s.cinematic;
  drawSky(c,l,s,w,h,cx,cy,reduced);
  drawEndingSky(c,w,h,s);
  c.save();c.translate(-cx,-cy);
  drawArchitecture(c,l,cx,cy,w,h);drawDepthFog(c,l,s,cx,cy,w,h,reduced);

  for(const p of l.platforms){const r=platformAt(p,s.clock);if(r.x+r.w<cx-60||r.x>cx+w+60||r.y>cy+h+60||r.y<cy-220)continue;const visual=l.goal==='escape'&&s.phase!=='playing'&&p.kind==='crumble'&&elapsed>p.id*.12?{...s,crumbles:{...s.crumbles,[p.id]:-(elapsed-p.id*.12)}}:s;drawPlatform(c,p,r.x,r.y,visual,l,reduced);}
  for(let i=1;i<l.mainCount-1;i++){
   const p=l.platforms[i],next=l.platforms[i+1],before=l.platforms[i-1],dir=Math.sign(next.x+next.w/2-p.x-p.w/2),incoming=Math.sign(p.x+p.w/2-before.x-before.w/2);
   if(dir===incoming||p.kind==='moving'||p.kind==='crumble'||!dir||p.x+p.w<cx||p.x>cx+w)continue;
   const mx=Math.round(p.x+p.w*(dir>0?.82:.18)),my=p.y-6;
   if(l.hazards.some(h=>Math.abs(h.x-mx)<42)||l.stations.some(a=>Math.abs(a.x-mx)<40&&a.platform===p.id))continue;
   pixel(c,theme.accent+'aa',mx-4,my-1,8,2);pixel(c,theme.accent+'aa',mx+dir*2,my-3,2,6);pixel(c,theme.accent+'aa',mx+dir*4,my-1,2,2);
  }
  drawLife(c,l,s,cx,cy,w,h,reduced);
  // Mission architecture sits behind every collectible, hazard and character.
  // Its footprint is chosen before drawing, using the exact interaction anchor.
  drawGoal(c,l,s,reduced,this);drawCompletion(c,l,s,theme.accent,reduced,this);drawServiceDoor(c,l,s,theme.accent);drawExitConnection(c,l,s,theme.accent,cy,reduced);
  for(const [index,cp] of checkpointsFor(l).entries()){
   if(cp.x<cx-35||cp.x>cx+w+35||cp.y<cy-20||cp.y>cy+h+60)continue;
   c.fillStyle='#b7bda7';c.fillRect(cp.x,cp.y-48,2,48);c.fillStyle=index<=checkpointIndexFor(s,l)?'#d8e5a0':'#859da3';
   c.beginPath();c.moveTo(cp.x+2,cp.y-46);c.lineTo(cp.x+23,cp.y-44+(reduced?0:Math.sin(t*3)*2));c.lineTo(cp.x+17,cp.y-34);c.lineTo(cp.x+2,cp.y-34);c.fill();
  }
  for(const hazard of l.hazards){
   const r=hazardAt(hazard,s.clock);if(r.x<cx-70||r.x>cx+w+70)continue;
   const support=hazard.platform===undefined?undefined:s.crumbles[hazard.platform];
   if(support!==undefined&&support<=0){drawCrumblingHazard(c,hazard,support,reduced,r);continue;}
   if(hazard.kind==='crusher'){drawPress(c,hazard,s,reduced);
   }else if(hazard.kind==='spikes'){drawSpikes(c,r);
   }else if(hazard.kind==='saw'){drawGear(c,r.x+r.w/2,r.y+r.h/2,12,hazardActive(hazard,s)?t*4:0,hazardActive(hazard,s)?'#d3b8b3':'#586c71');}
   else{
    const on=hazardActive(hazard,s),stopped=hazard.disabledBy!==undefined&&s.activated.includes(hazard.disabledBy),warning=hazardWarning(hazard,s);
    drawEmitter(c,hazard,r,on,warning,stopped,t,reduced);
   }
  }
  for(const enemy of l.enemies??[]){const margin=enemy.travel+28;if(enemy.x+margin<cx||enemy.x-margin>cx+w)continue;drawEnemy(c,enemy,s,reduced);}
  for(const p of l.pickups){if(s.collected.includes(p.id))continue;const y=p.y+Math.round(Math.sin(t*3+p.id)*3);
   c.fillStyle=(p.kind==='dash'?'#a9d9ef':theme.accent)+'12';c.beginPath();c.moveTo(p.x,y-15);c.lineTo(p.x+12,y);c.lineTo(p.x,y+15);c.lineTo(p.x-12,y);c.fill();c.fillStyle=p.kind==='dash'?'#9ed6ee':theme.accent;
   c.beginPath();c.moveTo(p.x,y-8);c.lineTo(p.x+6,y);c.lineTo(p.x,y+8);c.lineTo(p.x-6,y);c.fill();c.fillStyle='#fff4d1';c.fillRect(p.x-1,y-4,2,5);
  }
  for(const station of l.stations){
   const {x,y}=stationAt(station,l,s.clock),{kind,id}=station,lit=s.activated.includes(id),plan=stationComposition(l,station),dx=x-station.x,dy=y-station.y;
   if(kind==='survivor'){if(lit)continue;person(c,x,y,t,characterColor(station.label,l.world));}
   else{
    c.save();c.beginPath();c.rect(plan.bounds.x+dx,plan.bounds.y+dy,plan.bounds.w,plan.bounds.h);c.clip();
    if(plan.art==='valve')valve(c,x,y-25,theme.accent,lit);
    else if(plan.art==='bell')bell(c,x,y,theme.accent,lit);
    else if(plan.art==='lamp'){pixel(c,'#263b46',x-5,y-34,10,34);pixel(c,'#6e7c7c',x-4,y-33,3,31);pixel(c,'#b2a98c',x-8,y-3,16,3);lantern(c,x,y-49,theme.accent,lit);}
    else smallStation(c,x,y,theme.accent,lit,plan.art);
    c.restore();
   }
   if(!lit&&plan.marker){const m=plan.marker;pixel(c,'#172b36',m.x+dx,m.y+dy,m.w,m.h);c.fillStyle=theme.accent;c.font='9px monospace';c.textAlign='center';c.fillText(kind==='survivor'?'…':'↵',Math.round(m.x+m.w/2+dx),Math.round(m.y+9+dy));c.textAlign='start';}
  }
  if(l.goal==='rescue'&&s.activated.length){const follower=this.trace[0]??{x:s.x-18,y:s.y+24};c.save();if(s.phase!=='playing'){const pose=departurePose(l,s,reduced,this);c.translate(pose.x-s.x,pose.y-s.y);c.globalAlpha=Math.min(1,pose.opacity*1.4);}person(c,follower.x,follower.y,t,characterColor(rescueNameFor(s.stage),l.world),Math.abs(s.vx)>20?Math.sign(s.vx):0,Math.sign(s.vx)||s.facing);c.restore();}
  this.effects.draw(c,cx,cy,w,h,theme.accent,reduced);
  c.save();
  const departure=s.phase!=='playing'?departurePose(l,s,reduced,this):null;
  if(departure){c.translate(departure.x-s.x,departure.y-s.y);c.globalAlpha=departure.opacity;}
  if(!this.death.impact)this.courier.draw(c,s,theme.accent,reduced,departure??undefined);c.restore();
  if(l.goal==='engine')drawLift(c,l,s,theme.accent,reduced,this,true);else drawServiceDoor(c,l,s,theme.accent,true);
  c.restore();
  this.death.drawBody(c,cx,cy,reduced);this.death.drawTransition(c,w,h,actual,cx,cy,reduced);
  drawDawn(c,w,h,s,reduced);
 }
}
