import {COURSES,WIDTH,LENGTH,RADIUS,START,TARGET,type Puck,type Shot} from './model';
export type Vec = [number,number,number];
export type Theme = 'pier'|'noel';
export type PaintWorld = (p: Projector, theme: Theme,course:number) => void;
const TAU=Math.PI*2;
export class Projector {
  ox=0; oy=0; scale=1;
  constructor(readonly c:CanvasRenderingContext2D,readonly w:number,readonly h:number){
    const projected=([-1,1] as const).flatMap(s=>[-1,1].map(t=>this.point([s*4.45,-.9,t*9.6])));
    const xs=projected.map(p=>p[0]),ys=projected.map(p=>p[1]);
    const [left,right,top,bottom]=[Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)];
    this.scale=Math.min(w*.84/(right-left),h*.79/(bottom-top));
    this.ox=w*.5-this.scale*(left+right)*.5;
    this.oy=h*.55-this.scale*(top+bottom)*.5;
  }
  point([x,y,z]:Vec):[number,number]{
    const across=x*.993-z*.118, along=x*.118+z*.993;
    const factor=32/(32-along*.76-y*.65);
    return [this.ox+this.scale*factor*across,this.oy+this.scale*factor*(along*.65-y*.76)];
  }
  path(vertices:Vec[], fill:string, stroke?:string, weight=1){
    const c=this.c;c.beginPath();
    vertices.forEach((v,i)=>{const [x,y]=this.point(v);if(i)c.lineTo(x,y);else c.moveTo(x,y);});
    c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=weight;c.stroke();}
  }
  line(a:Vec,b:Vec,color:string,width:number){
    const c=this.c;c.beginPath();c.moveTo(...this.point(a));c.lineTo(...this.point(b));c.strokeStyle=color;c.lineWidth=width;c.stroke();
  }
  disc(x:number,y:number,z:number,r:number,color:string,rz=r){
    this.path(Array.from({length:56},(_,i):Vec=>[x+r*Math.cos(i*TAU/56),y,z+rz*Math.sin(i*TAU/56)]),color);
  }
  box(x:number,y:number,z:number,wx:number,hy:number,dz:number,top:string,front:string,side:string){
    const l=x-wx/2,r=x+wx/2,b=z-dz/2,f=z+dz/2,t=y+hy;
    this.path([[l,y,f],[r,y,f],[r,t,f],[l,t,f]],front);
    this.path([[r,y,b],[r,t,b],[r,t,f],[r,y,f]],side);
    this.path([[l,y,b],[l,t,b],[l,t,f],[l,y,f]],side);
    this.path([[l,t,b],[r,t,b],[r,t,f],[l,t,f]],top);
  }
}
export class Court {
  private cache=document.createElement('canvas');
  private painter!:Projector;
  private sizeKey='';
  private course=0;
  private observer:ResizeObserver;
  private last:{pucks:readonly Puck[]; seat:number; shot:Shot|null;tail:readonly Puck[]}={pucks:[],seat:0,shot:null,tail:[]};
  constructor(readonly canvas:HTMLCanvasElement,private theme:Theme,private scenery?:PaintWorld){
    this.observer=new ResizeObserver(()=>this.draw(this.last.pucks,this.last.seat,this.last.shot,this.last.tail));
    this.observer.observe(canvas);
  }
  setTheme(theme:Theme){this.theme=theme;this.sizeKey='';this.draw(this.last.pucks,this.last.seat,this.last.shot);}
  setCourse(index:number){if(this.course!==index){this.course=index;this.sizeKey='';}}
  draw(pucks:readonly Puck[],seat:number,shot:Shot|null,tail:readonly Puck[]=[]){
    this.last={pucks,seat,shot,tail};
    const {canvas}=this,w=canvas.clientWidth,h=canvas.clientHeight;
    if(!w||!h)return;
    const dpr=Math.min(devicePixelRatio||1,2),key=[w,h,dpr,this.theme].join('/');
    const ctx=canvas.getContext('2d')!;
    if(key!==this.sizeKey){
      this.sizeKey=key;canvas.width=this.cache.width=Math.round(w*dpr);canvas.height=this.cache.height=Math.round(h*dpr);
      const c=this.cache.getContext('2d')!;c.setTransform(dpr,0,0,dpr,0,0);
      const p=new Projector(c,w,h);this.painter=new Projector(ctx,w,h);
      c.fillStyle=this.theme==='noel'?'#245768':'#53a7a3';c.fillRect(0,0,w,h);
      this.scenery?.(p,this.theme,this.course);this.board(p);
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    ctx.drawImage(this.cache,0,0,w,h);
    const p=this.painter;
    tail.forEach((s,i)=>p.disc(s.x,.025,s.z,.08+.12*i/Math.max(1,tail.length),s.seat?'#31879a5c':'#bc67435c'));
    if(shot){
      const angle=shot.angle*Math.PI/180;
      for(let i=1;i<=8;i++){
        const d=i*(.32+shot.power*.0018);p.disc(Math.sin(angle)*d+shot.spin*.012*d*d,.024,START-Math.cos(angle)*d,.052,'#235862');
      }
    }
    const visible=shot?[...pucks,{x:0,z:START,seat,bonus:0}]:[...pucks];
    visible.sort((a,b)=>a.z-b.z).forEach(puck=>this.puck(p,puck));
  }
  private board(p:Projector){
    const winter=this.theme==='noel',rail=winter?'#d94747':'#148b86';
    p.box(0,-.93,0,8.32,.77,18.64,rail,'#173e46','#28545a');
    p.box(0,-.61,0,8.34,.055,18.66,'#d2ad6c','#e1bb7e','#b5956a');
    for(let i=0;i<8;i++){
      const colors=winter?['#c7e5e4','#d5eded','#cfe8e8']:['#f4cf91','#ffe1ac','#f6d69b'];
      p.box(-WIDTH+(i+.5)*WIDTH/4,-.16,0,WIDTH/4+.008,.16,LENGTH*2,colors[i%3],colors[i%3],colors[i%3]);
      if(!winter)for(let j=0;j<5;j++){
        const x=-WIDTH+(i+.18+(j%3)*.23)*WIDTH/4,z=-7+((i*13+j*7)%15);
        p.line([x,.012,z],[x+.018,.012,Math.min(8.9,z+1.1)],'#9b784622',.9);
      }
    }
    p.box(0,.003,-LENGTH-.12,8.25,.19,.24,rail,'#214e53','#1c6062');
    for(const side of [-1,1])p.box(side*(WIDTH+.15),.003,0,.3,.17,18.52,rail,'#214e53','#1c6062');
    const course=COURSES[this.course],cx=course.targetX;
    for(const [r,col] of [[3.25,'#22585a'],[3.16,'#f9f0cb'],[2.53,winter?'#ac3e45':'#e57451'],[1.55,'#20585a'],[.72,'#ffc456']] as const)p.disc(cx,.016,TARGET,r,col);
    for(const [r,n,col] of [[0,'8','#67442e'],[1.05,'5','#fff1cb'],[2,'3','#fff4d0'],[2.85,'1','#365959']] as const){
      const [x,y]=p.point([cx+r,.03,TARGET]);p.c.textAlign='center';p.c.textBaseline='middle';
      p.c.fillStyle=col;p.c.font='bold '+Math.max(9,p.scale*.28)+'px system-ui';p.c.fillText(n,x,y);
    }
    for(const side of [-1,1]) for(let i=0;i<21;i++){
      const z=-8.5+i*.85;
      p.line([side*(WIDTH-.09),.02,z],[side*(WIDTH-(i%5===0?.37:.18)),.02,z],'#656c56',1.3);
      if(winter && i%2===0)p.box(side*(WIDTH+.15),.179,z,.3,.009,.38,'#fff3d8','#e1cabe','#e1cabe');
    }
    if(course.current){
      for(let z=-.8;z<3.4;z+=.75){
        for(let x=-3.25;x<3.5;x+=.94){
          const dir=Math.sign(course.current)*.20;
          p.line([x-dir,.022,z-.13],[x,.022,z],'#538c936b',1.5);
          p.line([x,.022,z],[x-dir,.022,z+.13],'#538c936b',1.5);
        }
      }
    }
    for(const [x,z] of course.pegs){
      p.disc(x+.07,.025,z+.07,.4,'#34585255');p.disc(x,.025,z,.34,'#285058');
      p.disc(x,.2,z,.34,'#e5a848');p.disc(x,.31,z,.27,'#fff2c9');p.disc(x,.32,z,.13,'#cd7848');
    }
    if(course.gate){
      const [x,z]=course.gate;
      for(let i=0;i<6;i++)p.line([x-.72+i*.25,.022,z],[x-.62+i*.25,.022,z],'#b77720',3);
      for(const side of [-1,1]){
        p.box(x+side*.78,.025,z,.10,.68,.1,'#fff4c9','#a37022','#c48826');
        p.path([[x+side*.78,.70,z],[x+side*(.78+.39),.61,z],[x+side*.78,.48,z]],'#dc8a26');
      }
    }
    for(const z of [3.8,7.48]) p.line([-WIDTH,.018,z],[WIDTH,.018,z],'#845e47',Math.max(1,p.scale*.035));
    const [tx,ty]=p.point([0,.026,8.22]),[rx,ry]=p.point([1,.026,8.22]);
    p.c.save();p.c.translate(tx,ty);p.c.rotate(Math.atan2(ry-ty,rx-tx));
    p.c.fillStyle=winter?'#3b636b':'#795f40';p.c.textAlign='center';p.c.font='bold '+Math.max(8,p.scale*.22)+'px Georgia';
    p.c.fillText('D R I F T   C L U B',0,0);p.c.restore();
  }
  private puck(p:Projector,b:Puck){
    const {x,z,seat}=b;
    p.disc(x+.08,.02,z+.11,RADIUS*1.08,'#24494d66');
    const rim=seat?'#144b62':'#9e4132',top=seat?'#57b8dc':'#fa7754';
    const sides=Array.from({length:15},(_,i)=>Math.PI*(i/14));
    p.disc(x,.08,z,RADIUS,rim);
    p.path([...sides.map((a):Vec=>[x+Math.cos(a)*RADIUS,.08,z+Math.sin(a)*RADIUS]),...sides.slice().reverse().map((a):Vec=>[x+Math.cos(a)*RADIUS,.35,z+Math.sin(a)*RADIUS])],rim);
    p.disc(x,.35,z,RADIUS,top);p.disc(x,.355,z,RADIUS*.67,'#fff3cb');p.disc(x,.36,z,RADIUS*.49,top);
    if(seat)p.line([x-.11,.37,z],[x+.11,.37,z],'#193d4a',2);else p.disc(x,.37,z,.065,'#7e382b');
  }
  dispose(){this.observer.disconnect();this.cache.width=1;this.cache.height=1;}
}
