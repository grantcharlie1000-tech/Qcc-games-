import type {Level,Platform,Station} from './levels';
import type {Run} from './model';
import {box,hash,masonry,seamless,sprite,stroke,visible,wall,type C} from './quarter-kit';
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
const COURSES=[
 {from:96,key:'culvert/v0',tile:()=>masonry('culvert/v0',64,32,16,8,{mortar:'#17131a',stones:['#2b2328','#2e252a','#31282c'],lip:'#3a2f33',chip:'#40343a'})},
 {from:176,key:'culvert/v1',tile:()=>masonry('culvert/v1',64,24,16,6,{mortar:'#151118',stones:['#262025','#282126','#2a2328'],lip:'#30272c',chip:'#352b30'})},
 {from:236,key:'culvert/v2',tile:()=>masonry('culvert/v2',64,16,16,4,{mortar:'#120f15',stones:['#201b20','#221c21','#231d22'],lip:'#282126',chip:'#2b2328'})},
 {from:1e4,key:'culvert/v3',tile:()=>masonry('culvert/v3',48,12,12,3,{mortar:'#0e0c11',stones:['#19151a','#1a161b','#1b171c'],lip:'#1b171c',chip:'#1b171c'})},
] as const;
const ring=()=>masonry('culvert/ring',24,12,6,12,{mortar:'#191417',stones:['#3a2d2e','#3e3031','#423334'],lip:'#4d3c3a',chip:'#4d3c3a'});
const patch=()=>masonry('culvert/patch',64,32,16,8,{mortar:'#1a1416',stones:['#3a2a29','#3e2d2b','#42302d'],lip:'#4c3834',chip:'#553f3a'});
const earth=()=>seamless('culvert/earth',96,64,rect=>{rect('#0c0d10',0,0,96,64);for(let i=0;i<26;i++){const v=hash(i,3,51),x=Math.floor(hash(i,1,51)*96),y=Math.floor(hash(i,2,51)*64);rect(v>.6?'#15161a':'#111216',x,y,3+Math.floor(v*7),2+Math.floor(v*3));if(v>.8)rect('#1b1c20',x,y,2+Math.floor(v*4),1);}for(let i=0;i<5;i++)rect('#090a0c',Math.floor(hash(i,4,51)*96),8+i*12,30+Math.floor(hash(i,5,51)*40),1);});
const setts=()=>masonry('culvert/setts',48,12,12,6,{mortar:'#0e1217',stones:['#232b33','#262e37','#29313a'],lip:'#343e48',chip:'#3a444e'});
const CROWN=300,STREET=368,RISE=118,MOUTH_TOP=150;
/** Where a branch culvert opens off the far wall: its centre, its width, and which way it bends out of sight. */
const MOUTHS:readonly (readonly [number,number,number])[]=[[300,150,0],[1175,170,1],[2630,150,-1],[3050,180,0]];
/** Where a grating in the street lets the night down, with rungs up to it. */
const GRATINGS=[520,905,1444,1960,2400,2840,3330];
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
const bench=()=>masonry('culvert/bench',64,32,16,8,{mortar:'#191417',stones:['#3a2d2e','#3e3031','#423334'],lip:'#4d3c3a',chip:'#564440'});
type Role='bench'|'main'|'grating';
const role=(p:Platform,l:Level):Role=>p.kind==='grate'?'grating':p.w>=170&&l.water!-p.y<=48||p.id===l.mainCount-1?'bench':'main';
/** The soffit of the vault: one height along the tunnel, opening into the stair shaft at the far end. */
const soffit=(l:Level,x:number)=>x>l.platforms[l.mainCount-1].x-190?l.platforms[l.mainCount-1].y-170:l.water!-300;
function pump(c:C,x:number,water:number,t:number){
 // A beam pump on a brick plinth: cylinder, flywheel, and a rocking beam that has stopped.
 wall(c,'culvert/bench',bench,x-10,water-36,150,60);box(c,'#5a4744',x-12,water-40,154,5);
 box(c,'#151b20',x,water-110,44,70);box(c,'#2a343b',x+3,water-108,10,66);box(c,'#3d4a51',x+3,water-108,3,66);box(c,'#151b20',x-4,water-116,52,8);box(c,'#3d4a51',x-4,water-116,52,2);
 for(let y=-36;y<=36;y++){const out=Math.floor(Math.sqrt(36*36-y*y)),hole=Math.abs(y)<29?Math.floor(Math.sqrt(29*29-y*y)):0;box(c,'#1a2127',x+96-out,water-78+y,out*2,1);if(hole)box(c,'#201a1f',x+96-hole,water-78+y,hole*2,1);}
 for(let i=0;i<6;i++){const a=i*Math.PI/3;stroke(c,'#1a2127',x+96,water-78,x+96+Math.cos(a)*30,water-78+Math.sin(a)*30,2);}
 box(c,'#3d4a51',x+92,water-82,8,8);stroke(c,'#151b20',x+22,water-128,x+96,water-136,4);box(c,'#151b20',x+56,water-150,6,110);box(c,'#3d4a51',x+56,water-150,2,110);
}
function back(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number){
 const water=l.water!,left=cx-24,right=cx+vw+24,top=cy-24,bottom=cy+vh+24,crown=water-CROWN,shaft=l.platforms[l.mainCount-1].x-190;
 // The far side of the vault: the courses close up and darken as it curves over to the crown.
 for(let i=0,y=water+90;i<COURSES.length;i++){const k=COURSES[i],up=Math.max(top,water-k.from);if(up<Math.min(y,bottom))wall(c,k.key,k.tile,left,up,right-left,Math.min(y,bottom)-up);y=water-k.from;}
 // The flood has stained the bottom courses a brick at a time.
 for(let x=Math.floor(left/16)*16;x<right;x+=16){const v=hash(x>>4,7,31);box(c,'#070d0c80',x,water-10-Math.floor(v*4)*4,16,10+Math.floor(v*4)*4);}
 // Where the wall has been rebuilt the brick is newer and redder.
 for(let i=Math.floor(left/420)-1;i*420<right;i++){const v=hash(i,9,33),x=i*420+120+Math.floor(v*200),w=64+Math.floor(v*4)*16;if(x+w<left||x>right||inMouth(x,w))continue;wall(c,'culvert/patch',patch,x,water-88,w,48);wall(c,'culvert/patch',patch,x+16,water-96,w-48,8);wall(c,'culvert/patch',patch,x+8,water-40,w-24,16);}
 // The ground over the crown: the vault's own ring of brick on edge, the fill, and the street's setts on top of that.
 if(top<crown){
  const street=water-STREET;
  for(let x=Math.floor(left/32)*32;x<right;x+=32){
   if(x>=shaft){
    // The stair shaft at the far end stands upright in ordinary courses to its own head, above the street.
    const head=soffit(l,x),from=Math.max(top,head);wall(c,COURSES[1].key,COURSES[1].tile,x,from,32,crown-from);
    if(head>top){box(c,'#0b0d11',x,top,32,head-top);box(c,'#3b3034',x,head-4,32,4);box(c,'#120e11',x,head,32,3);}
    continue;
   }
   if(top<street-12){box(c,'#111928',x,top,32,street-12-top);box(c,'#1a222e',x,street-48,32,36);box(c,'#263243',x,street-48,32,1);box(c,'#111822',x,street-14,32,2);}
   wall(c,'culvert/setts',setts,x,street-12,32,12);box(c,'#3d4852',x,street-12,32,1);wall(c,'culvert/earth',earth,x,street,32,crown-12-street);wall(c,'culvert/ring',ring,x,crown-12,32,12);box(c,'#57443f',x,crown-12,32,1);box(c,'#0b090c',x,crown-1,32,2);}
 }
 const jamb=Math.ceil(shaft/32)*32;if(jamb+8>left&&jamb<right&&top<crown){const head=soffit(l,jamb);box(c,'#1d181c',jamb,head,8,crown-head);box(c,'#3b3034',jamb+1,head,2,crown-head);box(c,'#0b090c80',jamb+8,head,5,crown-head);}
 // Brick ribs stand at fixed places along the tunnel, each on its own footing at the springing.
 for(let x=Math.floor(left/352)*352+96;x<right;x+=352){if(inMouth(x,26))continue;const s=soffit(l,x);box(c,'#1d181c',x,s,26,water+60-s);box(c,'#3b3034',x+2,s,2,water+60-s);box(c,'#120e11',x+24,s,2,water+60-s);box(c,'#0b090c80',x+26,s,5,water-s);for(let y=Math.max(s,Math.floor(top/24)*24);y<Math.min(water,bottom);y+=24)box(c,'#120e11',x+4,y,20,1);box(c,'#3b3034',x-4,water-22,34,6);box(c,'#4d3c3a',x-4,water-22,34,1);box(c,'#1d181c',x-4,water-16,34,16);}
 // Branch culverts open off the wall and take the water with them.
 for(const [x,w,bend] of MOUTHS)if(x+w/2+12>left&&x-w/2-12<right)c.drawImage(mouth(w,bend),x-w/2-12,water-MOUTH_TOP);
 for(const x of GRATINGS){
  // A grating in the street: the shaft down through the crown, the night coming through it, and rungs up the wall to it.
  if(x+70<left||x-20>right||x>=shaft)continue;
  box(c,'#0b0d11',x-2,water-STREET-12,44,STREET-CROWN+14);box(c,'#141a22',x,water-STREET,40,STREET-CROWN);box(c,'#1c2228',x-2,water-STREET-12,44,12);for(let i=0;i<5;i++)box(c,'#31425d',x+2+i*8,water-STREET-11,4,10);
  box(c,'#6f8fb412',x,crown,40,CROWN);box(c,'#6f8fb40c',x-10,crown+40,60,CROWN-40);
  for(let y=crown+6;y<water-4;y+=11){box(c,'#0b090c',x+48,y+1,13,2);box(c,'#56646b',x+48,y,12,1);box(c,'#3a464d',x+48,y,1,3);box(c,'#3a464d',x+59,y,1,3);}
 }
 // Two service mains run the length of the wall on hangers from the vault, with a flange every few yards.
 for(let k=0;k<2;k++){const y=water-262+k*22;for(let x=Math.floor(left/96)*96;x<right;x+=96){if(y<soffit(l,x)+8)continue;box(c,'#12181d',x,y,96,9);box(c,'#3f4c52',x,y+1,96,2);box(c,'#0d1216',x+90,y-2,6,13);box(c,'#5a686b',x+91,y-1,1,11);if(!k){box(c,'#0d1216',x+44,crown,2,y-crown);box(c,'#0d1216',x+40,y+31,10,3);box(c,'#0d1216',x+44,y+9,2,22);}}}
 // Street drains come out of the wall and run down it into the culvert.
 for(let i=Math.floor(left/270)-1;i*270<right;i++){
  const v=hash(i,5,37),x=i*270+60+Math.floor(v*150),y=water-52-Math.floor(v*4)*8;if(x+12<left||x>right||inMouth(x-6,24)||x>=shaft)continue;
  box(c,'#16231d',x,y+8,10,10);box(c,'#16231d',x+2,y+18,6,14);box(c,'#16231d',x+3,y+32,4,water-y-32);
  box(c,'#0d1216',x-2,y-2,14,3);box(c,'#4f5f66',x-2,y-2,14,1);box(c,'#0d1216',x-1,y+1,12,8);box(c,'#34424a',x,y+1,10,7);box(c,'#060809',x+2,y+2,6,6);
  box(c,'#2e4f4c',x+4,y+7,2,water-y-7);
  for(let k=0;k<3;k++){const fall=(((t*52+k*31+i*17)%(water-y-7))+(water-y-7))%(water-y-7);box(c,'#7fb0a8',x+4,y+7+fall,2,3);}
  box(c,'#6f9a94',x+1+Math.round(Math.sin(t*6+i)),water-1,8,1);
 }
 // The stopped pumps of the pump passage.
 for(const x of [1300,1560])if(visible(x-20,water-160,180,200,cx,cy,vw,vh))pump(c,x,water,t);
 for(const h of l.hazards)if(h.kind==='steam'){
  // Every vent is fed from the run on the wall.
  const x=Math.round(h.x+h.w/2)-3,from=water-232,base=h.y+h.h;if(!visible(x,from,8,base-from,cx,cy,vw,vh))continue;
  box(c,'#12181d',x,from,7,base-from);box(c,'#3f4c52',x+1,from,2,base-from);box(c,'#0d1216',x-2,from+12,11,4);box(c,'#0d1216',x-2,base-22,11,4);
 }
 for(const p of l.platforms){
  const kind=role(p,l);if(!visible(p.x-16,p.y-320,p.w+32,water+380-p.y,cx,cy,vw,vh))continue;
  if(kind==='bench'){
   wall(c,'culvert/bench',bench,p.x,p.y+8,p.w,water+60-p.y-8);box(c,'#120e11',p.x,p.y+8,2,water+60-p.y);box(c,'#120e11',p.x+p.w-2,p.y+8,2,water+60-p.y);
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
 if(kind==='grating'){
  box(c,'#12191e',-2,0,w+4,12);box(c,'#aab3ae',0,0,w,1);box(c,'#5d6b70',0,1,w,2);
  for(let x=3;x<w-3;x+=8){box(c,'#1c272d',x,3,3,7);box(c,'#6d7d80',x,3,1,6);}
  box(c,'#2f3d43',0,10,w,2);return;
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
