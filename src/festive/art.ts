/**
 * Shared Christmas palette and Canvas 2D drawing helpers. Everything here is
 * decoration only: no helper reads or changes game state, and callers draw
 * these around (never instead of) the shapes their physics or rules use.
 * The palette matches Crossy Road's Christmas models so the arcade reads as one.
 */
export const XMAS={
  red:'#d8263a',redDeep:'#a81b2d',redDark:'#6e1220',
  green:'#2c9a55',greenDeep:'#1f7a42',evergreen:'#0f3b2a',evergreenDeep:'#082619',
  gold:'#e9b949',goldLight:'#f8dd8a',goldDeep:'#a87b1e',
  fur:'#fff6e6',furShade:'#e6dccb',snow:'#f6faff',snowShade:'#d9e3f1',
  ice:'#bfe3f5',iceDeep:'#5fa8d3',midnight:'#0b1733',midnightDeep:'#060d20',
  coal:'#24252b',coalLight:'#4a4c55',brick:'#9c3b2c',brickDeep:'#6d2519',mortar:'#d9c9b6',
} as const;

/** Christmas-light bulb colours, chosen to stay distinct from each other at small sizes. */
export const BULBS=['#e8323f','#2fb35a','#f4c430','#2f8fe0','#f07f2b','#b45cd6'] as const;

type Ctx=CanvasRenderingContext2D;

/**
 * A Santa hat whose brim is centred on (x,y), `w` wide, rotated by `tilt`
 * radians. `lean` (−1…1) bends the tip sideways. The hat sits above y.
 */
export function drawSantaHat(ctx:Ctx,x:number,y:number,w:number,tilt=0,lean=-0.6):void{
  ctx.save();ctx.translate(x,y);ctx.rotate(tilt);
  const h=w*0.95,brimH=w*0.3;
  // Cone: a soft curved body that flops to one side.
  const tipX=lean*w*0.55,tipY=-h;
  ctx.beginPath();
  ctx.moveTo(-w*0.44,-brimH*0.4);
  ctx.bezierCurveTo(-w*0.38,-h*0.62,tipX-w*0.12,tipY+h*0.18,tipX,tipY);
  ctx.bezierCurveTo(tipX+w*0.12,tipY+h*0.28,w*0.32,-h*0.5,w*0.44,-brimH*0.4);
  ctx.closePath();
  const body=ctx.createLinearGradient(-w*0.4,0,w*0.4,0);
  body.addColorStop(0,XMAS.red);body.addColorStop(1,XMAS.redDeep);
  ctx.fillStyle=body;ctx.fill();
  ctx.lineWidth=Math.max(1,w*0.05);ctx.strokeStyle=XMAS.redDark;ctx.stroke();
  // Fur brim and pompom.
  roundRect(ctx,-w*0.52,-brimH*0.62,w*1.04,brimH,brimH*0.5);
  ctx.fillStyle=XMAS.fur;ctx.fill();ctx.strokeStyle=XMAS.furShade;ctx.lineWidth=Math.max(1,w*0.035);ctx.stroke();
  ctx.beginPath();ctx.arc(tipX,tipY,w*0.16,0,Math.PI*2);ctx.fillStyle=XMAS.fur;ctx.fill();ctx.stroke();
  ctx.restore();
}

/**
 * A glass bauble filling the circle (cx,cy,r) exactly, with a metal cap that
 * sits on top of the circle (outside it, so the round silhouette is unchanged).
 */
export function drawBauble(ctx:Ctx,cx:number,cy:number,r:number,color:string,band?:string,rotation=0):void{
  ctx.save();ctx.translate(cx,cy);ctx.rotate(rotation);
  // Cap and wire loop, above the sphere.
  const capW=r*0.42,capH=r*0.24;
  ctx.beginPath();ctx.arc(0,-r-capH*0.95,r*0.13,0,Math.PI*2);ctx.lineWidth=Math.max(1,r*0.06);ctx.strokeStyle=XMAS.goldDeep;ctx.stroke();
  const cap=ctx.createLinearGradient(-capW/2,0,capW/2,0);
  cap.addColorStop(0,XMAS.goldDeep);cap.addColorStop(.45,XMAS.goldLight);cap.addColorStop(1,XMAS.goldDeep);
  roundRect(ctx,-capW/2,-r-capH*0.7,capW,capH,capH*0.3);ctx.fillStyle=cap;ctx.fill();
  // Sphere.
  const g=ctx.createRadialGradient(-r*0.35,-r*0.4,r*0.08,0,0,r);
  g.addColorStop(0,mix(color,'#ffffff',0.55));g.addColorStop(0.35,color);g.addColorStop(1,mix(color,'#000000',0.45));
  ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();
  if(band){
    ctx.save();ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.clip();
    ctx.fillStyle=band;ctx.globalAlpha=0.9;
    ctx.beginPath();ctx.ellipse(0,r*0.05,r*1.05,r*0.2,0,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=1;ctx.restore();
  }
  // Specular highlight.
  ctx.beginPath();ctx.ellipse(-r*0.36,-r*0.42,r*0.22,r*0.13,-0.6,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,0.75)';ctx.fill();
  ctx.lineWidth=Math.max(1,r*0.04);ctx.strokeStyle=mix(color,'#000000',0.55);ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();
  ctx.restore();
}

/** A candy cane standing in the box (x,y,w,h), hook at the top. */
export function drawCandyCane(ctx:Ctx,x:number,y:number,w:number,h:number):void{
  ctx.save();
  const lw=Math.max(2,w*0.32),hookR=w*0.34;
  const path=new Path2D();
  path.moveTo(x+w*0.36,y+h-lw/2);path.lineTo(x+w*0.36,y+hookR+lw/2);
  path.arc(x+w*0.36+hookR,y+hookR+lw/2,hookR,Math.PI,0);path.lineTo(x+w*0.36+hookR*2,y+hookR*1.6+lw/2);
  ctx.lineCap='round';ctx.lineJoin='round';
  ctx.lineWidth=lw+Math.max(1,lw*0.25);ctx.strokeStyle=XMAS.redDark;ctx.stroke(path);
  ctx.lineWidth=lw;ctx.strokeStyle=XMAS.fur;ctx.stroke(path);
  ctx.setLineDash([lw*0.75,lw*0.75]);ctx.strokeStyle=XMAS.red;ctx.stroke(path);
  ctx.restore();
}

/** A Christmas-light bulb with a soft glow, base at (x,y), pointing in `angle`. */
export function drawBulb(ctx:Ctx,x:number,y:number,size:number,color:string,angle=Math.PI/2,glow=true):void{
  ctx.save();ctx.translate(x,y);ctx.rotate(angle-Math.PI/2);
  if(glow){
    const g=ctx.createRadialGradient(0,size*0.7,0,0,size*0.7,size*1.6);
    g.addColorStop(0,withAlpha(color,0.45));g.addColorStop(1,withAlpha(color,0));
    ctx.fillStyle=g;ctx.fillRect(-size*1.6,-size,size*3.2,size*3.4);
  }
  ctx.fillStyle='#3a4a3a';roundRect(ctx,-size*0.24,-size*0.1,size*0.48,size*0.34,size*0.08);ctx.fill();
  ctx.beginPath();ctx.ellipse(0,size*0.72,size*0.36,size*0.52,0,0,Math.PI*2);
  const b=ctx.createRadialGradient(-size*0.1,size*0.55,size*0.04,0,size*0.72,size*0.55);
  b.addColorStop(0,mix(color,'#ffffff',0.6));b.addColorStop(1,color);
  ctx.fillStyle=b;ctx.fill();
  ctx.restore();
}

/** A six-armed snowflake centred on (x,y). */
export function drawSnowflake(ctx:Ctx,x:number,y:number,r:number,color:string=XMAS.snow,alpha=1):void{
  ctx.save();ctx.translate(x,y);ctx.globalAlpha*=alpha;ctx.strokeStyle=color;ctx.lineWidth=Math.max(0.8,r*0.16);ctx.lineCap='round';
  ctx.beginPath();
  for(let i=0;i<6;i++){
    const a=i*Math.PI/3,c=Math.cos(a),s=Math.sin(a);
    ctx.moveTo(0,0);ctx.lineTo(c*r,s*r);
    const bx=c*r*0.55,by=s*r*0.55,k=r*0.28;
    ctx.moveTo(bx,by);ctx.lineTo(bx+Math.cos(a+0.7)*k,by+Math.sin(a+0.7)*k);
    ctx.moveTo(bx,by);ctx.lineTo(bx+Math.cos(a-0.7)*k,by+Math.sin(a-0.7)*k);
  }
  ctx.stroke();ctx.restore();
}

/**
 * Snow lying along the top edge of a rectangle (x,y,w): a soft lumpy cap of
 * depth `d` above y. Deterministic for a given `seed`, so it never shimmers.
 */
export function drawSnowCap(ctx:Ctx,x:number,y:number,w:number,d:number,seed=1):void{
  ctx.save();
  const steps=Math.max(3,Math.round(w/(d*2.2)));
  ctx.beginPath();ctx.moveTo(x-d*0.15,y+d*0.35);
  for(let i=0;i<=steps;i++){
    const px=x+w*i/steps,bump=d*(0.65+0.35*hash(seed*31+i));
    ctx.quadraticCurveTo(px-w/steps/2,y-bump,px,y-bump*0.55);
  }
  ctx.lineTo(x+w+d*0.15,y+d*0.35);
  // Drips over the edge.
  ctx.quadraticCurveTo(x+w*0.7,y+d*0.9,x+w*0.5,y+d*0.4);
  ctx.quadraticCurveTo(x+w*0.25,y+d*0.75,x-d*0.15,y+d*0.35);
  ctx.closePath();
  const g=ctx.createLinearGradient(0,y-d,0,y+d*0.8);g.addColorStop(0,XMAS.snow);g.addColorStop(1,XMAS.snowShade);
  ctx.fillStyle=g;ctx.fill();
  ctx.restore();
}

/** A string of lights along a straight line, `count` bulbs, colours cycling. */
export function drawLightString(ctx:Ctx,x1:number,y1:number,x2:number,y2:number,count:number,size:number,sag=size*0.8,offset=0):void{
  ctx.save();ctx.strokeStyle='#22372a';ctx.lineWidth=Math.max(1,size*0.14);
  const point=(t:number)=>({x:x1+(x2-x1)*t,y:y1+(y2-y1)*t+Math.sin(t*count*Math.PI)*sag*0.5});
  ctx.beginPath();for(let i=0;i<=count*6;i++){const p=point(i/(count*6));if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);}ctx.stroke();
  ctx.restore();
  for(let i=0;i<count;i++){const p=point((i+0.5)/count);drawBulb(ctx,p.x,p.y,size,BULBS[(i+offset)%BULBS.length]!);}
}

export function roundRect(ctx:Ctx,x:number,y:number,w:number,h:number,r:number):void{
  const rr=Math.min(r,w/2,h/2);
  ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath();
}

/** Mixes two #rrggbb colours; t=0 gives a, t=1 gives b. */
export function mix(a:string,b:string,t:number):string{
  const pa=parse(a),pb=parse(b);
  return '#'+pa.map((v,i)=>Math.round(v+(pb[i]!-v)*t).toString(16).padStart(2,'0')).join('');
}
export function withAlpha(color:string,alpha:number):string{const [r,g,b]=parse(color);return `rgba(${r},${g},${b},${alpha})`;}
function parse(c:string):[number,number,number]{
  let h=c.replace('#','');if(h.length===3)h=h.split('').map(x=>x+x).join('');
  const n=parseInt(h.slice(0,6),16);return [(n>>16)&255,(n>>8)&255,n&255];
}
/** A stable pseudo-random number in [0,1) for decoration layouts. */
export function hash(n:number):number{let x=Math.imul(n^0x9e3779b9,0x85ebca6b);x^=x>>>13;x=Math.imul(x,0xc2b2ae35);x^=x>>>16;return (x>>>0)/4294967296;}
