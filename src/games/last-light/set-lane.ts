import type {Level,Platform} from './levels';
import {box,lay,panel,stroke,visible,type C,type Work} from './quarter-kit';
import {FIXTURE_PIECES,HOUSE_PIECES,type Piece} from './pieces/level-01';

/** Level 1 · Bell Lane, between Nell's gable and the bell tower. Each roof is
 * the top of its own house, and the house goes down to the lane; the houses
 * are drawn by their own pieces (pieces/level-01.ts). What is not a roof is
 * built here, once each, on its own footing: Nell's stack and the bakehouse
 * stack on their chimney breasts, the yard wall, the gate pier and the
 * forecourt's flags, the hoist pallet on its rope from a jib posted on the
 * tall house, and the laundry's basket on its line between two house walls. */
const BRICK:Work={course:8,short:12,long:18,mortar:'#1a1415',stones:['#4a3330','#503733','#563b35','#46302d'],lip:'#644640',shade:'#3a2826',chip:'#6e4e46'};
const YARD:Work={course:8,short:12,long:20,mortar:'#14181d',stones:['#30333a','#34373e','#383a40','#2d3036'],lip:'#454950',shade:'#24272d',chip:'#4e5258'};
const STONE:Work={course:12,short:18,long:40,mortar:'#151c24',stones:['#28323d','#2b3540','#2e3843','#262f39'],lip:'#3a4654',shade:'#1f2832',chip:'#46525f'};
const IRON='#141c22',IRON_LIT='#4f5d61',WOOD='#1a1410',WOOD_LIT='#6e5641',WOOD_EDGE='#93745a',ROPE='#8a7a5c';
/** Which house piece draws a level-1 landing that is a roof. Untagged roofs are the terrace's. */
export function housePiece(p:Platform):Piece|undefined{
 if(p.kind!=='stone'||p.h<28)return undefined;
 return HOUSE_PIECES[p.tag??'terrace'];
}
const cap=(c:C,w:number,stone='#6c7378',lit='#9aa2a4')=>{box(c,'#1a1415',-3,3,w+6,9);box(c,'#5e423c',-3,4,w+6,6);box(c,'#7a5a50',-3,4,w+6,1);box(c,'#1a1415',-1,10,w+2,2);box(c,stone,-1,0,w+2,4);box(c,lit,-1,0,w+2,2);};
const coping=(c:C,w:number)=>{box(c,'#161b21',-3,0,w+6,9);box(c,'#5d666c',-3,0,w+6,6);box(c,'#8b949a',-3,0,w+6,2);box(c,'#3e464c',-3,6,w+6,2);for(let x=12;x<w-4;x+=22)box(c,'#3e464c',x,2,1,4);};
const edges=(c:C,w:number,h:number,from:number,dark:string,lit:string)=>{box(c,dark,0,from,2,h-from);box(c,dark,w-2,from,2,h-from);box(c,lit,2,from,1,h-from);};
/** Paints a level-1 landing's own tile; (0,0) is its top-left corner. A roof paints nothing: its house piece draws it. */
export function laneDeck(c:C,p:Platform):boolean {
 const w=p.w,h=p.h,tag=p.tag;
 if(housePiece(p))return true;
 if(tag==='stairhead'||tag==='bellcote'){FIXTURE_PIECES[tag](c,0,0,w,h);return true;}
 if(tag==='stack'||tag==='nellstack'){
  // A stack: brick laid to its oversailing courses, capped in cement, strapped in iron where it was tied after a storm.
  c.save();c.translate(0,11);lay(c,w,h-11,BRICK,31+p.id*7);c.restore();edges(c,w,h,11,'#120e0f','#644640');cap(c,w);
  if(tag==='stack'){const y=26;box(c,'#1c2228',0,y,w,3);box(c,'#4a545b',0,y,w,1);for(const x of [6,w-9])box(c,'#59666b',x,y+1,2,1);}
  else{box(c,'#2c2021',w/2-5,-6,10,7);box(c,'#6e4e46',w/2-5,-6,10,1);box(c,'#0b0809',w/2-3,-5,6,2);}
  return true;
 }
 if(tag==='wall'){
  // The yard wall's pier: brick under a stone coping.
  c.save();c.translate(0,8);lay(c,w,h-8,YARD,17+p.id*5);c.restore();edges(c,w,h,8,'#0d1014','#454950');coping(c,w);
  return true;
 }
 if(tag==='pier'){
  // The forecourt's gate pier: dressed stone under a weathered cap, a sunk panel in its face.
  c.save();c.translate(0,12);lay(c,w,h-12,STONE,57);c.restore();edges(c,w,h,12,'#10161d','#46525f');
  box(c,'#1a222b',12,24,w-24,h-36);box(c,'#232c36',13,25,w-26,h-38);box(c,'#3a4654',13,h-13,w-26,1);
  box(c,'#1a222b',-3,2,w+6,10);box(c,'#56626e',-3,2,w+6,7);box(c,'#3a4652',-1,9,w+2,3);box(c,'#10161d',-1,11,w+2,1);box(c,'#6d777e',-2,0,w+4,3);box(c,'#9aa3a5',-2,0,w+4,1);
  return true;
 }
 if(tag==='court'){
  // The forecourt: worn flags on the head of the retaining wall, which shows under them.
  box(c,'#1a2028',0,0,w,19);
  for(let x=0,i=0;x<w;i++){const wide=Math.min(w-x,26+((i*37+11)%19)),v=((i*53+7)%10)/10;box(c,v>.5?'#4b555e':'#454f58',x,2,wide-1,8);box(c,'#5d676f',x,2,wide-1,1);if(v>.7)box(c,'#363f47',x+6,6,7,1);x+=wide;}
  box(c,'#8a949b',0,0,w,2);box(c,'#6b757d',0,2,w,1);box(c,'#1a222b',0,10,w,9);box(c,'#3a4652',0,11,w,6);box(c,'#56626e',0,11,w,1);box(c,'#10161d',0,17,w,2);
  return true;
 }
 if(tag==='hoist'){
  // The hoist's pallet: a timber grid in a rope sling.
  box(c,WOOD,-2,0,w+4,p.h);for(let x=0;x<w;x+=13){box(c,'#665040',x,1,11,5);box(c,WOOD_EDGE,x,0,11,2);}box(c,'#2c2219',0,7,w,4);for(const x of [6,w-12]){box(c,'#3d3026',x,6,6,6);box(c,WOOD_LIT,x,6,6,1);}
  return true;
 }
 if(tag==='basket'){
  // The laundry's drying rack, riding its line: a slatted frame.
  box(c,WOOD,-1,0,w+2,p.h);for(let x=1;x<w;x+=9){box(c,'#6a5240',x,1,7,4);box(c,'#a88b67',x,0,7,2);}box(c,'#2c2219',0,6,w,3);
  return true;
 }
 return false;
}
/** Every level-1 roof gets its house; everything else tagged is built by laneDeck and laneBack. */
export const laneBuilds=(p:Platform)=>!!p.tag&&!housePiece(p);
/** What stands under and behind the lane's non-roof landings; `street` is the lane's cobbles. */
export function laneBack(c:C,l:Level,street:number,cx:number,cy:number,vw:number,vh:number){
 const lane=street+40,see=(x:number,y:number,w:number,h:number)=>visible(x,y,w,h,cx,cy,vw,vh);
 for(const p of l.platforms){
  const top=p.y+p.h;
  if(p.tag==='stack'||p.tag==='nellstack'){
   if(!see(p.x-8,top,p.w+16,lane-top))continue;
   // The chimney breast under the stack: brick down the gable to the lane, toothed into the house wall beside it.
   c.drawImage(panel(`lane/breast/${p.id}`,p.w,lane-top,BRICK,37+p.id*3),p.x,top);box(c,'#120e0f',p.x+p.w-2,top,2,lane-top);box(c,'#644640',p.x+2,top,1,lane-top);
   for(let y=top+4,k=0;y<lane;y+=16,k++)box(c,k%2?'#3a2826':'#503733',p.x-4,y,6,7);
   const off=top+96+p.id%3*24;box(c,'#1a1415',p.x-2,off,p.w+6,6);box(c,'#644640',p.x-2,off,p.w+6,1);
  }else if(p.tag==='wall'||p.tag==='pier'){
   if(!see(p.x,top,p.w,lane-top))continue;
   // The pier goes on down to its own footing in the lane.
   const work=p.tag==='pier'?STONE:YARD,lit=work===STONE?'#46525f':'#454950';
   c.drawImage(panel(`lane/pier/${p.id}`,p.w,lane-top,work,p.id*7+3),p.x,top);box(c,'#0d1014',p.x,top,2,lane-top);box(c,lit,p.x+2,top,1,lane-top);box(c,'#0d1014',p.x+p.w-2,top,2,lane-top);
  }else if(p.tag==='hoist'){
   // The jib the hoist hangs from: a post stood on the tall house's roof, a beam out over the pallet's rope, strutted back, a sheave at its end.
   const travel=p.travel??0,y=p.y-travel-58,mx=p.x+p.w/2,roof=l.platforms[p.id+1],post=roof.x+10;
   if(!see(mx-20,y-10,post-mx+40,roof.y-y+20))continue;
   box(c,WOOD,post,y,6,roof.y-y);box(c,WOOD_LIT,post+1,y,1,roof.y-y);box(c,WOOD,post-4,roof.y-4,14,4);
   box(c,WOOD,mx-10,y,post-mx+16,6);box(c,WOOD_LIT,mx-10,y,post-mx+16,1);box(c,WOOD_EDGE,mx-10,y+1,post-mx+16,1);stroke(c,WOOD,post,y+34,post-26,y+6,3);
   box(c,IRON,mx-5,y+6,10,9);box(c,IRON_LIT,mx-3,y+8,6,5);box(c,IRON,mx-1,y+10,2,2);
  }else if(p.tag==='basket'){
   // The line the rack rides, from a bracket on the laundry's parapet to one on the dye house's.
   const a=l.platforms[p.id-1],b=l.platforms[p.id+1],y=p.y-34,x0=a.x+a.w-6,x1=b.x+4;if(!see(x0,y-10,x1-x0,Math.max(a.y,b.y)-y+20))continue;
   box(c,ROPE,x0,y,x1-x0,1);box(c,'#5c513d',x0,y+1,x1-x0,1);
   for(const [x,foot] of [[x0-2,a.y],[x1-2,b.y]] as const){box(c,IRON,x,y-8,4,foot-y+8);box(c,IRON_LIT,x+1,y-8,1,foot-y+8);box(c,IRON,x-3,foot-3,10,3);}
  }
 }
}
/** Whatever carries a moving landing, at its live position. */
export function laneMover(c:C,p:Platform,x:number,y:number):boolean {
 const w=p.w,travel=p.travel??0,mx=x+Math.round(w/2);
 if(p.tag==='hoist'){
  const top=p.y-travel-44;
  box(c,ROPE,mx,top,1,y-22-top);box(c,'#5c513d',mx+1,top,1,y-22-top);
  box(c,IRON,mx-3,y-24,7,5);box(c,IRON_LIT,mx-2,y-23,2,2);
  stroke(c,ROPE,mx,y-19,x+5,y);stroke(c,ROPE,mx,y-19,x+w-6,y);
 }else if(p.tag==='basket'){
  const line=p.y-34;
  box(c,IRON,mx-6,line-3,12,7);box(c,IRON_LIT,mx-4,line-2,3,3);box(c,IRON_LIT,mx+2,line-2,3,3);
  stroke(c,ROPE,mx-3,line+4,x+4,y);stroke(c,ROPE,mx+3,line+4,x+w-5,y);
  // The wash under the rack: a sheet, a shirt, a stocking, each its own.
  for(const [dx,wide,tall,tone] of [[4,16,22,'#8a94a0'],[23,11,15,'#a39a86'],[37,7,19,'#7d6a66'],[47,17,13,'#9aa39b']] as const){if(dx+wide>w-2)continue;box(c,tone,x+dx,y+9,wide,tall);box(c,'#c9cfc644',x+dx,y+9,wide,1);box(c,'#00000030',x+dx+wide-3,y+10,3,tall-1);}
 }
 return false;
}
