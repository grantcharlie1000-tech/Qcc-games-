import {box,hash,stroke,type C,type Work} from '../quarter-kit';
import {ASHLAR,BOARD_BROWN,BOARD_GREY,BOARD_PITCH,BOARD_TAR,CLAY,COOL,CURTAINS,FONT,GREY,INK,IRON,IRON_LIT,LEAD,LIME,OCHRE,PALE,PLUM,RED,RUBBLE,RUSTIC,SAND,SLATE_BLUE,SLATE_GREEN,SLATE_PURPLE,SOOT,SQUARED,STONE_SLATE,TILE,TIMBER,WARM,
 archRing,band,barrel,board,coping,door,gutter,hoop,ladder,laps,lintel,pantiles,pipe,pitch,planks,quoins,renderAt,returnFace,roofBehind,shape,sill,soldiers,stain,step,surround,textW,wallAt,win,type Arch,type Look,type Tri,type Win} from './level-01';

/** Bell Lane's buildings that carry more than one landing. Each is named by
 * the first word of its landings' tags (`inn.lower` belongs to `inn`), and is
 * painted once, at its own size, into its own canvas, which is blitted after
 * that. Nothing here runs per frame.
 *
 * A building's canvas covers its plot: from `west` px left of its leftmost
 * landing to `east` px right of its rightmost, from `above` px over its
 * highest landing down to the lane at y = h. Every ledge is given in that
 * canvas's coordinates. The walked edge of each ledge is its top row, exactly
 * at ledge.y; the art may overhang the plot by up to PAD px each side and
 * above. Crumbling and springing ledges are not painted into the building:
 * `deck` paints their own tiles, so they can break or give without the
 * building breaking with them. */
export interface Ledge {part:string;x:number;y:number;w:number;h:number;kind:string}
export interface Vent {kind:string;x:number;y:number;w:number;h:number}
export interface Plot {w:number;h:number;ledges:readonly Ledge[];vents:readonly Vent[]}
export interface Building {
 above?:number;west?:number;east?:number;
 paint:(c:C,plot:Plot)=>void;
 /** A crumbling or springing ledge's tile; (0,0) is its top-left, w by h its solid. */
 deck?:(c:C,part:string,w:number,h:number)=>void;
}
export const PAD=8;

// ── What the buildings share ────────────────────────────────────────────────
const NONE:Ledge={part:'',x:0,y:0,w:0,h:0,kind:'stone'};
/** A building's ledge by its part name; the market has two roofs, so `n` picks which. */
const part=(p:Plot,name:string,n=0):Ledge=>p.ledges.filter(l=>l.part===name)[n]??NONE;
const at=(c:C,x:number,y:number,f:()=>void)=>{c.save();c.translate(Math.round(x),Math.round(y));f();c.restore();};
const shade=(c:C,x:number,y:number,w:number,h:number,a:number,col='#04070b')=>{c.save();c.globalAlpha=a;box(c,col,x,y,w,h);c.restore();};
const disc=(c:C,col:string,cx:number,cy:number,r:number)=>{for(let dy=-r;dy<=r;dy++){const k=Math.floor(Math.sqrt((r+.5)*(r+.5)-dy*dy));box(c,col,cx-k,cy+dy,k*2+1,1);}};
const sides=(c:C,x0:number,x1:number,y0:number,y1:number,lit:string)=>{box(c,INK,x0,y0,1,y1-y0);box(c,INK,x1-1,y0,1,y1-y0);box(c,lit,x0+1,y0,1,y1-y0);};
const ringOf=(k:Work):readonly [string,string,string]=>[k.lip,k.stones[1],k.mortar];
const STONE_RING=[COOL[0],'#414a52',COOL[2]] as const;
const WOOD:Tri=['#1a1410','#3a2d22','#6e5641'];
/** A window under a stone lintel, on a stone sill. */
const sash=(c:C,x:number,y:number,w:number,h:number,look:Look,o:Partial<Win>={},k:Tri=COOL,t=6)=>{lintel(c,x,y,w,k,t);win(c,x,y,w,h,{look,...o});sill(c,x,y+h,w,k);};
/** A window under an arch turned in the wall's own brick or stone. */
const arched=(c:C,x:number,y:number,w:number,h:number,look:Look,arch:Arch,rise:number,ring:readonly [string,string,string],o:Partial<Win>={},k:Tri=COOL,th=5)=>{archRing(c,x,y,w,arch,rise,th,ring[0],ring[1],ring[2],x*7+y);win(c,x,y,w,h,{look,arch,rise,...o});sill(c,x,y+h,w,k);};
const cope=(c:C,x:number,y:number,w:number,t:number,k:Tri,s:number)=>at(c,0,y,()=>coping(c,x,w,t,k,s));
const slope=(c:C,x:number,y:number,w:number,depth:number,tones:readonly string[],s:number,row=6,sw=9,ridge:Tri=PALE,grow=0)=>at(c,x,y,()=>pitch(c,w,depth,tones,s,row,sw,ridge,grow));
/** A lead flat. The walked edge stays put; the sheets run back above it. */
function leadTop(c:C,x:number,y:number,w:number,t:number,s:number){
 for(let i=0;i<22;i++)box(c,i<2?'#222a30':i%6===0?'#3a444c':'#313b44',x,y-22+i,w,1);
 box(c,LEAD[0],x,y,w,t);box(c,LEAD[1],x,y,w,2);box(c,LEAD[2],x,y+t-1,w,1);
 for(let px=x+8+Math.floor(hash(s,0,1)*8),i=0;px<x+w-5;i++){box(c,'#6b767d',px,y+2,2,t-3);box(c,LEAD[2],px+2,y+2,1,t-3);px+=13+Math.floor(hash(s,i,2)*9);}
}
/** A lead-covered pitch seen from the street: the drip is the walked edge, the rolls run back to the ridge. */
function leadSlope(c:C,x:number,y:number,w:number,depth:number,s:number){
 const shown=Math.max(depth,42);
 c.save();c.translate(0,-(shown-4));
 box(c,LEAD[2],x,y,w,shown);box(c,'#3d474f',x,y+2,w,shown-3);box(c,LEAD[1],x,y,w,2);
 for(let px=x+10+Math.floor(hash(s,0,3)*10),i=0;px<x+w-4;i++){box(c,'#55616a',px,y+2,2,shown-3);box(c,'#2a3239',px+2,y+2,1,shown-3);px+=20+Math.floor(hash(s,i,4)*13);}
 box(c,'#2a3239',x,y+Math.round(shown*.56),w,1);
 c.restore();
}
/** Clay tiles. `rise` puts the ridge behind the walked edge instead of hanging the tiles down the wall. */
function tiled(c:C,x:number,y:number,w:number,depth:number,s:number,pan=false,rise=false){
 const draw=(d:number)=>{
  if(pan)pantiles(c,TILE,'#170f0d','#63433a',s,x,y+5,w,d-9);
  else{box(c,'#170f0d',x,y+5,w,d-9);for(let py=y+5,r=0;py<y+d-4;py+=5,r++)for(let px=x-Math.floor(hash(s,r,62)*7),i=0;px<x+w;px+=7,i++){const a=Math.max(x,px),b=Math.min(x+w,px+7);if(b-a>1)box(c,TILE[Math.floor(hash(s,r,i+3)*4)],a,py,b-a-1,Math.min(4,y+d-4-py));}}
  box(c,CLAY[0],x,y,w,5);box(c,CLAY[1],x,y,w,2);box(c,'#170f0d',x,y+5,w,1);
  for(let px=x+7;px<x+w-4;px+=11+Math.floor(hash(s,px,64)*4))box(c,CLAY[2],px,y+2,1,3);
  gutter(c,x-2,y+d-4,w+4,s);
 };
 if(!rise){draw(depth);return;}
 const shown=Math.max(depth,42);
 c.save();c.translate(0,-(shown-4));draw(shown);c.restore();
}
/** A stone shelf of a cornice on its blocks. */
function cornice(c:C,x:number,y:number,w:number,k:Tri,block:string,t=8){
 box(c,k[2],x-3,y,w+6,t);box(c,k[0],x-3,y,w+6,Math.ceil(t/2));box(c,k[1],x-3,y,w+6,1);for(let px=x+1;px<x+w-3;px+=7)box(c,block,px,y+Math.ceil(t/2),4,t-Math.ceil(t/2)-1);
}
/** Sign-writer's capitals and figures. */
const GLYPH:Readonly<Record<string,string>>={...FONT,'0':'111101101101111','1':'010110010010111','2':'111001111100111','4':'101101111001001','7':'111001001001001','8':'111101111101111','9':'111101111001111'};
function write(c:C,t:string,x:number,y:number,col:string,k=1){for(const ch of t){const g=GLYPH[ch];if(g)for(let i=0;i<15;i++)if(g[i]==='1')box(c,col,x+(i%3)*k,y+Math.floor(i/3)*k,k,k);x+=4*k;}}
/** A clock face: its rim, its chapter ring and its two hands, each given as a turn of the dial. */
function dial(c:C,cx:number,cy:number,r:number,face:string,rim:string,hour:number,minute:number){
 disc(c,INK,cx,cy,r+2);disc(c,rim,cx,cy,r+1);disc(c,face,cx,cy,r);
 if(r>5)for(let i=0;i<12;i++){const a=i/12*Math.PI*2;box(c,'#2a2620',Math.round(cx+Math.sin(a)*(r-1.5)),Math.round(cy-Math.cos(a)*(r-1.5)),1,1);}
 const hand=(t:number,len:number,th:number)=>stroke(c,'#15120e',cx,cy,Math.round(cx+Math.sin(t*Math.PI*2)*len),Math.round(cy-Math.cos(t*Math.PI*2)*len),th);
 if(r>2){hand(minute,r-2,1);hand(hour,Math.max(1,r*.55),r>9?2:1);}
}
/** Under a steam vent's pipe: a lead collar dressed into the roof, a louvred hood below it. */
function ventSeat(c:C,v:Vent,k:Tri){
 const x=v.x-9,y=v.y+v.h,w=v.w+18;
 box(c,INK,x-1,y+2,w+2,16);box(c,k[0],x,y,w,17);box(c,k[1],x,y,w,2);box(c,k[2],x,y+16,w,1);box(c,k[2],x+w-1,y+2,1,14);
 box(c,INK,x+4,y+6,w-8,9);for(let py=y+7;py<y+14;py+=3){box(c,'#2a2f33',x+5,py,w-10,2);box(c,'#454c52',x+5,py,w-10,1);}
}

// ── The clockmaker's ────────────────────────────────────────────────────────
const clock:Building={paint(c,p){
 const cs=part(p,'case'),r=part(p,'roof'),s=4274,x0=r.x,w=r.w,h=p.h,top=r.y,fl=[top+24,top+118,top+212,h],green:Tri=['#101713','#213a2e','#2d4c3c'],gilt='#a9905f',frame='#4f4a42';
 slope(c,x0,top,w,24,SLATE_BLUE,s,6,9,LEAD);
 wallAt(c,PLUM,s+1,x0,fl[0],w,fl[1]-fl[0]);wallAt(c,PLUM,s+2,x0,fl[1],w,fl[2]-fl[1]);
 for(let px=x0+2;px<x0+w-4;px+=6)box(c,PLUM.lip,px,fl[0],3,2);
 band(c,x0,fl[1]-3,w,WARM,3);
 // Two rooms over the workroom, and the workroom itself, where he is still at his bench.
 sash(c,x0+24,fl[0]+24,18,38,'drawn',{cols:2,rows:2,rail:true,frame,tint:'#3a3629'},WARM);
 sash(c,x0+90,fl[0]+24,18,38,'dark',{cols:2,rows:2,rail:true,frame,s:s+2},WARM);
 stroke(c,IRON,x0+62,fl[0]+38,x0+70,fl[0]+46,1);stroke(c,IRON,x0+70,fl[0]+38,x0+62,fl[0]+46,1);box(c,IRON_LIT,x0+66,fl[0]+42,1,1);
 arched(c,x0+20,fl[1]+22,24,50,'lit','seg',4,ringOf(RED),{cols:3,rows:3,frame,s:7},WARM);
 arched(c,x0+88,fl[1]+22,24,50,'blind','seg',4,ringOf(RED),{cols:3,rows:3,frame,s:s+5},WARM);
 // The shopfront: a painted timber front under its cornice, the fascia lined in gilt and left unlettered.
 const sy=fl[2],wx=x0+14,wy=sy+28,ww=70,wh=70;
 box(c,green[0],x0,sy+5,w,h-sy-5);
 box(c,INK,x0-2,sy-1,w+4,7);box(c,green[1],x0-2,sy,w+4,5);box(c,green[2],x0-2,sy,w+4,1);
 box(c,green[1],x0+1,sy+6,w-2,15);box(c,gilt,x0+8,sy+8,w-16,1);box(c,gilt,x0+8,sy+18,w-16,1);
 for(const px of [x0+1,x0+w-11]){box(c,green[1],px,sy+22,10,h-sy-22);box(c,green[2],px,sy+22,1,h-sy-22);box(c,green[0],px+3,sy+28,4,h-sy-44);box(c,green[2],px,sy+22,10,1);}
 win(c,wx,wy,ww,wh,{look:'dim',cols:1,rows:1,frame:green[2],s:3});
 // His stock in the window, no two alike: wall dials, a bracket clock, a carriage clock, a longcase, watches on their hooks.
 box(c,'#2a2019',wx+2,wy+38,46,2);box(c,'#4a3a2c',wx+2,wy+38,46,1);
 dial(c,wx+13,wy+15,8,'#b9b294','#8a7446',.83,.17);dial(c,wx+34,wy+12,5,'#a39c80','#3a2c22',.3,.75);
 for(let k=0;k<8;k++)box(c,'#3a2c22',wx+47+Math.min(k,7-k,2)*-1+2,wy+6+k*3,16-2+Math.min(k,7-k,2)*2,3);dial(c,wx+56,wy+17,6,'#c4bc9c','#6b5536',.55,.95);
 box(c,'#17110d',wx+6,wy+21,14,17);box(c,'#3d2f22',wx+7,wy+22,12,15);box(c,'#5a4731',wx+8,wy+20,10,2);dial(c,wx+13,wy+29,4,'#b9b294','#8a7446',.1,.5);
 box(c,'#6b5536',wx+27,wy+27,9,11);box(c,'#a9905f',wx+27,wy+27,9,1);box(c,'#b9b294',wx+29,wy+30,5,5);box(c,'#15120e',wx+31,wy+31,1,3);box(c,'#6b5536',wx+30,wy+25,3,2);
 for(const [dx,drop] of [[40,3],[44,6]] as const){box(c,gilt,wx+dx,wy+25,1,drop);disc(c,gilt,wx+dx,wy+26+drop,1);}
 box(c,'#17110d',wx+53,wy+30,13,39);box(c,'#3a2c22',wx+54,wy+31,11,38);box(c,'#4a3a2c',wx+52,wy+28,15,3);dial(c,wx+59,wy+37,4,'#b9b294','#8a7446',.66,.33);box(c,'#17110d',wx+57,wy+46,5,18);box(c,gilt,wx+59,wy+48,1,10);disc(c,gilt,wx+59,wy+59,1);
 dial(c,wx+16,wy+53,7,'#a39c80','#59636a',.42,.08);box(c,'#3a2c22',wx+31,wy+46,13,23);box(c,'#5a4731',wx+31,wy+46,13,1);dial(c,wx+37,wy+53,4,'#c4bc9c','#8a7446',.95,.4);
 for(const f of [.25,.5,.75])box(c,green[2],wx+Math.round(ww*f),wy,1,wh);box(c,green[2],wx,wy+22,ww,1);
 box(c,green[2],wx-2,wy+wh,ww+4,2);box(c,green[1],wx-2,wy+wh+2,ww+4,2);
 for(const px of [wx,wx+36]){box(c,INK,px,wy+wh+7,34,h-wy-wh-10);box(c,green[1],px+1,wy+wh+8,32,h-wy-wh-12);box(c,green[2],px+1,wy+wh+8,32,1);}
 const dx=x0+92;door(c,dx,h-68,24,68,{tone:green,style:'panel',fan:'dim',fanH:12,knob:gilt});step(c,dx,h,24,WARM);
 sides(c,x0,x0+w,fl[0],h,PLUM.lip);pipe(c,x0+w-9,fl[0],fl[2],s);
 // His clock: a cased dial hung out over the alley on a wrought bracket bolted to the west corner.
 const cx=cs.x,cy=cs.y,cw=cs.w,mid=cx+Math.round(cw/2);
 box(c,IRON,x0-1,cy+2,4,76);box(c,IRON_LIT,x0-1,cy+2,1,76);for(const py of [cy+5,cy+38,cy+72])box(c,'#59666b',x0,py,2,2);
 for(const py of [cy+8,cy+28]){box(c,IRON,cx+cw,py,x0-cx-cw,3);box(c,IRON_LIT,cx+cw,py,x0-cx-cw,1);}
 stroke(c,IRON,x0,cy+74,cx+cw-4,cy+42,2);hoop(c,x0-9,cy+42,5,IRON);hoop(c,x0-18,cy+19,6,IRON);box(c,IRON_LIT,x0-22,cy+14,2,1);
 box(c,INK,cx,cy,cw,44);box(c,'#2a2019',cx+1,cy+4,cw-2,38);box(c,'#3d2f22',cx+2,cy+5,cw-4,36);box(c,'#17110d',cx+3,cy+40,cw-6,3);
 box(c,LEAD[0],cx-1,cy,cw+2,5);box(c,LEAD[1],cx-1,cy,cw+2,2);box(c,LEAD[2],cx-1,cy+4,cw+2,1);
 dial(c,mid,cy+23,14,'#c2ba98','#8a7446',.86,.14);box(c,'#8f8a70',mid-8,cy+31,17,1);
 box(c,'#2a2019',mid-6,cy+44,12,4);box(c,'#17110d',mid-3,cy+48,6,3);box(c,gilt,mid-1,cy+51,2,3);
}};

// ── The pawnbroker's ────────────────────────────────────────────────────────
const pawn:Building={paint(c,p){
 const r=part(p,'roof'),o=part(p,'oriel'),s=5370,x0=r.x,w=r.w,h=p.h,top=r.y,fl=[top+26,top+104,top+196,h],frame='#4f4a42',gold=['#6e5624','#b08d3c','#e0c070'] as const;
 at(c,x0,top,()=>roofBehind(c,w,s,36));wallAt(c,SOOT,s,x0,top+5,w,13);cope(c,x0,top,w,5,WARM,s);cornice(c,x0,top+18,w,WARM,SOOT.stones[2]);
 for(let f=0;f<3;f++)wallAt(c,SOOT,s+3+f*7,x0,fl[f],w,fl[f+1]-fl[f]);
 band(c,x0,fl[1]-3,w,WARM,3);band(c,x0,fl[2]-4,w,WARM,4);
 for(const [x,look] of [[22,'dark'],[66,'drawn'],[110,'blind']] as const)sash(c,x0+x,fl[0]+22,18,34,look,{cols:2,rows:2,rail:true,frame,tint:'#3d2c30',s:s+x},WARM);
 for(const [x,look] of [[20,'drawn'],[65,'dim'],[110,'dark']] as const){sash(c,x0+x,fl[1]+20,20,50,look,{cols:2,rows:3,rail:true,frame,tint:'#34303c',s:s+x+1},WARM,7);box(c,WARM[1],x0+x+8,fl[1]+11,4,9);box(c,WARM[2],x0+x+12,fl[1]+12,1,8);}
 // The shop: pledges behind an iron grille, the door, and his sign hung once over it.
 const wx=x0+16,wy=fl[2]+34,dx=x0+88;
 lintel(c,wx,wy,54,WARM,7);win(c,wx,wy,54,56,{look:'dim',cols:1,rows:1,frame:'#2a2019',s:5});
 box(c,'#2a2019',wx+2,wy+27,50,2);box(c,'#6b4a2e',wx+7,wy+12,5,9);box(c,'#6b4a2e',wx+9,wy+5,1,8);box(c,'#3a2c22',wx+8,wy+15,3,1);
 box(c,'#8a7446',wx+19,wy+11,2,16);box(c,'#8a7446',wx+17,wy+25,6,2);box(c,'#b9a25f',wx+18,wy+9,4,2);
 box(c,'#3a3f44',wx+29,wy+13,14,13);box(c,'#59636a',wx+29,wy+13,14,1);box(c,'#22282e',wx+31,wy+15,10,9);
 box(c,'#2a2019',wx+6,wy+36,9,12);box(c,'#2a2019',wx+6,wy+45,13,3);box(c,'#4a545b',wx+25,wy+38,10,10);box(c,'#6d7b80',wx+25,wy+38,10,1);for(let k=0;k<5;k++)box(c,gold[1],wx+40+k*2,wy+33+(k%2),1,1);
 for(let px=wx+4;px<wx+52;px+=6){box(c,IRON,px,wy+1,2,54);box(c,IRON_LIT,px,wy+1,1,54);}for(const py of [wy+14,wy+40])box(c,IRON,wx+1,py,52,2);
 sill(c,wx,wy+56,54,WARM,3,4);
 lintel(c,dx,h-62,24,WARM,6);door(c,dx,h-62,24,62,{tone:['#0f1113','#262b30','#373d43'],style:'panel',fan:'dim',fanH:10});step(c,dx,h,24,WARM);
 const bx=dx+12,by=fl[2]+13;
 disc(c,IRON,bx,by-9,2);box(c,IRON,bx,by-8,1,6);box(c,IRON,bx-9,by-3,19,2);box(c,IRON_LIT,bx-9,by-3,19,1);hoop(c,bx-6,by-6,3,IRON);hoop(c,bx+6,by-6,3,IRON);
 for(const [ox,oy] of [[-7,5],[7,5],[0,15]] as const){box(c,IRON,bx+ox,by-1,1,oy-3);disc(c,gold[0],bx+ox,by+oy,4);disc(c,gold[1],bx+ox-1,by+oy-1,3);box(c,gold[2],bx+ox-2,by+oy-3,2,2);}
 sash(c,x0+124,fl[2]+50,16,24,'dark',{cols:1,rows:1,frame:'#2a2019'},WARM,5);for(let px=x0+128;px<x0+139;px+=4)box(c,IRON,px,fl[2]+51,1,22);
 box(c,SOOT.shade,x0,h-7,w,7);
 // The oriel on the east corner: a lead-topped bay of two lights, carried on stone corbels stepped back to the wall.
 const ox=o.x,oy=o.y,ow=o.w,foot=oy+78;
 quoins(c,x0,fl[0],h,WARM);quoins(c,x0+w,fl[0],oy,WARM,true);quoins(c,x0+w,foot+30,h,WARM,true);
 box(c,INK,x0,fl[0],1,h-fl[0]);box(c,INK,x0+w-1,fl[0],1,h-fl[0]);
 box(c,INK,ox-1,oy+6,ow+2,foot-oy-6);box(c,WARM[0],ox,oy+6,ow,foot-oy-6);box(c,WARM[1],ox,oy+6,ow,1);box(c,WARM[2],ox+ow-1,oy+7,1,foot-oy-7);
 leadTop(c,ox-1,oy,ow+2,6,s+9);
 win(c,ox+5,oy+13,15,44,{look:'lit',cols:1,rows:3,frame,s:9});win(c,ox+24,oy+13,15,44,{look:'drawn',cols:1,rows:3,frame,tint:'#3d2c30',s:4});
 box(c,WARM[1],ox-1,oy+58,ow+2,2);box(c,WARM[2],ox-1,oy+60,ow+2,1);
 for(const px of [ox+4,ox+23]){box(c,WARM[2],px,oy+64,17,11);box(c,'#484339',px+1,oy+65,15,9);box(c,WARM[1],px+1,oy+74,15,1);}
 for(let k=0;k<4;k++){const cw=ow-k*11,y=foot+k*7;box(c,INK,ox,y,cw+1,8);box(c,WARM[0],ox,y,cw,7);box(c,WARM[1],ox,y,cw,1);box(c,WARM[2],ox,y+6,cw,1);}
}};

// ── The schoolhouse ─────────────────────────────────────────────────────────
const school:Building={paint(c,p){
 const po=part(p,'porch'),r=part(p,'roof'),s=6800,x0=r.x,w=r.w,h=p.h,top=r.y,eave=top+46,floor=top+190,ring=[PALE[0],'#6f787e',PALE[2]] as const,frame='#59636b';
 // Welsh slate between two coped gables; the ridge is the roof line.
 slope(c,x0,top,w,46,SLATE_PURPLE,s,6,10,PALE);
 for(const px of [x0,x0+w-7]){box(c,PALE[2],px,top,7,eave-top);box(c,PALE[0],px,top,6,eave-top);box(c,PALE[1],px,top,6,2);box(c,PALE[1],px,top,1,eave-top);for(let y=top+13;y<eave-4;y+=13)box(c,PALE[2],px,y,6,1);}
 for(const px of [x0-3,x0+w-7]){box(c,INK,px,eave-7,10,10);box(c,PALE[0],px,eave-7,10,9);box(c,PALE[1],px,eave-7,10,1);}
 wallAt(c,RED,s+1,x0,eave,w,floor-eave);wallAt(c,RED,s+2,x0,floor,w,h-floor-10);wallAt(c,GREY,s+3,x0,h-10,w,10);box(c,PALE[1],x0,h-11,w,1);
 band(c,x0,floor-4,w,PALE,4);
 // The schoolroom: three tall pointed lights between buttresses, each glazed as it was last mended.
 const looks=[['lead',2,6],['blind',2,5],['dark',3,6]] as const;
 for(let i=0;i<3;i++){const x=x0+24+i*72,y=eave+18,[look,cols,rows]=looks[i];archRing(c,x,y,28,'point',18,5,ring[0],ring[1],ring[2],s+i);win(c,x,y,28,104,{look,cols,rows,frame,arch:'point',rise:18,s:s+i*7});sill(c,x,y+104,28,PALE,3,4);}
 for(const bx of [x0+62,x0+134]){
  wallAt(c,RED,s+bx,bx,eave+10,10,floor-eave-10);wallAt(c,RED,s+bx+1,bx-2,floor,14,h-floor);shade(c,bx+1,eave+10,8,floor-eave-10,.07,'#fff');shade(c,bx+10,eave+10,4,floor-eave-10,.4);shade(c,bx-1,floor,12,h-floor,.07,'#fff');shade(c,bx+12,floor,4,h-floor,.4);box(c,RED.lip,bx,eave+10,1,floor-eave-10);box(c,INK,bx+9,eave+10,1,floor-eave-10);box(c,RED.lip,bx-2,floor,1,h-floor);box(c,INK,bx+11,floor,1,h-floor);
  for(const [y,over] of [[eave+4,0],[floor-6,2]] as const){box(c,PALE[0],bx-over,y,10+over*2,6);box(c,PALE[1],bx-over,y,10+over*2,1);box(c,PALE[2],bx-over,y+6,10+over*2,1);}
 }
 // Below: the infants' room and the cloakroom, each a mullioned window, and the tablet the school was given with.
 for(const [x,n,look] of [[18,2,'drawn'],[82,3,'dark'],[160,3,'dim']] as const){
  const lw=13,y=floor+26,wide=n*lw+(n+1)*3;surround(c,x0+x,y,wide,48,PALE,3);
  for(let k=0;k<n;k++)win(c,x0+x+3+k*(lw+3),y,lw,48,{look:k===1&&look==='dark'?'broken':look,cols:1,rows:3,frame,tint:'#2f3a36',s:s+x+k});
  sill(c,x0+x,y+48,wide,PALE,3,4);
 }
 quoins(c,x0+w,eave,h,PALE,true);box(c,INK,x0,eave,1,h-eave);box(c,INK,x0+w-1,eave,1,h-eave);pipe(c,x0+150,eave,h,s);
 // The porch on the west end: a slated lean-to against the gable, the school's one door under it.
 const px=po.x,py=po.y,pw=po.w;
 wallAt(c,RED,s+5,px,py+24,pw,112);wallAt(c,RED,s+6,px,py+136,pw,h-py-146);wallAt(c,GREY,s+7,px,h-10,pw,10);box(c,PALE[1],px,h-11,pw,1);
 box(c,'#141a21',px,py+3,pw,19);for(let k=0,y=py+4;y<py+20;y+=6,k++)for(let x=px-Math.floor(hash(s,k,9)*9),i=0;x<px+pw;x+=10,i++){const a=Math.max(px,x),b=Math.min(px+pw,x+10);if(b-a>1)box(c,SLATE_PURPLE[Math.floor(hash(s,k,i+2)*4)],a,y,b-a-1,5);}
 box(c,LEAD[0],px,py,pw,4);box(c,LEAD[1],px,py,pw,2);box(c,LEAD[2],px,py+4,pw,1);gutter(c,px-2,py+20,pw+2,s+1);
 arched(c,px+25,py+48,20,34,'lead','point',12,ring,{cols:2,rows:3,frame,s:11},PALE);
 band(c,px,py+132,pw,PALE,4);
 const dx=px+19,dy=h-76;archRing(c,dx,dy,32,'point',20,6,ring[0],ring[1],ring[2],s+8);
 door(c,dx,dy,32,76,{tone:['#14100c','#3a2b20','#4c3a2a'],style:'pair',arch:'point',rise:20,knob:'#59666b'});step(c,dx,h,32,PALE,4,4);
 box(c,IRON,dx+38,h-9,2,9);box(c,IRON,dx+38,h-9,9,1);box(c,IRON,dx+45,h-9,2,9);
 quoins(c,px,py+24,h,PALE);box(c,INK,px,py+24,1,h-py-24);
}};

// ── The burnt house ─────────────────────────────────────────────────────────
const CHAR='#17110e',CHAR_LIT='#43362d',ASH='#8f8a80';
/** What is left of a room's plaster and its paper, ragged where it has fallen. */
function plaster(c:C,x:number,y:number,w:number,h:number,ground:string,stripe:string,s:number,gap=5){
 for(let py=y;py<y+h;py+=4){const a=Math.floor(hash(s,py,1)*9),b=Math.floor(hash(s,py,2)*9);box(c,ground,x+a,py,w-a-b,Math.min(4,y+h-py));}
 for(let px=x+10;px<x+w-10;px+=gap)box(c,stripe,px,y+1,1,h-2);
 for(let i=0;i<Math.max(1,w*h/900);i++){const bw=5+Math.floor(hash(s,i,3)*9);box(c,'#00000050',x+8+Math.floor(hash(s,i,4)*Math.max(1,w-20-bw)),y+2+Math.floor(hash(s,i,5)*Math.max(1,h-10)),bw,3+Math.floor(hash(s,i,6)*4));}
}
/** A charred timber, cracked across as burnt wood cracks. */
function charred(c:C,x0:number,y0:number,x1:number,y1:number,th:number,s:number){
 stroke(c,CHAR,x0,y0,x1,y1,th);stroke(c,CHAR_LIT,x0,y0,x1,y1,1);
 const n=Math.max(2,Math.round(Math.hypot(x1-x0,y1-y0)/9));for(let i=1;i<n;i++)if(hash(s,i,7)>.35)box(c,'#0a0706',Math.round(x0+(x1-x0)*i/n),Math.round(y0+(y1-y0)*i/n),1,th);
}
const burnt:Building={
 paint(c,p){
  const wl=part(p,'west'),jo=part(p,'joists'),la=part(p,'landing'),br=part(p,'breast'),ea=part(p,'east'),s=7180,h=p.h;
  const x0=wl.x+wl.w,x1=ea.x,f2=jo.y+jo.h,f1=Math.round((jo.y+h)/2),head=Math.min(wl.y,ea.y)+18,span=x1-x0;
  // The back wall, seen through the fallen front: laid to each floor, its plaster and paper hanging on where the fire left them.
  wallAt(c,SOOT,s+1,x0,head,span,f2-head);wallAt(c,SOOT,s+2,x0,f2,span,f1-f2);wallAt(c,SOOT,s+3,x0,f1,span,h-f1);
  plaster(c,x0+4,jo.y-26,58,24,'#3a424b','#465059',s+4);plaster(c,x0+150,jo.y-14,44,12,'#3a424b','#465059',s+5);
  plaster(c,x0+2,f2+10,70,f1-f2-22,'#3d463f','#4c5a4e',s+6);plaster(c,x0+212,f2+44,52,f1-f2-54,'#3d463f','#4c5a4e',s+7);box(c,'#2a2623',x0,f2+22,span,2);
  plaster(c,x0+6,f1+12,92,h-f1-44,'#473937','#58403c',s+8,7);plaster(c,x0+150,f1+20,108,42,'#473937','#58403c',s+9,7);box(c,'#2c2422',x0,h-52,span,3);
  shade(c,x0,head,span,h-head,.32);
  // Where the floors were let into it: a row of joist pockets at each, some with the burnt end still in them.
  for(const y of [jo.y+3,f1-3])for(let px=x0+7,i=0;px<x1-8;px+=15,i++){box(c,'#06080b',px,y,5,7);if(hash(s,i,y)>.55){box(c,CHAR,px,y+1,5,6);box(c,CHAR_LIT,px,y+1,5,1);}}
  // The windows of the back rooms, burnt out: the night shows through them.
  const lights=[[84,f2+26,24,46],[44,f1+30,26,38],[104,h-62,24,62]] as const;
  for(const [x,y,ww,wh] of lights){stain(c,'#000',x-4,y-5,ww+8,18,s+x,.4,true);box(c,CHAR,x-3,y-6,ww+6,6);box(c,CHAR_LIT,x-3,y-6,ww+6,1);box(c,'#05070a',x-1,y,ww+2,wh);c.clearRect(x,y,ww,wh);box(c,'#2c3136',x-2,y+wh,ww+4,3);}
  box(c,CHAR,96,f2+26,2,46);box(c,CHAR,84,f2+50,12,2);
  // Its head came down with the roof: a ragged line, lower where the top windows were.
  const line=[[x0,wl.y+14],[x0+34,jo.y-32],[x0+70,jo.y-38],[x0+120,jo.y-18],[x0+166,jo.y-30],[x0+204,jo.y-10],[x0+262,br.y-12],[x0+300,br.y-22],[x1,ea.y+24]];
  for(let px=x0,k=0;px<x1;px+=4,k++){
   let i=0;while(i<line.length-2&&px>=line[i+1][0])i++;
   const [ax,ay]=line[i],[bx,by]=line[i+1],y=Math.round((ay+(by-ay)*(px-ax)/(bx-ax))/8)*8+Math.floor(hash(s,k,13)*3)*4-4;
   c.clearRect(px,-PAD,4,y+PAD);box(c,'#0a0c0f',px,y,4,2);
  }
  for(const [x,ww,y,deep] of [[140,26,jo.y-14,10],[la.x+26,22,la.y-14,34]] as const){c.clearRect(x,-PAD,ww,y+PAD);box(c,'#2c3136',x-2,y,ww+4,3);box(c,'#05070a',x-1,y-deep,1,deep);box(c,'#05070a',x+ww,y-deep,1,deep);}
  // A beam fallen from the first floor, and the ghost of a dresser on the kitchen wall.
  charred(c,x0+96,f1+2,x0+132,h-4,5,s+1);charred(c,x0+262,f1-1,x0+236,h-6,4,s+2);
  // The stair: its half-landing still on its newels, the strings zig-zagging down to the lane, treads burnt off most of them.
  const lx=la.x,ly=la.y,lw=la.w,turn=lx-50,low=Math.round((f1+h)/2);
  for(const [ax,ay,bx,by] of [[lx,ly+6,turn,f1],[turn,f1,lx,low],[lx,low,turn,h-2]] as const){
   charred(c,ax,ay,bx,by,4,s+ay);charred(c,ax,ay+9,bx,by+9,2,s+by);
   for(let k=1;k<9;k++)if(hash(s,k,ay)>.28){const tx=Math.round(ax+(bx-ax)*k/9),ty=Math.round(ay+(by-ay)*k/9);box(c,CHAR,tx-4,ty-1,9,2);box(c,CHAR_LIT,tx-4,ty-1,9,1);}
  }
  charred(c,lx+lw,ly+4,lx+lw+15,ly-18,3,s+3);
  for(const [nx,top] of [[lx+1,ly+8],[lx+lw-7,ly+8],[turn-3,f1-34]] as const){box(c,CHAR,nx,top,6,h-top);box(c,CHAR_LIT,nx,top,1,h-top);for(let y=top+9;y<h-6;y+=11+Math.floor(hash(s,y,nx)*9))box(c,'#0a0706',nx,y,6,1);}
  box(c,CHAR,turn-5,f1-37,10,4);box(c,CHAR,lx-2,low,lw*.4,4);box(c,CHAR_LIT,lx-2,low,lw*.4,1);
  box(c,'#0a0706',lx-1,ly+7,lw+2,6);box(c,CHAR,lx,ly,lw,8);box(c,'#3b2c23',lx,ly+2,lw,3);box(c,ASH,lx,ly,lw,2);
  for(let px=lx+9;px<lx+lw-3;px+=10+Math.floor(hash(s,px,5)*6))box(c,'#0a0706',px,ly+2,1,6);box(c,'#5d564e',lx+Math.round(lw*.6),ly,7,2);
  // What still carries the joists: two studs of the burnt partition under a head beam.
  for(const sx of [jo.x+8,jo.x+jo.w-14]){box(c,CHAR,sx,f2,5,h-f2);box(c,CHAR_LIT,sx,f2,1,h-f2);for(let y=f2+12;y<h-6;y+=13+Math.floor(hash(s,y,sx)*8))box(c,'#0a0706',sx,y,5,1);}
  charred(c,jo.x+13,f2+26,jo.x+34,f2+5,3,s+4);charred(c,jo.x+jo.w-14,f2+26,jo.x+jo.w-36,f2+5,3,s+5);
  box(c,'#0a0706',jo.x-3,f2,jo.w+6,6);box(c,CHAR,jo.x-3,f2,jo.w+6,5);box(c,CHAR_LIT,jo.x-3,f2,jo.w+6,1);
  // The chimney breast: three grates one over another, each with the soot it put up the wall, corbelled out at its head.
  const bx=br.x,by=br.y,bw=br.w;
  for(const [y0,y1,k] of [[by+9,f2,0],[f2,f1,1],[f1,h,2]] as const)wallAt(c,RED,s+30+k,bx+3,y0,bw-6,y1-y0);
  shade(c,bx+3,by+9,bw-6,h-by-9,.2,'#000');box(c,RED.lip,bx+3,by+9,1,h-by-9);box(c,INK,bx+bw-4,by+9,1,h-by-9);box(c,INK,bx+2,by+9,1,h-by-9);
  for(let k=0;k<3;k++){const o=2-k;box(c,RED.mortar,bx+o,by+k*3,bw-o*2,3);box(c,RED.stones[k],bx+o,by+k*3,bw-o*2,2);}
  box(c,'#6c7378',bx,by,bw,3);box(c,'#9aa2a4',bx,by,bw,2);
  const grate=(y:number,gw:number,gh:number,mantel:string,lit:string)=>{
   const gx=bx+Math.round((bw-gw)/2);stain(c,'#000',gx-5,y-gh-5,gw+10,20,s+y,.5,true);
   box(c,INK,gx-1,y-gh-1,gw+2,gh+1);box(c,'#060708',gx,y-gh,gw,gh);box(c,'#1c1e20',gx+2,y-Math.round(gh*.45),gw-4,Math.round(gh*.45)-1);for(let k=gx+3;k<gx+gw-3;k+=3)box(c,'#33383c',k,y-Math.round(gh*.45),1,Math.round(gh*.45)-2);
   box(c,INK,gx-6,y-gh-6,gw+12,5);box(c,mantel,gx-5,y-gh-6,gw+10,4);box(c,lit,gx-5,y-gh-6,gw+10,1);box(c,mantel,gx-4,y-gh-2,3,gh+2);box(c,mantel,gx+gw+1,y-gh-2,3,gh+2);
  };
  grate(f2-2,16,15,'#3a3f44','#5d666c');grate(f1-4,24,30,'#4a4a48','#73736c');grate(h-6,30,36,'#2a2019','#4a3a2c');
  box(c,'#1c1e20',bx+13,h-28,28,22);box(c,'#3a4046',bx+13,h-28,28,1);box(c,'#0a0b0c',bx+16,h-24,9,10);box(c,'#4a545b',bx+22,h-20,2,2);
  // The party walls stand: brick to each floor, sooted, toothed where the front wall was bonded in.
  const party=(l:Ledge,seed:number,inner:number)=>{
   for(const [y0,y1,k] of [[l.y,f2,0],[f2,f1,1],[f1,h,2]] as const)wallAt(c,PLUM,seed+k,l.x,y0,l.w,y1-y0);
   shade(c,l.x,l.y,l.w,60,.3,'#000');stain(c,'#000',l.x,l.y+60,l.w,70,seed,.5);
   for(let ty=l.y+18,k=0;ty<h-10;ty+=7,k++)if(k%2===0||hash(seed,k,3)>.72){const tw=2+Math.floor(hash(seed,k,4)*4),tx=inner>0?l.x+l.w:l.x-tw;box(c,PLUM.mortar,tx,ty,tw,7);box(c,PLUM.stones[k%4],tx,ty,tw,6);}
   box(c,INK,l.x,l.y,1,h-l.y);box(c,INK,l.x+l.w-1,l.y,1,h-l.y);box(c,PLUM.lip,inner>0?l.x+1:l.x+l.w-2,l.y,1,h-l.y);
   box(c,'#5a4a50',l.x,l.y,l.w,4);box(c,'#93878a',l.x,l.y,l.w,2);for(let px=l.x+5+Math.floor(hash(seed,0,5)*5);px<l.x+l.w-3;px+=9+Math.floor(hash(seed,px,6)*5))box(c,PLUM.mortar,px,l.y+2,1,2);
  };
  party(wl,s+40,1);party(ea,s+50,-1);
  // The foot of the front wall, down to a few courses: the doorway's two jambs, a sill, the rest in the lane.
  const stub=(x:number)=>{const d=Math.min(x-x0,x1-x)/26;return h-(d<1?Math.round((48-34*d)/7)*7:14)-Math.floor(hash(s,x>>3,17)*3)*7;};
  for(let px=x0;px<x1;px+=8){const y=stub(px),ww=Math.min(8,x1-px);if(px>=258&&px<288)continue;wallAt(c,PLUM,s+60+px,px,y,ww,h-y);box(c,'#4a3d44',px,y,ww,1);}
  for(const jx of [250,288]){wallAt(c,PLUM,s+70+jx,jx,h-52,8,52);box(c,PLUM.lip,jx,h-52,1,52);box(c,INK,jx+7,h-52,1,52);box(c,'#4a3d44',jx,h-52,8,1);}
  box(c,CHAR,258,h-50,3,50);box(c,CHAR,285,h-44,3,44);box(c,COOL[0],256,h-3,34,3);box(c,COOL[1],256,h-3,34,1);
  box(c,COOL[0],x0+52,stub(x0+56)-3,36,3);box(c,COOL[1],x0+52,stub(x0+56)-3,36,1);
  for(let i=0;i<26;i++){const px=x0+10+Math.floor(hash(s,i,21)*(span-24)),tall=2+Math.floor(hash(s,i,22)*5);box(c,i%3?'#2a2227':CHAR,px,h-tall,5+Math.floor(hash(s,i,23)*5),tall);}
 },
 // The joists: one charred length of floor, a few boards left on it, burnt half through from below.
 deck(c,_part,w,h){
  box(c,CHAR,0,2,w,h-4);box(c,'#2a1f19',0,3,w,3);
  for(let x=0,i=0;x<w;i++){const bw=Math.min(w-x,7+Math.floor(hash(i,7,29)*8)),v=hash(i,3,29);if(v>.2){box(c,v>.6?'#4a3d33':'#3b3029',x,0,bw-1,3);box(c,ASH,x,0,bw-1,1);box(c,'#6e665e',x,1,bw-1,1);}else box(c,'#3b2c23',x,2,bw,1);x+=bw;}
  for(let x=4,i=0;x<w-3;i++){box(c,'#0a0706',x,3,1,h-5);x+=5+Math.floor(hash(i,5,31)*9);}
  for(let x=0,i=0;x<w;i++){const nw=Math.min(w-x,4+Math.floor(hash(i,9,33)*7)),d=Math.floor(hash(i,11,33)*4);box(c,CHAR,x,h-2,nw,d>1?2:1);if(d===0)c.clearRect(x,h-4,nw,4);x+=nw;}
  for(let i=0;i<9;i++)box(c,'#5d564e',3+Math.floor(hash(i,13,35)*(w-6)),4+Math.floor(hash(i,15,35)*4),2,1);
 },
};

// ── The market hall ─────────────────────────────────────────────────────────
const market:Building={paint(c,p){
 const a=part(p,'roof',0),b=part(p,'roof',1),la=part(p,'lantern'),s=7672,w=p.w,h=p.h,top=a.y,eave=top+30,arc=h-112,bay=w/5,stone=WARM;
 // Lead to the ridge either side of the lantern, on a stone cornice.
 leadSlope(c,0,top,w,30,s);for(const r of [a,b])box(c,LEAD[1],r.x,r.y,r.w,2);
 cornice(c,0,eave,w,stone,'#3b372f',9);
 // The hall over the arcade: a tall light to each bay but the middle one, which has the date the hall was built.
 wallAt(c,SAND,s+1,0,eave+9,w,arc-eave-15);
 for(let i=0;i<=5;i++){const px=Math.round(i*bay)-(i===0?0:i===5?9:5),pw=i===0||i===5?9:10;wallAt(c,SAND,s+10+i,px,eave+9,pw,arc-eave-15);box(c,SAND.lip,px,eave+9,1,arc-eave-15);box(c,SAND.mortar,px+pw-1,eave+9,1,arc-eave-15);box(c,stone[0],px-1,eave+9,pw+2,5);box(c,stone[1],px-1,eave+9,pw+2,1);}
 const looks=[['dark',2,5],['drawn',2,4],null,['dark',3,5],['broken',2,5]] as const;
 for(let i=0;i<5;i++){const k=looks[i],cx=Math.round((i+.5)*bay);if(!k)continue;arched(c,cx-13,eave+26,26,58,k[0],'round',0,[stone[0],'#615b4e',stone[2]],{cols:k[1],rows:k[2],frame:'#4f4a42',tint:'#3a3629',s:s+i},stone);}
 const mx=Math.round(w/2);box(c,INK,mx-25,eave+30,50,24);box(c,stone[0],mx-24,eave+31,48,22);box(c,stone[1],mx-24,eave+31,48,1);box(c,'#3b372f',mx-21,eave+34,42,16);write(c,'1791',mx-14,eave+38,'#6d6656',2);write(c,'1791',mx-15,eave+37,'#15120e',2);
 disc(c,INK,mx,eave+72,11);disc(c,stone[0],mx,eave+72,10);disc(c,'#111a24',mx,eave+72,7);box(c,'#4f4a42',mx,eave+65,1,15);box(c,'#4f4a42',mx-7,eave+72,15,1);box(c,'#1c2c3e',mx-5,eave+68,4,3);
 band(c,-2,arc-6,w+4,stone,6);
 // The arcade: five round arches on stone piers, the market floor dark behind them, each stall as its holder left it.
 wallAt(c,SAND,s+2,0,arc,w,h-arc);
 for(let i=0;i<5;i++){
  const ax=Math.round(i*bay)+11,aw=Math.round(bay)-22,ay=arc+12,foot=h;
  archRing(c,ax,ay,aw,'round',0,7,stone[0],'#615b4e',stone[2],s+i);box(c,stone[1],ax+Math.round(aw/2)-3,ay-10,6,10);box(c,stone[2],ax+Math.round(aw/2)+3,ay-9,1,9);
  c.save();shape(c,ax,ay,aw,foot-ay,'round',0);c.clip();box(c,'#07090c',ax,ay,aw,foot-ay);box(c,'#0d1218',ax,foot-5,aw,5);
  if(i===0){box(c,'#2a2019',ax+8,foot-30,46,3);box(c,'#3a2d22',ax+8,foot-30,46,1);for(const lx of [ax+11,ax+49]){stroke(c,'#1f1812',lx,foot-27,lx-4,foot,2);stroke(c,'#1f1812',lx,foot-27,lx+4,foot,2);}
   for(const [bx,bw2] of [[12,12],[27,10],[40,13]] as const){box(c,'#33291f',ax+bx,foot-39,bw2,9);box(c,'#4a3a2c',ax+bx,foot-39,bw2,1);for(let k=1;k<bw2;k+=3)box(c,'#1f1812',ax+bx+k,foot-38,1,8);}
   box(c,IRON,ax+33,ay+6,1,26);box(c,IRON,ax+30,ay+32,7,9);box(c,'#1c2830',ax+31,ay+33,5,7);}
  else if(i===1){box(c,'#1c2228',ax+6,foot-58,54,58);for(let k=0;k<54;k+=9)box(c,k%18?'#2b3540':'#3d2c30',ax+6+k,foot-58,9,12);box(c,'#12171c',ax+6,foot-46,54,2);planks(c,BOARD_PITCH,'#0b0e11',s+3,ax+8,foot-44,50,44,6,9);box(c,IRON,ax+30,foot-26,6,5);box(c,'#59666b',ax+32,foot-24,2,2);}
  else if(i===2){c.fillStyle='#16202c';shape(c,ax+16,ay+26,aw-32,foot-ay-26,'round',0);c.fill();box(c,'#1c2a38',ax+18,foot-8,aw-36,3);box(c,'#0a0d11',ax+32,foot-24,5,24);box(c,'#0a0d11',ax+26,foot-26,17,3);
   box(c,IRON,ax+35,ay+6,1,18);box(c,IRON,ax+31,ay+24,9,3);stroke(c,IRON,ax+31,ay+27,ax+27,ay+38,1);stroke(c,IRON,ax+39,ay+27,ax+43,ay+38,1);box(c,'#8a7446',ax+23,ay+38,9,2);box(c,'#8a7446',ax+39,ay+38,9,2);}
  else if(i===3){box(c,IRON,ax+6,foot-70,58,2);box(c,IRON_LIT,ax+6,foot-70,58,1);for(const [hx,drop] of [[12,5],[22,5],[31,5],[41,5],[52,5]] as const){box(c,'#3d4950',ax+hx,foot-68,1,drop);box(c,'#3d4950',ax+hx,foot-68+drop,3,1);}
   box(c,'#4a3329',ax+20,foot-62,5,16);box(c,'#63463c',ax+21,foot-62,2,14);box(c,'#3a2d22',ax+10,foot-28,50,4);box(c,'#5a4731',ax+10,foot-28,50,1);box(c,'#1f1812',ax+13,foot-24,4,24);box(c,'#1f1812',ax+53,foot-24,4,24);box(c,'#59636a',ax+38,foot-33,10,5);}
  else{for(const [bx,by,bw2,bh] of [[8,22,20,22],[30,18,18,18],[12,40,16,18],[32,34,14,16]] as const){box(c,'#17110d',ax+bx,foot-by,bw2,bh);box(c,'#3a2f24',ax+bx+1,foot-by+1,bw2-2,bh-1);for(let k=3;k<bh;k+=3)box(c,'#2a2019',ax+bx+1,foot-by+k,bw2-2,1);box(c,'#5a4731',ax+bx,foot-by,bw2,1);}
   hoop(c,ax+56,foot-12,11,'#3a2d22');hoop(c,ax+56,foot-12,10,'#1f1812');for(let k=0;k<4;k++){const t=k*Math.PI/4;stroke(c,'#2a2019',Math.round(ax+56-Math.cos(t)*10),Math.round(foot-12-Math.sin(t)*10),Math.round(ax+56+Math.cos(t)*10),Math.round(foot-12+Math.sin(t)*10),1);}}
  c.restore();
 }
 for(let i=0;i<=5;i++){const px=Math.round(i*bay)-(i===0?0:11),pw=i===0||i===5?11:22,y=arc+47;if(i===5)continue;box(c,INK,px-1,y-1,pw+2,7);box(c,stone[0],px-1,y,pw+2,6);box(c,stone[1],px-1,y,pw+2,1);box(c,stone[0],px-1,h-8,pw+2,8);box(c,stone[1],px-1,h-8,pw+2,1);}
 {const px=w-11,y=arc+47;box(c,INK,px-1,y-1,13,7);box(c,stone[0],px-1,y,12,6);box(c,stone[1],px-1,y,12,1);box(c,stone[0],px-1,h-8,12,8);box(c,stone[1],px-1,h-8,12,1);}
 sides(c,0,w,eave+9,h,SAND.lip);
 // The lantern on the ridge: a glazed timber frame under a lead cap, each light glazed on its own.
 const lx=la.x,ly=la.y,lw=la.w,lh=la.h;
 box(c,INK,lx,ly+6,lw,lh-6);box(c,TIMBER[0],lx+1,ly+6,lw-2,lh-6);box(c,TIMBER[1],lx+1,ly+9,1,lh-9);
 leadTop(c,lx-1,ly,lw+2,6,s+7);box(c,TIMBER[2],lx,ly+6,lw,3);box(c,TIMBER[1],lx,ly+9,lw,1);
 const panes=['dark','dark','broken','lead','dark'] as const;
 for(let i=0;i<5;i++)win(c,lx+4+i*16,ly+13,12,29,{look:panes[i],cols:i===3?1:2,rows:i===1?2:3,frame:'#4a3a2c',s:s+i*11});
 planks(c,BOARD_BROWN,'#17110d',s+8,lx+2,ly+44,lw-4,lh-48,5,8);box(c,TIMBER[1],lx+1,ly+43,lw-2,1);
 box(c,LEAD[0],lx,ly+lh-4,lw,5);box(c,LEAD[1],lx,ly+lh-4,lw,1);box(c,LEAD[2],lx,ly+lh,lw,1);
}};

// ── The coaching inn ────────────────────────────────────────────────────────
const inn:Building={above:110,paint(c,p){
 const lo=part(p,'lower'),up=part(p,'upper'),s=8202,w=p.w,h=p.h,xj=up.x-12,coat:Tri=['#45423b','#504c44','#383530'],dim:Tri=['#2b2a27','#33322e','#232220'],frame='#4f4a42';
 /** One range's gallery: the rooms behind it, the roof over it, and the floor it stands on. `y` is the top of its rail. */
 const range=(x0:number,x1:number,y:number,seed:number)=>{
  tiled(c,x0,y-106,x1-x0,48,seed);
  renderAt(c,dim,seed+1,x0,y-58,x1-x0,92);
  for(let px=x0+9,i=0;px<x1-4;i++){box(c,'#191613',px,y-58,3,92);px+=17+Math.floor(hash(seed,i,3)*11);}
  box(c,WOOD[0],x0,y-60,x1-x0,5);box(c,WOOD[1],x0,y-60,x1-x0,1);
 };
 const front=(x0:number,x1:number,rx0:number,rx1:number,y:number,posts:readonly number[])=>{
  // The gallery floor on its joist ends, turned balusters up to the rail, posts from the lane to the eaves.
  box(c,INK,x0-2,y+32,x1-x0+4,11);box(c,WOOD[1],x0-2,y+33,x1-x0+4,8);box(c,WOOD[2],x0-2,y+33,x1-x0+4,1);box(c,WOOD[0],x0-2,y+39,x1-x0+4,2);
  for(let px=x0+4;px<x1-6;px+=11)box(c,WOOD[0],px,y+43,5,3);
  for(let px=rx0+3;px<rx1-2;px+=5){box(c,WOOD[1],px,y+8,2,25);box(c,WOOD[2],px,y+8,1,25);box(c,WOOD[1],px-1,y+18,4,4);}
  for(const px of posts){box(c,INK,px-1,y-56,7,h-y+56);box(c,WOOD[1],px,y-56,5,h-y+56);box(c,WOOD[2],px,y-56,1,h-y+56);if(px+15<x1){stroke(c,WOOD[0],px+6,y-45,px+14,y-55,2);stroke(c,WOOD[0],px+6,y+56,px+15,y+44,2);}if(px-11>x0){stroke(c,WOOD[0],px-2,y-45,px-10,y-55,2);stroke(c,WOOD[0],px-2,y+56,px-11,y+44,2);}box(c,COOL[0],px-2,h-4,9,4);box(c,COOL[1],px-2,h-4,9,1);}
  box(c,INK,rx0-1,y,rx1-rx0+2,9);box(c,WOOD[1],rx0-1,y,rx1-rx0+2,8);box(c,'#4a3a2c',rx0-1,y+2,rx1-rx0+2,3);box(c,'#93745a',rx0-1,y,rx1-rx0+2,2);
 };
 const dormer=(x:number,base:number,look:Look,seed:number)=>{
  box(c,INK,x-1,base-22,24,22);box(c,coat[0],x,base-22,22,22);box(c,coat[1],x,base-22,1,22);
  for(let k=0;k<10;k++){const half=2+Math.round(k*1.3);box(c,'#170f0d',x+11-half-1,base-34+k,half*2+2,2);box(c,TILE[(k+seed)%4],x+11-half,base-34+k,half*2,1);}
  box(c,CLAY[1],x+9,base-35,4,1);win(c,x+5,base-19,12,15,{look,cols:2,rows:2,frame,tint:'#3d2c30',s:seed});box(c,WOOD[1],x+3,base-4,16,2);
 };
 const yl=lo.y,yu=up.y;
 range(0,xj,yl,s);range(xj,w,yu,s+20);
 box(c,INK,xj-1,yu-106,1,yl-yu);box(c,CLAY[0],xj,yu-101,3,43);box(c,CLAY[1],xj,yu-101,1,43);
 dormer(38,yl-63,'dim',s);dormer(138,yl-63,'dark',s+1);dormer(xj+34,yu-63,'drawn',s+2);dormer(xj+124,yu-63,'shut',s+3);
 // The rooms open onto the galleries: each door and window as its guest left it.
 const room=(x:number,y:number,kind:'door'|'win',look:Look,seed:number)=>{
  if(kind==='door')door(c,x,y-12,18,46,{tone:seed%2?['#14100c','#33291f','#463829']:['#101713','#213a2e','#2d4c3c'],style:'plank',knob:'#8a7446',straps:seed%3===0});
  else{win(c,x,y-4,18,22,{look,cols:2,rows:2,frame,tint:'#3a3629',s:seed});box(c,WOOD[1],x-1,y+18,20,2);}
 };
 for(const [x,kind,look] of [[16,'door','dark'],[44,'win','drawn'],[78,'win','lit'],[116,'door','dark'],[148,'win','dark'],[180,'win','blind']] as const)room(x,yl,kind,look,s+x);
 for(const [x,kind,look] of [[20,'win','dark'],[52,'door','dark'],[88,'win','dim'],[118,'win','drawn'],[150,'door','dark']] as const)room(xj+x,yu,kind,look,s+x+7);
 // Under the galleries: the west range's lofts and tap room, the east range's chambers over its stables.
 const gw=yl+43,ge=yu+43,low=gw+46,stab=ge+92;
 renderAt(c,coat,s+5,0,gw,xj,low-gw);wallAt(c,OCHRE,s+6,0,low+4,xj,h-low-4);box(c,WOOD[0],0,low,xj,5);box(c,WOOD[1],0,low,xj,1);
 renderAt(c,coat,s+7,xj,ge,w-xj,stab-ge);wallAt(c,OCHRE,s+8,xj,stab+4,w-xj,h-stab-4);box(c,WOOD[0],xj,stab,w-xj,5);box(c,WOOD[1],xj,stab,w-xj,1);
 box(c,INK,xj-1,ge,1,gw-ge);
 for(const [x,look] of [[14,'shut'],[88,'dark'],[160,'drawn']] as const){win(c,x,gw+15,16,20,{look,cols:2,rows:2,frame,tint:look==='shut'?'#2a3a36':'#3d2c30',s:s+x});box(c,WOOD[1],x-1,gw+35,18,2);}
 for(const [x,look] of [[22,'drawn'],[64,'dark'],[110,'lit'],[152,'blind']] as const){win(c,xj+x,ge+26,18,40,{look,cols:2,rows:3,frame,tint:'#3a3629',s:s+x+3});box(c,WOOD[1],xj+x-2,ge+66,22,3);box(c,WOOD[1],xj+x-2,ge+22,22,3);}
 // The carriage arch through to the yard, a lamp alight somewhere at the back of it; the tap room's window; the house door.
 const ax=124,aw=58,ay=h-98;
 archRing(c,ax,ay,aw,'seg',12,7,COOL[0],'#414a52',COOL[2],s+9);c.fillStyle='#07090c';shape(c,ax,ay,aw,h-ay,'seg',12);c.fill();
 box(c,'#10161d',ax+14,h-52,30,46);box(c,'#161d26',ax+14,h-8,30,2);box(c,'#0d1218',ax+3,h-4,aw-6,4);box(c,'#8f6233',ax+33,h-40,4,6);box(c,'#f3c77a',ax+34,h-38,2,3);shade(c,ax+28,h-46,14,18,.14,'#f3c77a');
 for(const px of [ax-5,ax+aw]){box(c,COOL[0],px,h-16,5,16);box(c,COOL[1],px,h-16,5,1);}
 sash(c,26,h-84,36,48,'leadlit',{cols:3,rows:1,frame,s:2},WARM);
 lintel(c,82,h-60,22,WARM,6);door(c,82,h-60,22,60,{tone:['#170f0e','#3e231f','#53302a'],style:'panel',fan:'lit',fanH:10});step(c,82,h,22,WARM);
 sash(c,194,h-74,16,30,'dark',{cols:2,rows:2,frame},WARM,5);
 // The stables: two half-doors, one with its top leaf open, a hay rack between, the mounting block.
 for(const [x,open] of [[26,true],[106,false]] as const){
  const dx=xj+x,dy=h-66;soldiers(c,dx-2,dy-8,34,8,OCHRE.lip,OCHRE.stones[0],OCHRE.mortar,s+x);door(c,dx,dy,30,66,{tone:['#15110e','#33291f','#463829'],style:'plank',knob:''});
  if(open){box(c,'#06080b',dx+2,dy+3,26,28);box(c,'#33291f',dx+2,dy+31,26,2);box(c,'#2a2019',dx+10,dy+13,9,18);box(c,'#3a2d22',dx+12,dy+9,8,8);box(c,'#3a2d22',dx+19,dy+12,4,4);}
  else{box(c,INK,dx+1,dy+31,28,1);box(c,IRON,dx+13,dy+27,5,3);}
 }
 box(c,IRON,xj+68,h-56,28,1);for(let px=xj+69;px<xj+96;px+=3)stroke(c,IRON,px,h-56,xj+82,h-40,1);for(let i=0;i<8;i++)box(c,i%2?'#8a7a4c':'#6f6238',xj+71+i*3,h-58-(i*5)%4,2,4);
 box(c,COOL[0],xj+146,h-12,26,12);box(c,COOL[1],xj+146,h-12,26,1);box(c,COOL[0],xj+158,h-24,14,12);box(c,COOL[1],xj+158,h-24,14,1);
 barrel(c,6,h-28,18,28,'#3a2f24');
 // The stair between the galleries: two strings and their treads up the end of the east range.
 const sx0=lo.x+lo.w-26,sy0=yl+33,sx1=up.x+10,sy1=yu+33;
 stroke(c,INK,sx0,sy0+3,sx1,sy1+3,5);stroke(c,WOOD[1],sx0,sy0,sx1,sy1,3);stroke(c,WOOD[2],sx0,sy0-1,sx1,sy1-1,1);
 for(let k=1;k<9;k++){const tx=Math.round(sx0+(sx1-sx0)*k/9),ty=Math.round(sy0+(sy1-sy0)*k/9);box(c,WOOD[0],tx-1,ty+1,8,2);box(c,WOOD[2],tx-1,ty,8,1);}
 stroke(c,WOOD[1],sx0,sy0-22,sx1,sy1-22,2);for(const f of [0,.5,1]){const tx=Math.round(sx0+(sx1-sx0)*f),ty=Math.round(sy0+(sy1-sy0)*f);box(c,WOOD[1],tx,ty-22,2,22);}
 front(0,xj,lo.x,lo.x+lo.w,yl,[3,54,112,186]);front(xj,w,up.x,up.x+up.w,yu,[xj+3,xj+56,xj+98,xj+142,w-7]);
 // The inn's one sign, hung on chains from the gallery: a gilt bell on a green board.
 const bx=59,by=gw+8;
 for(const px of [bx-9,bx+8]){box(c,IRON,px,gw+3,1,6);box(c,IRON_LIT,px,gw+5,1,1);}
 box(c,INK,bx-13,by,26,31);box(c,'#8a7446',bx-12,by+1,24,29);box(c,'#1b2925',bx-11,by+2,22,27);
 for(let k=0;k<12;k++){const half=k<2?1:k<5?3:k<9?4:k<11?5:7;box(c,'#b08d3c',bx-half,by+7+k,half*2,1);box(c,'#e0c070',bx-half,by+7+k,Math.max(1,half>>1),1);}
 box(c,'#b08d3c',bx-1,by+5,2,2);box(c,'#6e5624',bx-7,by+18,14,1);box(c,'#6e5624',bx-1,by+19,2,3);
 sides(c,0,w,gw,h,coat[1]);
}};

// ── The smithy ──────────────────────────────────────────────────────────────
const smithy:Building={paint(c,p){
 const r=part(p,'roof'),s=8678,x0=r.x,w=r.w,h=p.h,top=r.y,eave=top+30,dx=x0+36,dw=90,dy=h-102,fire=['#b5562a','#c8913f','#f3c77a','#fff0c4'] as const;
 slope(c,x0,top,w,30,STONE_SLATE,s,5,9,WARM,.5);
 for(const v of p.vents)ventSeat(c,v,LEAD);
 wallAt(c,RUBBLE,s+1,x0,eave,w,h-eave);
 // The forge doors stand open: the hearth alight under its hood, the anvil on its block in the doorway.
 archRing(c,dx,dy,dw,'seg',10,8,COOL[0],'#414a52',COOL[2],s+2);
 c.save();shape(c,dx,dy,dw,h-dy,'seg',10);c.clip();
 box(c,'#0b0807',dx,dy,dw,h-dy);box(c,'#1c120e',dx,h-58,dw,58);box(c,'#22160f',dx,h-8,dw,8);
 for(const [k,a] of [[44,.07],[32,.09],[20,.12],[10,.16]] as const)shade(c,dx+62-k,h-62-k,k*2+10,k*2+24,a,fire[1]);
 box(c,'#110d0e',dx+44,dy,42,14);for(let k=0;k<26;k++)box(c,'#151012',dx+52-Math.round(k*.5),dy+14+k,30+k,1);box(c,'#6b3a20',dx+38,dy+40,58,2);box(c,'#3a2018',dx+38,dy+42,58,1);
 box(c,'#2a1c18',dx+46,h-46,38,46);for(let y=h-44;y<h;y+=7)box(c,'#1a1210',dx+46,y+5,38,1);for(let x=dx+52;x<dx+84;x+=11)box(c,'#1a1210',x,h-46,1,46);box(c,'#4a2a1c',dx+46,h-46,38,1);
 box(c,fire[0],dx+52,h-53,26,7);box(c,fire[1],dx+55,h-55,20,6);box(c,fire[2],dx+59,h-56,12,5);box(c,fire[3],dx+63,h-55,4,3);box(c,'#1a1210',dx+50,h-49,5,3);box(c,'#1a1210',dx+74,h-50,6,4);
 box(c,'#3a2c22',dx+82,h-64,8,14);box(c,'#4a3a2c',dx+78,h-60,6,5);box(c,'#5a4731',dx+82,h-64,8,1);
 for(const [tx,len] of [[6,20],[11,26],[17,16],[23,22]] as const){box(c,'#2a2a2c',dx+tx,dy+18,1,len);box(c,'#3d3a36',dx+tx-1,dy+18+len,3,4);}box(c,'#2a2019',dx+3,dy+16,26,2);
 box(c,'#1f1812',dx+16,h-24,18,24);box(c,'#3a2d22',dx+16,h-24,18,1);box(c,'#2a2019',dx+20,h-24,1,24);box(c,'#2a2019',dx+29,h-24,1,24);
 box(c,'#0d1014',dx+13,h-28,22,4);box(c,'#0d1014',dx+19,h-33,10,5);box(c,'#0d1014',dx+10,h-38,30,5);for(let k=0;k<6;k++)box(c,'#0d1014',dx+4+k,h-37+Math.floor(k/3),6,3-Math.floor(k/3));
 box(c,'#b5764a',dx+10,h-38,30,1);box(c,'#8a5a36',dx+39,h-37,1,4);box(c,'#8a5a36',dx+29,h-33,1,5);box(c,'#8a5a36',dx+34,h-28,1,4);
 box(c,'#3a3f44',dx+26,h-43,9,3);box(c,'#4a3a2c',dx+33,h-45,2,9);
 c.restore();
 for(const [lx,lit] of [[dx-25,false],[dx+dw+4,true]] as const){door(c,lx,dy+10,21,h-dy-10,{tone:['#14100c','#31271e','#42352a'],style:'plank',knob:''});if(lit){box(c,'#6b4428',lx,dy+10,1,h-dy-10);shade(c,lx,dy+10,21,h-dy-10,.08,fire[1]);}}
 stain(c,'#000',dx+8,dy-8,dw-16,16,s+3,.35,true);
 // The shoe nailed over the door, points up, to keep the luck in.
 const hx=dx+Math.round(dw/2),hy=dy-25;
 for(const px of [hx-6,hx+4]){box(c,INK,px-1,hy-1,4,11);box(c,'#39434a',px,hy,2,9);box(c,'#59666b',px,hy,1,9);}
 box(c,INK,hx-5,hy+8,10,4);box(c,'#39434a',hx-4,hy+8,8,3);box(c,'#39434a',hx-5,hy+7,2,2);box(c,'#39434a',hx+3,hy+7,2,2);box(c,'#59666b',hx-6,hy,2,1);box(c,'#59666b',hx+4,hy,2,1);for(const [nx,ny] of [[-5,3],[-5,6],[5,3],[5,6],[-2,9],[2,9]] as const)box(c,'#0b0f14',hx+nx,hy+ny,1,1);
 // A tyre waiting to be shrunk on, and the window of the shoeing shed.
 const wx=x0+w-38;lintel(c,wx,h-92,18,COOL,5);win(c,wx,h-92,18,20,{look:'dim',cols:2,rows:2,frame:'#2a2019',s:4});sill(c,wx,h-72,18,COOL);
 for(const rr of [15,14])hoop(c,x0+w-20,h-17,rr,rr===15?'#4f5d61':IRON);hoop(c,x0+w-20,h-17,3,'#3a2d22');for(let k=0;k<4;k++){const t=k*Math.PI/4+.3;stroke(c,'#3a2d22',Math.round(x0+w-20-Math.cos(t)*13),Math.round(h-17-Math.sin(t)*13),Math.round(x0+w-20+Math.cos(t)*13),Math.round(h-17+Math.sin(t)*13),1);}
 box(c,IRON,x0+5,h-52,2,3);hoop(c,x0+6,h-46,3,IRON_LIT);
 quoins(c,x0,eave,h,COOL,false,13,14,8);quoins(c,x0+w,eave,h,COOL,true,13,14,8);sides(c,x0,x0+w,eave,h,RUBBLE.lip);
}};

// ── The fish stall ──────────────────────────────────────────────────────────
/** A fish hung by its tail, head down. */
function hungFish(c:C,x:number,y:number,len:number,back:string,belly:string){
 box(c,back,x-2,y,5,2);box(c,back,x-1,y+2,3,1);
 for(let k=0;k<len;k++){const t=k/len,half=Math.max(1,Math.round(Math.sin(Math.min(1,t*1.15)*Math.PI)*len*.2)+1);box(c,back,x-half,y+3+k,half*2,1);box(c,belly,x,y+3+k,half,1);}
 box(c,'#0b0f14',x+1,y+len-1,1,1);
}
/** A fish laid on its side on the ice. */
function laidFish(c:C,x:number,y:number,len:number,back:string,belly:string){
 for(let k=0;k<len;k++){const t=k/len,half=Math.max(1,Math.round(Math.sin(Math.min(1,t*1.2)*Math.PI)*len*.16));box(c,back,x+k,y-half,1,half);box(c,belly,x+k,y,1,half);}
 box(c,back,x+len,y-2,2,5);box(c,back,x+len-1,y-1,1,3);box(c,'#0b0f14',x+2,y-1,1,1);
}
const stall:Building={
 paint(c,p){
  const r=part(p,'roof'),s=8914,x=r.x,w=r.w,h=p.h,top=r.y+r.h,slab=h-58;
  // A tarred boarded back and cheeks, on the iron frame that carries the awning.
  planks(c,BOARD_TAR,'#0b0b0c',s,x+3,top+3,w-6,h-top-3,5,8);
  for(const px of [x+1,x+w-4]){box(c,INK,px-1,top-1,5,h-top+1);box(c,IRON,px,top-1,3,h-top+1);box(c,IRON_LIT,px,top-1,1,h-top+1);}
  box(c,INK,x,top-1,w,5);box(c,IRON,x,top,w,3);box(c,IRON_LIT,x,top,w,1);
  stroke(c,IRON,x+4,top+20,x+18,top+4,1);stroke(c,IRON,x+w-5,top+20,x+w-19,top+4,1);
  for(const f of [.33,.62]){const y=Math.round(top+(slab-top)*f);box(c,IRON,x+3,y,w-6,2);box(c,IRON_LIT,x+3,y,w-6,1);}
  // The prices, chalked up this morning.
  box(c,INK,x+7,top+7,w-14,25);box(c,'#5e4a36',x+8,top+8,w-16,23);box(c,'#15191c',x+9,top+9,w-18,21);
  write(c,'COD 4D',x+13,top+12,'#b9c0bd');write(c,'EELS 2D',x+13,top+21,'#9aa19e');box(c,'#6d7472',x+38,top+18,10,1);
  // What did not sell, hung on the rail; the balance; the slab with its ice and the last of the catch.
  const rail=Math.round(top+(slab-top)*.33)+2;
  hungFish(c,x+12,rail,22,'#3d4a52','#9aa7ab');hungFish(c,x+21,rail,15,'#4a4438','#a39c86');hungFish(c,x+29,rail,26,'#33424c','#8f9da3');
  const sx=x+46;box(c,'#8a7446',sx,rail,1,7);box(c,'#8a7446',sx-8,rail+7,17,1);box(c,'#b9a25f',sx-8,rail+7,6,1);for(const px of [sx-8,sx+8]){box(c,'#5a4c2c',px,rail+8,1,9);box(c,'#8a7446',px-3,rail+17,7,2);box(c,'#b9a25f',px-3,rail+17,3,1);}
  box(c,IRON,x+w-12,slab-36,1,8);box(c,IRON,x+w-15,slab-28,7,10);box(c,'#1c2830',x+w-14,slab-27,5,8);box(c,IRON_LIT,x+w-15,slab-28,7,1);
  planks(c,BOARD_GREY,'#151210',s+1,x+2,slab+5,w-4,h-slab-5,6,9);box(c,'#4a545b',x+4,slab+9,w-8,h-slab-16);box(c,'#6d7b80',x+4,slab+9,w-8,1);for(let px=x+10;px<x+w-6;px+=13)box(c,'#333d44',px,slab+10,1,h-slab-17);
  box(c,INK,x,slab-1,w,6);box(c,'#7f888e',x+1,slab,w-2,4);box(c,'#b9c0bd',x+1,slab,w-2,1);
  for(let px=x+3,i=0;px<x+w-5;i++){const iw=4+Math.floor(hash(s,i,5)*5),ih=3+Math.floor(hash(s,i,6)*4);box(c,i%2?'#7f97a3':'#93abb5',px,slab-ih,iw,ih);box(c,'#c3d5db',px,slab-ih,iw-1,1);px+=iw;}
  laidFish(c,x+6,slab-7,22,'#33424c','#a9b6ba');laidFish(c,x+33,slab-6,17,'#4a4438','#b0a88f');laidFish(c,x+17,slab-10,13,'#3d4a52','#9aa7ab');
  box(c,'#b5562a',x+52,slab-8,6,3);box(c,'#8a3d22',x+53,slab-9,4,1);box(c,'#b5562a',x+50,slab-7,2,1);box(c,'#b5562a',x+58,slab-7,2,1);
  stain(c,'#c3ccd0',x+20,slab+5,12,26,s+2,.25);
  box(c,IRON,x+w-22,h-18,14,18);box(c,'#232d35',x+w-21,h-17,12,17);box(c,IRON_LIT,x+w-22,h-18,14,1);hoop(c,x+w-15,h-22,7,IRON);c.clearRect(x+w-23,h-22,16,4);box(c,IRON_LIT,x+w-22,h-18,14,1);
 },
 // The awning: striped canvas stretched on the frame, its scalloped edge hanging to the front.
 deck(c,_part,w,h){
  for(let x=0,i=0;x<w;x+=8,i++){
   const sw=Math.min(8,w-x),red=i%2===0,col=red?'#7a3a33':'#a39a86';
   box(c,col,x,0,sw,h-3);box(c,red?'#a55046':'#cfc8ae',x,0,sw,2);box(c,red?'#5e2b26':'#857d6c',x,h-5,sw,2);
   box(c,col,x+1,h-3,sw-2,2);box(c,col,x+2,h-1,Math.max(0,sw-4),1);
  }
  box(c,'#5e2b26',19,3,3,2);box(c,'#857d6c',w-14,4,5,3);box(c,'#a39a86',w-13,4,3,1);
 },
};

// ── The weavers' cottages ───────────────────────────────────────────────────
const weavers:Building={paint(c,p){
 const a=part(p,'roof'),b=part(p,'east'),s=9008,h=p.h,frame='#59636b';
 /** A run of lights between stone mullions under one long head: each light glazed on its own. */
 const run=(x:number,y:number,lw:number,lh:number,looks:readonly Look[],k:Tri,seed:number)=>{
  const wide=looks.length*(lw+3)+3;surround(c,x,y,wide,lh,k,3);
  looks.forEach((look,i)=>win(c,x+3+i*(lw+3),y,lw,lh,{look,cols:look==='lead'?1:2,rows:lh>36?3:2,frame,tint:'#3a3629',s:seed+i*5}));
  sill(c,x,y+lh,wide,k,3,4);
 };
 {
  // The west cottage: gritstone under stone slates, the loomshop's nine lights along the top storey.
  const x0=a.x,w=a.w,top=a.y,fl=[top+26,top+110,top+206,h];
  slope(c,x0,top,w,26,STONE_SLATE,s,5,9,COOL,.5);
  for(let f=0;f<3;f++)wallAt(c,SQUARED,s+1+f,x0,fl[f],w,fl[f+1]-fl[f]);
  run(x0+12,fl[0]+20,14,34,['dark','dark','lit','dim','dark','board','dark','broken','dark'],COOL,s);
  run(x0+16,fl[1]+26,14,42,['drawn','dark','drawn'],COOL,s+50);run(x0+120,fl[1]+26,14,42,['dark','blind'],COOL,s+60);
  run(x0+16,fl[2]+24,14,46,['dim','drawn'],COOL,s+70);run(x0+124,fl[2]+24,14,46,['dark','dark'],COOL,s+80);
  const dx=x0+78;lintel(c,dx,h-60,22,COOL,7,3);door(c,dx,h-60,22,60,{tone:['#111815','#22362d','#2e483b'],style:'plank'});step(c,dx,h,22,COOL,4,4);
  quoins(c,x0,fl[0],h,COOL,false,10,13,8);box(c,INK,x0,fl[0],1,h-fl[0]);pipe(c,x0+w-10,fl[0],h,s);
 }
 {
  // The east cottage, a storey taller: two loom floors, the warps taken in at a door on the upper one.
  const x0=b.x,w=b.w,top=b.y,fl=[top+26,top+112,top+196,top+272,h];
  slope(c,x0,top,w,26,STONE_SLATE,s+9,6,10,WARM,.4);
  for(let f=0;f<4;f++)wallAt(c,SAND,s+11+f,x0,fl[f],w,fl[f+1]-fl[f]);
  run(x0+11,fl[0]+22,13,36,['dark','drawn','dark','dark','dark','lead','dark','dark','blind'],WARM,s+100);
  run(x0+12,fl[1]+22,13,38,['dark','dark','board','dark','dark','drawn'],WARM,s+110);
  const tx=x0+130;lintel(c,tx,fl[1]+18,22,WARM,6);door(c,tx,fl[1]+18,22,48,{tone:['#14100c','#33291f','#463829'],style:'plank',knob:''});sill(c,tx,fl[1]+66,22,WARM,4,4);
  box(c,IRON,tx+9,fl[1]+3,4,3);hoop(c,tx+11,fl[1]+9,3,IRON_LIT);
  run(x0+14,fl[2]+20,14,34,['drawn','drawn','dark'],WARM,s+120);run(x0+108,fl[2]+20,14,34,['blind','dark','dark'],WARM,s+130);
  const dx=x0+20;lintel(c,dx,h-58,22,WARM,7,3);door(c,dx,h-58,22,58,{tone:['#170f0e','#3e231f','#53302a'],style:'plank'});step(c,dx,h,22,WARM,4,4);
  run(x0+62,fl[3]+16,14,38,['dark','lit'],WARM,s+140);run(x0+118,fl[3]+16,14,38,['drawn','dark'],WARM,s+150);
  barrel(c,x0+46,h-26,14,26,'#34302a');
  quoins(c,x0,fl[0],a.y,WARM,false,11,14,8);quoins(c,x0+w,fl[0],h,WARM,true,11,14,8);
  box(c,INK,x0,top+5,1,h-top-5);box(c,INK,x0+w-1,fl[0],1,h-fl[0]);box(c,SAND.lip,x0+1,a.y+26,1,h-a.y-26);
 }
}};

// ── The granary ─────────────────────────────────────────────────────────────
const granary:Building={paint(c,p){
 const r=part(p,'roof'),s=9478,x0=r.x,w=r.w,h=p.h,top=r.y,eave=top+26,floor=h-104,base=h-62,girt=Math.round((eave+floor)/2),leaf:Tri=['#14100c','#33291f','#463829'];
 tiled(c,x0,top,w,26,s,false,true);
 // Tarred weatherboard on a timber frame: the loft door the sacks come in at, the bin floor's door below.
 laps(c,BOARD_TAR,'#0d0c0c','#3a3633',s,x0,eave,w,girt-eave,6);laps(c,BOARD_TAR,'#0d0c0c','#3a3633',s+1,x0,girt,w,floor-girt,6);
 for(const px of [x0,x0+w-5]){box(c,TIMBER[0],px,eave,5,floor-eave);box(c,TIMBER[1],px,eave,1,floor-eave);}
 box(c,TIMBER[0],x0,girt-2,w,4);box(c,TIMBER[1],x0,girt-2,w,1);
 const lx=x0+Math.round(w/2)-15;box(c,TIMBER[0],lx-3,eave+14,36,4);box(c,TIMBER[1],lx-3,eave+14,36,1);door(c,lx,eave+18,30,46,{tone:leaf,style:'pair'});box(c,TIMBER[0],lx-4,eave+64,38,4);box(c,TIMBER[1],lx-4,eave+64,38,1);
 stain(c,'#b9b29a',lx+1,eave+68,28,34,s+2,.2);
 box(c,INK,x0+15,eave+28,20,26);for(let y=eave+30;y<eave+52;y+=4){box(c,'#2a2823',x0+16,y,18,3);box(c,'#454039',x0+16,y,18,1);}
 box(c,INK,x0+w-36,eave+34,20,20);box(c,'#262220',x0+w-35,eave+35,18,18);box(c,'#3a3633',x0+w-35,eave+35,18,1);box(c,INK,x0+w-27,eave+35,1,18);box(c,IRON,x0+w-34,eave+43,16,2);
 const dx=x0+106;box(c,TIMBER[0],dx-3,floor-58,32,4);box(c,TIMBER[1],dx-3,floor-58,32,1);door(c,dx,floor-54,26,54,{tone:leaf,style:'plank'});
 box(c,INK,x0+21,girt+38,22,22);box(c,'#111a24',x0+22,girt+39,20,20);for(let px=x0+25;px<x0+41;px+=4)box(c,IRON,px,girt+39,1,20);box(c,TIMBER[1],x0+20,girt+60,24,2);
 // It stands clear of the lane's rats: a sill beam on mushroom staddles, the staddles on a stone base.
 box(c,INK,x0-2,floor-1,w+4,10);box(c,TIMBER[0],x0-2,floor,w+4,8);box(c,TIMBER[1],x0-2,floor,w+4,1);for(let px=x0+6;px<x0+w-8;px+=14)box(c,TIMBER[2],px,floor+5,6,3);
 for(let i=0;i<5;i++){
  const cx=x0+13+Math.round(i*(w-26)/4),y=floor+8;
  box(c,INK,cx-12,y,24,8);box(c,COOL[0],cx-11,y,22,4);box(c,COOL[1],cx-11,y,22,1);box(c,COOL[0],cx-9,y+4,18,3);box(c,COOL[2],cx-9,y+6,18,1);
  for(let dy=y+7;dy<base;dy++){const half=4+Math.round((dy-y-7)/(base-y-7)*3);box(c,INK,cx-half-1,dy,half*2+2,1);box(c,COOL[0],cx-half,dy,half*2,1);box(c,COOL[1],cx-half,dy,1,1);box(c,COOL[2],cx+half-1,dy,1,1);}
 }
 wallAt(c,RUBBLE,s+3,x0,base+4,w,h-base-4);box(c,INK,x0-2,base-1,w+4,6);box(c,COOL[0],x0-2,base,w+4,4);box(c,COOL[1],x0-2,base,w+4,1);sides(c,x0,x0+w,base+4,h,RUBBLE.lip);
 // The stone steps: a flight of their own, stopped a stride short of the door.
 const sx=x0+14,n=11,going=7,rise=(h-floor-4)/n,end=sx+n*going+8;
 c.save();c.beginPath();for(let k=0;k<n;k++){const y=Math.round(h-(k+1)*rise);c.rect(sx+k*going,y,end-sx-k*going,h-y);}c.clip();wallAt(c,SQUARED,s+4,sx,floor,end-sx,h-floor);c.restore();
 for(let k=0;k<n;k++){const y=Math.round(h-(k+1)*rise),tw=k===n-1?going+8:going;box(c,INK,sx+k*going-1,y,1,Math.ceil(rise));box(c,COOL[0],sx+k*going,y,tw,3);box(c,COOL[1],sx+k*going,y,tw,1);}
 box(c,INK,end,Math.round(h-n*rise),1,Math.round(n*rise));
}};

// ── The Lamb ────────────────────────────────────────────────────────────────
/** Clay tiles hung on a wall, a few courses of club tiles among the plain. */
function hang(c:C,x:number,y:number,w:number,h:number,s:number){
 box(c,'#170f0d',x,y,w,h);
 for(let py=y,r=0;py<y+h;py+=5,r++){const club=r%7>3;for(let px=x-(r%2?3:0),i=0;px<x+w;px+=6,i++){const a=Math.max(x,px),b=Math.min(x+w,px+6);if(b-a<2)continue;box(c,TILE[Math.floor(hash(s,r,i)*4)],a,py,b-a-1,Math.min(4,y+h-py));if(club&&b-a===6){box(c,'#170f0d',a,py+3,1,1);box(c,'#170f0d',b-2,py+3,1,1);}}}
}
const pub:Building={paint(c,p){
 const r=part(p,'roof'),al=part(p,'alley'),s=9712,x0=r.x,w=r.w,h=p.h,top=r.y,fl=[top+48,top+134,top+216,h],frame='#8a8f8c',coat:Tri=['#4a473f','#55524a','#3b3832'];
 // A deep tiled roof, tile-hanging to the top storey, render under it.
 tiled(c,x0,top,w,48,s,false,true);
 hang(c,x0,fl[0],w,fl[1]-fl[0],s+1);box(c,'#170f0d',x0,fl[1]-2,w,3);for(let px=x0;px<x0+w;px+=6)box(c,TILE[2],px,fl[1]-2,5,2);
 for(const [x,look] of [[20,'drawn'],[76,'lit'],[132,'dark']] as const){box(c,INK,x0+x-3,fl[0]+21,26,48);box(c,'#5d625f',x0+x-2,fl[0]+22,24,46);win(c,x0+x,fl[0]+24,20,40,{look,cols:2,rows:2,rail:true,frame,tint:'#46323a',s:s+x});box(c,'#8a8f8c',x0+x-3,fl[0]+65,26,2);}
 renderAt(c,coat,s+2,x0,fl[1]+1,w,fl[2]-fl[1]-1);
 for(const [x,look] of [[20,'dark'],[76,'drawn'],[132,'dim']] as const){surround(c,x0+x,fl[1]+20,20,46,[coat[1],'#6d6a60',coat[2]],2);win(c,x0+x,fl[1]+20,20,46,{look,cols:2,rows:2,rail:true,frame,tint:'#3a3629',s:s+x+3});sill(c,x0+x,fl[1]+66,20,[coat[1],'#6d6a60',coat[2]]);}
 // The bar: glazed brick, the name board over it, the bay alight, the lamp over the door.
 wallAt(c,PLUM,s+3,x0,fl[2]+18,w,h-fl[2]-18);
 board(c,x0+6,fl[2]+2,92,18,'THE LAMB',2,'#1f1a1c','#8a7446','#c9b98a');
 const bx=x0+14,by=fl[2]+34,bw=66,bh=h-by-24;
 for(let k=0;k<7;k++)box(c,k<2?LEAD[1]:LEAD[0],bx+7-k,by-7+k,bw-14+k*2,1);box(c,LEAD[2],bx-1,by,bw+2,1);
 box(c,INK,bx-1,by+1,bw+2,bh);box(c,'#2a2823',bx,by+1,bw,bh);
 win(c,bx+1,by+2,11,bh-3,{look:'leadlit',cols:1,rows:1,frame:'#3b2e25',s:1});win(c,bx+bw-12,by+2,11,bh-3,{look:'leadlit',cols:1,rows:1,frame:'#3b2e25',s:2});shade(c,bx+1,by+2,11,bh-3,.3,'#000');shade(c,bx+bw-12,by+2,11,bh-3,.3,'#000');
 win(c,bx+13,by+2,bw-26,bh-3,{look:'leadlit',cols:2,rows:1,frame:'#3b2e25',s:3});box(c,'#3b2e25',bx+13,by+18,bw-26,2);
 box(c,'#3a2c22',bx+22,by+bh-14,8,12);box(c,'#3a2c22',bx+24,by+bh-19,5,5);box(c,'#3a2c22',bx+38,by+bh-12,10,10);
 box(c,INK,bx-2,by+bh,bw+4,4);box(c,WARM[0],bx-2,by+bh,bw+4,3);box(c,WARM[1],bx-2,by+bh,bw+4,1);wallAt(c,PLUM,s+4,bx,by+bh+4,bw,h-by-bh-4);shade(c,bx,by+bh+4,12,h-by-bh-4,.3,'#000');shade(c,bx+bw-12,by+bh+4,12,h-by-bh-4,.3,'#000');
 const dx=x0+104;lintel(c,dx,h-64,24,WARM,6);door(c,dx,h-64,24,64,{tone:['#170f0e','#3e231f','#53302a'],style:'panel',fan:'lit',fanH:12,knob:'#b9a25f'});step(c,dx,h,24,WARM,4,4);
 const lx=dx+12,ly=h-98;
 shade(c,lx-14,ly-8,29,34,.07,'#f3c77a');shade(c,lx-9,ly-3,19,24,.1,'#f3c77a');
 box(c,IRON,lx-1,ly-12,2,8);stroke(c,IRON,lx-9,ly-12,lx+9,ly-12,2);box(c,IRON,lx-5,ly-5,11,2);box(c,IRON,lx-4,ly-3,9,13);box(c,'#c8913f',lx-3,ly-2,7,11);box(c,'#f3c77a',lx-1,ly+1,3,6);box(c,IRON,lx-5,ly+10,11,2);box(c,IRON,lx,ly-3,1,13);
 sash(c,x0+138,h-78,18,34,'drawn',{cols:2,rows:2,rail:true,frame,tint:'#46323a'},WARM,5);
 sides(c,x0,x0+w,fl[0],h,'#63463c');
 // The skittle alley: a long boarded room over the cellar, one run of high lights, its door open on the game.
 const ax=al.x,aw=al.w,ay=al.y,ae=ay+22,mid=ay+126;
 slope(c,ax,ay,aw,22,SLATE_BLUE,s+5,6,10,LEAD);
 laps(c,BOARD_GREY,'#151210','#57504a',s+6,ax,ae,aw,mid-ae,6);for(const px of [ax+aw-5]){box(c,TIMBER[0],px,ae,5,mid-ae);box(c,TIMBER[1],px,ae,1,mid-ae);}
 box(c,TIMBER[0],ax+8,ae+12,aw-18,4);box(c,TIMBER[1],ax+8,ae+12,aw-18,1);
 const high=['dark','dim','dark','board','lit','dark','broken'] as const;
 for(let i=0;i<7;i++)win(c,ax+10+i*17,ae+16,15,17,{look:high[i],cols:i%3===0?1:2,rows:1,frame:'#3a2c22',s:s+i*3});
 box(c,TIMBER[0],ax+8,ae+33,aw-18,3);box(c,TIMBER[1],ax+8,ae+33,aw-18,1);
 box(c,TIMBER[2],ax,mid-1,aw,7);box(c,TIMBER[0],ax,mid,aw,5);box(c,TIMBER[1],ax,mid,aw,1);
 wallAt(c,GREY,s+7,ax,mid+5,aw,h-mid-5);
 const ox=ax+16,oy=h-70;soldiers(c,ox-2,oy-8,34,8,GREY.lip,GREY.stones[0],GREY.mortar,s);box(c,INK,ox-1,oy-1,32,71);box(c,'#6b4a33',ox,oy,30,70);box(c,'#8f6233',ox+2,oy+2,26,56);box(c,'#c8913f',ox+6,oy+8,18,30);box(c,'#4a3423',ox,oy+56,30,14);box(c,'#5e452e',ox,oy+56,30,1);
 for(const [kx,kh] of [[5,15],[11,17],[17,15],[23,13]] as const){box(c,'#2a2019',ox+kx,oy+56-kh,4,kh);box(c,'#2a2019',ox+kx+1,oy+54-kh,2,2);box(c,'#6e5641',ox+kx,oy+58-kh,1,kh-4);}
 disc(c,'#17110d',ox+9,oy+64,3);box(c,'#4a3a2c',ox+8,oy+62,1,1);
 door(c,ox+31,oy+4,9,66,{tone:['#14100c','#33291f','#463829'],style:'plank',knob:''});
 sash(c,ax+66,mid+30,26,26,'dark',{cols:3,rows:2,frame:'#3a2c22'},COOL,5);
 box(c,INK,ax+62,h-14,34,14);box(c,'#33291f',ax+63,h-13,32,13);box(c,'#4a3a2c',ax+63,h-13,32,1);box(c,INK,ax+79,h-13,1,13);box(c,IRON,ax+70,h-8,4,2);box(c,IRON,ax+84,h-8,4,2);
 barrel(c,ax+104,h-30,22,30,'#3d2f22');barrel(c,ax+120,h-56,18,26,'#44352a');barrel(c,ax+aw-20,h-28,20,28,'#37291e');
 box(c,INK,ax,ae,1,h-ae);box(c,INK,ax+aw-1,ae,1,h-ae);
}};

// ── The lodging house ───────────────────────────────────────────────────────
const lodging:Building={paint(c,p){
 const wg=part(p,'wing'),dm=part(p,'dormer'),r=part(p,'roof'),s=10112,h=p.h,bx=r.x,bw=r.w,top=r.y,coat:Tri=['#3d444b','#474e56','#31373d'],dress:Tri=[coat[1],'#626b72',coat[2]],frame='#59636b';
 // The block: five storeys in one tired coat of render, BEDS painted across it where the lane can read it.
 const fl=[top+24,top+98,top+182,top+266,top+352,h];
 at(c,bx,top,()=>roofBehind(c,bw,s,36));renderAt(c,coat,s,bx,top+5,bw,13);cope(c,bx,top,bw,5,PALE,s);cornice(c,bx,top+17,bw,dress,coat[2],7);
 for(let f=0;f<5;f++)renderAt(c,coat,s+1+f,bx,fl[f],bw,fl[f+1]-fl[f]);
 for(let y=fl[4]+9;y<h-6;y+=11)box(c,coat[2],bx,y,bw,1);
 for(const f of [2,3,4])band(c,bx,fl[f]-3,bw,dress,f===4?4:2);
 const looks:Look[][]=[['dark','blind','dim','dark'],['drawn','dark','dark','lit'],['dark','broken','drawn','dark'],['blind','dark','lit','drawn']],tall=[30,42,46,48];
 for(let f=0;f<4;f++)for(let i=0;i<4;i++){const x=bx+18+i*49,y=fl[f]+(f===0?8:f===1?34:22);surround(c,x,y,18,tall[f],dress,2);win(c,x,y,18,tall[f],{look:looks[f][i],cols:2,rows:f===0?2:3,rail:f>0,frame,tint:CURTAINS[(f*3+i)%5],s:s+f*9+i});sill(c,x,y+tall[f],18,dress);}
 const sy=fl[1]-17;box(c,'#1f252b',bx+48,sy,104,28);box(c,'#272e35',bx+49,sy+1,102,26);write(c,'BEDS',bx+70,sy+4,'#a3a8a2',4);
 for(let i=0;i<11;i++)box(c,'#272e35',bx+70+Math.floor(hash(s,i,7)*60),sy+4+Math.floor(hash(s,i,8)*20),2,1);
 box(c,'#8a8f8c',bx+60,fl[2]+68,24,9);box(c,'#a3a8a2',bx+60,fl[2]+68,24,1);box(c,'#6d7472',bx+68,fl[2]+70,1,7);
 const dx=bx+88;surround(c,dx,h-64,24,63,dress,3);door(c,dx,h-64,24,64,{tone:['#0f1318','#223042','#2f4158'],style:'panel',fan:'dim',fanH:12});step(c,dx,h,24,PALE,4,4);
 for(const [x,look] of [[20,'drawn'],[150,'dark']] as const){surround(c,bx+x,fl[4]+26,24,40,dress,2);win(c,bx+x,fl[4]+26,24,40,{look,cols:2,rows:2,rail:true,frame,tint:'#34303c',s:s+x});sill(c,bx+x,fl[4]+66,24,dress);}
 for(const [a,b] of [[bx+6,dx-10],[dx+34,bx+bw-8]] as const){box(c,COOL[0],a,h-3,b-a,3);box(c,COOL[1],a,h-3,b-a,1);box(c,IRON,a,h-17,b-a,2);for(let px=a+2;px<b-1;px+=5){box(c,IRON,px,h-20,1,17);box(c,IRON_LIT,px,h-20,1,1);}}
 box(c,INK,bx,top+22,1,h-top-22);box(c,INK,bx+bw-1,top+22,1,h-top-22);pipe(c,bx+bw-10,fl[0],h,s);
 // The wing: grey brick under slate, three floors of let rooms.
 const wx=wg.x,ww=dm.x+dm.w-wg.x,wy=wg.y,wf=[wy+24,wy+118,wy+212,h];
 slope(c,wx,wy,ww,24,SLATE_GREEN,s+11,6,9,LEAD);
 for(let f=0;f<3;f++)wallAt(c,GREY,s+12+f,wx,wf[f],ww,wf[f+1]-wf[f]);
 const wl:Look[][]=[['dark','drawn','dim','dark'],['blind','dark','dark','drawn'],['drawn','dark']];
 for(let f=0;f<2;f++)for(let i=0;i<4;i++)arched(c,wx+20+i*48,wf[f]+24,20,f?46:42,wl[f][i],'seg',3,ringOf(RED),{cols:2,rows:f?3:2,frame:'#4f4a42',tint:CURTAINS[(i+f*2)%5],s:s+40+f*5+i},COOL);
 band(c,wx,wf[2]-3,ww,[GREY.stones[2],GREY.lip,GREY.mortar],3);
 for(let i=0;i<2;i++)arched(c,wx+20+i*48,wf[2]+22,20,44,wl[2][i],'seg',3,ringOf(RED),{cols:2,rows:3,frame:'#4f4a42',tint:CURTAINS[i],s:s+60+i},COOL);
 const ex=wx+122;archRing(c,ex,h-66,44,'seg',6,6,RED.lip,RED.stones[1],RED.mortar,s+70);door(c,ex,h-66,44,66,{tone:['#14100c','#2f3a3a','#3c4a49'],style:'pair',arch:'seg',rise:6});
 box(c,GREY.shade,wx,h-7,ex-wx-6,7);box(c,INK,wx,wf[0],1,h-wf[0]);box(c,GREY.lip,wx+1,wf[0],1,h-wf[0]);pipe(c,wx+7,wf[0],h,s+3);
 // The dormer stood on the wing against the block: lead cheeks and a lead flat, one casement.
 const ox=dm.x,oy=dm.y,ow=dm.w,oh=dm.h;
 box(c,INK,ox,oy+6,ow,oh-6);box(c,'#3d474f',ox+1,oy+6,ow-1,oh-6);box(c,LEAD[0],ox+1,oy+6,1,oh-6);
 for(const px of [ox+10,ox+ow-11]){box(c,LEAD[0],px,oy+7,2,oh-8);box(c,LEAD[2],px+2,oy+7,1,oh-8);}box(c,LEAD[2],ox+1,oy+Math.round(oh*.55),9,1);box(c,LEAD[2],ox+ow-9,oy+Math.round(oh*.4),9,1);
 leadTop(c,ox,oy,ow,7,s+9);
 box(c,INK,ox+14,oy+14,ow-28,oh-26);win(c,ox+15,oy+15,ow-30,oh-28,{look:'dim',cols:2,rows:3,frame,s:9});box(c,LEAD[0],ox+12,oy+oh-13,ow-24,3);box(c,LEAD[1],ox+12,oy+oh-13,ow-24,1);
 box(c,LEAD[0],ox,oy+oh-4,ow,6);box(c,LEAD[1],ox,oy+oh-4,ow,1);box(c,LEAD[2],ox,oy+oh+2,ow,1);
}};

// ── The bathhouse ───────────────────────────────────────────────────────────
const baths:Building={paint(c,p){
 const r=part(p,'roof'),tk=part(p,'tank'),s=10638,w=p.w,h=p.h,top=r.y,fl=[top+52,top+144,top+228,h],frame='#6a7378';
 // Dressed stone under a parapet and a cornice, its name cut in the frieze.
 at(c,0,top,()=>roofBehind(c,w,s,36));wallAt(c,ASHLAR,s,0,top+6,w,14);cope(c,0,top,w,6,PALE,s);cornice(c,0,top+20,w,PALE,'#39424a',10);
 wallAt(c,ASHLAR,s+1,0,top+30,w,22);box(c,INK,69,top+31,128,20);box(c,'#2a343e',70,top+32,126,18);box(c,'#3f4c5a',70,top+32,126,1);
 write(c,'BATHS',106,top+34,'#57646f',3);write(c,'BATHS',105,top+33,'#10161d',3);
 wallAt(c,ASHLAR,s+2,0,fl[0],w,fl[1]-fl[0]);wallAt(c,ASHLAR,s+3,0,fl[1],w,fl[2]-fl[1]);wallAt(c,RUSTIC,s+4,0,fl[2],w,h-fl[2]);
 band(c,-1,fl[0]-3,w+2,COOL,3);band(c,-1,fl[1]-3,w+2,COOL,3);band(c,-2,fl[2]-5,w+4,COOL,6);
 // The plunge and the slipper baths: round-headed lights running with steam, some with the gas lit behind them.
 const up=[['fog',2,5],['foglit',3,5],['fog',2,4],['fog',3,5],['foglit',2,5]] as const,mid=[['dark',2],['fog',2],['foglit',3],['fog',2],['dark',3]] as const;
 for(let i=0;i<5;i++){
  const x=21+i*50;arched(c,x,fl[0]+18,24,60,up[i][0],'round',0,STONE_RING,{cols:up[i][1],rows:up[i][2],frame,s:s+i*3},COOL,6);box(c,COOL[1],x+9,fl[0]+7,6,6);
  arched(c,x+2,fl[1]+22,20,44,mid[i][0],'round',0,STONE_RING,{cols:mid[i][1],rows:3,frame,s:s+20+i},COOL);
 }
 // The entrance up its steps, a barred light each side, the stokehole's hatch.
 const dx=Math.round(w/2)-16,dy=h-84;archRing(c,dx,dy,32,'round',0,8,COOL[0],'#414a52',COOL[2],s+9);box(c,COOL[1],dx+13,dy-11,6,11);
 door(c,dx,dy,32,78,{tone:['#0f1318','#27384a','#34495f'],style:'panel',arch:'round',fan:'foglit',fanH:18,knob:'#a9905f'});
 box(c,COOL[0],dx-10,h-6,52,6);box(c,COOL[1],dx-10,h-6,52,1);box(c,COOL[0],dx-5,h-11,42,5);box(c,COOL[1],dx-5,h-11,42,1);
 for(const [x,look] of [[28,'fog'],[70,'dark'],[178,'foglit'],[220,'dark']] as const){sash(c,x,fl[2]+34,20,26,look,{cols:2,rows:2,frame,s:s+x},COOL,6);for(let px=x+3;px<x+19;px+=4)box(c,IRON,px,fl[2]+35,1,24);}
 box(c,INK,26,h-16,26,16);box(c,IRON,27,h-15,24,15);box(c,IRON_LIT,27,h-15,24,1);box(c,'#0b0f14',31,h-10,16,2);box(c,'#0b0f14',31,h-6,16,2);stain(c,'#000',24,h-18,30,14,s+5,.5,true);
 quoins(c,0,fl[0],fl[2]-5,PALE,false,12,16,10);quoins(c,w,fl[0],fl[2]-5,PALE,true,12,16,10);box(c,INK,0,top+20,1,h-top-20);box(c,INK,w-1,top+20,1,h-top-20);
 // The boiler's blow-off comes up through the parapet in a stone curb.
 for(const v of p.vents){ventSeat(c,v,PALE);stain(c,'#c3ccd0',v.x-4,v.y+v.h+17,v.w+8,26,s+6,.25);}
 // The tank on the roof: riveted plates on a steel cradle, rust running from its seams.
 const tx=tk.x,ty=tk.y,tw=tk.w,th=tk.h,body=th-10;
 for(const px of [tx+6,tx+Math.round(tw/2)-3,tx+tw-12]){box(c,INK,px-1,ty+body,8,10);box(c,'#2a3238',px,ty+body,6,10);box(c,'#4a545b',px,ty+body,1,10);}
 box(c,INK,tx,ty+body-1,tw,6);box(c,'#232b32',tx,ty+body,tw,4);box(c,'#4f5d61',tx,ty+body,tw,1);box(c,INK,tx,ty+th-3,tw,3);box(c,'#39434a',tx,ty+th-3,tw,2);
 box(c,INK,tx,ty,tw,body);
 for(let j=0;j<2;j++)for(let i=0;i<4;i++){const px=tx+1+i*Math.round((tw-2)/4),pw=i===3?tx+tw-1-px:Math.round((tw-2)/4),py=ty+3+j*Math.round((body-3)/2),ph=j?ty+body-py:Math.round((body-3)/2);box(c,hash(s,i,j+40)>.5?'#2c3840':'#303c45',px,py,pw-1,ph-1);box(c,'#46545c',px,py,pw-1,1);for(let k=px+2;k<px+pw-2;k+=4)box(c,'#6d7b80',k,py+2,1,1);for(let k=py+5;k<py+ph-2;k+=5)box(c,'#56646b',px+1,k,1,1);}
 box(c,'#4f5d61',tx,ty,tw,3);box(c,'#8b949a',tx,ty,tw,2);
 stain(c,'#6b4630',tx+22,ty+Math.round(body/2)+3,7,18,s+7,.5);stain(c,'#6b4630',tx+68,ty+5,6,26,s+8,.45);
 box(c,IRON,tx+tw-8,ty+th,4,top+30-ty-th);box(c,IRON_LIT,tx+tw-8,ty+th,1,top+30-ty-th);pipe(c,tx+tw-8,top+30,h,s+2);
}};

// ── The corn warehouses ─────────────────────────────────────────────────────
const corn:Building={paint(c,p){
 const a=part(p,'roof'),b=part(p,'bridge'),e=part(p,'east'),s=11100,h=p.h,leafA:Tri=['#17110d','#3a2d22','#4b3a2b'],leafB:Tri=['#111815','#22362d','#2e483b'];
 /** A stack of loading doors, one to a floor, under the one hoist beam that serves them all. */
 const stack=(x:number,floors:readonly number[],fh:number,k:Work,leaf:Tri,open:number,seed:number)=>{
  for(let f=0;f<floors.length-1;f++){
   const dy=floors[f]+fh-50;archRing(c,x,dy,30,'seg',4,6,k.lip,k.stones[1],k.mortar,seed+f);
   if(f===open){c.fillStyle='#07090c';shape(c,x,dy,30,50,'seg',4);c.fill();for(const [sx,sh] of [[3,16],[13,20],[21,12]] as const){box(c,'#4a4332',x+sx,dy+50-sh,8,sh);box(c,'#6b6248',x+sx,dy+50-sh,8,1);box(c,'#332e22',x+sx+7,dy+51-sh,1,sh-1);}}
   else door(c,x,dy,30,50,{tone:leaf,style:'pair',arch:'seg',rise:4,knob:'',straps:f%2===0});
   box(c,INK,x-5,dy+50,40,5);box(c,COOL[0],x-5,dy+50,40,4);box(c,COOL[1],x-5,dy+50,40,1);
  }
  const by=floors[0]+4;
  box(c,INK,x+9,by-1,12,12);box(c,TIMBER[1],x+10,by,10,10);box(c,WOOD[2],x+10,by,10,1);box(c,TIMBER[2],x+12,by+3,6,5);
  box(c,IRON,x+13,by+10,4,5);disc(c,IRON,x+15,by+17,3);box(c,IRON_LIT,x+14,by+16,2,1);
  const drop=floors[Math.min(2,floors.length-2)]+fh-64;for(let y=by+20;y<drop;y+=3)box(c,y%2?'#59666b':'#39434a',x+15,y,1,2);
  box(c,IRON,x+13,drop,5,3);box(c,IRON,x+16,drop+3,2,4);box(c,IRON,x+13,drop+6,4,1);
 };
 {
  // The west warehouse: red brick under a corbelled parapet, piers at its corners.
  const x0=a.x,w=a.w,top=a.y,fh=Math.floor((h-top-26)/5),fl=[0,1,2,3,4,5].map(f=>f===5?h:top+26+f*fh);
  at(c,x0,top,()=>roofBehind(c,w,s,36));wallAt(c,RED,s,x0,top+5,w,12);cope(c,x0,top,w,5,PALE,s);
  for(let k=0;k<3;k++){box(c,RED.mortar,x0-2+k,top+17+k*3,w+4-k*2,3);box(c,RED.stones[k],x0-2+k,top+17+k*3,w+4-k*2,2);box(c,RED.lip,x0-2+k,top+17+k*3,w+4-k*2,1);}
  for(let f=0;f<5;f++){wallAt(c,RED,s+1+f,x0+10,fl[f],w-20,fl[f+1]-fl[f]);for(const px of [x0,x0+w-10]){wallAt(c,RED,s+20+f+px,px,fl[f],10,fl[f+1]-fl[f]);}}
  for(const px of [x0+9,x0+w-11])box(c,RED.mortar,px,top+26,1,h-top-26);
  const lk:Look[][]=[['dark','board'],['dark','dark'],['broken','dark'],['dark','dim'],['board','dark']];
  for(let f=0;f<5;f++)for(let i=0;i<2;i++){const x=x0+20+i*92,y=fl[f]+fh-44;arched(c,x,y,18,24,lk[f][i],'seg',3,ringOf(SOOT),{cols:2,rows:2,frame:'#2a2019',s:s+f*4+i},COOL,4);if(lk[f][i]!=='board')for(let px=x+3;px<x+17;px+=4)box(c,IRON,px,y+1,1,22);}
  stack(x0+60,fl,fh,RED,leafA,3,s+30);
  box(c,RED.shade,x0,h-7,w,7);sides(c,x0,x0+w,top+26,h,RED.lip);
 }
 {
  // The east warehouse: taller, in yellow stock brick under a slate roof, its windows under stone heads.
  const x0=e.x,w=e.w,top=e.y,fh=Math.floor((h-top-30)/5),fl=[0,1,2,3,4,5].map(f=>f===5?h:top+30+f*fh);
  slope(c,x0,top,w,30,SLATE_BLUE,s+40,6,10,LEAD);
  for(let f=0;f<5;f++)wallAt(c,OCHRE,s+41+f,x0,fl[f],w,fl[f+1]-fl[f]);
  for(const f of [1,2,3,4])band(c,x0,fl[f]-2,w,[OCHRE.stones[2],OCHRE.lip,OCHRE.mortar],2);
  const lk:Look[][]=[['dark','dark','dark'],['dark','broken','dark'],['dim','dark','board'],['dark','dark','dark'],['board','dark','dark']];
  for(let f=0;f<5;f++)for(let i=0;i<3;i++){const x=x0+18+(i===0?0:i===1?44:118),y=fl[f]+fh-46;sash(c,x,y,16,26,lk[f][i],{cols:2,rows:f===2?3:2,frame:'#2a2019',s:s+50+f*4+i},WARM,5);if(lk[f][i]!=='board')for(let px=x+3;px<x+15;px+=4)box(c,IRON,px,y+1,1,24);}
  stack(x0+92,fl,fh,OCHRE,leafB,1,s+70);
  box(c,OCHRE.shade,x0,h-7,w,7);sides(c,x0,x0+w,top+30,h,OCHRE.lip);pipe(c,x0+w-9,top+30,h,s+3);
 }
 // The covered bridge between them at the third floor: boarded, lit by three small lights, strutted off both walls.
 const bx=b.x,bw=b.w,by=b.y,floor=by+50;
 for(const [fx,dir] of [[bx,1],[bx+bw,-1]] as const){stroke(c,INK,fx,floor+44,fx+dir*38,floor+8,5);stroke(c,TIMBER[1],fx,floor+43,fx+dir*38,floor+7,3);stroke(c,WOOD[2],fx,floor+42,fx+dir*38,floor+6,1);box(c,COOL[0],fx-(dir<0?5:0),floor+40,5,8);box(c,COOL[1],fx-(dir<0?5:0),floor+40,5,1);}
 planks(c,BOARD_BROWN,'#17110d',s+80,bx,by+8,bw,floor-by-8,6,10);
 for(const px of [bx+44,bx+92]){box(c,TIMBER[0],px,by+8,4,floor-by-8);box(c,TIMBER[1],px,by+8,1,floor-by-8);}
 for(const [x,look] of [[16,'dark'],[60,'dim'],[108,'board']] as const)win(c,bx+x,by+20,16,16,{look,cols:2,rows:2,frame:'#3a2c22',s:s+x});
 box(c,INK,bx,floor-1,bw,10);box(c,TIMBER[0],bx,floor,bw,8);box(c,TIMBER[1],bx,floor,bw,1);for(let px=bx+5;px<bx+bw-6;px+=12)box(c,TIMBER[2],px,floor+5,6,3);
 for(const px of [bx+2,bx+bw-5]){box(c,IRON,px,floor-6,3,14);box(c,IRON_LIT,px,floor-6,1,14);}
 box(c,INK,bx,by,bw,9);box(c,'#23272c',bx,by+2,bw,6);box(c,TIMBER[1],bx,by+2,bw,2);box(c,'#93745a',bx,by,bw,2);for(let px=bx+9;px<bx+bw-4;px+=15+Math.floor(hash(s,px,5)*7))box(c,'#15181c',px,by+4,1,4);
}};

// ── The theatre ─────────────────────────────────────────────────────────────
const theatre:Building={paint(c,p){
 const r=part(p,'roof'),fy=part(p,'fly'),s=11630,h=p.h,x0=r.x,w=r.w,top=r.y,stucco:Tri=['#45423a','#504c43','#38352e'],dress:Tri=['#5a554a','#7c7566','#2e2b25'],frame='#4f4a42';
 // The fly tower: plain brick, a louvre for the flies, the scene dock and the stage door at its foot.
 const fx=fy.x,fw=fy.w,ft=fy.y,lifts=[ft+6,ft+96,ft+200,ft+300,h];
 for(let k=0;k<4;k++)wallAt(c,GREY,s+k,fx,lifts[k],fw,lifts[k+1]-lifts[k]);
 at(c,fx,ft,()=>roofBehind(c,fw,s,40));cope(c,fx,ft,fw,6,COOL,s);for(const k of [1,2,3]){box(c,GREY.mortar,fx,lifts[k]-3,fw,4);box(c,GREY.stones[2],fx,lifts[k]-3,fw,3);box(c,GREY.lip,fx,lifts[k]-3,fw,1);}
 box(c,INK,fx+27,ft+26,38,50);for(let y=ft+28;y<ft+74;y+=4){box(c,'#2a2f33',fx+28,y,36,3);box(c,'#454c52',fx+28,y,36,1);}lintel(c,fx+28,ft+27,36,COOL,5);sill(c,fx+28,ft+76,36,COOL);
 for(const [x,y] of [[14,120],[52,120],[14,222],[52,222]] as const){box(c,GREY.mortar,fx+x,ft+y,24,54);wallAt(c,GREY,s+x+y,fx+x+1,ft+y+1,22,52);shade(c,fx+x+1,ft+y+1,22,52,.25,'#000');}
 const sd=fx+10;lintel(c,sd,h-96,24,COOL,6);door(c,sd,h-96,24,96,{tone:['#101316','#2b3036','#3a4148'],style:'pair',knob:''});
 const gd=fx+54;lintel(c,gd,h-56,20,COOL,5);door(c,gd,h-56,20,56,{tone:['#170f0e','#3e231f','#53302a'],style:'plank'});step(c,gd,h,20,COOL,2);
 shade(c,gd+2,h-84,16,22,.1,'#f3c77a');box(c,IRON,gd+9,h-80,2,5);box(c,IRON,gd+6,h-75,8,9);box(c,'#c8913f',gd+7,h-74,6,7);box(c,'#f3c77a',gd+9,h-72,2,4);
 box(c,INK,fx+fw-1,ft+6,1,h-ft-6);returnFace(c,fx+fw-6,ft+6,h,6);box(c,GREY.lip,fx+1,ft+6,1,top-ft-6);
 // The front: stucco, four pilasters carrying an entablature under the parapet.
 const ent=top+16,order=top+44,base=h-104;
 at(c,x0,top,()=>roofBehind(c,w,s+1,36));renderAt(c,stucco,s+5,x0,top+6,w,10);cope(c,x0,top,w,6,dress,s+1);
 box(c,INK,x0-4,ent-1,w+6,10);box(c,dress[0],x0-4,ent,w+6,8);box(c,dress[1],x0-4,ent,w+6,2);box(c,dress[2],x0-2,ent+6,w+2,2);for(let px=x0;px<x0+w-3;px+=6)box(c,dress[0],px,ent+8,3,3);
 renderAt(c,stucco,s+6,x0,ent+11,w,order-ent-11);box(c,dress[2],x0,order-4,w,4);box(c,dress[0],x0,order-4,w,3);box(c,dress[1],x0,order-4,w,1);
 renderAt(c,stucco,s+7,x0,order,w,base-order);
 // The saloon's three tall windows under their pediments, the gallery's square lights over them.
 const looks=[['drawn','dark'],['lit','dim'],['dark','blind']] as const;
 for(let i=0;i<3;i++){
  const cx=x0+36+i*64,wy=order+72;
  sash(c,cx-11,order+22,22,24,looks[i][1],{cols:2,rows:2,frame,tint:'#46323a',s:s+i},dress,4);
  surround(c,cx-12,wy,24,64,dress,3);win(c,cx-12,wy,24,64,{look:looks[i][0],cols:2,rows:4,rail:true,frame,tint:'#46323a',s:s+10+i});sill(c,cx-12,wy+64,24,dress,4,4);
  if(i===1)for(let k=0;k<7;k++){box(c,dress[k?0:1],cx-18+k*2.6,wy-6-k,36-k*5.2,1);}else{box(c,dress[2],cx-18,wy-10,36,5);box(c,dress[0],cx-18,wy-11,36,4);box(c,dress[1],cx-18,wy-11,36,1);}
  box(c,IRON,cx-15,wy+52,30,1);box(c,IRON,cx-15,wy+66,30,2);for(let px=cx-15;px<cx+15;px+=3)box(c,IRON,px,wy+52,1,14);
 }
 for(const px of [x0+2,x0+62,x0+126,x0+w-14]){
  box(c,INK,px-1,order,14,base-order);box(c,dress[0],px,order+8,12,base-order-14);box(c,dress[1],px,order+8,2,base-order-14);box(c,dress[2],px+10,order+8,2,base-order-14);for(const fx2 of [px+4,px+7])box(c,'#4a463d',fx2,order+12,1,base-order-24);
  box(c,dress[0],px-2,order,16,8);box(c,dress[1],px-2,order,16,2);box(c,dress[2],px-1,order+6,14,2);box(c,dress[0],px-2,base-6,16,6);box(c,dress[1],px-2,base-6,16,1);
 }
 // The base storey: channelled, three arched doors up two steps, tonight's bill pasted by them.
 box(c,dress[2],x0-2,base,w+2,5);box(c,dress[0],x0-2,base,w+2,4);box(c,dress[1],x0-2,base,w+2,1);
 renderAt(c,stucco,s+8,x0,base+5,w,h-base-5);for(let y=base+14;y<h-8;y+=11)box(c,stucco[2],x0,y,w,1);
 const doors=[['#170f0e','#3e231f','#53302a'],['#170f0e','#3e231f','#53302a'],['#170f0e','#3e231f','#53302a']] as const;
 for(let i=0;i<3;i++){const dx=x0+22+i*64,dy=h-84;archRing(c,dx,dy,28,'round',0,6,dress[0],'#6a6456',dress[2],s+20+i);door(c,dx,dy,28,78,{tone:doors[i],style:i===1?'pair':'panel',arch:'round',fan:i===1?'lit':'dark',fanH:16,knob:'#a9905f'});}
 box(c,dress[0],x0+10,h-6,w-20,6);box(c,dress[1],x0+10,h-6,w-20,1);box(c,dress[2],x0+10,h-1,w-20,1);
 const px=x0+55,py=h-66;box(c,INK,px-1,py-1,18,30);box(c,'#3a2c22',px,py,16,28);box(c,'#b9b29a',px+1,py+1,14,26);box(c,'#3a2018',px+3,py+3,10,3);box(c,'#3a2018',px+5,py+8,6,1);for(let k=0;k<5;k++)box(c,'#59544a',px+2+(k%2),py+11+k*3,12-(k%3)*2,1);box(c,'#8a3d22',px+4,py+27-4,8,2);
 box(c,INK,x0,order,1,h-order);
}};

// ── The glazier's ───────────────────────────────────────────────────────────
const glazier:Building={
 paint(c,p){
  const g=part(p,'glass'),r=part(p,'roof'),s=11980,h=p.h,wx=g.x,ww=g.w,wt=g.y+g.h,mid=wt+134,frame='#1c232b';
  // The workshop: limewashed brick walls with iron lights; the roof over it is all glass, on iron principals.
  for(const px of [wx+2,wx+Math.round(ww/2)-1,wx+ww-4]){box(c,'#161d24',px,g.y+3,2,wt-g.y-3);}
  box(c,INK,wx,wt-1,ww,6);box(c,'#232b32',wx,wt,ww,4);box(c,'#3d4950',wx,wt,ww,1);
  wallAt(c,LIME,s+1,wx,wt+4,ww,mid-wt-4);wallAt(c,LIME,s+2,wx,mid,ww,h-mid-10);wallAt(c,SOOT,s+3,wx,h-10,ww,10);box(c,LIME.mortar,wx,h-11,ww,1);
  band(c,wx,mid-3,ww,COOL,3);
  // Two big iron lights to the cutting floor, mended over the years with whatever glass was by.
  for(const [x,seed] of [[14,3],[84,8]] as const){
   const lx=wx+x,ly=wt+26,lw=52,lh=86;lintel(c,lx,ly,lw,COOL,6);win(c,lx,ly,lw,lh,{look:'dark',cols:4,rows:6,frame,s:seed});
   for(let i=0;i<4;i++){const cx=Math.floor(hash(s,i,seed)*4),cy=Math.floor(hash(s,i,seed+1)*6),tone=['#5d7f6c','#7a5a3c','#4f6b76','#6a4a58'][i];shade(c,lx+1+cx*13,ly+1+Math.round(cy*lh/6),12,Math.round(lh/6)-1,.45,tone);}
   sill(c,lx,ly+lh,lw,COOL,3,4);
  }
  // The store below, its doors folded back: sheets stood on edge in their racks, a crate of crown glass in straw.
  const ox=wx+14,oy=h-112,ow=84;
  archRing(c,ox,oy,ow,'seg',8,7,RED.lip,RED.stones[1],RED.mortar,s+4);c.save();shape(c,ox,oy,ow,h-oy,'seg',8);c.clip();
  box(c,'#0a0d11',ox,oy,ow,h-oy);box(c,'#141b22',ox,h-6,ow,6);
  for(const [rx,n,lean] of [[6,6,5],[42,5,-4]] as const){
   for(let k=0;k<n;k++){const x=ox+rx+k*5,top=oy+22+((k*7)%9),col=k%2?'#5d7f8c':'#4f6b76';stroke(c,col,x+lean,top,x,h-12,1);stroke(c,'#a9c4cc',x+lean,top,x+Math.round(lean*.6),top+18,1);shade(c,Math.min(x,x+lean),top+2,Math.abs(lean)+3,h-top-16,.1,'#8fb0ba');}
   box(c,'#2a2019',ox+rx-4,h-14,n*5+10,4);box(c,'#4a3a2c',ox+rx-4,h-14,n*5+10,1);stroke(c,'#3a2d22',ox+rx-4,h-12,ox+rx+(lean>0?n*5+6:-2)+lean,oy+30,2);
  }
  box(c,'#17110d',ox+68,h-26,16,26);box(c,'#3a2d22',ox+69,h-25,14,25);box(c,'#8a7a4c',ox+70,h-28,12,3);for(let k=0;k<4;k++)box(c,'#6f6238',ox+70+k*3,h-30,2,3);
  c.restore();
  for(const lx of [ox-17,ox+ow+3])door(c,lx,oy+10,14,h-oy-10,{tone:['#101713','#213a2e','#2d4c3c'],style:'plank',knob:''});
  sash(c,wx+ww-34,h-70,18,26,'dim',{cols:2,rows:2,frame},COOL,5);
  sides(c,wx,wx+ww,wt+4,h,LIME.lip);
  // His yard wall and gate, between the workshop and the house.
  const x0=r.x,w=r.w,top=r.y,yard=h-118;
  wallAt(c,OCHRE,s+5,wx+ww,yard+5,x0-wx-ww,h-yard-5);at(c,0,yard,()=>coping(c,wx+ww-1,x0-wx-ww+2,5,COOL,s+6));door(c,wx+ww+5,h-58,x0-wx-ww-10,58,{tone:['#101713','#213a2e','#2d4c3c'],style:'plank'});
  // His house: narrow, in yellow brick, a different light to every floor as a pattern book of his trade.
  const fl=[top+24,top+106,top+188,top+268,h],brick:Tri=[OCHRE.stones[2],OCHRE.lip,OCHRE.mortar];
  slope(c,x0,top,w,24,SLATE_PURPLE,s+7,6,9,PALE);
  for(let f=0;f<4;f++)wallAt(c,OCHRE,s+8+f,x0,fl[f],w,fl[f+1]-fl[f]);
  for(const f of [1,2,3])band(c,x0,fl[f]-3,w,f===3?COOL:brick,3);
  sash(c,x0+22,fl[0]+24,22,38,'dark',{cols:2,rows:2,rail:true,frame:'#59636b',s:1},COOL);sash(c,x0+94,fl[0]+24,22,38,'drawn',{cols:2,rows:2,rail:true,frame:'#59636b',tint:'#2f3a36'},COOL);
  arched(c,x0+22,fl[1]+22,22,44,'lead','round',0,ringOf(RED),{cols:1,rows:1,frame:'#3b2e25',s:6},COOL);
  arched(c,x0+94,fl[1]+22,22,44,'dim','round',0,ringOf(RED),{cols:3,rows:5,frame:'#3b2e25',s:2},COOL);
  // A margin light on the first floor: a border of coloured glass round a clear middle.
  const mx=x0+20,my=fl[2]+18;lintel(c,mx,my,26,COOL,6);win(c,mx,my,26,48,{look:'lit',cols:1,rows:1,frame:'#59636b',s:5});
  for(const [bx,by,bw2,bh,col] of [[1,1,4,46,'#7a3038'],[21,1,4,46,'#2c4a7a'],[5,1,16,4,'#2c6a4a'],[5,43,16,4,'#7a6a2c']] as const){box(c,col,mx+bx,my+by,bw2,bh);}
  box(c,'#59636b',mx+5,my,1,48);box(c,'#59636b',mx+20,my,1,48);box(c,'#59636b',mx,my+5,26,1);box(c,'#59636b',mx,my+42,26,1);sill(c,mx,my+48,26,COOL);
  sash(c,x0+94,fl[2]+18,22,48,'blind',{cols:2,rows:3,rail:true,frame:'#59636b',s:7},COOL);
  // The shop: small squares of glass, a roundel of his own leading hung in the middle of them.
  const sx=x0+14,sy=fl[3]+20,sw=74,sh=h-sy-20;
  lintel(c,sx,sy,sw,COOL,7);win(c,sx,sy,sw,sh,{look:'dim',cols:6,rows:4,frame:'#3b2e25',s:9});
  const cx=sx+Math.round(sw/2),cy=sy+Math.round(sh/2);disc(c,'#17110d',cx,cy,11);disc(c,'#7a3038',cx,cy,10);box(c,'#2c4a7a',cx-9,cy-1,19,3);box(c,'#2c4a7a',cx-1,cy-9,3,19);disc(c,'#c8913f',cx,cy,4);disc(c,'#17110d',cx,cy,1);hoop(c,cx,cy,7,'#17110d');box(c,'#17110d',cx,sy+1,1,cy-sy-11);
  sill(c,sx,sy+sh,sw,COOL,3,4);
  const dx=x0+102;lintel(c,dx,h-62,24,COOL,6);door(c,dx,h-62,24,62,{tone:['#0f1318','#223042','#2f4158'],style:'panel',fan:'leadlit',fanH:12});step(c,dx,h,24,COOL);
  box(c,OCHRE.shade,x0,h-7,dx-x0-4,7);sides(c,x0,x0+w,fl[0],h,OCHRE.lip);pipe(c,x0+w-9,fl[0],h,s);
 },
 // The glass roof: panes between iron bars, one cracked, one puttied over; the top bar is the walked edge.
 deck(c,_part,w,h){
  box(c,'#1a242b',0,0,w,h);
  for(let x=1,i=0;x<w-1;i++){
   const pw=Math.min(w-1-x,11+Math.floor(hash(i,3,41)*6)),v=hash(i,5,41);
   box(c,v>.88?'#3b4c52':v<.3?'#55747f':'#4f6b76',x,2,pw-1,h-4);box(c,'#7f9fa9',x,2,pw-1,1);box(c,'#a9c4cc',x+1,4,Math.max(1,pw>>1),1);
   if(v>.45&&v<.58)stroke(c,'#c9dde2',x+1,h-3,x+pw-3,3,1);
   x+=pw;
  }
  box(c,'#c3d2d6',0,0,w,2);box(c,'#3d4950',0,h-2,w,1);box(c,'#10181d',0,h-1,w,1);
 },
};

// ── The undertaker's ────────────────────────────────────────────────────────
const undertaker:Building={paint(c,p){
 const r=part(p,'roof'),co=part(p,'coach'),s=12364,x0=r.x,w=r.w,h=p.h,top=r.y,fl=[top+40,top+130,top+222,h],black:Tri=['#191b1f','#212428','#101214'],trim:Tri=['#24272b','#3a3e43','#0c0e10'],gilt='#a9905f',frame='#2e3236';
 // A black-painted front under a steep slate roof: gilt lines at each floor, every blind down.
 slope(c,x0,top,w,40,SLATE_PURPLE,s,5,8,LEAD);
 for(let f=0;f<2;f++)renderAt(c,black,s+1+f,x0,fl[f],w,fl[f+1]-fl[f]);
 for(const y of [fl[0],fl[1]-2]){box(c,trim[0],x0,y,w,4);box(c,gilt,x0+2,y+1,w-4,1);}
 const up=[['blind','blind','drawn'],['drawn','dim','blind']] as const;
 for(let f=0;f<2;f++)for(let i=0;i<3;i++){const x=x0+20+i*45,y=fl[f]+(f?22:24),wh=f?52:44;surround(c,x,y,20,wh,trim,3);box(c,gilt,x-3,y-3,26,1);win(c,x,y,20,wh,{look:up[f][i],cols:2,rows:f?3:2,rail:true,frame,tint:'#1c1c20',s:s+f*5+i});sill(c,x,y+wh,20,trim);}
 // The shop: his trade lettered in gilt, an urn under a pall in the window, the door with its knocker.
 const sy=fl[2];
 box(c,black[2],x0,sy,w,h-sy);box(c,black[1],x0+1,sy+22,w-2,h-sy-22);
 box(c,INK,x0-2,sy-1,w+4,6);box(c,trim[1],x0-2,sy,w+4,4);box(c,gilt,x0-2,sy,w+4,1);
 box(c,black[0],x0+1,sy+4,w-2,18);box(c,gilt,x0+6,sy+6,w-12,1);box(c,gilt,x0+6,sy+19,w-12,1);write(c,'UNDERTAKER',x0+Math.round((w-textW('UNDERTAKER',2))/2),sy+8,'#c2a868',2);
 for(const px of [x0+1,x0+w-9]){box(c,trim[0],px,sy+22,8,h-sy-22);box(c,trim[1],px,sy+22,1,h-sy-22);box(c,gilt,px+2,sy+26,4,1);box(c,gilt,px+2,h-8,4,1);}
 const wx=x0+14,wy=sy+30,ww=72,wh=58;
 win(c,wx,wy,ww,wh,{look:'dark',cols:1,rows:1,frame:trim[1],s:4});box(c,gilt,wx+2,wy+2,ww-4,1);
 const ux=wx+36;box(c,'#22252a',ux-12,wy+wh-12,24,11);box(c,'#3a3e43',ux-12,wy+wh-12,24,1);
 for(let k=0;k<22;k++){const half=k<3?3:k<6?5:k<14?8-Math.abs(k-10)/2:k<18?4:6;box(c,'#2e3237',ux-Math.round(half),wy+wh-34+k,Math.round(half)*2,1);box(c,'#4a4f55',ux-Math.round(half),wy+wh-34+k,2,1);}
 for(let k=0;k<16;k++)box(c,'#131517',ux+2+Math.floor(k/3),wy+wh-36+k,7,1);box(c,'#131517',ux-2,wy+wh-38,10,3);
 box(c,trim[1],wx-2,wy+wh,ww+4,3);for(const px of [wx,wx+37]){box(c,INK,px,wy+wh+6,35,h-wy-wh-10);box(c,black[1],px+1,wy+wh+7,33,h-wy-wh-12);box(c,trim[1],px+1,wy+wh+7,33,1);}
 const dx=x0+100;door(c,dx,h-66,26,66,{tone:['#0b0c0e','#1b1e22','#2a2e33'],style:'panel',fan:'dark',fanH:12,knob:gilt});box(c,gilt,dx+12,h-42,2,4);box(c,gilt,dx+11,h-38,4,1);step(c,dx,h,26,COOL,3,3);
 box(c,INK,x0,fl[0],1,h-fl[0]);box(c,INK,x0+w-1,fl[0],1,h-fl[0]);box(c,trim[1],x0+1,fl[0],1,sy-fl[0]);
 // The carriage house: one leaf of its doors open on the hearse.
 const cx=co.x,cw=co.w,cy=co.y,ce=cy+22,dw=88,gx=cx+Math.round((cw-dw)/2),gy=h-108;
 slope(c,cx,cy,cw,22,SLATE_PURPLE,s+5,6,10,LEAD);
 wallAt(c,SOOT,s+6,cx,ce,cw,gy-ce-12);wallAt(c,SOOT,s+7,cx,gy-12,cw,h-gy+12);
 const lx=cx+Math.round(cw/2)-18;archRing(c,lx,ce+26,36,'round',0,5,PLUM.lip,PLUM.stones[1],PLUM.mortar,s+8);win(c,lx,ce+26,36,18,{look:'dark',cols:4,rows:1,frame:'#1c232b',arch:'round',s:3});sill(c,lx,ce+44,36,COOL);
 box(c,INK,gx-4,gy-9,dw+8,9);box(c,TIMBER[0],gx-4,gy-8,dw+8,8);box(c,TIMBER[1],gx-4,gy-8,dw+8,1);
 box(c,'#07090b',gx,gy,dw,h-gy);
 const hx=gx+4;box(c,'#131517',hx,gy+22,38,52);box(c,'#22252a',hx,gy+22,38,2);box(c,'#111a24',hx+5,gy+30,28,26);box(c,'#1c2c3e',hx+7,gy+32,8,10);box(c,gilt,hx+4,gy+29,30,1);box(c,gilt,hx+4,gy+56,30,1);box(c,'#22252a',hx+18,gy+30,1,26);
 for(const fx of [hx+3,hx+33]){box(c,'#131517',fx,gy+12,3,10);box(c,'#22252a',fx-1,gy+8,5,5);}
 box(c,'#8a7446',hx+38,gy+40,3,6);box(c,'#f3c77a',hx+39,gy+42,1,2);
 hoop(c,hx+20,h-17,16,'#2e3237');hoop(c,hx+20,h-17,15,'#131517');hoop(c,hx+20,h-17,3,'#2e3237');for(let k=0;k<6;k++){const t=k*Math.PI/6;stroke(c,'#22252a',Math.round(hx+20-Math.cos(t)*14),Math.round(h-17-Math.sin(t)*14),Math.round(hx+20+Math.cos(t)*14),Math.round(h-17+Math.sin(t)*14),1);}
 door(c,gx+Math.round(dw/2),gy,dw-Math.round(dw/2),h-gy,{tone:['#0b0c0e','#1b1e22','#2a2e33'],style:'plank',knob:''});box(c,gilt,gx+Math.round(dw/2)+4,gy+52,2,5);
 door(c,gx-11,gy+6,10,h-gy-6,{tone:['#0b0c0e','#1b1e22','#2a2e33'],style:'plank',knob:''});
 for(const px of [gx-5-11,gx+dw]){if(px<gx)continue;box(c,COOL[0],px,h-14,5,14);box(c,COOL[1],px,h-14,5,1);}
 box(c,INK,cx,ce,1,h-ce);box(c,INK,cx+cw-1,ce,1,h-ce);returnFace(c,cx+cw-5,ce,h);
}};

// ── The rope walk ───────────────────────────────────────────────────────────
const ropewalk:Building={paint(c,p){
 const r=part(p,'roof'),s=12704,x0=r.x,w=r.w,h=p.h,top=r.y,eave=top+26,rail=top+150,n=6,pier=12,ROPE='#8a7a5c',ROPE_DARK='#5c513d';
 const cut=(i:number)=>x0+Math.round(i*(w-pier)/n);
 // A long shed in bays: each bay its own length of pantiles, boards and brick between brick piers that come up through the roof.
 const vents=['louvre','open','board','louvre','shut','open'] as const;
 for(let i=0;i<n;i++){
  const bx=cut(i)+pier,bw=cut(i+1)-bx,seed=s+i*31;
  tiled(c,bx-pier,top,bw+pier+(i===n-1?pier:0),26,seed,true,true);
  if(i===n-1){
   // The open end: the jack with its hooks and crank, the strands laid off it down the walk, coils waiting to go out.
   planks(c,BOARD_PITCH,'#0b0e11',seed,bx,eave,bw,84,6,10);box(c,TIMBER[0],bx,eave+84,bw,6);box(c,TIMBER[1],bx,eave+84,bw,1);
   box(c,'#07090c',bx,eave+90,bw,h-eave-90);box(c,'#10151b',bx,h-8,bw,8);
   const jx=bx+38,jy=h-70;
   box(c,TIMBER[0],jx-4,jy-30,8,100);box(c,TIMBER[1],jx-4,jy-30,2,100);box(c,TIMBER[0],jx-16,h-8,32,8);box(c,TIMBER[1],jx-16,h-8,32,1);stroke(c,TIMBER[0],jx-14,h-8,jx-2,jy+20,3);stroke(c,TIMBER[0],jx+14,h-8,jx+2,jy+20,3);
   for(const rr of [24,23])hoop(c,jx,jy,rr,rr===24?'#6e5641':'#3a2d22');for(let k=0;k<4;k++){const t=k*Math.PI/4+.2;stroke(c,'#4a3a2c',Math.round(jx-Math.cos(t)*23),Math.round(jy-Math.sin(t)*23),Math.round(jx+Math.cos(t)*23),Math.round(jy+Math.sin(t)*23),1);}
   disc(c,IRON,jx,jy,4);box(c,IRON_LIT,jx-1,jy-2,2,1);stroke(c,IRON,jx,jy,jx+12,jy+14,2);box(c,WOOD[2],jx+11,jy+13,3,6);
   for(const hy of [-12,-4,4,12]){box(c,IRON,jx-9,jy+hy,6,1);stroke(c,ROPE,jx-9,jy+hy,bx,jy+Math.round(hy*.5)-2,1);}
   for(const [cx,cy,rr] of [[bx+14,h-9,9],[bx+16,h-17,8],[bx+60,h-8,8]] as const){for(let k=0;k<4;k++){box(c,k%2?ROPE_DARK:ROPE,cx-rr+k,cy-k*2,(rr-k)*2,2);}box(c,'#07090c',cx-3,cy-7,6,2);}
  }else{
   planks(c,BOARD_PITCH,'#0b0e11',seed,bx,eave,bw,rail-eave,6,10);
   wallAt(c,GREY,seed+2,bx,rail+5,bw,h-rail-5);box(c,TIMBER[0],bx,rail,bw,5);box(c,TIMBER[1],bx,rail,bw,1);
   // Each bay's small square vent, as it has been left.
   const vx=bx+Math.round(bw/2)-8+Math.round((hash(seed,1,2)-.5)*14),vy=eave+20+Math.round(hash(seed,3,4)*16),kind=vents[i];
   box(c,INK,vx-2,vy-2,20,20);box(c,TIMBER[1],vx-1,vy-1,18,18);box(c,'#07090c',vx,vy,16,16);
   if(kind==='louvre')for(let y=vy+1;y<vy+15;y+=4){box(c,'#2a2f33',vx,y,16,3);box(c,'#454c52',vx,y,16,1);}
   else if(kind==='board'){for(let y=vy;y<vy+16;y+=5){box(c,'#3a2c22',vx,y,16,4);box(c,'#54432f',vx,y,16,1);}box(c,'#17120e',vx+3,vy,1,16);box(c,'#17120e',vx+12,vy,1,16);}
   else if(kind==='shut'){box(c,'#262b30',vx,vy,16,16);box(c,'#3a4046',vx,vy,16,1);box(c,INK,vx+8,vy,1,16);box(c,IRON,vx+6,vy+7,5,2);}
   else{box(c,ROPE_DARK,vx,vy+9,16,1);box(c,ROPE,vx,vy+11,16,1);}
   if(i===0){const dx=bx+10;box(c,TIMBER[0],dx-3,h-92,50,5);box(c,TIMBER[1],dx-3,h-92,50,1);door(c,dx,h-87,44,87,{tone:['#101316','#2b3036','#3a4148'],style:'pair'});}
   else if(i%2===1){
    // A hatch at bench height: the strands run past it, tarred and taut.
    const hx=bx+10,hy=rail+26,hw=bw-20;lintel(c,hx,hy,hw,COOL,5);box(c,INK,hx-1,hy-1,hw+2,26);box(c,'#07090c',hx,hy,hw,24);
    for(const [dy,col] of [[6,ROPE],[10,ROPE_DARK],[14,ROPE],[19,ROPE_DARK]] as const)box(c,col,hx,hy+dy,hw,1);box(c,TIMBER[0],hx+Math.round(hw*.6),hy+4,3,20);box(c,TIMBER[1],hx+Math.round(hw*.6)-3,hy+4,9,2);sill(c,hx,hy+24,hw,COOL);
   }else{sash(c,bx+Math.round(bw/2)-9,rail+28,18,22,i===2?'dark':'board',{cols:2,rows:2,frame:'#2a2019',s:seed},COOL,5);barrel(c,bx+bw-24,h-(i===2?30:24),i===2?20:18,i===2?30:24,i===2?'#2a2622':'#352a22');}
   box(c,GREY.shade,bx,h-6,bw,6);
  }
 }
 for(let i=0;i<=n;i++){const px=cut(i);wallAt(c,RED,s+200+i,px,eave,pier,h-eave);box(c,RED.lip,px,eave,1,h-eave);box(c,INK,px+pier-1,eave,1,h-eave);box(c,INK,px-1,top+5,pier+2,eave-top-4);box(c,COOL[0],px,top+5,pier,eave-top-5);box(c,COOL[1],px,top+5,1,eave-top-5);box(c,COOL[2],px,eave-1,pier,1);box(c,COOL[0],px-2,h-9,pier+4,9);box(c,COOL[1],px-2,h-9,pier+4,1);}
 box(c,INK,x0,eave,1,h-eave);box(c,INK,x0+w-1,eave,1,h-eave);
}};

// ── The coal yard ───────────────────────────────────────────────────────────
const coal:Building={paint(c,p){
 const hp=part(p,'hopper'),r=part(p,'roof'),s=13248,h=p.h;
 // The office: sooted brick, the clerk's bay looking out on the weighbridge plate.
 const x0=r.x,w=r.w,top=r.y,fl=[top+22,top+104,top+188,top+270,h],frame='#2a2019';
 slope(c,x0,top,w,22,SLATE_GREEN,s,5,9,LEAD);
 for(let f=0;f<4;f++)wallAt(c,SOOT,s+1+f,x0,fl[f],w,fl[f+1]-fl[f]);
 for(const f of [1,2])band(c,x0,fl[f]-3,w,[SOOT.stones[2],SOOT.lip,SOOT.mortar],3);band(c,x0,fl[3]-4,w,COOL,4);
 const lk:Look[][]=[['dark','board'],['drawn','dark'],['dim','dark']];
 for(let f=0;f<3;f++)for(let i=0;i<2;i++){const x=x0+24+i*62,y=fl[f]+22;soldiers(c,x-2,y-8,24,8,RED.stones[2],RED.stones[0],RED.mortar,s+f+i);win(c,x,y,20,f?44:38,{look:lk[f][i],cols:2,rows:f?3:2,rail:true,frame,tint:'#3a3629',s:s+f*3+i});sill(c,x,y+(f?44:38),20,COOL);}
 const bx=x0+10,by=fl[3]+18,bw=64,bh=44;
 for(let k=0;k<5;k++)box(c,k?LEAD[0]:LEAD[1],bx-3+k,by-5+k,bw+6-k*2,1);box(c,INK,bx-2,by,bw+4,bh+2);box(c,TIMBER[1],bx-1,by,bw+2,bh+1);
 win(c,bx+2,by+3,bw-4,bh-6,{look:'lit',cols:4,rows:2,frame:'#3a2c22',s:5});box(c,'#2a2019',bx+12,by+bh-22,10,16);box(c,'#3a2c22',bx+14,by+bh-28,6,6);box(c,'#4a3a2c',bx+30,by+bh-12,22,2);box(c,'#b9b29a',bx+36,by+bh-15,8,3);
 box(c,TIMBER[0],bx-3,by+bh+1,bw+6,3);box(c,TIMBER[1],bx-3,by+bh+1,bw+6,1);planks(c,BOARD_PITCH,'#0b0e11',s+6,bx-1,by+bh+4,bw+2,h-by-bh-4,6,9);
 const dx=x0+92;lintel(c,dx,h-62,24,COOL,6);door(c,dx,h-62,24,62,{tone:['#0d0d0e','#232425','#303233'],style:'panel',fan:'dim',fanH:10});step(c,dx,h,24,COOL);
 box(c,INK,x0+2,h-4,84,4);box(c,'#232b32',x0+3,h-3,82,3);box(c,'#4f5d61',x0+3,h-3,82,1);for(let px=x0+8;px<x0+82;px+=12)box(c,'#0b0f14',px,h-2,2,1);
 sides(c,x0,x0+w,fl[0],h,SOOT.lip);pipe(c,x0+w-9,fl[0],h,s+2);returnFace(c,x0+w-5,fl[0],h);
 // The hopper: a boarded bin strapped in iron on four trestle legs, its mouth and chute over the cart's standing.
 const hx=hp.x,hy=hp.y,hw=hp.w,hh=hp.h,neck=hy+hh+48,mx=hx+Math.round(hw/2);
 for(const lx of [hx+3,hx+hw-9]){box(c,INK,lx-1,hy+hh,8,h-hy-hh);box(c,WOOD[1],lx,hy+hh,6,h-hy-hh);box(c,WOOD[2],lx,hy+hh,1,h-hy-hh);box(c,COOL[0],lx-3,h-5,12,5);box(c,COOL[1],lx-3,h-5,12,1);}
 const tiers=[neck+26,neck+26+Math.round((h-neck-40)/2),h-14];
 for(let k=0;k<2;k++){stroke(c,WOOD[0],hx+8,tiers[k],hx+hw-9,tiers[k+1],3);stroke(c,WOOD[1],hx+8,tiers[k]-1,hx+hw-9,tiers[k+1]-1,1);stroke(c,WOOD[0],hx+hw-9,tiers[k],hx+8,tiers[k+1],3);stroke(c,WOOD[1],hx+hw-9,tiers[k]-1,hx+8,tiers[k+1]-1,1);}
 for(const ty of [hy+hh+18,...tiers]){box(c,INK,hx+2,ty-1,hw-4,6);box(c,WOOD[1],hx+2,ty,hw-4,4);box(c,WOOD[2],hx+2,ty,hw-4,1);}
 for(let dy=hy+hh;dy<neck;dy++){const t=(dy-hy-hh)/(neck-hy-hh),half=Math.round(hw/2-2-t*(hw/2-13));box(c,INK,mx-half-1,dy,half*2+2,1);box(c,'#232b32',mx-half,dy,half*2,1);box(c,'#4a545b',mx-half,dy,2,1);box(c,'#161c21',mx+half-3,dy,3,1);}
 for(let k=0;k<4;k++){const dy=hy+hh+6+k*11,t=(dy-hy-hh)/(neck-hy-hh),half=Math.round(hw/2-2-t*(hw/2-13));for(let px=mx-half+4;px<mx+half-3;px+=6)box(c,'#59666b',px,dy,1,1);}
 box(c,INK,mx-13,neck-1,26,9);box(c,IRON,mx-12,neck,24,7);box(c,IRON_LIT,mx-12,neck,24,1);box(c,IRON,mx+12,neck+2,12,2);box(c,WOOD[2],mx+22,neck-3,3,8);
 stroke(c,INK,mx-8,neck+8,mx+12,neck+30,9);stroke(c,'#232b32',mx-8,neck+7,mx+12,neck+29,6);stroke(c,'#4a545b',mx-8,neck+4,mx+12,neck+26,1);
 planks(c,BOARD_PITCH,'#0b0e11',s+9,hx,hy+3,hw,hh-3,6,10);
 for(const sy of [hy+9,hy+hh-9]){box(c,IRON,hx,sy,hw,3);box(c,IRON_LIT,hx,sy,hw,1);for(let px=hx+4;px<hx+hw-2;px+=9)box(c,'#59666b',px,sy+1,1,1);}
 for(const px of [hx,hx+hw-4]){box(c,IRON,px,hy+3,4,hh-3);box(c,IRON_LIT,px,hy+3,1,hh-3);}box(c,INK,hx,hy+hh-1,hw,1);
 box(c,TIMBER[1],hx-1,hy,hw+2,4);box(c,'#93745a',hx-1,hy,hw+2,2);box(c,INK,hx-1,hy+4,hw+2,1);for(let px=hx+10;px<hx+hw-4;px+=13)box(c,TIMBER[0],px,hy+2,1,2);
 // What it last let down, and the sacks stood ready by the office door.
 for(let i=0;i<44;i++){const px=mx-26+Math.floor(hash(s,i,3)*46),peak=1-Math.abs(px-mx+3)/25,tall=Math.round(peak*18*(.6+hash(s,i,4)*.4));if(tall>0){box(c,i%3?'#0c0d0f':'#1a1c1f',px,h-tall,4,tall);if(i%5===0)box(c,'#3a3f44',px,h-tall,1,1);}}
 for(const [sx,sh] of [[x0+76,15],[x0+82,12]] as const){box(c,INK,sx-1,h-sh-1,10,sh+1);box(c,'#3d3829',sx,h-sh,8,sh);box(c,'#575037',sx,h-sh,3,sh);box(c,'#2a261c',sx+2,h-sh+3,5,1);}
}};

// ── The cart shed ───────────────────────────────────────────────────────────
/** A cart wheel: felloes, a nave, its spokes. */
function wheel(c:C,cx:number,cy:number,r:number,rim:string,spoke:string){
 hoop(c,cx,cy,r,rim);hoop(c,cx,cy,r-1,spoke);for(let k=0;k<6;k++){const t=k*Math.PI/6+.25;stroke(c,spoke,Math.round(cx-Math.cos(t)*(r-1)),Math.round(cy-Math.sin(t)*(r-1)),Math.round(cx+Math.cos(t)*(r-1)),Math.round(cy+Math.sin(t)*(r-1)),1);}disc(c,rim,cx,cy,2);
}
const cart:Building={paint(c,p){
 const r=part(p,'roof'),s=13558,x0=r.x,w=r.w,h=p.h,top=r.y,eave=top+34,loft=top+146,posts=[x0+1,x0+66,x0+130,x0+w-8];
 tiled(c,x0,top,w,34,s,false,true);
 // The hayloft: boarded, its pitching door open and the hay showing, a slit each side for the air.
 planks(c,BOARD_BROWN,'#17110d',s+1,x0,eave,w,loft-eave,6,10);
 for(const px of [x0,x0+w-5]){box(c,TIMBER[0],px,eave,5,loft-eave);box(c,TIMBER[1],px,eave,1,loft-eave);}
 const lx=x0+Math.round(w/2)-22,ly=eave+24;box(c,TIMBER[0],lx-4,ly-5,52,5);box(c,TIMBER[1],lx-4,ly-5,52,1);box(c,INK,lx-1,ly,46,58);box(c,'#090b0e',lx,ly,44,58);
 for(let i=0;i<34;i++){const hx=lx+1+Math.floor(hash(s,i,3)*40),tall=14+Math.floor(hash(s,i,4)*26*(1-Math.abs(hx-lx-22)/40));box(c,['#6f6238','#8a7a4c','#5a5030'][i%3],hx,ly+58-tall,3,tall);}
 for(let i=0;i<7;i++)box(c,i%2?'#8a7a4c':'#6f6238',lx+3+i*6,ly+58,2,3+Math.floor(hash(s,i,5)*5));
 door(c,lx-17,ly+2,15,56,{tone:['#17110d','#3a2d22','#4c3b2c'],style:'plank',knob:''});door(c,lx+46,ly+2,15,56,{tone:['#17110d','#3a2d22','#4c3b2c'],style:'plank',knob:''});
 box(c,INK,x0+22,eave+36,7,28);box(c,'#090b0e',x0+23,eave+37,5,26);box(c,INK,x0+w-34,eave+30,12,12);box(c,'#090b0e',x0+w-33,eave+31,10,10);box(c,TIMBER[1],x0+w-33,eave+35,10,1);box(c,TIMBER[1],x0+w-29,eave+31,1,10);
 // The open front under its bressummer: the tip cart on its shafts, the wagon run in behind the posts.
 const by=loft+10;
 box(c,'#090b0e',x0,by,w,h-by);wallAt(c,GREY,s+2,x0,by,w,h-by-8);shade(c,x0,by,w,h-by-8,.72);box(c,'#11151a',x0,h-8,w,8);
 box(c,INK,x0-2,loft-1,w+4,12);box(c,TIMBER[0],x0-2,loft,w+4,10);box(c,WOOD[2],x0-2,loft,w+4,1);box(c,TIMBER[1],x0-2,loft+1,w+4,3);for(let px=x0+5;px<x0+w-6;px+=12)box(c,TIMBER[2],px,loft+10,6,3);
 const tx=x0+12;stroke(c,'#3a2d22',tx+8,h-14,tx+40,h-58,3);stroke(c,'#4a3a2c',tx+8,h-15,tx+40,h-59,1);
 for(let k=0;k<26;k++)box(c,k<2?'#5a4731':'#33291f',tx+4+Math.round(k*.5),h-52+k,30,1);box(c,'#1f1812',tx+8,h-48,1,22);box(c,'#1f1812',tx+20,h-46,1,22);box(c,'#1f1812',tx+31,h-44,1,22);
 wheel(c,tx+24,h-17,16,'#5a4731','#33291f');
 const gx=x0+76;box(c,'#2a2a22',gx,h-52,112,5);box(c,'#4a4a38',gx,h-52,112,1);planks(c,['#2e3a34','#33403a','#293530'],'#141a17',s+4,gx+2,h-70,108,18,7,11);box(c,'#3d4c44',gx+2,h-70,108,1);
 for(const hx of [gx+6,gx+38,gx+72,gx+104]){box(c,'#1f1812',hx,h-78,2,26);}box(c,'#33291f',gx+2,h-79,108,2);box(c,'#4a3a2c',gx+2,h-79,108,1);
 stroke(c,'#33291f',gx,h-49,gx-12,h-30,2);box(c,'#1f1812',gx+12,h-47,88,3);
 wheel(c,gx+24,h-14,13,'#5a4731','#33291f');wheel(c,gx+88,h-18,17,'#5a4731','#33291f');
 for(const px of posts){box(c,INK,px-1,by,9,h-by);box(c,WOOD[1],px,by,7,h-by);box(c,WOOD[2],px,by,1,h-by);box(c,WOOD[0],px+5,by,2,h-by);box(c,COOL[0],px-2,h-7,11,7);box(c,COOL[1],px-2,h-7,11,1);}
 for(const px of posts.slice(0,3)){stroke(c,INK,px+7,by+22,px+25,by+3,4);stroke(c,WOOD[1],px+7,by+21,px+25,by+2,2);}
 for(const px of posts.slice(1)){stroke(c,INK,px,by+22,px-18,by+3,4);stroke(c,WOOD[1],px,by+21,px-18,by+2,2);}
 ladder(c,x0+w-30,h-1,x0+w-18,loft+14,8,'#3a2d22','#5e4a36');
 box(c,INK,x0,eave,1,loft-eave);box(c,INK,x0+w-1,eave,1,loft-eave);
}};

// ── The pump house ──────────────────────────────────────────────────────────
const pump:Building={paint(c,p){
 const r=part(p,'roof'),s=13822,x0=r.x,w=r.w,h=p.h,top=r.y,st=[top+16,top+106,top+198,h];
 leadTop(c,x0-1,top,w+2,7,s);cornice(c,x0,top+7,w,COOL,'#39424a',9);
 for(let k=0;k<3;k++)wallAt(c,SQUARED,s+1+k,x0,st[k],w,st[k+1]-st[k]);
 band(c,x0-1,st[1]-3,w+2,COOL,4);band(c,x0-2,st[2]-4,w+4,COOL,5);
 // The cistern loft: a louvred opening under a round stone head.
 const vx=x0+Math.round(w/2)-13,vy=st[0]+22;archRing(c,vx,vy,26,'round',0,6,COOL[0],'#414a52',COOL[2],s+4);c.fillStyle=INK;shape(c,vx,vy,26,46,'round',0);c.fill();
 c.save();shape(c,vx+1,vy+1,24,44,'round',0);c.clip();for(let y=vy+1;y<vy+46;y+=4){box(c,'#2a2f33',vx,y,26,3);box(c,'#4a5157',vx,y,26,1);}box(c,INK,vx+12,vy,2,46);c.restore();sill(c,vx,vy+46,26,COOL,3,4);
 // The overflow, and what it has run down the wall; a slit for the stair.
 box(c,INK,x0+16,st[1]+26,10,34);box(c,'#111a24',x0+17,st[1]+27,8,32);box(c,IRON,x0+20,st[1]+27,2,32);lintel(c,x0+17,st[1]+27,8,COOL,5);sill(c,x0+17,st[1]+59,8,COOL);
 box(c,LEAD[0],x0+w-28,st[1]+36,7,5);box(c,LEAD[1],x0+w-28,st[1]+36,7,1);box(c,INK,x0+w-26,st[1]+41,3,2);stain(c,'#c3ccd0',x0+w-29,st[1]+43,9,46,s+5,.16);stain(c,'#27402f',x0+w-28,st[1]+62,7,50,s+6,.3);
 // The door; and out on the lane the parish pump on its stone, its handle up, the trough under the spout.
 const dx=x0+w-36;lintel(c,dx,h-60,24,COOL,7,3);door(c,dx,h-60,24,60,{tone:['#111815','#22362d','#2e483b'],style:'plank',knob:'#59666b'});step(c,dx,h,24,COOL,3,3);
 const px=x0+26;
 box(c,COOL[0],px-8,h-4,22,4);box(c,COOL[1],px-8,h-4,22,1);
 box(c,INK,px-1,h-52,10,48);box(c,'#2c3840',px,h-52,8,48);box(c,'#6d7b80',px+1,h-52,2,48);box(c,'#1c252c',px+6,h-52,2,48);for(const y of [h-40,h-18]){box(c,'#3a4850',px-1,y,10,3);box(c,'#6d7b80',px-1,y,10,1);}
 box(c,INK,px-2,h-58,12,7);box(c,'#3a4850',px-1,h-57,10,5);box(c,'#6d7b80',px-1,h-57,10,1);box(c,'#2c3840',px+2,h-62,4,5);disc(c,'#6d7b80',px+4,h-64,2);
 stroke(c,INK,px+8,h-52,px+22,h-62,4);stroke(c,'#46545c',px+8,h-53,px+22,h-63,2);disc(c,'#6d7b80',px+23,h-63,2);
 box(c,INK,px-11,h-37,11,6);box(c,'#3a4850',px-10,h-36,10,4);box(c,'#6d7b80',px-10,h-36,10,1);box(c,'#3a4850',px-10,h-32,3,3);box(c,IRON,px-5,h-31,1,3);
 box(c,INK,x0-2,h-17,22,17);box(c,COOL[0],x0-1,h-16,20,16);box(c,COOL[1],x0-1,h-16,20,2);box(c,'#10202a',x0+1,h-14,16,2);box(c,'#1c3644',x0+3,h-14,6,1);box(c,COOL[2],x0+7,h-11,1,11);
 stain(c,'#c3ccd0',x0,h-8,18,8,s+7,.2);
 quoins(c,x0,st[0],h,COOL,false,12,13,8);quoins(c,x0+w,st[0],h,COOL,true,12,13,8);box(c,INK,x0,st[0],1,h-st[0]);box(c,INK,x0+w-1,st[0],1,h-st[0]);
}};

// ── The watch house ─────────────────────────────────────────────────────────
const watch:Building={paint(c,p){
 const r=part(p,'roof'),ce=part(p,'cell'),s=13966,x0=r.x,w=r.w,h=p.h,top=r.y,fl=[top+28,top+108,top+190,h],frame='#59636b';
 // A squat stone house under a blocking course; the staff the lane's flag flies from stands in a socket on its roof.
 at(c,x0,top,()=>roofBehind(c,w,s,36));wallAt(c,ASHLAR,s,x0,top+6,w,12);cope(c,x0,top,w,6,PALE,s);cornice(c,x0,top+18,w,PALE,'#39424a',10);
 box(c,INK,x0+23,top-5,12,5);box(c,PALE[0],x0+24,top-4,10,4);box(c,PALE[1],x0+24,top-4,10,1);box(c,INK,x0+28,top-4,2,3);
 box(c,IRON,x0+26,top+7,6,10);box(c,IRON_LIT,x0+26,top+7,6,1);box(c,'#59666b',x0+27,top+10,1,1);box(c,'#59666b',x0+30,top+13,1,1);
 wallAt(c,ASHLAR,s+1,x0,fl[0],w,fl[1]-fl[0]);wallAt(c,ASHLAR,s+2,x0,fl[1],w,fl[2]-fl[1]);wallAt(c,RUSTIC,s+3,x0,fl[2],w,h-fl[2]);
 band(c,x0,fl[1]-3,w,COOL,3);band(c,x0-1,fl[2]-5,w+2,COOL,6);
 for(const [x,look] of [[24,'dark'],[78,'drawn']] as const){surround(c,x0+x,fl[0]+22,18,38,COOL,3);win(c,x0+x,fl[0]+22,18,38,{look,cols:2,rows:2,rail:true,frame,tint:'#2c333c',s:s+x});sill(c,x0+x,fl[0]+60,18,COOL,4);}
 for(const [x,look] of [[24,'lit'],[78,'blind']] as const){surround(c,x0+x,fl[1]+18,18,44,COOL,3);box(c,COOL[1],x0+x-5,fl[1]+9,28,3);box(c,COOL[2],x0+x-5,fl[1]+12,28,1);win(c,x0+x,fl[1]+18,18,44,{look,cols:2,rows:3,rail:true,frame,s:s+x+1});sill(c,x0+x,fl[1]+62,18,COOL,4);}
 // The door with the watch's lantern by it, and the board the parish posts its notices on.
 const dx=x0+18,dy=h-60;archRing(c,dx,dy,26,'round',0,7,COOL[0],'#414a52',COOL[2],s+4);door(c,dx,dy,26,60,{tone:['#0f1318','#223042','#2f4158'],style:'plank',arch:'round',knob:'#59666b'});step(c,dx,h,26,COOL,4,3);
 const lx=dx+38,ly=dy+2;shade(c,lx-12,ly-8,26,32,.08,'#f3c77a');shade(c,lx-7,ly-3,16,22,.1,'#f3c77a');
 box(c,IRON,lx-8,ly-4,8,2);box(c,IRON,lx-1,ly-4,2,5);box(c,IRON,lx-4,ly,9,2);box(c,IRON,lx-4,ly+2,9,11);box(c,'#c8913f',lx-3,ly+3,7,9);box(c,'#f3c77a',lx-1,ly+5,3,5);box(c,IRON,lx-4,ly+12,9,2);box(c,IRON,lx,ly+2,1,10);
 const nx=x0+66,ny=h-56;box(c,INK,nx-1,ny-1,42,34);box(c,'#3a2c22',nx,ny,40,32);box(c,'#1c1915',nx+2,ny+2,36,28);box(c,'#5a4731',nx,ny,40,1);
 for(const [px,py,pw,ph,tone] of [[4,4,13,17,'#b9b29a'],[19,3,10,12,'#a39c86'],[20,17,15,11,'#c2ba98'],[31,5,6,9,'#8f8a70'],[5,23,11,6,'#9a937c']] as const){box(c,tone,nx+px,ny+py,pw,ph);for(let k=2;k<ph-1;k+=2)box(c,'#59544a',nx+px+1,ny+py+k,pw-2-(k%3),1);box(c,'#3a2018',nx+px+Math.floor(pw/2),ny+py,1,1);}
 box(c,IRON,x0+w-12,h-30,2,3);hoop(c,x0+w-11,h-24,3,IRON_LIT);
 quoins(c,x0,fl[0],fl[2]-5,PALE,false,12,15,9);box(c,INK,x0,top+18,1,h-top-18);box(c,INK,x0+w-1,top+18,1,h-top-18);
 // The lock-up on its east end: thick stone under a slab roof, two barred slits, an iron-bound door.
 const cx=ce.x,cw=ce.w,cy=ce.y,cm=cy+110;
 wallAt(c,RUSTIC,s+5,cx,cy+8,cw,cm-cy-8);wallAt(c,RUSTIC,s+6,cx,cm,cw,h-cm);band(c,cx,cm-4,cw+1,COOL,4);
 box(c,INK,cx-1,cy+7,cw+4,2);box(c,PALE[2],cx,cy,cw+2,8);box(c,PALE[0],cx,cy,cw+2,6);box(c,PALE[1],cx,cy,cw+2,2);for(const px of [cx+28,cx+61])box(c,PALE[2],px,cy+2,1,5);
 for(const [x,y,barred] of [[14,34,true],[56,34,true],[56,cm-cy+26,false]] as const){
  box(c,INK,cx+x-3,cy+y-3,24,18);box(c,COOL[0],cx+x-2,cy+y-2,22,16);box(c,COOL[1],cx+x-2,cy+y-2,22,1);box(c,'#06080b',cx+x,cy+y,18,12);
  if(barred)for(let px=cx+x+3;px<cx+x+17;px+=4){box(c,IRON,px,cy+y,2,12);box(c,IRON_LIT,px,cy+y,1,12);}else{wallAt(c,GREY,s+7,cx+x,cy+y,18,12);shade(c,cx+x,cy+y,18,3,.4,'#000');}
 }
 const gx=cx+14,gy=h-56;lintel(c,gx,gy,26,COOL,8,3);door(c,gx,gy,26,56,{tone:['#0d0f11','#22282e','#343c44'],style:'plank',knob:''});
 for(const y of [gy+8,gy+26,gy+44]){box(c,IRON,gx+1,y,24,3);box(c,IRON_LIT,gx+1,y,24,1);for(let px=gx+3;px<gx+24;px+=5)box(c,'#59666b',px,y+1,1,1);}
 box(c,INK,gx+7,gy+13,12,9);box(c,'#06080b',gx+8,gy+14,10,7);for(let px=gx+10;px<gx+17;px+=3)box(c,IRON_LIT,px,gy+14,1,7);box(c,IRON,gx+19,gy+30,5,8);box(c,'#0b0f14',gx+21,gy+33,1,3);
 box(c,IRON,cx+62,h-36,2,3);hoop(c,cx+63,h-30,3,IRON_LIT);for(let k=0;k<5;k++)box(c,k%2?IRON_LIT:IRON,cx+63+(k%2),h-26+k*3,2,3);
 box(c,INK,cx+cw-1,cy+8,1,h-cy-8);returnFace(c,cx+cw-5,cy+8,h);
}};

export const LANE_HOUSES:Readonly<Record<string,Building>>={
 clock,pawn,school,burnt,market,inn,smithy,stall,weavers,granary,pub,lodging,baths,corn,theatre,glazier,undertaker,ropewalk,coal,cart,pump,watch,
};
