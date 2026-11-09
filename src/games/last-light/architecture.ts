import {WORLDS,type Level} from './levels';
type C=CanvasRenderingContext2D;
const tiles=new Map<string,HTMLCanvasElement>();
function masonry(world:number,industrial:boolean){
 const key=`${world}/${industrial}`;let tile=tiles.get(key);if(tile)return tile;
 tile=document.createElement('canvas');tile.width=96;tile.height=48;
 const c=tile.getContext('2d')!,theme=WORLDS[world];c.fillStyle=theme.far;c.fillRect(0,0,96,48);
 // Deep mortar and occasional chipped faces, drawn at the courier's native
 // texel scale. Cache only the small repeating material, never whole levels.
 for(let row=0;row<4;row++)for(let col=-1;col<5;col++){
  const x=col*24+(row%2)*12,y=row*12;c.fillStyle=theme.near+'70';c.fillRect(x+1,y+1,22,10);
  c.fillStyle=theme.edge+'13';c.fillRect(x+2,y+1,20,1);c.fillStyle='#14243040';c.fillRect(x+2,y+10,21,1);
  if((row+col)%3===0){c.fillStyle=theme.edge+'16';c.fillRect(x+6,y+4,5,1);}
 }
 if(industrial){c.fillStyle='#152b3544';c.fillRect(0,0,96,48);}
 tiles.set(key,tile);return tile;
}
/** World-space construction follows the actual collision ledges. Recessed
 * walls, bolted brackets and pipe risers establish one building, while only
 * the foreground deck caps carry the bright walkable edge. */
export function drawArchitecture(c:C,l:Level,cx:number,cy:number,w:number,h:number){
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
  if(p.kind==='moving'||p.kind==='crumble')continue;
  const bottom=p.y+p.h,depth=l.water===null?Math.max(220,cy+h-bottom+96):200;
  if(l.setting!=='tower'&&l.setting!=='factory'&&l.setting!=='cavern'&&l.setting!=='bridge'){
   c.fillStyle=pattern!;c.fillRect(p.x+3,bottom,p.w-6,depth);
   c.fillStyle='#101f2b35';c.fillRect(p.x+3,bottom,p.w-6,depth);
   for(let x=p.x+23;x<p.x+p.w-21;x+=54){
    c.fillStyle='#152733';c.fillRect(x,bottom+36,19,35);c.fillStyle=theme.near;c.fillRect(x+8,bottom+37,2,33);c.fillRect(x+1,bottom+52,17,2);
    if((p.id+Math.floor(x/54))%4===0){c.fillStyle=theme.accent+'2d';c.fillRect(x+2,bottom+38,5,12);}
   }
   c.fillStyle=theme.near;c.fillRect(p.x+3,bottom,4,depth);c.fillRect(p.x+p.w-7,bottom,4,depth);
  }
  // Brackets touch the underside of the real deck. Subdued iron stays
  // behind every jump, actor and hazard, with no false bright landing tops.
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
