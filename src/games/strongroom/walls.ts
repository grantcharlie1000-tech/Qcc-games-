/** Deterministic host wall state. This module deliberately has no renderer or transport dependencies. */
export const CELL_SIZE=.5;
export const MAX_PANELS=96;
export const MAX_CELLS=2048;
export const PANEL_FLAG={REINFORCED:1,BARRICADE:2,ATTACHED:4} as const;
export type CellState=0|1|2|3;
export type WallMaterial='drywall'|'wood';
export type CellDamageSource='rifle'|'smg'|'pistol'|'shotgun'|'melee'|'frag';
export interface WallPoint{x:number;y:number;z:number}
export interface WallBox{min:WallPoint;max:WallPoint}
export interface CellRectangle{col:number;row:number;cols:number;rows:number}
export interface PanelDefinition{
 id:number;axis:'x'|'z';x:number;y:number;z:number;cols:number;rows:number;material:WallMaterial;
 thickness?:number;opening?:'door'|'window';startBarricaded?:boolean;wall?:string;
}
export interface WallPanel extends PanelDefinition{
 index:number;firstCell:number;cellCount:number;thickness:number;flags:number;owner:number|null;
 boxes:WallBox[];rectangles:CellRectangle[];
}
export interface WallHit{
 distance:number;point:WallPoint;normal:WallPoint;panelId:number;panelIndex:number;cell:number;state:CellState;penetration:number;
}
export interface WallChanges{revision:number;cells:number[];panels:number[];reset:boolean}
export type WallDiff=['wd',number,...number[]];
export type WallPanelEvent=['wp',number,number,number];
/** The sequence baseline is included so a reconnect snapshot can recover from a gap. */
export type WallFull=['wf',number,string,string,number];
export type WallPacket=WallDiff|WallPanelEvent|WallFull;
export interface WallApplyResult{ok:boolean;resync:boolean;reason?:'invalid'|'stale'|'round'|'gap'}
const MAX_ROUND=0x7fffffff;
const MAX_SEQUENCE=0x7fffffff;
const validInt=(n:unknown,min:number,max:number):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max;
const finitePoint=(p:WallPoint)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
const maxHP=(panel:WallPanel)=>panel.material==='wood'?40:120;
const stateFor=(hp:number,max:number):CellState=>hp<=0?3:hp>max*.66?0:hp>max*.33?1:2;
const BASE64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function encodeBytes(bytes:Uint8Array):string{
 let result='';
 for(let i=0;i<bytes.length;i+=3){
  const value=(bytes[i]<<16)|((bytes[i+1]??0)<<8)|(bytes[i+2]??0);
  result+=BASE64[value>>>18]+BASE64[(value>>>12)&63]+(i+1<bytes.length?BASE64[(value>>>6)&63]:'=')+(i+2<bytes.length?BASE64[value&63]:'=');
 }
 return result;
}
function decodeBytes(value:unknown,length:number):Uint8Array|null{
 if(typeof value!=='string'||value.length!==Math.ceil(length/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))return null;
 const bytes=new Uint8Array(length);let offset=0;
 for(let i=0;i<value.length;i+=4){
  const a=BASE64.indexOf(value[i]),b=BASE64.indexOf(value[i+1]),c=BASE64.indexOf(value[i+2]),d=BASE64.indexOf(value[i+3]);
  const packed=(a<<18)|(b<<12)|(Math.max(0,c)<<6)|Math.max(0,d);
  if(offset<length)bytes[offset++]=packed>>>16;
  if(offset<length)bytes[offset++]=packed>>>8;
  if(offset<length)bytes[offset++]=packed;
 }
 return encodeBytes(bytes)===value?bytes:null;
}

export class WallStore{
 readonly panels:WallPanel[];
 readonly states:Uint8Array;
 readonly hp:Float32Array;
 readonly cellCount:number;
 roundId:number;
 seq=0;
 revision=0;
 needsResync=false;
 private byId=new Map<number,WallPanel>();
 private cellPanels:Uint8Array;
 private cellRevision:Float64Array;
 private panelRevision:Float64Array;
 private resetRevision=0;
 private dirtyCells=new Set<number>();
 private dirtyPanels=new Set<number>();

 constructor(definitions:readonly PanelDefinition[],roundId=0){
  if(!Array.isArray(definitions)||definitions.length>MAX_PANELS||!validInt(roundId,0,MAX_ROUND))throw new RangeError('Invalid wall map or round');
  const ids=new Set<number>();let cells=0;
  for(const d of definitions){
   if(!d||!validInt(d.id,0,MAX_PANELS-1)||ids.has(d.id)||!['x','z'].includes(d.axis)||
    ![d.x,d.y,d.z].every(n=>Number.isFinite(n)&&Math.abs(n)<=10000)||!validInt(d.cols,1,4)||!validInt(d.rows,1,6)||
    !['drywall','wood'].includes(d.material)||(d.thickness!==undefined&&(!Number.isFinite(d.thickness)||d.thickness<=0||d.thickness>1))||
    (d.opening!==undefined&&!['door','window'].includes(d.opening))||(d.startBarricaded!==undefined&&typeof d.startBarricaded!=='boolean')||
    (d.startBarricaded&&d.material!=='wood'))throw new RangeError('Invalid wall panel');
   ids.add(d.id);cells+=d.cols*d.rows;
  }
  if(cells>MAX_CELLS)throw new RangeError('Wall cell budget exceeded');
  this.cellCount=cells;this.roundId=roundId;this.states=new Uint8Array(cells);this.hp=new Float32Array(cells);
  this.cellPanels=new Uint8Array(cells);this.cellRevision=new Float64Array(cells);this.panelRevision=new Float64Array(definitions.length);
  let firstCell=0;
  this.panels=definitions.map((d,index)=>{
   const panel:WallPanel={...d,index,firstCell,cellCount:d.cols*d.rows,thickness:d.thickness??(d.material==='wood'?.08:.2),flags:d.startBarricaded?PANEL_FLAG.BARRICADE:0,owner:null,boxes:[],rectangles:[]};
   this.byId.set(d.id,panel);
   const present=d.material==='drywall'||d.startBarricaded;
   for(let i=firstCell;i<firstCell+panel.cellCount;i++){this.cellPanels[i]=index;this.states[i]=present?0:3;this.hp[i]=present?maxHP(panel):0;}
   firstCell+=panel.cellCount;this.rebuild(panel);return panel;
  });
 }

 getPanel(id:number){return this.byId.get(id);}
 cellIndex(panelId:number,col:number,row:number){
  const panel=this.byId.get(panelId);
  if(!panel||!validInt(col,0,panel.cols-1)||!validInt(row,0,panel.rows-1))return -1;
  return panel.firstCell+row*panel.cols+col;
 }
 cellCenter(index:number):WallPoint{
  if(!validInt(index,0,this.cellCount-1))throw new RangeError('Invalid wall cell');
  const panel=this.panels[this.cellPanels[index]],local=index-panel.firstCell,col=local%panel.cols,row=Math.floor(local/panel.cols);
  return{x:panel.x+(panel.axis==='x'?(col+.5)*CELL_SIZE:0),y:panel.y+(row+.5)*CELL_SIZE,z:panel.z+(panel.axis==='z'?(col+.5)*CELL_SIZE:0)};
 }
 damageCell(index:number,source:CellDamageSource,damage=0):boolean{
  if(!validInt(index,0,this.cellCount-1)||!['rifle','smg','pistol','shotgun','melee','frag'].includes(source))return false;
  const panel=this.panels[this.cellPanels[index]];
  if(panel.flags&PANEL_FLAG.REINFORCED||this.states[index]===3)return false;
  let amount:number;
  if(source==='melee')amount=60;
  else{
   if(!Number.isFinite(damage)||damage<=0)return false;
   const multiplier=source==='frag'||source==='shotgun'||panel.material==='wood'?1:source==='rifle'?.5:source==='smg'?.4:source==='pistol'?.35:0;
   amount=damage*multiplier;
  }
  if(!(amount>0))return false;
  const changed:number[]=[];this.hurt(index,amount,changed);this.commit(changed,[]);return true;
 }
 /** Explosion falloff is evaluated at cell centres in metres. */
 explode(source:'frag'|'impact',center:WallPoint):number{
  if(!finitePoint(center)||(source!=='frag'&&source!=='impact'))return 0;
  const changed:number[]=[];let affected=0;
  for(const panel of this.panels){
   if(panel.flags&PANEL_FLAG.REINFORCED)continue;
   for(let i=panel.firstCell;i<panel.firstCell+panel.cellCount;i++){
    if(this.states[i]===3)continue;
    const point=this.cellCenter(i),distance=Math.hypot(point.x-center.x,point.y-center.y,point.z-center.z);
    const amount=source==='impact'?(distance<=.75?maxHP(panel):0):distance<=1.5?150:distance<2.5?150*(2.5-distance):0;
    if(amount>0){this.hurt(i,amount,changed);affected++;}
   }
  }
  this.commit(changed,[]);return affected;
 }
 /** Returns newly removed footprint cells; a charge also damages the one-cell surrounding ring. */
 breach(panelId:number,aimCol:number,source:'charge'|'cutter'):number{
  const panel=this.byId.get(panelId);
  if(!panel||!Number.isFinite(aimCol)||(source!=='charge'&&source!=='cutter'))return 0;
  const changed:number[]=[],events:number[]=[];
  const flags=panel.flags&~PANEL_FLAG.ATTACHED;
  if(flags!==panel.flags){panel.flags=flags;events.push(panel.index);}
  if(source==='charge'&&(panel.flags&PANEL_FLAG.REINFORCED)){this.commit(changed,events);return 0;}
  if(source==='cutter'&&(panel.flags&PANEL_FLAG.REINFORCED)){panel.flags&=~PANEL_FLAG.REINFORCED;events.push(panel.index);}
  const width=Math.min(3,panel.cols),height=Math.min(4,panel.rows),start=Math.max(0,Math.min(panel.cols-width,Math.floor(aimCol)-Math.floor(width/2)));
  let removed=0;
  for(let row=0;row<height;row++)for(let col=start;col<start+width;col++){
   const index=panel.firstCell+row*panel.cols+col;
   if(this.states[index]!==3){this.hurt(index,maxHP(panel),changed);removed++;}
  }
  if(source==='charge')for(let row=0;row<Math.min(panel.rows,height+1);row++)for(let col=Math.max(0,start-1);col<Math.min(panel.cols,start+width+1);col++){
   if(row<height&&col>=start&&col<start+width)continue;
   const index=panel.firstCell+row*panel.cols+col;if(this.states[index]!==3)this.hurt(index,60,changed);
  }
  this.commit(changed,events);return removed;
 }
 canReinforce(panelId:number):boolean{
  const panel=this.byId.get(panelId);if(!panel||panel.material!=='drywall'||panel.flags&PANEL_FLAG.REINFORCED)return false;
  let present=0;for(let i=panel.firstCell;i<panel.firstCell+panel.cellCount;i++)if(this.states[i]!==3)present++;
  return present*5>=panel.cellCount*4;
 }
 reinforce(panelId:number):boolean{
  if(!this.canReinforce(panelId))return false;const panel=this.byId.get(panelId)!;
  const changed:number[]=[];
  for(let i=panel.firstCell;i<panel.firstCell+panel.cellCount;i++){
   this.hp[i]=120;if(this.states[i]!==0){this.states[i]=0;changed.push(i);}
  }
  panel.flags|=PANEL_FLAG.REINFORCED;this.commit(changed,[panel.index]);return true;
 }
 placeBarricade(panelId:number,ownerSeat:number):boolean{
  const panel=this.byId.get(panelId);
  if(!panel||panel.material!=='wood'||panel.flags&PANEL_FLAG.BARRICADE||!validInt(ownerSeat,0,9))return false;
  for(let i=panel.firstCell;i<panel.firstCell+panel.cellCount;i++)if(this.states[i]!==3)return false;
  const changed:number[]=[];
  for(let i=panel.firstCell;i<panel.firstCell+panel.cellCount;i++){this.hp[i]=40;this.states[i]=0;changed.push(i);}
  panel.flags=PANEL_FLAG.BARRICADE;panel.owner=ownerSeat;this.commit(changed,[panel.index]);return true;
 }
 reclaimBarricade(panelId:number,ownerSeat:number):boolean{
  const panel=this.byId.get(panelId);
  if(!panel||panel.material!=='wood'||!(panel.flags&PANEL_FLAG.BARRICADE)||!validInt(ownerSeat,0,9)||panel.owner!==ownerSeat)return false;
  for(let i=panel.firstCell;i<panel.firstCell+panel.cellCount;i++)if(this.hp[i]!==40)return false;
  const changed:number[]=[];
  for(let i=panel.firstCell;i<panel.firstCell+panel.cellCount;i++){this.hp[i]=0;this.states[i]=3;changed.push(i);}
  panel.flags=0;panel.owner=null;this.commit(changed,[panel.index]);return true;
 }
 setAttached(panelId:number,attached:boolean):boolean{
  const panel=this.byId.get(panelId);
  if(!panel||typeof attached!=='boolean'||(attached&&panel.material==='wood'&&!(panel.flags&PANEL_FLAG.BARRICADE)))return false;
  const flags=attached?panel.flags|PANEL_FLAG.ATTACHED:panel.flags&~PANEL_FLAG.ATTACHED;
  if(flags===panel.flags)return false;panel.flags=flags;this.commit([],[panel.index]);return true;
 }
 hasDoorway(panelId:number):boolean{
  const panel=this.byId.get(panelId);if(!panel||panel.cols<2||panel.rows<4||panel.flags&PANEL_FLAG.REINFORCED)return false;
  for(let col=0;col<panel.cols-1;col++){
   let clear=true;
   for(let row=0;row<4;row++)if(this.states[panel.firstCell+row*panel.cols+col]!==3||this.states[panel.firstCell+row*panel.cols+col+1]!==3){clear=false;break;}
   if(clear)return true;
  }
  return false;
 }
 /** One drain per host tick; visual dirty tracking remains independent. */
 drainPackets():WallPacket[]{
  const packets:WallPacket[]=[];
  const count=(this.dirtyCells.size?1:0)+this.dirtyPanels.size;
  if(this.seq+count>MAX_SEQUENCE)throw new RangeError('Wall sequence exhausted');
  if(this.dirtyCells.size){
   const packet:WallDiff=['wd',++this.seq];
   for(const cell of [...this.dirtyCells].sort((a,b)=>a-b))packet.push(cell,this.states[cell]);
   packets.push(packet);this.dirtyCells.clear();
  }
  for(const index of [...this.dirtyPanels].sort((a,b)=>this.panels[a].id-this.panels[b].id)){
   const panel=this.panels[index];packets.push(['wp',++this.seq,panel.id,panel.flags]);
  }
  this.dirtyPanels.clear();return packets;
 }
 private packedStates(){
  const bytes=new Uint8Array(Math.ceil(this.cellCount/4));
  for(let i=0;i<this.cellCount;i++)bytes[i>>>2]|=this.states[i]<<((i&3)*2);
  return bytes;
 }
 snapshot():WallFull{return['wf',this.roundId,encodeBytes(this.packedStates()),encodeBytes(Uint8Array.from(this.panels,p=>p.flags)),this.seq];}
 /** FNV-1a over the compact two-bit cell field, as used by loopback and network equality checks. */
 hash():string{
  let hash=2166136261;for(const byte of this.packedStates())hash=Math.imul(hash^byte,16777619)>>>0;
  return hash.toString(16).padStart(8,'0');
 }
 reset(roundId:number):void{
  if(!validInt(roundId,this.roundId,MAX_ROUND))throw new RangeError('Invalid wall round');
  this.roundId=roundId;this.needsResync=false;this.dirtyCells.clear();this.dirtyPanels.clear();
  for(const panel of this.panels){
   panel.flags=panel.startBarricaded?PANEL_FLAG.BARRICADE:0;panel.owner=null;
   const present=panel.material==='drywall'||panel.startBarricaded;
   for(let i=panel.firstCell;i<panel.firstCell+panel.cellCount;i++){this.states[i]=present?0:3;this.hp[i]=present?maxHP(panel):0;}
  }
  this.commit(Array.from({length:this.cellCount},(_,i)=>i),this.panels.map(p=>p.index),false,true);
 }
 /** Validate an entire untrusted JSON packet before changing any wall state. */
 applyPacket(packet:unknown):WallApplyResult{
  const invalid:WallApplyResult={ok:false,resync:false,reason:'invalid'};
  if(!Array.isArray(packet))return invalid;
  if(packet[0]==='wf'){
   if(packet.length!==5||!validInt(packet[1],0,MAX_ROUND)||!validInt(packet[4],0,MAX_SEQUENCE))return invalid;
   if(packet[1]<this.roundId)return{ok:false,resync:false,reason:'round'};
   if(packet[4]<this.seq)return{ok:false,resync:false,reason:'stale'};
   const bytes=decodeBytes(packet[2],Math.ceil(this.cellCount/4)),flags=decodeBytes(packet[3],this.panels.length);
   if(!bytes||!flags)return invalid;
   if(this.cellCount%4&&bytes[bytes.length-1]>>((this.cellCount%4)*2))return invalid;
   const states=new Uint8Array(this.cellCount);
   for(let i=0;i<this.cellCount;i++)states[i]=(bytes[i>>>2]>>>((i&3)*2))&3;
   for(const panel of this.panels){
    const flag=flags[panel.index];if(!this.validFlags(panel,flag))return invalid;
    let allIntact=true,allGone=true;
    for(let i=panel.firstCell;i<panel.firstCell+panel.cellCount;i++){if(states[i]!==0)allIntact=false;if(states[i]!==3)allGone=false;}
    if((flag&PANEL_FLAG.REINFORCED)&&!allIntact)return invalid;
    if(panel.material==='wood'&&((flag&PANEL_FLAG.BARRICADE)?allGone:!allGone||!!(flag&PANEL_FLAG.ATTACHED)))return invalid;
   }
   this.states.set(states);
   for(const panel of this.panels){
    panel.flags=flags[panel.index];panel.owner=null;
    for(let i=panel.firstCell;i<panel.firstCell+panel.cellCount;i++)this.hp[i]=this.replicaHP(panel,this.states[i]);
   }
   this.roundId=packet[1];this.seq=packet[4];this.needsResync=false;this.dirtyCells.clear();this.dirtyPanels.clear();
   this.commit(Array.from({length:this.cellCount},(_,i)=>i),this.panels.map(p=>p.index),false,true);
   return{ok:true,resync:false};
  }
  if(packet[0]!=='wd'&&packet[0]!=='wp'||!validInt(packet[1],1,MAX_SEQUENCE))return invalid;
  const cells:number[]=[],panels:number[]=[];
  if(packet[0]==='wd'){
   if(packet.length<4||packet.length>2+this.cellCount*2||packet.length%2!==0)return invalid;
   const seen=new Set<number>();
   for(let i=2;i<packet.length;i+=2){
    if(!validInt(packet[i],0,this.cellCount-1)||!validInt(packet[i+1],0,3)||seen.has(packet[i]))return invalid;
    seen.add(packet[i]);cells.push(packet[i]);
   }
  }else{
   const panel=this.byId.get(packet[2]);
   if(packet.length!==4||!validInt(packet[2],0,MAX_PANELS-1)||!panel||!this.validFlags(panel,packet[3]))return invalid;
   panels.push(panel.index);
  }
  if(packet[1]<=this.seq)return{ok:false,resync:false,reason:'stale'};
  if(this.needsResync||packet[1]!==this.seq+1){this.needsResync=true;return{ok:false,resync:true,reason:'gap'};}
  if(packet[0]==='wd')for(let i=2;i<packet.length;i+=2){
   const index=packet[i],panel=this.panels[this.cellPanels[index]];this.states[index]=packet[i+1];this.hp[index]=this.replicaHP(panel,packet[i+1]);
  }
  else{const panel=this.panels[panels[0]];panel.flags=packet[3];if(!(panel.flags&PANEL_FLAG.BARRICADE))panel.owner=null;}
  this.seq=packet[1];this.commit(cells,panels,false);return{ok:true,resync:false};
 }
 private validFlags(panel:WallPanel,flags:unknown):flags is number{
  return validInt(flags,0,7)&&!(flags&(panel.material==='drywall'?PANEL_FLAG.BARRICADE:PANEL_FLAG.REINFORCED))&&!(panel.material==='wood'&&(flags&PANEL_FLAG.ATTACHED)&&!(flags&PANEL_FLAG.BARRICADE));
 }
 private replicaHP(panel:WallPanel,state:number){return maxHP(panel)*(state===0?1:state===1?.5:state===2?.2:0);}
 private hurt(index:number,amount:number,changed:number[]){
  const panel=this.panels[this.cellPanels[index]],hp=Math.max(0,this.hp[index]-amount);
  this.hp[index]=hp;const state=stateFor(hp,maxHP(panel));
  if(this.states[index]!==state){this.states[index]=state;changed.push(index);}
 }
 private commit(cells:number[],panels:number[],network=true,reset=false){
  if(!cells.length&&!panels.length&&!reset)return;
  this.revision++;if(reset)this.resetRevision=this.revision;
  const changedPanels=new Set(panels);
  for(const cell of cells){this.cellRevision[cell]=this.revision;changedPanels.add(this.cellPanels[cell]);if(network)this.dirtyCells.add(cell);}
  if(network)for(const index of changedPanels){
   const panel=this.panels[index];
   if(panel.material==='wood'&&panel.flags&PANEL_FLAG.BARRICADE){
    let present=false;for(let i=panel.firstCell;i<panel.firstCell+panel.cellCount;i++)if(this.states[i]!==3){present=true;break;}
    if(!present){panel.flags=0;panel.owner=null;panels.push(index);}
   }
  }
  for(const index of changedPanels){const panel=this.panels[index];this.panelRevision[index]=this.revision;this.rebuild(panel);}
  for(const index of panels)if(network)this.dirtyPanels.add(index);
 }
 changesSince(revision:number):WallChanges{
  const cells:number[]=[],panels:number[]=[];
  for(const panel of this.panels)if(this.panelRevision[panel.index]>revision){
   panels.push(panel.index);
   for(let i=panel.firstCell;i<panel.firstCell+panel.cellCount;i++)if(this.cellRevision[i]>revision)cells.push(i);
  }
  return{revision:this.revision,cells,panels,reset:this.resetRevision>revision};
 }
 /** Row-major greedy rectangles cover every non-gone cell exactly once. */
 private rebuild(panel:WallPanel){
  const used=new Uint8Array(panel.cellCount);panel.boxes.length=0;panel.rectangles.length=0;
  const occupied=(col:number,row:number)=>!used[row*panel.cols+col]&&this.states[panel.firstCell+row*panel.cols+col]!==3;
  for(let row=0;row<panel.rows;row++)for(let col=0;col<panel.cols;col++){
   if(!occupied(col,row))continue;
   let cols=1,rows=1;while(col+cols<panel.cols&&occupied(col+cols,row))cols++;
   outer:while(row+rows<panel.rows){for(let c=col;c<col+cols;c++)if(!occupied(c,row+rows))break outer;rows++;}
   for(let r=row;r<row+rows;r++)for(let c=col;c<col+cols;c++)used[r*panel.cols+c]=1;
   panel.rectangles.push({col,row,cols,rows});
   const along0=col*CELL_SIZE,along1=(col+cols)*CELL_SIZE,h=panel.thickness*.5;
   panel.boxes.push({min:{x:panel.x+(panel.axis==='x'?along0:-h),y:panel.y+row*CELL_SIZE,z:panel.z+(panel.axis==='z'?along0:-h)},max:{x:panel.x+(panel.axis==='x'?along1:h),y:panel.y+(row+rows)*CELL_SIZE,z:panel.z+(panel.axis==='z'?along1:h)}});
  }
 }
 raycast(origin:WallPoint,direction:WallPoint,maxDistance:number,mode:'shot'|'sight'='shot'):WallHit|null{
  if(!finitePoint(origin)||!finitePoint(direction)||!Number.isFinite(maxDistance)||maxDistance<=0)return null;
  const length=Math.hypot(direction.x,direction.y,direction.z);if(length<1e-9)return null;
  const dx=direction.x/length,dy=direction.y/length,dz=direction.z/length;let nearest:WallHit|null=null;
  for(const panel of this.panels){
   const dn=panel.axis==='x'?dz:dx;if(Math.abs(dn)<1e-9)continue;
   const distance=((panel.axis==='x'?panel.z-origin.z:panel.x-origin.x)/dn);
   if(distance<1e-6||distance>maxDistance||(nearest&&distance>=nearest.distance))continue;
   const x=origin.x+dx*distance,y=origin.y+dy*distance,z=origin.z+dz*distance;
   const col=Math.floor(((panel.axis==='x'?x-panel.x:z-panel.z))/CELL_SIZE),row=Math.floor((y-panel.y)/CELL_SIZE);
   const cell=this.cellIndex(panel.id,col,row);if(cell<0)continue;
   const state=this.states[cell] as CellState,reinforced=!!(panel.flags&PANEL_FLAG.REINFORCED);
   if(state===3||(!reinforced&&mode==='sight'&&state===2))continue;
   nearest={distance,point:{x,y,z},normal:{x:panel.axis==='z'?-Math.sign(dn):0,y:0,z:panel.axis==='x'?-Math.sign(dn):0},panelId:panel.id,panelIndex:panel.index,cell,state,penetration:reinforced?0:panel.material==='wood'||state===2?.8:.55};
  }
  return nearest;
 }
}
