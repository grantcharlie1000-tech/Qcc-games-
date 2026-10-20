import Matter from 'matter-js';
import type { Point } from './species/types';
const { Body, Vertices } = Matter;
/** Rigid compound animal from authored convex pieces, in sprite coordinates.
 * Matter sums each part's inertia about the part's own centre and omits the parallel-axis term,
 * which leaves tall, many-part animals far too easy to spin (friction flips them on landing).
 * The inertia is recomputed about the compound centre of mass before scaling to the species mass. */
export function compoundBody(label:string, shapes:Point[][], mass:number){
 const parts=shapes.map((points,index)=>{
  if(!Vertices.isConvex(points))throw new Error(`${label} part ${index} must be convex`);
  return Body.create({position:Vertices.centre(points),vertices:points.map(p=>({...p})),label:`${label}:${index}`});
 });
 const body=Body.create({parts,label,friction:.85,frictionStatic:1.5,frictionAir:.018,restitution:.025,sleepThreshold:90,slop:.025});
 let inertia=0;
 for(const part of parts){const dx=part.position.x-body.position.x,dy=part.position.y-body.position.y;inertia+=part.inertia+part.mass*(dx*dx+dy*dy);}
 Body.setInertia(body,inertia);
 const offset={x:-body.position.x,y:-body.position.y};
 Body.setMass(body,mass);
 return {body,offset};
}
