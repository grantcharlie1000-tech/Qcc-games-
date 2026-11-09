/** Hand-authored supporting cast, on the courier's one-world-pixel grid.
 * Colour is the existing world's cast key; all movement depends solely on t.
 * Passing t=0 freezes the complete pose, including gait, cloth and blinking. */
type Cast = 'gardener'|'worker'|'elder'|'keeper'|'child';
interface Palette {cloth:string;light:string;shade:string;skin:string;cheek:string;hair:string;hairLight:string;accent:string}
const INK='#15232c', LEATHER='#654e43', SOLE='#b3a48a';
const PALETTES:Record<Cast,Palette>={
 gardener:{cloth:'#79866a',light:'#b0b28a',shade:'#485f51',skin:'#dba986',cheek:'#b57e67',hair:'#655047',hairLight:'#92725c',accent:'#d8c298'},
 worker:{cloth:'#667f87',light:'#9eb2b0',shade:'#3c555f',skin:'#be8d70',cheek:'#95624f',hair:'#403e3c',hairLight:'#6b6051',accent:'#c7a16f'},
 elder:{cloth:'#7e7186',light:'#bba5b2',shade:'#4f4c60',skin:'#e2b999',cheek:'#b78675',hair:'#b8b7ab',hairLight:'#e5ddc4',accent:'#c9b59b'},
 keeper:{cloth:'#536d79',light:'#96aca6',shade:'#304853',skin:'#d9b291',cheek:'#aa7b69',hair:'#acb0a0',hairLight:'#e0ddc5',accent:'#b9986d'},
 child:{cloth:'#9b795b',light:'#c5a781',shade:'#64594c',skin:'#e6b996',cheek:'#bd8872',hair:'#634638',hairLight:'#a1764c',accent:'#c97769'},
};
function rect(c:CanvasRenderingContext2D,fill:string,x:number,y:number,w:number,h:number){c.fillStyle=fill;c.fillRect(Math.round(x),Math.round(y),w,h);}
/** Rasterised bones avoid antialiasing and preserve the authored pixel grid. */
function bone(c:CanvasRenderingContext2D,x:number,y:number,xx:number,yy:number,width:number,fill:string){
 const n=Math.max(Math.abs(xx-x),Math.abs(yy-y),1),half=Math.floor(width/2);c.fillStyle=fill;
 for(let i=0;i<=n;i++)c.fillRect(Math.round(x+(xx-x)*i/n)-half,Math.round(y+(yy-y)*i/n)-half,width,width);
}
function leg(c:CanvasRenderingContext2D,hip:number,knee:number,foot:number,lift:number,rear:boolean,child:boolean){
 const hy=child?-9:-12,ky=child?-5:-7,fy=-3-lift;
 bone(c,hip,hy,knee,ky,5,INK);bone(c,knee,ky,foot,fy,4,INK);
 bone(c,hip,hy,knee,ky,3,rear?'#35434c':'#4c5d68');bone(c,knee,ky,foot,fy,2,rear?'#4a565d':'#85918e');
 rect(c,INK,foot-2,fy,7,3);rect(c,LEATHER,foot-1,fy,5,2);rect(c,'#a78263',foot+1,fy,2,1);rect(c,SOLE,foot-2,fy+2,7,1);
}
function arm(c:CanvasRenderingContext2D,p:Palette,sx:number,sy:number,ex:number,ey:number,hx:number,hy:number,rear=false){
 bone(c,sx,sy,ex,ey,6,INK);bone(c,ex,ey,hx,hy-2,5,INK);
 bone(c,sx,sy,ex,ey,4,rear?p.shade:p.cloth);bone(c,ex,ey,hx,hy-2,3,rear?p.cloth:p.light);
 rect(c,p.shade,hx-2,hy-3,4,2);rect(c,INK,hx-2,hy-1,5,4);rect(c,p.cheek,hx-1,hy-1,3,3);rect(c,p.skin,hx,hy-1,2,2);rect(c,p.skin,hx-2,hy,1,1);
}
function face(c:CanvasRenderingContext2D,p:Palette,kind:Cast,by:number,blink:boolean){
 const top=kind==='child'?-28:-34;
 rect(c,INK,-6,top+by,12,10);rect(c,p.hair,-5,top+1+by,10,8);
 rect(c,p.cheek,-2,top+2+by,8,8);rect(c,p.skin,-1,top+2+by,7,6);rect(c,'#f1d4b0',0,top+2+by,4,1);
 rect(c,p.cheek,-4,top+5+by,2,3);rect(c,p.skin,-4,top+5+by,1,2);
 rect(c,p.skin,6,top+5+by,2,2);rect(c,p.cheek,5,top+7+by,2,1);
 rect(c,p.hair,-5,top+1+by,10,2);rect(c,p.hair,-4,top+3+by,3,2);rect(c,p.hairLight,-4,top+1+by,6,1);
 rect(c,INK,3,top+4+by,2,blink?1:2);if(!blink)rect(c,'#f7e7c8',4,top+4+by,1,1);
 rect(c,p.hair,2,top+3+by,3,1);rect(c,'#956d64',3,top+8+by,2,1);
 if(kind==='elder'){
  rect(c,INK,-8,top+2+by,4,5);rect(c,p.hair,-7,top+2+by,3,4);rect(c,p.hairLight,-7,top+2+by,2,1);
  rect(c,p.hair,-5,top+2+by,2,6);rect(c,p.hairLight,-5,top+2+by,1,4);
  rect(c,'#d1bc94',1,top+4+by,5,1);rect(c,'#a08d77',1,top+5+by,1,2);rect(c,'#a08d77',5,top+5+by,1,2);rect(c,INK,3,top+5+by,1,1);rect(c,p.skin,2,top+6+by,3,1);
  rect(c,p.cheek,1,top+7+by,2,1);
 }else if(kind==='keeper'){
  // Grey sideburn, a shaped moustache and a small beard frame the face,
  // leaving the cheek and mouth readable instead of a rectangular mask.
  rect(c,p.hair,-3,top+5+by,2,4);rect(c,p.hairLight,-3,top+5+by,1,2);
  rect(c,p.hair,1,top+8+by,2,2);rect(c,p.hair,4,top+8+by,2,2);rect(c,p.skin,3,top+8+by,1,1);
  rect(c,p.cheek,2,top+10+by,3,1);rect(c,p.hair,0,top+10+by,2,2);rect(c,p.hair,2,top+11+by,3,1);rect(c,p.hairLight,0,top+10+by,1,1);
 }else if(kind==='child'){
  rect(c,p.hair,-6,top-1+by,10,3);rect(c,p.hair,4,top+1+by,3,2);rect(c,p.hairLight,-4,top-1+by,4,1);rect(c,p.hair,-7,top+2+by,3,4);
 }
}
function cast(color:string):Cast{
 if(color==='#8f9c70')return 'gardener';
 if(color==='#b79871')return 'worker';
 if(color==='#a0acbf'||color==='#7f9daa')return 'keeper';
 if(color==='#ae837a'||color==='#b4877d')return 'elder';
 if(color==='#c97769'||color==='#d5a779')return 'child';
 // Unknown palettes remain stable without allocation or a frame-dependent seed.
 const key=parseInt(color.slice(1),16)||0;return key%5===0?'child':key%5===1?'gardener':key%5===2?'worker':key%5===3?'elder':'keeper';
}
export function person(c:CanvasRenderingContext2D,x:number,y:number,t:number,color='#b4877d',walk=0,facing=Math.sign(walk)||1):void{
 const kind=cast(color),p=PALETTES[kind],child=kind==='child',moving=t!==0&&walk!==0;
 const phase=t*(child?9:6),step=moving?Math.sin(phase)*4*Math.min(1,Math.abs(walk)):0;
 const lift=moving?Math.max(0,Math.cos(phase))*2:0,backLift=moving?Math.max(0,-Math.cos(phase))*2:0;
 const bob=t===0?0:moving?Math.round(Math.cos(phase*2)*.65):Math.round(Math.sin(t*2)*.55);
 // Slow, held occupation gestures; hands lead and elbows follow.
 const gesture=t===0||moving?0:Math.max(0,Math.sin(t*.85)-.65)/.35;
 const blink=t!==0&&t%5.3>5.12;
 c.save();c.translate(Math.round(x),Math.round(y));c.scale(facing<0?-1:1,1);
 rect(c,'#111f3044',-10,0,22,2);
 leg(c,-4,-4-step*.35,-4-step,backLift,true,child);
 const shoulder=child?-19:-24,hem=child?-8:-11;
 arm(c,p,-7,shoulder+bob,-9-step*.3,shoulder+5+bob,-8-step*.65,shoulder+11+bob,true);
 if(kind==='gardener'){
  // Seed bag behind the apron, with contrasting folded flap and brass rivet.
  rect(c,INK,-12,-17+bob,7,9);rect(c,LEATHER,-11,-16+bob,5,7);rect(c,'#af8863',-11,-16+bob,5,2);rect(c,'#d7bd80',-9,-13+bob,1,1);
 }else if(kind==='keeper'){
  rect(c,INK,-10,-25+bob,8,20);rect(c,p.shade,-9,-24+bob,6,18);rect(c,p.cloth,-8,-23+bob,2,15);
 }
 // Shoulders taper into a waist; split hems retain negative space between feet.
 rect(c,INK,-7,shoulder-2+bob,13,3);rect(c,INK,-8,shoulder+1+bob,16,hem-shoulder-1);
 rect(c,p.shade,-7,shoulder+bob,14,hem-shoulder);rect(c,p.cloth,-5,shoulder+bob,10,hem-shoulder);
 rect(c,p.light,-5,shoulder+1+bob,2,hem-shoulder-3);rect(c,p.shade,3,shoulder+2+bob,3,hem-shoulder-2);
 rect(c,p.cloth,-7,hem-2+bob,6,3);rect(c,p.shade,1,hem-2+bob,6,3);
 leg(c,3,3+step*.35,3+step,lift,false,child);
 if(kind==='gardener'){
  rect(c,p.accent,-4,-24+bob,2,5);rect(c,p.accent,3,-24+bob,2,5);rect(c,INK,-5,-20+bob,11,12);
  rect(c,'#c6b98e',-4,-20+bob,9,11);rect(c,'#e0d1a6',-4,-20+bob,2,10);rect(c,'#9a9b77',3,-18+bob,2,8);
  rect(c,'#8c916d',-2,-16+bob,5,4);rect(c,'#ece0b7',-2,-16+bob,5,1);rect(c,'#5a7360',0,-18+bob,1,3);rect(c,'#89ab77',-1,-19+bob,2,1);
  rect(c,'#998461',-3,-10+bob,7,1);
 }else if(kind==='worker'){
  rect(c,p.accent,-5,-25+bob,2,8);rect(c,p.accent,3,-24+bob,2,7);rect(c,'#d9c28f',-5,-21+bob,2,2);rect(c,'#d9c28f',3,-21+bob,2,2);
  rect(c,'#435963',-3,-20+bob,7,9);rect(c,'#7f999a',-2,-19+bob,5,4);rect(c,'#bbc4b4',-2,-19+bob,5,1);rect(c,LEATHER,-6,-13+bob,13,2);
  rect(c,'#d7b77c',0,-13+bob,2,2);rect(c,'#a9b4b3',5,-17+bob,2,7);rect(c,'#d7d1b7',4,-18+bob,1,3);rect(c,'#d7d1b7',7,-18+bob,1,3);
 }else if(kind==='elder'){
  // Asymmetric knitted shawl: broad shoulder fold and tapered hanging edge.
  rect(c,p.shade,-9,-26+bob,16,4);rect(c,p.light,-8,-25+bob,14,2);rect(c,p.cloth,-8,-23+bob,6,5);
  rect(c,p.light,-7,-23+bob,3,4);rect(c,p.light,-6,-19+bob,3,3);rect(c,p.light,-5,-16+bob,2,2);
  rect(c,p.accent,-8,-24+bob,2,1);rect(c,p.accent,-6,-21+bob,2,1);rect(c,p.accent,-4,-18+bob,2,1);
  rect(c,'#d8bd81',2,-23+bob,2,2);rect(c,p.accent,0,-18+bob,1,1);rect(c,p.accent,0,-14+bob,1,1);rect(c,p.shade,2,-15+bob,4,3);rect(c,p.light,2,-15+bob,4,1);rect(c,p.shade,-7,-11+bob,5,3);rect(c,p.light,-7,-11+bob,1,2);
 }else if(kind==='keeper'){
  // Weathered working coat, narrow rust scarf, leather belt and patched
  // pocket replace the broad ceremonial collar and square uniform panels.
  rect(c,INK,-7,-26+bob,13,3);rect(c,'#ac7770',-6,-26+bob,10,2);rect(c,'#dbab8d',-5,-26+bob,5,1);
  rect(c,'#815b5e',-5,-24+bob,3,9);rect(c,'#ba8a7a',-5,-24+bob,1,7);
  rect(c,p.light,1,-24+bob,2,4);rect(c,p.shade,0,-23+bob,1,10);rect(c,p.light,0,-20+bob,1,1);rect(c,p.accent,0,-16+bob,1,1);
  rect(c,LEATHER,-6,-13+bob,13,2);rect(c,'#d4ba87',1,-13+bob,2,2);
  rect(c,p.shade,-6,-20+bob,4,4);rect(c,p.light,-6,-20+bob,4,1);rect(c,'#8b998e',-5,-17+bob,2,1);
  rect(c,p.cloth,-7,-11+bob,5,3);rect(c,p.shade,2,-11+bob,4,2);rect(c,p.light,-7,-11+bob,1,3);
 }else{
  rect(c,LEATHER,-9,-17+bob,5,9);rect(c,'#c29d73',-8,-16+bob,4,3);rect(c,'#e2c28a',-7,-12+bob,1,1);
  bone(c,-5,-20+bob,4,-10+bob,2,LEATHER);rect(c,'#d9b588',2,-12+bob,2,2);
 }
 face(c,p,kind,bob,blink);
 if(kind==='gardener'){
  rect(c,INK,-8,-36+bob,14,5);rect(c,'#b8a477',-7,-35+bob,12,4);rect(c,'#e0ca98',-5,-36+bob,8,2);
  rect(c,'#607453',-7,-33+bob,12,2);rect(c,INK,-11,-32+bob,21,2);rect(c,'#d2bc89',-10,-32+bob,19,1);rect(c,'#ecdbb2',-8,-32+bob,8,1);
 }else if(kind==='worker'){
  rect(c,INK,-7,-36+bob,13,4);rect(c,p.shade,-6,-35+bob,11,3);rect(c,p.light,-5,-35+bob,8,1);rect(c,INK,2,-32+bob,8,2);rect(c,p.cloth,3,-32+bob,6,1);
  rect(c,'#ad936a',-5,-33+bob,8,2);rect(c,'#d5c69b',-4,-33+bob,2,1);rect(c,'#d5c69b',0,-33+bob,2,1);
 }else if(kind==='keeper'){
  // Soft, asymmetric flat cap with a short brim, seam and worn crown.
  rect(c,INK,-5,-38+bob,8,2);rect(c,INK,-7,-36+bob,13,4);rect(c,p.shade,-6,-36+bob,11,3);
  rect(c,p.cloth,-4,-37+bob,7,3);rect(c,p.light,-4,-37+bob,5,1);rect(c,'#718980',-5,-35+bob,6,1);
  rect(c,INK,1,-33+bob,8,2);rect(c,p.shade,2,-33+bob,6,1);rect(c,p.accent,4,-33+bob,2,1);
 }else if(child){
  const tail=t===0?0:Math.round(Math.sin(t*4)*1);
  rect(c,INK,-7,-21+bob,13,3);rect(c,p.accent,-6,-21+bob,12,2);rect(c,'#e8ae87',0,-21+bob,5,1);rect(c,p.accent,-6,-20+bob,3,6);rect(c,p.accent,-8,-16+bob+tail,4,2);
 }
 const handX=kind==='elder'?10:kind==='gardener'?10:child?8:10-step*.6;
 const handY=(child?-10:kind==='elder'?-15:kind==='gardener'?-16:-13)+bob-gesture*(kind==='worker'?8:3);
 arm(c,p,6,shoulder+1+bob,9,shoulder+6+bob-gesture*2,handX,handY);
 if(kind==='elder'){
  rect(c,INK,11,handY,3,-handY);rect(c,'#a48a67',11,handY+1,1,-handY-1);rect(c,'#d2b58a',10,handY-1,3,1);rect(c,'#53545b',11,-2,3,2);
 }else if(kind==='gardener'){
  // Hand-held terracotta pot and a three-leaf seedling.
  rect(c,INK,handX-3,handY+2,8,7);rect(c,'#b07859',handX-2,handY+3,6,5);rect(c,'#e0a477',handX-2,handY+3,2,4);rect(c,'#d39b70',handX-3,handY+2,8,1);
  rect(c,'#668765',handX,handY-3,1,5);rect(c,'#9bb57b',handX-2,handY-3,2,2);rect(c,'#bdd395',handX+1,handY-5,3,2);
 }else if(kind==='keeper'){
  rect(c,'#c7ac79',handX,handY+2,1,3);rect(c,INK,handX-3,handY+4,7,8);rect(c,'#b09c75',handX-2,handY+5,5,6);
  rect(c,'#f0d595',handX-1,handY+6,3,4);rect(c,'#fff0c7',handX,handY+6,1,3);rect(c,LEATHER,handX-3,handY+4,7,1);rect(c,LEATHER,handX-3,handY+11,7,1);
 }else if(child){
  rect(c,INK,handX-2,handY+2,6,6);rect(c,'#d2ba8c',handX-1,handY+3,4,4);rect(c,'#8b9b92',handX-1,handY+3,4,1);rect(c,'#d2ba8c',handX+1,handY+1,1,2);
 }
 c.restore();
}
