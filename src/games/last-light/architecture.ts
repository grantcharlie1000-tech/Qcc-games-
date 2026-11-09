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
 const visible=l.platforms.slice(0,l.mainCount).filter(p=>p.x+p.w>cx-200&&p.x<cx+w+200&&p.y+250>cy&&p.y<cy+h+100);
 // Tall tower backplanes connect the switchbacks, rather than making a
 // separate floating prop behind each landing.
 if(l.setting==='tower'||l.setting==='factory'||l.setting==='cavern'){
  const top=Math.min(...l.platforms.map(p=>p.y))-110;
  c.fillStyle=pattern!;c.fillRect(cx,Math.max(cy,top),w,cy+h-Math.max(cy,top));
  c.fillStyle='#101f2b45';c.fillRect(cx,Math.max(cy,top),w,cy+h-Math.max(cy,top));
  for(let x=Math.floor(cx/240)*240;x<cx+w;x+=240){
   c.fillStyle=theme.near;c.fillRect(x,Math.max(cy,top),7,cy+h-Math.max(cy,top));
   c.fillStyle=theme.edge+'18';c.fillRect(x,Math.max(cy,top),1,cy+h-Math.max(cy,top));
   for(let y=Math.floor(cy/160)*160;y<cy+h;y+=160){c.fillStyle='#14273388';c.fillRect(x+37,y+12,78,92);c.fillStyle=theme.near+'88';c.fillRect(x+72,y+12,3,92);c.fillRect(x+37,y+57,78,3);}
  }
 }
 for(const p of visible){
  if(p.kind==='moving'||p.kind==='crumble')continue;
  const bottom=p.y+p.h,depth=l.setting==='sky'||l.setting==='bridge'?Math.max(220,cy+h-bottom+80):200;
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
   c.fillStyle='#192d37';c.fillRect(p.x+p.w-26,bottom,8,116);c.fillStyle='#60727470';c.fillRect(p.x+p.w-24,bottom,2,114);
   for(let y=bottom+12;y<bottom+116;y+=32){c.fillStyle='#334c55';c.fillRect(p.x+p.w-28,y,12,4);}
  }
 }
 c.restore();
}
