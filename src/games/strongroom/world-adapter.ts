import * as THREE from 'three';
import {PANEL_FLAG,WallStore} from './walls';
import type {Entity,Point,SimWorld} from './sim';
/** The retained solver and A* consume the same host/guest wall cells as sight and shots. */
export class CollisionAdapter{
 onWallShot:((cell:number)=>void)|null=null;
 readonly world:SimWorld;private store:WallStore|undefined;private revision=-1;private colliders:any[];private staticColliders:any[];private portalKey='';private baseEdges:[number,number][];
 private p=new THREE.Vector3();private d=new THREE.Vector3();private a=new THREE.Vector3();private b=new THREE.Vector3();
 constructor(private raw:any){
  this.staticColliders=raw.colliders;this.colliders=raw.colliders;this.baseEdges=[...raw.waypoints.edges];const definition=raw.mapDefinition;
  raw.solids?.updateMatrixWorld(true);
  this.world={spawns:[[0,0,-27],[-12,0,-9]],panels:definition?.panels,strongrooms:definition?.strongrooms,bounds:definition?.bounds,buildingFootprint:definition?.buildingFootprint,
   spawn:(team,index,site='A',attacking=team===1,choice='quay')=>{const points=attacking?definition?.attackSpawns?.[choice]:definition?.defenderSpawns?.[site];if(points?.length)return {...points[index%points.length]};const list=raw.spawns[attacking?'t':'ct'],s=list[index%list.length];return{x:s.pos.x,y:s.pos.y,z:s.pos.z,yaw:s.yaw??(attacking?0:Math.PI)};},
   collide:(e,dx,dy,dz)=>{this.sync();this.p.set(e.x,e.y,e.z);this.d.set(dx,dy,dz);const result=raw.resolveMovement(this.p,this.d,.35,e.crouch?1.25:1.83);return{x:result.pos.x,y:result.pos.y,z:result.pos.z,ground:result.onGround};},
   blocked:(from,to)=>{const length=this.direction(from,to);if(length<.001)return false;const hit=raw.raycast(this.a,this.b,length),wall=this.store?.raycast(from,this.b,length,'sight');return !!hit&&hit.distance<length-.03||!!wall&&wall.distance<length-.03;},
   path:(from,to)=>{this.sync();this.a.set(from.x,from.y,from.z);this.b.set(to.x,to.y,to.z);return raw.findPath(this.a,this.b)?.map((p:THREE.Vector3)=>({x:p.x,y:p.y,z:p.z}))??[];},
   contact:(from,to)=>{const length=this.direction(from,to);if(length<.0001)return null;const hard=raw.raycast(this.a,this.b,length),soft=this.store?.raycast(from,this.b,length,'shot'),hit=hard&&(!soft||hard.distance<soft.distance)?hard:soft;if(!hit)return null;return{point:{x:hit.point.x,y:hit.point.y,z:hit.point.z},normal:{x:hit.normal.x,y:hit.normal.y,z:hit.normal.z}};},
   shot:(origin,direction,distance,source,damage)=>{
    this.a.set(origin.x,origin.y,origin.z);this.b.set(direction.x,direction.y,direction.z);const hard=raw.raycast(this.a,this.b,distance),wall=this.store?.raycast(origin,direction,distance,'shot');
    if(hard&&(!wall||hard.distance<wall.distance))return{blocked:true,scale:0};
    if(!wall)return{blocked:false,scale:1};const panel=this.store!.getPanel(wall.panelId)!;this.onWallShot?.(wall.cell);if(panel.flags&PANEL_FLAG.REINFORCED)return{blocked:true,scale:0};
    const scale=wall.penetration;this.store!.damageCell(wall.cell,source,damage);
    // One penetration only. A second soft surface or hard cover still stops it.
    const start={x:wall.point.x+direction.x*.002,y:wall.point.y+direction.y*.002,z:wall.point.z+direction.z*.002};
    const second=this.store!.raycast(start,direction,Math.max(0,distance-wall.distance-.002),'shot');
    return{blocked:!!hard||!!second,scale:hard||second?0:scale};
   }};
 }
 bind(store:WallStore){if(this.store===store)return;this.store=store;this.revision=-1;this.portalKey='unbound';this.sync();}
 private direction(from:Point,to:Point){this.a.set(from.x,from.y,from.z);this.b.set(to.x-from.x,to.y-from.y,to.z-from.z);const length=this.b.length();if(length>.001)this.b.multiplyScalar(1/length);return length;}
 private sync(){
  if(!this.store||this.revision===this.store.revision)return;this.revision=this.store.revision;
  this.colliders=[...this.staticColliders];for(const p of this.store.panels)this.colliders.push(...p.boxes);this.raw.colliders=this.colliders;
  const portals=(this.raw.mapDefinition?.navigation?.breachEdges??[]).filter((edge:any)=>this.store!.hasDoorway(edge.panel));const key=portals.map((e:any)=>e.panel).join(',');if(key===this.portalKey)return;this.portalKey=key;
  const nodes=this.raw.waypoints.nodes,byKey=new Map<string,any>(nodes.map((n:any)=>[n.key,n])),edges:[number,number][]=[...this.baseEdges];
  for(const edge of portals){const a=byKey.get(edge.a),b=byKey.get(edge.b);if(a&&b)edges.push([a.id,b.id]);}
  this.raw.waypoints.edges=edges;const adjacency:any[][]=nodes.map(()=>[]);for(const [a,b] of edges){const cost=nodes[a].pos.distanceTo(nodes[b].pos);adjacency[a].push({id:b,cost});adjacency[b].push({id:a,cost});}this.raw._adjacency=adjacency;this.raw._pathCache?.clear();
 }
}
