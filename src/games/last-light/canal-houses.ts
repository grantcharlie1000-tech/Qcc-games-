import {box,hash,lay,masonry,sprite,stroke,type C,type Work} from './quarter-kit';

/** Level 3's near bank: the buildings that use the quay, each painted once
 * into its own canvas at its own size. Every painter is given the width and
 * height it stands in and the places on its front that the route uses (a
 * taking-in door's sill, a loading dock); the set lays them out on the quay.
 * They are near, so they are drawn larger and with more contrast than the
 * far bank, and they stand on the coping: the bottom row is hidden behind it. */
const STONE:Work={course:12,short:18,long:44,mortar:'#151b23',stones:['#2c3540','#303a45','#29323c','#333d48'],lip:'#3c4855',shade:'#232b35',chip:'#48545f'};
const PALE:Work={course:14,short:24,long:56,mortar:'#181f27',stones:['#38424c','#3c4650','#353f49','#404a54'],lip:'#4c5864',shade:'#2b343e',chip:'#56626e'};
const brickTile=()=>masonry('canal/near/brick-wall',48,24,12,6,{mortar:'#1c1517',stones:['#3b2522','#432a25','#38231f','#472e27'],lip:'#523329',chip:'#5e3c30'});
function brick(c:C,x:number,y:number,w:number,h:number){c.save();c.fillStyle=c.createPattern(brickTile(),'repeat')!;c.translate(x,y);c.fillRect(0,0,w,h);c.restore();}
function stone(c:C,x:number,y:number,w:number,h:number,k:Work,seed:number){c.save();c.translate(x,y);lay(c,w,h,k,seed);c.restore();}
const GLASS='#121a24',PANE='#1b2a3c',LIT='#c9944c',BRIGHT='#f0c47a',IRON='#141b21',IRON_LIT='#4a585f',OAK='#2e2620',OAK_LIT='#4a3c30',OAK_DARK='#17110d';
/** A sash window in a dressed surround: dark, or lit from inside with a warm glow on the glass. */
function window_(c:C,x:number,y:number,w:number,h:number,lit:boolean,bars=false){
 box(c,'#46525f',x-2,y-3,w+4,3);box(c,'#5d6975',x-2,y-3,w+4,1);box(c,'#3a4652',x-2,y+h,w+4,3);box(c,'#56626e',x-2,y+h,w+4,1);
 box(c,'#0b0f14',x,y,w,h);box(c,lit?LIT:GLASS,x+1,y+1,w-2,h-2);
 if(lit){box(c,BRIGHT,x+2,y+2,Math.max(1,Math.round(w/2)-2),h-4);box(c,'#f3c77a44',x-3,y-3,w+6,h+6);}
 else box(c,PANE,x+1,y+1,Math.max(1,Math.round(w/2)-1),Math.round(h/2)-1);
 box(c,'#0b0f14',x+Math.floor(w/2),y,1,h);box(c,'#0b0f14',x,y+Math.floor(h/2),w,1);
 if(bars)for(let bx=x+2;bx<x+w-1;bx+=3)box(c,IRON,bx,y,1,h);
}
/** A pair of boarded doors with strap hinges in an opening; `open` leaves one leaf back on the dark. */
function doors(c:C,x:number,y:number,w:number,h:number,open=false,arch=false){
 const head=arch?Math.round(w/2):0;
 for(let yy=0;yy<h;yy++){const k=arch&&yy<head?Math.sqrt(1-((head-yy)/head)**2):1,half=Math.round(w/2*k);box(c,'#0b0f14',x+w/2-half-3,y+yy,half*2+6,1);box(c,'#46525f',x+w/2-half-3,y+yy,3,1);box(c,'#46525f',x+w/2+half,y+yy,3,1);}
 for(let yy=0;yy<h;yy++){const k=arch&&yy<head?Math.sqrt(1-((head-yy)/head)**2):1,half=Math.round(w/2*k)-1;if(half<1)continue;
  for(let xx=-half;xx<half;xx++){if(open&&xx>=0)continue;const plank=((xx+half)>>2)%2;box(c,plank?OAK:'#342a22',x+w/2+xx,y+yy,1,1);}
 }
 if(open)box(c,'#05080b',x+w/2,y+head,Math.round(w/2)-1,h-head);
 for(const sy of [y+head+6,y+h-10])box(c,IRON,x+2,sy,open?Math.round(w/2)-3:w-4,2);
 box(c,OAK_DARK,x+Math.round(w/2)-1,y+head,1,h-head);
}
/** A taking-in door on an upper floor: the leaves hung open against the wall, the dark loft behind. */
function takingIn(c:C,x:number,y:number,w:number,h:number){
 box(c,'#46525f',x-3,y-4,w+6,4);box(c,'#5d6975',x-3,y-4,w+6,1);box(c,'#46525f',x-3,y,3,h);box(c,'#46525f',x+w,y,3,h);
 box(c,'#06090c',x,y,w,h);box(c,'#141a20',x+2,y+h-10,w-4,6);
 // The leaves, folded back flat against the wall either side.
 for(const lx of [x-12,x+w+3]){box(c,OAK_DARK,lx,y+1,9,h-2);box(c,OAK,lx+1,y+2,7,h-4);box(c,OAK_LIT,lx+1,y+2,1,h-4);box(c,IRON,lx,y+8,9,1);box(c,IRON,lx,y+h-10,9,1);}
}
/** The cathead: a timber hoist beam out of the gable, a sheave, and the chain hanging from it. */
function cathead(c:C,x:number,y:number,drop:number){
 box(c,OAK_DARK,x-3,y-2,6,8);box(c,OAK_DARK,x-2,y,26,6);box(c,OAK,x-1,y+1,24,4);box(c,OAK_LIT,x-1,y+1,24,1);
 stroke(c,OAK_DARK,x+2,y+6,x+14,y+18,2);
 box(c,IRON,x+17,y+6,6,6);box(c,IRON_LIT,x+18,y+7,4,1);
 for(let k=0;k<drop;k+=3)box(c,k%6?'#59666b':'#2c353b',x+19,y+12+k,2,2);
 box(c,IRON,x+17,y+12+drop,6,2);box(c,IRON,x+21,y+14+drop,2,4);box(c,IRON_LIT,x+18,y+12+drop,4,1);
}
function cornice(c:C,x:number,y:number,w:number){box(c,'#1a222b',x-3,y-1,w+6,7);box(c,'#4c5864',x-3,y,w+6,4);box(c,'#6b7782',x-3,y,w+6,1);for(let xx=x;xx<x+w;xx+=8)box(c,'#2c353f',xx+2,y+4,4,2);}
function slates(c:C,x:number,y:number,w:number,h:number,hip=0){
 for(let yy=0;yy<h;yy++){const inset=Math.round(hip*(1-yy/h));box(c,(yy>>2)%2?'#202a37':'#1d2633',x+inset,y+yy,w-inset*2,1);if(yy%4===0)for(let xx=x+inset+((yy>>2)%2)*5;xx<x+w-inset;xx+=10)box(c,'#161e29',xx,y+yy,1,4);}
 box(c,'#384962',x+hip,y,w-hip*2,1);
}
function chimney(c:C,x:number,y:number,h:number){box(c,'#141b21',x-1,y,12,h);box(c,'#36231f',x,y+2,10,h-2);for(let yy=y+4;yy<y+h;yy+=4)box(c,'#24171a',x,yy,10,1);box(c,'#4c5864',x-2,y,14,3);box(c,'#141b21',x+2,y-4,3,4);box(c,'#141b21',x+6,y-3,3,3);}
/** A lamp on a wall bracket. Lit lamps on the near side are the only warm light on the quay. */
export function wallLamp(c:C,x:number,y:number,lit:boolean){
 box(c,IRON,x,y,10,2);box(c,IRON,x+9,y,2,8);stroke(c,IRON,x+1,y+2,x+7,y+8,1);
 box(c,IRON,x+6,y+8,9,3);box(c,IRON,x+7,y+11,7,9);box(c,lit?BRIGHT:'#232e37',x+8,y+12,5,7);box(c,IRON,x+6,y+20,9,2);
 if(lit){box(c,'#fff1c4',x+9,y+13,3,4);for(const [r,a] of [[8,'#f3c77a30'],[14,'#f3c77a18']] as const)box(c,a,x+10-r,y+15-r,r*2+1,r*2+1);}
}

/** 1 · The bonded store: dressed stone, a tall cart floor and a loft floor over it, its taking-in door under a cathead. */
export function bondedStore(w:number,h:number,door:{x:number;sill:number}){
 return sprite(`canal/house/bonded/${w}/${h}/${door.x}/${door.sill}`,w,h,c=>{
  const top=22;slates(c,4,4,w-8,top-4,18);chimney(c,30,0,10);chimney(c,w-46,0,10);
  stone(c,0,top,w,h-top,STONE,31);
  // Quoins at both corners, a plinth, and a string course at the loft floor.
  for(let y=top,k=0;y<h;y+=12,k++)for(const x of [0,w-(k%2?16:9)]){box(c,'#3a4552',x,y+1,k%2?16:9,11);box(c,'#4a5662',x,y+1,k%2?16:9,1);}
  box(c,'#232b35',0,h-18,w,18);box(c,'#3a4652',0,h-18,w,2);
  box(c,'#1a222b',0,door.sill+2,w,5);box(c,'#46525f',0,door.sill+2,w,3);box(c,'#5d6975',0,door.sill+2,w,1);
  cornice(c,0,top,w);
  // Cart doors on the ground floor, arched; one stands open.
  doors(c,34,h-74,46,56,false,true);doors(c,128,h-74,46,56,true,true);
  // Barred windows on the loft floor, a watchman's light in one; small vents under the cornice.
  for(let x=24,i=0;x<w-30;x+=46,i++){if(Math.abs(x+8-door.x-22)<44)continue;window_(c,x,door.sill-42,16,26,i===1,true);}
  for(let x=40;x<w-30;x+=58)if(Math.abs(x-door.x-16)>36)box(c,'#06090c',x,top+10,10,4);
  takingIn(c,door.x,door.sill-48,44,48);
  cathead(c,door.x+10,top-2,Math.max(4,door.sill-48-top-14));
  wallLamp(c,96,h-96,true);
 });
}
/** 2 · The sack wharf's goods shed: boarded on a brick plinth, two sliding doors on their track, a lean-to roof. */
export function goodsShed(w:number,h:number){
 return sprite(`canal/house/shed/${w}/${h}`,w,h,c=>{
  // The roof falls toward the quay; its eaves overhang on brackets.
  for(let y=0;y<18;y++){const slope=Math.round(y*.2);box(c,y%3?'#262a2e':'#1d2124',slope,y,w-slope,1);}
  box(c,'#3d444a',0,16,w,3);box(c,'#7d878c',0,16,w,1);
  for(let x=0;x<w;x+=6)box(c,x%12?'#2e2620':'#342a22',x,19,6,h-35);
  for(let x=0;x<w;x+=6)box(c,OAK_DARK,x,19,1,h-35);
  brick(c,0,h-16,w,16);box(c,'#4c5864',0,h-18,w,2);
  // Each door on its track: a long rail with the hangers rolling on it.
  box(c,IRON,8,24,w-16,3);box(c,IRON_LIT,8,24,w-16,1);
  for(const [x,open] of [[24,false],[w-110,true]] as const){
   box(c,'#06090c',x,28,80,h-46);
   const lx=open?x+52:x;box(c,OAK_DARK,lx,28,open?54:80,h-46);for(let xx=lx+2;xx<lx+(open?54:80)-1;xx+=7)box(c,OAK,xx,29,6,h-48);
   box(c,IRON,lx+2,40,(open?54:80)-4,2);box(c,IRON,lx+2,h-30,(open?54:80)-4,2);stroke(c,IRON,lx+3,42,lx+(open?50:76),h-31,1);
   for(const hx of [lx+6,lx+(open?44:70)])box(c,IRON,hx,24,4,6);
  }
  // A shed sign board, its lettering long gone to grey ghosts.
  box(c,'#1a1612',Math.round(w/2)-30,30,60,12);box(c,'#3b332a',Math.round(w/2)-29,31,58,10);for(let x=Math.round(w/2)-25;x<Math.round(w/2)+25;x+=6)box(c,'#57504a',x,34,4,4);
 });
}
/** 3 · The coal merchant's weigh-house: a brick hut with a lit window and a bin of coal against it. */
export function weighHouse(w:number,h:number){
 return sprite(`canal/house/weigh/${w}/${h}`,w,h,c=>{
  const hx=w-86;
  for(let y=0;y<16;y++){const half=Math.round(y*2.6);box(c,y%2?'#202a37':'#1d2633',hx+43-half,y,half*2,1);}
  box(c,'#384962',hx,15,86,2);brick(c,hx+3,17,80,h-17);chimney(c,hx+60,0,10);
  window_(c,hx+14,32,22,18,true);doors(c,hx+48,h-50,26,48);
  // Bins of coal: boarded fronts, the coal heaped behind them, a shovel left in.
  for(const [x,bw] of [[2,56],[62,48]] as const){
   const by=h-34;for(let k=0;k<18;k++)box(c,'#101216',x+bw/2-Math.round((bw/2)*(1-k/18)),by+k-12,Math.round(bw*(1-k/18)),1);
   for(let k=0;k<26;k++){const gx=x+2+Math.floor(hash(k,x,61)*(bw-4)),gy=by-10+Math.floor(hash(k,x,62)*10);if(gy>by-12+Math.abs(gx-x-bw/2)*0.7)box(c,hash(k,x,63)>.7?'#59626e':'#262a30',gx,gy,1,1);}
   box(c,OAK_DARK,x,by,bw,34);for(let yy=by+1;yy<by+34;yy+=7)box(c,OAK,x+1,yy,bw-2,6);box(c,OAK_LIT,x+1,by+1,bw-2,1);
  }
  stroke(c,OAK_DARK,30,h-48,40,h-62,2);box(c,'#59666b',26,h-50,7,5);
 });
}
/** 4 · The chandlers' warehouse: four floors of brick, a loading door over its raised dock, a hanging sign. */
export function chandlers(w:number,h:number,dock:{x:number;w:number;y:number}){
 return sprite(`canal/house/chandlers/${w}/${h}/${dock.x}/${dock.y}`,w,h,c=>{
  const top=20;slates(c,6,4,w-12,top-4,12);chimney(c,50,0,8);chimney(c,w-70,0,8);
  brick(c,0,top,w,h-top);
  for(let y=top,k=0;y<h;y+=12,k++)for(const x of [0,w-(k%2?14:8)]){box(c,'#3a4552',x,y+1,k%2?14:8,11);box(c,'#4a5662',x,y+1,k%2?14:8,1);}
  cornice(c,0,top,w);
  const floor=(n:number)=>h-8-n*52;
  for(let n=1;n<4&&floor(n)>top+8;n++){box(c,'#46525f',0,floor(n),w,3);box(c,'#5d6975',0,floor(n),w,1);}
  // Segmental-headed windows, three to a floor, the shop's lit below.
  for(let n=0;n<4&&floor(n)-36>top+8;n++)for(let i=0;i<4;i++){const x=22+i*Math.round((w-60)/3);if(n===0&&x+20>dock.x-8)continue;if(n>0&&Math.abs(x+9-dock.x-dock.w/2)<26)continue;window_(c,x,floor(n)-36,18,26,(n===0&&i===0)||(n===2&&i===1));}
  // The loading door over the dock, a taking-in door over it, and the hoist.
  doors(c,dock.x+16,dock.y-70,dock.w-32,70,true);takingIn(c,dock.x+dock.w/2-20,floor(2)-46,40,44);cathead(c,dock.x+dock.w/2-10,top-2,Math.max(4,floor(2)-46-top-16));
  // A hanging sign on a scrolled bracket: an anchor, picked out in pale paint.
  const sx=dock.x-30,sy=floor(1)-30;box(c,IRON,sx-14,sy,30,2);stroke(c,IRON,sx-12,sy+2,sx-2,sy+10,1);box(c,IRON,sx-4,sy+2,1,6);box(c,IRON,sx+12,sy+2,1,6);
  box(c,'#17110d',sx-8,sy+8,24,22);box(c,'#3a2d23',sx-7,sy+9,22,20);box(c,'#9aa3a5',sx+3,sy+12,2,13);box(c,'#9aa3a5',sx-1,sy+14,10,2);box(c,'#9aa3a5',sx-2,sy+22,2,3);box(c,'#9aa3a5',sx+8,sy+22,2,3);box(c,'#9aa3a5',sx,sy+24,8,2);
  wallLamp(c,dock.x-24,h-70,false);
 });
}
/** 5 · The granary: tall, narrow and stone, slit vents for the grain, a boarded lucam at the top over its hoist. */
export function granary(w:number,h:number){
 return sprite(`canal/house/granary/${w}/${h}`,w,h,c=>{
  const top=30;
  for(let y=0;y<top;y++){const half=Math.round((w/2-6)*y/top);box(c,y%2?'#202a37':'#1d2633',w/2-half,y,half*2,1);box(c,'#3a4a5e',w/2-half,y,2,1);}
  stone(c,0,top,w,h-top,PALE,57);
  for(let y=top,k=0;y<h;y+=14,k++)for(const x of [0,w-(k%2?18:10)]){box(c,'#46515c',x,y+1,k%2?18:10,13);box(c,'#56626e',x,y+1,k%2?18:10,1);}
  for(let y=h-60;y>top+30;y-=46){box(c,'#2b343e',0,y,w,4);box(c,'#56626e',0,y,w,1);}
  // Ventilation slits in pairs, the grain's breath; a big door at the foot.
  for(let y=h-104;y>top+40;y-=46)for(const x of [24,52,w-60,w-32]){box(c,'#46525f',x-2,y-2,10,26);box(c,'#06090c',x+2,y,2,22);}
  doors(c,w/2-26,h-62,52,58,false,true);
  // The lucam: a boarded hoist house on brackets out of the face, its doors open, the chain down from it.
  const lx=w/2-24;box(c,OAK_DARK,lx-2,top-10,52,50);for(let x=lx;x<lx+48;x+=5)box(c,OAK,x,top-8,4,46);
  for(let y=0;y<12;y++){const half=Math.round(26*y/12);box(c,'#1d2633',lx+24-half,top-22+y,half*2,1);}
  box(c,'#06090c',lx+10,top+4,28,28);box(c,OAK_DARK,lx+6,top+40,36,4);stroke(c,OAK_DARK,lx+6,top+44,lx+18,top+56,2);stroke(c,OAK_DARK,lx+42,top+44,lx+30,top+56,2);
  for(let k=0;k<64;k+=3)box(c,k%6?'#59666b':'#2c353b',lx+23,top+32+k,2,2);box(c,IRON,lx+21,top+96,6,3);
  window_(c,24,h-150,14,20,true);
 });
}
/** 6 · The custom house: ashlar, rusticated below, a pediment over pilasters, tall windows, the board office still lit. */
export function customHouse(w:number,h:number){
 return sprite(`canal/house/custom/${w}/${h}`,w,h,c=>{
  const top=34,mid=Math.round(w/2);
  for(let y=0;y<top-6;y++){const half=Math.round((w/2-20)*y/(top-6));box(c,'#2f3946',mid-half,y+4,half*2,1);box(c,'#46525f',mid-half,y+4,3,1);box(c,'#46525f',mid+half-3,y+4,3,1);}
  stone(c,0,top,w,h-top,PALE,73);
  // Rustication: deep joints on the ground floor.
  for(let y=h-12;y>h-76;y-=12){box(c,'#141a20',0,y,w,2);for(let x=(y/12)%2?0:20;x<w;x+=40)box(c,'#141a20',x,y-10,2,10);}
  box(c,'#4c5864',0,h-80,w,5);box(c,'#6b7782',0,h-80,w,1);cornice(c,0,top,w);
  for(const x of [10,mid-50,mid+42,w-18]){box(c,'#46525f',x,top+6,8,h-top-86);box(c,'#5d6975',x,top+6,1,h-top-86);box(c,'#4c5864',x-2,top+6,12,4);}
  // The pediment's tympanum carries a round window, dark.
  for(let k=0;k<7;k++)box(c,'#1a222b',mid-4+k,14,1,1);box(c,'#0b0f14',mid-5,12,10,10);box(c,'#46525f',mid-6,11,12,1);
  for(const [x,lit] of [[30,true],[mid-28,false],[mid+12,true],[w-62,false]] as const){window_(c,x,top+18,16,40,lit);window_(c,x,h-66,16,30,false,true);}
  doors(c,mid-18,h-70,36,66,false,true);box(c,'#6b7782',mid-24,h-74,48,4);
  // A flagstaff over the door; the flag hangs still.
  box(c,IRON,mid-1,top-26,2,26);box(c,'#4a585f',mid,top-26,1,26);box(c,'#7a4040',mid+2,top-24,12,9);box(c,'#5a2e2e',mid+2,top-17,12,2);
 });
}
/** 7 · The coal tip's lock-keeper: a stone hut with a lit window, its tide board on the corner, a timber derrick for the coal. */
export function tipHouse(w:number,h:number){
 return sprite(`canal/house/tip/${w}/${h}`,w,h,c=>{
  const hx=10,hw=80,ht=70;
  for(let y=0;y<18;y++){const half=Math.round(y*2.4);box(c,y%2?'#202a37':'#1d2633',hx+hw/2-half,h-ht-18+y,half*2,1);}
  stone(c,hx,h-ht,hw,ht,STONE,91);chimney(c,hx+58,h-ht-24,10);
  window_(c,hx+12,h-ht+16,20,18,true);doors(c,hx+46,h-46,22,44);
  // The tide board: a painted gauge bolted to the corner, the marks in feet.
  box(c,'#d8d4c4',hx+hw+2,h-ht+4,6,ht-6);for(let y=h-ht+8;y<h-4;y+=6)box(c,'#202020',hx+hw+2,y,y%12?3:6,1);
  // The derrick: a mast, its boom cocked up over the dock, the fall hanging.
  const mx=w-34;box(c,OAK_DARK,mx,6,8,h-6);box(c,OAK,mx+1,6,5,h-6);box(c,OAK_LIT,mx+1,6,1,h-6);
  stroke(c,OAK_DARK,mx+6,h-40,w-2,22,3);stroke(c,OAK,mx+6,h-41,w-2,21,1);stroke(c,'#3a3027',mx+4,8,w-3,22,1);stroke(c,'#3a3027',mx,8,mx-30,h,1);
  for(let k=0;k<40;k+=3)box(c,k%6?'#59666b':'#2c353b',w-3,24+k,2,2);box(c,IRON,w-5,64,6,3);
 });
}
/** A post crane on the quay: a cast-iron pillar, its jib swung out over the water, the fall carrying a sling of sacks. */
export function postCrane(c:C,x:number,foot:number,reach:number,dir:1|-1){
 const top=foot-74,tip={x:x+dir*reach,y:foot-108};
 box(c,'#0f1418',x-6,foot-6,13,6);box(c,'#3d4a51',x-6,foot-6,13,1);
 box(c,IRON,x-3,top,7,74);box(c,IRON_LIT,x-2,top,1,74);for(let y=top+8;y<foot-8;y+=16)box(c,'#262d33',x-4,y,9,2);
 // The jib and its tie: two irons from the pillar's head and foot out to the sheave.
 stroke(c,IRON,x,top+40,tip.x,tip.y,3);stroke(c,IRON_LIT,x,top+39,tip.x,tip.y-1,1);stroke(c,IRON,x,top-6,tip.x,tip.y,2);
 box(c,IRON,x-4,top-8,9,6);box(c,'#59666b',tip.x-4,tip.y-4,8,8);box(c,IRON,tip.x-2,tip.y-2,4,4);
 // The winch drum on the pillar, its handle.
 box(c,'#262d33',x+dir*4-3,foot-44,7,10);box(c,IRON_LIT,x+dir*4-3,foot-44,7,1);stroke(c,IRON,x+dir*7,foot-40,x+dir*13,foot-48,1);
 const fall=34;for(let k=0;k<fall;k+=3)box(c,k%6?'#59666b':'#2c353b',tip.x-1,tip.y+4+k,2,2);
 const sy=tip.y+4+fall;box(c,IRON,tip.x-2,sy,4,3);stroke(c,'#8a7a5a',tip.x,sy+3,tip.x-9,sy+10,1);stroke(c,'#8a7a5a',tip.x,sy+3,tip.x+9,sy+10,1);
 for(const [sx,sy2] of [[-10,10],[-1,10],[-6,4]] as const){box(c,'#5a4a36',tip.x+sx,sy+sy2,10,7);box(c,'#8a7656',tip.x+sx+1,sy+sy2,8,5);box(c,'#a89272',tip.x+sx+1,sy+sy2,8,1);}
}
/** The gantry at the custom house: two timber trestles on the quay carrying the deck you walk, its end out over the cut with the crab and hook. */
export function gantry(c:C,x0:number,x1:number,deck:number,foot:number,legs:readonly number[]){
 for(const lx of legs){
  stroke(c,OAK_DARK,lx-14,foot,lx-2,deck+12,4);stroke(c,OAK_DARK,lx+14,foot,lx+2,deck+12,4);stroke(c,OAK,lx-13,foot-1,lx-2,deck+13,1);stroke(c,OAK,lx+13,foot-1,lx+2,deck+13,1);
  box(c,OAK_DARK,lx-12,Math.round((foot+deck)/2)+6,24,4);box(c,OAK,lx-11,Math.round((foot+deck)/2)+6,22,1);
  box(c,'#3d4a51',lx-17,foot-3,10,3);box(c,'#3d4a51',lx+7,foot-3,10,3);
 }
 // The crab at the outboard end, its chain and hook hanging over the water.
 box(c,IRON,x1-22,deck+12,16,8);box(c,IRON_LIT,x1-22,deck+12,16,1);box(c,'#262d33',x1-19,deck+20,4,4);box(c,'#262d33',x1-11,deck+20,4,4);
 for(let k=0;k<38;k+=3)box(c,k%6?'#59666b':'#2c353b',x1-15,deck+24+k,2,2);box(c,IRON,x1-17,deck+62,6,2);box(c,IRON,x1-13,deck+64,2,5);box(c,IRON,x1-16,deck+68,4,2);
 box(c,'#1a222b',x0,deck+12,x1-x0,1);
}

/** One granary storey in section. Bay-sized cached walls keep the long room
 * cheap on small devices; the ceiling and rear masonry enclose every bay. */
export function granaryRoom(c:C,x:number,y:number,w:number){
 const h=176;
 for(let at=0,bay=0;at<w;at+=232,bay++){
  const bw=Math.min(232,w-at);
  const art=sprite(`canal/granary-floor/fix3/${bay}/${bw}`,bw,h,ctx=>{
   box(ctx,'#191b20',0,0,bw,h);
   brick(ctx,0,16,bw,h-16);box(ctx,'#12151b55',0,16,bw,h-16);
   // The floor above is supported by joists mortised into oak posts.
   box(ctx,'#19120e',0,0,bw,18);box(ctx,'#65503c',0,2,bw,4);
   for(let xx=20;xx<bw;xx+=38){box(ctx,'#463426',xx,6,9,14);box(ctx,'#8c7351',xx,6,2,12);}
   const post=Math.min(bw-10,28);
   box(ctx,'#17110d',post,18,10,h-18);box(ctx,'#63503b',post+1,18,6,h-18);box(ctx,'#967b55',post+1,18,1,h-18);
   stroke(ctx,'#745a3f',post+7,48,post+42,18,5);
   box(ctx,'#3b4142',post-2,h-18,14,18);box(ctx,'#8c9691',post,h-15,2,2);
   // Vent recess, inventory board and loose sacks vary by working bay.
   if(bay%2===0){window_(ctx,112,42,18,28,bay===2,true);wallLamp(ctx,158,50,bay===2);}
   else{box(ctx,'#191713',108,54,42,22);for(let k=0;k<4;k++)box(ctx,'#9c967d',113,59+k*4,22-k*3,1);}
   for(let k=0;k<3+bay%3;k++){
    const sx=64+k*15,sy=h-14-(k%2)*10;
    box(ctx,'#463725',sx,sy,15,14);box(ctx,'#8f7a56',sx+1,sy+1,13,12);box(ctx,'#c0a77c',sx+2,sy+1,11,2);
   }
   // Stone footing under the back wall: the room is in the building.
   box(ctx,'#2b2927',0,h-4,bw,4);
  });
  c.drawImage(art,x+at,y);
 }
 // Two arched doors connect this storey to the same quay. Folded leaves
 // stand against the jambs; neither doorway is a hole through to the sky.
 for(const dx of [0,w-36]){
  doors(c,x+dx+5,y+48,26,128,true,true);
  box(c,'#71604b',x+dx+2,y+174,32,2);
 }
 // The hoist trench is a masonry-lined pit beneath the working floor.
 const trench=x+776;
 box(c,'#0c1015',trench,y+176,60,76);
 for(const px of [trench,trench+52]){box(c,'#4a443b',px,y+176,8,76);for(let yy=y+184;yy<y+252;yy+=12)box(c,'#242329',px,yy,8,1);}
 box(c,'#68553c',trench-8,y+14,76,8);box(c,'#1a2328',trench+26,y+22,10,12);
 for(let yy=y+34;yy<y+160;yy+=4)box(c,'#77817e',trench+30,yy,2,2);
}
