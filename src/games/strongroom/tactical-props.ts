import * as THREE from 'three';
// @ts-expect-error -- licensed Tiny Strike geometry accumulator and transform helper.
import {Accum,trs} from './engine/gfx/kit/util.js';
// @ts-expect-error -- licensed Tiny Strike prop library.
import {buildProp} from './engine/gfx/kit/props.js';
// @ts-expect-error -- licensed deterministic prop RNG.
import {Rng} from './engine/gfx/kit/rng.js';
import type {Tier} from './quality';
import type {Entity,Simulation} from './sim';

interface MaterialSource{get(name:string,options?:Record<string,unknown>):THREE.Material}
type Surface='concrete'|'wood'|'metal'|'glass';
type DeviceMesh='casing'|'hardware'|'led';
type Part=readonly [number,number,number,number,number,number,number?];
const LABELS=[
 ['CUSTOMS HOUSE','MARITIME CONTROL · QUAY ENTRANCE','CH'],['A RECORDS VAULT','ARCHIVES / CONTROLLED ACCESS','A'],
 ['B CASH CAGE','VALUABLES / CONTROLLED ACCESS','B'],['LOBBY','VISITORS REPORT TO RECEPTION','01'],
 ['LOADING BAY','DISPATCH / YARD ACCESS','04'],['STAFF OFFICE','CUSTOMS ADMINISTRATION','02'],
 ['SERVER ROOM','AUTHORISED PERSONNEL ONLY','03'],['AUTHORISED ENTRY','KEEP ACCESS CLEAR','!'],
 ['EXIT','FOLLOW THE MARKED ROUTE','→'],['QUAY ACCESS','INSPECTION / GOODS RECEIVING','Q'],
 ['SECURITY CHECK','PLEASE PRESENT YOUR DOCUMENTS','S'],['RECORDS CONTROL','REGISTER / RETAIN / RELEASE','R'],
] as const;
// Local rig coordinates use a .4 × .4 footprint and .5 height, with its base at y=0.
const RIG_CASE:readonly Part[]=[
 [0,.095,0,.36,.15,.34],[0,.29,.085,.25,.25,.19],[0,.48,.1,.28,.04,.16],
 [-.177,.095,0,.046,.13,.34],[.177,.095,0,.046,.13,.34],[0,.25,.18,.18,.12,.024],
];
const RIG_METAL:readonly Part[]=[
 [0,.018,0,.4,.036,.4],[-.145,.25,-.095,.035,.43,.035],[.145,.25,-.095,.035,.43,.035],
 [0,.435,-.095,.32,.035,.045],[0,.28,-.095,.035,.28,.035],[0,.105,-.095,.07,.07,.07],
 [-.1,.095,-.185,.035,.11,.025],[.1,.095,-.185,.035,.11,.025],
 [0,.48,-.03,.22,.025,.035],[-.11,.445,-.03,.025,.09,.035],[.11,.445,-.03,.025,.09,.035],
 [0,.24,.185,.17,.025,.012],
];
const RIG_LED:readonly Part[]=[[0,.285,.196,.095,.025,.008],[.09,.35,.185,.016,.016,.012]];
const CHARGE_CASE:readonly Part[]=[[0,0,0,.2,.26,.045],[-.075,0,.028,.028,.27,.015],[.075,0,.028,.028,.27,.015]];
const CHARGE_METAL:readonly Part[]=[[0,-.107,.027,.18,.018,.014],[0,.107,.027,.18,.018,.014],[0,-.02,.032,.095,.055,.018],[.045,.04,.029,.012,.1,.012]];
const CHARGE_LED:readonly Part[]=[[0,.074,.033,.034,.015,.01]];
const IMPACT_CASE:readonly Part[]=[[0,0,0,.075,.105,.075],[0,-.043,0,.085,.023,.085]];
const IMPACT_METAL:readonly Part[]=[[0,.059,0,.046,.018,.046],[.038,.025,0,.012,.085,.025]];

function makeAtlas(tier:Tier):THREE.Texture{
 const scale=tier==='high'?2:1,width=512*scale,height=512*scale;
 const canvas=typeof document==='undefined'?null:document.createElement('canvas');
 if(!canvas){const texture=new THREE.DataTexture(new Uint8Array([238,235,216,255]),1,1);texture.needsUpdate=true;return texture;}
 canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
 if(ctx){
  ctx.scale(scale,scale);ctx.fillStyle='#21343d';ctx.fillRect(0,0,512,512);
  for(let i=0;i<LABELS.length;i++){
   const x=(i%2)*256,y=Math.floor(i/2)*64,label=LABELS[i],accent=i===1?'#e5a768':i===2?'#d8c16c':i===8?'#86c4a3':'#b7c9c9';
   ctx.fillStyle=i===8?'#234d42':'#253b43';ctx.fillRect(x+1,y+1,254,62);ctx.fillStyle=accent;ctx.fillRect(x+1,y+1,5,62);
   ctx.strokeStyle=accent;ctx.lineWidth=1;ctx.strokeRect(x+12,y+13,28,34);ctx.fillStyle=accent;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 16px sans-serif';ctx.fillText(label[2],x+26,y+30,26);
   ctx.textAlign='left';ctx.textBaseline='alphabetic';let size=23;ctx.font=`bold ${size}px sans-serif`;while(size>14&&ctx.measureText(label[0]).width>199){size--;ctx.font=`bold ${size}px sans-serif`;}
   ctx.fillStyle='#f1efdf';ctx.fillText(label[0],x+48,y+29,199);ctx.fillStyle=accent;ctx.font='8px sans-serif';ctx.fillText(label[1],x+49,y+45,199);
   ctx.fillStyle='#71888c';ctx.fillRect(x+49,y+52,185,1);
  }
 }
 const texture=new THREE.CanvasTexture(canvas);texture.name='sr-customs-original-wayfinding';texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;return texture;
}

/** Cosmetic additions only: no colliders, lights, navigation edits, or source texture ownership. */
export class TacticalProps{
 readonly group=new THREE.Group();
 readonly staticMeshes:THREE.Mesh[]=[];
 readonly deviceMeshes:Record<DeviceMesh,THREE.InstancedMesh>;
 readonly labelAtlas:THREE.Texture;
 readonly crackerPosition=new THREE.Vector3();
 readonly metrics={staticDrawCalls:0,deviceDrawCalls:0,crackerVisible:false,charges:0,projectiles:0};
 private enabled:boolean;
 private ownedMaterials=new Set<THREE.Material>();
 private disposed=false;
 private meshes:THREE.InstancedMesh[];
 private ranges:{matrix:{start:number;count:number};color:{start:number;count:number}}[]=[];
 private counts=new Uint16Array(3);
 private oldCounts=new Uint16Array(3);
 private actorBySeat:(Entity|undefined)[]=Array(10);
 private chargePanel=new Int16Array(10).fill(-1);
 private chargeCell=new Int16Array(10).fill(-1);
 private chargeSide=new Int8Array(10);
 private chargeRound=new Int32Array(10).fill(-1);
 private projectileIds=new Int32Array(20);
 private rootMatrix=new THREE.Matrix4();
 private localMatrix=new THREE.Matrix4();
 private matrix=new THREE.Matrix4();
 private color=new THREE.Color();
 private eye=new THREE.Vector3();
 private target=new THREE.Vector3();

 constructor(private scene:THREE.Scene,materials:MaterialSource,readonly tier:Tier,mapDefinition:any){
  this.enabled=mapDefinition?.id==='customs-house';this.group.name='sr-tactical-props';this.group.visible=this.enabled;this.scene.add(this.group);
  this.labelAtlas=makeAtlas(tier);
  const casing=this.material(materials,'metal_painted',0x3d4848,true),hardware=this.material(materials,'metal_brushed',0x9caaa7,true),led=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});this.ownedMaterials.add(led);
  const names:DeviceMesh[]=['casing','hardware','led'],caps=[128,192,32],mats=[casing,hardware,led];this.deviceMeshes={} as Record<DeviceMesh,THREE.InstancedMesh>;
  this.meshes=names.map((name,index)=>{
   const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mats[index],caps[index]);mesh.name=`sr-tactical-${name}`;mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;
   mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(caps[index]*3).fill(1),3).setUsage(THREE.DynamicDrawUsage);
   mesh.instanceMatrix.addUpdateRange(0,0);mesh.instanceColor.addUpdateRange(0,0);this.ranges.push({matrix:mesh.instanceMatrix.updateRanges[0],color:mesh.instanceColor.updateRanges[0]});
   this.deviceMeshes[name]=mesh;this.group.add(mesh);return mesh;
  });
  if(this.enabled)this.buildStatic(materials,mapDefinition);
 }
 private material(source:MaterialSource,name:string,tint:number,instances=false,glass=false){
  const original=source.get(name,{tint,scale:2,vertexMasks:!instances,three:{side:THREE.FrontSide,transparent:false,opacity:1,depthWrite:true,transmission:0}}),material=original.clone();
  delete material.userData.owShared;material.transparent=false;material.opacity=1;material.depthWrite=true;material.side=THREE.FrontSide;
  if(material instanceof THREE.MeshPhysicalMaterial)material.transmission=0;
  const compile=original.onBeforeCompile,key=original.customProgramCacheKey.call(original);
  material.onBeforeCompile=(shader,renderer)=>{
   compile.call(original,shader,renderer);
   if(instances)shader.fragmentShader=shader.fragmentShader.replace('// vertex colours are masks here, see OW_VCOL_MASKS','#include <color_fragment>');
  };
  material.customProgramCacheKey=()=>`${key}:tactical:${instances?'instances':'static'}`;
  if(glass&&(material instanceof THREE.MeshLambertMaterial||material instanceof THREE.MeshStandardMaterial)){material.emissive.set(0x243d43);material.emissiveIntensity=.22;}
  this.ownedMaterials.add(material);return material;
 }
 private buildStatic(source:MaterialSource,map:any){
  const accum:Record<Surface,any>={concrete:new Accum('customs-trim'),wood:new Accum('customs-timber-details'),metal:new Accum('customs-metal-details'),glass:new Accum('customs-glass-details')};
  const unit=new THREE.BoxGeometry(1,1,1),matrix=new THREE.Matrix4();
  const box=(surface:Surface,x:number,y:number,z:number,w:number,h:number,d:number,angle=0)=>accum[surface].add(unit,trs(matrix,x,y,z,angle,w,h,d));
  // Door and window jambs stay outside the authored clear aperture; open windows receive no new pane.
  for(const o of map.openings??[]){
   const along=o.axis==='x',cx=o.x+(along?o.width/2:0),cz=o.z+(along?0:o.width/2),h=o.height;
   for(const sign of [-1,1])box('metal',cx+(along?sign*(o.width/2+.03):0),o.y+h/2,cz+(along?0:sign*(o.width/2+.03)),along?.055:.34,h,along?.34:.055);
   box('metal',cx,o.y+h+.027,cz,along?o.width+.11:.34,.055,along?.34:o.width+.11);
   if(o.kind==='window')box('concrete',cx,o.y-.035,cz,along?o.width+.14:.4,.07,along?.4:o.width+.14);
  }
  // Trim on hard wall spans only, so breaches never leave a decorative strip across their doorway.
  for(const b of map.solids??[]){
   const w=b[1]-b[0],h=b[3]-b[2],d=b[5]-b[4];if(b[2]!==0||h<2.5||Math.min(w,d)>.31||Math.max(Math.abs(b[0]),Math.abs(b[1]))>14.3||Math.max(Math.abs(b[4]),Math.abs(b[5]))>11.3)continue;
   const along=w>d,cx=(b[0]+b[1])/2,cz=(b[4]+b[5])/2;
   box('concrete',cx,2.86,cz,along?w:.34,.12,along?.34:d);
   for(const sign of [-1,1])box('metal',cx+(along?0:sign*.16),.08,cz+(along?sign*.16:0),along?w:.024,.15,along?.024:d);
  }
  const rooms=[[-9,-6.5,9,8],[1,-6.5,9,8],[10,-6.5,7,8],[0,-.5,24,2.4],[-10,6,6,9],[-1,6,9,9],[9,6,9,9]];
  for(const [x,z,w,d] of rooms){
   box('concrete',x,2.94,z,w,.035,.06);box('concrete',x,2.94,z,.06,.035,d);
   box('metal',x,2.89,z,1.26,.09,.3);box('glass',x,2.837,z-.07,1.13,.018,.105);box('glass',x,2.837,z+.07,1.13,.018,.105);
  }
  // Details are seated on existing solid furniture, rather than introducing new obstacles.
  for(const entry of map.cover??[]){
   const b=entry.box,cx=(b[0]+b[1])/2,cz=(b[4]+b[5])/2,w=b[1]-b[0],d=b[5]-b[4],h=b[3],front=b[5]+.014;
   if(entry.id.startsWith('filing')){
    for(let row=0;row<5;row++)for(let col=0;col<2;col++){const x=b[0]+w*(col+.5)/2,y=.22+row*.37;box('metal',x,y,front,w*.46,.33,.025);box('wood',x,y+.045,front+.022,.19,.024,.028);box('glass',x,y-.07,front+.018,.2,.045,.009);}
   }else if(entry.id.startsWith('rack')){
    const rows=this.tier==='potato'?5:8;for(let row=0;row<rows;row++){const y=.22+row*(1.55/rows);box('metal',cx,y,front,w*.85,.14,.025);box('glass',cx-w*.24,y,front+.019,.045,.035,.008);}
    for(const sign of [-1,1])box('metal',cx+sign*w*.43,h*.5,front,.035,h*.95,.055);
   }else if(entry.id.startsWith('bench')){
    for(let slat=0;slat<3;slat++)box('wood',cx,h+.008,b[4]+d*(slat+.5)/3,w,.022,d/3-.012);
   }else if(entry.id.startsWith('trolley')){
    for(const sign of [-1,1]){box('metal',cx+sign*w*.42,h*.5,cz,.03,h,.03);box('metal',cx,.12,cz+sign*d*.43,w,.03,.03);}
    box('wood',cx,h-.06,cz,w*.85,.018,d*.85);
   }else{
    box('wood',cx,h+.006,cz,w+.012,.025,d+.012);
    if(entry.id.includes('desk')||entry.id==='reception'||entry.id==='counter'){
     box('metal',cx,h+.08,cz,.045,.14,.045);box('metal',cx,h+.24,cz,.34,.25,.045);box('glass',cx,h+.24,cz+.027,.305,.21,.009);
     box('metal',cx,h+.025,cz+.19,.29,.018,.11);
    }
   }
  }
  const conduit=buildProp('conduit_box',new Rng('customs-services'));
  if(conduit){for(const [x,z,angle] of [[-13.83,-9,Math.PI/2],[13.83,9,-Math.PI/2],[5.82,-9,-Math.PI/2]])accum.metal.add(conduit.geo,trs(matrix,x,2.25,z,angle));conduit.geo.dispose();}
  const surfaces:Surface[]=['concrete','wood','metal','glass'],names=['plaster','wood','metal_painted','glass'],tints=[0xc7c5b6,0x8d6a42,0x56646b,0x88aab0];
  for(let i=0;i<surfaces.length;i++){
   const mesh=new THREE.Mesh(accum[surfaces[i]].build(),this.material(source,names[i],tints[i],false,i===3));mesh.name=`sr-customs-${surfaces[i]}`;mesh.castShadow=false;mesh.receiveShadow=false;this.group.add(mesh);this.staticMeshes.push(mesh);
  }
  unit.dispose();
  const signs=new Accum('customs-wayfinding');
  const sign=(label:number,x:number,y:number,z:number,w:number,h:number,angle=0)=>{
   const plane=new THREE.PlaneGeometry(w,h),uv=plane.getAttribute('uv'),col=label%2,row=Math.floor(label/2);
   for(let i=0;i<uv.count;i++)uv.setXY(i,(col+.012+uv.getX(i)*.976)/2,1-(row+.988-uv.getY(i)*.976)/8);
   signs.add(plane,trs(matrix,x,y,z,angle));plane.dispose();
  };
  sign(0,1,2.68,-11.175,3.5,.52,Math.PI);sign(9,1,2.67,-10.82,2.3,.4);
  sign(1,-7.8,2.52,-2.17,2.4,.43,Math.PI);sign(1,-4.17,2.5,-5.5,2.2,.4,-Math.PI/2);
  sign(2,-3.2,2.52,1.17,2.2,.4);sign(2,4.17,2.5,8.5,2.2,.4,Math.PI/2);
  sign(3,1,2.5,-2.17,1.8,.36,Math.PI);sign(4,9,2.6,11.17,2.6,.46);sign(4,9,2.62,10.82,2.4,.42,Math.PI);
  sign(5,6.17,2.52,-6.5,2,.38,Math.PI/2);sign(6,-6.17,2.52,6.5,2,.38,-Math.PI/2);
  sign(7,13.82,2.43,6.4,1.5,.32,-Math.PI/2);sign(8,-14.18,2.53,-.5,1.2,.32,-Math.PI/2);sign(10,-1.1,1.48,-6.08,1.1,.26);sign(11,-9,2.62,-10.82,2.3,.4);
  const labels=new THREE.MeshLambertMaterial({map:this.labelAtlas,color:0xffffff,side:THREE.FrontSide});this.ownedMaterials.add(labels);
  const mesh=new THREE.Mesh(signs.build(),labels);mesh.name='sr-customs-wayfinding';mesh.castShadow=false;mesh.receiveShadow=false;this.group.add(mesh);this.staticMeshes.push(mesh);this.metrics.staticDrawCalls=this.staticMeshes.length;
 }
 /** time is elapsed render time in seconds. All dynamic buffers and scratch objects are reused. */
 update(state:Simulation,localSeat:number,time:number,reduced:boolean):void{
  if(this.disposed)return;this.counts.fill(0);this.metrics.crackerVisible=false;this.metrics.charges=0;this.metrics.projectiles=0;
  if(!this.enabled||state.phase==='menu'||state.phase==='pick'){this.finish();return;}
  this.actorBySeat.fill(undefined);let local:Entity|undefined,carrier:Entity|undefined;
  for(let i=0;i<state.entities.length;i++){const actor=state.entities[i];if(actor.seat>=0&&actor.seat<10)this.actorBySeat[actor.seat]=actor;if(actor.seat===localSeat)local=actor;if(actor.seat===state.objective.carrier)carrier=actor;}
  const o=state.objective;let rig=!!local&&(o.state!=='carried'||!!carrier&&carrier.hp>0),angle=0;
  if(rig){
   if(o.state==='carried'){
    angle=carrier!.yaw;this.crackerPosition.set(carrier!.x+Math.sin(angle)*.28,carrier!.y+(carrier!.crouch?.4:.76)+.25,carrier!.z+Math.cos(angle)*.28);
   }else this.crackerPosition.set(o.position.x,Math.max(.25,o.position.y+(o.state==='dropped'?.25:0)),o.position.z);
   if(!local!.attacking){this.eye.set(local!.x,local!.y+(local!.crouch?1.08:1.62),local!.z);rig=!state.world.blocked(this.eye,this.crackerPosition);}
  }
  if(rig){
   this.metrics.crackerVisible=true;trs(this.rootMatrix,this.crackerPosition.x,this.crackerPosition.y-.25,this.crackerPosition.z,angle);
   this.parts(0,RIG_CASE,1,1,1);this.parts(1,RIG_METAL,1,1,1);
   const frequency=state.timer<3?4:state.timer<10?2:1,on=o.state!=='planted'||reduced||Math.floor(Math.max(0,time)*frequency*2)%2===0;
   this.parts(2,RIG_LED,on?1:.025,o.state==='planted'?(on?.18:.008):on?.65:.015,on?.12:.004);
  }
  const tools=state.tools;let seen=0;
  if(Array.isArray(tools)&&tools[0]===1&&tools[1]===state.round&&Array.isArray(tools[6]))for(let n=0;n<tools[6].length&&n<10;n++){
   const row:unknown=tools[6][n];if(!Array.isArray(row)||row.length!==4)continue;
   const owner=row[0],id=row[1],col=row[2],cell=row[3];if(!Number.isInteger(owner)||owner<0||owner>=10||seen&(1<<owner)||!Number.isInteger(id)||!Number.isInteger(col)||!Number.isInteger(cell))continue;
   const panel=state.walls.getPanel(id);if(!panel||cell<panel.firstCell||cell>=panel.firstCell+panel.cellCount||col!==((cell-panel.firstCell)%panel.cols)||state.walls.states[cell]===3)continue;
   const actor=this.actorBySeat[owner],normal=panel.axis==='x'?'z':'x';
   if(this.chargeRound[owner]!==state.round||this.chargePanel[owner]!==id||this.chargeCell[owner]!==cell){this.chargeRound[owner]=state.round;this.chargePanel[owner]=id;this.chargeCell[owner]=cell;this.chargeSide[owner]=actor&&actor[normal]<panel[normal]?-1:1;}
   seen|=1<<owner;const side=this.chargeSide[owner],r=Math.floor((cell-panel.firstCell)/panel.cols),x=panel.x+(panel.axis==='x'?(col+.5)*.5:side*(panel.thickness/2+.035)),z=panel.z+(panel.axis==='z'?(col+.5)*.5:side*(panel.thickness/2+.035));
   trs(this.rootMatrix,x,panel.y+(r+.5)*.5,z,panel.axis==='x'?(side>0?0:Math.PI):side*Math.PI/2);
   this.parts(0,CHARGE_CASE,1,1,1);this.parts(1,CHARGE_METAL,1,1,1);this.parts(2,CHARGE_LED,1,.45,.06);this.metrics.charges++;
  }
  for(let owner=0;owner<10;owner++)if(!(seen&(1<<owner))){this.chargePanel[owner]=-1;this.chargeCell[owner]=-1;}
  const projectiles=Array.isArray(tools)&&tools[0]===1&&tools[1]===state.round&&Array.isArray(tools[8])?tools[8]:null;
  if(projectiles)for(let n=0;n<projectiles.length&&n<20;n++){
   const row:unknown=projectiles[n];if(!Array.isArray(row)||row.length!==5)continue;
   const id=row[0],owner=row[1],x=row[2],y=row[3],z=row[4];
   if(!Number.isInteger(id)||id<1||id>0x7fffffff||!Number.isInteger(owner)||owner<0||owner>=10||!Number.isInteger(x)||!Number.isInteger(y)||!Number.isInteger(z)||Math.abs(x)>32767||Math.abs(y)>32767||Math.abs(z)>32767)continue;
   let duplicate=false;for(let i=0;i<this.metrics.projectiles;i++)if(this.projectileIds[i]===id){duplicate=true;break;}if(duplicate)continue;
   this.projectileIds[this.metrics.projectiles++]=id;trs(this.rootMatrix,x/100,y/100,z/100,reduced?0:time*5+id*.6);
   this.parts(0,IMPACT_CASE,.65,1,.55);this.parts(1,IMPACT_METAL,1,1,1);
  }
  this.finish();
 }
 private parts(batch:number,parts:readonly Part[],r:number,g:number,b:number){
  const mesh=this.meshes[batch];this.color.setRGB(r,g,b);
  for(let i=0;i<parts.length;i++){
   const p=parts[i],slot=this.counts[batch]++;trs(this.localMatrix,p[0],p[1],p[2],p[6]??0,p[3],p[4],p[5]);this.matrix.multiplyMatrices(this.rootMatrix,this.localMatrix);mesh.setMatrixAt(slot,this.matrix);mesh.setColorAt(slot,this.color);
  }
 }
 private finish(){
  let draws=0;
  for(let i=0;i<this.meshes.length;i++){
   const mesh=this.meshes[i],count=this.counts[i],range=Math.max(count,this.oldCounts[i]);mesh.count=count;
   if(range){this.upload(mesh.instanceMatrix,this.ranges[i].matrix,range*16);this.upload(mesh.instanceColor!,this.ranges[i].color,range*3);}this.oldCounts[i]=count;if(count)draws++;
  }
  this.metrics.deviceDrawCalls=this.enabled?draws:0;
 }
 private upload(attribute:THREE.BufferAttribute,range:{start:number;count:number},count:number){
  if(attribute.updateRanges.length===0){range.count=count;attribute.updateRanges.push(range);}else range.count=Math.max(range.count,count);
  attribute.needsUpdate=true;
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;this.scene.remove(this.group);
  for(const mesh of this.staticMeshes)mesh.geometry.dispose();for(const mesh of this.meshes){mesh.dispose();mesh.geometry.dispose();}
  for(const material of this.ownedMaterials)material.dispose();this.labelAtlas.dispose();this.ownedMaterials.clear();this.group.clear();this.metrics.deviceDrawCalls=0;this.metrics.staticDrawCalls=0;this.metrics.charges=0;this.metrics.projectiles=0;this.metrics.crackerVisible=false;
 }
}
