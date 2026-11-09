/** Authored at one world pixel per texel. Warm upper-left edges, cool occlusion,
 * and purposeful construction marks match the courier's material language.
 * All art is deterministic and static (including t=0 / reduced-motion mode). */
type C = CanvasRenderingContext2D;
const P={ink:'#15232e',deep:'#293c46',iron:'#49616a',steel:'#7f9998',edge:'#bed0b7',wood:'#705448',woodDark:'#443c3a',woodLight:'#aa805a',gold:'#b38e57',goldLight:'#e1c18b',goldDark:'#715743',stone:'#707b79',stoneLight:'#a3ada0',stoneDark:'#45545b',leaf:'#527962',leafLight:'#8fad78'};
function r(c:C,k:string,x:number,y:number,w:number,h:number){c.fillStyle=k;c.fillRect(Math.round(x),Math.round(y),w,h);}
/** Integer line and scanline polygon keep oblique edges as deliberate pixels. */
function line(c:C,k:string,x:number,y:number,xx:number,yy:number,width=1){x=Math.round(x);y=Math.round(y);xx=Math.round(xx);yy=Math.round(yy);const dx=Math.abs(xx-x),sx=x<xx?1:-1,dy=-Math.abs(yy-y),sy=y<yy?1:-1;let e=dx+dy;for(;;){r(c,k,x,y,width,width);if(x===xx&&y===yy)break;const q=e*2;if(q>=dy){e+=dy;x+=sx;}if(q<=dx){e+=dx;y+=sy;}}}
function poly(c:C,k:string,p:number[][]){let lo=Infinity,hi=-Infinity;for(const a of p){lo=Math.min(lo,a[1]);hi=Math.max(hi,a[1]);}for(let y=Math.ceil(lo);y<hi;y++){const xs:number[]=[];for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}xs.sort((a,b)=>a-b);for(let i=0;i+1<xs.length;i+=2)r(c,k,Math.ceil(xs[i]),y,Math.floor(xs[i+1])-Math.ceil(xs[i])+1,1);}}
function begin(c:C,x:number,y:number){c.save();c.translate(Math.round(x),Math.round(y));}
function bolt(c:C,x:number,y:number){r(c,P.ink,x,y,3,3);r(c,P.goldLight,x,y,2,1);r(c,P.gold,x,y+1,2,1);}
function disk(c:C,k:string,x:number,y:number,rad:number){for(let j=-rad;j<=rad;j++){const w=Math.floor(Math.sqrt(rad*rad-j*j));r(c,k,x-w,y+j,w*2+1,1);}}
function plank(c:C,x:number,y:number,w:number,h:number){r(c,P.ink,x,y,w,h);r(c,P.wood,x+1,y+1,w-2,h-2);r(c,P.woodLight,x+1,y+1,w-2,1);r(c,P.woodDark,x+2,y+h-3,w-3,1);}

/** Lantern anchor: center of its cap, matching the existing hanging fixtures. */
export function lantern(c:C,x:number,y:number,color:string,lit=true){
 begin(c,x,y);
 if(lit){const g=c.createRadialGradient(0,9,1,0,9,32);g.addColorStop(0,color+'24');g.addColorStop(1,color+'00');c.fillStyle=g;c.fillRect(-32,-23,64,64);}
 line(c,P.ink,-4,-2,-4,-7,2);line(c,P.ink,4,-2,4,-7,2);r(c,P.ink,-3,-9,7,2);r(c,P.goldLight,-3,-8,6,1);r(c,P.gold,-4,-7,1,4);
 poly(c,P.ink,[[-9,1],[-6,-2],[6,-2],[10,1],[8,4],[8,19],[-8,19],[-8,4]]);
 r(c,P.goldDark,-7,3,15,15);r(c,lit?'#d9a95d':'#39525c',-5,4,10,12);r(c,lit?color:'#52747b',-4,5,7,10);
 r(c,lit?'#fff0bf':'#9ab4ae',-3,5,2,9);r(c,lit?'#fff9de':'#678e91',0,7,2,7);r(c,lit?'#e4b46d':'#43636e',4,5,2,11);
 line(c,lit?'#fff5d0':'#aec3b4',-4,5,1,10);r(c,P.goldLight,-7,3,2,14);r(c,P.goldDark,5,3,2,14);r(c,P.ink,-6,16,13,2);
 r(c,P.gold,-9,0,19,2);r(c,P.goldLight,-7,0,12,1);r(c,P.goldDark,-8,2,17,1);r(c,P.gold,-9,18,19,3);r(c,P.goldLight,-7,18,13,1);r(c,P.ink,-6,21,13,1);r(c,P.goldLight,-1,16,3,1);
 c.restore();
}

/** Door anchor: center of threshold, y is the collision floor. */
export function doorway(c:C,x:number,y:number,color:string,open:boolean){
 begin(c,x,y);
 poly(c,P.ink,[[-32,0],[-32,-54],[-26,-65],[-15,-72],[14,-72],[27,-65],[33,-54],[33,0]]);
 // Individual voussoirs, recessed joints, chipped corners and bevel faces.
 for(const side of [-1,1])for(let i=0;i<5;i++){
  const xx=side<0?-30:20,yy=-51+i*10,w=i%2?11:12;
  poly(c,i%2?P.stone:P.stoneDark,[[xx+1,yy],[xx+w-2,yy],[xx+w,yy+2],[xx+w-1,yy+9],[xx,yy+9],[xx,yy+2]]);
  r(c,P.stoneLight,xx+1,yy,w-3,1);r(c,P.deep,xx+w-2,yy+2,1,6);r(c,'#899689',xx+2,yy+3,2,2);
 }
 poly(c,P.stone,[[-30,-54],[-24,-64],[-17,-66],[-19,-55]]);line(c,P.stoneLight,-28,-55,-23,-62);
 poly(c,P.stoneLight,[[-23,-65],[-12,-70],[-10,-58],[-18,-56]]);line(c,P.stoneDark,-20,-64,-17,-59);
 poly(c,P.stone,[[-11,-70],[1,-71],[1,-58],[-9,-58]]);r(c,P.edge,-9,-70,9,1);
 poly(c,P.stoneLight,[[3,-71],[14,-69],[12,-57],[3,-58]]);r(c,P.stoneDark,5,-66,4,3);
 poly(c,P.stone,[[16,-69],[26,-63],[30,-54],[20,-55],[14,-57]]);line(c,P.stoneLight,18,-67,25,-62);
 r(c,P.woodDark,-19,-56,39,56);r(c,P.woodLight,-19,-55,3,54);r(c,P.wood,-16,-55,3,55);r(c,P.ink,15,-55,4,55);
 r(c,P.goldLight,-17,-56,34,2);r(c,P.wood,-15,-53,30,3);r(c,P.ink,-13,-50,28,50);
 if(open){r(c,'#523e37',-12,-49,27,48);r(c,'#8f6648',-10,-47,22,47);r(c,'#c2935e',-8,-45,17,45);r(c,'#eed29b',-7,-43,11,43);r(c,'#fff0bd',-7,-42,3,40);r(c,'#8e6b4d',-2,-20,14,2);r(c,'#a47851',4,-36,8,2);poly(c,P.woodDark,[[12,-48],[17,-52],[17,0],[12,-1]]);r(c,P.gold,12,-45,1,40);}
 else {for(let i=0;i<4;i++){plank(c,-12+i*7,-49,7,49);line(c,P.woodLight,-10+i*7,-42,-10+i*7,-32);line(c,P.woodDark,-8+i*7,-20,-8+i*7,-9);}for(const yy of [-41,-12]){r(c,P.iron,-12,yy,27,3);r(c,P.steel,-11,yy,25,1);bolt(c,-10,yy);bolt(c,10,yy);}r(c,P.ink,6,-29,6,9);r(c,P.gold,7,-28,4,7);r(c,color,8,-27,2,3);r(c,P.goldLight,7,-23,3,1);}
 r(c,P.stoneDark,-25,-1,51,5);r(c,P.stoneLight,-23,-2,47,2);r(c,P.edge,-20,-2,22,1);r(c,P.ink,-27,4,56,2);line(c,P.stoneDark,7,-2,9,1);
 // Forged bracket makes the light belong to the doorway.
 r(c,P.ink,-39,-57,11,3);r(c,P.goldDark,-38,-57,9,1);line(c,P.iron,-31,-51,-37,-56);lantern(c,-38,-46,color,open);
 c.restore();
}

/** Valve center anchor; pipework extends 25px below. */
export function valve(c:C,x:number,y:number,color:string,active=false){
 begin(c,x,y);r(c,P.ink,-6,-27,13,53);r(c,P.iron,-4,-26,9,51);r(c,P.steel,-3,-25,2,49);
 for(const yy of [-24,20]){r(c,P.ink,-9,yy,19,6);r(c,P.steel,-8,yy+1,17,2);r(c,P.iron,-8,yy+3,17,2);bolt(c,-7,yy+1);bolt(c,5,yy+1);}
 // A real six-spoke casting, dark inner openings and raised outer rim.
 disk(c,P.ink,0,0,22);disk(c,P.goldDark,0,0,20);disk(c,active?P.steel:P.gold,0,-1,19);disk(c,P.goldLight,-1,-2,17);disk(c,P.ink,0,0,15);
 for(let i=0;i<6;i++){const a=i*Math.PI/3;const xx=Math.round(Math.cos(a)*16),yy=Math.round(Math.sin(a)*16);line(c,P.goldDark,-1,0,xx,yy,4);line(c,active?P.edge:P.goldLight,-1,-1,xx,yy,2);}
 for(let i=0;i<8;i++){const a=i*Math.PI/4;bolt(c,Math.round(Math.cos(a)*18)-1,Math.round(Math.sin(a)*18)-1);}
 disk(c,P.ink,0,0,7);disk(c,P.iron,0,0,5);r(c,P.steel,-3,-3,5,2);r(c,active?color:P.gold,-2,-1,5,3);r(c,P.goldLight,-1,-1,2,1);
 r(c,P.ink,11,-29,13,7);r(c,active?color:'#b9745c',13,-27,9,3);r(c,P.edge,14,-27,2,1);c.restore();
}

/** Bell center/floor anchor; 48px tall. */
export function bell(c:C,x:number,y:number,color:string,active=false){
 begin(c,x,y);plank(c,-23,-49,6,49);plank(c,18,-49,6,49);plank(c,-26,-51,53,6);line(c,P.woodLight,-17,-44,-8,-35,2);line(c,P.woodDark,16,-44,8,-35,3);bolt(c,-22,-49);bolt(c,19,-49);
 r(c,P.ink,-3,-47,7,10);r(c,P.gold,-2,-46,5,9);poly(c,P.ink,[[-6,-39],[7,-39],[12,-33],[13,-20],[18,-15],[18,-10],[-18,-10],[-18,-15],[-13,-20],[-12,-33]]);
 poly(c,P.goldDark,[[-5,-38],[6,-38],[10,-32],[11,-21],[16,-15],[16,-12],[-16,-12],[-11,-21],[-10,-32]]);
 poly(c,P.gold,[[-4,-37],[4,-37],[7,-31],[8,-20],[13,-15],[-13,-15],[-8,-22],[-7,-31]]);poly(c,P.goldLight,[[-4,-35],[-1,-36],[-3,-21],[-7,-17],[-9,-17],[-6,-24]]);
 r(c,P.goldLight,-15,-15,30,2);r(c,P.woodDark,-13,-11,26,2);r(c,P.ink,-3,-11,7,6);r(c,P.gold,-2,-11,5,4);line(c,P.goldLight,3,-42,15,-34);line(c,P.gold,15,-34,15,-4);r(c,active?color:'#b66f5c',12,-5,6,4);r(c,P.ink,-25,-1,51,3);c.restore();
}

/** Ferry center/deck-floor anchor. Airship variant adds a gas envelope above. */
export function ferry(c:C,x:number,y:number,color:string,airship=false){
 begin(c,x,y);
 if(airship){poly(c,P.ink,[[-55,-80],[-43,-95],[-20,-102],[22,-102],[48,-94],[61,-81],[55,-68],[35,-57],[-31,-57],[-50,-66]]);poly(c,'#829891',[[-53,-80],[-41,-93],[-20,-99],[22,-99],[46,-92],[57,-80],[52,-69],[33,-60],[-30,-60],[-48,-68]]);poly(c,'#bac1a1',[[-48,-82],[-36,-92],[-18,-96],[22,-96],[43,-89],[48,-83],[19,-87],[-22,-87]]);poly(c,'#526e71',[[-48,-70],[-29,-63],[33,-63],[51,-72],[43,-64],[32,-59],[-30,-59]]);for(const xx of [-30,0,30]){line(c,P.woodDark,xx,-97+Math.abs(xx)*.2,xx,-61,2);line(c,P.goldLight,xx-1,-94+Math.abs(xx)*.2,xx-1,-68);}line(c,P.woodDark,-34,-60,-23,-24,2);line(c,P.woodDark,35,-60,24,-24,2);}
 else {line(c,P.ink,-41,-5,-41,-53,3);r(c,P.woodLight,-41,-51,1,45);poly(c,'#aab5a0',[[-38,-49],[-5,-40],[-36,-16]]);poly(c,'#728e88',[[-36,-45],[-9,-40],[-36,-20]]);line(c,P.goldLight,-36,-43,-36,-20);}
 r(c,P.ink,-24,-30,48,28);r(c,P.wood,-22,-28,44,26);r(c,P.woodLight,-22,-28,44,2);r(c,P.ink,-27,-33,54,5);r(c,P.steel,-26,-33,52,2);
 for(const xx of [-17,-3,11]){r(c,P.ink,xx,-24,10,12);r(c,color,xx+1,-23,8,9);r(c,'#edf0cd',xx+2,-22,2,7);r(c,P.woodDark,xx+1,-14,8,2);}
 for(const yy of [-9,-5]){r(c,P.woodDark,-21,yy,42,1);r(c,P.woodLight,-20,yy+1,40,1);}
 poly(c,P.ink,[[-61,-8],[57,-8],[49,8],[34,17],[-37,17],[-51,8]]);poly(c,P.wood,[[-57,-6],[53,-6],[46,7],[33,14],[-36,14],[-48,6]]);poly(c,P.woodDark,[[-49,4],[48,4],[33,14],[-36,14]]);line(c,P.woodLight,-54,-4,51,-4,2);line(c,P.gold,-46,4,45,4);line(c,P.goldDark,-37,11,34,11);
 for(const xx of [-42,-28,28,42])bolt(c,xx,-2);r(c,P.ink,-61,-9,119,3);r(c,P.goldLight,-58,-9,113,1);
 for(const xx of [-54,48]){r(c,P.ink,xx,-20,3,12);r(c,P.steel,xx,-20,1,12);}line(c,P.gold,-53,-19,49,-19);
 lantern(c,31,-25,color,true);c.restore();
}

/** Observatory dish: center/floor anchor, about 66px tall. */
export function signalDish(c:C,x:number,y:number,color:string,active=false){
 begin(c,x,y);r(c,P.ink,-19,-6,40,8);r(c,P.steel,-17,-5,35,2);r(c,P.iron,-16,-3,33,4);poly(c,P.ink,[[-10,-6],[-5,-33],[7,-33],[13,-6]]);poly(c,P.iron,[[-7,-7],[-3,-31],[5,-31],[10,-7]]);line(c,P.steel,-4,-10,-1,-28,2);bolt(c,-3,-19);
 poly(c,P.ink,[[-31,-63],[-23,-65],[32,-34],[30,-27],[18,-23],[2,-25],[-13,-34],[-25,-49]]);poly(c,P.iron,[[-28,-61],[-22,-62],[28,-33],[27,-29],[17,-26],[2,-28],[-11,-36],[-23,-49]]);poly(c,P.steel,[[-26,-61],[-20,-61],[29,-34],[24,-32],[9,-36],[-7,-45]]);line(c,P.edge,-27,-63,31,-34,2);line(c,P.deep,-20,-53,17,-30);line(c,P.deep,-12,-50,14,-29);line(c,P.deep,-4,-46,12,-28);line(c,P.edge,-19,-56,-9,-42);line(c,P.edge,-4,-47,3,-35);
 line(c,P.ink,-2,-45,6,-66,3);line(c,P.goldLight,-1,-45,7,-65);r(c,P.ink,4,-69,8,7);r(c,active?color:P.steel,5,-68,6,4);r(c,P.edge,5,-68,3,1);
 r(c,P.ink,13,-20,15,15);r(c,P.iron,14,-19,13,13);r(c,active?color:'#4f737b',16,-17,8,5);r(c,P.edge,17,-17,3,1);bolt(c,16,-9);bolt(c,22,-9);c.restore();
}

/** Life-tree center/root anchor. Branches are drawn as joined bark volumes. */
export function lifeTree(c:C,x:number,y:number,color:string,alive=true){
 begin(c,x,y);
 const branches=[[[0,-10],[-2,-36],[4,-65],[0,-103]],[[0,-35],[-22,-53],[-34,-75],[-49,-82]],[[1,-57],[25,-70],[35,-94],[49,-103]],[[0,-79],[-17,-95],[-24,-113]],[[22,-70],[45,-70],[60,-84]],[[3,-94],[16,-115],[12,-128]], [[-23,-54],[-43,-55],[-58,-66]]];
 for(const b of branches)for(let i=0;i<b.length-1;i++){const [a,z]=[b[i],b[i+1]],w=Math.max(3,10-i*3-(b===branches[0]?0:3));line(c,P.ink,a[0]-2,a[1],z[0]-2,z[1],w+3);line(c,P.woodDark,a[0],a[1],z[0],z[1],w);line(c,P.woodLight,a[0],a[1],z[0],z[1],Math.max(1,w-4));}
 poly(c,P.ink,[[-17,0],[-7,-10],[-5,-25],[7,-25],[10,-9],[23,1]]);poly(c,P.wood,[[-14,0],[-5,-10],[-3,-24],[5,-24],[7,-7],[18,0]]);line(c,P.woodLight,-4,-19,-3,-5,2);line(c,P.woodDark,3,-18,5,-3,2);line(c,P.woodLight,-3,-6,-11,0);
 const tufts=[[-45,-82,16],[-30,-99,17],[-16,-116,16],[10,-130,15],[31,-108,20],[48,-96,18],[59,-81,14],[-59,-65,14],[-35,-60,16],[34,-74,17]];
 for(const [xx,yy,w] of tufts){poly(c,P.ink,[[xx-w,yy+2],[xx-w+3,yy-4],[xx-5,yy-7],[xx+6,yy-9],[xx+w,yy-3],[xx+w-1,yy+4],[xx+3,yy+8],[xx-9,yy+7]]);poly(c,alive?P.leaf:P.woodDark,[[xx-w+2,yy+1],[xx-w+5,yy-3],[xx-4,yy-5],[xx+6,yy-7],[xx+w-2,yy-2],[xx+w-3,yy+3],[xx+2,yy+6],[xx-8,yy+5]]);r(c,alive?P.leafLight:P.woodLight,xx-7,yy-5,11,2);r(c,alive?'#72956a':P.wood,xx-w+5,yy-2,8,3);r(c,alive?'#a6bc83':P.goldDark,xx+3,yy-6,5,1);r(c,alive?'#385e55':P.deep,xx+5,yy+3,7,2);}
 // A carved hollow holds the last light, readable as a sheltered heart.
 poly(c,P.ink,[[-4,-42],[1,-47],[6,-42],[7,-31],[1,-27],[-4,-32]]);r(c,alive?color:P.deep,-1,-41,4,10);r(c,alive?'#fff0bc':P.iron,0,-39,2,6);
 if(alive){for(const [xx,yy] of [[-44,-76],[39,-91],[17,-122]]){line(c,P.goldDark,xx,yy-3,xx,yy+5);r(c,color,xx-1,yy+4,3,4);r(c,'#f3e5b1',xx,yy+4,1,2);}}
 c.restore();
}
