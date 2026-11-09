import {Courier} from './courier';
import type {Run} from './model';
/** A short impact, coat/lantern fragments and a checkpoint rekindle occupy the
 * existing respawn delay. Presentation never moves the collision body. */
export class DeathAnimation {
 age=1;pose:Run|null=null;cameraX=0;cameraY=0;
 private sprite:HTMLCanvasElement|null=null;
 get active(){return this.pose!==null&&this.age<.35;}
 get impact(){return this.active&&this.age<.18;}
 begin(pose:Run,x:number,y:number){
  this.pose=pose;this.age=0;this.cameraX=x;this.cameraY=y;
  this.sprite??=document.createElement('canvas');this.sprite.width=48;this.sprite.height=56;
  const c=this.sprite.getContext('2d')!;c.imageSmoothingEnabled=false;
  const ghost={...pose,x:16,y:24,respawn:0,grounded:false,phase:'playing' as const};
  new Courier().draw(c,ghost,'#f3c77a',true);
 }
 step(dt:number){this.age=Math.min(.35,this.age+dt);if(this.age>=.35)this.pose=null;}
 reset(){this.pose=null;this.age=1;}
 drawBody(c:CanvasRenderingContext2D,cx:number,cy:number,reduced:boolean){
  if(!this.impact||!this.pose||!this.sprite)return;
  const p=this.age/.18,x=this.pose.x-cx-16,y=Math.min(c.canvas.height-56,this.pose.y-cy-24);
  c.save();c.globalAlpha=1-p*p;
  for(let i=0;i<4;i++){
   const side=reduced?0:(i-1.5)*p*13,fall=reduced?0:-Math.sin(p*Math.PI)*7+p*p*14;
   c.drawImage(this.sprite,i*12,0,12,56,Math.round(x+i*12+side),Math.round(y+fall+(i%2)*p*3),12,56);
  }
  c.fillStyle='#ffe1a3';
  for(let i=0;i<8;i++){const a=i*Math.PI/4,r=reduced?13:5+p*29;c.globalAlpha=(1-p)*.85;c.fillRect(Math.round(this.pose.x+8-cx+Math.cos(a)*r),Math.round(y+33+Math.sin(a)*r),2,i%2?2:3);}
  c.restore();
 }
 drawTransition(c:CanvasRenderingContext2D,w:number,h:number,run:Run,cx:number,cy:number,reduced:boolean){
  if(!this.active)return;
  const fade=this.age<.18?Math.max(0,(this.age-.11)/.07):Math.max(0,1-(this.age-.18)/.17);
  c.save();c.globalAlpha=fade*(reduced?.45:.7);c.fillStyle='#132330';c.fillRect(0,0,w,h);
  if(!this.impact){
   const p=(this.age-.18)/.17,x=Math.round(run.x+8-cx),y=Math.round(run.y+9-cy);
   c.globalAlpha=(1-p)*.8;c.strokeStyle='#f3c77a';c.lineWidth=1;c.beginPath();c.arc(x,y,reduced?15:5+p*21,0,Math.PI*2);c.stroke();
  }
  c.restore();
 }
}
