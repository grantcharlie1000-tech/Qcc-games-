import {Courier} from './courier';
import {LEVELS,WORLDS,type Rect} from './levels';
import type {Run} from './model';
import {bakeFracture,drawFracturePieces} from './crumble-art';
import {DEATH_DURATION,DEATH_IMPACT,type DeathCause} from './death';
type C=CanvasRenderingContext2D;
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const TINT:Record<DeathCause,string>={spikes:'#d8ac87',saw:'#d9c4a0',laser:'#a8ecf2',steam:'#edc4a2',crusher:'#c0b49a',enemy:'#d4a078',water:'#7bbfce',dark:'#a293c4',fall:'#f3c77a'};
function px(c:C,color:string,x:number,y:number,w=2,h=2){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);}
/** One captured courier, nine physical reactions. No simulation, score or timer
 * changes; all effects finish during the existing 350ms respawn. */
export class DeathAnimation {
 age=1;pose:Run|null=null;cameraX=0;cameraY=0;cause:DeathCause='fall';
 private sprite:HTMLCanvasElement|null=null;private crouch:HTMLCanvasElement|null=null;
 private charge:HTMLCanvasElement|null=null;private shadow:HTMLCanvasElement|null=null;private submerged:HTMLCanvasElement|null=null;
 private fracture:ReturnType<typeof bakeFracture>|null=null;private contact:Rect|undefined;private enemyKind:'crawler'|'moth'|undefined;private kick=-1;
 get active(){return this.pose!==null&&this.age<DEATH_DURATION;}
 get impact(){return this.active&&this.age<DEATH_IMPACT;}
 begin(pose:Run,x:number,y:number,cause:DeathCause='fall',contact?:Rect,enemyKind?:'crawler'|'moth'){
  this.pose=pose;this.age=0;this.cameraX=x;this.cameraY=y;this.cause=cause;this.contact=contact;this.enemyKind=enemyKind;
  this.kick=contact?(Math.sign(pose.x+8-contact.x-contact.w/2)||-pose.facing):-pose.facing;
  const accent=WORLDS[LEVELS[pose.stage].world].accent;
  const capture=(crouch=false)=>{const canvas=document.createElement('canvas');canvas.width=48;canvas.height=56;const c=canvas.getContext('2d')!;c.imageSmoothingEnabled=false;
   const ghost={...pose,x:16,y:24,pet:null,respawn:0,previousInteract:false,grounded:false,phase:'playing' as const};
   new Courier().draw(c,ghost,accent,true,crouch?{action:'land',facing:pose.facing,settle:1}:undefined);return canvas;};
  this.sprite=capture();this.crouch=capture(true);
  const tint=(color:string)=>{const canvas=document.createElement('canvas');canvas.width=48;canvas.height=56;const c=canvas.getContext('2d')!;c.drawImage(this.sprite!,0,0);c.globalCompositeOperation='source-atop';c.fillStyle=color;c.fillRect(0,0,48,56);return canvas;};
  this.charge=tint('#b8eff5bb');this.shadow=tint('#152031ee');this.submerged=tint('#426d8c99');
  this.fracture=cause==='saw'?bakeFracture(this.sprite,0,0,48,56,71):null;
 }
 step(dt:number){this.age=Math.min(DEATH_DURATION,this.age+dt);if(this.age>=DEATH_DURATION)this.pose=null;}
 reset(){this.pose=null;this.age=1;this.fracture=null;}
 private body(c:C,x:number,y:number,angle=0,sx=1,sy=1,crouch=false){
  const art=crouch?this.crouch:this.sprite;if(!art)return;
  c.save();c.translate(Math.round(x+24),Math.round(y+48));c.rotate(angle);c.scale(sx,sy);c.drawImage(art,-24,-48);c.restore();
 }
 private sparks(c:C,x:number,y:number,p:number,color:string,count=9,spread=24){
  for(let i=0;i<count;i++){const a=i*2.399+.4,r=3+p*(spread+i%3*4);c.globalAlpha=(1-p)*.85;px(c,color,x+Math.cos(a)*r,y+Math.sin(a)*r-p*9,i%3===0?3:1,i%2+1);}
 }
 drawBody(c:C,cx:number,cy:number,reduced:boolean){
  if(!this.impact||!this.pose||!this.sprite)return;
  const p=clamp(this.age/DEATH_IMPACT),s=this.pose,x=s.x-cx-16,y=s.y-cy-24,fx=s.x+8-cx,fy=s.y+24-cy,color=TINT[this.cause];
  c.save();
  if(reduced){
   // Static, cause-specific silhouettes replace recoil, tumbling and flashes.
   c.globalAlpha=1-p*.75;c.drawImage(this.cause==='dark'?this.shadow!:this.cause==='water'?this.submerged!:this.cause==='laser'?this.charge!:this.cause==='crusher'?this.crouch!:this.sprite,x,y);
   const marks:Record<DeathCause,string[]>={spikes:['..#..','.###.','#####'],saw:['.#.#.','#####','.#.#.'],laser:['...#.','..##.','.##..'],steam:['#.#.#','.#.#.','#.#.#'],crusher:['#####','..#..','#####'],enemy:['#...#','.###.','..#..'],water:['.#.#.','#.#.#','.....'],dark:['#...#','.#.#.','..#..'],fall:['..#..','..#..','.###.']};
   marks[this.cause].forEach((row,j)=>[...row].forEach((v,i)=>{if(v==='#')px(c,color,fx-5+i*2,Math.min(fy-42,c.canvas.height-18)+j*2,2,2);}));c.restore();return;
  }
  c.globalAlpha=1-p*p*.65;
  switch(this.cause){
   case 'spikes':{
    // A pinned foot, folded knees, then a short backward recoil.
    this.body(c,x+this.kick*p*11,y-Math.sin(p*Math.PI)*4,this.kick*p*.36,1,1,p>.12);
    this.sparks(c,fx,fy-2,p,'#d7b78c',7,14);break;
   }
   case 'saw':{
    // Uneven, textured cloth scraps are thrown tangentially from the blade.
    if(p<.12)this.body(c,x,y);else if(this.fracture){c.save();c.translate(this.kick*p*14,-p*5);drawFracturePieces(c,this.fracture,x,y,p*.65,0,false);c.restore();}
    this.sparks(c,fx,fy-15,p,'#d5c6a3',12,29);break;
   }
   case 'laser':{
    // A single charged silhouette resolves into staggered native-pixel rows.
    if(p<.2)c.drawImage(this.charge!,x,y);
    else for(let row=0;row<56;row+=2){const edge=(row/56*.55+((row*17)%11)/20);if(p>edge+.26)continue;
     c.globalAlpha=clamp(1-p*.7);c.drawImage(p<.5?this.charge!:this.sprite,0,row,48,2,Math.round(x+Math.sin(row*3)*p*7),y+row,48,2);}
    c.strokeStyle='#baf5f7';c.lineWidth=1;for(let i=0;i<3;i++){c.globalAlpha=(1-p)*.8;c.beginPath();c.moveTo(fx-13+i*12,fy-37);c.lineTo(fx-20+i*12+p*9,fy-24);c.lineTo(fx-9+i*12,fy-16);c.lineTo(fx-16+i*12,fy-3);c.stroke();}
    this.sparks(c,fx,fy-18,p,'#baf5f7',10,24);break;
   }
   case 'steam':{
    this.body(c,x+this.kick*p*9,y-p*8,this.kick*p*.25,1,1,true);
    // Steam curls up around the coat, expands and thins instead of exploding.
    for(let i=0;i<10;i++){const u=clamp(p-i*.035),xx=fx+(i%2?1:-1)*(3+u*14)+Math.sin(i+u*5)*3,yy=fy-6-i*3-u*25;c.globalAlpha=(1-u)*.25;px(c,i%2?'#e6d9bc':'#bdc9c2',xx,yy,5+Math.round(u*5),3);}
    break;
   }
   case 'crusher':{
    // The jacket folds onto the floor; its real pixels flatten with the press.
    this.body(c,x,y,0,1+p*.32,Math.max(.12,1-p*1.15),true);
    for(let i=0;i<12;i++){const side=i%2?1:-1;c.globalAlpha=(1-p)*.7;px(c,i%3?'#a4a99c':'#e0c69d',fx+side*(5+p*(12+i*2)),fy-2-Math.sin(p*Math.PI)*(2+i%3),3+i%3,2);}
    break;
   }
   case 'enemy':{
    const flying=this.enemyKind==='moth';
    this.body(c,x+this.kick*(p*26),y-Math.sin(p*Math.PI)*(flying?17:10)+p*p*8,this.kick*p*.8,1,1,p<.35);
    this.sparks(c,this.contact?this.contact.x+this.contact.w/2-cx:fx,fy-15,p,flying?'#a1c7cf':'#e4af79',6,17);break;
   }
   case 'water':{
    const surface=(this.contact?.y??LEVELS[s.stage].water??s.y+24)-cy,sink=p*38;
    // The same courier continues below the waterline, blue and fading.
    c.save();c.beginPath();c.rect(0,0,c.canvas.width,surface);c.clip();this.body(c,x,y+sink,s.facing*p*.15);c.restore();
    c.save();c.beginPath();c.rect(0,surface,c.canvas.width,c.canvas.height);c.clip();c.globalAlpha=(1-p)*.55;c.drawImage(this.submerged!,x,y+sink);c.restore();
    for(let i=0;i<10;i++){const a=i/9*Math.PI;c.globalAlpha=(1-p)*.8;px(c,i%2?'#a7d6da':'#e1e5cf',fx+Math.cos(a)*(5+p*25),surface-Math.sin(a)*Math.sin(p*Math.PI)*(9+i%3),2,i%2+2);}
    for(let i=0;i<3;i++){c.globalAlpha=(1-p)*.6;c.strokeStyle='#9fced1';c.strokeRect(Math.round(fx+(i-1)*6),Math.round(surface+8+i*5-p*15),2,2);}
    c.globalAlpha=(1-p)*.6;px(c,'#a7d6da',fx-9-p*25,surface,18+p*50,1);break;
   }
   case 'dark':{
    c.globalAlpha=1-p*.2;c.drawImage(this.shadow!,x,y);
    // The pursuing dark consumes successive columns and pulls the ember back.
    for(let col=0;col<48;col+=2){if(col/48<p*1.3)continue;c.globalAlpha=1-p*.4;c.drawImage(this.sprite,col,0,2,56,x+col-p*5,y,2,56);}
    for(let i=0;i<6;i++){c.globalAlpha=(1-p)*.8;px(c,'#29304b',fx-28+p*32,fy-4-i*6,18+i%3*3,3);}
    for(let i=0;i<5;i++){c.globalAlpha=(1-p)*.8;px(c,'#d6b28d',fx-p*(12+i*4),fy-14+(i-2)*3,1,2);}break;
   }
   case 'fall':{
    // No clamping the courier back onto the screen after they have fallen out.
    this.body(c,x+s.vx*p*.018,y+p*p*35,s.facing*p*.9);
    const trail=Math.min(c.canvas.height+5,fy)-3;for(let i=0;i<5;i++){c.globalAlpha=(1-p)*.7;px(c,'#d6b48a',fx-i*s.facing*3,trail-i*5+p*12,1,2);}break;
   }
  }
  c.restore();
 }
 drawTransition(c:C,w:number,h:number,run:Run,cx:number,cy:number,reduced:boolean){
  if(!this.active)return;
  const fade=this.age<DEATH_IMPACT?clamp((this.age-(DEATH_IMPACT-.055))/.055):clamp(1-(this.age-DEATH_IMPACT)/(DEATH_DURATION-DEATH_IMPACT));
  c.save();c.globalAlpha=fade*(reduced?.35:.58);c.fillStyle='#132330';c.fillRect(0,0,w,h);
  if(!this.impact){const p=(this.age-DEATH_IMPACT)/(DEATH_DURATION-DEATH_IMPACT),x=Math.round(run.x+8-cx),y=Math.round(run.y+9-cy);
   c.globalAlpha=(1-p)*.8;c.strokeStyle='#f3c77a';c.lineWidth=1;c.beginPath();c.arc(x,y,reduced?15:5+p*19,0,Math.PI*2);c.stroke();}
  c.restore();
 }
}
