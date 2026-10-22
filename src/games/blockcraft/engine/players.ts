// Player views: mobs, items, explosions and spawning see every player through these, so online guests are chased, hurt,
// pushed and given items like the local player. Offline (and in tests without a net service) the local player is the
// only view, and every helper behaves exactly as the single-player code did.
import type {DamageSource,EffectName,Game,ItemStack,NetService,PlayerView} from './contracts';

const views=new WeakMap<Game,PlayerView>();
/** The local player as a view (cached per game). */
export function localView(game:Game):PlayerView{
  let v=views.get(game);
  if(!v){
    v={
      id:'local',name:'You',local:true,
      get x(){return game.player.state.x;},get y(){return game.player.state.y;},get z(){return game.player.state.z;},
      get yaw(){return game.player.state.yaw;},
      get width(){return game.player.width;},get height(){return game.player.height;},get eyeHeight(){return game.player.eyeHeight();},
      get inWater(){return game.player.state.inWater;},get sneaking(){return game.player.state.sneaking;},
      get dead(){return game.survival.dead;},
      get targetable(){return game.settings.mode==='survival'&&!game.survival.dead&&game.state!=='dead';},
      damage:(amount:number,source:DamageSource)=>game.survival.damage(amount,source),
      push:(vx:number,vy:number,vz:number)=>game.player.push(vx,vy,vz),
      give:(stack:ItemStack)=>game.inventory.add(stack),
      canTake:()=>true,
      addXp:(points:number)=>game.survival.addXp(points),
      ignite:(seconds:number)=>game.survival.ignite(seconds),
      addEffect:(name:EffectName,seconds:number,level?:number)=>game.survival.addEffect(name,seconds,level),
      teleport:(x:number,y:number,z:number)=>game.player.teleport(x,y,z)
    };
    views.set(game,v);
  }
  return v;
}
const single=new WeakMap<Game,readonly PlayerView[]>();
export function playersOf(game:Game):readonly PlayerView[]{
  if(game.net)return game.net.players();
  let list=single.get(game);if(!list){list=[localView(game)];single.set(game,list);}
  return list;
}
/** True where the shared world is simulated: offline, or the online host. */
export const hasAuthority=(game:Game)=>game.net?game.net.authority:true;
/** The nearest view (3-D distance) within `max` accepted by `filter`. */
export function nearestPlayer(game:Game,x:number,y:number,z:number,max=Infinity,filter?:(p:PlayerView)=>boolean):PlayerView|null{
  let best:PlayerView|null=null,bestD=max*max;
  for(const p of playersOf(game)){
    if(filter&&!filter(p))continue;
    const d=(p.x-x)**2+(p.y-y)**2+(p.z-z)**2;
    if(d<=bestD){best=p;bestD=d;}
  }
  return best;
}
/** Squared horizontal distance to the nearest player. */
export function nearestHorizontal2(game:Game,x:number,z:number):number{
  let best=Infinity;for(const p of playersOf(game)){const d=(p.x-x)**2+(p.z-z)**2;if(d<best)best=d;}
  return best;
}
/** Does the player's box grown by (1, 0.5, 1) touch the box? */
export function touches(p:PlayerView,x:number,y:number,z:number,width:number,height:number):boolean{
  const pw=p.width/2+1+width/2;
  return Math.abs(p.x-x)<pw&&Math.abs(p.z-z)<pw&&y<p.y+p.height+.5&&y+height>p.y-.5;
}
/** A net service for a game that is never online (tests and tools). */
export function offlineNet(game:Game):NetService{
  return{role:'offline',authority:true,players:()=>playersOfLocal(game),player:id=>id==='local'?localView(game):undefined,
    nearestPlayer:(x,y,z,max,filter)=>{const p=localView(game);return (!filter||filter(p))&&(p.x-x)**2+(p.y-y)**2+(p.z-z)**2<=(max??Infinity)**2?p:null;},openPanel(){}};
}
function playersOfLocal(game:Game):readonly PlayerView[]{let list=single.get(game);if(!list){list=[localView(game)];single.set(game,list);}return list;}
