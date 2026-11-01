import {CUSTOMS_HOUSE as map,type MapBox} from '../../../src/games/strongroom/maps/customs-house';
import type {Entity,Point,Simulation,SimWorld} from '../../../src/games/strongroom/sim';

/** Node fixture uses the authored geometry, real soft-cell colliders and the shipped regular nav graph. */
export function customsWorld(){
 let sim:Simulation|undefined;
 const statics:MapBox[]=[...map.solids,...map.props.map(p=>p.kind==='crate'?[p.x-p.size!/2,p.x+p.size!/2,0,p.size!,p.z-p.size!/2,p.z+p.size!/2,'crate'] as MapBox:[p.x-p.w!/2,p.x+p.w!/2,0,p.h!,p.z-p.d!/2,p.z+p.d!/2,'metal'] as MapBox)];
 const boxes=()=>[...statics,...(sim?.walls.panels.flatMap(p=>p.boxes.map(b=>[b.min.x,b.max.x,b.min.y,b.max.y,b.min.z,b.max.z,'wall'] as MapBox))??[])];
 function hit(from:Point,to:Point,b:MapBox){
  let lo=0,hi=1;
  for(const [a,d,min,max] of [[from.x,to.x-from.x,b[0],b[1]],[from.y,to.y-from.y,b[2],b[3]],[from.z,to.z-from.z,b[4],b[5]]]){
   if(Math.abs(d)<1e-9){if(a<min||a>max)return false;continue;}
   const t0=(min-a)/d,t1=(max-a)/d;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(lo>hi)return false;
  }
  return lo<1-.001&&hi>1e-5;
 }
 const entries=Object.entries(map.navigation.nodes),keys=entries.map(([id])=>id),adj=new Map(keys.map(k=>[k,[] as {id:string;cost:number}[]]));
 for(const [a,b] of map.navigation.edges){const ap=map.navigation.nodes[a],bp=map.navigation.nodes[b],cost=Math.hypot(ap[0]-bp[0],ap[2]-bp[2]);adj.get(a)!.push({id:b,cost});adj.get(b)!.push({id:a,cost});}
 const cache=new Map<string,Point[]>();
 const nearest=(p:Point)=>entries.reduce((a,b)=>Math.hypot(a[1][0]-p.x,a[1][2]-p.z)<Math.hypot(b[1][0]-p.x,b[1][2]-p.z)?a:b)[0];
 const world:SimWorld={spawns:[[0,0,-6],[0,0,-27]],strongrooms:map.strongrooms,panels:map.panels,bounds:map.bounds,
  spawn:(team,index,site='A',attacking=team===1,choice='quay')=>({...((attacking?map.attackSpawns[choice]:map.defenderSpawns[site])[index%6])}),
  blocked:(from,to)=>statics.some(b=>hit(from,to,b))||!!sim?.walls.raycast(from,{x:to.x-from.x,y:to.y-from.y,z:to.z-from.z},Math.hypot(to.x-from.x,to.y-from.y,to.z-from.z),'sight'),
  collide:(e:Entity,dx:number,dy:number,dz:number)=>{
   let x=e.x,z=e.z;const y=Math.max(.03,e.y+dy),h=e.crouch?1.25:1.83,r=.35;
   const obstacles=boxes().filter(b=>b[3]>y+.05&&b[2]<y+h-.01);
   let nx=x+dx;for(const b of obstacles){if(z+r<=b[4]||z-r>=b[5])continue;if(dx>0&&x+r<=b[0]+1e-5&&nx+r>b[0])nx=Math.min(nx,b[0]-r);if(dx<0&&x-r>=b[1]-1e-5&&nx-r<b[1])nx=Math.max(nx,b[1]+r);}x=nx;
   let nz=z+dz;for(const b of obstacles){if(x+r<=b[0]||x-r>=b[1])continue;if(dz>0&&z+r<=b[4]+1e-5&&nz+r>b[4])nz=Math.min(nz,b[4]-r);if(dz<0&&z-r>=b[5]-1e-5&&nz-r<b[5])nz=Math.max(nz,b[5]+r);}z=nz;
   return{x,y,z,ground:y<=.03};
  },
  path:(from,to)=>{
   const start=nearest(from),goal=nearest(to),cacheKey=start+'/'+goal;let path=cache.get(cacheKey);
   if(!path){const dist=new Map<string,number>([[start,0]]),prev=new Map<string,string>(),open=[start],closed=new Set<string>();
    while(open.length){open.sort((a,b)=>dist.get(a)!-dist.get(b)!);const at=open.shift()!;if(at===goal)break;if(closed.has(at))continue;closed.add(at);
     for(const n of adj.get(at)!){const next=dist.get(at)!+n.cost;if(next<(dist.get(n.id)??Infinity)){dist.set(n.id,next);prev.set(n.id,at);open.push(n.id);}}
    }
    const route=[goal];while(route[0]!==start&&prev.has(route[0]))route.unshift(prev.get(route[0])!);
    path=route.map(id=>{const p=map.navigation.nodes[id];return{x:p[0],y:p[1],z:p[2]};});cache.set(cacheKey,path);
   }
   return[...path.map(p=>({...p})),{x:to.x,y:0,z:to.z}];
  },
 };
 return{world,attach:(state:Simulation)=>{sim=state;}};
}
