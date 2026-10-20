// STUB shared mob steering (owned by the entity framework agent: bounded A* navigation over
// standable cells, path caching, line of sight). This version steers in straight lines.
import {SOLID,isLava,AIR} from '../data/blocks';
import {raycast} from '../engine/physics';
import type {Entity,EntityAI,Game} from '../engine/contracts';

export function createEntityAI(game:Game):EntityAI{
  const ai:EntityAI={
    wander(e,speed,chance=1/120){
      const d=e.data as {wanderX?:number;wanderZ?:number};
      if(d.wanderX===undefined||d.wanderZ===undefined){
        if(game.random()<chance){d.wanderX=e.x+(game.random()-.5)*20;d.wanderZ=e.z+(game.random()-.5)*20;}
        return;
      }
      if(ai.moveToward(e,d.wanderX,e.y,d.wanderZ,speed)||e.collidedH&&e.onGround&&!e.jump){delete d.wanderX;delete d.wanderZ;ai.stop(e);}
    },
    lookAt(e,x,y,z){
      const dx=x-e.x,dz=z-e.z,dy=y-(e.y+e.height*.85);
      e.headYaw=Math.atan2(-dx,-dz);e.pitch=Math.atan2(dy,Math.hypot(dx,dz));
    },
    moveToward(e,x,_y,z,speed){
      const dx=x-e.x,dz=z-e.z,d=Math.hypot(dx,dz);
      if(d<.5){ai.stop(e);return true;}
      e.moveX=dx/d*speed;e.moveZ=dz/d*speed;e.yaw=e.headYaw=Math.atan2(-dx,-dz);
      if(e.collidedH&&e.onGround)e.jump=true;
      return false;
    },
    navigate(e,x,y,z,speed){ai.moveToward(e,x,y,z,speed);return false;},
    flee(e,fx,fz,speed){const dx=e.x-fx,dz=e.z-fz,d=Math.hypot(dx,dz)||1;ai.moveToward(e,e.x+dx/d*8,e.y,e.z+dz/d*8,speed);},
    canSee(e,x,y,z){
      const ox=e.x,oy=e.y+e.height*.85,oz=e.z,dx=x-ox,dy=y-oy,dz=z-oz,d=Math.hypot(dx,dy,dz);
      if(d<1e-6)return true;
      return !raycast(game.world,ox,oy,oz,dx/d,dy/d,dz/d,d,id=>id===AIR||!SOLID[id]);
    },
    isSafe(x,y,z){
      const fx=Math.floor(x),fy=Math.floor(y),fz=Math.floor(z),below=game.world.get(fx,fy-1,fz);
      return below>0&&SOLID[below]===1&&!isLava(below)&&!SOLID[Math.max(0,game.world.get(fx,fy,fz))]&&!SOLID[Math.max(0,game.world.get(fx,fy+1,fz))];
    },
    stop(e){e.moveX=0;e.moveZ=0;}
  };
  return ai;
}
