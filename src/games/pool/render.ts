/** Canvas renderer: cached table art, per-pixel shaded rolling balls, cue stick and aiming guides. */
import {R,L,W,HEAD_X,FOOT_X,CUSHIONS,POCKETS,type Ball,type Trace} from './physics';

export const CUSHION_W=.042,RAIL_W=.092,MARGIN=CUSHION_W+RAIL_W;
const OUTER={x:-MARGIN,y:-MARGIN,w:L+2*MARGIN,h:W+2*MARGIN};

/** World ↔ screen mapping. Portrait turns the table so the head end (where you break) is at the bottom. */
export interface View{scale:number;ox:number;oy:number;portrait:boolean;width:number;height:number;dpr:number}
export function fitView(width:number,height:number,dpr:number,force?:boolean):View{
  const pad=4;
  const land=Math.min((width-pad*2)/OUTER.w,(height-pad*2)/OUTER.h);
  const port=Math.min((width-pad*2)/OUTER.h,(height-pad*2)/OUTER.w);
  const portrait=force??port>land*1.08,scale=Math.max(1,portrait?port:land);
  const tw=(portrait?OUTER.h:OUTER.w)*scale,th=(portrait?OUTER.w:OUTER.h)*scale;
  const left=(width-tw)/2,top=(height-th)/2;
  // Screen position of world (0,0).
  return portrait?{scale,portrait,ox:left+MARGIN*scale,oy:top+(L+MARGIN)*scale,width,height,dpr}:{scale,portrait,ox:left+MARGIN*scale,oy:top+MARGIN*scale,width,height,dpr};
}
export function toScreen(v:View,x:number,y:number){return v.portrait?{x:v.ox+y*v.scale,y:v.oy-x*v.scale}:{x:v.ox+x*v.scale,y:v.oy+y*v.scale};}
export function toWorld(v:View,sx:number,sy:number){return v.portrait?{x:(v.oy-sy)/v.scale,y:(sx-v.ox)/v.scale}:{x:(sx-v.ox)/v.scale,y:(sy-v.oy)/v.scale};}
/** Screen-space bounds of the playing surface (for overlays). */
export function feltRect(v:View){const a=toScreen(v,0,0),b=toScreen(v,L,W);return {left:Math.min(a.x,b.x),top:Math.min(a.y,b.y),right:Math.max(a.x,b.x),bottom:Math.max(a.y,b.y)};}
function worldTransform(c:CanvasRenderingContext2D,v:View){
  const k=v.scale*v.dpr;
  if(v.portrait)c.setTransform(0,-k,k,0,v.ox*v.dpr,v.oy*v.dpr);else c.setTransform(k,0,0,k,v.ox*v.dpr,v.oy*v.dpr);
}

// ---------------------------------------------------------------- Table art
function seeded(seed:number){let a=seed;return ()=>{a=(a*1664525+1013904223)>>>0;return a/4294967296;};}
function jawBack(jx:number,jy:number,ex:number,ey:number,nx:number,ny:number){
  // Where the jaw line from J (direction e) meets the back of the cushion (offset CUSHION_W along −n).
  const t=CUSHION_W/Math.max(.05,-(ex*nx+ey*ny));return {x:jx+ex*t,y:jy+ey*t};
}
function drawTableArt(c:CanvasRenderingContext2D,v:View){
  worldTransform(c,v);
  const px=1/v.scale,random=seeded(7);
  // Shadow under the whole table.
  c.save();c.shadowColor='rgba(0,0,0,.55)';c.shadowBlur=26*v.dpr;c.shadowOffsetY=v.portrait?0:8*v.dpr;c.shadowOffsetX=v.portrait?8*v.dpr:0;
  c.fillStyle='#2a140a';c.beginPath();c.roundRect(OUTER.x,OUTER.y,OUTER.w,OUTER.h,.06);c.fill();c.restore();
  // Wood rails: walnut with grain and a polished bevel.
  const wood=c.createLinearGradient(0,OUTER.y,0,OUTER.y+OUTER.h);
  wood.addColorStop(0,'#6b3418');wood.addColorStop(.5,'#4a2210');wood.addColorStop(1,'#5e2c13');
  c.fillStyle=wood;c.beginPath();c.roundRect(OUTER.x,OUTER.y,OUTER.w,OUTER.h,.06);c.fill();
  c.save();c.beginPath();c.roundRect(OUTER.x,OUTER.y,OUTER.w,OUTER.h,.06);c.clip();
  for(let i=0;i<260;i++){
    const y=OUTER.y+random()*OUTER.h,x=OUTER.x+random()*OUTER.w,len=.15+random()*.6,amp=.002+random()*.004;
    c.strokeStyle=random()<.5?`rgba(30,10,2,${.12+random()*.18})`:`rgba(160,90,45,${.06+random()*.1})`;
    c.lineWidth=(.6+random()*1.4)*px;c.beginPath();
    const vertical=x<-CUSHION_W||x>L+CUSHION_W;
    if(vertical&&(y>-CUSHION_W&&y<W+CUSHION_W)){c.moveTo(x,y);c.bezierCurveTo(x+amp,y+len/3,x-amp,y+len*2/3,x,y+len);}
    else{c.moveTo(x,y);c.bezierCurveTo(x+len/3,y+amp,x+len*2/3,y-amp,x+len,y);}
    c.stroke();
  }
  c.restore();
  // Bevel highlights on the outer and inner edges.
  c.lineWidth=2.2*px;c.strokeStyle='rgba(255,210,160,.22)';c.beginPath();c.roundRect(OUTER.x+1.5*px,OUTER.y+1.5*px,OUTER.w-3*px,OUTER.h-3*px,.058);c.stroke();
  c.lineWidth=1*px;c.strokeStyle='rgba(0,0,0,.6)';c.beginPath();c.roundRect(OUTER.x,OUTER.y,OUTER.w,OUTER.h,.06);c.stroke();
  // Leather pocket surrounds on the rail.
  for(const p of POCKETS){
    const g=c.createRadialGradient(p.x,p.y,.02,p.x,p.y,p.side?.088:.098);
    g.addColorStop(0,'#0b0603');g.addColorStop(.7,'#1d120b');g.addColorStop(1,'rgba(29,18,11,0)');
    c.fillStyle=g;c.beginPath();c.arc(p.x,p.y,p.side?.088:.098,0,Math.PI*2);c.fill();
  }
  // Cloth: playing surface plus the cushion band, lit from above.
  const cloth=c.createRadialGradient(L/2,W/2,.05,L/2,W/2,L*.62);
  cloth.addColorStop(0,'#1c8a57');cloth.addColorStop(.6,'#147447');cloth.addColorStop(1,'#0c5634');
  c.fillStyle=cloth;c.fillRect(-CUSHION_W,-CUSHION_W,L+2*CUSHION_W,W+2*CUSHION_W);
  c.fillStyle='rgba(0,0,0,.35)';c.fillRect(-CUSHION_W-1*px,-CUSHION_W-1*px,L+2*CUSHION_W+2*px,1.5*px);
  // Felt nap.
  for(let i=0;i<5200;i++){c.fillStyle=random()<.5?'rgba(255,255,255,.035)':'rgba(0,0,0,.05)';c.fillRect(random()*L,random()*W,px*1.1,px*1.1);}
  // Cushions: each nose segment with its two jaws.
  const noses=CUSHIONS.slice(12);
  for(const s of noses){
    const ex=s.bx-s.ax,ey=s.by-s.ay,len=Math.hypot(ex,ey),tx=ex/len,ty=ey/len,nx=-ty,ny=tx;
    // Inward normal points into the table.
    const into=((L/2-s.ax)*nx+(W/2-s.ay)*ny)>0?1:-1,inx=nx*into,iny=ny*into;
    const jawAt=(x:number,y:number)=>{const j=CUSHIONS.slice(0,12).find(j=>Math.abs(j.ax-x)<1e-9&&Math.abs(j.ay-y)<1e-9)!;const jl=Math.hypot(j.bx-j.ax,j.by-j.ay);return jawBack(x,y,(j.bx-j.ax)/jl,(j.by-j.ay)/jl,inx,iny);};
    const a=jawAt(s.ax,s.ay),b=jawAt(s.bx,s.by);
    const grad=c.createLinearGradient(s.ax,s.ay,s.ax-inx*CUSHION_W,s.ay-iny*CUSHION_W);
    grad.addColorStop(0,'#1a7d4e');grad.addColorStop(.25,'#106a40');grad.addColorStop(1,'#0a4b2d');
    c.fillStyle=grad;c.beginPath();c.moveTo(s.ax,s.ay);c.lineTo(s.bx,s.by);c.lineTo(b.x,b.y);c.lineTo(a.x,a.y);c.closePath();c.fill();
    c.strokeStyle='rgba(0,0,0,.35)';c.lineWidth=1*px;c.stroke();
    c.strokeStyle='rgba(160,255,200,.22)';c.lineWidth=1.2*px;c.beginPath();c.moveTo(s.ax+inx*.6*px,s.ay+iny*.6*px);c.lineTo(s.bx+inx*.6*px,s.by+iny*.6*px);c.stroke();
  }
  // Pocket holes.
  for(const p of POCKETS){
    const r=p.side?.063:.067,g=c.createRadialGradient(p.x+p.dx*.01,p.y+p.dy*.01,.004,p.x,p.y,r);
    g.addColorStop(0,'#000');g.addColorStop(.75,'#050505');g.addColorStop(1,'#1c1c1c');
    c.fillStyle=g;c.beginPath();c.arc(p.x,p.y,r,0,Math.PI*2);c.fill();
    c.strokeStyle='rgba(0,0,0,.8)';c.lineWidth=2*px;c.stroke();
  }
  // Pearl sights.
  const sight=(x:number,y:number)=>{const s=.0085;c.fillStyle='#efe6d2';c.beginPath();c.moveTo(x,y-s);c.lineTo(x+s*.62,y);c.lineTo(x,y+s);c.lineTo(x-s*.62,y);c.closePath();c.fill();c.strokeStyle='rgba(60,30,10,.6)';c.lineWidth=.8*px;c.stroke();};
  const mid=CUSHION_W+RAIL_W/2;
  for(const k of [1,2,3,5,6,7]){sight(L*k/8,-mid);sight(L*k/8,W+mid);}
  for(const k of [1,2,3]){sight(-mid,W*k/4);sight(L+mid,W*k/4);}
  // Spots.
  c.fillStyle='rgba(255,255,255,.22)';
  for(const [x,y] of [[HEAD_X,W/2],[FOOT_X,W/2],[L/2,W/2]]){c.beginPath();c.arc(x,y,.0045,0,Math.PI*2);c.fill();}
}

// ---------------------------------------------------------------- Balls
const COLORS:[number,number,number][]=[[246,243,232],[245,184,0],[22,72,196],[214,36,40],[86,40,140],[242,108,18],[10,124,62],[128,28,22],[18,18,20]];
const rgbOf=(id:number)=>COLORS[id===0?0:id===8?8:id>8?id-8:id];
export const ballCss=(id:number)=>{const [r,g,b]=rgbOf(id);return `rgb(${r},${g},${b})`;};
const glyphs=new Map<number,Uint8ClampedArray>();
const GLYPH=48;
function glyph(id:number){
  let g=glyphs.get(id);if(g)return g;
  const cv=document.createElement('canvas');cv.width=cv.height=GLYPH;const c=cv.getContext('2d')!;
  c.fillStyle='#000';c.font=`800 ${id>9?26:32}px system-ui,-apple-system,Segoe UI,sans-serif`;c.textAlign='center';c.textBaseline='middle';
  c.fillText(String(id),GLYPH/2,GLYPH/2+2);
  if(id===6||id===9){c.fillRect(GLYPH/2-8,GLYPH/2+16,16,3);}
  const data=c.getImageData(0,0,GLYPH,GLYPH).data,alpha=new Uint8ClampedArray(GLYPH*GLYPH);
  for(let i=0;i<alpha.length;i++)alpha[i]=data[i*4+3];
  glyphs.set(id,alpha);return alpha;
}
interface Sprite{canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;img:ImageData;key:string}
interface Lit{size:number;n:Float32Array;shade:Float32Array;spec:Float32Array;alpha:Float32Array}
let lit:Lit|null=null;
function lighting(radius:number):Lit{
  const size=Math.ceil(radius*2)+2;
  if(lit&&lit.size===size)return lit;
  const n=new Float32Array(size*size*3),shade=new Float32Array(size*size),spec=new Float32Array(size*size),alpha=new Float32Array(size*size);
  const lx=-.42,ly=-.55,lz=.72,ll=Math.hypot(lx,ly,lz),Lx=lx/ll,Ly=ly/ll,Lz=lz/ll;
  const hx=Lx,hy=Ly,hz=Lz+1,hl=Math.hypot(hx,hy,hz),Hx=hx/hl,Hy=hy/hl,Hz=hz/hl;
  const c=size/2;
  for(let j=0;j<size;j++)for(let i=0;i<size;i++){
    const k=j*size+i,x=(i+.5-c)/radius,y=(j+.5-c)/radius,d=Math.hypot(x,y);
    alpha[k]=Math.max(0,Math.min(1,(1-d)*radius+.5));
    if(alpha[k]<=0)continue;
    const dd=Math.min(1,d),sx=d>1?x/d:x,sy=d>1?y/d:y,z=Math.sqrt(Math.max(0,1-dd*dd));
    n[k*3]=sx;n[k*3+1]=sy;n[k*3+2]=z;
    const diff=Math.max(0,sx*Lx+sy*Ly+z*Lz);
    // Ambient, key light, a little cloth bounce from below, and darkening at the silhouette.
    shade[k]=(.4+.78*diff+.1*Math.max(0,sy*.7-z*.2))*(.8+.2*z);
    const h=Math.max(0,sx*Hx+sy*Hy+z*Hz);
    spec[k]=Math.pow(h,70)*1.1+Math.pow(h,9)*.12;
  }
  lit={size,n,shade,spec,alpha};return lit;
}
/** Orientation matrices (body → screen), kept by the renderer only; rolling is derived from motion. */
export class BallLook{
  m=new Map<number,Float64Array>();
  last=new Map<number,{x:number;y:number}>();
  /** Bumped whenever a ball's orientation changes, so its sprite is redrawn only then. */
  ver=new Map<number,number>();
  reset(){this.m.clear();this.last.clear();this.ver.clear();}
  get(id:number){let m=this.m.get(id);if(!m){m=new Float64Array([1,0,0,0,1,0,0,0,1]);this.m.set(id,m);}return m;}
  roll(id:number,x:number,y:number,r:number){
    const prev=this.last.get(id);this.last.set(id,{x,y});if(!prev)return false;
    const dx=x-prev.x,dy=y-prev.y,d=Math.hypot(dx,dy);if(d<1e-4)return false;
    if(d>r*6)return false;// teleported (placement, re-spot)
    const th=d/r,ex=dx/d,ey=dy/d,co=Math.cos(th),si=Math.sin(th),m=this.get(id);
    // Rotate in the plane of (screen z, travel direction): the top of the ball moves with the travel.
    for(let col=0;col<3;col++){
      const vx=m[col],vy=m[3+col],vz=m[6+col];
      const a=vz,b=vx*ex+vy*ey;
      const na=a*co-b*si,nb=a*si+b*co;
      m[col]=vx+(nb-b)*ex;m[3+col]=vy+(nb-b)*ey;m[6+col]=na;
    }
    // Keep the matrix orthonormal against rounding drift (Gram–Schmidt on the columns).
    const n0=Math.hypot(m[0],m[3],m[6]);m[0]/=n0;m[3]/=n0;m[6]/=n0;
    const dot=m[0]*m[1]+m[3]*m[4]+m[6]*m[7];m[1]-=dot*m[0];m[4]-=dot*m[3];m[7]-=dot*m[6];
    const n1=Math.hypot(m[1],m[4],m[7]);m[1]/=n1;m[4]/=n1;m[7]/=n1;
    m[2]=m[3]*m[7]-m[6]*m[4];m[5]=m[6]*m[1]-m[0]*m[7];m[8]=m[0]*m[4]-m[3]*m[1];
    this.ver.set(id,(this.ver.get(id)??0)+1);
    return true;
  }
}
const sprites=new Map<number,Sprite>();
function sprite(id:number,radius:number,m:Float64Array,dim:boolean,ver:number):Sprite{
  const L=lighting(radius),size=L.size;
  let s=sprites.get(id);
  if(!s||s.canvas.width!==size){const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d')!;s={canvas,ctx,img:ctx.createImageData(size,size),key:''};sprites.set(id,s);}
  const key=`${size}:${dim}:${ver}`;
  if(s.key===key)return s;
  s.key=key;
  const out=s.img.data,[cr,cg,cb]=rgbOf(id),stripe=id>8,g=id>0?glyph(id):null;
  const capCos=.83,capR=Math.sqrt(1-capCos*capCos);
  for(let k=0;k<size*size;k++){
    const a=L.alpha[k],o=k*4;
    if(a<=0){out[o+3]=0;continue;}
    const nx=L.n[k*3],ny=L.n[k*3+1],nz=L.n[k*3+2];
    // Body coordinates: transpose of body→screen.
    const bx=m[0]*nx+m[3]*ny+m[6]*nz,by=m[1]*nx+m[4]*ny+m[7]*nz,bz=m[2]*nx+m[5]*ny+m[8]*nz;
    let r=cr,gg=cg,b=cb;
    if(id===0){
      // Cue ball: six red dots show its spin and roll.
      const ax=Math.abs(bx),ay=Math.abs(by),az=Math.abs(bz);
      if(ax>.975||ay>.975||az>.975){r=196;gg=38;b=42;}
    }else{
      if(stripe&&Math.abs(bx)>.56){r=246;gg=243;b=232;}
      if(Math.abs(bz)>capCos){
        r=246;gg=243;b=232;
        const u=(bz>0?bx:-bx)/capR,v=by/capR;
        const gx=Math.round((u*.5+.5)*(GLYPH-1)),gy=Math.round((v*.5+.5)*(GLYPH-1));
        if(gx>=0&&gy>=0&&gx<GLYPH&&gy<GLYPH){const t=g![gy*GLYPH+gx]/255;r=r*(1-t)+20*t;gg=gg*(1-t)+20*t;b=b*(1-t)+24*t;}
      }
    }
    const sh=L.shade[k]*(dim?.62:1),sp=L.spec[k]*255*(dim?.5:1);
    out[o]=r*sh+sp;out[o+1]=gg*sh+sp;out[o+2]=b*sh+sp;out[o+3]=a*255;
  }
  s.ctx.putImageData(s.img,0,0);return s;
}
let shadowSprite:{canvas:HTMLCanvasElement;r:number}|null=null;
function shadow(radius:number){
  if(shadowSprite&&shadowSprite.r===radius)return shadowSprite.canvas;
  const size=Math.ceil(radius*3.2),canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const c=canvas.getContext('2d')!,g=c.createRadialGradient(size/2,size/2,radius*.3,size/2,size/2,size/2);
  g.addColorStop(0,'rgba(0,0,0,.55)');g.addColorStop(.55,'rgba(0,0,0,.28)');g.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=g;c.fillRect(0,0,size,size);shadowSprite={canvas,r:radius};return canvas;
}

// ---------------------------------------------------------------- Frame
export interface Scene{
  balls:readonly Ball[];
  /** Balls dropping into pockets: id, pocket, progress 0..1. */
  sinking:{id:number;pocket:number;t:number;x:number;y:number}[];
  cue:null|{angle:number;pull:number;alpha:number};
  guide:null|{trace:Trace;legal:boolean;from:{x:number;y:number};length:number};
  hand:null|{x:number;y:number;valid:boolean;kitchen:boolean;active:boolean;pulse:number};
  pockets:null|{called:number|null;choosing:boolean};
  dimmed:Set<number>;
}
export class Renderer{
  private bg=document.createElement('canvas');private bgKey='';
  look=new BallLook();
  constructor(private canvas:HTMLCanvasElement){}
  draw(v:View,scene:Scene){
    const cw=Math.round(v.width*v.dpr),ch=Math.round(v.height*v.dpr);
    if(this.canvas.width!==cw||this.canvas.height!==ch){this.canvas.width=cw;this.canvas.height=ch;}
    const key=`${cw}x${ch}:${v.scale}:${v.portrait}`;
    if(this.bgKey!==key){
      this.bg.width=cw;this.bg.height=ch;const b=this.bg.getContext('2d')!;b.clearRect(0,0,cw,ch);drawTableArt(b,v);b.setTransform(1,0,0,1,0,0);this.bgKey=key;this.look.last.clear();
    }
    const c=this.canvas.getContext('2d')!;
    c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,cw,ch);c.drawImage(this.bg,0,0);
    worldTransform(c,v);
    const px=1/v.scale;
    if(scene.hand?.kitchen){
      c.strokeStyle='rgba(255,255,255,.35)';c.lineWidth=1.2*px;c.setLineDash([6*px,5*px]);c.beginPath();c.moveTo(HEAD_X,0);c.lineTo(HEAD_X,W);c.stroke();c.setLineDash([]);
    }
    if(scene.pockets){
      for(let i=0;i<POCKETS.length;i++){
        const p=POCKETS[i],called=scene.pockets.called===i,r=p.side?.066:.07;
        if(!called&&!scene.pockets.choosing)continue;
        c.strokeStyle=called?'#ffd257':'rgba(255,255,255,.45)';c.lineWidth=(called?3:1.5)*px;
        if(!called)c.setLineDash([4*px,4*px]);
        c.beginPath();c.arc(p.x,p.y,r,0,Math.PI*2);c.stroke();c.setLineDash([]);
      }
    }
    // Ball shadows first, so no shadow falls over a neighbouring ball.
    const rpx=R*v.scale*v.dpr,sh=shadow(rpx);
    c.setTransform(1,0,0,1,0,0);
    const lightOff={x:.28*rpx,y:.4*rpx};
    for(const b of scene.balls){
      if(!b.on)continue;const s=toScreen(v,b.x,b.y);
      c.drawImage(sh,s.x*v.dpr-sh.width/2+lightOff.x,s.y*v.dpr-sh.height/2+lightOff.y);
    }
    if(scene.guide)this.drawGuide(c,v,scene);
    c.setTransform(1,0,0,1,0,0);
    for(const k of scene.sinking){
      const p=POCKETS[k.pocket],t=Math.min(1,k.t),x=k.x+(p.x-k.x)*t,y=k.y+(p.y-k.y)*t,s=toScreen(v,x,y);
      const sp=sprite(k.id,rpx,this.look.get(k.id),false,this.look.ver.get(k.id)??0),scale=1-.45*t;
      c.globalAlpha=1-t*t;c.drawImage(sp.canvas,s.x*v.dpr-sp.canvas.width*scale/2,s.y*v.dpr-sp.canvas.height*scale/2,sp.canvas.width*scale,sp.canvas.height*scale);c.globalAlpha=1;
    }
    for(const b of scene.balls){
      if(!b.on){this.look.last.delete(b.id);continue;}
      const s=toScreen(v,b.x,b.y);
      this.look.roll(b.id,s.x*v.dpr,s.y*v.dpr,rpx);
      const sp=sprite(b.id,rpx,this.look.get(b.id),scene.dimmed.has(b.id),this.look.ver.get(b.id)??0);
      c.drawImage(sp.canvas,Math.round(s.x*v.dpr-sp.canvas.width/2),Math.round(s.y*v.dpr-sp.canvas.height/2));
    }
    if(scene.hand&&scene.hand.active){
      const s=toScreen(v,scene.hand.x,scene.hand.y);
      c.strokeStyle=scene.hand.valid?`rgba(255,255,255,${.55+.35*scene.hand.pulse})`:'#ff5a4a';c.lineWidth=2*v.dpr;
      c.setLineDash([5*v.dpr,4*v.dpr]);c.beginPath();c.arc(s.x*v.dpr,s.y*v.dpr,rpx+6*v.dpr,0,Math.PI*2);c.stroke();c.setLineDash([]);
    }
    if(scene.pockets?.called!=null){
      const p=POCKETS[scene.pockets.called],s=toScreen(v,p.x,p.y),r=9*v.dpr;
      c.fillStyle='#ffd257';c.beginPath();c.arc(s.x*v.dpr,s.y*v.dpr,r,0,Math.PI*2);c.fill();
      c.fillStyle='#151515';c.font=`800 ${11*v.dpr}px system-ui,sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText('8',s.x*v.dpr,s.y*v.dpr+.5*v.dpr);
    }
    if(scene.cue)this.drawCue(c,v,scene);
  }
  private drawGuide(c:CanvasRenderingContext2D,v:View,scene:Scene){
    const g=scene.guide!,t=g.trace,px=1/v.scale;
    worldTransform(c,v);
    c.save();c.beginPath();c.rect(0,0,L,W);c.clip();
    const col=g.legal?'rgba(255,255,255,.9)':'rgba(255,110,96,.95)';
    c.lineCap='round';
    c.strokeStyle='rgba(0,0,0,.25)';c.lineWidth=3.5*px;c.beginPath();c.moveTo(g.from.x,g.from.y);c.lineTo(t.x,t.y);c.stroke();
    c.strokeStyle=col;c.lineWidth=1.6*px;c.stroke();
    c.lineWidth=1.6*px;c.beginPath();c.arc(t.x,t.y,R,0,Math.PI*2);c.stroke();
    if(!g.legal&&t.hit!==null){c.beginPath();c.moveTo(t.x-R*.6,t.y-R*.6);c.lineTo(t.x+R*.6,t.y+R*.6);c.stroke();}
    if(t.hit!==null&&g.legal){
      const b=scene.balls[t.hit],dx=b.x-g.from.x,dy=b.y-g.from.y,d=Math.hypot(dx,dy)||1;
      const dir={x:(t.x-g.from.x),y:(t.y-g.from.y)},dl=Math.hypot(dir.x,dir.y)||1;
      const thick=Math.abs((dir.x*t.ox+dir.y*t.oy)/dl);
      const ol=(.06+.3*thick)*g.length,cl=(.04+.14*(1-thick))*g.length;
      c.strokeStyle='rgba(255,255,255,.85)';c.lineWidth=1.6*px;c.beginPath();c.moveTo(b.x+t.ox*R,b.y+t.oy*R);c.lineTo(b.x+t.ox*(R+ol),b.y+t.oy*(R+ol));c.stroke();
      c.strokeStyle='rgba(255,255,255,.45)';c.beginPath();c.moveTo(t.x+t.cx*R,t.y+t.cy*R);c.lineTo(t.x+t.cx*(R+cl),t.y+t.cy*(R+cl));c.stroke();
      void d;
    }else if(t.cushion){
      c.strokeStyle='rgba(255,255,255,.45)';c.lineWidth=1.4*px;c.beginPath();c.moveTo(t.x,t.y);c.lineTo(t.x+t.cx*.18*g.length,t.y+t.cy*.18*g.length);c.stroke();
    }
    c.restore();
  }
  private drawCue(c:CanvasRenderingContext2D,v:View,scene:Scene){
    const cue=scene.balls[0];if(!cue.on)return;
    const {angle,pull,alpha}=scene.cue!,dx=Math.cos(angle),dy=Math.sin(angle);
    worldTransform(c,v);
    c.save();c.globalAlpha=alpha;
    const gap=R+.006+pull,len=1.42;
    const at=(d:number)=>({x:cue.x-dx*(gap+d),y:cue.y-dy*(gap+d)});
    const radius=(d:number)=>.0058+(.0135-.0058)*Math.pow(d/len,1.4);
    const nx=-dy,ny=dx;
    const quad=(d0:number,d1:number,fill:string|CanvasGradient)=>{
      const a=at(d0),b=at(d1),r0=radius(d0),r1=radius(d1);
      c.fillStyle=fill;c.beginPath();c.moveTo(a.x+nx*r0,a.y+ny*r0);c.lineTo(b.x+nx*r1,b.y+ny*r1);c.lineTo(b.x-nx*r1,b.y-ny*r1);c.lineTo(a.x-nx*r0,a.y-ny*r0);c.closePath();c.fill();
    };
    // Shadow on the cloth, offset away from the light.
    c.save();c.translate(.012,.02);quad(0,len,'rgba(0,0,0,.28)');c.restore();
    const along=(d0:number,d1:number,stops:[number,string][])=>{const a=at(d0),b=at(d1),g=c.createLinearGradient(a.x,a.y,b.x,b.y);for(const [o,col] of stops)g.addColorStop(o,col);return g;};
    quad(0,.008,'#2f6db5');
    quad(.008,.03,'#f2ede0');
    quad(.03,.74,along(.03,.74,[[0,'#f0dcae'],[1,'#d8b077']]));
    quad(.74,.752,'#c9ccd2');
    quad(.752,1.06,along(.752,1.06,[[0,'#3b1f10'],[.5,'#22110a'],[1,'#3b1f10']]));
    // Maple points inlaid in the forearm.
    for(const side of [1,-1]){
      const a=at(.80),b=at(1.0),r=radius(.9)*.8;c.fillStyle='#e0c38c';c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x+nx*r*side,b.y+ny*r*side);c.lineTo(b.x,b.y);c.closePath();c.fill();
    }
    quad(1.06,1.07,'#c9ccd2');
    quad(1.07,1.3,'#151515');
    quad(1.3,1.41,along(1.3,1.41,[[0,'#3b1f10'],[1,'#5a2e16']]));
    quad(1.41,len,'#0c0c0c');
    // Cylindrical shading across the whole cue.
    const mid=at(len/2),shade=c.createLinearGradient(mid.x+nx*.014,mid.y+ny*.014,mid.x-nx*.014,mid.y-ny*.014);
    shade.addColorStop(0,'rgba(0,0,0,.35)');shade.addColorStop(.3,'rgba(255,255,255,.28)');shade.addColorStop(.5,'rgba(255,255,255,0)');shade.addColorStop(1,'rgba(0,0,0,.45)');
    quad(0,len,shade);
    c.restore();
  }
}
