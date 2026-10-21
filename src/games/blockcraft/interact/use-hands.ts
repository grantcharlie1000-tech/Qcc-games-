// Hands and results shared by placement, item use and the interaction service. Vanilla tries the main hand, then
// the offhand, for every right click: a hand that passes lets the other hand act.
import {OUTLINE_BOX,blockDef,isLiquid} from '../data/blocks';
import {itemDef,maxStack,stack,type ItemStack} from '../data/items';
import type {BlockSource,Game,RayHit} from '../engine/contracts';

/** A block hit with the exact point the ray met the block's outline (world space). */
export interface Hit extends RayHit{px:number;py:number;pz:number}
/** Vanilla InteractionResult: success swings the arm, consume acts without a swing, pass lets the next step or hand try,
 *  fail stops the whole click. */
export type Result='success'|'consume'|'pass'|'fail';
export const acted=(r:Result)=>r==='success'||r==='consume';

export interface Hand{
  readonly offhand:boolean;
  get():ItemStack|null;
  /** Uses up `n` items (nothing in creative); container remainders (bucket, bowl) replace the stack or go to the inventory. */
  consume(n?:number):void;
  /** Wears the item by `n` (nothing in creative); it breaks with the tool_break sound when worn out. */
  damage(n?:number):void;
  set(s:ItemStack|null):void;
}
export function mainHand(game:Game):Hand{
  const inv=game.inventory;
  return{offhand:false,get:()=>inv.held(),consume:n=>inv.consumeHeld(n??1),damage:n=>inv.damageHeld(n??1),set:s=>inv.setSlot(inv.selected,s)};
}
export function offHand(game:Game):Hand{
  const inv=game.inventory,creative=()=>game.settings.mode==='creative';
  return{offhand:true,get:()=>inv.offhand,set:s=>inv.setOffhand(s),
    consume(n=1){
      const s=inv.offhand;if(!s||creative())return;
      const rest=itemDef(s.id)?.remainder;
      if(s.count<=n){inv.setOffhand(rest?stack(rest):null);return;}
      inv.setOffhand({...s,count:s.count-n});
      if(rest)give(game,stack(rest));
    },
    damage(n=1){
      const s=inv.offhand,max=s&&itemDef(s.id)?.durability;if(!s||!max||creative())return;
      const wear=(s.damage??0)+n;
      if(wear>=max){inv.setOffhand(null);game.sounds.play('tool_break',game.player.state);}
      else inv.setOffhand({...s,damage:wear});
    }};
}
/** Adds a stack to the inventory and drops what does not fit at the player's feet. */
export function give(game:Game,s:ItemStack):void{
  const left=game.inventory.add(s);
  if(left>0){const p=game.player.state;game.entities.dropItem({...s,count:left},p.x,p.y+.5,p.z);}
}
/** Vanilla ItemUtils.createFilledResult: one item of the hand becomes `filled` (a bucket of water, milk...). Creative keeps
 *  the empty container and only adds the filled one when the inventory has none. */
export function fillHand(game:Game,hand:Hand,filled:string):void{
  if(game.settings.mode==='creative'){if(game.inventory.count(filled)===0)give(game,stack(filled));return;}
  const s=hand.get();if(!s)return;
  if(s.count<=1&&maxStack(filled)>=1){hand.set(stack(filled));return;}
  hand.set({...s,count:s.count-1});give(game,stack(filled));
}

/** A liquid source block (level 0, not falling). */
export const isSource=(id:number)=>{const l=blockDef(id).liquid;return!!l&&l.level===0&&!l.falling;};
/** Block ray against outline shapes (vanilla ClipContext.Block.OUTLINE: slabs, plants, torches...): voxel traversal, then
 *  the outline box of each candidate. Air and unloaded voxels are passed; liquids too, unless `sources` asks the ray to
 *  stop at liquid source blocks (buckets, lily pads). Writes into `out`. */
export function traceOutline(world:BlockSource,ox:number,oy:number,oz:number,dx:number,dy:number,dz:number,max:number,out:Hit,sources=false):Hit|null{
  let x=Math.floor(ox),y=Math.floor(oy),z=Math.floor(oz);
  const sx=Math.sign(dx),sy=Math.sign(dy),sz=Math.sign(dz);
  const tdx=dx?Math.abs(1/dx):Infinity,tdy=dy?Math.abs(1/dy):Infinity,tdz=dz?Math.abs(1/dz):Infinity;
  let tx=dx?(sx>0?x+1-ox:ox-x)*tdx:Infinity,ty=dy?(sy>0?y+1-oy:oy-y)*tdy:Infinity,tz=dz?(sz>0?z+1-oz:oz-z)*tdz:Infinity;
  let nx=0,ny=0,nz=0,t=0;
  for(let steps=0;t<=max&&steps<256;steps++){
    const id=world.get(x,y,z);
    if(id>0&&(!isLiquid(id)||sources&&isSource(id))){
      const b=OUTLINE_BOX[id];
      if(b.length===6&&b[0]===0&&b[1]===0&&b[2]===0&&b[3]===1&&b[4]===1&&b[5]===1)return fill(out,x,y,z,nx,ny,nz,id,t,ox+dx*t,oy+dy*t,oz+dz*t);
      if(b.length===6){
        // Slab test against the outline box; the entry face is the axis entered last.
        let t0=0,t1=Infinity,ax=-1;const o=[ox,oy,oz],d=[dx,dy,dz],lo=[x+b[0],y+b[1],z+b[2]],hi=[x+b[3],y+b[4],z+b[5]];
        for(let a=0;a<3&&t0<=t1;a++){
          if(Math.abs(d[a])<1e-12){if(o[a]<lo[a]||o[a]>hi[a])t0=Infinity;continue;}
          let n=(lo[a]-o[a])/d[a],f=(hi[a]-o[a])/d[a];if(n>f){const s=n;n=f;f=s;}
          if(n>t0){t0=n;ax=a;}if(f<t1)t1=f;
        }
        if(t0<=t1&&t0<=max){
          const fn=[0,0,0];if(ax>=0)fn[ax]=-Math.sign(d[ax]);else{fn[0]=nx;fn[1]=ny;fn[2]=nz;}
          return fill(out,x,y,z,fn[0],fn[1],fn[2],id,t0,ox+dx*t0,oy+dy*t0,oz+dz*t0);
        }
      }
    }
    if(tx<ty&&tx<tz){x+=sx;t=tx;tx+=tdx;nx=-sx;ny=0;nz=0;}
    else if(ty<tz){y+=sy;t=ty;ty+=tdy;nx=0;ny=-sy;nz=0;}
    else{z+=sz;t=tz;tz+=tdz;nx=0;ny=0;nz=-sz;}
  }
  return null;
}
function fill(o:Hit,x:number,y:number,z:number,nx:number,ny:number,nz:number,id:number,distance:number,px:number,py:number,pz:number):Hit{
  o.x=x;o.y=y;o.z=z;o.nx=nx;o.ny=ny;o.nz=nz;o.id=id;o.distance=distance;o.px=px;o.py=py;o.pz=pz;return o;
}
/** The block the player looks at within reach (survival 4.5, creative 5), as a fresh hit. */
export function lookHit(game:Game,sources=false):Hit|null{
  const e=game.player.eye(),l=game.player.look(),reach=game.settings.mode==='creative'?5:4.5;
  return traceOutline(game.world,e.x,e.y,e.z,l.x,l.y,l.z,reach,{x:0,y:0,z:0,nx:0,ny:0,nz:0,id:0,distance:0,px:0,py:0,pz:0},sources);
}
