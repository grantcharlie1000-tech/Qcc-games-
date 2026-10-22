/**
 * Corn Clicker artwork: original hand-written SVG, returned as markup strings.
 * Every root <svg> is decorative (aria-hidden); the game supplies labels.
 * Sizes come from CSS, so roots carry only a viewBox. Gradient ids use a cc- prefix.
 */
export type ProducerId='farmhand'|'patch'|'field'|'tractor'|'combine'|'greenhouse'|'irrigation'|'factory'|'lab'|'hydroponic'|'robot'|'weather'|'megafarm'|'orbital'|'lunar'|'cloner'|'time'|'dimension'|'singularity'|'corniverse';
export type SkinId='classic'|'butter'|'ruby'|'bluemoon'|'prism'|'frost'|'midnight'|'golden';
export type VarietyId='sweet'|'popcorn'|'bluemoon'|'prism'|'candy'|'ghost'|'ember'|'starcob';

const O='#3a2410';
const n=(v:number)=>Math.round(v*10)/10;
const svg=(vb:string,body:string,extra='')=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" aria-hidden="true" focusable="false"${extra}>${body}</svg>`;

/** Small deterministic PRNG so artwork is identical on every render. */
function rng(seed:number):()=>number{let s=seed>>>0||1;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}
const hex=(c:string)=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
function mix(a:string,b:string,t:number):string{const A=hex(a),B=hex(b);return'#'+A.map((v,i)=>Math.round(v+((B[i]??v)-v)*t).toString(16).padStart(2,'0')).join('');}

type Stop=[number,string,number?];
const stops=(s:Stop[])=>s.map(([o,c,a])=>`<stop offset="${o}" stop-color="${c}"${a===undefined?'':` stop-opacity="${a}"`}/>`).join('');
const lin=(id:string,s:Stop[],h=false)=>`<linearGradient id="${id}" x1="0" y1="0" x2="${h?1:0}" y2="${h?0:1}">${stops(s)}</linearGradient>`;
const rad=(id:string,s:Stop[],cx=.5,cy=.5,r=.5)=>`<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops(s)}</radialGradient>`;
/** Four-point sparkle. */
const spark=(x:number,y:number,r:number,fill='#fff',op=1)=>`<path d="M${n(x)} ${n(y-r)}Q${n(x)} ${n(y)} ${n(x+r)} ${n(y)}Q${n(x)} ${n(y)} ${n(x)} ${n(y+r)}Q${n(x)} ${n(y)} ${n(x-r)} ${n(y)}Q${n(x)} ${n(y)} ${n(x)} ${n(y-r)}Z" fill="${fill}"${op<1?` opacity="${op}"`:''} stroke="none"/>`;
function dots(count:number,seed:number,x0:number,x1:number,y0:number,y1:number,rmax:number,fill:string):string{
 const r=rng(seed);let s='';
 for(let i=0;i<count;i++){const x=x0+r()*(x1-x0),y=y0+r()*(y1-y0),q=r();s+=q>.86?spark(x,y,rmax*2.4,fill,.9):`<circle cx="${n(x)}" cy="${n(y)}" r="${n(.4+q*rmax)}" fill="${fill}" stroke="none" opacity="${n(.45+q*.55)}"/>`;}
 return s;
}

/* ---------- Shared cob builder ---------- */
function cobPath(cx:number,top:number,bot:number,w:number):string{
 const H=bot-top,X=(f:number)=>n(cx+f*w),Y=(f:number)=>n(top+f*H);
 return`M${X(0)} ${Y(0)}C${X(.807)} ${Y(0)} ${X(1.018)} ${Y(.281)} ${X(1)} ${Y(.544)}S${X(.737)} ${Y(.982)} ${X(0)} ${Y(1)}S${X(-.982)} ${Y(.825)} ${X(-1)} ${Y(.544)}S${X(-.807)} ${Y(0)} ${X(0)} ${Y(0)}Z`;
}
interface CobOpts{id:string;cx:number;top:number;bot:number;w:number;rows:number;cols:number;k0:string;k1:string;gap:string;sw:number;pick?:(i:number,j:number,r:()=>number)=>string;speck?:number;gloss?:number;seed?:number}
/** Upright cob with individually shaped, curvature-shaded kernels. */
function buildCob(o:CobOpts):string{
 const H=o.bot-o.top,d=cobPath(o.cx,o.top,o.bot,o.w),r=rng(o.seed??11),gl=o.gloss??.5;
 const y0=o.top+H*.03,y1=o.top+H*.99,rh=(y1-y0)/o.rows,A=1.25,sA=Math.sin(A);
 let k='';
 for(let j=0;j<o.rows;j++){
  const yc=y0+(j+.5)*rh,t=(yc-o.top)/H,q=(t-.553)/(t<.553?.561:.465),ww=o.w*.97*Math.sqrt(Math.max(0,1-q*q));
  if(ww<o.w*.12)continue;
  for(let i=0;i<o.cols;i++){
   const u=-1+(i+.5)*2/o.cols,a=u*A,x=o.cx+ww*Math.sin(a)/sA,kw=ww*Math.cos(a)*2*A/o.cols/sA*.86,kh=rh*.84;
   if(kw<.6)continue;
   const shade=Math.min(1,u*u*.95+Math.abs(q)*.3);
   const base=o.pick?o.pick(i,j,r):o.k0,dark=o.pick?mix(base,'#140a24',.5):o.k1;
   k+=`<rect x="${n(x-kw/2)}" y="${n(yc-kh/2)}" width="${n(kw)}" height="${n(kh)}" rx="${n(Math.min(kw,kh)*.42)}" fill="${mix(base,dark,shade)}"/>`;
   if(Math.abs(u)<.75&&kw>o.w*.07)k+=`<ellipse cx="${n(x-kw*.16)}" cy="${n(yc-kh*.18)}" rx="${n(kw*.2)}" ry="${n(kh*.17)}" fill="#fff" opacity="${gl}"/>`;
   if(o.speck&&r()<o.speck)k+=`<circle cx="${n(x+kw*.12)}" cy="${n(yc+kh*.1)}" r="${n(Math.max(.4,kh*.11))}" fill="#fff8d0"/>`;
  }
 }
 return`<defs><clipPath id="${o.id}-c"><path d="${d}"/></clipPath>${lin(o.id+'-s',[[0,'#000',.4],[.3,'#000',0],[.7,'#000',0],[1,'#000',.5]],true)}</defs>`+
 `<path d="${d}" fill="${o.gap}"/><g clip-path="url(#${o.id}-c)">${k}<path d="${d}" fill="url(#${o.id}-s)"/></g>`+
 `<ellipse cx="${n(o.cx-o.w*.45)}" cy="${n(o.top+H*.4)}" rx="${n(o.w*.11)}" ry="${n(H*.2)}" fill="#fff" opacity=".3"/>`+
 `<path d="${d}" fill="none" stroke="${O}" stroke-width="${o.sw}" stroke-linejoin="round"/>`;
}

/* ---------- Big clickable cob ---------- */
interface Skin{k0:string;k1:string;gap:string;h0:string;h1:string}
const SKINS:Record<SkinId,Skin>={
 classic:{k0:'#ffe45c',k1:'#ee9f1a',gap:'#b86f10',h0:'#9ad957',h1:'#4c9a2d'},
 butter:{k0:'#fff07a',k1:'#f2b228',gap:'#c27a12',h0:'#a6dc63',h1:'#4f9b31'},
 ruby:{k0:'#ff6f7d',k1:'#a8102c',gap:'#5e0716',h0:'#a9d36a',h1:'#4b8a2f'},
 bluemoon:{k0:'#93a3ff',k1:'#4a2cb8',gap:'#21125e',h0:'#8fdcaa',h1:'#2d8768'},
 prism:{k0:'#ffffff',k1:'#999999',gap:'#3b2a4e',h0:'#efdda0',h1:'#b08f45'},
 frost:{k0:'#f2fbff',k1:'#86c2ea',gap:'#4f86b0',h0:'#d6f3f4',h1:'#79b0be'},
 midnight:{k0:'#4a58a0',k1:'#161b44',gap:'#090b20',h0:'#4b6290',h1:'#1c2647'},
 golden:{k0:'#fff3a3',k1:'#e3a10c',gap:'#94600a',h0:'#f0d873',h1:'#a7821d'},
};
const GEMS=['#ff5d8f','#ffa64d','#ffe14d','#6fe08a','#4fc3f7','#8f7bff','#d66bff','#ff7ad1'];

export function cobSvg(skin:SkinId):string{
 const p=SKINS[skin],id=`cc-cob-${skin}`;
 const pick=skin==='prism'?(_i:number,_j:number,r:()=>number)=>GEMS[Math.floor(r()*GEMS.length)]??'#ffe14d':undefined;
 const cob=buildCob({id,cx:100,top:24,bot:252,w:57,rows:16,cols:10,k0:p.k0,k1:p.k1,gap:p.gap,sw:5,pick,seed:skin.length*7+3,
  speck:skin==='midnight'?.22:undefined,gloss:skin==='prism'||skin==='frost'?.75:skin==='midnight'?.25:.5});
 const hs=`stroke="${O}" stroke-width="4" stroke-linejoin="round"`;
 const husk=`<defs>${lin(id+'-h',[[0,p.h0],[1,p.h1]],true)}</defs>`+
 `<path d="M90 284h20v14H90z" fill="${p.h1}" ${hs}/>`+
 `<path d="M102 292C68 288 40 244 34 158C56 196 78 226 106 252Z" fill="url(#${id}-h)" ${hs}/>`+
 `<path d="M98 292C132 288 160 244 166 154C144 194 122 226 94 252Z" fill="url(#${id}-h)" ${hs}/>`+
 `<path d="M100 294C80 284 72 252 84 212C92 234 98 248 104 262C108 246 114 232 122 218C130 254 122 284 100 294Z" fill="url(#${id}-h)" ${hs}/>`+
 `<path d="M98 284C76 270 56 236 44 186M102 284C124 270 144 236 156 184M100 286C94 268 90 248 86 226M106 282C112 264 116 246 120 230" fill="none" stroke="${p.h1}" stroke-width="2" opacity=".7"/>`;
 let extra='';
 if(skin==='butter')extra=`<defs>${lin(id+'-b',[[0,'#fffbd6'],[1,'#ffe36e']])}</defs><path d="M60 72C58 40 78 20 100 20S144 36 142 66C141 76 136 74 134 84C132 98 122 98 122 84C122 72 116 72 114 82C112 104 98 104 98 86C98 74 90 72 86 80C82 90 72 90 72 78C72 70 64 84 60 72Z" fill="url(#${id}-b)" stroke="${O}" stroke-width="4" stroke-linejoin="round"/><ellipse cx="84" cy="40" rx="12" ry="5" fill="#fff" opacity=".8" transform="rotate(-20 84 40)"/><circle cx="128" cy="88" r="3" fill="#fff" opacity=".7"/>`;
 if(skin==='frost')extra=spark(150,62,12)+spark(54,104,8,'#e6fbff')+spark(140,190,7)+spark(70,226,6,'#e6fbff')+spark(165,120,5);
 if(skin==='midnight')extra=spark(156,48,9,'#ffe98a')+spark(44,86,6,'#cfd8ff')+spark(168,176,5,'#ffe98a')+spark(36,210,7,'#cfd8ff')+spark(112,70,4,'#fff');
 if(skin==='golden')extra=spark(154,52,13,'#fffbe0')+spark(46,96,9,'#fff3a0')+spark(160,200,8,'#fffbe0')+spark(118,120,6,'#fff')+spark(58,230,6,'#fff3a0');
 if(skin==='prism')extra=spark(150,70,9,'#fff')+spark(56,150,6,'#fff')+spark(134,200,6,'#fff');
 return svg('0 0 200 300',`<g class="cc-cob-body">${cob}${husk}${extra}</g>`);
}

/* ---------- Producer icons ---------- */
/** Small cob for icons; h is the cob height in icon units. */
function miniCob(x:number,y:number,h:number,rot=0,fill='#ffd23f',dark='#d0900f',husk=true):string{
 const s=h/24;
 return`<g transform="translate(${x} ${y}) rotate(${rot}) scale(${n(s*100)/100})" stroke-width="${n(2/s)}"><path d="M0-12c5 0 6 6 6 11s-2 10-6 10-6-5-6-10 1-11 6-11z" fill="${fill}"/><path d="M-5-5h10M-6 0h12M-5 5h10M-2-11v18M2-11v18" stroke="${dark}" stroke-width="${n(1.1/s)}" fill="none"/>${husk?`<path d="M0 13c-7-1-9-8-8-15 2 5 4 8 8 9 4-1 6-4 8-9 1 7-1 14-8 15z" fill="#6cbf3d"/>`:''}</g>`;
}
const sprout=(x:number,y:number,s=1)=>`<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0v-9" stroke="#3d8b2a" stroke-width="2.4" fill="none"/><path d="M0-6c-6 1-9-2-10-7 6-1 9 2 10 7z" fill="#7ccf45" stroke-width="1.6"/><path d="M0-8c1-6 5-8 10-7-1 5-5 8-10 7z" fill="#8fdc4f" stroke-width="1.6"/></g>`;
const stalk=(x:number,b:number,h:number,cob=true)=>`<path d="M${x} ${b}V${b-h}" stroke="#3f8a2a" stroke-width="3" fill="none"/><path d="M${x} ${n(b-h*.3)}c-6-1-10 2-12 7 6 1 10-1 12-7z" fill="#6cc04a" stroke-width="1.6"/><path d="M${x} ${n(b-h*.62)}c6-2 10 0 12 5-6 1-10-1-12-5z" fill="#7bd052" stroke-width="1.6"/>${cob?`<ellipse cx="${x+3}" cy="${n(b-h*.48)}" rx="3" ry="6" fill="#ffd23f" stroke-width="1.6" transform="rotate(14 ${x+3} ${n(b-h*.48)})"/>`:''}<path d="M${x} ${b-h}l-3-5M${x} ${b-h}l3-5M${x} ${b-h}v-6" stroke="#e2b23a" stroke-width="1.8" fill="none"/>`;
const wheel=(x:number,y:number,r:number)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#3b3f46"/><circle cx="${x}" cy="${y}" r="${n(r-1.6)}" fill="none" stroke="#24272c" stroke-width="2" stroke-dasharray="2.5 2.5"/><circle cx="${x}" cy="${y}" r="${n(r*.42)}" fill="#ffd34d"/>`;
function disc(id:string,c0:string,c1:string,seed:number,starCol='#fff'):string{
 const r=rng(seed);let s='';
 for(let i=0;i<14;i++){const a=r()*6.283,d=Math.sqrt(r())*26,x=32+Math.cos(a)*d,y=32+Math.sin(a)*d,q=r();s+=q>.8?spark(x,y,2.4,starCol):`<circle cx="${n(x)}" cy="${n(y)}" r="${n(.5+q*.8)}" fill="${starCol}" stroke="none" opacity="${n(.5+q*.5)}"/>`;}
 return`<defs>${rad(id,[[0,c0],[1,c1]],.45,.4,.62)}</defs><circle cx="32" cy="32" r="30" fill="url(#${id})"/>${s}`;
}

const ICONS:Record<ProducerId,()=>string>={
 farmhand:()=>`<path d="M12 64c0-12 8-19 20-19s20 7 20 19z" fill="#e0533d"/><path d="M18 50l4 4M46 50l-4 4M14 58h4M46 58h4" stroke="#a83325" stroke-width="1.6" fill="none"/><path d="M22 64V52h20v12z" fill="#3f7fd0"/><path d="M22 52l-3-6M42 52l3-6" fill="none" stroke-width="2.6"/><circle cx="26" cy="56" r="1.4" fill="#ffd34d" stroke="none"/><circle cx="38" cy="56" r="1.4" fill="#ffd34d" stroke="none"/><circle cx="32" cy="32" r="12.5" fill="#f6c28f"/><ellipse cx="32" cy="22" rx="23" ry="5.5" fill="#f2cf5b"/><path d="M21 22c0-10 4-14 11-14s11 4 11 14z" fill="#ffda6a"/><path d="M21.5 18.5h21" stroke="#d24a3a" stroke-width="3.2"/><path d="M14 22.5q18 4 36 0" stroke="#d6aa38" stroke-width="1.2" fill="none"/><circle cx="27.5" cy="32" r="1.8" fill="${O}" stroke="none"/><circle cx="36.5" cy="32" r="1.8" fill="${O}" stroke="none"/><ellipse cx="24" cy="37" rx="2.6" ry="1.6" fill="#ff8f7a" stroke="none"/><ellipse cx="40" cy="37" rx="2.6" ry="1.6" fill="#ff8f7a" stroke="none"/><path d="M27.5 37.5q4.5 4.5 9 0" fill="none"/><path d="M36 39l10-5" stroke="#e8b83a" stroke-width="2"/>`,
 patch:()=>`<path d="M4 47c0-8 12-14 28-14s28 6 28 14-12 11-28 11S4 55 4 47z" fill="#a8693a"/><path d="M11 46q21-6 42 0M13 52q19-5 38 0" stroke="#7a4521" stroke-width="2" fill="none"/><circle cx="20" cy="40" r="1" fill="#7a4521" stroke="none"/><circle cx="45" cy="55" r="1.2" fill="#7a4521" stroke="none"/>${sprout(18,46,.95)}${sprout(32,42,1.15)}${sprout(46,46,.95)}`,
 field:()=>`<path d="M2 58q30-5 60 0v5H2z" fill="#a8693a"/>${stalk(11,59,38)}${stalk(25,58,48)}${stalk(39,58,44)}${stalk(53,59,36)}`,
 tractor:()=>`<path d="M14 21v10" stroke-width="3.2" fill="none"/><circle cx="12" cy="15" r="3.4" fill="#d9dde3" stroke-width="1.4"/><circle cx="8" cy="9" r="2.4" fill="#d9dde3" stroke-width="1.4"/><path d="M33 31V12h17v19z" fill="#bde7ff"/><path d="M36 15l4 0M36 19l7-6" stroke="#fff" stroke-width="1.8" fill="none"/><rect x="30" y="8" width="23" height="5" rx="2" fill="#e5413a"/><path d="M5 45V34q0-4 4-4h45v15z" fill="#e5413a"/><path d="M9 34v8M13 34v8" stroke="#a82822" stroke-width="1.6" fill="none"/><path d="M5 40h4" stroke-width="1.4"/>${wheel(44,47,13)}${wheel(14,52,8.5)}`,
 combine:()=>`<path d="M2 47l6-11h18v13H4z" fill="#f2c230"/><circle cx="11" cy="37" r="9" fill="none" stroke-width="2.4"/><path d="M11 28v18M2 37h18M5 31l12 12M17 31L5 43" stroke-width="1.6" fill="none"/><path d="M22 50V24h22l14 10v16z" fill="#4caf50"/><path d="M22 41h36" stroke="#f2c230" stroke-width="3.2"/><path d="M42 24V16h12v12" fill="#3e9142"/><path d="M53 17l9-9" stroke-width="5.6"/><path d="M53 17l9-9" stroke="#f2c230" stroke-width="3"/><path d="M25 24V12h14v12" fill="#bde7ff"/><rect x="23" y="9" width="18" height="4.4" rx="2" fill="#4caf50"/>${wheel(32,51,10)}${wheel(53,54,6.5)}`,
 greenhouse:()=>`<path d="M8 58V34Q8 14 32 10Q56 14 56 34V58z" fill="#d4f1ff" fill-opacity=".7"/>${sprout(17,57,.9)}${sprout(32,57,1)}${sprout(47,57,.9)}<ellipse cx="24" cy="48" rx="2.2" ry="4" fill="#ffd23f" stroke-width="1.4"/><ellipse cx="40" cy="48" rx="2.2" ry="4" fill="#ffd23f" stroke-width="1.4"/><path d="M8 34h48M8 46h48M20 58V13.5M32 58V10M44 58V13.5" stroke="#4a8fb0" stroke-width="1.8" fill="none"/><path d="M8 58V34Q8 14 32 10Q56 14 56 34V58z" fill="none"/><path d="M12 31q3-11 12-16M48 36l4-6" stroke="#fff" stroke-width="2.4" fill="none" opacity=".9"/><path d="M3 59h58" stroke-width="3"/>`,
 irrigation:()=>`${sprout(10,62,.8)}${sprout(22,62,.8)}${sprout(34,62,.8)}${sprout(46,62,.8)}${sprout(58,62,.8)}<path d="M23 30q-6 8-9 18M23 30q6 8 9 18M45 30q-6 8-9 18M45 30q6 8 9 18" stroke="#4fb6f5" stroke-width="2.2" stroke-dasharray="2.5 3" fill="none"/><path d="M10 52l7-30 7 30M42 52l7-30 7 30" stroke="#7d8a96" stroke-width="3" fill="none"/><circle cx="10" cy="53" r="3" fill="#3b3f46" stroke-width="1.4"/><circle cx="24" cy="53" r="3" fill="#3b3f46" stroke-width="1.4"/><circle cx="42" cy="53" r="3" fill="#3b3f46" stroke-width="1.4"/><circle cx="56" cy="53" r="3" fill="#3b3f46" stroke-width="1.4"/><path d="M3 22h58" stroke-width="8"/><path d="M3 22h58" stroke="#a9b6c2" stroke-width="5"/><path d="M4 20.6h56" stroke="#e6edf2" stroke-width="1.2"/><rect x="20" y="25" width="6" height="5" rx="1.5" fill="#5cc8ff" stroke-width="1.6"/><rect x="42" y="25" width="6" height="5" rx="1.5" fill="#5cc8ff" stroke-width="1.6"/><path d="M14 38q-2 3 0 4 2-1 0-4zM54 40q-2 3 0 4 2-1 0-4zM34 42q-2 3 0 4 2-1 0-4z" fill="#4fb6f5" stroke="none"/>`,
 factory:()=>`<circle cx="44" cy="8" r="4" fill="#fff6dc" stroke-width="1.4"/><circle cx="37" cy="6" r="3" fill="#fff6dc" stroke-width="1.4"/><circle cx="30" cy="4" r="2.2" fill="#fff6dc" stroke-width="1.4"/><path d="M4 60V36l11-8v8l11-8v8l11-8v32z" fill="#c7613d"/><rect x="8" y="42" width="6" height="6" rx="1" fill="#ffe27a" stroke-width="1.6"/><rect x="19" y="42" width="6" height="6" rx="1" fill="#ffe27a" stroke-width="1.6"/><rect x="29" y="42" width="6" height="6" rx="1" fill="#ffe27a" stroke-width="1.6"/><path d="M17 60v-8h8v8" fill="#7a3a24"/><path d="M50 12c5 0 7 9 7 20v28H43V32c0-11 2-20 7-20z" fill="#ffd23f"/><path d="M45 20h10M44 28h12M44 36h12M44 44h12M47 13v47M53 13v47" stroke="#d0900f" stroke-width="1.2" fill="none"/><path d="M40 60c0-10 3-16 10-18 7 2 10 8 10 18z" fill="#6cbf3d"/><path d="M2 60h60" stroke-width="3"/>`,
 lab:()=>`<defs>${rad('cc-pi-lab-g',[[0,'#d8ff6a',.9],[1,'#7dff8a',0]])}</defs><circle cx="32" cy="44" r="22" fill="url(#cc-pi-lab-g)" stroke="none"/><path d="M28 8V22L14 48Q10 58 20 58H44Q54 58 50 48L36 22V8Z" fill="#effcff" fill-opacity=".8"/><path d="M20.5 36H43.5L50 48Q54 58 44 58H20Q10 58 14 48Z" fill="#7dff8a" stroke="none"/><path d="M20.5 36H43.5" stroke="#3fbf55" stroke-width="1.6"/>${miniCob(32,46,17,18,'#fff27a','#d9a917',false)}<circle cx="24" cy="44" r="2" fill="#fff" stroke-width="1"/><circle cx="40" cy="31" r="1.8" fill="#fff" stroke-width="1"/><circle cx="36" cy="26" r="1.2" fill="#fff" stroke-width="1"/><path d="M28 8V22L14 48Q10 58 20 58H44Q54 58 50 48L36 22V8Z" fill="none"/><rect x="24" y="4" width="16" height="5" rx="2.5" fill="#d9e6ee"/><path d="M31 26l-3 6M19 50q-1 3 1 5" stroke="#fff" stroke-width="2" fill="none"/>`,
 hydroponic:()=>`<path d="M14 4h36l-6 6H20z" fill="#c86bff"/><path d="M20 10l-6 46M44 10l6 46" stroke="#e6b6ff" stroke-width="5" opacity=".35"/><rect x="29" y="8" width="6" height="54" rx="2" fill="#b8c4cc"/>${[19,31,43,55].map((y,i)=>`<path d="M${i%2?24:30} ${y-4}c-3-6-8-7-11-5 1 4 5 6 11 5zM${i%2?34:40} ${y-4}c3-6 8-7 11-5-1 4-5 6-11 5z" fill="${i%2?'#7bd052':'#5fb843'}" stroke-width="1.5"/><rect x="11" y="${y-4}" width="42" height="6" rx="3" fill="#e9f2f5"/><path d="M14 ${y-1}h36" stroke="#5cc8ff" stroke-width="1.6"/>`).join('')}<path d="M55 15v40" stroke="#4fb6f5" stroke-width="2" fill="none"/>`,
 robot:()=>`<path d="M32 10V4" fill="none"/><circle cx="32" cy="3.6" r="2.6" fill="#ff5a4f"/><rect x="10" y="50" width="38" height="12" rx="6" fill="#4b5059"/><circle cx="17" cy="56" r="3" fill="#8b929c" stroke-width="1.4"/><circle cx="29" cy="56" r="3" fill="#8b929c" stroke-width="1.4"/><circle cx="41" cy="56" r="3" fill="#8b929c" stroke-width="1.4"/><path d="M14 36l-7 7M10 44l-4-1M10 44l1 4" fill="none" stroke-width="2.6"/><path d="M44 36l8-8" fill="none" stroke-width="2.6"/><rect x="14" y="28" width="30" height="22" rx="5" fill="#9fc0d6"/><circle cx="29" cy="39" r="4.4" fill="#ffd34d"/><path d="M19 33h4M19 45h4M35 45h4" stroke="#5a7487" stroke-width="1.6"/><rect x="18" y="10" width="24" height="17" rx="6" fill="#c9dce8"/><rect x="21" y="14" width="18" height="9" rx="4.5" fill="#1d2b3a"/><circle cx="26" cy="18.5" r="2.2" fill="#5ff3ff" stroke="none"/><circle cx="34" cy="18.5" r="2.2" fill="#5ff3ff" stroke="none"/>${miniCob(55,22,18,25)}`,
 weather:()=>`<path d="M8 28a7 7 0 0 1 4-12 9 9 0 0 1 17-3 7 7 0 0 1 9 8 5 5 0 0 1-2 10H11a5 5 0 0 1-3-3z" fill="#fff"/><path d="M19 31l-4 9h5l-3 8 9-11h-5l3-6z" fill="#ffd34d" stroke-width="1.6"/><path d="M10 36l-2 5M31 36l-2 5M26 46l-2 5M12 47l-2 5" stroke="#4fb6f5" stroke-width="2.2" fill="none"/><path d="M46 62V12M40 62l6-10 6 10" stroke="#7d8a96" stroke-width="3" fill="none"/><path d="M38 12h16" stroke-width="2.2" fill="none"/><path d="M34 12a4 4 0 0 1 8 0zM50 12a4 4 0 0 1 8 0z" fill="#e5413a" stroke-width="1.6"/><path d="M34 32h22" stroke-width="2.4" fill="none"/><path d="M31 32l6-4.5v9z" fill="#e5413a" stroke-width="1.6"/><path d="M52 27l5 5-5 5h5l4-5-4-5z" fill="#ffd34d" stroke-width="1.6"/><circle cx="46" cy="32" r="2" fill="#9aa7b3" stroke-width="1.4"/>`,
 megafarm:()=>`<defs>${rad('cc-pi-mega-g',[[0,'#fffbb0'],[.6,'#ffe066'],[1,'#ff9f2e']])}</defs><path d="M4 22h56v36q0 4-4 4H8q-4 0-4-4z" fill="#8a5a33"/><path d="M4 34q14-4 28 0t28 0M4 46q14 4 28 0t28 0" stroke="#6f4526" stroke-width="2" fill="none"/><path d="M4 22q28-6 56 0v4H4z" fill="#6cc04a"/><path d="M22 14v8h10v-8l-5-4z" fill="#e5413a" stroke-width="1.8"/><path d="M40 22V13" stroke-width="2.4"/><rect x="38.6" y="22" width="2.8" height="26" fill="#9aa7b3" stroke-width="1.4"/><ellipse cx="20" cy="38" rx="13" ry="7" fill="url(#cc-pi-mega-g)"/><ellipse cx="44" cy="51" rx="13" ry="6.5" fill="url(#cc-pi-mega-g)"/>${[13,18,23,28].map(x=>`<path d="M${x} 43v-6" stroke="#3f8a2a" stroke-width="1.6"/><circle cx="${x+1}" cy="38" r="1.2" fill="#e8a811" stroke="none"/>`).join('')}${[37,42,47,52].map(x=>`<path d="M${x} 56v-6" stroke="#3f8a2a" stroke-width="1.6"/><circle cx="${x+1}" cy="51" r="1.2" fill="#e8a811" stroke="none"/>`).join('')}<circle cx="10" cy="54" r="1.4" fill="#6f4526" stroke="none"/><circle cx="54" cy="32" r="1.6" fill="#6f4526" stroke="none"/>`,
 orbital:()=>`${disc('cc-pi-orb-d','#2e4c8f','#101a3c',41)}<path d="M5 35a27 10 0 0 1 54 0" stroke-width="8" fill="none"/><path d="M5 35a27 10 0 0 1 54 0" stroke="#c7d3dd" stroke-width="5" fill="none"/><path d="M32 22V9" stroke-width="2.2"/><rect x="20" y="6" width="10" height="7" rx="1" fill="#4fa3ff" stroke-width="1.6"/><rect x="34" y="6" width="10" height="7" rx="1" fill="#4fa3ff" stroke-width="1.6"/><circle cx="32" cy="35" r="10" fill="#e3eaf0"/><path d="M26 31a7 7 0 0 1 6-3" stroke="#fff" stroke-width="2" fill="none"/><circle cx="32" cy="35" r="3" fill="#5ff3ff" stroke-width="1.4"/><path d="M5 35a27 10 0 0 0 54 0" stroke-width="8" fill="none"/><path d="M5 35a27 10 0 0 0 54 0" stroke="#c7d3dd" stroke-width="5" fill="none"/><path d="M8 38a25 8.5 0 0 0 48 0" stroke="#6cc04a" stroke-width="2" fill="none"/>${[[14,41],[24,44],[36,44.5],[48,42]].map(([x,y])=>`<ellipse cx="${x}" cy="${y}" rx="1.6" ry="2.6" fill="#ffd23f" stroke-width="1"/>`).join('')}`,
 lunar:()=>`<defs><clipPath id="cc-pi-lunar-c"><circle cx="32" cy="32" r="30"/></clipPath>${rad('cc-pi-lunar-m',[[0,'#e6e8f2'],[1,'#9a9fb6']],.4,.2,.8)}</defs>${disc('cc-pi-lunar-d','#24346e','#0c1230',57)}<circle cx="47" cy="15" r="6" fill="#4fb6f5" stroke-width="1.6"/><path d="M44 13q3-2 5 1t3 1" stroke="#6cc04a" stroke-width="2" fill="none"/><g clip-path="url(#cc-pi-lunar-c)"><path d="M0 44Q32 34 64 44V64H0z" fill="url(#cc-pi-lunar-m)"/><ellipse cx="14" cy="52" rx="5" ry="2" fill="#8a8fa6" stroke-width="1.2"/><ellipse cx="48" cy="56" rx="7" ry="2.5" fill="#8a8fa6" stroke-width="1.2"/></g><path d="M7 45a14 14 0 0 1 28 0z" fill="#bff3ff" fill-opacity=".35"/><path d="M15 45v-8" stroke="#3f8a2a" stroke-width="1.8" fill="none"/><path d="M15 41.0l-3-2M15 43.0l3-2" stroke="#6cc04a" stroke-width="1.4" fill="none"/><ellipse cx="15" cy="35.5" rx="1.6" ry="2.6" fill="#ffd23f" stroke-width="1"/><path d="M21 45v-11" stroke="#3f8a2a" stroke-width="1.8" fill="none"/><path d="M21 39.5l-3-2M21 41.5l3-2" stroke="#6cc04a" stroke-width="1.4" fill="none"/><ellipse cx="21" cy="32.5" rx="1.6" ry="2.6" fill="#ffd23f" stroke-width="1"/><path d="M27 45v-8" stroke="#3f8a2a" stroke-width="1.8" fill="none"/><path d="M27 41.0l-3-2M27 43.0l3-2" stroke="#6cc04a" stroke-width="1.4" fill="none"/><ellipse cx="27" cy="35.5" rx="1.6" ry="2.6" fill="#ffd23f" stroke-width="1"/><path d="M7 45a14 14 0 0 1 28 0z" fill="none"/><path d="M11 39a10 10 0 0 1 6-6" stroke="#fff" stroke-width="1.8" fill="none"/><path d="M39 44a9 9 0 0 1 18 0z" fill="#bff3ff" fill-opacity=".35"/><path d="M45 44v-6" stroke="#3f8a2a" stroke-width="1.8" fill="none"/><path d="M45 41.0l-3-2M45 43.0l3-2" stroke="#6cc04a" stroke-width="1.4" fill="none"/><ellipse cx="45" cy="36.5" rx="1.6" ry="2.6" fill="#ffd23f" stroke-width="1"/><path d="M51 44v-6" stroke="#3f8a2a" stroke-width="1.8" fill="none"/><path d="M51 41.0l-3-2M51 43.0l3-2" stroke="#6cc04a" stroke-width="1.4" fill="none"/><ellipse cx="51" cy="36.5" rx="1.6" ry="2.6" fill="#ffd23f" stroke-width="1"/><path d="M39 44a9 9 0 0 1 18 0z" fill="none"/><path d="M35 44.5h4" stroke="#9aa7b3" stroke-width="2.4"/>`,
 cloner:()=>`<defs>${rad('cc-pi-clon-g',[[0,'#bff7ff',.9],[1,'#5ff3ff',0]])}</defs>${disc('cc-pi-clon-d','#4a2690','#170a38',73)}<rect x="17" y="10" width="30" height="44" rx="15" fill="url(#cc-pi-clon-g)" stroke="none"/>${miniCob(25.5,32,26,0,'#ffd23f','#d0900f',false)}${miniCob(38.5,32,26,0,'#ffd23f','#d0900f',false)}<rect x="17" y="10" width="30" height="44" rx="15" fill="#bff7ff" fill-opacity=".25"/><path d="M22 18q2-4 6-5" stroke="#fff" stroke-width="2" fill="none"/><rect x="13" y="51" width="38" height="8" rx="3" fill="#8b97a6"/><rect x="18" y="6" width="28" height="6" rx="3" fill="#8b97a6"/><circle cx="22" cy="55" r="1.4" fill="#5ff3ff" stroke="none"/><circle cx="28" cy="55" r="1.4" fill="#ff5ad8" stroke="none"/>`,
 time:()=>`${disc('cc-pi-time-d','#5a2a7a','#1c0a34',91,'#ffe9a0')}<circle cx="32" cy="32" r="24" fill="none" stroke="#c9a24a" stroke-width="5" stroke-dasharray="4.2 3.6"/><circle cx="32" cy="32" r="21" fill="#3a1f5c" stroke="#c9a24a" stroke-width="2"/><path d="M22 13h20c0 10-8 14-8 19s8 9 8 19H22c0-10 8-14 8-19s-8-9-8-19z" fill="#e8f6ff" fill-opacity=".55"/><path d="M25 17h14c-1 5-5 8-7 10-2-2-6-5-7-10z" fill="#ffd23f" stroke="none"/><path d="M32 27v17" stroke="#ffd23f" stroke-width="1.6" stroke-dasharray="1.6 1.6"/><path d="M23.5 50c1-5 4-8 8.5-9 4.5 1 7.5 4 8.5 9z" fill="#ffd23f" stroke="none"/><circle cx="28" cy="47" r="1" fill="#d0900f" stroke="none"/><circle cx="33" cy="45" r="1" fill="#d0900f" stroke="none"/><circle cx="36" cy="48" r="1" fill="#d0900f" stroke="none"/><path d="M22 13h20c0 10-8 14-8 19s8 9 8 19H22c0-10 8-14 8-19s-8-9-8-19z" fill="none"/><rect x="17" y="8" width="30" height="5" rx="2" fill="#b07a3a"/><rect x="17" y="51" width="30" height="5" rx="2" fill="#b07a3a"/><path d="M19 13v38M45 13v38" stroke-width="2.6"/><path d="M25 16q0 6 3 9" stroke="#fff" stroke-width="1.6" fill="none"/>`,
 dimension:()=>`<defs>${rad('cc-pi-dim-p',[[0,'#0b0220'],[.45,'#3a0f7a'],[.7,'#39e0ff'],[.85,'#ff4fd8'],[1,'#ff4fd8',0]])}</defs>${disc('cc-pi-dim-d','#3a1066','#0e0424',29)}<circle cx="30" cy="33" r="24" fill="url(#cc-pi-dim-p)" stroke="none"/><path d="M30 18a15 15 0 0 1 15 15M30 48a15 15 0 0 1-15-15M38 26a9 9 0 0 1 1 11M22 40a9 9 0 0 1-1-11" stroke="#d8f8ff" stroke-width="1.8" fill="none" opacity=".75"/>${miniCob(47,16,16,40)}${miniCob(14,48,14,-130)}${miniCob(48,46,11,125)}<circle cx="30" cy="33" r="4" fill="#fff" stroke="none" opacity=".8"/>`,
 singularity:()=>`<defs>${rad('cc-pi-sing-g',[[0,'#ffb347',.9],[.5,'#ff6a2b',.5],[1,'#ff3d6e',0]])}${lin('cc-pi-sing-a',[[0,'#ff7a2b'],[.5,'#fff1a0'],[1,'#ff7a2b']],true)}</defs>${disc('cc-pi-sing-d','#2a0c3c','#05020c',113)}<circle cx="32" cy="34" r="20" fill="url(#cc-pi-sing-g)" stroke="none"/><path d="M6 34a26 8 0 0 1 52 0" stroke="url(#cc-pi-sing-a)" stroke-width="4.6" fill="none"/><circle cx="32" cy="34" r="10.5" fill="#000" stroke="#ffdd8a" stroke-width="2"/><path d="M6 34a26 8 0 0 0 52 0" stroke="url(#cc-pi-sing-a)" stroke-width="4.6" fill="none"/>${[[12,18,30],[50,20,-40],[54,48,60],[16,50,150],[40,12,10],[26,56,100]].map(([x,y,a],i)=>`<path transform="translate(${x} ${y}) rotate(${a}) scale(${n(1-i*.08)})" d="M0-3c2 0 3 1 3 2.6C3 1.4 1.6 3.4 0 3.4S-3 1.4-3-.4C-3-2-2-3 0-3z" fill="#ffd23f" stroke-width="1"/>`).join('')}<path d="M12 18q6 8 16 10M50 20q-6 6-10 12M54 48q-8-4-14-8" stroke="#ffd23f" stroke-width="1" stroke-dasharray="1.5 2" fill="none" opacity=".7"/>`,
 corniverse:()=>`<defs>${rad('cc-pi-cv-g',[[0,'#fffbe0'],[.3,'#ffd86b'],[.65,'#e04fd0'],[1,'#3b1a9a']],.5,.55,.6)}${rad('cc-pi-cv-n',[[0,'#ff5fd2',.6],[1,'#ff5fd2',0]])}</defs>${disc('cc-pi-cv-d','#2c0f5a','#0a0320',131,'#ffe9ff')}<circle cx="16" cy="18" r="14" fill="url(#cc-pi-cv-n)" stroke="none"/><path d="M32 58c-9-2-17-10-20-24 6 8 12 13 20 14 8-1 14-6 20-14-3 14-11 22-20 24z" fill="#3fd0c9" fill-opacity=".85"/><path d="M32 5c9 0 12 11 12 22s-4 23-12 23-12-12-12-23S23 5 32 5z" fill="url(#cc-pi-cv-g)"/><path d="M32 27c3-2 6 1 5 4-1 4-7 5-10 2-4-4-1-11 5-12 7-1 12 5 11 12M32 27c-3 2-6-1-5-4" stroke="#fff6c8" stroke-width="1.6" fill="none"/>${[10,15,20,25,30,35,40,45].map((y,j)=>[-1.5,-.5,.5,1.5].map(c=>`<circle cx="${n(32+c*(j<1||j>6?3:4.2))}" cy="${y}" r="${j%2?.7:.9}" fill="#fff" stroke="none" opacity=".85"/>`).join('')).join('')}<path d="M32 5c9 0 12 11 12 22s-4 23-12 23-12-12-12-23S23 5 32 5z" fill="none"/>`,
};
export function producerIcon(id:ProducerId):string{
 return svg('0 0 64 64',`<g stroke="${O}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">${ICONS[id]()}</g>`);
}

/* ---------- Farm panel backdrops ---------- */
const cloud=(x:number,y:number,s:number,fill='#fff',op=1)=>`<path transform="translate(${x} ${y}) scale(${s})" d="M-24 8a9 9 0 0 1 7-13 13 13 0 0 1 24-4 10 10 0 0 1 17 6 8 8 0 0 1 2 11z" fill="${fill}" opacity="${op}"/>`;
const ground=(id:string,c0:string,c1:string,line:string)=>`<defs>${lin(id,[[0,c0],[1,c1]])}</defs><path d="M0 196Q200 186 400 196V300H0z" fill="url(#${id})"/><path d="M0 222Q200 212 400 222M0 252Q200 242 400 252M0 284Q200 274 400 284" stroke="${line}" stroke-width="3" fill="none" opacity=".18"/>`;
export function sceneBackdrop(stage:0|1|2|3):string{
 let b='';
 if(stage===0){
  b=`<defs>${lin('cc-bg0-s',[[0,'#6ccaff'],[1,'#dff6ff']])}</defs><rect width="400" height="300" fill="url(#cc-bg0-s)"/><circle cx="330" cy="58" r="46" fill="#fff6b0" opacity=".45"/><circle cx="330" cy="58" r="28" fill="#ffe55c" stroke="#f2b72a" stroke-width="3"/>${cloud(90,50,1.2)}${cloud(220,34,.9,'#fff',.9)}${cloud(380,110,.8,'#fff',.85)}`+
  `<path d="M0 182Q60 140 130 170T260 160T400 166V210H0z" fill="#a9dc7a"/><path d="M0 196Q90 168 180 192T400 186V215H0z" fill="#86c45a"/>`+
  `<circle cx="300" cy="176" r="12" fill="#4f9a2e"/><circle cx="314" cy="180" r="9" fill="#5aa835"/><path d="M302 186v8" stroke="${O}" stroke-width="3"/>`+
  `<g stroke="${O}" stroke-width="2.4" stroke-linejoin="round"><rect x="92" y="150" width="14" height="42" rx="7" fill="#d9dde3"/><path d="M48 192v-26l20-16 20 16v26z" fill="#d8443a"/><path d="M44 168l24-20 24 20" fill="none" stroke="#fff" stroke-width="3"/><path d="M60 192v-14h16v14zM60 178l16 14M76 178l-16 14" fill="#a8302a" stroke="#fff" stroke-width="1.8"/><path d="M60 192v-14h16v14z" fill="none"/></g><path d="M120 194h90M124 186v10M146 186v10M168 186v10M190 186v10M120 189h90" stroke="#f5f0e0" stroke-width="2.4"/>`;
  b+=ground('cc-bg0-g','#9fd05a','#6fa83c','#3d6b1e');
 }else if(stage===1){
  b=`<defs>${lin('cc-bg1-s',[[0,'#3b2366'],[.55,'#d8607a'],[1,'#ffb36b']])}</defs><rect width="400" height="300" fill="url(#cc-bg1-s)"/>${dots(18,5,0,400,0,80,1,'#ffe0f0')}<circle cx="250" cy="190" r="56" fill="#ffd27a" opacity=".85"/><circle cx="250" cy="190" r="80" fill="#ffd27a" opacity=".2"/>`+
  `${cloud(110,120,1.4,'#7a3a6e',.5)}${cloud(330,90,1,'#8a4470',.45)}`+
  `<path d="M0 196V160h20v-20h10v20h18v-30l26 14v-14l26 14v-14l26 14v36h14V120h10v40h22v-24h30v24h12v-50h10v50h30l20-14v14l20-14v14l20-14v14h18v-32h10v32h24v-10H400V196z" fill="#3a2246"/>`+
  `<g fill="#ffcf6b">${[[30,170],[86,168],[110,174],[196,176],[214,168],[290,178],[318,178],[372,186]].map(([x,y])=>`<rect x="${x}" y="${y}" width="5" height="4"/>`).join('')}</g>${cloud(160,104,.8,'#c69ab8',.5)}${cloud(266,80,.7,'#c69ab8',.45)}${cloud(25,128,.6,'#c69ab8',.45)}`;
  b+=ground('cc-bg1-g','#8a8a3e','#5a5a2a','#2b2a14');
 }else if(stage===2){
  b=`<defs>${lin('cc-bg2-s',[[0,'#060e2a'],[1,'#25407a']])}${rad('cc-bg2-m',[[0,'#fffbe6',.6],[1,'#fffbe6',0]])}</defs><rect width="400" height="300" fill="url(#cc-bg2-s)"/>${dots(70,9,0,400,0,170,1.1,'#fff')}<circle cx="320" cy="62" r="60" fill="url(#cc-bg2-m)"/><circle cx="320" cy="62" r="26" fill="#fff4cc" stroke="#d8cfa0" stroke-width="2"/><circle cx="311" cy="55" r="5" fill="#e6dcb0"/><circle cx="328" cy="72" r="7" fill="#e6dcb0"/><circle cx="330" cy="50" r="3" fill="#e6dcb0"/>`+
  `<path d="M0 196v-26a26 26 0 0 1 52 0v-20h8v-30h4v30h8v46h20v-36l18-10 18 10v36h16a30 30 0 0 1 60 0h16V130h6v-12h6v12h6v66h22v-28h40v-14h14v42h18a22 22 0 0 1 44 0h10z" fill="#0f2147"/>`+
  `<g fill="#5ff3ff">${[[20,180],[62,124],[98,176],[118,170],[166,180],[200,174],[240,140],[240,160],[280,178],[296,170],[340,186]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="2"/>`).join('')}</g><circle cx="62" cy="120" r="3" fill="#ff5a6e"/><circle cx="240" cy="116" r="3" fill="#ff5a6e"/>`;
  b+=ground('cc-bg2-g','#21474a','#11292e','#5ff3ff');
 }else{
  b=`<defs>${lin('cc-bg3-s',[[0,'#0b0320'],[1,'#47156e']])}${rad('cc-bg3-a',[[0,'#ff5fd2',.55],[1,'#ff5fd2',0]])}${rad('cc-bg3-b',[[0,'#3fe0ff',.4],[1,'#3fe0ff',0]])}${rad('cc-bg3-p',[[0,'#ffd27a'],[.7,'#f2733a'],[1,'#a83a5a']],.35,.3,.8)}</defs><rect width="400" height="300" fill="url(#cc-bg3-s)"/><ellipse cx="250" cy="90" rx="160" ry="80" fill="url(#cc-bg3-a)"/><ellipse cx="90" cy="150" rx="140" ry="70" fill="url(#cc-bg3-b)"/>${dots(80,13,0,400,0,180,1.1,'#fff')}`+
  `<g stroke="${O}" stroke-width="2.4"><path d="M56 96a42 10 -18 0 1 80-26" transform="rotate(0)" fill="none" stroke="#ffe3a8" stroke-width="4"/><circle cx="96" cy="90" r="26" fill="url(#cc-bg3-p)"/><path d="M136 70a42 10 -18 0 1-80 26" fill="none" stroke="#ffe3a8" stroke-width="4"/><path d="M78 76q10-8 22-6" stroke="#fff" stroke-width="3" fill="none" opacity=".5" stroke-linecap="round"/><circle cx="318" cy="120" r="11" fill="#3fd0c9"/><circle cx="356" cy="70" r="6" fill="#d6b0ff"/></g>`+
  `<path d="M0 196v-10l20-24 10 18 16-36 14 38 20-12 14 26h40l12-16 10 16h60l14-30 10 20 18-40 16 36 12-12 14 22h30l16-20 14 22 10-6v18z" fill="#251040"/><g fill="#5ff3ff" opacity=".8"><path d="M46 178l5 10-5 8-5-8z"/><path d="M262 180l4 8-4 7-4-7z"/><path d="M352 182l4 8-4 6-4-6z"/></g>`;
  b+=ground('cc-bg3-g','#4a2a72','#24123f','#ff8ae0');
 }
 return svg('0 0 400 300',b,' preserveAspectRatio="xMidYMax slice"');
}

/* ---------- Golden cob ---------- */
export function goldenCobSvg():string{
 let rays='';for(let i=0;i<12;i++)rays+=`<path d="M40 48L36 4h8z" transform="rotate(${i*30} 40 48)"/>`;
 return svg('0 0 80 100',`<defs>${rad('cc-gc-g',[[0,'#fff6b0',.95],[.55,'#ffd84a',.45],[1,'#ffd84a',0]])}${lin('cc-gc-h',[[0,'#ffe27a'],[1,'#c99a1a']],true)}</defs><circle cx="40" cy="48" r="40" fill="url(#cc-gc-g)"/><g fill="#fff3a0" opacity=".5">${rays}</g><circle cx="40" cy="48" r="34" fill="none" stroke="#fff6c0" stroke-width="2" stroke-dasharray="3 5" opacity=".9"/>`+
 buildCob({id:'cc-gc',cx:40,top:12,bot:82,w:17,rows:9,cols:6,k0:'#fff6b8',k1:'#e3a10c',gap:'#94600a',sw:2.6,gloss:.7})+
 `<g stroke="${O}" stroke-width="2.4" stroke-linejoin="round" fill="url(#cc-gc-h)"><path d="M41 94C28 92 20 80 19 56C26 68 32 76 42 82Z"/><path d="M39 94C52 92 60 80 61 56C54 68 48 76 38 82Z"/></g>${spark(62,20,8,'#fff')}${spark(16,30,5,'#fffbe0')}${spark(64,70,4,'#fff')}`);
}

/* ---------- Pest ---------- */
export function pestSvg():string{
 return svg('0 0 64 64',`<defs>${rad('cc-pest-b',[[0,'#c49bff'],[.6,'#8a4fd0'],[1,'#56259a']],.4,.35,.7)}</defs><ellipse cx="32" cy="60" rx="20" ry="3" fill="#000" opacity=".18"/><g stroke="${O}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><path d="M20 48l-5 9M27 51l-2 9M37 51l2 9M44 48l5 9" fill="none" stroke-width="2.6"/><ellipse cx="13.5" cy="58" rx="3" ry="1.8" fill="#8fe04a"/><ellipse cx="24" cy="60" rx="3" ry="1.8" fill="#8fe04a"/><ellipse cx="40" cy="60" rx="3" ry="1.8" fill="#8fe04a"/><ellipse cx="50.5" cy="58" rx="3" ry="1.8" fill="#8fe04a"/><path d="M29 15c-2-7-9-10-14-8 3 4 7 8 14 8zM34 14c1-7 6-11 12-10-1 5-5 9-12 10z" fill="#7bd052"/><path d="M32 14c13 0 21 10 21 22s-8 17-21 17-21-5-21-17 8-22 21-22z" fill="url(#cc-pest-b)"/><circle cx="17" cy="40" r="2.6" fill="#8fe04a" stroke="none"/><circle cx="47" cy="42" r="2" fill="#8fe04a" stroke="none"/><circle cx="44" cy="17.5" r="1.6" fill="#8fe04a" stroke="none"/><path d="M48 38q7 1 8-6" fill="none" stroke-width="2.6"/><path d="M56 23c3 0 5 2 5 4.5 0 3.5-2 6.5-5 6.5s-5-3-5-6.5c0-2.5 2-4.5 5-4.5z" fill="#ffd23f"/><ellipse cx="54.6" cy="26" rx="1.2" ry="1.6" fill="#fff" stroke="none" opacity=".8"/><circle cx="24" cy="28" r="7.5" fill="#fff"/><circle cx="40" cy="26" r="9" fill="#fff"/><circle cx="26.5" cy="30.5" r="3.2" fill="${O}" stroke="none"/><circle cx="37" cy="29.5" r="4" fill="${O}" stroke="none"/><circle cx="27.4" cy="29.4" r="1" fill="#fff" stroke="none"/><circle cx="38.2" cy="28.2" r="1.2" fill="#fff" stroke="none"/><path d="M22 41q10 9 20 0z" fill="#4a1b3a"/><path d="M26 42.6l1.6 3 1.6-2.6M35 42.6l1.4 2.8 1.6-3" fill="#fff" stroke-width="1"/></g>`);
}

/* ---------- Scarecrow ---------- */
export function scarecrowSvg(hat:'straw'|'top'|'wizard'):string{
 const hats={
  straw:`<ellipse cx="40" cy="24" rx="23" ry="5.5" fill="#f2cf5b"/><path d="M29 24c0-10 4-14 11-14s11 4 11 14z" fill="#ffda6a"/><path d="M29.5 20h21" stroke="#d24a3a" stroke-width="3.4"/><path d="M20 25l-4 3M60 25l4 3" stroke="#d6aa38" stroke-width="1.6"/>`,
  top:`<ellipse cx="40" cy="24" rx="18" ry="4.5" fill="#2b2b38"/><path d="M30 24V5h20v19z" fill="#34344a"/><path d="M30 18h20" stroke="#c0392b" stroke-width="4"/><path d="M33 8v8" stroke="#55557a" stroke-width="2"/><rect x="42" y="7" width="5" height="5" fill="#6b4a8a" stroke-width="1.2"/>`,
  wizard:`<path d="M26 24C31 15 38 6 54 1 47 9 50 17 54 24z" fill="#6b45c2"/><ellipse cx="40" cy="24" rx="21" ry="5" fill="#5b3aa8"/>${spark(39,16,3.2,'#ffe14d')}${spark(47,9,2.4,'#ffe14d')}<circle cx="34" cy="21" r="1" fill="#ffe14d" stroke="none"/>`,
 } as const;
 return svg('0 0 80 120',`<g stroke="${O}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><rect x="37" y="40" width="6" height="80" fill="#9a6a3a"/><rect x="6" y="51" width="68" height="6" rx="2" fill="#9a6a3a"/><path d="M11 48l-6-3M10 54H3M11 60l-6 3M69 48l6-3M70 54h7M69 60l6 3M30 92l-3 7M36 93l-1 8M44 93l1 8M50 92l3 7" stroke="#e8b83a" stroke-width="2.4" fill="none"/><path d="M27 46H11v14h16v33h26V60h16V46H53q-3 4-13 4t-13-4z" fill="#d9473b"/><path d="M19 46v14M61 46v14M33 52v41M47 52v41M27 72h26" stroke="#a8302a" stroke-width="2" fill="none" opacity=".8"/><path d="M27 84h26" stroke="#8a5a2a" stroke-width="3"/><rect x="45" y="63" width="7" height="7" fill="#f2cf5b" stroke-width="1.4" stroke-dasharray="1.5 1.5"/><path d="M33 47l-3 4M47 47l3 4M40 48v5" stroke="#e8b83a" stroke-width="2" fill="none"/><circle cx="40" cy="34" r="13" fill="#e3c48a"/><path d="M30 43q10 6 20 0" stroke="#8a5a2a" stroke-width="2.4" fill="none"/><circle cx="35" cy="32" r="2.6" fill="${O}" stroke="none"/><circle cx="45" cy="32" r="2.6" fill="${O}" stroke="none"/><circle cx="35.8" cy="31.2" r=".8" fill="#fff" stroke="none"/><circle cx="45.8" cy="31.2" r=".8" fill="#fff" stroke="none"/><ellipse cx="31" cy="37" rx="2.4" ry="1.4" fill="#ff8f7a" stroke="none"/><ellipse cx="49" cy="37" rx="2.4" ry="1.4" fill="#ff8f7a" stroke="none"/><path d="M34 37.5q6 5 12 0" fill="none" stroke-width="1.8"/><path d="M36 38v2M40 39.6v2M44 38v2" stroke-width="1.2" fill="none"/>${hats[hat]}</g>`);
}

/* ---------- Plot plants ---------- */
interface Variety{k0:string;k1:string;gap:string;leaf:string;stem:string}
const VAR:Record<VarietyId,Variety>={
 sweet:{k0:'#ffe45c',k1:'#ee9f1a',gap:'#b86f10',leaf:'#6cc04a',stem:'#3f8a2a'},
 popcorn:{k0:'#fffbea',k1:'#e3cc98',gap:'#cdb27a',leaf:'#78c450',stem:'#3f8a2a'},
 bluemoon:{k0:'#93a3ff',k1:'#4a2cb8',gap:'#21125e',leaf:'#5cc08a',stem:'#2d8768'},
 prism:{k0:'#fff',k1:'#999',gap:'#3b2a4e',leaf:'#7bc75a',stem:'#3f8a2a'},
 candy:{k0:'#ff4f6a',k1:'#c8143a',gap:'#7a0a20',leaf:'#6cc04a',stem:'#3f8a2a'},
 ghost:{k0:'#f6f9ff',k1:'#b9c8e6',gap:'#8a9cc4',leaf:'#cfe0f2',stem:'#9fb4d0'},
 ember:{k0:'#ffc24d',k1:'#e8401c',gap:'#7a1a08',leaf:'#a3c23a',stem:'#6b7a20'},
 starcob:{k0:'#4a58a0',k1:'#161b44',gap:'#090b20',leaf:'#3d9a84',stem:'#246657'},
};
export function plantSvg(variety:VarietyId,stage:0|1|2|3):string{
 const v=VAR[variety],id=`cc-pl-${variety}`,L=`stroke="${O}" stroke-width="1.6" stroke-linejoin="round"`;
 const leaf=(x:number,y:number,dir:1|-1,len:number)=>`<path d="M${x} ${y}c${dir*len*.4} ${-len*.45} ${dir*len*.85} ${-len*.3} ${dir*len} ${len*.15}c${-dir*len*.4} ${-len*.05} ${-dir*len*.7} ${len*.05} ${-dir*len} ${-len*.15}z" fill="${v.leaf}" ${L}/>`;
 const mound=`<path d="M16 58q16-9 32 0z" fill="#7a4a26" ${L}/>`;
 let b='';
 if(stage===0){
  b=`${mound}<ellipse cx="32" cy="53" rx="4" ry="5" fill="${variety==='prism'?'#8f7bff':v.k0}" ${L} transform="rotate(-20 32 53)"/><ellipse cx="30.6" cy="51" rx="1.2" ry="1.8" fill="#fff" opacity=".7" transform="rotate(-20 30.6 51)"/>${spark(42,46,3,'#fff6c0',.9)}`;
 }else if(stage===1){
  b=`${mound}<path d="M32 56V44" stroke="${v.stem}" stroke-width="2.6" stroke-linecap="round"/>${leaf(32,46,-1,12)}${leaf(32,44,1,13)}`;
 }else if(stage===2){
  b=`${mound}<path d="M32 57V26" stroke="${v.stem}" stroke-width="3.2" stroke-linecap="round"/>${leaf(32,50,-1,16)}${leaf(32,43,1,17)}${leaf(32,36,-1,15)}${leaf(32,30,1,12)}<path d="M32 26q-5-4-7-1 3 3 7 1z" fill="${v.leaf}" ${L}/>`;
 }else{
  const pick=variety==='prism'?(_i:number,_j:number,r:()=>number)=>GEMS[Math.floor(r()*GEMS.length)]??'#ffe14d'
   :variety==='candy'?(i:number,j:number)=>(i+j)%4<2?'#ff4f6a':'#fff6f6':undefined;
  let glow='',over='';
  if(variety==='ember')glow=`<defs>${rad(id+'-g',[[0,'#ffb347',.85],[1,'#ff4a1c',0]])}</defs><circle cx="44" cy="30" r="17" fill="url(#${id}-g)"/>`;
  if(variety==='ghost')glow=`<defs>${rad(id+'-g',[[0,'#eaf2ff',.8],[1,'#eaf2ff',0]])}</defs><circle cx="44" cy="30" r="16" fill="url(#${id}-g)"/>`;
  if(variety==='popcorn')over=`<path d="M53 12a3.5 3.5 0 0 1 5 3 3.5 3.5 0 0 1-1 6 3.5 3.5 0 0 1-6 1 3.5 3.5 0 0 1-4-5 3.5 3.5 0 0 1 6-5z" fill="#fffdf2" ${L}/><circle cx="53" cy="17" r="1.6" fill="#ffd23f"/>`;
  if(variety==='ember')over=`<circle cx="54" cy="16" r="1.4" fill="#ffd23f"/><circle cx="34" cy="14" r="1.1" fill="#ff7a2b"/><circle cx="57" cy="34" r="1" fill="#ffb347"/>`;
  if(variety==='starcob')over=spark(55,16,4,'#ffe98a')+spark(34,14,2.6,'#cfd8ff');
  if(variety==='prism'||variety==='ghost')over=spark(55,18,3.4,'#fff');
  const cob=buildCob({id,cx:44,top:16,bot:44,w:7.5,rows:8,cols:5,k0:v.k0,k1:v.k1,gap:v.gap,sw:1.8,pick,speck:variety==='starcob'?.3:undefined,gloss:variety==='ghost'?.8:.55,seed:variety.length*13});
  b=`${mound}<path d="M32 57V12" stroke="${v.stem}" stroke-width="3.6" stroke-linecap="round"/><path d="M32 13l-4-8M32 13l4-8M32 13V4M32 13l-6-4" stroke="#e2b23a" stroke-width="1.8" stroke-linecap="round" fill="none"/>${leaf(32,52,-1,20)}${leaf(32,45,1,14)}${leaf(32,38,-1,18)}${leaf(32,24,-1,13)}${glow}<g transform="rotate(16 44 30)"${variety==='ghost'?' opacity=".7"':''}>${cob}<path d="M44 52c-6-1-9-7-9-13 3 5 6 7 9 7 3 0 6-2 9-7 0 6-3 12-9 13z" fill="${v.leaf}" ${L}/></g><path d="M33 40q6-2 8 4" stroke="${v.stem}" stroke-width="2.4" fill="none"/>${over}`;
 }
 return svg('0 0 64 64',b);
}

/* ---------- Small icons ---------- */
export function kernelSvg():string{
 return svg('0 0 16 16',`<defs>${rad('cc-kern',[[0,'#fff3a0'],[.6,'#ffcf2e'],[1,'#e0920f']],.35,.3,.8)}</defs><path d="M8 1.2c3.6 0 5.8 2 5.8 5.2 0 4.2-2.7 8.2-5.8 8.2S2.2 10.6 2.2 6.4C2.2 3.2 4.4 1.2 8 1.2z" fill="url(#cc-kern)" stroke="${O}" stroke-width="1.2"/><path d="M8 9.6c1.3 0 1.9 1.5 1.5 2.9-.4 1-2.6 1-3 0-.4-1.4.2-2.9 1.5-2.9z" fill="#fff4c0" opacity=".75"/><ellipse cx="5.8" cy="4.6" rx="1.4" ry="1" fill="#fff" opacity=".85"/>`);
}
export function seedSvg():string{
 return svg('0 0 32 32',`<defs>${rad('cc-seed',[[0,'#fff6b8'],[.55,'#ffcf2e'],[1,'#c98a06']],.38,.4,.75)}</defs><path d="M15 3c6 6 10 12 10 17.5a10 10 0 0 1-20 0C5 15 9 9 15 3z" fill="url(#cc-seed)" stroke="${O}" stroke-width="2" stroke-linejoin="round"/><path d="M15 9q-3 7 0 19" stroke="#c98a06" stroke-width="1.6" fill="none" stroke-linecap="round"/><ellipse cx="10.5" cy="17" rx="1.8" ry="3.4" fill="#fff" opacity=".7" transform="rotate(18 10.5 17)"/>${spark(25,7,5,'#fffbe0')}`);
}
export function butterSvg():string{
 return svg('0 0 32 32',`<ellipse cx="16" cy="25" rx="14" ry="4.5" fill="#e3edf3" stroke="${O}" stroke-width="1.6"/><g stroke="${O}" stroke-width="1.8" stroke-linejoin="round"><path d="M4 14l10 5v8L4 22z" fill="#ffd84f"/><path d="M14 19l14-6v8l-14 6z" fill="#f2bc2e"/><path d="M4 14l14-6 10 5-14 6z" fill="#fff3a6"/><path d="M9 16.4q1 4 2 2.6.6-1 .4-1.2" fill="#fff3a6" stroke-width="1.2"/></g><path d="M9 13l7-3" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`);
}
