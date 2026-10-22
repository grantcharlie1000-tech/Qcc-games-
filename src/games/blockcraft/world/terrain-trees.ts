// Tree shapes after the vanilla 1.20 tree features (trunk and foliage placers), scaled to a 128-high world.
// planTree() only describes a tree: it reports every log and leaf position to a sink, drawing all randomness
// from `random`, so the same seed always yields the same tree. World generation (terrain.ts) writes the
// parts that fall inside the chunk being generated; growTree() checks room and writes them with cause 'growth'.
//
// Every leaf is within LEAF_DECAY_DISTANCE (6) taxicab steps of a log through the tree's own leaves, and every
// block stays within TREE_REACH columns of the trunk origin (x, z) (the -x/-z corner of a 2×2 trunk).
import {blockId} from '../data/blocks';
import type {TreeKind} from '../engine/contracts';

/** Max horizontal (Chebyshev) distance of any tree block from its trunk origin. */
export const TREE_REACH=7;
export interface TreeSink{log(x:number,y:number,z:number):void;leaf(x:number,y:number,z:number):void}
export type Random=()=>number;

export const TREE_KINDS:readonly TreeKind[]=['oak','big_oak','birch','spruce','mega_spruce','jungle','jungle_bush','acacia','dark_oak','cherry'];
const WOOD:Record<TreeKind,string>={oak:'oak',big_oak:'oak',birch:'birch',spruce:'spruce',mega_spruce:'spruce',jungle:'jungle',jungle_bush:'jungle',
  acacia:'acacia',dark_oak:'dark_oak',cherry:'cherry'};
/** Wood type (log, sapling) of each tree kind. */
export const treeWood=(kind:TreeKind)=>WOOD[kind];
const LOGS=new Map<TreeKind,number>(),LEAVES=new Map<TreeKind,number>();
for(const kind of TREE_KINDS){
  LOGS.set(kind,blockId(`${WOOD[kind]}_log`));
  // Jungle bushes are a jungle log wrapped in oak leaves, as in vanilla.
  LEAVES.set(kind,blockId(`${kind==='jungle_bush'?'oak':WOOD[kind]}_leaves`));
}
export const treeLog=(kind:TreeKind)=>LOGS.get(kind)!;
export const treeLeaves=(kind:TreeKind)=>LEAVES.get(kind)!;

const CARDINAL=[[1,0],[-1,0],[0,1],[0,-1]] as const;
const int=(random:Random,n:number)=>Math.floor(random()*n);

/** Describe a tree with its trunk base at (x,y,z). `wide` selects the 2×2 form of dark oak, mega spruce and
 *  jungle (trunk at x..x+1, z..z+1); without it those kinds fall back to their single-trunk relatives. */
export function planTree(kind:TreeKind,x:number,y:number,z:number,random:Random,sink:TreeSink,wide=false):void{
  switch(kind){
    case 'oak':blobTree(x,y,z,4+int(random,3),random,sink);break;
    case 'birch':blobTree(x,y,z,5+int(random,3),random,sink);break;
    case 'jungle':if(wide)megaJungle(x,y,z,random,sink);else blobTree(x,y,z,4+int(random,9),random,sink);break;
    case 'dark_oak':if(wide)darkOak(x,y,z,random,sink);else blobTree(x,y,z,4+int(random,3),random,sink);break;
    case 'spruce':spruce(x,y,z,random,sink);break;
    case 'mega_spruce':if(wide)megaSpruce(x,y,z,random,sink);else spruce(x,y,z,random,sink);break;
    case 'big_oak':fancyOak(x,y,z,random,sink);break;
    case 'jungle_bush':jungleBush(x,y,z,random,sink);break;
    case 'acacia':acacia(x,y,z,random,sink);break;
    case 'cherry':cherry(x,y,z,random,sink);break;
  }
}

/** Oak, birch and small jungle trees: straight trunk and the vanilla blob foliage (radius 2, three layers plus a cap). */
function blobTree(x:number,y:number,z:number,height:number,random:Random,s:TreeSink){
  for(let i=0;i<height;i++)s.log(x,y+i,z);
  const top=y+height;
  for(let i=0;i>=-3;i--){
    const r=i>=-1?1:2,ly=top+i;
    for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
      if(Math.abs(dx)===r&&Math.abs(dz)===r&&(i===0||random()<.5))continue;
      s.leaf(x+dx,ly,z+dz);
    }
  }
}

/** Spruce: straight trunk with the vanilla spruce foliage cone (radius alternating up to 2-3, corners removed). */
function spruce(x:number,y:number,z:number,random:Random,s:TreeSink){
  const height=5+int(random,3)+int(random,2),radius=2+int(random,2),offset=int(random,3);
  const foliage=Math.min(height-1,Math.max(4,height-1-int(random,2)));
  for(let i=0;i<height;i++)s.log(x,y+i,z);
  let r=int(random,2),max=1,start=0;
  for(let l=offset;l>=-foliage;l--){
    const ly=y+height+l;
    for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++)if(!(r>0&&Math.abs(dx)===r&&Math.abs(dz)===r))s.leaf(x+dx,ly,z+dz);
    if(r>=max){r=start;start=1;max=Math.min(max+1,radius);}else r++;
  }
}

/** Leaves on one layer around a 2×2 trunk at (x..x+1, z..z+1). `test(ax,az)` gets the distances from the nearer
 *  trunk column and returns true to place a leaf. */
function wideLayer(x:number,y:number,z:number,r:number,s:TreeSink,test:(ax:number,az:number)=>boolean){
  for(let dz=-r;dz<=r+1;dz++)for(let dx=-r;dx<=r+1;dx++){
    const ax=dx>0?dx-1:-dx,az=dz>0?dz-1:-dz;
    if(test(ax,az))s.leaf(x+dx,y,z+dz);
  }
}
function wideLog(x:number,y:number,z:number,s:TreeSink){s.log(x,y,z);s.log(x+1,y,z);s.log(x,y,z+1);s.log(x+1,y,z+1);}

/** Mega spruce: 2×2 trunk 13-22 high under a long pine crown (vanilla MegaPineFoliagePlacer). */
function megaSpruce(x:number,y:number,z:number,random:Random,s:TreeSink){
  const height=13+int(random,3)+int(random,8);
  const crown=Math.min(height-3,10+int(random,5));
  for(let i=0;i<height;i++)wideLog(x,y+i,z,s);
  const top=y+height;let previous=0;
  for(let j=top-crown;j<=top;j++){
    const k=top-j,l=Math.floor(k/crown*3.5),m=k>0&&l===previous&&(j&1)===0?l+1:l;
    wideLayer(x,j,z,m,s,(ax,az)=>ax+az<7&&ax*ax+az*az<=m*m);
    previous=l;
  }
}

/** Mega jungle tree: 2×2 trunk 10-24 high, side branches with small leaf blobs and a wide crown. */
function megaJungle(x:number,y:number,z:number,random:Random,s:TreeSink){
  const height=10+int(random,3)+int(random,12);
  for(let i=0;i<height;i++)wideLog(x,y+i,z,s);
  // Crown (vanilla MegaJungleFoliagePlacer, radius 2, two layers below the top).
  for(let j=0;j>=-2;j--){const r=3-j;wideLayer(x,y+height+j,z,r,s,(ax,az)=>ax+az<7&&ax*ax+az*az<=r*r);}
  for(let i=height-2-int(random,4);i>height/2;i-=2+int(random,4)){
    const angle=random()*Math.PI*2;let bx=0,bz=0,by=0;
    for(let l=0;l<4;l++){
      bx=Math.trunc(1.5+Math.cos(angle)*l);bz=Math.trunc(1.5+Math.sin(angle)*l);by=y+i-3+(l>>1);
      s.log(x+bx,by,z+bz);
    }
    // A small blob around the branch end: radius 1 above it, 2 level with it, 3 below.
    const layers=1+int(random,2);
    for(let j=0;j>=-layers;j--){
      const r=1-j,ly=by+1+j;
      for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++)if(dx*dx+dz*dz<=r*r)s.leaf(x+bx+dx,ly,z+bz+dz);
    }
  }
}

/** Dark oak: 2×2 trunk 6-9 high that may lean by up to two blocks near the top, a wide flat canopy and short
 *  hanging log stubs round the canopy (vanilla DarkOakTrunkPlacer / DarkOakFoliagePlacer). */
function darkOak(x:number,y:number,z:number,random:Random,s:TreeSink){
  const height=6+int(random,3)+int(random,2);
  const leanStart=height-1-int(random,4),[dx,dz]=CARDINAL[int(random,4)];
  let lean=2-int(random,3),ox=0,oz=0;
  for(let l=0;l<height;l++){
    if(l>=leanStart&&lean>0){ox+=dx;oz+=dz;lean--;}
    wideLog(x+ox,y+l,z+oz,s);
  }
  const tx=x+ox,tz=z+oz,top=y+height-1;
  wideLayer(tx,top-1,tz,2,s,()=>true);
  wideLayer(tx,top,tz,3,s,(ax,az)=>!(ax===3&&az===3));
  wideLayer(tx,top+1,tz,2,s,(ax,az)=>ax+az<=2);
  if(random()<.5)wideLayer(tx,top+2,tz,0,s,()=>true);
  for(let rx=-1;rx<=2;rx++)for(let rz=-1;rz<=2;rz++){
    if(rx>=0&&rx<=1&&rz>=0&&rz<=1||int(random,3)>0)continue;
    const stub=2+int(random,3);
    for(let k=0;k<stub;k++)s.log(tx+rx,top-1-k,tz+rz);
    for(let ex=-2;ex<=2;ex++)for(let ez=-2;ez<=2;ez++)if(!(Math.abs(ex)===2&&Math.abs(ez)===2))s.leaf(tx+rx+ex,top-1,tz+rz+ez);
    for(let ex=-1;ex<=1;ex++)for(let ez=-1;ez<=1;ez++)s.leaf(tx+rx+ex,top,tz+rz+ez);
  }
}

/** Big (fancy) oak: a tall trunk with 2-4 branches rising to leaf clusters, plus a cluster on the trunk top. */
function fancyOak(x:number,y:number,z:number,random:Random,s:TreeSink){
  const height=7+int(random,5),trunk=height-2;
  for(let i=0;i<trunk;i++)s.log(x,y+i,z);
  cluster(x,y+trunk-1,z,s);
  const branches=2+int(random,3),low=2+Math.floor(trunk*.3);
  for(let b=0;b<branches;b++){
    const angle=random()*Math.PI*2,d=2+random()*2.5;
    let bx=Math.max(-4,Math.min(4,Math.round(Math.cos(angle)*d))),bz=Math.max(-4,Math.min(4,Math.round(Math.sin(angle)*d)));
    if(!bx&&!bz)bx=2;
    const ny=y+low+int(random,Math.max(1,trunk-1-low)),sy=Math.max(y+1,ny-Math.min(2,Math.floor(d*.6)));
    line(x,sy,z,x+bx,ny,z+bz,s);
    cluster(x+bx,ny,z+bz,s);
  }
}
/** Fancy-oak leaf cluster centred on a log: discs of radius 2, 3, 3 and 1 from one below to two above. */
function cluster(x:number,y:number,z:number,s:TreeSink){
  for(let dy=-1;dy<=2;dy++){
    const r2=dy===-1?4.5:dy===0?9.5:dy===1?8.5:2.5;
    for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++)
      if(dx*dx+dz*dz<=r2&&Math.abs(dx)+Math.abs(dz)+Math.abs(dy)<=5)s.leaf(x+dx,y+dy,z+dz);
  }
}
/** 26-connected log line between two points. */
function line(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,s:TreeSink){
  const steps=Math.max(Math.abs(x1-x0),Math.abs(y1-y0),Math.abs(z1-z0));
  for(let i=1;i<=steps;i++){const t=i/steps;s.log(Math.round(x0+(x1-x0)*t),Math.round(y0+(y1-y0)*t),Math.round(z0+(z1-z0)*t));}
}

/** Jungle bush: one log in a mound of leaves (vanilla BushFoliagePlacer, radius 2). */
function jungleBush(x:number,y:number,z:number,random:Random,s:TreeSink){
  s.log(x,y,z);
  for(let i=1;i>=-1;i--){
    const r=1-i,ly=y+1+i;
    for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
      if(r>0&&Math.abs(dx)===r&&Math.abs(dz)===r&&random()<.5)continue;
      s.leaf(x+dx,ly,z+dz);
    }
  }
}

/** Acacia: a trunk that bends diagonally 1-3 blocks near the top, an optional second fork and flat canopies
 *  (vanilla ForkingTrunkPlacer and AcaciaFoliagePlacer). */
function acacia(x:number,y:number,z:number,random:Random,s:TreeSink){
  const height=5+int(random,3)+int(random,3);
  const di=int(random,4),[dx,dz]=CARDINAL[di];
  const bend=height-int(random,4)-1;
  let steps=3-int(random,3),bx=x,bz=z;
  for(let l=0;l<height;l++){
    if(l>=bend&&steps>0){bx+=dx;bz+=dz;steps--;}
    s.log(bx,y+l,bz);
  }
  acaciaCanopy(bx,y+height,bz,3,s);
  const di2=int(random,4);
  if(di2!==di){
    const [ex,ez]=CARDINAL[di2];
    let length=1+int(random,3),fx=x,fz=z,end=-1;
    for(let r=bend-int(random,2)-1;r<height&&length>0;r++,length--){
      if(r<1)continue;
      fx+=ex;fz+=ez;s.log(fx,y+r,fz);end=y+r;
    }
    if(end>=0)acaciaCanopy(fx,end+1,fz,2,s);
  }
}
/** Flat acacia canopy above a branch end: radius r level with the end log, a cross of radius 2 above it. */
function acaciaCanopy(x:number,y:number,z:number,r:number,s:TreeSink){
  for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++)if(!(Math.abs(dx)===r&&Math.abs(dz)===r))s.leaf(x+dx,y-1,z+dz);
  for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){
    const ax=Math.abs(dx),az=Math.abs(dz);
    if((ax>1||az>1)&&ax!==0&&az!==0)continue;
    s.leaf(x+dx,y,z+dz);
  }
}

/** Cherry: a straight trunk with one to three branches that curve out and up, each ending in a wide pink canopy
 *  with hanging leaves (vanilla CherryTrunkPlacer and CherryFoliagePlacer, branches a block shorter). */
function cherry(x:number,y:number,z:number,random:Random,s:TreeSink){
  const height=7+int(random,2);
  const first=Math.max(0,height-1-(3+int(random,2)));
  let second=Math.max(0,height-1-(3+int(random,2)));if(second>=first)second++;
  const count=1+int(random,3),three=count===3,two=count>=2;
  const trunk=three?height:two?Math.max(first,second)+1:first+1;
  for(let i=0;i<trunk;i++)s.log(x,y+i,z);
  if(three)cherryCanopy(x,y+trunk,z,random,s);
  const di=int(random,4);
  cherryBranch(x,y,z,height,CARDINAL[di],first,first<trunk-1,random,s);
  if(two)cherryBranch(x,y,z,height,CARDINAL[di^1],second,second<trunk-1,random,s);
}
function cherryBranch(x:number,y:number,z:number,height:number,[dx,dz]:readonly [number,number],start:number,horizontalFirst:boolean,random:Random,s:TreeSink){
  const sy=y+start,end=height-1-int(random,2),flat=horizontalFirst||end<start;
  const length=2+int(random,2)+(flat?1:0);
  const ex=x+dx*length,ey=y+end,ez=z+dz*length;
  let cx=x,cy=sy,cz=z;
  for(let k=0;k<(flat?2:1);k++){cx+=dx;cz+=dz;s.log(cx,cy,cz);}
  const up=ey>cy?1:-1;
  for(;;){
    const distance=Math.abs(ex-cx)+Math.abs(ey-cy)+Math.abs(ez-cz);
    if(distance===0)break;
    if(random()<Math.abs(ey-cy)/distance)cy+=up;else{cx+=dx;cz+=dz;}
    s.log(cx,cy,cz);
  }
  cherryCanopy(ex,ey+1,ez,random,s);
}
/** Cherry canopy around an attachment one above the end log (ex, y-1, ez): radius 1, 2, 3 from two above down to
 *  level, then radius 3 and 2 with hanging leaves below their rims. */
function cherryCanopy(x:number,y:number,z:number,random:Random,s:TreeSink){
  const placed=new Set<number>();
  const row=(r:number,ly:number,hanging:boolean)=>{
    placed.clear();
    for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
      const ax=Math.abs(dx),az=Math.abs(dz);
      if(ly===y-1&&(ax===r||az===r)&&random()<.25)continue;
      const corner=ax===r&&az===r;
      if(r>2?corner||ax+az>r*2-2&&random()<.25:corner&&random()<.25)continue;
      s.leaf(x+dx,ly,z+dz);placed.add((dx+8)*32+dz+8);
    }
    if(!hanging)return;
    for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
      if(Math.abs(dx)!==r&&Math.abs(dz)!==r||!placed.has((dx+8)*32+dz+8))continue;
      // Distance from the end log below the attachment stays within leaf decay range.
      const d=Math.abs(dx)+Math.abs(dz)+(y-1-(ly-1));
      if(d>=7||random()>=1/6)continue;
      s.leaf(x+dx,ly-1,z+dz);
      if(d+1<7&&random()<1/3)s.leaf(x+dx,ly-2,z+dz);
    }
  };
  row(1,y+2,false);row(2,y+1,false);row(3,y,false);row(3,y-1,true);row(2,y-2,true);
}
