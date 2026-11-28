import {CLOUD,WILLOW,FIR,SNOW_FIR,CHALET,stamp} from './pixel-sprites';
import {HEIGHT,FLOOR} from './model';

const TILE=1024;
const RANGES=[
 [358,354,348,338,326,310,298,312,328,336,344,338,326,316,304,318,336,350,356,352,340,332,342,354,358,350,336,320,330,348,358,358,358],
 [406,400,392,382,374,384,392,386,370,354,348,364,376,384,378,366,350,362,384,396,390,378,372,384,396,390,378,364,372,390,402,406,406],
] as const;
const RUIN=[
 'hhhhhsshhhhhhhhhhhhsshhhhh',
 'hmmmmssmmmmmmmmmmmmssmmmmh',
 'hmmmmssmmmmmmmmmmmmssmmmmh',
 'hsssssssssssssssssssssssh',
 'hmmlmmssssssssssssmmlmmh',
 'hmmlmss..........ssmlmmh',
 'hmmlss............sslmmh',
 'hmmls..............slmmh',
 'hmmls..............slmmh',
 'hmmms..............smmmh',
 'hssms..............smssh',
 'hmlms..............smlmh',
 'hmlms..............smlmh',
 'hmmms..............smmmh',
 'hmmms..............smmmh',
 'hssms..............smssh',
 'hmlms..............smlmh',
 'hmlms..............smlmh',
 'hmmms..............smmmh',
 'hmmms..............smmmh',
 'hssms..............smssh',
];
const TOWER=[
 'hhss..hhss..hhss',
 'hmss..hmss..hmss',
 'hmmmmmmmmmmmmmss',
 'hsssssssssssssss',
 '.hmmmmmmmmmmmss.',
 '.hmmss..ssmmmss.',
 '.hmms....smmmss.',
 '.hmms....smmmss.',
 '.hmms....smmmss.',
 '.hmmmmmmmmmmmss.',
 '.hsssssssssssss.',
 '.hmmmmmmmmmmmss.',
 '.hmmmmssmmmmmss.',
 '.hmmmsp psmmmss.',
 '.hmmmsp psmmmss.',
 '.hmmmsp psmmmss.',
 '.hmmmmssmmmmmss.',
 '.hmmmmmmmmmmmss.',
 '.hsssssssssssss.',
 '.hmmmmmmmmmmmss.',
 '.hmmmmmmmmmmmss.',
 '.hmmmmmmmmmmmss.',
 '.hsssssssssssss.',
 '.hmmmmmmmmmmmss.',
 '.hmmmmmmmmmmmss.',
];
const REEDS=[
 '...t......',
 '...t......',
 '...t..t...',
 '...t..t...',
 '..lt..t...',
 '...l..t...',
 '...l..l...',
 '.l.l..l...',
 '..ll..ll..',
 '...l..l.l.',
 '...ll.l...',
 '..l.lll...',
 '...llll...',
 '....ll....',
];
interface Layers {sky:HTMLCanvasElement;sun:HTMLCanvasElement;clouds:HTMLCanvasElement;far:HTMLCanvasElement;middle:HTMLCanvasElement;near:HTMLCanvasElement}
const cache=new Map<boolean,Layers>();
function layer(draw:(ctx:CanvasRenderingContext2D)=>void,width=TILE,height=HEIGHT){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');if(ctx)draw(ctx);return canvas;
}
function rect(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,color:string){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
function ridge(ctx:CanvasRenderingContext2D,points:readonly number[],color:string,snow:boolean){
 for(let x=0;x<TILE;x+=2){
  const index=Math.floor(x/32),fraction=(x%32)/32;
  const y=Math.round((points[index]!+(points[index+1]!-points[index]!)*fraction)/2)*2;
  rect(ctx,x,y,2,FLOOR-y,color);
  if(snow&&y<340){
   const depth=Math.max(2,Math.round((342-y)*.64/2)*2);
   rect(ctx,x,y,2,depth,'#b5c7d5');
   if(x%8<2)rect(ctx,x,y+depth,2,4,'#98b3c9');
  }
 }
}
function willow(ctx:CanvasRenderingContext2D,x:number,base:number,large:boolean){
 const scale=large?4:2,trunk=x+18*scale;
 rect(ctx,trunk,base-64,8,64,'#304e51');rect(ctx,trunk,base-62,2,58,'#a6a181');
 for(let i=0;i<6;i++){
  rect(ctx,trunk-i*4,base-48-i*4,6,6,'#304e51');
  rect(ctx,trunk+6+i*4,base-46-i*4,6,6,'#304e51');
 }
 stamp(ctx,WILLOW,{s:'#284e54',m:'#417266',l:'#78a07a',h:'#c5bc7c'},x,base-(large?122:94),scale);
 rect(ctx,trunk-6,base-2,22,2,'#304e51');
}
function cottage(ctx:CanvasRenderingContext2D,x:number,base:number){
 stamp(ctx,CHALET,{s:'#293d52',w:'#eee9db',b:'#8faec2',r:'#9e5b67',h:'#8d625b',t:'#664e53',c:'#d4b18a',d:'#3a4b5a',p:'#e8ac67',L:'#ffe2a3',H:'#d39362'},x,base-58);
 // A stepped wreath, door ribbon and short strings of individual lamps.
 for(const [dx,dy] of [[34,18],[32,20],[36,20],[34,22]])rect(ctx,x+dx,base-58+dy,2,2,'#3a7260');
 rect(ctx,x+34,base-36,2,2,'#db7e70');
 for(const dx of [12,22,32,42,52,62])rect(ctx,x+dx,base-34,2,2,dx%4?'#f2c77a':'#de857b');
 rect(ctx,x+58,base-62,6,10,'#704e5c');rect(ctx,x+56,base-64,10,4,'#eee9db');
}
function lamp(ctx:CanvasRenderingContext2D,x:number,base:number){
 rect(ctx,x,base-28,2,28,'#2c4053');rect(ctx,x-4,base-32,10,2,'#2c4053');
 rect(ctx,x-2,base-30,6,6,'#b88664');rect(ctx,x,base-30,2,4,'#ffe1a0');
 rect(ctx,x-4,base,10,2,'#a2b8c8');
}
function snowbank(ctx:CanvasRenderingContext2D,y:number,color:string){
 // Hand-drawn shore profile, repeated as a small ground tile.
 const edge=[8,6,6,4,2,2,0,0,2,2,4,4,6,6,8,8];
 for(let x=0;x<TILE;x+=4){const top=y+edge[(x/4)%edge.length]!;rect(ctx,x,top,4,456-top,color);}
}
function buildLayers(winter:boolean):Layers{
 const sky=layer(ctx=>{
  const colors=winter?
   ['#192940','#1d2e46','#23354d','#293c55','#30435d','#374b65','#3e536d','#465b76','#4e647e','#586e87','#62798f','#6c8397','#768d9f','#8197a7','#8ca1ae','#97aab4']:
   ['#9a8b9e','#a191a2','#aa98a5','#b39fa8','#bca6aa','#c5adad','#ceb4af','#d7bbb0','#dfc1b1','#e6c7b2','#edcdb3','#f2d2b5','#f5d6b8','#f8dabc','#fadfc2','#fbe3c9'];
  for(let i=0;i<colors.length;i++){
   rect(ctx,0,i*34,TILE,34,colors[i]!);
   if(i>0)for(let x=0;x<TILE;x+=8)rect(ctx,x+(i%2)*4,i*34,2,2,colors[i-1]!);
  }
  if(winter)for(const [x,y] of [[26,38],[78,104],[146,52],[218,136],[290,76],[366,24],[438,118],[524,58],[618,142],[690,34],[786,96],[894,52],[972,126]]){
   rect(ctx,x!,y!,2,2,'#bbcbd3');
   if(x!%3===0){rect(ctx,x!-2,y!,6,2,'#b9cbd5');rect(ctx,x!,y!-2,2,6,'#b9cbd5');}
  }
 });
 const sun=layer(ctx=>{
  const spans=[4,7,9,10,11,12,13,13,14,14,14,14,14,14,14,14,14,13,13,12,11,10,9,7,4];
  for(let row=0;row<spans.length;row++){
   const half=spans[row]!*2;
   rect(ctx,32-half,32+row*2-24,half*2,2,winter?'#f3e7c2':'#ffe5a8');
  }
  if(winter){rect(ctx,40,20,8,4,'#d7cdb6');rect(ctx,20,38,6,6,'#d7cdb6');rect(ctx,36,46,4,2,'#d7cdb6');}
  else for(const y of [42,50,56])rect(ctx,2,y,60,2,'#e9beb0');
 },64,64);
 const clouds=layer(ctx=>{
  const cloudPalette=winter?{h:'#4a657e',H:'#67839a',m:'#3d5774'}:{h:'#efcfbb',H:'#fff1d1',m:'#dfb9af'};
  for(const [x,y] of [[72,58],[318,94],[604,76],[870,186]])stamp(ctx,CLOUD,cloudPalette,x!,y!);
 });
 const far=layer(ctx=>{
  ridge(ctx,RANGES[0],winter?'#607b9a':'#b3a2a6',winter);
  ridge(ctx,RANGES[1],winter?'#405f7d':'#7c9190',false);
  if(!winter){
   const stone={s:'#7d8b88',m:'#97a396',h:'#c7b398',l:'#b6b099',p:'#e3c594'};
   for(const x of [420,466,512,558])stamp(ctx,RUIN,stone,x,350);
   stamp(ctx,TOWER,stone,122,328);stamp(ctx,TOWER,stone,810,342);
  }
 });
 const middle=layer(ctx=>{
  for(const [x,y] of [[12,410],[66,414],[242,414],[304,418],[410,408],[482,416],[630,412],[720,416],[850,416],[944,410]]){
   stamp(ctx,winter?SNOW_FIR:FIR,winter?{s:'#375669',w:'#b8cbd5',b:'#7d9db5',t:'#375669'}:{s:'#4d7471',m:'#638a78',l:'#a5b08b',t:'#4d7471'},x!,y!-50);
  }
  rect(ctx,0,416,TILE,30,winter?'#7296ad':'#618473');
  if(winter){
   cottage(ctx,118,426);cottage(ctx,440,428);cottage(ctx,800,424);
   snowbank(ctx,426,'#b8cbd5');
  }else{
   willow(ctx,30,440,false);willow(ctx,326,438,false);willow(ctx,678,440,false);
   for(const [x,y] of [[214,432],[550,434],[906,436]]){
    rect(ctx,x!,y!-16,34,18,'#53766b');rect(ctx,x!+4,y!-20,26,6,'#a4ac80');
    rect(ctx,x!+8,y!-12,8,4,'#b7bb86');rect(ctx,x!+20,y!-4,12,2,'#365a58');
   }
  }
 });
 const near=layer(ctx=>{
  rect(ctx,0,448,TILE,52,winter?'#314e69':'#315b61');
  if(winter){
   for(const [x,y] of [[26,450],[348,450],[654,450],[928,452]])stamp(ctx,SNOW_FIR,{s:'#294b5d',w:'#f0e7d6',b:'#98b8ca',t:'#294b5d'},x!,y!-100,4);
   cottage(ctx,166,452);cottage(ctx,558,454);cottage(ctx,856,452);
   lamp(ctx,150,450);lamp(ctx,272,452);lamp(ctx,538,450);lamp(ctx,684,450);
   snowbank(ctx,442,'#e2e5df');
   rect(ctx,0,454,TILE,2,'#9eb9ca');
   for(const [x,y,w] of [[8,468,26],[74,482,16],[190,462,32],[266,490,24],[362,474,20],[454,464,34],[580,488,20],[726,478,30],[834,462,22],[968,484,36]])rect(ctx,x!,y!,w!,2,'#5c7c98');
   // Christmas lights on one fir, with a little stepped star at its tip.
   for(const [x,y] of [[694,362],[690,368],[698,368],[694,374]])rect(ctx,x!,y!,2,2,'#f8da8d');
   for(const [x,y] of [[690,384],[704,392],[678,404],[698,412],[710,422],[684,432]])rect(ctx,x!,y!,2,2,'#e6a16f');
  }else{
   willow(ctx,68,452,true);willow(ctx,598,454,true);
   rect(ctx,0,446,TILE,4,'#a4ac7b');
   for(const [x,y,w] of [[12,462,26],[92,476,18],[204,488,24],[274,466,30],[370,478,18],[460,490,26],[528,464,22],[634,480,30],[730,470,24],[828,488,16],[932,462,32]])rect(ctx,x!,y!,w!,2,'#729b8a');
   for(const [x,y] of [[18,472],[212,456],[418,474],[572,466],[804,454],[966,478]])stamp(ctx,REEDS,{t:'#c2ac72',l:'#7c9a68'},x!,y!-28);
   for(const [x,y] of [[176,482],[392,470],[760,486],[910,478]]){
    rect(ctx,x!,y!,18,2,'#7f9b6b');rect(ctx,x!+4,y!-2,8,2,'#b8be82');rect(ctx,x!+8,y!-4,2,2,'#e9c694');
   }
  }
 });
 return {sky,sun,clouds,far,middle,near};
}
function repeat(ctx:CanvasRenderingContext2D,canvas:HTMLCanvasElement,width:number,drift:number){
 const offset=((drift%TILE)+TILE)%TILE;
 for(let x=-Math.round(offset/2)*2;x<width;x+=TILE)ctx.drawImage(canvas,x,0);
}
export function drawScenery(ctx:CanvasRenderingContext2D,width:number,distance:number,time:number,winter:boolean,reduced:boolean){
 let layers=cache.get(winter);if(!layers){layers=buildLayers(winter);cache.set(winter,layers);}
 for(let x=0;x<width;x+=TILE)ctx.drawImage(layers.sky,x,0);
 const sunX=Math.round(width*.78/2)*2,sunY=winter?90:130;
 ctx.drawImage(layers.sun,sunX-32,sunY-32);
 const drift=reduced?0:distance;
 repeat(ctx,layers.clouds,width,drift*.055);
 repeat(ctx,layers.far,width,drift*.09);repeat(ctx,layers.middle,width,drift*.2);repeat(ctx,layers.near,width,drift*.36);
 // A small stepped reflection moves independently of the hand-painted shore.
 ctx.fillStyle=winter?'#91a7b5':'#b8b280';
 ctx.beginPath();
 for(let row=0;row<6;row++){
  const w=16+row*4,x=sunX-w/2+(reduced?0:Math.round(Math.sin(time+row)*2)*2);
  ctx.rect(x,460+row*6,w,2);
 }
 ctx.fill();
}
