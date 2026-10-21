// Shared helpers for the monsters area (endermen and slimes): vanilla-style random helpers,
// player targeting rules and a painter for Java-style cuboid texture unwraps.
import type {DamageSource,Entity,Game} from '../engine/contracts';

/** Vanilla mob melee knockback: 0.4 blocks/tick, expressed in blocks/second. */
export const MOB_KNOCKBACK=8;
/** Fraction of ground speed kept per tick on normal ground (slipperiness 0.6 × 0.91, vanilla LivingEntity.travel). */
export const GROUND_KEEP=.6*.91;
/** The movement intent (moveX/moveZ: the steady ground speed, blocks/second) for a vanilla input speed `s` (the
 *  MOVEMENT_SPEED attribute): on normal ground speed per tick settles at s² / (1 − 0.6 × 0.91). The entity framework maps the
 *  intent back to s, so ground and air acceleration match vanilla (air 0.02 × s per tick). */
export const groundSpeed=(s:number)=>s*s/(1-GROUND_KEEP)*20;
/** Random.nextInt(n): 0..n-1. */
export const randInt=(random:()=>number,n:number)=>Math.floor(random()*n);
/** Loot count of UniformGenerator.between(min, max) (Mth.nextInt): every integer from min to max equally likely. */
export const uniformCount=(random:()=>number,min:number,max:number)=>min+Math.floor(random()*(max-min+1));

const RANDOMS=new WeakMap<Game,()=>number>();
/** `game.random` as a free function. The engine's random() is a method (it reads `this`), so it must never be detached as
 *  `const r=game.random`; this returns one cached wrapper per game, so hot paths do not allocate a closure every tick. */
export function gameRandom(game:Game):()=>number{
  let r=RANDOMS.get(game);
  if(!r){r=()=>game.random();RANDOMS.set(game,r);}
  return r;
}

/** Can monsters target the player: survival mode, alive and not peaceful (creative players are never targeted). */
export function playerTargetable(game:Game):boolean{
  return game.settings.mode==='survival'&&!game.survival.dead&&game.settings.difficulty!=='peaceful';
}

/** Melee damage source from a monster toward the player (survival applies difficulty, armour and knockback). */
export function meleeSource(e:Entity,game:Game):DamageSource{
  const p=game.player.state;
  return{kind:'mob',attacker:e,knockback:{x:p.x-e.x,z:p.z-e.z,strength:MOB_KNOCKBACK}};
}

/** Squared distance between the entity's feet and the player's feet. */
export function playerDistanceSq(e:Entity,game:Game):number{
  const p=game.player.state,dx=p.x-e.x,dy=p.y-e.y,dz=p.z-e.z;
  return dx*dx+dy*dy+dz*dz;
}

/** Deterministic 32-bit integer hash of up to three integers, as an unsigned integer. */
export function hashInts(a:number,b:number,c:number):number{
  let h=Math.imul(a|0,0x9e3779b1)^0x3ad8025f;
  h=Math.imul(h^h>>>15,0x85ebca6b);
  h^=Math.imul(b|0,0xc2b2ae35);h=Math.imul(h^h>>>13,0x27d4eb2f);
  h^=Math.imul(c|0,0x165667b1);h=Math.imul(h^h>>>16,0x85ebca6b);
  h^=h>>>13;h=Math.imul(h,0xc2b2ae35);h^=h>>>16;
  return h>>>0;
}
/** Deterministic noise in [0, 1) for texture painting. */
export const noise=(a:number,b:number,c:number)=>hashInts(a,b,c)/0x100000000;

/** Face ids passed to a box painter. Side faces follow the contract's unwrap order: -x, front -z, +x, back +z. */
export const FACE={top:0,bottom:1,west:2,front:3,east:4,back:5} as const;
/** Returns 0xRRGGBBAA for the pixel (x, y) of a face of size fw × fh (y = 0 is the top row of the face in the texture). */
export type FacePainter=(face:number,x:number,y:number,fw:number,fh:number)=>number;

/** Writes the standard cuboid unwrap of a w×h×d box at (u, v): top and bottom (w×d) at (u+d, v) and (u+d+w, v),
 *  then the side row at v+d: -x (d×h), front -z (w×h), +x (d×h), back +z (w×h). Pixels outside the texture are skipped. */
export function paintBox(pixels:Uint8ClampedArray,width:number,height:number,u:number,v:number,w:number,h:number,d:number,paint:FacePainter):void{
  const put=(x0:number,y0:number,fw:number,fh:number,face:number)=>{
    for(let y=0;y<fh;y++)for(let x=0;x<fw;x++){
      const px=x0+x,py=y0+y;if(px<0||py<0||px>=width||py>=height)continue;
      const c=paint(face,x,y,fw,fh)>>>0,i=(py*width+px)*4;
      pixels[i]=c>>>24;pixels[i+1]=c>>>16&255;pixels[i+2]=c>>>8&255;pixels[i+3]=c&255;
    }
  };
  put(u+d,v,w,d,FACE.top);put(u+d+w,v,w,d,FACE.bottom);
  put(u,v+d,d,h,FACE.west);put(u+d,v+d,w,h,FACE.front);put(u+d+w,v+d,d,h,FACE.east);put(u+2*d+w,v+d,w,h,FACE.back);
}
/** 0xRRGGBB scaled by `k` (clamped) with alpha `a`, as 0xRRGGBBAA. */
export function shade(rgb:number,k:number,a=255):number{
  const r=Math.max(0,Math.min(255,Math.round((rgb>>16&255)*k))),g=Math.max(0,Math.min(255,Math.round((rgb>>8&255)*k))),b=Math.max(0,Math.min(255,Math.round((rgb&255)*k)));
  return((r<<24)|(g<<16)|(b<<8)|(a&255))>>>0;
}
