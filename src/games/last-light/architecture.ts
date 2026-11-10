import {materialTile} from './generated-art';
import {WORLDS,type Level} from './levels';
import {facadeWindow} from './facade-art';
import {drawQuarterPlace} from './quarter-place';
type C=CanvasRenderingContext2D;
const tiles=new Map<string,HTMLCanvasElement>();
function masonry(world:number,industrial:boolean){
 const key=`${world}/${industrial}/${Boolean(materialTile(industrial?'patina':'limestone',world,true))}`;let tile=tiles.get(key);if(tile)return tile;
 tile=document.createElement('canvas');tile.width=96;tile.height=48;
 const c=tile.getContext('2d',{willReadFrequently:true})!,theme=WORLDS[world];c.fillStyle=theme.far;c.fillRect(0,0,96,48);
 const sampled=materialTile(industrial?'patina':'limestone',world,true);if(sampled){c.fillStyle=c.createPattern(sampled,'repeat')!;c.fillRect(0,0,96,48);}
 // Deep mortar and occasional chipped faces, drawn at the courier's native
 // texel scale. Cache only the small repeating material, never whole levels.
 for(let row=0;row<4;row++)for(let col=-1;col<5;col++){
  const x=col*24+(row%2)*12,y=row*12;c.fillStyle=theme.near+'30';c.fillRect(x+1,y+1,22,10);
  c.fillStyle=theme.edge+'25';c.fillRect(x+2,y+1,19,1);c.fillRect(x+2,y+2,1,7);c.fillStyle='#14243065';c.fillRect(x+2,y+10,21,1);c.fillRect(x+22,y+3,1,7);
  if((row+col)%3===0){c.fillStyle=theme.edge+'20';c.fillRect(x+6,y+4,5,1);c.fillStyle=theme.sky+'80';c.fillRect(x+17,y+7,3,1);}
  if((row+col)%4===0){c.fillStyle=theme.sky+'80';c.fillRect(x+19,y+1,2,2);c.fillStyle=theme.edge+'35';c.fillRect(x+18,y+3,2,1);}
 }
 if(industrial){c.fillStyle='#152b3544';c.fillRect(0,0,96,48);}
 tiles.set(key,tile);return tile;
}
/** World-space construction follows the actual collision ledges. Recessed
 * walls, bolted brackets and pipe risers establish one building, while only
 * the foreground deck caps carry the bright walkable edge. */
export function drawArchitecture(c:C,l:Level,cx:number,cy:number,w:number,h:number,clock=0){
 if(l.world===0){drawQuarterPlace(c,l,clock,cx,cy,w,h);return;}
 const theme=WORLDS[l.world],industrial=l.setting==='factory'||l.setting==='tower',tile=masonry(l.world,industrial);
 c.save();
 const pattern=c.createPattern(tile,'repeat');
 const visible=l.platforms.slice(0,l.mainCount).filter(p=>p.x+p.w>cx-200&&p.x<cx+w+200&&p.y<cy+h+100);
 // Tall tower backplanes connect the switchbacks, rather than making a
 // separate floating prop behind each landing.
 if(l.setting==='tower'||l.setting==='factory'||l.setting==='cavern'){
  const top=Math.max(cy,Math.min(...l.platforms.map(p=>p.y))-110),bottom=cy+h;
  // Recessed bays expose the distant city/cavern. Full-screen opaque brick
  // used to flatten every parallax plane into one uninterrupted wall.
  for(let x=Math.floor(cx/240)*240-240;x<cx+w;x+=240){
   c.fillStyle=pattern!;c.fillRect(x,top,28,bottom-top);c.fillStyle=theme.near;c.fillRect(x+2,top,5,bottom-top);c.fillStyle=theme.edge+'22';c.fillRect(x+2,top,1,bottom-top);
   for(let y=Math.floor(top/160)*160;y<bottom;y+=160){
    c.fillStyle=pattern!;c.fillRect(x+28,y,212,24);c.fillStyle=theme.near;c.fillRect(x+28,y+22,212,5);c.fillStyle=theme.edge+'27';c.fillRect(x+28,y+22,212,1);
    c.fillStyle='#152b354d';c.fillRect(x+36,y+32,194,117);
    c.fillStyle=theme.near+'aa';c.fillRect(x+126,y+28,4,122);c.fillRect(x+31,y+88,204,3);c.fillStyle=theme.edge+'20';c.fillRect(x+126,y+29,1,120);
   }
  }
 }
 for(const p of visible){
  if(p.kind==='moving'){
   const travel=p.travel??0,vertical=p.axis==='y',x=p.x+p.w/2,y=p.y+p.h/2;
   c.fillStyle='#152c36';c.fillRect(vertical?x-3:p.x-travel-6,vertical?p.y-travel-8:y-3,vertical?6:p.w+travel*2+12,vertical?travel*2+28:6);
   c.fillStyle=theme.edge+'55';c.fillRect(vertical?x-1:p.x-travel-4,vertical?p.y-travel-7:y-1,vertical?1:p.w+travel*2+8,vertical?travel*2+26:1);
   for(const sign of [-1,1]){const xx=vertical?x:p.x+p.w/2+sign*(p.w/2+travel+4),yy=vertical?y+sign*(travel+12):y;c.fillStyle=theme.near;c.fillRect(xx-4,yy-4,8,8);c.fillStyle=theme.edge+'66';c.fillRect(xx-2,yy-2,2,2);}continue;
  }
  if(p.kind==='crumble')continue;
  if(p.h<=10)continue;
  const bottom=p.y+p.h,depth=Math.max(28,(l.water??l.height+48)-bottom);
  if(l.world===3&&l.setting!=='tower'&&l.setting!=='factory'){
   // Glacier shoulders meet the collision slab, then taper into the world fog.
   // They remain recessed and darker than the ice lip, like the town's cliffs.
   c.save();c.beginPath();c.moveTo(p.x+3,bottom);c.lineTo(p.x+p.w-3,bottom);c.lineTo(p.x+p.w-8,bottom+depth*.37);c.lineTo(p.x+p.w-19,bottom+depth);c.lineTo(p.x+14,bottom+depth);c.lineTo(p.x+6,bottom+depth*.3);c.closePath();c.clip();
   c.fillStyle='#2d475e';c.fillRect(p.x,bottom,p.w,depth);
   const rock=materialTile('slate',l.world,true);if(rock){c.globalAlpha=.58;c.fillStyle=c.createPattern(rock,'repeat')!;c.fillRect(p.x,bottom,p.w,depth);c.globalAlpha=1;}
   // Broad offset strata and branching fractures avoid repeated hanging bars.
   for(let row=0;row<depth/43;row++)for(let col=-1;col<p.w/67;col++){
    const xx=p.x+col*67+(row%2)*31,yy=bottom+17+row*43,span=37+(row+col+p.id+8)%4*7;
    c.fillStyle='#152e4280';c.fillRect(xx,yy,span,2);c.fillStyle='#7294a54a';c.fillRect(xx+2,yy+2,span-7,1);
    const joint=xx+span-3;c.fillStyle='#1c354b';c.fillRect(joint,yy,2,12);c.fillRect(joint-4,yy+10,5,2);c.fillRect(joint-4,yy+10,2,17);
    if((row+col+p.id)%3===0){c.fillStyle='#688a9b44';c.fillRect(xx+7,yy-8,15,2);c.fillRect(xx+11,yy-6,22,1);}
   }
   c.fillStyle='#8baebe33';c.fillRect(p.x+4,bottom,4,Math.min(depth,49));c.fillStyle='#142b4380';c.fillRect(p.x+p.w-15,bottom,15,depth);c.restore();
  }
  if(l.setting!=='tower'&&l.setting!=='factory'&&l.setting!=='cavern'&&l.setting!=='bridge'){
   c.fillStyle=pattern!;c.fillRect(p.x+3,bottom,p.w-6,depth);
   c.fillStyle='#101f2b35';c.fillRect(p.x+3,bottom,p.w-6,depth);
   for(let row=0;row<depth/83;row++){
    const y=bottom+24+row*83;if(y+57<cy||y>cy+h)continue;
    for(let x=p.x+22;x<p.x+p.w-51;x+=73){const variant=(p.id+row+Math.floor((x-p.x)/73))%4;c.drawImage(facadeWindow(l.world,variant===0?1:variant===2?2:0),Math.round(x),Math.round(y));}
   }
   c.fillStyle=theme.near;c.fillRect(p.x+3,bottom,4,depth);c.fillRect(p.x+p.w-7,bottom,4,depth);
   c.fillStyle=theme.edge+'2c';c.fillRect(p.x+3,bottom,1,depth);c.fillRect(p.x+p.w-7,bottom,1,depth);
   // A connected downpipe, with collars and a shadow, gives the facade scale.
   if(p.w>=200){const x=p.x+p.w-15;c.fillStyle='#172e39';c.fillRect(x,bottom,5,depth);c.fillStyle='#5b7475';c.fillRect(x+1,bottom,2,depth);c.fillStyle='#9aac96';c.fillRect(x+1,bottom,1,depth);for(let y=bottom+21;y<cy+h;y+=62){if(y<cy-4)continue;c.fillStyle='#29454e';c.fillRect(x-1,y,7,4);c.fillStyle='#9b9e82';c.fillRect(x,y,5,1);}}
  }
  // Brackets touch the underside of the real deck. Subdued iron stays
  // behind every jump, actor and hazard, with no false bright landing tops.
  if(l.world===3&&l.setting!=='tower'&&l.setting!=='factory')continue;
  const xs=p.w<100?[p.x+p.w/2]:[p.x+13,p.x+p.w-16];
  for(const x of xs){
   c.strokeStyle=theme.near;c.lineWidth=4;c.beginPath();c.moveTo(x,bottom);c.lineTo(x,bottom+depth);c.stroke();
   c.strokeStyle=theme.edge+'2c';c.lineWidth=1;c.beginPath();c.moveTo(x-1,bottom);c.lineTo(x-1,bottom+depth);c.stroke();
   const dir=x<p.x+p.w/2?1:-1;c.strokeStyle=theme.near;c.lineWidth=3;c.beginPath();c.moveTo(x,bottom+36);c.lineTo(x+dir*Math.min(30,p.w/3),bottom+2);c.stroke();
  }
  if(industrial&&p.w>=200){
   c.fillStyle='#192d37';c.fillRect(p.x+p.w-26,bottom,8,depth);c.fillStyle='#60727470';c.fillRect(p.x+p.w-24,bottom,2,depth-2);
   for(let y=bottom+12;y<Math.min(bottom+depth,cy+h+12);y+=32){c.fillStyle='#334c55';c.fillRect(p.x+p.w-28,y,12,4);}
  }
 }
 c.restore();
}

export {masonry as architectureMasonry};
