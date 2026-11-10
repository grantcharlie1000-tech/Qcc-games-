import type {Level,Platform,Station} from './levels';
import type {Run} from './model';
import {box,hash,lay,panel,sprite,stroke,visible,type C,type Work} from './quarter-kit';
import {drawRow,farRoof,headTowers,moon,nightSky,row} from './quarter-distance';
import {gardenGate,gardenWall} from './set-bridge';
import {hull,moonPath,ripples,shadowOnWater,sheet,weed} from './set-canal';
import type {QuarterSet} from './quarter-sets';

/** Levels 9 and 10 · the garden bank across the bridge, and the reed beds
 * behind it. Level 9 climbs the bank from the garden gate to the glasshouse:
 * a terrace is ground behind its own retaining wall, built from its top down
 * to the river; where the bank has slipped there is only the old irrigation
 * launder on its trestles; the cistern is a tank with a floor; the hoist
 * rides in a pit between two walls. Level 10 leaves the glasshouse's far end
 * by the water stairs: everything stood on is a pier, a pile head, a board
 * on stakes, a punt, a boathouse, a drowned tree or a piece of the flooded
 * sunken garden, and the water under all of it is lethal. */
const RUBBLE:Work={course:14,short:18,long:44,mortar:'#141a1b',stones:['#2a3334','#2d3637','#303a3a','#283031'],lip:'#3a4646',shade:'#212829',chip:'#465252'};
const LOWER:Work={course:18,short:26,long:60,mortar:'#0f1415',stones:['#1c2425','#1e2627','#202829'],lip:'#252e2f',shade:'#171d1e',chip:'#283233'};
const TANK:Work={course:10,short:16,long:30,mortar:'#0d1112',stones:['#182021','#1a2223','#1c2425','#171e1f'],lip:'#212a2b',shade:'#13191a',chip:'#242e2f'};
const BRICK:Work={course:7,short:11,long:17,mortar:'#191417',stones:['#3a2d2e','#3e3031','#423334','#382b2c'],lip:'#4d3c3a',shade:'#2c2224',chip:'#564440'};
const BOARDS:Work={course:8,short:40,long:90,mortar:'#17110d',stones:['#33281f','#372b21','#3b2e23','#30261d'],lip:'#463729',shade:'#271f18',chip:'#4d3d2e'};
const POLE='#2a231d',POLE_LIT='#5d4f40',IRON='#1a2228',IRON_LIT='#56646b';
/** The glasshouse: iron and glass on a brick dwarf wall, under a curved roof with a cresting, something still warm inside. */
const GLASS_W=224,GLASS_H=124;
const glasshouse=()=>sprite('garden/glasshouse',GLASS_W,GLASS_H,c=>{
 const w=GLASS_W;
 // The roof: glass curving over from the eaves to the ridge, band by band, on its ribs.
 for(let y=6;y<44;y++){const k=(y-6)/38,inset=Math.round(14*(1-Math.sqrt(1-(1-k)*(1-k))));box(c,k<.34?'#3d5a66':k<.7?'#35505c':'#2f4854',inset,y,w-inset*2,1);}
 for(let x=10;x<w-8;x+=12)for(let y=6;y<44;y++){const k=(y-6)/38,inset=Math.round(14*(1-Math.sqrt(1-(1-k)*(1-k))));if(x>inset&&x<w-inset)box(c,'#1a2836',x,y,1,1);}
 box(c,'#1a2836',14,4,w-28,3);box(c,'#4b6972',14,4,w-28,1);for(let x=18;x<w-16;x+=8){box(c,'#1a2836',x,0,2,4);box(c,'#4b6972',x,0,1,1);}
 for(const y of [18,31])box(c,'#1a2836',6,y,w-12,1);
 // The glazed wall on its sill, a mullion to every pane and a transom half way.
 box(c,'#2c4553',0,44,w,52);for(let x=0;x<w;x+=12){box(c,'#1a2836',x,44,2,52);box(c,'#3d5a66',x+2,45,3,22);}
 box(c,'#1a2836',0,44,w,2);box(c,'#4b6972',0,44,w,1);box(c,'#1a2836',0,68,w,2);box(c,'#1a2836',w-2,44,2,52);
 // What grows inside, against the glass, and the stove's light at the far end of the bench.
 for(let x=6,k=0;x<w-10;k++){const v=hash(k,3,87),tall=8+Math.floor(v*22);box(c,'#1c3230',x,96-tall,5+Math.floor(v*6),tall);box(c,'#284440',x+1,96-tall,2,3);x+=9+Math.floor(hash(k,5,87)*12);}
 for(const x of [150,162])box(c,'#a9b377',x+3,74,7,14);box(c,'#d9c98a',166,76,5,9);
 // The dwarf wall: brick under a stone sill, on a plinth course.
 c.save();c.translate(0,98);lay(c,w,26,BRICK,61);c.restore();
 box(c,'#1a2129',-1,94,w+2,5);box(c,'#6d777e',-1,94,w+2,3);box(c,'#9aa3a5',-1,94,w+2,1);box(c,'#120e11',0,99,w,1);
 box(c,'#120e11',0,98,2,26);box(c,'#120e11',w-2,98,2,26);
});
/** The glasshouse door: an iron-framed leaf in the glazed wall, a fanlight over it, a stone step. */
function glassDoor(c:C,x:number,ground:number,lit:boolean,open:boolean){
 if(lit)box(c,'#f3c77a10',x-36,ground-84,72,84);
 box(c,'#1a2836',x-16,ground-66,32,66);box(c,lit?'#c98f4b':'#22363f',x-13,ground-63,26,63);
 if(lit){box(c,'#f0c47a',x-8,ground-58,16,58);box(c,'#fff0c4',x-3,ground-48,6,48);}
 else{box(c,'#2c4553',x-11,ground-61,10,28);box(c,'#2c4553',x+1,ground-61,10,28);box(c,'#1a2836',x-13,ground-32,26,2);}
 for(let px=x-16;px<x+16;px++){const d=(px+.5-x)/16,y=ground-66-Math.round(10*Math.sqrt(Math.max(0,1-d*d)));box(c,'#1a2836',px,y,1,ground-66-y+2);if(Math.abs(d)<.82)box(c,lit?'#e3b160':'#2c4553',px,y+2,1,ground-68-y);}
 box(c,'#1a2836',x-1,ground-76,2,10);
 if(open)box(c,'#fff0c466',x-8,ground-58,16,58);else if(lit){box(c,'#1a2836',x-13,ground-63,5,63);box(c,'#3d5a66',x-12,ground-62,3,61);}
 box(c,'#6d777e',x-20,ground-3,40,3);box(c,'#9aa3a5',x-20,ground-3,40,1);
}
/** A gravel path on its stone kerb, the same on the bank and at the glasshouse. */
function gravel(c:C,w:number,id:number){
 box(c,'#1a2129',-2,0,w+4,10);box(c,'#6f6a5c',-2,0,w+4,8);box(c,'#9a9482',-2,0,w+4,2);box(c,'#57534a',-2,7,w+4,1);
 for(let x=3;x<w-3;x+=7){const v=hash(x,id,5);box(c,v>.5?'#857f6e':'#5f5a4e',x+Math.floor(v*3),3+Math.floor(v*3),2,1);}
}
/** The laid face of a solid, below its 10 px top. */
function face(c:C,w:number,h:number,k:Work,seed:number){
 if(h<=10)return;c.save();c.translate(0,10);lay(c,w,h-10,k,seed);c.restore();box(c,'#0d1213',0,10,2,h-10);box(c,'#0d1213',w-2,10,2,h-10);box(c,'#0b0f1066',0,10,w,4);
}
function ironTread(c:C,w:number){
 box(c,'#12191e',-2,0,w+4,12);box(c,'#aab3ae',0,0,w,1);box(c,'#5d6b70',0,1,w,2);for(let x=3;x<w-3;x+=8){box(c,'#1c272d',x,3,3,7);box(c,'#6d7d80',x,3,1,6);}box(c,'#2f3d43',0,10,w,2);
}
function pile(c:C,x:number,top:number,water:number){
 box(c,'#17110d',x,top,10,water+40-top);box(c,'#4b3a2b',x+1,top,7,water+40-top);box(c,'#6a5440',x+2,top,2,water+40-top);box(c,'#0a141a80',x,water-9,10,9);if(x%4<2)box(c,'#2c4739',x+6,water-5,2,5);
}
function pileHeads(c:C,w:number){
 for(const x of [3,Math.round(w/2)-5,w-13]){box(c,'#17110d',x,0,10,28);box(c,'#4b3a2b',x+1,2,7,26);box(c,'#6a5440',x+2,2,2,26);box(c,'#9a7f5f',x,0,10,2);}
 box(c,'#17110d',0,3,w,7);box(c,'#6b523a',0,3,w,5);box(c,'#b2946d',0,0,w,2);box(c,'#8d704f',0,2,w,1);box(c,'#232c33',0,13,w,4);box(c,'#59666b',0,13,w,1);
}
function planks(c:C,w:number,id:number,rotten:boolean){
 box(c,'#17110d',-1,0,w+2,12);box(c,rotten?'#57493a':'#6b523a',0,0,w,8);box(c,rotten?'#8a7a62':'#b2946d',0,0,w,2);box(c,rotten?'#6a5b48':'#8d704f',0,2,w,1);
 for(let x=9+id%4;x<w-3;x+=11)box(c,rotten?'#231a14':'#3d2e22',x,2,1,6);
 if(rotten){box(c,'#15100c',Math.round(w*.5),0,7,5);box(c,'#4a5a44',5,1,10,1);box(c,'#4a5a44',w-20,6,9,1);}
 box(c,'#33261d',0,8,w,4);box(c,'#4a3828',0,8,w,1);
}

// ───────── Level 9 · the garden bank ─────────
type R9='path'|'terrace'|'block'|'launder'|'cap'|'stump'|'main'|'rung'|'hoist'|'floor';
const role9=(p:Platform):R9=>p.kind==='crumble'?'launder':p.kind==='moving'?'hoist':p.kind==='grate'?'rung':p.h<=12?'main':p.branch?'floor':p.id===0?'path':p.h>28?(p.w>=150?'terrace':'block'):p.w>=64?'stump':'cap';
interface Gap {x0:number;x1:number;top:number;kind:'slip'|'cistern'|'pit';floor:Platform|null}
interface Plan9 {bottom:number;river:number;solids:Platform[];gaps:Gap[];hoist:Platform|null;treads:Platform[]}
const plans9=new WeakMap<Level,Plan9>();
function plan9(l:Level){
 let made=plans9.get(l);if(made)return made;
 const solids=l.platforms.filter(p=>['path','terrace','block'].includes(role9(p))).sort((a,b)=>a.x-b.x),hoist=l.platforms.find(p=>p.kind==='moving')??null,gaps:Gap[]=[];
 for(let i=1;i<solids.length;i++){
  const a=solids[i-1],b=solids[i],x0=a.x+a.w,x1=b.x;if(x1-x0<=8)continue;
  const floor=l.platforms.find(p=>role9(p)==='floor'&&p.x>=x0-2&&p.x+p.w<=x1+2)??null;
  gaps.push({x0,x1,top:Math.min(a.y,b.y),kind:floor?'cistern':hoist&&hoist.x>=x0&&hoist.x+hoist.w<=x1?'pit':'slip',floor});
 }
 made={bottom:l.height+40,river:l.height-64,solids,gaps,hoist,treads:hoist?l.platforms.filter(p=>p.kind==='grate'&&p.x===hoist.x).sort((a,b)=>a.y-b.y):[]};plans9.set(l,made);return made;
}
/** Kitchen-garden things along the back of a terrace, low and dark behind whoever walks it. */
function planting(c:C,p:Platform,l:Level){
 const busy=[...l.stations.map(s=>s.x),...(l.checkpoints??[]).map(k=>k.x+10),...l.pickups.map(k=>k.x),l.exit.x+19,160];
 for(let x=p.x+20,k=0;x<p.x+p.w-22;x+=24,k++){
  const v=hash(k,p.id,31);if(busy.some(b=>Math.abs(b-x)<44))continue;
  if(v<.24){for(let i=0;i<3;i++){box(c,'#2a231d',x+i*6,p.y-26,1,26);box(c,'#22362f',x+i*6-1,p.y-22+i*5,3,4);box(c,'#2c4739',x+i*6-1,p.y-12-i*2,3,3);}box(c,'#2a231d',x-1,p.y-27,15,1);}
  else if(v<.44){for(let y=-8;y<=0;y++){const sx=Math.floor(Math.sqrt(64-y*y));box(c,y<-4?'#22362f':'#1b2b2c',x+7-sx,p.y-1+y-1,sx*2,1);}}
  else if(v<.56){box(c,'#31505c',x+2,p.y-11,9,11);box(c,'#4b6972',x+2,p.y-11,9,1);box(c,'#31505c',x+4,p.y-14,5,3);box(c,'#4b6972',x+3,p.y-9,1,6);}
  else if(v<.64){box(c,'#4a3330',x+3,p.y-8,8,8);box(c,'#644640',x+2,p.y-9,10,2);box(c,'#22362f',x+5,p.y-14,4,5);}
 }
}
function trestle(c:C,p:Platform,bottom:number,stout:boolean){
 const a=p.x+7,b=p.x+p.w-11;
 for(const x of stout?[a,Math.round(p.x+p.w/2)-2,b]:[a,b]){box(c,POLE,x,p.y+10,4,bottom-p.y-10);box(c,POLE_LIT,x,p.y+10,1,bottom-p.y-10);}
 for(let y=p.y+44,i=0;y<bottom;y+=68,i++){box(c,POLE,a,y,b-a+4,3);box(c,POLE_LIT,a,y,b-a+4,1);stroke(c,POLE,i%2?a+2:b+2,y+3,i%2?b+2:a+2,y+68,2);}
 box(c,POLE,p.x+2,p.y+10,p.w-4,4);box(c,POLE_LIT,p.x+2,p.y+10,p.w-4,1);
}
function back9(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number){
 const pl=plan9(l),{bottom,river}=pl,left=cx-24,right=cx+vw+24,low=cy+vh+24,first=l.platforms[0],last=l.platforms[l.mainCount-1];
 // The river at the foot of the bank.
 if(low>river){box(c,'#132a35',left,river,vw+48,low-river);for(let x=Math.floor(left/38)*38;x<right;x+=38){box(c,'#335865',x+Math.floor(hash(x,3,9)*20),river+3+Math.floor(hash(x,5,9)*18),12,1);}box(c,'#3f5a63',left,river,vw+48,1);}
 for(const g of pl.gaps){
  if(g.x1<left||g.x0>right)continue;
  if(g.kind==='slip'){
   // Where the bank went: its raw earth a little way down and further back, boulders and roots in it, the wall ends torn either side.
   for(let x=g.x0;x<g.x1;x+=8){const k=(x-g.x0)/(g.x1-g.x0),sag=Math.sin(k*Math.PI),y=g.top+70+Math.round(sag*150)+Math.floor(hash(x,g.x0,41)*14);box(c,'#101617',x,y,8,river-y);box(c,'#1a2223',x,y,8,2);if(hash(x,g.x0,43)>.7){box(c,'#222b2c',x+1,y+10+Math.floor(hash(x,g.x0,45)*60),6,4);box(c,'#2d3839',x+1,y+10+Math.floor(hash(x,g.x0,45)*60),5,1);}}
   for(let i=0;i<6;i++){const v=hash(i,g.x0,47),x=g.x0+20+Math.floor(v*(g.x1-g.x0-40)),y=g.top+150+Math.floor(hash(i,g.x0,49)*120);stroke(c,'#241d18',x,y,x+10+Math.floor(v*18),y+26,1);}
   for(const side of [0,1])for(let y=g.top+8,k=0;y<g.top+150;y+=14,k++){const wide=4+Math.floor(hash(k,g.x0+side,51)*12);box(c,'#2a3334',side?g.x1-wide:g.x0,y,wide,13);box(c,'#3a4646',side?g.x1-wide:g.x0,y,wide,1);}
  }else if(g.kind==='cistern'&&g.floor){
   // The cistern: a lined tank, dry, stained to its old water line, its inlet high in the west wall and rungs up the east.
   const f=g.floor;c.drawImage(panel(`garden/tank/${l.id}`,g.x1-g.x0,f.y-g.top-8,TANK,31),g.x0,g.top+8);
   box(c,'#080b0c8c',g.x0,g.top+8,8,f.y-g.top-8);box(c,'#080b0c8c',g.x1-6,g.top+8,6,f.y-g.top-8);
   for(let x=g.x0;x<g.x1;x+=16){const v=hash(x>>4,7,53);box(c,'#0a100f73',x,f.y-70-Math.floor(v*4)*5,16,70+Math.floor(v*4)*5);}
   box(c,'#1c2a26',g.x0,f.y-74,g.x1-g.x0,2);
   // The tank's far rim: a coping the lining stops under.
   box(c,'#141a1b',g.x0,g.top+6,g.x1-g.x0,8);box(c,'#46525f',g.x0,g.top+7,g.x1-g.x0,5);box(c,'#6b7782',g.x0,g.top+7,g.x1-g.x0,1);
   const ax=g.x0+46;for(let px=-18;px<18;px++){const d=(px+.5)/18,y=g.top+70-Math.round(14*Math.sqrt(Math.max(0,1-d*d)));box(c,'#3a4646',ax+px,y-3,1,3);box(c,'#06090a',ax+px,y,1,g.top+96-y);}box(c,'#3a4646',ax-20,g.top+96,40,4);box(c,'#16231d',ax-4,g.top+100,8,f.y-g.top-100);
  }else{
   // The hoist's pit: a shaft between the terrace wall and the high wall, down to the river.
   box(c,'#0b0f10',g.x0,g.top+8,g.x1-g.x0,river-g.top-8);for(let y=g.top+30;y<river;y+=46)box(c,'#141a1b',g.x0,y,g.x1-g.x0,2);
  }
 }
 for(const p of pl.solids){
  if(!visible(p.x,p.y-40,p.w,bottom-p.y+40,cx,cy,vw,vh))continue;
  // Below what the collision knows, the same wall goes on down to the river in heavier, darker work.
  const y0=p.y+p.h,hh=Math.min(440,bottom-y0);if(hh>0&&y0<low){c.drawImage(panel(`garden/lower/${l.id}/${p.id}`,p.w,hh,LOWER,p.id*11+3),p.x,y0);box(c,'#0b0f10',p.x,y0,2,hh);box(c,'#0b0f10',p.x+p.w-2,y0,2,hh);if(y0+hh<bottom)box(c,'#0f1415',p.x,y0+hh,p.w,bottom-y0-hh);}
  if(role9(p)==='terrace')planting(c,p,l);
 }
 for(const g of pl.gaps)if(g.floor&&visible(g.floor.x,g.floor.y,g.floor.w,bottom-g.floor.y,cx,cy,vw,vh)){const f=g.floor,y0=f.y+f.h,hh=Math.min(300,bottom-y0);c.drawImage(panel(`garden/under/${l.id}`,f.w,hh,LOWER,77),f.x,y0);}
 // Inside the garden gate: the wall along the bank path, and the gate you came in by.
 if(left<first.x+first.w+20){gardenWall(c,0,l.platforms[1].x,first.y,76);gardenGate(c,76,first.y,false);}
 // The glasshouse on the top terrace.
 const gx=Math.round(l.exit.x+l.exit.w/2)-90;if(visible(gx,last.y-GLASS_H,GLASS_W,GLASS_H,cx,cy,vw,vh))c.drawImage(glasshouse(),gx,last.y-GLASS_H);
 if(pl.hoist){
  // The water-balance hoist: two guides up the pit with the treads between them, a head beam and its pulley.
  const h=pl.hoist,head=(pl.treads[0]?.y??h.y-(h.travel??0))-58;
  if(visible(h.x-12,head-10,h.w+24,river-head,cx,cy,vw,vh)){
   for(const x of [h.x-7,h.x+h.w+3]){box(c,'#12181d',x,head,4,river-head);box(c,'#5a686b',x+1,head,1,river-head);for(let y=Math.floor(Math.max(head,cy-24)/64)*64;y<Math.min(river,low);y+=64)box(c,'#0d1216',x-2,y,8,4);}
   box(c,'#12181d',h.x-12,head-8,h.w+24,8);box(c,'#4f5f66',h.x-12,head-8,h.w+24,1);
   const mx=h.x+Math.round(h.w/2);for(let y=-7;y<=7;y++){const sx=Math.floor(Math.sqrt(49-y*y));box(c,'#262d33',mx-sx,head+8+y,sx*2,1);}box(c,'#59666b',mx-2,head+6,4,4);
  }
 }
 for(const p of l.platforms){
  const k=role9(p);if(k==='path'||k==='terrace'||k==='block'||k==='floor'||k==='hoist')continue;
  if(!visible(p.x-70,p.y-20,p.w+140,bottom-p.y+20,cx,cy,vw,vh))continue;
  if(k==='launder')trestle(c,p,river,false);
  else if(k==='cap')trestle(c,p,river,true);
  else if(k==='stump'){const hh=Math.min(440,river-p.y-20);c.drawImage(panel(`garden/stump/${l.id}/${p.id}`,p.w-8,hh,RUBBLE,p.id*7),p.x+4,p.y+20);box(c,'#0d1213',p.x+4,p.y+20,2,hh);box(c,'#0d1213',p.x+p.w-6,p.y+20,2,hh);}
  else if(k==='main'){
   // The inlet main: over the wall on a saddle, and out across the tank on one cast column off its floor.
   const floor=pl.gaps.find(g=>g.floor&&p.x+p.w>g.x0&&p.x<g.x1)?.floor,col=p.x+p.w-40;
   box(c,'#0d1216',p.x-10,p.y+10,22,8);box(c,'#3f4c52',p.x-10,p.y+10,22,1);
   if(floor){box(c,'#12181d',col,p.y+12,8,floor.y-p.y-12);box(c,'#3f4c52',col+1,p.y+12,2,floor.y-p.y-12);box(c,'#12181d',col-5,p.y+12,18,5);box(c,'#12181d',col-5,floor.y-6,18,6);for(let y=p.y+60;y<floor.y-20;y+=56)box(c,'#0d1216',col-2,y,12,3);}
  }else if(k==='rung'){
   if(pl.treads.includes(p))continue;
   const wall=pl.solids.find(q=>q.x>=p.x+p.w-2&&q.x-(p.x+p.w)<=60&&q.y<=p.y+8);
   if(wall){box(c,IRON,p.x+p.w-2,p.y+3,wall.x-p.x-p.w+2,4);box(c,IRON_LIT,p.x+p.w-2,p.y+3,wall.x-p.x-p.w+2,1);stroke(c,IRON,wall.x,p.y+36,p.x+p.w-14,p.y+11,2);box(c,IRON_LIT,wall.x-2,p.y+34,4,4);}
   else{const below=l.platforms.find(q=>q!==p&&q.kind!=='grate'&&q.x<p.x+p.w&&q.x+q.w>p.x&&q.y>p.y&&q.y-p.y<=96);if(below){const mx=Math.round(p.x+p.w/2)-3;box(c,POLE,mx,p.y+10,6,below.y-p.y-10);box(c,POLE_LIT,mx,p.y+10,1,below.y-p.y-10);stroke(c,POLE,mx+3,p.y+34,p.x+4,p.y+11,2);stroke(c,POLE,mx+3,p.y+34,p.x+p.w-5,p.y+11,2);}}
  }
 }
}
function deck9(c:C,p:Platform,l:Level){
 const w=p.w,k=role9(p);
 if(k==='launder'){
  // A length of the launder: a timber trough on bearers, soft with rot, a side board sprung.
  box(c,'#15100c',-1,0,w+2,12);box(c,'#57493a',0,0,w,9);box(c,'#8a7a62',0,0,w,2);box(c,'#3a2f25',2,2,w-4,5);box(c,'#1c2a26',3,4,w-6,3);
  for(let x=10+p.id%5;x<w-6;x+=14)box(c,'#231a14',x,0,1,9);box(c,'#4a5a44',6,1,12,1);box(c,'#15100c',Math.round(w*.6),0,8,3);
  box(c,'#2a231d',0,9,w,3);for(const x of [4,w-12]){box(c,'#17110d',x,9,8,10);box(c,'#3d2e22',x+1,10,6,8);}
  return;
 }
 if(k==='hoist'){
  // The hoist's deck on its tank: boards in an iron frame over a riveted cistern that fills and empties.
  box(c,'#0d1216',-1,0,w+2,28);box(c,'#6b523a',0,0,w,7);box(c,'#b3946a',0,0,w,2);for(let x=10;x<w-3;x+=12)box(c,'#3d2e22',x,2,1,5);
  box(c,'#26333a',2,7,w-4,21);box(c,'#4f5f66',2,7,w-4,2);for(let x=8;x<w-6;x+=12){box(c,'#7d8c8e',x,12,2,2);box(c,'#7d8c8e',x,22,2,2);}box(c,'#31505c',6,16,w-12,3);box(c,'#161d22',2,26,w-4,2);
  return;
 }
 if(k==='rung'){ironTread(c,w);return;}
 if(k==='main'){
  // A riveted iron main, flanged, lit along its top.
  box(c,'#0d1216',0,0,w,12);box(c,'#26333a',0,1,w,10);box(c,'#4f5f66',0,2,w,3);box(c,'#7d8c8e',0,0,w,2);box(c,'#161d22',0,9,w,3);
  for(let x=34;x<w-20;x+=42){box(c,'#161d22',x,0,3,12);box(c,'#5a686b',x+3,1,1,10);}box(c,'#0d1216',w-6,-2,7,16);box(c,'#3f4c52',w-5,-1,5,14);box(c,'#6a4532',w-4,3,3,6);
  return;
 }
 if(k==='cap'){
  // The cap of a trestle bent: one squared baulk, strapped to its posts.
  box(c,'#15100c',-1,0,w+2,28);box(c,'#57432f',0,0,w,12);box(c,'#b2946d',0,0,w,2);box(c,'#8d704f',0,2,w,1);box(c,'#3d2e22',0,12,w,8);box(c,'#2a231d',0,20,w,8);
  for(const x of [5,w-9]){box(c,'#232c33',x,0,4,24);box(c,'#59666b',x,0,1,24);}for(let x=16;x<w-14;x+=9)box(c,'#3d2e22',x,4,1,7);
  return;
 }
 if(k==='stump'){
  // What is left of a terrace wall in the slip: a stump of it, its top course loose.
  c.save();c.translate(0,8);lay(c,w,20,RUBBLE,p.id*5);c.restore();box(c,'#6b7782',0,0,w,2);box(c,'#46525f',0,2,w,6);box(c,'#141a1b',Math.round(w*.3),0,3,8);box(c,'#141a1b',Math.round(w*.7),0,2,8);box(c,'#0d1213',0,8,2,20);box(c,'#0d1213',w-2,8,2,20);
  return;
 }
 if(k==='floor'){
  // The tank's floor: flags under a skin of silt, a puddle in the low corner.
  face(c,w,p.h,TANK,p.id*13+5);box(c,'#141a1b',0,0,w,10);for(let x=0;x<w;x+=34){box(c,(x/34|0)%2?'#2a3334':'#262f30',x,2,33,8);box(c,'#343f40',x,2,33,1);}
  box(c,'#3a3a30',0,0,w,2);box(c,'#132a35',Math.round(w*.62),1,46,2);box(c,'#3f5a63',Math.round(w*.62)+6,1,18,1);
  return;
 }
 face(c,w,p.h,RUBBLE,p.id*13+5);
 if(k==='path'){gravel(c,w,p.id);return;}
 // A terrace: turf to a stone kerb at its edge. A stair block is the same wall with a tread on it.
 box(c,'#141a1b',-1,0,w+2,10);
 if(k==='block'){box(c,'#6d777e',-1,0,w+2,8);box(c,'#9aa3a5',-1,0,w+2,2);box(c,'#4d575e',-1,8,w+2,2);for(let x=20;x<w-6;x+=26)box(c,'#4d575e',x,2,1,6);}
 else{box(c,'#27382f',0,0,w,9);box(c,'#3d5a44',0,0,w,2);for(let x=4;x<w-4;x+=9){const v=hash(x,p.id,9);if(v>.4)box(c,'#52745a',x,0,2,1);if(v>.8)box(c,'#22362f',x+2,3,3,2);}
  for(const x of [-1,w-11]){box(c,'#6d777e',x,0,12,9);box(c,'#9aa3a5',x,0,12,2);box(c,'#4d575e',x,8,12,1);}}
 // Weep holes through a high wall, each with its stain, and ivy over its head here and there.
 if(p.h>100)for(let x=38;x<w-24;x+=86){box(c,'#080b0c',x,44,4,5);box(c,'#141d1b',x,49,4,38);}
 if(p.h>60)for(let x=24,i=0;x<w-30;x+=74,i++){if(hash(i,p.id,71)<.5)continue;for(let j=0;j<4;j++){const hang=8+Math.floor(hash(i*7+j,p.id,73)*26);box(c,j%2?'#2c4739':'#3a5a44',x+j*5,9,4,hang);box(c,'#52745a',x+j*5+1,9+Math.floor(hang*.5),2,2);}}
}
function station9(c:C,l:Level,s:Station,x:number,y:number,lit:boolean,t:number){
 // An irrigation wheel: a handwheel on the spindle of a sluice, over the stone mouth of its rill.
 x=Math.round(x);const turn=lit?Math.PI/5+t*.2:0;
 box(c,'#1a2129',x-16,y-10,32,10);box(c,'#56626e',x-15,y-9,30,8);box(c,'#7a8690',x-15,y-9,30,1);box(c,'#0b1016',x-7,y-6,14,6);if(lit){box(c,'#31505c',x-6,y-4,12,4);box(c,'#6f9a94',x-5,y-4,6,1);}
 box(c,'#12181d',x-2,y-44,5,34);box(c,'#3f4c52',x-1,y-44,2,34);for(let yy=y-40;yy<y-12;yy+=4)box(c,'#26333a',x-2,yy,5,1);
 for(let yy=-12;yy<=12;yy++){const out=Math.floor(Math.sqrt(144-yy*yy)),hole=Math.abs(yy)<9?Math.floor(Math.sqrt(81-yy*yy)):0;box(c,lit?'#7d9c86':'#8c7648',x-out,y-52+yy,out*2,1);if(hole)box(c,'#1a2224',x-hole,y-52+yy,hole*2,1);}
 for(let i=0;i<5;i++){const a=turn+i*Math.PI*2/5;stroke(c,lit?'#b7c8a4':'#b79a5c',x,y-52,x+Math.cos(a)*10,y-52+Math.sin(a)*10,2);}box(c,'#12181d',x-2,y-54,4,4);
}
const FAR_WALL='#1a2434';
const farQuarter=row(34,71,96,(c,i,w,h)=>farRoof(c,w,40,h,i+300,FAR_WALL,'#28364f','#b98a4a'),()=>FAR_WALL);
function sky9(c:C,l:Level,w:number,h:number,cx:number,cy:number,t:number,ending:boolean){
 // Behind the bank is the way you came: the river, the Quarter along its far side, the towers. It sinks as you climb.
 const horizon=Math.round(h*.6+(700-cy)*.14);
 nightSky(c,w,h,ending,cx,t);moon(c,Math.round(w*.78-cx*.01),Math.max(48,Math.min(Math.round(h*.24),horizon-150)));
 c.drawImage(headTowers(),Math.round(w*.2-cx*.012),horizon-236);
 drawRow(c,farQuarter,w,cx*.02,()=>horizon,horizon);
 if(horizon<h){box(c,'#18303b',0,horizon,w,h-horizon);box(c,'#2b384c',0,horizon,w,1);for(let i=0;i<14;i++){const y=horizon+3+i*i+i*4;if(y>=h)break;for(let x=((i*53-Math.round(cx*(.03+i*.01)))%90+90)%90-90;x<w;x+=90)box(c,i%2?'#335865':'#264754',x+Math.floor(hash(i,x,13)*30),y,6+i*2,1);}}
}
function exit9(c:C,l:Level,s:Run,t:number,front:boolean){
 if(front)return;glassDoor(c,Math.round(l.exit.x+l.exit.w/2),l.exit.y+l.exit.h,true,s.phase!=='playing');
}
function mover9(c:C,p:Platform,x:number,y:number,l:Level){
 const pl=plan9(l),head=(pl.treads[0]?.y??p.y-(p.travel??0))-58,mid=Math.round(x+p.w/2);
 for(let yy=head+16;yy<y-2;yy+=6)box(c,(yy/6|0)%2?'#59666b':'#2c353b',mid-1,yy,3,4);
 for(const xx of [x-7,x+p.w+3]){box(c,'#3d4a51',xx,y+2,5,8);box(c,'#3d4a51',xx,y+18,5,8);}
}
export const gardenBank:QuarterSet={sky:sky9,back:back9,deck:deck9,exit:exit9,station:station9,mover:mover9,depth:p=>role9(p)==='launder'?8:0};

// ───────── Level 10 · the reed beds and the sunken garden ─────────
const R10=['path','landing','stone','punt','pile','pile','board','board','stage','rung','rung','rung','roof','post','stone','punt','islet','bough','bough','pier','wall','beam','beam','plinth','island','urn','bowl','wall','urn','beam','punt','stone','board','board','sluice','cascade','cascade','cascade','bank'] as const;
const B10=['arm','arm','stone','stone','shelf'] as const;
type R10T=typeof R10[number]|typeof B10[number];
const role10=(p:Platform,l:Level):R10T=>p.branch?B10[p.id-l.mainCount]??'stone':R10[p.id]??'stone';
const reedClump=(k:number)=>sprite(`reed/clump/${k}`,44,76,c=>{
 for(let i=0;i<10;i++){const v=hash(i,k,3),x=5+Math.floor(v*34),tall=30+Math.floor(hash(i,k,5)*42),lean=Math.round((hash(i,k,7)-.5)*12);stroke(c,i%3?'#1f322c':'#2a4337',x,76,x+lean,76-tall,1);if(hash(i,k,9)>.55){box(c,'#3d3026',x+lean-1,76-tall-7,2,8);box(c,'#57432f',x+lean-1,76-tall-7,1,3);}else box(c,'#35543f',x+lean,76-tall,3,1);}
});
const willow=()=>sprite('reed/willow',230,250,c=>{
 // A pollard willow that drowned when the beds filled: trunk, two great boughs, and what withies it still has.
 for(let y=40;y<250;y++){const wide=10+Math.round((y-40)/210*8);box(c,'#231a14',60-wide/2,y,wide,1);box(c,'#3d2e22',60-wide/2,y,3,1);}
 for(let y=60;y<240;y+=13)box(c,'#17110d',56+((y/13|0)%2)*5,y,4,6);
 for(const [x0,y0,x1,y1,th] of [[60,44,22,8,4],[60,40,110,0,4],[60,60,170,22,3],[30,24,8,34,2],[100,10,140,18,2],[60,90,10,70,3]] as const)stroke(c,'#231a14',x0,y0,x1,y1,th);
 for(let i=0;i<26;i++){const v=hash(i,5,95),x=6+Math.floor(v*190),y=6+Math.floor(hash(i,7,95)*40),len=24+Math.floor(hash(i,9,95)*56);box(c,i%2?'#2a4337':'#1f322c',x,y,1,len);if(i%3===0)box(c,'#35543f',x,y+len,1,3);}
});
function stonePier(c:C,l:Level,p:Platform,water:number,work:Work=RUBBLE){
 const top=p.y+8;c.drawImage(panel(`reed/pier/${l.id}/${p.id}`,p.w,water+40-top,work,p.id*9+1),p.x,top);box(c,'#0d1213',p.x,top,2,water+40-top);box(c,'#0d1213',p.x+p.w-2,top,2,water+40-top);weed(c,p.x,p.w,water,p.id);
}
function back10(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number){
 const water=l.water!,left=cx-24,right=cx+vw+24,first=l.platforms[0],last=l.platforms[l.mainCount-1],at=(k:R10T)=>l.platforms.filter(p=>role10(p,l)===k);
 // Reeds stand in the water behind everything, thick in the beds and thin in the garden.
 for(let i=Math.floor(left/38)-1;i*38<right;i++){const v=hash(i,3,97),x=i*38+Math.floor(v*16);if(v<.3||x<first.x+first.w)continue;c.drawImage(reedClump(Math.floor(v*4)),x,water-70+Math.floor(hash(i,5,97)*8));}
 // The glasshouse's far end, on the path you left it by.
 if(left<200){c.drawImage(glasshouse(),-96,first.y-GLASS_H);glassDoor(c,60,first.y,true,false);}
 const roof=at('roof')[0];
 if(roof&&visible(roof.x-70,roof.y-40,roof.w+90,water+60-roof.y,cx,cy,vw,vh)){
  // The boathouse: weatherboard on a pile frame, a loft door under the gable, the boat door at the water with a punt inside it.
  const x0=roof.x,x1=roof.x+roof.w,top=roof.y+26;
  for(const x of [x0+6,x0+Math.round(roof.w/2)-5,x1-16])pile(c,x,water-40,water);
  c.drawImage(panel(`reed/boathouse/${l.id}`,roof.w,water-30-top,BOARDS,19),x0,top);box(c,'#17110d',x0,top,3,water-30-top);box(c,'#17110d',x1-3,top,3,water-30-top);box(c,'#17110d',x0,water-34,roof.w,5);box(c,'#4d3d2e',x0,water-34,roof.w,1);
  box(c,'#0b0d0f',x0+100,top+26,34,44);box(c,'#2b2018',x0+102,top+28,30,42);for(const x of [x0+111,x0+121])box(c,'#17110d',x,top+28,1,42);box(c,'#17110d',x0+94,top+20,58,5);box(c,'#4d3d2e',x0+94,top+20,58,1);box(c,'#59666b',x0+146,top+25,2,10);
  box(c,'#0b0d0f',x0+30,top+40,22,26);box(c,'#1a2633',x0+32,top+42,18,22);box(c,'#17110d',x0+40,top+42,2,22);box(c,'#4d3d2e',x0+28,top+66,26,3);
  for(let px=0;px<84;px++){const d=(px+.5-42)/42,y=water-44-Math.round(34*Math.sqrt(Math.max(0,1-d*d)));box(c,'#4d3d2e',x0+62+px,y-2,1,2);box(c,'#06090b',x0+62+px,y,1,water-30-y);}
  box(c,'#2c2119',x0+78,water-40,56,10);box(c,'#7a6048',x0+76,water-42,60,2);
  // The ladder up its west wall: two stiles the rungs are housed into.
  const rungs=at('rung');if(rungs.length){const lo=Math.max(...rungs.map(r=>r.y)),hi=Math.min(...rungs.map(r=>r.y));for(const x of [rungs[0].x+2,rungs[0].x+rungs[0].w-5]){box(c,POLE,x,hi-20,3,lo-hi+60);box(c,POLE_LIT,x,hi-20,1,lo-hi+60);}for(const r of rungs){box(c,POLE,r.x+r.w-2,r.y+4,roof.x-r.x-r.w+4,3);}}
 }
 const islet=at('islet')[0];if(islet&&visible(islet.x-70,islet.y-230,250,330,cx,cy,vw,vh))c.drawImage(willow(),islet.x-28,islet.y-246);
 const island=at('island')[0];
 if(island&&visible(island.x,island.y-150,island.w,150,cx,cy,vw,vh)){
  // The summerhouse: four posts and a shingled roof on the island, a bench along its back rail.
  const mid=Math.round(island.x+island.w/2),y=island.y;
  for(let k=0;k<44;k++){const half=Math.round(112*(1-k/44))+2;box(c,(k>>2)%2?'#2f3a40':'#2a3439',mid-half,y-76-k,half*2,1);if(k%4===0)for(let x=mid-half+3;x<mid+half-3;x+=9)box(c,'#1f272c',x,y-76-k,1,4);}
  box(c,'#15100c',mid-116,y-76,232,5);box(c,'#57432f',mid-116,y-76,232,1);box(c,'#15100c',mid-2,y-126,4,8);
  for(const x of [mid-104,mid-40,mid+36,mid+100]){box(c,POLE,x,y-71,5,71);box(c,POLE_LIT,x,y-71,1,71);stroke(c,POLE,x+2,y-56,x+(x<mid?16:-12),y-71,2);}
  box(c,POLE,mid-104,y-30,208,3);box(c,POLE_LIT,mid-104,y-30,208,1);for(let x=mid-96;x<mid+100;x+=10)box(c,POLE,x,y-27,1,27);
  box(c,'#3d2e22',mid+44,y-14,52,4);box(c,'#57432f',mid+44,y-14,52,1);for(const x of [mid+48,mid+90])box(c,'#2a231d',x,y-10,3,10);
 }
 // The garden's east end: the orchard wall along the upper bank, and the return it stops against.
 if(right>last.x-40){
  const end=last.x+last.w,x1=l.width+40,rt=last.y-150;gardenWall(c,last.x+4,end,last.y,l.exit.x+l.exit.w/2);
  c.drawImage(sprite(`reed/orchard/${l.id}`,last.w,80,o=>{for(let x=30,k=0;x<last.w-20;k++){const v=hash(k,9,99),r=14+Math.floor(v*10);if(Math.abs(last.x+x-l.exit.x-19)>46){box(o,'#141d1f',x-2,80-r,4,r);for(let yy=-r;yy<=r;yy++){const sx=Math.floor(Math.sqrt(r*r-yy*yy));box(o,(yy+r)%9<4?'#1b2b2c':'#182728',x-sx,80-r*2+yy,sx*2,1);}box(o,'#a9763f',x-4,80-r*2+6,2,2);}x+=40+Math.floor(hash(k,7,99)*30);}}),last.x,last.y-138);
  c.drawImage(panel(`reed/return/${l.id}`,x1-end,water+40-rt,BRICK,end+3),end,rt);box(c,'#1a2129',end-3,rt-6,x1-end+3,7);box(c,'#6d777e',end-3,rt-6,x1-end+3,5);box(c,'#9aa3a5',end-3,rt-6,x1-end+3,1);
  for(let y=rt+2,k=0;y<water;y+=13,k++){const wide=k%2?16:10;box(c,'#46525f',end,y,wide,12);box(c,'#6b7782',end,y,wide,1);}
 }
 for(const p of l.platforms){
  const k=role10(p,l);if(!visible(p.x-60,p.y-90,p.w+120,water+90-p.y+90,cx,cy,vw,vh))continue;
  if(k==='path'||k==='landing'||k==='stone'||k==='pier'||k==='plinth'||k==='islet'||k==='cascade'||k==='bank'||k==='island')stonePier(c,l,p,water);
  else if(k==='wall')stonePier(c,l,p,water,BRICK);
  else if(k==='pile'||k==='post'){for(const x of [p.x+3,Math.round(p.x+p.w/2)-5,p.x+p.w-13])pile(c,x,p.y+20,water);if(k==='post')for(let y=p.y+44;y<water-30;y+=48){stroke(c,POLE,p.x+8,y,p.x+p.w-8,y+36,2);box(c,'#232c33',p.x+2,y-5,p.w-4,3);}}
  else if(k==='board'){for(const x of [p.x+6,p.x+p.w-10]){box(c,POLE,x,p.y+10,4,water+30-p.y);box(c,POLE_LIT,x,p.y+10,1,water+30-p.y);}}
  else if(k==='stage'){
   // The eel stage: staging on piles, braced, with wicker traps hung to dry off its rail.
   const a=p.x+6,b=p.x+p.w-16;pile(c,a,p.y+10,water);pile(c,b,p.y+10,water);stroke(c,POLE,a+5,p.y+14,b+5,water-6,2);stroke(c,POLE,b+5,p.y+14,a+5,water-6,2);
   box(c,POLE,p.x+8,p.y-30,2,30);box(c,POLE,p.x+p.w-10,p.y-30,2,30);box(c,POLE,p.x+8,p.y-30,p.w-16,2);
   for(const x of [p.x+26,p.x+52,p.x+78]){box(c,'#6d6248',x+3,p.y-28,1,6);for(let yy=0;yy<16;yy++){const half=yy<4?1+yy:yy<12?5:16-yy;box(c,yy%3?'#4a3a2c':'#5d4f40',x+4-half,p.y-22+yy,half*2,1);}}
  }else if(k==='punt'){
   // A punt on a rope between two stakes: the rope is what brings it back.
   const tr=p.travel??0,a=p.x-tr-26,b=p.x+p.w+tr+22;for(const x of [a,b]){box(c,'#17110d',x,p.y-24,5,water+30-p.y+24);box(c,'#6a5440',x+1,p.y-24,2,water+30-p.y+24);}
   for(let x=a+5;x<b;x+=4)box(c,'#8a7a5a',x,p.y-14+Math.round(Math.sin((x-a)/(b-a)*Math.PI)*4),3,1);
  }else if(k==='beam'){
   // A length of the pergola: two stone columns standing in the flooded garden, a rose gone wild up one.
   for(const x of [p.x+8,p.x+p.w-20]){box(c,'#1a222b',x,p.y+8,12,water+40-p.y-8);box(c,'#46525f',x+1,p.y+8,10,water+40-p.y-8);box(c,'#6b7782',x+1,p.y+8,2,water+40-p.y-8);box(c,'#56626e',x-2,p.y+8,16,5);box(c,'#7a8690',x-2,p.y+8,16,1);box(c,'#0a141a80',x,water-8,12,8);}
   for(let y=p.y+16;y<water-10;y+=9){box(c,'#2c4739',p.x+6+((y/9|0)%2)*3,y,3,5);}box(c,'#8c4a4a',p.x+7,p.y+30,2,2);box(c,'#8c4a4a',p.x+10,p.y+58,2,2);
  }else if(k==='urn'||k==='bowl'){
   // The fountain: a pedestal at the basin's edge, and the shaft that carried the upper bowl, both standing in what was the basin.
   const mid=Math.round(p.x+p.w/2),top=p.y+26;for(let y=top;y<water+40;y++){const kk=(y-top)/(water-top),half=k==='bowl'?Math.round(6+5*Math.sin(kk*9)+kk*8):Math.round(p.w/2-6+kk*4);box(c,'#46525f',mid-half,y,half*2,1);box(c,'#6b7782',mid-half,y,2,1);box(c,'#2c353f',mid+half-2,y,2,1);}
   box(c,'#0a141a80',p.x,water-8,p.w,8);
  }else if(k==='sluice'){
   // The garden's outlet sluice: a timber gate in an iron frame, its screw run right up.
   for(const x of [p.x+2,p.x+p.w-10]){box(c,'#0d1216',x,p.y+10,8,water+40-p.y-10);box(c,'#26333a',x+1,p.y+10,5,water+40-p.y-10);box(c,'#4f5f66',x+1,p.y+10,1,water+40-p.y-10);}
   box(c,'#2b2018',p.x+10,p.y+22,p.w-20,water-p.y-34);for(let y=p.y+30;y<water-16;y+=9)box(c,'#17110d',p.x+10,y,p.w-20,1);box(c,'#0b0d0f',p.x+10,water-12,p.w-20,12);
   const mx=Math.round(p.x+p.w/2);box(c,'#0d1216',mx-2,p.y-30,4,30);for(let y=p.y-28;y<p.y-2;y+=4)box(c,'#34424a',mx-2,y,4,1);box(c,'#0d1216',mx-10,p.y-34,20,5);box(c,'#7d8c8e',mx-10,p.y-34,20,1);
  }else if(k==='arm'){
   // A mooring post with a cross-arm.
   pile(c,Math.round(p.x+p.w/2)-5,p.y+8,water);
  }else if(k==='shelf'){
   // A bird table on its own post beside the summerhouse.
   const mx=Math.round(p.x+p.w/2);box(c,POLE,mx-2,p.y+10,5,96);box(c,POLE_LIT,mx-2,p.y+10,1,96);stroke(c,POLE,mx,p.y+28,p.x+4,p.y+11,2);stroke(c,POLE,mx,p.y+28,p.x+p.w-5,p.y+11,2);
  }
 }
}
function deck10(c:C,p:Platform,l:Level){
 const w=p.w,k=role10(p,l);
 if(k==='path'){gravel(c,w,p.id);return;}
 if(k==='pile'||k==='post'){pileHeads(c,w);return;}
 if(k==='board'){planks(c,w,p.id,true);return;}
 if(k==='stage'||k==='rung'||k==='arm'||k==='shelf'){planks(c,w,p.id,false);return;}
 if(k==='punt'){hull(c,w,36);box(c,'#3a2d23',8,3,w-16,5);for(let x=14;x<w-12;x+=14)box(c,'#57432f',x,3,10,4);return;}
 if(k==='roof'){
  // The boathouse roof: tarred felt lapped in courses to a timber eave.
  box(c,'#15110e',-3,0,w+6,28);box(c,'#2b3137',-3,0,w+6,14);for(let x=-3;x<w;x+=22){box(c,'#343b42',x,0,21,6);box(c,'#3e464e',x,0,21,1);box(c,'#262c32',x+10,7,21,6);}
  box(c,'#8a949b',-3,0,w+6,1);box(c,'#3a2d23',-3,14,w+6,8);box(c,'#57432f',-3,14,w+6,1);for(let x=4;x<w-4;x+=16)box(c,'#241b15',x,17,6,5);box(c,'#15110e',-3,22,w+6,6);return;
 }
 if(k==='bough'){
  // A bough of the willow: bark, a split along it, a knuckle where a branch was lopped.
  box(c,'#17110d',-2,0,w+4,12);box(c,'#3d2e22',-2,1,w+4,9);box(c,'#57432f',-2,0,w+2,2);box(c,'#6a5440',4,0,w-12,1);for(let x=8;x<w-6;x+=13)box(c,'#231a14',x,3,5,1);box(c,'#231a14',w-12,2,8,6);box(c,'#4b3a2b',w-10,3,4,3);box(c,'#231a14',0,9,w,2);return;
 }
 if(k==='beam'){box(c,'#15100c',-2,0,w+4,8);box(c,'#57432f',-2,0,w+4,6);box(c,'#b2946d',-2,0,w+4,2);for(let x=10;x<w-6;x+=17)box(c,'#3d2e22',x,2,1,4);for(const x of [-2,w-2]){box(c,'#15100c',x,0,4,8);box(c,'#8d704f',x+1,1,2,5);}return;}
 if(k==='sluice'){box(c,'#0d1216',-2,0,w+4,12);box(c,'#3f4c52',-1,1,w+2,9);box(c,'#7d8c8e',-1,0,w+2,2);box(c,'#26333a',-1,9,w+2,2);for(const x of [8,w-10])box(c,'#7d8c8e',x,4,2,2);box(c,'#0d1216',-2,12,w+4,16);return;}
 if(k==='bowl'||k==='urn'){
  // A dished stone bowl: a moulded lip, a hollow you can stand in.
  box(c,'#1a2129',-3,0,w+6,10);box(c,'#6d777e',-3,0,w+6,6);box(c,'#9aa3a5',-3,0,w+6,2);box(c,'#4d575e',2,2,w-4,4);box(c,'#46525f',-1,6,w+2,4);
  for(let y=10;y<28;y++){const half=Math.round(w/2-(y-10)*.9);box(c,'#46525f',Math.round(w/2)-half,y,half*2,1);box(c,'#2c353f',Math.round(w/2)+half-2,y,2,1);}return;
 }
 if(k==='island'){
  // The summerhouse island: turf inside a stone edging.
  face(c,w,p.h,RUBBLE,p.id*13+5);box(c,'#141a1b',-1,0,w+2,10);box(c,'#27382f',0,0,w,9);box(c,'#3d5a44',0,0,w,2);for(let x=4;x<w-4;x+=9)if(hash(x,p.id,9)>.4)box(c,'#52745a',x,0,2,1);
  for(const x of [-1,w-13]){box(c,'#6d777e',x,0,14,9);box(c,'#9aa3a5',x,0,14,2);box(c,'#4d575e',x,8,14,1);}return;
 }
 // Stone: a landing, a stepping stone, a pier, a plinth, a wall's coping, a step of the cascade, the upper bank.
 face(c,w,p.h,k==='wall'?BRICK:RUBBLE,p.id*13+5);
 if(k==='bank'){gravel(c,w,p.id);return;}
 box(c,'#1a2129',-2,0,w+4,10);box(c,'#6d777e',-2,0,w+4,8);box(c,'#9aa3a5',-2,0,w+4,2);box(c,'#4d575e',-2,7,w+4,1);for(let x=26+p.id%3*7;x<w-8;x+=38)box(c,'#4d575e',x,2,1,6);
 if(k==='cascade'){box(c,'#0b1016',Math.round(w/2)-9,9,18,5);box(c,'#46525f',Math.round(w/2)-11,14,22,3);box(c,'#141d1b',Math.round(w/2)-3,17,6,Math.max(0,p.h-17));}
}
/** The far shore's trees, a lot at a time and each lot painted once: poplars and round heads, no two lots alike. */
const farTrees=row(22,93,150,(c,i,w,h)=>{
 const v=hash(i,1,93),x=Math.floor(w/2)-2;
 if(v<.42){const tall=26+Math.floor(v*110);box(c,'#141d24',x,h-tall,5,tall);box(c,'#141d24',x-1,h-tall+5,7,tall-8);box(c,'#141d24',x+2,h-tall-3,1,3);}
 else{const r=7+Math.floor(v*11);for(let y=-r;y<=r;y++){const sx=Math.floor(Math.sqrt(r*r-y*y));box(c,'#141d24',x+2-sx,h-r+y-3,sx*2,1);}box(c,'#141d24',x,h-5,3,5);}
},()=>'#141d24');
function sky10(c:C,l:Level,w:number,h:number,cx:number,cy:number,t:number,ending:boolean){
 // Across the beds: the far shore's trees, the garden's own, a long way off and hardly moving.
 const fy=Math.round(l.water!-66-cy),shift=Math.round(cx*.03);
 nightSky(c,w,h,ending,cx,t);moon(c,Math.round(w*.76-cx*.01),Math.max(46,Math.min(Math.round(h*.24),fy-150)));
 drawRow(c,farTrees,w,shift,()=>fy,fy);
 box(c,'#141d24',0,fy-4,w,4);
 if(fy>=h)return;
 const far=l.water!-66,near=l.water!;sheet(c,0,w,fy,h,fy);
 for(let x=-((shift*2)%40);x<w;x+=40)box(c,'#0f1c22',x+Math.floor(hash(x+shift*2,3,91)*20),fy+1,22,3);
 c.save();c.translate(-cx,-cy);ripples(c,cx,cx+w,far+3,near,far,t,y=>cx*(1-(.03+.97*((y-far)/(near-far))**3)));moonPath(c,cx+Math.round(w*.76-cx*.01),far,near,far,t);c.restore();
}
function water10(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number){
 const top=l.water!,bottom=cy+vh+24;if(bottom<=top)return;
 sheet(c,cx-24,vw+48,top,bottom,top-66);ripples(c,cx-24,cx+vw+24,top,bottom,top-66,t);
 for(let x=Math.floor((cx-24)/22)*22;x<cx+vw+24;x+=22)box(c,'#5a8a94',x+3,top+Math.round(Math.sin(t*1.7+x*.21)),11,1);
 // Lily pads lie on it in the garden, and everything standing in it lies on it dark.
 for(let i=Math.floor((cx-24)/56);i*56<cx+vw+24;i++){const v=hash(i,3,89);if(v<.45)continue;const x=i*56+Math.floor(v*30),y=top+3+Math.floor(hash(i,5,89)*16);box(c,'#22362f',x,y,9,2);box(c,'#35543f',x+1,y,6,1);if(v>.9)box(c,'#c9b9c4',x+3,y-1,2,1);}
 for(const p of l.platforms){if(p.x+p.w<cx-24||p.x>cx+vw+24)continue;const k=role10(p,l);if(k!=='punt'&&k!=='board'&&k!=='rung'&&k!=='bough'&&k!=='beam'&&k!=='arm'&&k!=='shelf'&&k!=='roof')shadowOnWater(c,p.x,p.w,top,t);}
 moonPath(c,cx+Math.round(vw*.76-cx*.01),top,bottom,top-66,t);
}
function exit10(c:C,l:Level,s:Run,t:number,front:boolean){
 if(front)return;gardenGate(c,Math.round(l.exit.x+l.exit.w/2),l.exit.y+l.exit.h,s.phase!=='playing');
}
export const reedGarden:QuarterSet={sky:sky10,back:back10,deck:deck10,exit:exit10,water:water10,depth:(p,l)=>{const k=role10(p,l);return k==='punt'?10:0;}};
