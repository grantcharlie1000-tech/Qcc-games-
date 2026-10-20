// STUB entity service (owned by the entity framework agent: batched box-model rendering with
// animation, item and XP entities, knockback, natural spawning, persistence). This version:
// generic physics, item pickup and placeholder boxes.
import * as THREE from 'three';
import {moveBody,rayBox} from '../engine/physics';
import {stack} from '../data/items';
import {createEntityAI} from './ai';
import type {DamageSource,Entity,EntityKind,EntityService,Game,ItemStack,SpawnReason,Vec3} from '../engine/contracts';

export function createEntities(game:Game):EntityService{
  const kinds=new Map<string,EntityKind>(),list:Entity[]=[],meshes=new Map<number,THREE.Mesh>();
  const box=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshBasicMaterial({color:0xffffff,wireframe:true});
  let nextId=1;
  register({kind:'item',category:'item',width:.25,height:.25,maxHealth:5,render:'item',item:e=>e.data.stack as ItemStack});
  register({kind:'xp_orb',category:'xp',width:.25,height:.25,maxHealth:5});
  function register(kind:EntityKind){kinds.set(kind.kind,kind);}
  const pickable=(k:EntityKind|undefined)=>k?.pickable??(k?.category==='passive'||k?.category==='hostile'||k?.category==='water');
  function spawn(kind:string,x:number,y:number,z:number,options:{data?:Record<string,unknown>;baby?:boolean;reason?:SpawnReason;yaw?:number}={}):Entity|null{
    const k=kinds.get(kind);if(!k)return null;
    const reason=options.reason??'event',yaw=options.yaw??0;
    const e:Entity={id:nextId++,kind,category:k.category,x,y,z,vx:0,vy:0,vz:0,yaw,pitch:0,headYaw:yaw,moveX:0,moveZ:0,jump:false,width:k.width,height:k.height,
      onGround:false,inWater:false,inLava:false,collidedH:false,collidedV:false,health:k.maxHealth,maxHealth:k.maxHealth,age:0,hurtTime:0,deathTime:0,
      removed:false,fire:0,baby:!!options.baby,data:options.data??{}};
    k.init?.(e,game,reason);
    list.push(e);
    const m=new THREE.Mesh(box,material);m.scale.set(e.width,e.height,e.width);game.render.scene.add(m);meshes.set(e.id,m);
    game.events.emit('entitySpawned',{entity:e,reason});
    return e;
  }
  function remove(e:Entity){e.removed=true;const m=meshes.get(e.id);if(m){game.render.scene.remove(m);meshes.delete(e.id);}}
  const service:EntityService={
    ai:createEntityAI(game),
    register,kinds:()=>[...kinds.values()],kind:name=>kinds.get(name),spawn,remove,all:()=>list,
    byId:id=>list.find(e=>e.id===id&&!e.removed),
    near(x,y,z,r,filter,out=[]){
      out.length=0;
      for(const e of list)if(!e.removed&&Math.hypot(e.x-x,e.y+e.height/2-y,e.z-z)<=r+e.width&&(!filter||filter(e)))out.push(e);
      return out;
    },
    raycast(o:Vec3,d:Vec3,max:number,ignore){
      let best:{entity:Entity;distance:number}|null=null;
      for(const e of list){
        if(e.removed||e===ignore||e.deathTime>0||!pickable(kinds.get(e.kind)))continue;
        const hw=e.width/2,t=rayBox(o.x,o.y,o.z,d.x,d.y,d.z,e.x-hw,e.y,e.z-hw,e.x+hw,e.y+e.height,e.z+hw);
        if(t>=0&&t<=max&&(!best||t<best.distance))best={entity:e,distance:t};
      }
      return best;
    },
    damage(e:Entity,amount:number,source:DamageSource){
      if(e.removed||e.hurtTime>0||e.deathTime>0)return false;
      const k=kinds.get(e.kind);
      if(k?.hurt?.(e,game,source,amount)===false)return false;
      e.health-=amount;e.hurtTime=10;
      if(source.knockback){
        const kb=source.knockback,len=Math.hypot(kb.x,kb.z)||1;
        e.vx+=kb.x/len*kb.strength;e.vz+=kb.z/len*kb.strength;e.vy=Math.max(e.vy,4);
      }
      game.events.emit('entityDamaged',{entity:e,amount,source});
      if(e.health<=0){
        e.deathTime=1;const byPlayer=!!source.byPlayer;
        for(const s of k?.drops?.(e,game,byPlayer)??[])service.dropItem(s,e.x,e.y+.5,e.z);
        const xp=typeof k?.xp==='function'?k.xp(e):k?.xp;
        if(byPlayer&&xp)service.dropXp(xp,e.x,e.y+.5,e.z);
        game.events.emit('entityDied',{entity:e,source});
      }
      return true;
    },
    dropItem(s:ItemStack,x,y,z,v,pickupDelay=10){const e=spawn('item',x,y,z,{data:{stack:{...s},pickup:pickupDelay},reason:'event'});if(e&&v){e.vx=v.x;e.vy=v.y;e.vz=v.z;}},
    dropXp(points,x,y,z){spawn('xp_orb',x,y,z,{data:{points},reason:'event'});},
    count:c=>list.filter(e=>!e.removed&&e.category===c).length,
    tick(){
      const p=game.player.state;
      for(const e of list){
        if(e.removed)continue;e.age++;if(e.hurtTime>0)e.hurtTime--;
        if(e.deathTime>0){if(++e.deathTime>20)remove(e);continue;}
        kinds.get(e.kind)?.tick?.(e,game);
        if(e.moveX||e.moveZ){e.vx+=(e.moveX-e.vx)*.5;e.vz+=(e.moveZ-e.vz)*.5;}
        if(e.jump&&e.onGround)e.vy=8.4;e.jump=false;
        e.vy=Math.max(-40,e.vy-32/20);const hit=moveBody(game.world,e,e.width/2,e.height,1/20,undefined,e.category==='item'||e.category==='xp'?0:.6);
        e.collidedH=hit.hitX||hit.hitZ;e.collidedV=hit.hitY;
        if(e.onGround&&!e.moveX&&!e.moveZ){e.vx*=.6;e.vz*=.6;}
        if(e.category==='item'||e.category==='xp'){
          const pick=(e.data.pickup as number)??0;if(pick>0)e.data.pickup=pick-1;
          if(pick<=0&&Math.hypot(p.x-e.x,p.y+.9-e.y,p.z-e.z)<1.6&&!game.survival.dead){
            if(e.category==='xp'){game.survival.addXp((e.data.points as number)??1);remove(e);game.sounds.play('orb');}
            else{const s=e.data.stack as ItemStack,left=game.inventory.add(s);
              if(left<s.count){game.events.emit('itemPickedUp',{stack:stack(s.id,s.count-left)});game.sounds.play('pop');}
              if(left===0)remove(e);else s.count=left;}
          }
          if(e.age>6000)remove(e);
        }
      }
      for(let i=list.length-1;i>=0;i--)if(list[i].removed)list.splice(i,1);
    },
    frame(){for(const e of list){const m=meshes.get(e.id);if(m)m.position.set(e.x,e.y+e.height/2,e.z);}},
    reset(){for(const e of [...list])remove(e);list.length=0;},
    dispose(){service.reset?.();box.dispose();material.dispose();}
  };
  return service;
}
