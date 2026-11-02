import {Vector3,type PerspectiveCamera} from 'three';
import type {Entity,Simulation} from './sim';

export interface HUDMarker{seat:number;x:number;y:number;kind:'spotted'|'cracker';label?:string;edge?:boolean}
const point=new Vector3(),forward=new Vector3(),delta=new Vector3();
/** Project authority-owned hints without DOM measurements or extra render passes. */
export function hudMarkers(camera:PerspectiveCamera,entities:Entity[],local:number|null,time:number,state?:Simulation):HUDMarker[]{
 const viewer=entities.find(e=>e.seat===local);if(!viewer)return [];
 camera.getWorldDirection(forward);const markers:HUDMarker[]=[];
 for(const e of entities){
  if(e.team===viewer.team||e.hp<=0||e.spottedUntil<=time)continue;
  point.set(e.x,e.y+2.15,e.z);if(delta.copy(point).sub(camera.position).dot(forward)<=0)continue;
  point.project(camera);if(Math.abs(point.x)<.92&&Math.abs(point.y)<.8)markers.push({seat:e.seat,x:(point.x+1)*50,y:(1-point.y)*50,kind:'spotted'});
 }
 if(!state||!['prep','action','planted'].includes(state.phase)||state.objective.state==='disabled')return markers;
 const o=state.objective,carrier=o.state==='carried'?entities.find(e=>e.seat===o.carrier&&e.hp>0):undefined;
 if(o.state==='carried'&&!carrier)return markers;
 const position=carrier?{x:carrier.x,y:carrier.y+(carrier.crouch?.9:1.3),z:carrier.z}:{x:o.position.x,y:o.position.y+.4,z:o.position.z};
 if(!viewer.attacking&&state.world.blocked(camera.position,position))return markers;
 const distance=point.set(position.x,position.y,position.z).distanceTo(camera.position);if(carrier&&distance<1)return markers;
 point.y+=carrier?1:.5;delta.copy(point).applyMatrix4(camera.matrixWorldInverse);const front=delta.z<0,depth=Math.max(.001,Math.abs(delta.z)),scale=Math.tan(camera.fov*Math.PI/360)/camera.zoom;
 point.x=delta.x/(depth*scale*camera.aspect);point.y=delta.y/(depth*scale);
 if(!front&&Math.abs(point.x)<.01)point.x=.7;
 const outside=!front||Math.abs(point.x)>.7||Math.abs(point.y)>.45;
 if(outside){const factor=Math.max(Math.abs(point.x)/.7,Math.abs(point.y)/.45,1);point.x/=factor;point.y/=factor;}
 if(Number.isFinite(point.x)&&Number.isFinite(point.y))markers.push({seat:-1,x:(point.x+1)*50,y:(1-point.y)*50,kind:'cracker',edge:outside,label:`CRACKER · ${Math.ceil(distance)} M`});
 return markers;
}
