import type {Level,Platform} from './levels';
type C=CanvasRenderingContext2D;
// Every mark belongs to a construction feature: joints, bevels, grain or weather runoff.
// Coordinates are native game pixels; the uninterrupted y=0 lip is the collision plane.
function rect(c:C,color:string,x:number,y:number,w:number,h:number){c.fillStyle=color;c.fillRect(x,y,w,h);}
function shape(c:C,color:string,points:number[]){c.fillStyle=color;c.beginPath();c.moveTo(points[0],points[1]);for(let i=2;i<points.length;i+=2)c.lineTo(points[i],points[i+1]);c.closePath();c.fill();}
function line(c:C,color:string,points:number[]){c.strokeStyle=color;c.lineWidth=1;c.beginPath();c.moveTo(points[0]+.5,points[1]+.5);for(let i=2;i<points.length;i+=2)c.lineTo(points[i]+.5,points[i+1]+.5);c.stroke();}
function roof(c:C,w:number,id:number){
 rect(c,'#705344',0,0,w,14);rect(c,'#354249',0,9,w,19);rect(c,'#5d5143',1,14,w-2,13);
 // Broad timber courses and occasional joints, not a bright grid on every shelf.
 for(let y=16;y<28;y+=6){rect(c,y===16?'#6c5946':'#5d5142',2,y,w-4,5);for(let x=18+(y%3)*17;x<w-10;x+=91+(id%3)*7){line(c,'#7d6b50',[x,y,x+28,y,x+35,y+1]);line(c,'#4f493f',[x+8,y+3,x+22,y+3,x+27,y+2,x+46,y+2]);if((x+id)%3===0){rect(c,'#4b463e',x+33,y+2,5,2);rect(c,'#897453',x+34,y+1,3,1);}}}
 for(let x=12;x<w-8;x+=89){rect(c,'#41494a',x,14,4,14);rect(c,'#79684c',x,15,1,11);rect(c,'#9c8660',x+1,17,1,1);}
 // Staggered barrel tiles retain clay shoulders and repairs at a quieter cadence.
 for(let row=1;row>=0;row--)for(let x=-16+row*13,index=0;x<w;x+=27,index++){const y=row*6,warm=(index+id)%4===0;shape(c,warm?'#986a53':'#845c50',[x,y,x+25,y,x+26,y+7,x+23,y+10,x+2,y+10,x,y+7]);rect(c,'#624b44',x+2,y+8,22,2);rect(c,warm?'#ae835f':'#a0785d',x+2,y+1,3,6);rect(c,'#b18b66',x+3,y,20,1);rect(c,'#745448',x+23,y+2,2,5);if((index+id)%5===0)line(c,'#644c43',[x+17,y+3,x+15,y+5,x+17,y+7]);}
 for(let x=47+(id%4)*17;x<w-18;x+=149){shape(c,'#76564a',[x,4,x+9,4,x+10,10,x+2,10]);rect(c,'#a58360',x+1,4,7,1);}
 rect(c,'#8b7757',0,12,w,1);rect(c,'#3c3f40',0,13,w,2);
}
function moss(c:C,w:number,id:number){
 for(let x=5+(id%3)*9,cluster=0;x<w-10;cluster++,x+=29+((cluster+id)%3)*17){const d=(x+id)%3;shape(c,'#324e45',[x,1,x+8,1,x+11,4,x+17,4,x+17,8,x+10,8,x+7,13,x+4,10,x+4,5,x,5]);rect(c,'#6d8860',x+1,1,9,2);rect(c,'#9eab77',x+2,1,4,1);rect(c,'#506d50',x+8,5,5,3);if(d){line(c,'#574d3d',[x+7,8,x+7,19,x+11,23,x+10,32,x+15,37]);line(c,'#8a7a53',[x+6,8,x+6,18,x+10,23,x+9,32]);line(c,'#4b6049',[x+10,23,x+17,20,x+19,23]);rect(c,'#819568',x+14,20,4,2);}}
}
function masonry(c:C,w:number,id:number,ornate:boolean,crumble:boolean){
 const mid=crumble?'#8c7662':ornate?'#737779':'#536762',light=crumble?'#b79b7b':ornate?'#a2a18f':'#849586';
 for(let row=0;row<2;row++)for(let x=-((row+id)%2)*24;x<w;x+=49){const y=3+row*13,drop=row?((x+id)%3+3)%3:0;shape(c,'#334a4c',[x,y,x+47,y,x+49,y+3,x+47,y+14+drop,x+4,y+15+drop,x,y+11]);shape(c,mid,[x+2,y+1,x+43,y+1,x+46,y+3,x+45,y+11,x+5,y+12,x+2,y+10]);line(c,light,[x+3,y+2,x+37,y+2,x+41,y+3]);line(c,ornate?'#56666a':'#405652',[x+3,y+9,x+9,y+10,x+43,y+10]);if((x+id)%3===0){rect(c,'#90997e',x+6,y+4,8,1);line(c,'#3f5351',[x+30,y+2,x+28,y+5,x+32,y+7,x+30,y+10]);rect(c,light,x+29,y+5,1,2);}}
 rect(c,light,0,0,w,2);rect(c,ornate?'#a9a48f':'#71877b',0,2,w,1);
 if(ornate){rect(c,'#485962',0,7,w,2);rect(c,'#969582',0,9,w,1);for(let x=18;x<w-10;x+=76){shape(c,'#4c5a62',[x,12,x+8,12,x+11,17,x+8,24,x,24,x-3,17]);line(c,'#9d9b82',[x+3,12,x+8,17,x+3,23,x-2,17,x+3,12]);rect(c,'#bcaf8c',x+3,16,1,2);line(c,'#7f8981',[x+14,16,x+24,16,x+24,20,x+19,20]);}}
 else if(!crumble)moss(c,w,id);
}
function iron(c:C,w:number){
 rect(c,'#35464b',0,0,w,28);rect(c,'#9d8f70',0,0,w,2);rect(c,'#606b68',0,2,w,3);
 for(let x=0;x<w;x+=62){shape(c,'#576366',[x+2,6,x+57,6,x+60,9,x+60,25,x+56,28,x+2,28]);line(c,'#76827b',[x+3,7,x+55,7,x+58,9]);rect(c,'#3b4d50',x+10,12,37,12);rect(c,'#69776f',x+11,12,35,1);for(let k=0;k<4;k++){rect(c,'#30464c',x+15+k*7,16,3,6);rect(c,'#738274',x+18+k*7,16,1,6);}rect(c,'#6a5d49',x+1,6,4,22);rect(c,'#917e59',x+1,6,1,20);rect(c,'#ab956c',x+2,9,1,1);rect(c,'#9b855e',x+2,24,1,1);line(c,'#82704f',[x+54,10,x+54,14,x+52,17,x+52,21]);rect(c,'#45645b',x+41,25,8,3);}
 rect(c,'#7e7459',0,26,w,1);
}
function ice(c:C,w:number,id:number){
 // A continuous dark core unifies differently sized, independently fractured slabs.
 rect(c,'#527f91',0,0,w,22);
 let seed=(id+17)*7919,previous=-1,index=0;
 for(let x=0;x<w;index++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  let variant=(seed>>>12)%4;if(variant===previous)variant=(variant+1+(seed%2))%4;previous=variant;
  const span=Math.min(w-x,36+(seed>>>20)%27),r=x+span,mid=x+Math.floor(span*.47),bottom=25+(seed>>>9)%7;
  const quiet=index%2===1;
  shape(c,'#608c9c',[x,3,r,3,r,22,r-5,bottom,mid+5,bottom-2,mid-4,bottom+2,x+3,26,x,21]);
  if(variant===0){
   // Broad cloudy plate: horizontal trapped layers and a fracture from the right.
   shape(c,quiet?'#7da6b0':'#8ab4bd',[x+1,4,r-2,4,r-7,11,mid+2,14,x+2,12]);
   shape(c,'#709ba9',[x+3,15,mid+7,17,r-5,13,r-7,22,x+8,24]);
   line(c,'#b6d6d5',[r-7,6,r-15,13,r-12,18,r-22,24]);
   line(c,'#446f85',[r-6,7,r-14,14,r-11,18]);
   line(c,'#90b9c1',[r-15,13,r-24,12,r-29,15]);
  }else if(variant===1){
   // One vertical split with a thin translucent shard; no long diagonal facet.
   shape(c,quiet?'#759eac':'#8db5be',[x+2,4,mid-3,4,mid+1,13,mid-4,25,x+3,22]);
   shape(c,'#49778c',[mid+3,8,mid+8,4,mid+5,19,mid+10,bottom-2,mid+2,bottom]);
   line(c,'#c0dcd9',[mid,4,mid+3,10,mid-1,18,mid+3,25]);
   line(c,'#8bb5c0',[mid+3,10,mid+13,14,r-5,13]);
   rect(c,'#a1c4c7',x+6,8,7,1);rect(c,'#7da6b2',r-11,20,5,2);
  }else if(variant===2){
   // Occasional sharp conchoidal break, with its light mass offset to the right.
   shape(c,quiet?'#86acb6':'#a1c5ca',[mid-1,4,r-2,4,r-6,13,mid+4,20]);
   shape(c,'#3f6d85',[x+3,13,mid-3,8,mid+2,21,mid-7,bottom,x+3,22]);
   line(c,'#9ec7cc',[x+5,13,mid-3,8,mid+2,21,mid-7,bottom-1]);
   line(c,'#739fae',[mid+2,21,r-9,22,r-4,18]);
  }else{
   // Compressed glacial bands, a forked lower crack and an opaque upper shelf.
   shape(c,quiet?'#83aab4':'#94bdc4',[x+1,4,r-1,4,r-5,10,mid-5,9,x+4,12]);
   shape(c,'#719ba9',[x+4,14,mid+6,12,r-4,15,r-8,21,x+7,20]);
   line(c,'#aed0d1',[mid-8,bottom,mid-3,20,mid-6,15,mid+3,12]);
   line(c,'#8eb9c2',[mid-3,20,mid+6,22,mid+12,19]);
   rect(c,'#b0ced0',x+8,6,9,1);
  }
  if((seed>>>7)%3===0&&span>30){const tooth=x+10+(seed%13),depth=8+(seed>>>4)%12;shape(c,'#7daab9',[tooth,24,tooth+6,25,tooth+3,29+depth,tooth+1,33]);line(c,'#b3d3d6',[tooth+1,27,tooth+2,32]);}
  x=r;
 }
 rect(c,'#b9d2cf',0,0,w,2);rect(c,'#9fbec2',0,2,w,2);
 for(let x=3;x<w-6;x+=47+(id%7)){rect(c,'#cadbd2',x,0,Math.min(14,w-x),1);}
}
export function paintMaterial(c:C,p:Platform,l:Level){
 // The face occupies the physical slab. Roots and icicles belong to the separately
 // clearance-checked foundation, so a small material detail cannot invade a route.
 c.save();c.beginPath();c.rect(0,0,p.w,p.h);c.clip();
 if(p.kind==='crumble')masonry(c,p.w,p.id,false,true);
 else if(l.world===3||p.kind==='ice')ice(c,p.w,p.id);
 else if(l.world===2)iron(c,p.w);
 else if(l.world===0&&l.setting!=='cavern'&&l.setting!=='canal')roof(c,p.w,p.id);
 else masonry(c,p.w,p.id,l.world===4,false);
 if(l.setting==='garden')moss(c,p.w,p.id);
 c.restore();
}

/** Selected structural anchors, entirely below the collision slab. The caller
 * grants a complete 28px support only after checking the surrounding routes.
 * Partial arches and cropped pipes would imply broken geometry, so omit them. */
export function paintFoundation(c:C,p:Platform,l:Level,depth=28){
 if(p.kind!=='stone'||p.branch||depth<p.h+28)return;
 const w=p.w;if(w<170)return;
 c.save();c.beginPath();c.rect(0,p.h,w,28);c.clip();
 c.translate(0,p.h-28);
 const roof=l.world===0&&l.setting!=='cavern'&&l.setting!=='canal';
 if(roof){
  rect(c,'#34484c',3,28,w-6,4);rect(c,'#58675e',4,28,w-8,1);
  const left=12,right=w-18;
  for(const [x,dir] of [[left,1],[right,-1]]){
   rect(c,'#344349',x,32,4,22);rect(c,'#615c49',x,33,1,19);
   shape(c,'#374448',[x+dir*3,48,x+dir*25,32,x+dir*31,32,x+dir*4,54]);
   line(c,'#6a624c',[x+dir*4,48,x+dir*25,33]);
   rect(c,'#8a7856',x+1,35,1,1);
  }
  // A short return only on broad roofs, with the tail inside the support bounds.
  if(w>=230){const drain=p.id%2?w-7:3;rect(c,'#344b4e',drain,31,3,17);rect(c,'#60756b',drain,32,1,13);shape(c,'#3b5150',[drain,46,drain+3,46,drain+3,50,drain+7,52,drain+6,54,drain,50]);}
 }else if(l.world===2){
  rect(c,'#34474d',6,28,w-12,4);rect(c,'#5e6c61',7,29,w-14,1);
  for(let x=12;x<w-46;x+=61){shape(c,'#3c5051',[x,32,x+5,32,x+32,50,x+27,50]);line(c,'#646c59',[x+2,33,x+28,49]);shape(c,'#344a50',[x+41,32,x+46,32,x+18,50,x+13,50]);}
  rect(c,'#30434b',9,50,w-18,4);rect(c,'#626b56',10,50,w-20,1);
  for(const x of [10,w-16]){rect(c,'#4c584e',x,31,5,23);rect(c,'#807655',x,32,1,20);}
 }else if(l.world===3){
  const positions=[Math.floor(w*.2),Math.floor(w*.73)];
  for(let i=0;i<positions.length;i++){const x=positions[i],tip=46+((p.id+i*7)%9);shape(c,'#426b7b',[x-10,28,x+12,28,x+4,tip-5,x-2,tip]);shape(c,'#5c8590',[x-8,28,x+3,29,x-2,tip]);line(c,'#88a8aa',[x-7,29,x-3,40]);}
 }else{
  const ornate=l.world===4;
  const shade=ornate?'#3f515a':'#36514b',face=ornate?'#59686a':'#4b6658',edge=ornate?'#7e877c':'#6b8167';
  const span=Math.min(108,w-28),start=Math.floor((w-span)/2);
  rect(c,shade,5,28,w-10,5);rect(c,face,7,29,w-14,1);
  shape(c,shade,[start,32,start+span,32,start+span,54,start+span-10,54,start+span-10,45,start+span-21,45,start+span-21,38,start+21,38,start+21,45,start+10,45,start+10,54,start,54]);
  for(const [x,dir] of [[start,1],[start+span,-1]]){
   shape(c,face,[x,32,x+dir*23,32,x+dir*23,36,x+dir*15,36,x+dir*15,42,x+dir*7,42,x+dir*7,50,x+dir*2,50,x+dir*2,54,x,54]);
   line(c,edge,[x+dir*2,33,x+dir*20,33]);line(c,edge,[x+dir*2,41,x+dir*11,41]);
  }
  const center=Math.floor(w/2);
  shape(c,ornate?'#7d8274':'#617765',[center-5,31,center+5,31,center+3,39,center-3,39]);line(c,edge,[center-3,32,center+3,32]);
  if(ornate)rect(c,'#a39570',center,34,1,2);
  else {line(c,'#596747',[start+3,43,start+5,48,start+3,54]);rect(c,'#71835c',start+4,48,4,2);}
 }
 c.restore();
}
