// Library cover for Animal Stack, composed from the live species art so it stays in sync with the sprites.
// Each stacked animal is placed at a chosen x and angle, then lowered until its colliders touch the
// platform or an animal already placed, so contacts follow the real collider shapes.
const W=320,H=410,K=.76;
const PLATFORM={x:36,y:382,width:248,height:8};
/** Drawn in order; each rests on what came before. `flip` mirrors the cutout; `drop` is the waiting animal at a fixed height.
 * Species must not repeat, because each art string carries ids prefixed with its key. */
const LAYOUT=[
 {kind:'elephant',x:136,angle:0},
 {kind:'turtle',x:61,angle:0,flip:true},
 {kind:'peacock',x:236,angle:0,flip:true},
 {kind:'panda',x:150,angle:-5,flip:true},
 {kind:'lion',x:145,angle:-12},
 {kind:'redPanda',x:162,angle:12},
 {kind:'giraffe',x:172,angle:-6,flip:true},
 {kind:'penguin',x:150,y:46,angle:-16,drop:true},
];
const STROKE='#1d1b22';

function placed(def,{x,y,angle,flip}){
 const r=angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r),sx=(flip?-1:1)*K;
 return def.shapes.map(poly=>poly.map(p=>({x:x+c*p.x*sx-s*p.y*K,y:y+s*p.x*sx+c*p.y*K})));
}
const edges=poly=>poly.map((a,i)=>[a,poly[(i+1)%poly.length]]);
/** Vertical gap from point p down to the edge, or Infinity when the edge is not below it. */
function gapDown(p,[a,b]){
 if(a.x===b.x)return Infinity;const t=(p.x-a.x)/(b.x-a.x);if(t<0||t>1)return Infinity;
 const ey=a.y+t*(b.y-a.y);return ey>=p.y-1e-6?ey-p.y:Infinity;
}
/** Exact distance a set of convex parts can fall before touching any obstacle polygon. */
function fallDistance(parts,obstacles){
 let best=Infinity;
 for(const part of parts)for(const ob of obstacles){
  for(const p of part)for(const e of edges(ob))best=Math.min(best,gapDown(p,e));
  // Obstacle vertices hitting the falling part from below: measure upward to the part's edges.
  for(const q of ob)for(const [a,b] of edges(part)){if(a.x===b.x)continue;const t=(q.x-a.x)/(b.x-a.x);if(t<0||t>1)continue;const ey=a.y+t*(b.y-a.y);if(ey<=q.y+1e-6)best=Math.min(best,q.y-ey);}
 }
 return best;
}
/** Resolves every animal's resting position by lowering it onto the platform and the stack below. */
export function stackLayout(SPECIES){
 const p=PLATFORM,obstacles=[[{x:p.x,y:p.y},{x:p.x+p.width,y:p.y},{x:p.x+p.width,y:p.y+p.height},{x:p.x,y:p.y+p.height}]];
 return LAYOUT.map(item=>{
  const def=SPECIES[item.kind];if(!def)throw new Error(`cover: unknown species ${item.kind}`);
  if(item.drop)return {...item,def};
  const start={...item,y:-200},fall=fallDistance(placed(def,start),obstacles);
  if(!Number.isFinite(fall))throw new Error(`cover: ${item.kind} misses the stack`);
  const rest={...item,y:start.y+fall-.4,def};obstacles.push(...placed(def,rest));return rest;
 });
}
const cloud=(x,y,s)=>`<path transform="translate(${x} ${y}) scale(${s})" d="M-34 10a12 12 0 0 1 6-20a16 16 0 0 1 28-8a14 14 0 0 1 24 6a11 11 0 0 1 12 22Z"/>`;
const n=v=>+v.toFixed(2);
export function coverSvg(SPECIES){
 const kinds=LAYOUT.map(l=>l.kind);if(new Set(kinds).size!==kinds.length)throw new Error('cover: a species appears twice, so its ids would clash');
 const layout=stackLayout(SPECIES),top=layout.filter(l=>!l.drop);
 const animal=l=>`<g transform="translate(${n(l.x)} ${n(l.y)}) rotate(${l.angle}) scale(${l.flip?-K:K} ${K})">${l.def.art}</g>`;
 const drop=layout.find(l=>l.drop),obstacles=top.flatMap(l=>placed(l.def,l));
 // Aim guide: from the waiting animal's centre straight down to the first surface below it.
 const landing=Math.min(PLATFORM.y,...obstacles.flatMap(poly=>edges(poly).map(e=>drop.y+gapDown({x:drop.x,y:drop.y},e))));
 const p=PLATFORM;
 return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc"><title id="title">A wobbly tower of toy animal cutouts as a penguin waits to drop on top</title><desc id="desc">Original illustrated game cover for Pocket Arcade.</desc>`+
 `<rect width="${W}" height="${H}" fill="#55c3ec"/>`+
 `<g fill="#86d6f4">${cloud(260,88,1.02)}${cloud(42,209,.82)}${cloud(283,266,.68)}</g><g fill="#dff4fc">${cloud(258,84,1)}${cloud(40,205,.8)}${cloud(281,262,.66)}</g>`+
 `<path d="M${n(drop.x)} ${n(drop.y)}V${n(landing-5)}" stroke="#f4fbff" stroke-opacity=".8" stroke-width="2.2" stroke-linecap="round" stroke-dasharray=".1 7"/>`+
 `<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" rx="1" fill="#779b25" stroke="${STROKE}" stroke-width="2.6"/><rect x="${p.x+1.5}" y="${p.y+1}" width="${p.width-3}" height="${p.height/2}" fill="#a0cf31"/>`+
 layout.map(animal).join('')+`</svg>
`;
}
