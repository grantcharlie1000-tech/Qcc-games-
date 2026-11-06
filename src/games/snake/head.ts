/**
 * Snake head geometry as SVG path data, shared by the Canvas renderer (via Path2D) and the
 * pose sheet in public/game-art/snake/mouth-poses.svg. Head-local units: +x is forward,
 * the origin is the head centre and `r` is the head radius.
 *
 * Seen from above, the snout hinges open into a jaw that grows out from under the head:
 * the jaw is a full ellipse whose back half stays hidden under the head disc, so the
 * silhouette never shows a seam or a straight cut. The mouth cavity is a second ellipse
 * inside the jaw, with two fangs at its upper and lower lips.
 */
export interface HeadPose{jaw:string|null;cavity:string|null;fangs:string|null;cavityBox:{cx:number;rx:number;ry:number}|null}
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const f=(n:number)=>Number(n.toFixed(2));
function ellipse(cx:number,rx:number,ry:number):string{
 // Two arcs make a closed ellipse in plain SVG path syntax.
 return `M${f(cx-rx)} 0A${f(rx)} ${f(ry)} 0 1 0 ${f(cx+rx)} 0A${f(rx)} ${f(ry)} 0 1 0 ${f(cx-rx)} 0Z`;
}
export function headPose(open:number,r:number):HeadPose{
 const o=Math.max(0,Math.min(1,open));
 if(o<.02)return {jaw:null,cavity:null,fangs:null,cavityBox:null};
 // The jaw starts fully inside the head disc (hidden) and swings out past the head's width.
 const hinge=.3*r,rx=lerp(.6,1.08,o)*r,ry=lerp(.75,1.28,o)*r;
 const jaw=ellipse(hinge,rx,ry);
 // Cavity sits ahead of the eyes: a slit when barely open, a deep oval at full gape.
 const x0=.4*r,x1=hinge+rx-lerp(.16,.2,o)*r,crx=Math.max(.5,(x1-x0)/2),ccx=x0+crx,cry=lerp(.12,.92,o)*r;
 const cavity=ellipse(ccx,crx,cry);
 // Fangs hang from both lips toward the centre line, just behind the cavity's widest point.
 const fx=ccx-crx*.2,fy=cry*Math.sqrt(1-.2*.2)+.4,fw=.12*r*o,fh=.26*r*o;
 const tooth=(s:number)=>`M${f(fx-fw)} ${f(s*fy)}Q${f(fx)} ${f(s*(fy+.8))} ${f(fx+fw)} ${f(s*fy)}L${f(fx+.2)} ${f(s*(fy-fh))}Z`;
 return {jaw,cavity,fangs:tooth(-1)+tooth(1),cavityBox:{cx:ccx,rx:crx,ry:cry}};
}
/** Solves CSS cubic-bezier(x1,y1,x2,y2) for y at progress x. */
export function cubicBezier(x1:number,y1:number,x2:number,y2:number){
 const bx=(t:number)=>3*x1*t*(1-t)**2+3*x2*t*t*(1-t)+t**3,by=(t:number)=>3*y1*t*(1-t)**2+3*y2*t*t*(1-t)+t**3;
 return (x:number)=>{
  if(x<=0)return 0;if(x>=1)return 1;
  let lo=0,hi=1;for(let i=0;i<30;i++){const m=(lo+hi)/2;if(bx(m)<x)lo=m;else hi=m;}
  return by((lo+hi)/2);
 };
}
/** Strong UI ease-out, cubic-bezier(0.23, 1, 0.32, 1). */
export const easeOutStrong=cubicBezier(.23,1,.32,1);
