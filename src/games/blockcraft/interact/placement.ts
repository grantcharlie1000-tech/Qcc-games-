// Block placement (vanilla BlockItem.place): where the block goes (into a replaceable clicked block or against the
// clicked face), which state it takes (facing toward the player, slab halves, torch and ladder walls, door and bed
// halves, persistent leaves), the support rules of engine/support.ts and the "not inside an entity" rule.
import {AIR,COLLISION_BOXES,FACING_VECTOR,blockDef,facingFromYaw,familyStates,isLiquid,stateFor,type BlockDef,type BlockId,type Facing} from '../data/blocks';
import {CH} from '../engine/constants';
import {canSurvive} from '../engine/support';
import type {BlockSource,Entity,Game,Vec3} from '../engine/contracts';
import type {Hand,Hit,Result} from './use-hands';

export interface Cell{x:number;y:number;z:number;id:BlockId}
export type PlaceFailure='height'|'occupied'|'unsupported'|'invalid';
export interface Plan{cells:Cell[]}
type Dir=readonly [number,number,number];
const UP:Dir=[0,1,0],DOWN:Dir=[0,-1,0];
const opposite=(d:Dir):Dir=>[-d[0],-d[1],-d[2]];
/** Facing of a horizontal direction vector. */
export function facingOf(dx:number,dz:number):Facing|undefined{
  return dx>0?'east':dx<0?'west':dz>0?'south':dz<0?'north':undefined;
}

/** Vanilla Direction.orderedByNearest: the six directions ordered by how directly the player looks along them. */
export function lookOrder(look:Vec3,yaw:number):Dir[]{
  const ax=Math.abs(look.x),ay=Math.abs(look.y),az=Math.abs(look.z),hx=Math.abs(Math.sin(yaw)),hz=Math.abs(Math.cos(yaw));
  const dx:Dir=look.x>0?[1,0,0]:[-1,0,0],dy:Dir=look.y>0?UP:DOWN,dz:Dir=look.z>0?[0,0,1]:[0,0,-1];
  const arr=(a:Dir,b:Dir,c:Dir)=>[a,b,c,opposite(c),opposite(b),opposite(a)];
  if(hx>hz){if(ay>ax)return arr(dy,dx,dz);return az>ay?arr(dx,dz,dy):arr(dx,dy,dz);}
  if(ay>az)return arr(dy,dz,dx);
  return ax>ay?arr(dz,dx,dy):arr(dz,dy,dx);
}
/** BlockPlaceContext.getNearestLookingDirections: toward the clicked face first unless the clicked block is replaced. */
function lookingDirections(hit:Hit,look:Vec3,yaw:number,replaceClicked:boolean):Dir[]{
  const order=lookOrder(look,yaw);if(replaceClicked)return order;
  const into:Dir=[-hit.nx,-hit.ny,-hit.nz],i=order.findIndex(d=>d[0]===into[0]&&d[1]===into[1]&&d[2]===into[2]);
  if(i>0){order.splice(i,1);order.unshift(into);}
  return order;
}

const slabOf=(id:BlockId)=>id>0?blockDef(id).slab:undefined;
/** Can block `existing` be replaced by placing `family` into its cell? */
function replaceableBy(existing:BlockId,family:string):boolean{
  if(existing===AIR)return true;if(existing<0)return false;
  const d=blockDef(existing);
  if(d.slab&&d.slab!=='double'&&d.family===family)return true;// slab merge
  return d.replaceable&&d.family!==family;
}
/** SlabBlock.canBeReplaced when the clicked block itself is a slab of the same kind. */
function slabMergesOnClick(clicked:BlockDef,family:string,hit:Hit):boolean{
  if(!clicked.slab||clicked.slab==='double'||clicked.family!==family)return false;
  const upper=hit.py-hit.y>.5,horizontal=hit.ny===0;
  return clicked.slab==='bottom'?hit.ny===1||upper&&horizontal:hit.ny===-1||!upper&&horizontal;
}

/** Overlay so support checks see the planned cells. */
class Planned implements BlockSource{
  cells:Cell[]=[];
  constructor(private world:BlockSource){}
  get(x:number,y:number,z:number){for(const c of this.cells)if(c.x===x&&c.y===y&&c.z===z)return c.id;return this.world.get(x,y,z);}
}
const FRAGILE=new Set(['cross','crop','torch','flat','fire','snow_layer']);

/** Where and as what the item placing `family` goes for this click, or why it cannot. Pure: reads the world only. */
export function planPlacement(world:BlockSource,family:string,hit:Hit,yaw:number,look:Vec3):Plan|PlaceFailure{
  const states=familyStates(family);if(!states.length)return 'invalid';
  const clicked=blockDef(world.get(hit.x,hit.y,hit.z));
  const replaceClicked=slabMergesOnClick(clicked,family,hit)||clicked.replaceable&&clicked.family!==family&&!clicked.liquid;
  const x=replaceClicked?hit.x:hit.x+hit.nx,y=replaceClicked?hit.y:hit.y+hit.ny,z=replaceClicked?hit.z:hit.z+hit.nz;
  if(y<0||y>=CH)return 'height';
  const existing=world.get(x,y,z);
  if(!replaceableBy(existing,family))return 'occupied';
  const planned=new Planned(world),cells=planned.cells,first=states[0];
  const fits=(cx:number,cy:number,cz:number)=>cy>=0&&cy<CH&&replaceableBy(world.get(cx,cy,cz),family);
  const survives=()=>cells.every(c=>canSurvive(planned,c.id,c.x,c.y,c.z));
  const facing=facingFromYaw(yaw);
  const place=(id:BlockId,cx=x,cy=y,cz=z)=>{cells.push({x:cx,y:cy,z:cz,id});};
  const tryState=(d:BlockDef|undefined)=>{cells.length=0;if(!d)return false;place(d.id);return survives();};
  if(first.slab){
    const here=world.get(x,y,z),merge=slabOf(here)&&blockDef(here).family===family&&slabOf(here)!=='double';
    const half=merge?'double':hit.ny===-1?'top':hit.ny===1?'bottom':hit.py-y>.5?'top':'bottom';
    if(!tryState(stateFor(family,{slab:half})))return 'unsupported';
  }else if(family==='torch'){
    const order=lookingDirections(hit,look,yaw,replaceClicked);
    let wall:BlockDef|undefined;
    for(const d of order)if(d[1]===0){const s=stateFor('wall_torch',{facing:facingOf(-d[0],-d[2])});if(tryState(s)){wall=s;break;}}
    let chosen:BlockDef|undefined;
    for(const d of order){
      if(d[1]===1)continue;
      const s=d[1]===-1?first:wall;
      if(tryState(s)){chosen=s;break;}
    }
    if(!chosen)return 'unsupported';
    cells.length=0;place(chosen.id);
  }else if(family==='ladder'){
    let ok=false;
    if(!replaceClicked&&hit.ny===0)ok=tryState(stateFor('ladder',{facing:facingOf(hit.nx,hit.nz)}));
    if(!ok)for(const d of lookingDirections(hit,look,yaw,replaceClicked))if(d[1]===0&&tryState(stateFor('ladder',{facing:facingOf(-d[0],-d[2])}))){ok=true;break;}
    if(!ok)return 'unsupported';
  }else if(first.door){
    if(!fits(x,y+1,z))return 'occupied';
    place(stateFor(family,{half:'lower',open:false,facing})!.id);place(stateFor(family,{half:'upper',open:false,facing})!.id,x,y+1,z);
    if(!survives())return 'unsupported';
  }else if(first.bed){
    const [fx,fz]=FACING_VECTOR[facing],hx=x-fx,hz=z-fz;
    if(!fits(hx,y,hz))return 'occupied';
    place(stateFor(family,{part:'foot',facing})!.id);place(stateFor(family,{part:'head',facing})!.id,hx,y,hz);
    if(!survives())return 'unsupported';
  }else{
    let state=first;
    if(first.facing)state=stateFor(family,{facing,lit:false})??first;
    else if(family.endsWith('_leaves'))state=stateFor(family,{persistent:true})??first;
    if(!tryState(state))return 'unsupported';
  }
  // Plants, torches and fire cannot sit in a liquid.
  for(const c of cells){const d=blockDef(c.id),e=world.get(c.x,c.y,c.z);if(e>0&&isLiquid(e)&&!d.solid&&FRAGILE.has(d.shape))return 'unsupported';}
  return{cells:cells.slice()};
}

/** Does a block state at (x,y,z) collide with the box [minX..maxX]×[minY..maxY]×[minZ..maxZ]? */
export function stateIntersects(id:BlockId,x:number,y:number,z:number,minX:number,minY:number,minZ:number,maxX:number,maxY:number,maxZ:number):boolean{
  const b=COLLISION_BOXES[id],e=1e-4;
  for(let i=0;i<b.length;i+=6)
    if(minX<x+b[i+3]-e&&maxX>x+b[i]+e&&minY<y+b[i+4]-e&&maxY>y+b[i+1]+e&&minZ<z+b[i+5]-e&&maxZ>z+b[i+2]+e)return true;
  return false;
}
/** Entities that keep blocks from being placed into them (vanilla blocksBuilding: mobs and primed TNT, not items or arrows). */
export const blocksBuilding=(e:Entity)=>!e.removed&&e.deathTime===0&&e.category!=='item'&&e.category!=='xp'&&e.category!=='projectile';
const nearby:Entity[]=[];
/** Is a cell of the plan obstructed by the player or a mob? */
export function obstructed(game:Game,cells:readonly Cell[]):boolean{
  const p=game.player.state,hw=game.player.width/2,h=game.player.height;
  for(const c of cells){
    if(!blockDef(c.id).solid)continue;
    if(stateIntersects(c.id,c.x,c.y,c.z,p.x-hw,p.y,p.z-hw,p.x+hw,p.y+h,p.z+hw))return true;
    game.entities.near(c.x+.5,c.y+.5,c.z+.5,2,blocksBuilding,nearby);
    for(const e of nearby){const w=e.width/2;if(stateIntersects(c.id,c.x,c.y,c.z,e.x-w,e.y,e.z-w,e.x+w,e.y+e.height,e.z+w)){nearby.length=0;return true;}}
    nearby.length=0;
  }
  return false;
}

/** Places the block item `family` held in `hand` for a click on `hit`: sound, stats, event, item use. Failures return 'fail'
 *  (vanilla BlockItem.place) so the offhand does not act. */
export function placeBlock(game:Game,hand:Hand,hit:Hit,family:string):Result{
  const p=game.player.state,plan=planPlacement(game.world,family,hit,p.yaw,game.player.look());
  if(plan==='height'){game.ui.toast(`Height limit for building is ${CH}`);return 'fail';}
  if(typeof plan==='string')return 'fail';
  if(obstructed(game,plan.cells))return 'fail';
  return applyPlan(game,hand,plan.cells);
}
/** Writes planned cells (all or nothing), then plays the place sound, counts the placement and uses one item. */
export function applyPlan(game:Game,hand:Hand,cells:readonly Cell[]):Result{
  const w=game.world,before:number[]=[];
  for(const c of cells){
    before.push(w.get(c.x,c.y,c.z));
    if(!w.set(c.x,c.y,c.z,c.id,'player')){
      for(let i=before.length-2;i>=0;i--)w.set(cells[i].x,cells[i].y,cells[i].z,before[i],'player');
      if(w.editsFull)game.ui.toast('This world cannot hold more changes');
      return 'fail';
    }
  }
  const main=cells[0],def=blockDef(main.id);
  game.sounds.play(`place:${def.sound}`,{x:main.x+.5,y:main.y+.5,z:main.z+.5},{pitch:.8});
  game.stats.placed++;
  game.events.emit('blockPlaced',{x:main.x,y:main.y,z:main.z,id:main.id});
  hand.consume(1);
  return 'success';
}
