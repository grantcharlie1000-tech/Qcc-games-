/**
 * Deterministic billiards physics. Units are metres, seconds and radians.
 *
 * The table is a 7-foot playing surface in landscape: x runs along the length (0..L), y across (0..W), y down.
 * Each ball keeps its linear velocity v, a "roll" vector s (the speed its top/back spin would give it when rolling,
 * so natural roll means s = v) and side spin w (rad/s, positive = clockwise on screen). The cloth applies sliding
 * friction until v = s, then rolling resistance. Ball–ball and ball–cushion contacts use restitution impulses plus a
 * capped tangential friction impulse, which produces throw and running/reverse english off the cushions. Follow,
 * stun and draw fall out of the roll vector surviving the collision.
 *
 * Model after Leckie & Greenspan, "An event-based pool physics simulator" and Mathavan et al. (cushion and
 * ball-ball friction); integrated here with a small fixed step instead of event prediction.
 */
export const R=0.028575;
export const L=1.98, W=0.99;
export const HEAD_X=L/4, FOOT_X=L*3/4;
export const G=9.81;
const MU_SLIDE=0.13, MU_ROLL=0.015, SPIN_DECEL=10;
const E_BALL=0.95, MU_BALL=0.06, MU_CUSHION=0.14;
export const MAX_SPEED=7.2;
export const DT=1/600;
const CORNER_MOUTH=0.118, SIDE_MOUTH=0.132;

export interface Seg{ax:number;ay:number;bx:number;by:number}
export interface Pocket{
  /** Capture circle: a ball whose centre enters it drops. */
  x:number;y:number;r:number;
  /** Mouth midpoint and unit outward axis. */
  mx:number;my:number;dx:number;dy:number;
  /** Jaw points at the mouth; their distance is the opening. */
  j1x:number;j1y:number;j2x:number;j2y:number;
  side:boolean;
}
function buildTable(){
  const segs:Seg[]=[],pockets:Pocket[]=[];
  const a=CORNER_MOUTH/Math.SQRT2;
  const corner=(cx:number,cy:number)=>{
    const ix=cx===0?1:-1,iy=cy===0?1:-1;
    const j1x=cx+ix*a,j1y=cy,j2x=cx,j2y=cy+iy*a;
    const mx=(j1x+j2x)/2,my=(j1y+j2y)/2,dx=-ix/Math.SQRT2,dy=-iy/Math.SQRT2;
    pockets.push({x:mx+dx*.05,y:my+dy*.05,r:.058,mx,my,dx,dy,j1x,j1y,j2x,j2y,side:false});
    // Jaws narrow slightly toward the throat.
    const depth=.075,k=.86;
    segs.push({ax:j1x,ay:j1y,bx:mx+dx*depth+(j1x-mx)*k,by:my+dy*depth+(j1y-my)*k});
    segs.push({ax:j2x,ay:j2y,bx:mx+dx*depth+(j2x-mx)*k,by:my+dy*depth+(j2y-my)*k});
  };
  const side=(cy:number)=>{
    const iy=cy===0?1:-1,h=SIDE_MOUTH/2,mx=L/2,my=cy,dx=0,dy=-iy;
    const j1x=mx-h,j2x=mx+h;
    pockets.push({x:mx,y:my+dy*.046,r:.06,mx,my,dx,dy,j1x,j1y:cy,j2x,j2y:cy,side:true});
    const depth=.06,k=.9;
    segs.push({ax:j1x,ay:cy,bx:mx+(j1x-mx)*k,by:my+dy*depth});
    segs.push({ax:j2x,ay:cy,bx:mx+(j2x-mx)*k,by:my+dy*depth});
  };
  // Pocket order: top-left, top-middle, top-right, bottom-left, bottom-middle, bottom-right.
  corner(0,0);side(0);corner(L,0);corner(0,W);side(W);corner(L,W);
  // Cushion noses between the jaw points.
  const p=pockets;
  segs.push({ax:p[0].j1x,ay:0,bx:p[1].j1x,by:0},{ax:p[1].j2x,ay:0,bx:p[2].j1x,by:0});
  segs.push({ax:p[3].j1x,ay:W,bx:p[4].j1x,by:W},{ax:p[4].j2x,ay:W,bx:p[5].j1x,by:W});
  segs.push({ax:0,ay:p[0].j2y,bx:0,by:p[3].j2y},{ax:L,ay:p[2].j2y,bx:L,by:p[5].j2y});
  return {segs,pockets};
}
export const {segs:CUSHIONS,pockets:POCKETS}=buildTable();
export const POCKET_NAMES=['top-left corner','top side','top-right corner','bottom-left corner','bottom side','bottom-right corner'];

export interface Ball{id:number;x:number;y:number;vx:number;vy:number;sx:number;sy:number;w:number;on:boolean}
export interface Impact{kind:'ball'|'rail'|'pocket';speed:number;x:number;y:number;id:number}
/** Everything the rules need to judge a shot, collected while it runs. Arrays keep it serialisable. */
export interface ShotLog{
  first:number|null;
  /** A ball touched a cushion after the cue ball's first contact. */
  railAfterContact:boolean;
  /** Distinct object balls that touched a cushion (break legality). */
  railBalls:number[];
  pots:{id:number;pocket:number}[];
  scratch:boolean;
  time:number;
}
export const emptyLog=():ShotLog=>({first:null,railAfterContact:false,railBalls:[],pots:[],scratch:false,time:0});

const moving=(b:Ball)=>b.vx!==0||b.vy!==0||b.sx!==0||b.sy!==0;
export const anyMoving=(balls:readonly Ball[])=>balls.some(b=>b.on&&moving(b));

/** Cue strike: power 0..1; spinX right english, spinY follow (+) / draw (−), both within the unit disc. */
/** Power is eased so the soft end of the stroke has fine control. */
export const powerSpeed=(power:number)=>{const p=Math.max(0,Math.min(1,power));return MAX_SPEED*(.18*p+.82*p*p);};
export function strike(cue:Ball,angle:number,power:number,spinX:number,spinY:number){
  const v=powerSpeed(power),dx=Math.cos(angle),dy=Math.sin(angle);
  const m=Math.hypot(spinX,spinY);if(m>1){spinX/=m;spinY/=m;}
  // Contact offset up to 0.6 radius. s = 5vh/(2R) along the shot; w = −5va/(2R²).
  const h=spinY*.6*R,a=spinX*.6*R;
  cue.vx=dx*v;cue.vy=dy*v;
  const roll=5*v*h/(2*R);cue.sx=dx*roll;cue.sy=dy*roll;
  cue.w=-5*v*a/(2*R*R);
}

function cloth(b:Ball,dt:number){
  const ux=b.vx-b.sx,uy=b.vy-b.sy,u=Math.hypot(ux,uy);
  if(u>1e-6){
    const k=MU_SLIDE*G*dt,ex=ux/u,ey=uy/u;
    if(3.5*k>=u){b.vx-=ex*u/3.5;b.vy-=ey*u/3.5;b.sx=b.vx;b.sy=b.vy;}
    else{b.vx-=ex*k;b.vy-=ey*k;b.sx+=ex*2.5*k;b.sy+=ey*2.5*k;}
  }else{
    const v=Math.hypot(b.vx,b.vy),next=v-MU_ROLL*G*dt;
    if(next<=.004){b.vx=b.vy=b.sx=b.sy=0;}
    else{b.vx*=next/v;b.vy*=next/v;b.sx=b.vx;b.sy=b.vy;}
  }
  const dw=SPIN_DECEL*dt;b.w=Math.abs(b.w)<=dw?0:b.w-Math.sign(b.w)*dw;
  if(!moving(b))b.w=0;
}

function ballPair(a:Ball,b:Ball,log:ShotLog|null,impacts:Impact[]|null){
  let dx=b.x-a.x,dy=b.y-a.y;const d2=dx*dx+dy*dy;
  if(d2>=4*R*R)return;
  let d=Math.sqrt(d2);if(d<1e-9){dx=1;dy=0;d=1;}
  const nx=dx/d,ny=dy/d,overlap=2*R-d;
  a.x-=nx*overlap/2;a.y-=ny*overlap/2;b.x+=nx*overlap/2;b.y+=ny*overlap/2;
  const vn=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;
  if(vn<=0)return;
  const jn=(1+E_BALL)/2*vn;
  a.vx-=jn*nx;a.vy-=jn*ny;b.vx+=jn*nx;b.vy+=jn*ny;
  const tx=-ny,ty=nx,rel=(a.vx-b.vx)*tx+(a.vy-b.vy)*ty+R*(a.w+b.w);
  const cap=MU_BALL*jn,p=Math.max(-cap,Math.min(cap,-rel/7));
  a.vx+=p*tx;a.vy+=p*ty;b.vx-=p*tx;b.vy-=p*ty;a.w+=2.5*p/R;b.w+=2.5*p/R;
  if(log&&log.first===null&&(a.id===0||b.id===0))log.first=a.id===0?b.id:a.id;
  impacts?.push({kind:'ball',speed:vn,x:(a.x+b.x)/2,y:(a.y+b.y)/2,id:a.id===0?b.id:a.id});
}

function cushion(b:Ball,log:ShotLog|null,impacts:Impact[]|null){
  for(const s of CUSHIONS){
    const ex=s.bx-s.ax,ey=s.by-s.ay,len2=ex*ex+ey*ey;
    let t=((b.x-s.ax)*ex+(b.y-s.ay)*ey)/len2;t=t<0?0:t>1?1:t;
    const cx=s.ax+ex*t,cy=s.ay+ey*t;let nx=b.x-cx,ny=b.y-cy;const d2=nx*nx+ny*ny;
    if(d2>=R*R||d2<1e-14)continue;
    const d=Math.sqrt(d2);nx/=d;ny/=d;
    b.x+=nx*(R-d);b.y+=ny*(R-d);
    const vn=b.vx*nx+b.vy*ny;if(vn>=0)continue;
    // Softer at speed, as real cushions are.
    const e=.86-.16*Math.min(1,-vn/4.5),jn=-(1+e)*vn;
    b.vx+=jn*nx;b.vy+=jn*ny;
    const tx=-ny,ty=nx,rel=b.vx*tx+b.vy*ty-R*b.w,cap=MU_CUSHION*jn,p=Math.max(-cap,Math.min(cap,-rel/3.5));
    b.vx+=p*tx;b.vy+=p*ty;b.w-=2.5*p/R;
    // The cushion nose sits above the equator and absorbs the roll component into it.
    const sn=b.sx*nx+b.sy*ny;b.sx-=sn*nx*1.15;b.sy-=sn*ny*1.15;
    if(log){
      if(log.first!==null)log.railAfterContact=true;
      if(b.id!==0&&!log.railBalls.includes(b.id))log.railBalls.push(b.id);
    }
    impacts?.push({kind:'rail',speed:-vn,x:b.x,y:b.y,id:b.id});
  }
}

const nearEdge=(b:Ball)=>b.x<R+.004||b.x>L-R-.004||b.y<R+.004||b.y>W-R-.004;

/** Advance one fixed step. Returns true while anything is still moving. */
export function step(balls:Ball[],log:ShotLog|null,impacts:Impact[]|null=null,dt=DT):boolean{
  for(const b of balls){
    if(!b.on||!moving(b))continue;
    cloth(b,dt);
    b.x+=b.vx*dt;b.y+=b.vy*dt;
  }
  for(let pass=0;pass<2;pass++){
    for(let i=0;i<balls.length;i++){
      const a=balls[i];if(!a.on)continue;
      const am=moving(a);
      for(let j=i+1;j<balls.length;j++){
        const b=balls[j];if(!b.on||(!am&&!moving(b)))continue;
        ballPair(a,b,log,pass===0?impacts:null);
      }
    }
    for(const b of balls)if(b.on&&nearEdge(b))cushion(b,log,pass===0?impacts:null);
  }
  for(const b of balls){
    if(!b.on)continue;
    let pocket=-1;
    for(let p=0;p<POCKETS.length;p++){const q=POCKETS[p];if((b.x-q.x)**2+(b.y-q.y)**2<q.r*q.r){pocket=p;break;}}
    // Anything that escapes the table goes to the nearest pocket rather than vanishing.
    if(pocket<0&&(b.x<-R||b.x>L+R||b.y<-R||b.y>W+R)){
      let best=Infinity;POCKETS.forEach((q,p)=>{const d=Math.hypot(b.x-q.x,b.y-q.y);if(d<best){best=d;pocket=p;}});
    }
    if(pocket>=0){
      const speed=Math.hypot(b.vx,b.vy),bx=b.x,by=b.y;
      b.on=false;b.vx=b.vy=b.sx=b.sy=b.w=0;
      if(log){log.pots.push({id:b.id,pocket});if(b.id===0)log.scratch=true;}
      impacts?.push({kind:'pocket',speed,x:bx,y:by,id:b.id});
    }
  }
  if(log)log.time+=dt;
  return anyMoving(balls);
}

/** Run a whole shot to rest (used by the AI and tests). */
export function simulate(balls:Ball[],log:ShotLog,maxSeconds=40){
  const limit=Math.ceil(maxSeconds/DT);
  for(let i=0;i<limit;i++)if(!step(balls,log))return;
  for(const b of balls){b.vx=b.vy=b.sx=b.sy=b.w=0;}
}

export function segmentDistance(px:number,py:number,ax:number,ay:number,bx:number,by:number){
  const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(px-ax-dx*t,py-ay-dy*t);
}
/** Distance along a unit ray to a circle, or Infinity. */
export function rayCircle(x:number,y:number,dx:number,dy:number,cx:number,cy:number,r:number){
  const ox=x-cx,oy=y-cy,c=ox*ox+oy*oy-r*r;if(c<=0)return 0;
  const b=ox*dx+oy*dy,disc=b*b-c;if(disc<0)return Infinity;
  const t=-b-Math.sqrt(disc);return t>=0?t:Infinity;
}
/** Distance along a unit ray until a ball of radius R touches the segment. */
function rayCapsule(x:number,y:number,dx:number,dy:number,s:Seg){
  let best=Math.min(rayCircle(x,y,dx,dy,s.ax,s.ay,R),rayCircle(x,y,dx,dy,s.bx,s.by,R));
  const ex=s.bx-s.ax,ey=s.by-s.ay,len=Math.hypot(ex,ey),tx=ex/len,ty=ey/len;
  for(const side of [1,-1]){
    const nx=-ty*side,ny=tx*side;
    // Offset line: points p with (p - a)·n = R.
    const denom=dx*nx+dy*ny;if(denom>=-1e-9)continue;
    const t=(R-((x-s.ax)*nx+(y-s.ay)*ny))/denom;if(t<0||t>=best)continue;
    const px=x+dx*t,py=y+dy*t,along=(px-s.ax)*tx+(py-s.ay)*ty;
    if(along>=0&&along<=len)best=t;
  }
  return best;
}
export interface Trace{
  x:number;y:number;hit:number|null;
  /** Object ball direction (unit) when a ball is hit. */
  ox:number;oy:number;
  /** Cue ball tangent direction after contact (unit), or the cushion rebound direction. */
  cx:number;cy:number;
  pocket:number|null;cushion:boolean;
}
/** Straight-line preview of the cue ball's path to its first contact. */
export function trace(balls:readonly Ball[],from:{x:number;y:number},angle:number,ignore=0):Trace{
  const dx=Math.cos(angle),dy=Math.sin(angle);
  let dist=10,hit:number|null=null,cush:Seg|null=null,pocket:number|null=null;
  for(const b of balls){
    if(!b.on||b.id===ignore)continue;
    const t=rayCircle(from.x,from.y,dx,dy,b.x,b.y,2*R);if(t<dist){dist=t;hit=b.id;}
  }
  for(const s of CUSHIONS){const t=rayCapsule(from.x,from.y,dx,dy,s);if(t<dist){dist=t;hit=null;cush=s;}}
  // The ball drops when it reaches a capture circle first.
  for(let p=0;p<POCKETS.length;p++){
    const q=POCKETS[p],t=rayCircle(from.x,from.y,dx,dy,q.x,q.y,q.r);
    if(t<dist){dist=t;hit=null;cush=null;pocket=p;}
  }
  const x=from.x+dx*dist,y=from.y+dy*dist;
  if(hit!==null){
    const b=balls.find(b=>b.id===hit)!;
    const ox=(b.x-x)/(2*R),oy=(b.y-y)/(2*R);
    // Tangent line: perpendicular to the object line, on the side the cue ball was travelling.
    let cx=-oy,cy=ox;if(cx*dx+cy*dy<0){cx=-cx;cy=-cy;}
    return {x,y,hit,ox,oy,cx,cy,pocket:null,cushion:false};
  }
  if(cush){
    // Closest point on the segment gives the contact normal.
    const ex=cush.bx-cush.ax,ey=cush.by-cush.ay;let t=((x-cush.ax)*ex+(y-cush.ay)*ey)/(ex*ex+ey*ey);t=Math.max(0,Math.min(1,t));
    let nx=x-(cush.ax+ex*t),ny=y-(cush.ay+ey*t);const n=Math.hypot(nx,ny)||1;nx/=n;ny/=n;
    const dot=dx*nx+dy*ny;
    return {x,y,hit:null,ox:0,oy:0,cx:dx-2*dot*nx,cy:dy-2*dot*ny,pocket:null,cushion:true};
  }
  return {x,y,hit:null,ox:0,oy:0,cx:0,cy:0,pocket,cushion:false};
}
