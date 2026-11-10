import type {Level,Platform,Station} from './levels';
import type {Run} from './model';
import {box,hash,lay,masonry,panel,seamless,sprite,stroke,visible,wall,type C,type Work} from './quarter-kit';
import {lampOnWater} from './set-canal';
import type {QuarterSet} from './quarter-sets';

/** Level 6 · the service culvert under the street. One brick vault, flooded
 * to the springing. What you stand on is what a culvert has: a brick bench
 * built up out of the water, a length of iron main between two elbows that
 * go down into it, or a grating hung from the vault on rods. Steam comes
 * from a joint on a main, fed by the pipe run on the wall behind it.
 * The far wall is the other side of the vault, curving over toward you: its
 * courses close up and darken as they rise to the crown. Branch culverts
 * open off it and carry the water away into the dark; the street is over
 * the crown, and comes down through its gratings as light and its drains
 * as water. */
/** The far side of the vault, laid bay by bay between its ribs: full
 * courses at the springing that close up and darken as the wall curves over
 * to the crown. No bay repeats another, and every course stops at a rib. */
const BANDS:readonly (readonly [number,number,string,readonly string[],string])[]=[
 [96,8,'#17131a',['#2b2328','#2e252a','#31282c','#29222a'],'#3a2f33'],
 [176,6,'#151118',['#262025','#282126','#2a2328'],'#30272c'],
 [236,4,'#120f15',['#201b20','#221c21','#231d22'],'#282126'],
 [1e4,3,'#0e0c11',['#19151a','#1a161b','#1b171c'],'#1d181d'],
];
/** One bay of the far wall, from the crown down past the waterline; `rise` is how far its top stands above the water. */
function vaultBay(c:C,w:number,h:number,rise:number,seed:number){
 box(c,BANDS[0][2],0,0,w,h);
 for(let y=h,r=0;y>0;r++){
  const above=rise-(h-y),band=BANDS.find(b=>above<b[0])??BANDS[3],course=band[1],top=Math.max(0,y-course);
  box(c,band[2],0,top,w,y-top);
  for(let x=-Math.floor(hash(r,seed,5)*16),i=0;x<w;i++){
   const len=12+Math.floor(hash(i,r,seed)*7),x0=Math.max(0,x),x1=Math.min(w,x+len);
   if(x1-x0>=2){const v=hash(i,r,seed+1);box(c,band[3][Math.floor(v*band[3].length)],x0+1,top+1,x1-x0-1,y-top-1);if(course>4)box(c,band[4],x0+1,top+1,x1-x0-2,1);if(v>.93&&course>4)box(c,band[2],x0+3,top+2,3,1);}
   x+=len;
  }
  y=top;
 }
}
const BRICK:Work={course:8,short:12,long:18,mortar:'#191417',stones:['#3a2d2e','#3e3031','#423334','#382b2c'],lip:'#4d3c3a',shade:'#2c2224',chip:'#564440'};
const NEWER:Work={course:8,short:12,long:18,mortar:'#1a1416',stones:['#3a2a29','#3e2d2b','#42302d'],lip:'#4c3834',shade:'#2e2220',chip:'#553f3a'};
const RING:Work={course:12,short:5,long:7,mortar:'#191417',stones:['#3a2d2e','#3e3031','#423334'],lip:'#4d3c3a',shade:'#2c2224',chip:'#4d3c3a'};
const RIBFACE:Work={course:8,short:10,long:16,mortar:'#1a1517',stones:['#33282b','#362a2d','#3a2d2f','#30262a'],lip:'#45373a',shade:'#281f22',chip:'#4d3c3a'};
const RIBSIDE:Work={course:8,short:3,long:6,mortar:'#0e0b0e',stones:['#1a1518','#1c171a','#1e181b'],lip:'#221b1e',shade:'#141114',chip:'#221b1e'};
const UPRIGHT:Work={course:6,short:12,long:18,mortar:'#151118',stones:['#262025','#282126','#2a2328','#241e23'],lip:'#30272c',shade:'#1d181c',chip:'#352b30'};
const HEADWALL:Work={course:14,short:24,long:52,mortar:'#151c24',stones:['#2b3540','#2e3843','#313b46','#29333e'],lip:'#3c4854',shade:'#212a34',chip:'#46525f'};
/** The ribs stand every 352 px; each bay of wall runs from one rib's face to the next. */
const RIB=352,RIB0=96;
const earth=()=>seamless('culvert/earth',96,64,rect=>{rect('#0c0d10',0,0,96,64);for(let i=0;i<26;i++){const v=hash(i,3,51),x=Math.floor(hash(i,1,51)*96),y=Math.floor(hash(i,2,51)*64);rect(v>.6?'#15161a':'#111216',x,y,3+Math.floor(v*7),2+Math.floor(v*3));if(v>.8)rect('#1b1c20',x,y,2+Math.floor(v*4),1);}for(let i=0;i<5;i++)rect('#090a0c',Math.floor(hash(i,4,51)*96),8+i*12,30+Math.floor(hash(i,5,51)*40),1);});
const setts=()=>masonry('culvert/setts',48,12,12,6,{mortar:'#0e1217',stones:['#232b33','#262e37','#29313a'],lip:'#343e48',chip:'#3a444e'});
const CROWN=300,STREET=368,RISE=118,MOUTH_TOP=150;
/** Level 6 opens in the lane at the culvert's mouth: the headwall level 5
 * ended on, then the outfall shaft its stair goes down, then the vault. */
const HEAD0=24,HEAD1=216,SHAFT1=528,SHAFT_TOP=300;
/** Where a branch culvert opens off the far wall: its centre, its width, and which way it bends out of sight. */
const MOUTHS:readonly (readonly [number,number,number])[]=[[860,150,0],[1735,170,1],[3190,150,-1],[3610,180,0],[4975,130,-1],[5385,170,0]];
/** Where a grating in the street lets the night down, with rungs up to it. */
const GRATINGS=[1080,1465,2004,2520,2960,3400,3890,4300,4700,5600];
const inMouth=(x:number,w:number)=>MOUTHS.some(([m,wide])=>x+w>m-wide/2-14&&x<m+wide/2+14);
/** A branch culvert seen from its mouth: section after section of the same
 * vault, each smaller and darker than the last, sliding aside where it bends;
 * the water lies along its floor until both are lost. */
const mouth=(w:number,bend:number)=>sprite(`culvert/mouth/${w}/${bend}`,w+24,MOUTH_TOP+30,c=>{
 const a=w/2,mx=12+a,base=MOUTH_TOP;
 for(let x=-a-10;x<a+10;x++){const k=(x+.5)/(a+10),top=base-Math.round((RISE+10)*Math.sqrt(Math.max(0,1-k*k)));box(c,'#3a2d2e',mx+x,top,1,base+30-top);box(c,'#57443f',mx+x,top,1,1);}
 for(let i=0;i<=30;i++){const g=Math.PI*i/30;stroke(c,'#191417',mx-Math.cos(g)*a,base-Math.sin(g)*RISE,mx-Math.cos(g)*(a+10),base-Math.sin(g)*(RISE+10));}
 for(let y=base+6;y<base+30;y+=8){box(c,'#191417',mx-a-10,y,10,1);box(c,'#191417',mx+a,y,10,1);}
 const walls=['#141116','#0f0d11','#0b090c','#070608','#040405'],rims=['','#221c20','#1a1619','#131012','#0d0b0d'],wet=['#0f1d1f','#0b1618','#081012','#050b0c'],size=[1,.78,.6,.45,.33];
 for(let j=0;j<5;j++){
  const s=size[j],half=a*s,at=mx+bend*(1-s)*a*1.1,foot=base-Math.round(34*(1-s));
  for(let x=Math.ceil(-half);x<half;x++){const k=(x+.5)/half,top=foot-Math.round(RISE*s*Math.sqrt(Math.max(0,1-k*k)));box(c,walls[j],at+x,top,1,foot-top+(j?0:30));if(j)box(c,rims[j],at+x,top,1,1);}
  if(j<4){const next=base-Math.round(34*(1-size[j+1]));box(c,wet[j],at-half,next,half*2,foot-next);for(let i=0;i<4-j;i++){const v=hash(i,j,w);box(c,j?'#14292a':'#1d3836',at-half+4+v*(half*2-16),next+1+Math.floor(hash(i,j,w+1)*Math.max(1,foot-next-2)),Math.round((10-j*2)*(.5+v)),1);}}
 }
 // Far down it a grating lets the night in, and the water under that shows it.
 const s=size[4],at=mx+bend*(1-s)*a*1.1,foot=base-Math.round(34*(1-s));
 box(c,'#31425d',at-1,foot-Math.round(RISE*s)+5,2,Math.round(RISE*s)-6);box(c,'#3f6660',at-4,foot-1,8,1);
 box(c,'#6d5a52',mx-5,base-RISE-13,10,14);box(c,'#8a746a',mx-5,base-RISE-13,10,1);box(c,'#191417',mx-5,base-RISE,10,1);
});
type Role='bench'|'main'|'grating'|'headwall'|'landing'|'walk'|'penstock';
const role=(p:Platform,l:Level):Role=>p.kind==='crumble'?'walk':p.h>28?'penstock':p.kind==='grate'?'grating':p.x<HEAD1&&!p.branch?'headwall':p.x+p.w<=SHAFT1&&!p.branch?'landing':p.w>=170&&l.water!-p.y<=48||p.id===l.mainCount-1?'bench':'main';
/** The soffit of the vault: one height along the tunnel, opening into the stair shaft at either end. */
const soffit=(l:Level,x:number)=>x<SHAFT1?SHAFT_TOP:x>l.platforms[l.mainCount-1].x-190?l.platforms[l.mainCount-1].y-170:l.water!-300;
/** A shaft is a built room. Its far wall is laid bay by bay between brick piers and lift by lift between the stone
 * bands its landings stand on: small brick at the head, heavier and damper toward the water. Every course stops at a
 * pier, a band or a corner; some bays hold a blind arch; and both corners show the side walls' returns in shadow. */
const LIFT_MID:Work={course:8,short:12,long:18,mortar:'#171317',stones:['#2c2427','#2f2629','#32292b','#2a2225'],lip:'#3a2f31',shade:'#221c1e',chip:'#3f3335'};
const LIFT_FOOT:Work={course:10,short:16,long:28,mortar:'#111013',stones:['#24201f','#272221','#2a2423','#211d1c'],lip:'#322b29',shade:'#1b1817',chip:'#372f2c'};
const RECESS:Work={course:8,short:12,long:18,mortar:'#0d0b0e',stones:['#1b171a','#1d181b','#1f1a1d'],lip:'#241e21',shade:'#151215',chip:'#282124'};
const RET=18,PW=16;
const recess=(w:number,h:number)=>sprite(`culvert/recess/${w}/${h}`,w,h,c=>{
 lay(c,w,h,RECESS,w*3+h);
 const r=w/2,rise=Math.min(22,Math.round(r*.45));
 for(let x=0;x<w;x++){const d=(x+.5-r)/r,head=Math.round(rise*(1-Math.sqrt(Math.max(0,1-d*d))));c.clearRect(x,0,1,head);box(c,'#3a2f31',x,head,1,5);box(c,'#4d3c3a',x,head,1,1);box(c,'#070608',x,head+5,1,3);if(x%6===3)box(c,'#171317',x,head,1,5);}
 box(c,'#070608',0,rise,3,h-rise);box(c,'#0b090c',3,rise+3,2,h-rise-3);box(c,'#3a2f31',w-1,rise,1,h-rise);
 box(c,'#4d4642',0,h-5,w,5);box(c,'#6b625c',0,h-5,w,1);box(c,'#1d181c',0,h-1,w,1);
});
function shaftRoom(c:C,key:string,x0:number,x1:number,top:number,bottom:number,bands:readonly number[],seed:number,from:number,to:number){
 const inner0=x0+RET,inner1=x1-RET,n=Math.max(1,Math.round((inner1-inner0)/132)),bay=(inner1-inner0-PW*(n-1))/n;
 const lines=[top,...[...new Set(bands)].filter(y=>y>top+24&&y<bottom-24).sort((a,b)=>a-b),bottom];
 for(let i=0;i<lines.length-1;i++){
  const a=lines[i]+(i?6:0),b=lines[i+1];if(b<=a||b<from||a>to)continue;
  const depth=(a-top)/(bottom-top),work=depth>.62?LIFT_FOOT:depth>.28?LIFT_MID:UPRIGHT;
  for(let j=0;j<n;j++){
   const bx=Math.round(inner0+j*(bay+PW)),bw=Math.round(inner0+j*(bay+PW)+bay)-bx;
   c.drawImage(panel(`${key}/bay/${i}/${j}`,bw,b-a,work,seed+i*17+j*5),bx,a);
   if(b-a>=92&&bw>=70&&(i+j+seed)%2===0)c.drawImage(recess(bw-36,Math.min(b-a-26,150)),bx+18,a+14);
   if(j<n-1){const px=bx+bw;c.drawImage(panel(`${key}/pier/${i}/${j}`,PW,b-a,RIBFACE,seed+i*3+j),px,a);box(c,'#57443f',px,a,1,b-a);box(c,'#0b090c',px+PW,a,2,b-a);box(c,'#0b090c66',px+PW+2,a,5,b-a);}
  }
  for(const side of [0,1])c.drawImage(panel(`${key}/ret/${side}/${i}`,RET,b-a,RIBSIDE,seed+side*7+i),side?inner1:x0,a);
  box(c,'#070608',inner0,a,2,b-a);box(c,'#3a2f31',inner0+2,a,1,b-a);box(c,'#070608',inner1-2,a,2,b-a);
 }
 for(const y of lines.slice(1,-1)){
  if(y+8<from||y>to)continue;
  // A stone band right round the shaft: the brick above and below stops against it, and it caps each pier's lift.
  box(c,'#1d181c',x0,y,x1-x0,6);box(c,'#4d4642',x0,y,x1-x0,4);box(c,'#6b625c',x0,y,x1-x0,1);box(c,'#0b090c',x0,y+6,x1-x0,2);
  for(let j=0;j<n-1;j++){const px=Math.round(inner0+j*(bay+PW)+bay);box(c,'#57514d',px-2,y-2,PW+4,9);box(c,'#77706b',px-2,y-2,PW+4,1);box(c,'#0b090c',px-2,y+7,PW+4,1);}
  for(let x=x0+RET+9;x<x1-RET;x+=37)box(c,'#3b3531',x,y+1,1,3);
 }
}
function pump(c:C,x:number,water:number,t:number){
 // A beam pump on a brick plinth: cylinder, flywheel, and a rocking beam that has stopped.
 c.drawImage(panel(`culvert/plinth/${x}`,150,60,BRICK,x),x-10,water-36);box(c,'#5a4744',x-12,water-40,154,5);
 box(c,'#151b20',x,water-110,44,70);box(c,'#2a343b',x+3,water-108,10,66);box(c,'#3d4a51',x+3,water-108,3,66);box(c,'#151b20',x-4,water-116,52,8);box(c,'#3d4a51',x-4,water-116,52,2);
 for(let y=-36;y<=36;y++){const out=Math.floor(Math.sqrt(36*36-y*y)),hole=Math.abs(y)<29?Math.floor(Math.sqrt(29*29-y*y)):0;box(c,'#1a2127',x+96-out,water-78+y,out*2,1);if(hole)box(c,'#201a1f',x+96-hole,water-78+y,hole*2,1);}
 for(let i=0;i<6;i++){const a=i*Math.PI/3;stroke(c,'#1a2127',x+96,water-78,x+96+Math.cos(a)*30,water-78+Math.sin(a)*30,2);}
 box(c,'#3d4a51',x+92,water-82,8,8);stroke(c,'#151b20',x+22,water-128,x+96,water-136,4);box(c,'#151b20',x+56,water-150,6,110);box(c,'#3d4a51',x+56,water-150,2,110);
}
function back(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number){
 const water=l.water!,left=cx-24,right=cx+vw+24,top=cy-24,crown=water-CROWN,shaft=l.platforms[l.mainCount-1].x-190;
 // The far side of the vault, bay by bay between the ribs: the courses close up and darken as it curves over to the crown.
 if(top<water+90&&right>SHAFT1)for(let k=Math.floor((Math.max(left,SHAFT1)-RIB0)/RIB)-1;k*RIB+RIB0<right;k++){
  const xa=Math.max(SHAFT1,k*RIB+RIB0),xb=Math.min(shaft,(k+1)*RIB+RIB0);if(xb<=xa)continue;
  c.drawImage(sprite(`culvert/bay/${l.id}/${k}`,xb-xa,CROWN+90,b=>vaultBay(b,xb-xa,CROWN+90,CROWN,k*31+7)),xa,crown);
 }
 if(left<SHAFT1)outfall(c,l,t,cx,cy,vw,vh);
 // The stair shaft at the far end stands upright in ordinary courses from the water to its own head.
 if(right>shaft){const x0=Math.floor(shaft/32)*32,end=l.platforms[l.mainCount-1].y-170;shaftRoom(c,`culvert/endshaft/${l.id}`,x0,l.width,end,water+90,[end+60,water-200,water-72],13,top,cy+vh+24);}
 // The flood has stained the bottom courses a brick at a time.
 for(let x=Math.floor(left/16)*16;x<right;x+=16){const v=hash(x>>4,7,31);box(c,'#070d0c80',x,water-10-Math.floor(v*4)*4,16,10+Math.floor(v*4)*4);}
 // Where the wall has been rebuilt the brick is newer and redder.
 for(let i=Math.floor(left/420)-1;i*420<right;i++){const v=hash(i,9,33),x=i*420+120+Math.floor(v*200),w=64+Math.floor(v*4)*16;if(x+w<left||x>right||x<SHAFT1||x+w>shaft||inMouth(x,w))continue;
  // A rebuilt patch is toothed into the old work: its courses step in at the top and bottom where whole bricks were cut out.
  c.drawImage(panel(`culvert/patch/${i}`,w,48,NEWER,i),x,water-88);c.drawImage(panel(`culvert/patch/${i}/t`,w-48,8,NEWER,i+1),x+16,water-96);c.drawImage(panel(`culvert/patch/${i}/b`,w-24,16,NEWER,i+2),x+8,water-40);}
 // The ground over the crown: the vault's own ring of brick on edge, the fill, and the street's setts on top of that.
 if(top<crown){
  const street=water-STREET;
  for(let x=Math.floor(left/32)*32;x<right;x+=32){
   if(x>=shaft){
    // The stair shaft at the far end stands upright in ordinary courses to its own head, above the street.
    const head=soffit(l,x);
    if(head>top){box(c,'#0b0d11',x,top,32,head-top);box(c,'#3b3034',x,head-4,32,4);box(c,'#120e11',x,head,32,3);}
    continue;
   }
   if(x<SHAFT1)continue;
   if(top<street-12){box(c,'#111928',x,top,32,street-12-top);box(c,'#1a222e',x,street-48,32,36);box(c,'#263243',x,street-48,32,1);box(c,'#111822',x,street-14,32,2);}
   wall(c,'culvert/setts',setts,x,street-12,32,12);box(c,'#3d4852',x,street-12,32,1);wall(c,'culvert/earth',earth,x,street,32,crown-12-street);box(c,'#57443f',x,crown-12,32,1);box(c,'#0b090c',x,crown-1,32,2);}
  // The vault's own ring of brick on edge under the fill, a length of it per bay.
  for(let k=Math.floor((Math.max(left,SHAFT1)-RIB0)/RIB)-1;k*RIB+RIB0<right;k++){const xa=Math.max(SHAFT1,k*RIB+RIB0),xb=Math.min(shaft,(k+1)*RIB+RIB0+26);if(xb>xa){c.drawImage(panel(`culvert/ring/${k}`,xb-xa,11,RING,k),xa,crown-11);box(c,'#57443f',xa,crown-12,xb-xa,1);}}
 }
 const jamb=Math.ceil(shaft/32)*32;if(jamb+8>left&&jamb<right&&top<crown){const head=soffit(l,jamb);box(c,'#1d181c',jamb,head,8,crown-head);box(c,'#3b3034',jamb+1,head,2,crown-head);box(c,'#0b090c80',jamb+8,head,5,crown-head);}
 // Brick ribs stand at fixed places along the tunnel, each on its own footing at the springing.
 for(let x=Math.floor(left/RIB)*RIB+RIB0;x<right;x+=RIB){if(inMouth(x,26)||x<SHAFT1||x>shaft)continue;const s=soffit(l,x);
  // Each rib is a pier standing out of the wall: a brick face that catches the light, its return in shadow, and the shadow it throws.
  c.drawImage(panel(`culvert/rib/${x}`,22,water+60-s,RIBFACE,x),x+2,s);box(c,'#57443f',x+2,s,1,water+60-s);box(c,'#1d181c',x,s,2,water+60-s);
  c.drawImage(panel(`culvert/ribside/${x}`,6,water+60-s,RIBSIDE,x+1),x+24,s);box(c,'#0b090c',x+30,s,1,water+60-s);box(c,'#0b090c80',x+31,s,6,water-s);box(c,'#0b090c40',x+37,s,6,water-s);box(c,'#3b3034',x-4,water-22,34,6);box(c,'#4d3c3a',x-4,water-22,34,1);box(c,'#1d181c',x-4,water-16,34,16);}
 // Branch culverts open off the wall and take the water with them.
 for(const [x,w,bend] of MOUTHS)if(x+w/2+12>left&&x-w/2-12<right)c.drawImage(mouth(w,bend),x-w/2-12,water-MOUTH_TOP);
 for(const x of GRATINGS){
  // A grating in the street: the shaft down through the crown, the night coming through it, and rungs up the wall to it.
  if(x+70<left||x-20>right||x>=shaft||x<SHAFT1)continue;
  box(c,'#0b0d11',x-2,water-STREET-12,44,STREET-CROWN+14);box(c,'#141a22',x,water-STREET,40,STREET-CROWN);box(c,'#1c2228',x-2,water-STREET-12,44,12);for(let i=0;i<5;i++)box(c,'#31425d',x+2+i*8,water-STREET-11,4,10);
  box(c,'#6f8fb412',x,crown,40,CROWN);box(c,'#6f8fb40c',x-10,crown+40,60,CROWN-40);
  for(let y=crown+6;y<water-4;y+=11){box(c,'#0b090c',x+48,y+1,13,2);box(c,'#56646b',x+48,y,12,1);box(c,'#3a464d',x+48,y,1,3);box(c,'#3a464d',x+59,y,1,3);}
 }
 // Two service mains run the length of the wall on hangers from the vault, with a flange every few yards.
 for(let k=0;k<2;k++){const y=water-262+k*22;for(let x=Math.floor(left/96)*96;x<right;x+=96){if(y<soffit(l,x)+8||x<SHAFT1)continue;box(c,'#12181d',x,y,96,9);box(c,'#3f4c52',x,y+1,96,2);box(c,'#0d1216',x+90,y-2,6,13);box(c,'#5a686b',x+91,y-1,1,11);if(!k){box(c,'#0d1216',x+44,crown,2,y-crown);box(c,'#0d1216',x+40,y+31,10,3);box(c,'#0d1216',x+44,y+9,2,22);}}}
 // Street drains come out of the wall and run down it into the culvert.
 for(let i=Math.floor(left/270)-1;i*270<right;i++){
  const v=hash(i,5,37),x=i*270+60+Math.floor(v*150),y=water-52-Math.floor(v*4)*8;if(x+12<left||x>right||inMouth(x-6,24)||x>=shaft||x<SHAFT1+20)continue;
  box(c,'#16231d',x,y+8,10,10);box(c,'#16231d',x+2,y+18,6,14);box(c,'#16231d',x+3,y+32,4,water-y-32);
  box(c,'#0d1216',x-2,y-2,14,3);box(c,'#4f5f66',x-2,y-2,14,1);box(c,'#0d1216',x-1,y+1,12,8);box(c,'#34424a',x,y+1,10,7);box(c,'#060809',x+2,y+2,6,6);
  box(c,'#2e4f4c',x+4,y+7,2,water-y-7);
  for(let k=0;k<3;k++){const fall=(((t*52+k*31+i*17)%(water-y-7))+(water-y-7))%(water-y-7);box(c,'#7fb0a8',x+4,y+7+fall,2,3);}
  box(c,'#6f9a94',x+1+Math.round(Math.sin(t*6+i)),water-1,8,1);
 }
 // The stopped pumps of the pump passage.
 for(const x of [1860,2120])if(visible(x-20,water-160,180,200,cx,cy,vw,vh))pump(c,x,water,t);
 for(const h of l.hazards)if(h.kind==='steam'){
  // Every vent is fed from the run on the wall.
  const x=Math.round(h.x+h.w/2)-3,from=water-232,base=h.y+h.h;if(!visible(x,from,8,base-from,cx,cy,vw,vh))continue;
  box(c,'#12181d',x,from,7,base-from);box(c,'#3f4c52',x+1,from,2,base-from);box(c,'#0d1216',x-2,from+12,11,4);box(c,'#0d1216',x-2,base-22,11,4);
 }
 for(const p of l.platforms){
  const kind=role(p,l);if(!visible(p.x-16,p.y-320,p.w+32,water+380-p.y,cx,cy,vw,vh))continue;
  if(kind==='headwall')continue;
  if(kind==='walk'){
   // What is left of the inspection walk: a length of rusted grating still on its two hangers from the vault.
   for(const x of [p.x+6,p.x+p.w-8]){const s=soffit(l,x);box(c,'#1a1210',x,s,2,p.y-s);box(c,'#6a4532',x,s,1,p.y-s);box(c,'#1a1210',x-2,s,6,4);box(c,'#1a1210',x-1,p.y-3,4,4);}
   continue;
  }
  if(kind==='penstock'){
   // The sluice gate: its frame stands in the water on a brick sill, and its two lifting screws rise through the headstock.
   for(const x of [p.x+3,p.x+p.w-6]){box(c,'#0d1216',x,p.y-30,3,30);box(c,'#5a686b',x,p.y-30,1,30);for(let y=p.y-28;y<p.y-2;y+=4)box(c,'#34424a',x,y,3,1);box(c,'#0d1216',x-2,p.y-34,7,5);box(c,'#7d8c8e',x-2,p.y-34,7,1);}
   c.drawImage(panel(`culvert/sill/${p.id}`,p.w+56,74,BRICK,p.id*7),p.x-28,water-14);box(c,'#5a4744',p.x-30,water-18,p.w+60,5);box(c,'#6b5651',p.x-30,water-18,p.w+60,1);
   continue;
  }
  if(kind==='landing'){
   // A stone landing of the outfall stair, on corbels stepped out of the shaft's wall.
   for(let x=p.x+6;x<p.x+p.w-12;x+=30){box(c,'#191417',x,p.y+26,14,14);box(c,'#6b625c',x+1,p.y+27,12,6);box(c,'#4d4642',x+3,p.y+33,8,5);box(c,'#8a817a',x+1,p.y+27,12,1);}
   continue;
  }
  if(kind==='bench'){
   c.drawImage(panel(`culvert/bench/${p.id}`,p.w,water+60-p.y-8,BRICK,p.id*17+3),p.x,p.y+8);box(c,'#120e11',p.x,p.y+8,2,water+60-p.y);box(c,'#120e11',p.x+p.w-2,p.y+8,2,water+60-p.y);
   box(c,'#0b0d1180',p.x,water-10,p.w,10);for(let i=0;i*29<p.w-12;i++){const v=hash(i,p.id,3);if(v<.55)continue;const at=p.x+5+i*29+Math.floor(hash(i,p.id,4)*14);for(let k=0;k<2+Math.floor(v*3);k++){const hang=3+Math.floor(hash(i*5+k,p.id,6)*7);box(c,k%2?'#2e4534':'#3a5540',at+k*2,water-hang,1+k%2,hang);}}
  }else if(kind==='main'){
   // Each length of main turns down into the water at both ends and sits in a wall cradle.
   for(const x of [p.x+2,p.x+p.w-24]){box(c,'#11171c',x,p.y+14,22,water+50-p.y);box(c,'#34424a',x+3,p.y+14,6,water+50-p.y);box(c,'#4f5f66',x+3,p.y+14,2,water+50-p.y);box(c,'#0d1216',x-2,p.y+34,26,6);box(c,'#5a686b',x-2,p.y+34,26,1);}
   for(let x=p.x+46;x<p.x+p.w-46;x+=74){box(c,'#151b20',x,p.y+24,10,14);box(c,'#151b20',x-6,p.y+36,22,4);}
  }else{
   for(const x of [p.x+5,p.x+p.w-7]){const s=soffit(l,x);box(c,'#151b20',x,s,2,p.y-s);box(c,'#4f5f66',x,s,1,p.y-s);box(c,'#151b20',x-2,s,6,4);}
   box(c,'#1a2228',p.x,p.y-15,p.w,2);for(let x=p.x+1;x<p.x+p.w;x+=12)box(c,'#1a2228',x,p.y-13,1,13);
  }
 }
}
/** The culvert's mouth and its outfall shaft. West of the headwall is the
 * lane, open to the night; the headwall is cut through, its outfall passage
 * at the foot; the shaft behind it is built upright to a slab roof, and its
 * east side opens into the vault under a brick arch. */
function outfall(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number){
 const water=l.water!,head=l.platforms[0],bottom=cy+vh+24,top=cy-24;
 // The lane: night over the parapet, the backs of the lane's houses beyond it.
 if(top<head.y){
  box(c,'#141c2c',cx-24,top,HEAD1-(cx-24),head.y-top);box(c,'#1c2940',cx-24,Math.max(top,head.y-160),HEAD1-(cx-24),head.y-Math.max(top,head.y-160));
  for(const [x,w,h,lit] of [[-40,120,250,1],[90,110,190,0]] as const){box(c,'#1a222e',x,head.y-h,w,h);box(c,'#263345',x-3,head.y-h-5,w+6,5);box(c,'#111822',x,head.y-h,w,2);for(let yy=head.y-h+24;yy<head.y-20;yy+=46){box(c,'#0e151f',x+20,yy,12,18);box(c,(yy+x)%3===lit?'#b07d40':'#1c2b3d',x+22,yy+2,8,14);}}
 }
 // The headwall, cut through: dressed stone from its coping down past the water, the outfall passage at its foot.
 if(visible(HEAD0,head.y,HEAD1-HEAD0,water+90-head.y,cx,cy,vw,vh)){
  c.drawImage(panel('culvert/headwall',HEAD1,water+90-head.y-10,HEADWALL,61),0,head.y+10);
  const pa=water-64;box(c,'#1d252e',0,pa-8,HEAD1,8);box(c,'#4c5864',0,pa-7,HEAD1,5);box(c,'#6b7782',0,pa-7,HEAD1,1);box(c,'#05080b',0,pa,HEAD1,water+90-pa);
  // The gate stands open on the coping, the steps behind it lead east to the shaft.
  const gx=84,gy=head.y;for(const side of [-1,1]){const px=gx+side*24-(side<0?10:0);box(c,'#1a222b',px,gy-40,10,40);box(c,'#46525f',px+1,gy-39,8,38);box(c,'#6b7782',px+1,gy-39,8,1);box(c,'#56626e',px-1,gy-44,12,5);}
  box(c,'#1c2228',gx-14,gy-36,2,36);for(let k=0;k<4;k++)box(c,'#1c2228',gx-28-k*2,gy-34+k*2,2,32-k*4);box(c,'#1c2228',gx-30,gy-34,18,2);box(c,'#1c2228',gx-30,gy-12,18,2);
 }
 // The shaft: upright brick from the water to its slab, a doorway west onto the headwall walk, an arch east into the vault.
 if(visible(HEAD1,SHAFT_TOP-20,SHAFT1-HEAD1+40,water+90-SHAFT_TOP,cx,cy,vw,vh)){
  shaftRoom(c,'culvert/shaft',HEAD1,SHAFT1,SHAFT_TOP,water+90,l.platforms.filter(p=>role(p,l)==='landing').map(p=>p.y+40),29,top,bottom);
  box(c,'#0e1216',HEAD1-8,SHAFT_TOP-26,SHAFT1-HEAD1+48,26);box(c,'#2a3036',HEAD1-8,SHAFT_TOP-4,SHAFT1-HEAD1+48,4);box(c,'#3d454c',HEAD1-8,SHAFT_TOP-26,SHAFT1-HEAD1+48,1);
  if(top<SHAFT_TOP-26)box(c,'#141c2c',HEAD1,top,SHAFT1-HEAD1+40,SHAFT_TOP-26-top);
  // West doorway: dressed jambs and a lintel the shaft's courses stop against.
  const dy=head.y,dt=dy-62;box(c,'#0b0d11',HEAD1,dt,14,dy-dt);box(c,'#6b625c',HEAD1+12,dt,6,dy-dt);box(c,'#8a817a',HEAD1+12,dt,1,dy-dt);box(c,'#191417',HEAD1-2,dt-10,30,10);box(c,'#6b625c',HEAD1-2,dt-9,30,7);box(c,'#8a817a',HEAD1-2,dt-9,30,1);
  // East side: the vault's first ring springs from a pier, and the tunnel goes on through it.
  const ax=SHAFT1-8;box(c,'#1d181c',ax,SHAFT_TOP,34,water+90-SHAFT_TOP);box(c,'#3b3034',ax+2,SHAFT_TOP,2,water+90-SHAFT_TOP);box(c,'#120e11',ax+30,SHAFT_TOP,4,water+90-SHAFT_TOP);
  for(let y=Math.max(SHAFT_TOP,Math.floor(top/8)*8);y<Math.min(bottom,water+90);y+=8)box(c,'#120e11',ax+4,y,24,1);
  box(c,'#05080b',ax+4,water-CROWN+20,26,CROWN-20);for(let y=water-CROWN+20;y<water;y+=8)box(c,'#0b090c',ax+4,y,26,1);
  // Iron rungs up the shaft's wall beside the stair.
  for(let y=SHAFT_TOP+10;y<water-6;y+=11){box(c,'#0b090c',HEAD1+20,y+1,13,2);box(c,'#56646b',HEAD1+20,y,12,1);}
 }
}
function water(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number,s?:Run){
 const top=l.water!,bottom=cy+vh+24;if(bottom<=top)return;
 box(c,'#0f1e20',cx-24,top,vw+48,bottom-top);box(c,'#0c181a',cx-24,top+12,vw+48,bottom-top-12);box(c,'#091214',cx-24,top+34,vw+48,bottom-top-34);
 // The culvert runs: streaks slide along the surface toward the outfall.
 for(let row=0;row<7;row++){const y=top+2+row*row*2+row*3,step=46+row*12,slide=t*(26-row*3);
  for(let i=Math.floor((cx-24+slide)/step)-1;i*step-slide<cx+vw+24;i++){const v=hash(i,row,41);box(c,v>.5?'#2e4f4c':'#1d3836',i*step-slide+v*20,y,8+Math.floor(v*14),1);}}
 for(let x=Math.floor((cx-24)/26)*26;x<cx+vw+24;x+=26)box(c,'#3f6660',x+4+Math.round(Math.sin(t*2+x*.3)*2),top,12,1);
 // What light there is lies on it: the night under each grating, and every wall lamp you have lit.
 for(const x of GRATINGS)if(x+60>cx&&x-20<cx+vw)for(let k=0;k<5;k++)box(c,'#6f8fb433',x+4+k*2+Math.round(Math.sin(t*1.3+k*1.7+x)*2),top+3+k*5,32-k*5,1);
 if(s)for(const lamp of l.stations)if(lamp.kind==='lamp'&&s.activated.includes(lamp.id)&&lamp.x>cx-30&&lamp.x<cx+vw+30)lampOnWater(c,Math.round(lamp.x),top,top-lamp.y+50,t);
 if(s&&top-s.y<150&&s.y<top)lampOnWater(c,Math.round(s.x+8+s.facing*7),top,top-s.y-24,t);
}
function deck(c:C,p:Platform,l:Level){
 const w=p.w,kind=role(p,l);
 if(kind==='walk'){
  // Rusted bar grating: bars gone here and there, the frame scaled red.
  box(c,'#1a1210',-2,0,w+4,12);box(c,'#9a6a4a',0,0,w,1);box(c,'#6a4532',0,1,w,2);
  for(let x=3;x<w-3;x+=8){if(hash(x,p.id,9)>.72)continue;box(c,'#2a1c16',x,3,3,7);box(c,'#7a4f36',x,3,1,6);}
  box(c,'#3a2820',0,10,w,2);box(c,'#1a1210',Math.round(w*.3),0,6,3);
  return;
 }
 if(kind==='penstock'){
  // The sluice: a headstock on two guide channels, the cast door between them stopped a little way up.
  for(const x of [0,w-8]){box(c,'#0d1216',x,10,8,p.h-10);box(c,'#26333a',x+1,10,5,p.h-10);box(c,'#4f5f66',x+1,10,1,p.h-10);}
  box(c,'#161d22',8,22,w-16,p.h-48);box(c,'#2c383f',9,23,w-18,p.h-50);box(c,'#4f5f66',9,23,w-18,1);
  for(let y=34;y<p.h-34;y+=18){box(c,'#161d22',9,y,w-18,2);box(c,'#4f5f66',9,y+2,w-18,1);}
  box(c,'#6a4532',14,26,2,44);box(c,'#6a4532',w-19,44,2,52);box(c,'#05080b',8,p.h-26,w-16,26);
  box(c,'#0d1216',-2,0,w+4,12);box(c,'#3f4c52',-1,1,w+2,9);box(c,'#7d8c8e',-1,0,w+2,2);box(c,'#26333a',-1,9,w+2,2);for(const x of [10,w-12])box(c,'#7d8c8e',x,4,2,2);
  return;
 }
 if(kind==='grating'){
  box(c,'#12191e',-2,0,w+4,12);box(c,'#aab3ae',0,0,w,1);box(c,'#5d6b70',0,1,w,2);
  for(let x=3;x<w-3;x+=8){box(c,'#1c272d',x,3,3,7);box(c,'#6d7d80',x,3,1,6);}
  box(c,'#2f3d43',0,10,w,2);return;
 }
 if(kind==='headwall'||kind==='landing'){
  // The headwall's coping, or a stone landing: a dressed slab with a worn nosing.
  box(c,'#191417',-2,0,w+4,12);box(c,'#77706b',-2,0,w+4,9);box(c,'#a39b92',-2,0,w+4,2);box(c,'#57514d',-2,9,w+4,2);
  for(let x=26+p.id%3*8;x<w-8;x+=40)box(c,'#57514d',x,2,1,7);
  return;
 }
 if(kind==='bench'){
  // A bullnosed stone kerb on brick.
  box(c,'#191417',-2,0,w+4,10);box(c,'#77706b',-2,0,w+4,8);box(c,'#a39b92',-2,0,w+4,2);box(c,'#57514d',-2,7,w+4,1);
  for(let x=30+p.id%3*8;x<w-8;x+=44)box(c,'#57514d',x,2,1,6);
  return;
 }
 // A riveted iron main: lit along the top, dark under the belly, a flange at each end.
 box(c,'#0d1216',0,0,w,28);box(c,'#26333a',0,2,w,22);box(c,'#34424a',0,3,w,10);box(c,'#4f5f66',0,3,w,4);box(c,'#7d8c8e',0,1,w,2);box(c,'#161d22',0,20,w,6);
 for(let x=36;x<w-30;x+=40){box(c,'#161d22',x,2,3,24);box(c,'#5a686b',x+3,3,1,20);for(const y of [6,12,18])box(c,'#7d8c8e',x+1,y,1,1);}
 for(const x of [-2,w-6]){box(c,'#0d1216',x,-2,8,32);box(c,'#3f4c52',x+1,-1,6,30);box(c,'#7d8c8e',x+1,-1,6,2);box(c,'#5a686b',x+2,0,1,28);}
}
function station(c:C,l:Level,s:Station,x:number,y:number,lit:boolean){
 // A caged bulkhead lamp on the wall, on its own conduit from the vault.
 const top=soffit(l,x);x=Math.round(x);
 box(c,'#12181d',x-1,top,2,y-64-top);box(c,'#12181d',x-8,y-66,16,5);box(c,'#3f4c52',x-8,y-66,16,1);
 if(lit){box(c,'#f3c77a12',x-30,y-74,60,74);box(c,'#f3c77a1c',x-18,y-64,36,48);}
 box(c,'#12181d',x-7,y-61,14,20);box(c,lit?'#f3c77a':'#2a343b',x-5,y-59,10,16);if(lit)box(c,'#fff0c4',x-2,y-56,4,9);
 for(const xx of [-5,-1,3])box(c,'#12181d',x+xx,y-59,1,16);box(c,'#12181d',x-5,y-52,10,1);
 // The gas tap you turn to light it.
 box(c,'#12181d',x-1,y-41,2,18);box(c,'#8c7648',x-4,y-25,8,3);box(c,'#b79a5c',x-4,y-25,8,1);
}
function exit(c:C,l:Level,s:Run,t:number,front:boolean){
 if(front)return;
 const x=Math.round(l.exit.x+l.exit.w/2),y=l.exit.y+l.exit.h,open=s.phase!=='playing';
 // The street stairwell: a brick arch in the wall of the shaft, with the stair going up inside it.
 box(c,'#f3c77a10',x-44,y-92,88,92);
 box(c,'#120e11',x-28,y-64,56,64);box(c,'#120e11',x-24,y-71,48,8);box(c,'#120e11',x-16,y-76,32,6);
 for(let i=0;i<7;i++){const yy=y-62+i*9;box(c,i%2?'#4d3c3a':'#423334',x-26,yy,8,8);box(c,i%2?'#423334':'#4d3c3a',x+18,yy,8,8);}
 for(let i=0;i<5;i++)box(c,i%2?'#4d3c3a':'#423334',x-22+i*9,y-69-(i===2?5:i===1||i===3?3:0),8,7);
 box(c,'#c98f4b',x-17,y-58,34,58);box(c,'#c98f4b',x-12,y-63,24,6);box(c,'#f0c47a',x-10,y-56,20,56);
 for(let i=0;i<6;i++){box(c,'#8f6a3c',x-17,y-8-i*9,34-i*4,2);box(c,'#fff0c4',x-17+34-i*4,y-56,i?0:0,0);}
 box(c,'#fff0c4',x+2,y-54,8,30);
 if(open)box(c,'#fff0c455',x-12,y-56,24,56);
 box(c,'#57514d',x-28,y-3,56,3);box(c,'#a39b92',x-28,y-3,56,1);box(c,'#f3c77a44',x-22,y-1,44,1);
 // An enamel plate over the arch points up to the street.
 box(c,'#12181d',x-15,y-92,30,12);box(c,'#aab3ae',x-13,y-90,26,8);box(c,'#12181d',x-1,y-88,2,5);box(c,'#12181d',x-3,y-87,6,1);box(c,'#12181d',x-2,y-88,4,1);
}
export const culvert:QuarterSet={sky(c,l,w,h){box(c,'#0b0d11',0,0,w,h);},back,deck,exit,water,station};
