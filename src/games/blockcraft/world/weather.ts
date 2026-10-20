// Weather service: the vanilla clear / rain / thunder cycle (world/weather-cycle.ts), precipitation by biome and sky
// exposure (world/weather-columns.ts), snow layers while it snows and ice on cold water (world/weather-snow.ts), lightning with
// fire, damage, charged creepers and distance-delayed thunder (world/weather-lightning.ts), rain ambience, and the
// rain/snow/bolt visuals (render/weather.ts) when the game has a real renderer. Sky darkening is computed by the
// engine from `intensity` and `thunder`; the renderer reads `flash`.
import type {Entity,Game,Vec3,WeatherService,WeatherState} from '../engine/contracts';
import {RAINING_LEVEL,THUNDERING_LEVEL,advanceCycle,cycleState,newCycle,parseCycle,serializeCycle,setCycle,type WeatherCycle} from './weather-cycle';
import {precipitationHeight,precipitationKind,surfaceY} from './weather-columns';
import {precipitationTick} from './weather-snow';
import {THUNDER_SPEED,createBolt,findStrikeTarget,rollStrikeColumn,tickBolt,type Bolt,type BoltEvents} from './weather-lightning';
import {createWeatherVisuals,type WeatherVisuals} from '../render/weather';
import {visualRandom} from '../render/weather-drops';

/** The service plus a strike command (debugging, tests) and the live bolts (rendering). */
export interface WeatherController extends WeatherService{
  /** Lightning strikes the block position on the next tick, in any weather (like summoning a bolt). */
  strike(x:number,y:number,z:number):void;
  readonly bolts:readonly Bolt[];
}

/** Ticks between rain ambience sounds. */
const RAIN_SOUND_INTERVAL=[16,24] as const;
/** Rain is heard from columns within this many blocks (horizontally and vertically) of the camera, like vanilla. */
const RAIN_SOUND_RANGE=10;
const MAX_BOLTS=8,MAX_THUNDER=8;
/** Flash peak and decay per second (softer and slower with reduced motion). */
const FLASH_PEAK=1,FLASH_DECAY=10,SOFT_FLASH_PEAK=.35,SOFT_FLASH_DECAY=3;

interface PendingThunder{due:number;x:number;y:number;z:number;volume:number;pitch:number}

export function createWeather(game:Game):WeatherController{
  let cycle:WeatherCycle=newCycle();
  const bolts:Bolt[]=[],scratch:Entity[]=[];
  const thunder:PendingThunder[]=Array.from({length:MAX_THUNDER},()=>({due:-1,x:0,y:0,z:0,volume:0,pitch:1}));
  const ambience=visualRandom(0xa11ce);
  let flash=0,ticks=0,rainSoundIn=0,visuals:WeatherVisuals|null=null;

  const raining=()=>cycle.rainLevel>RAINING_LEVEL;
  const thunderStrength=()=>cycle.thunderLevel*cycle.rainLevel;
  const flashPeak=()=>game.reducedMotion?SOFT_FLASH_PEAK:FLASH_PEAK;
  /** A bolt is lighting the sky this tick (vanilla setSkyFlashTime while life >= 0). */
  function flashing(){for(let i=0;i<bolts.length;i++)if(bolts[i].life>=0)return true;return false;}

  function addBolt(x:number,y:number,z:number){
    if(bolts.length>=MAX_BOLTS)bolts.shift();
    bolts.push(createBolt(x,y,z,game.random));
  }
  function isRainingOn(x:number,y:number,z:number):boolean{
    if(!raining())return false;
    const bx=Math.floor(x),by=Math.floor(y),bz=Math.floor(z),h=precipitationHeight(game.world,bx,bz);
    return h>=0&&by>=h&&precipitationKind(game.world,bx,bz,by)==='rain';
  }
  const boltEvents:BoltEvents={
    struck(bolt){
      const eye=game.player.eye(),cx=bolt.x+.5,cy=bolt.y,cz=bolt.z+.5;
      const distance=Math.hypot(cx-eye.x,cy-eye.y,cz-eye.z);
      let slot=thunder.find(t=>t.due<0);
      if(!slot)slot=thunder.reduce((a,b)=>a.due<b.due?a:b);
      slot.due=ticks+Math.round(distance*20/THUNDER_SPEED);slot.x=cx;slot.y=cy;slot.z=cz;
      slot.volume=Math.max(.35,Math.min(1,1.15-distance/160));slot.pitch=.8+ambience()*.2;
    }
  };
  /** Thunder is loud everywhere (vanilla volume 10000): play it close to the listener, toward the strike, for panning. */
  function playThunder(t:PendingThunder){
    const eye=game.player.eye(),dx=t.x-eye.x,dy=t.y-eye.y,dz=t.z-eye.z,d=Math.hypot(dx,dy,dz)||1,near=Math.min(2,d);
    const at:Vec3={x:eye.x+dx/d*near,y:eye.y+dy/d*near,z:eye.z+dz/d*near};
    game.sounds.play('thunder',at,{volume:t.volume,pitch:t.pitch});
  }
  /** Vanilla LevelRenderer.tickRain: a random rain-hit column near the camera; muffled when it rains on the roof above. */
  function rainSound(){
    if(cycle.rainLevel<=0)return;
    if(--rainSoundIn>0)return;
    rainSoundIn=RAIN_SOUND_INTERVAL[0]+Math.floor(ambience()*(RAIN_SOUND_INTERVAL[1]-RAIN_SOUND_INTERVAL[0]+1));
    const eye=game.player.eye(),bx=Math.floor(eye.x),by=Math.floor(eye.y),bz=Math.floor(eye.z),world=game.world;
    for(let attempt=0;attempt<12;attempt++){
      const x=bx+Math.floor(ambience()*(RAIN_SOUND_RANGE*2+1))-RAIN_SOUND_RANGE,z=bz+Math.floor(ambience()*(RAIN_SOUND_RANGE*2+1))-RAIN_SOUND_RANGE;
      const h=precipitationHeight(world,x,z);
      if(h<=0||h>by+RAIN_SOUND_RANGE||h<by-RAIN_SOUND_RANGE||precipitationKind(world,x,z,h)!=='rain')continue;
      const covered=precipitationHeight(world,bx,bz)>by,muffled=covered&&h-1>by+1;
      game.sounds.play('rain',{x:x+.5,y:h,z:z+.5},{volume:cycle.rainLevel*(muffled?.5:1),pitch:muffled?.5:1});
      return;
    }
  }

  const service:WeatherController={
    get state():WeatherState{return cycleState(cycle);},
    get intensity(){return cycle.rainLevel;},
    get thunder(){return thunderStrength();},
    get flash(){return flash;},
    get bolts(){return bolts;},
    precipitationAt(x,z,y){
      if(!raining())return null;
      const bx=Math.floor(x),bz=Math.floor(z);
      return precipitationKind(game.world,bx,bz,y===undefined||!Number.isFinite(y)?surfaceY(game.world,bx,bz):Math.floor(y));
    },
    isRainingOn,
    set(state,duration){if(state==='clear'||state==='rain'||state==='thunder')setCycle(cycle,state,duration,game.random);},
    strike(x,y,z){if([x,y,z].every(Number.isFinite))addBolt(Math.floor(x),Math.floor(y),Math.floor(z));},
    init(){
      const scene=(game.render as Partial<typeof game.render>|undefined)?.scene;
      if(scene)visuals=createWeatherVisuals(game);
    },
    tick(){
      ticks++;
      advanceCycle(cycle,game.random,game.settings.weatherCycle);
      const p=game.player.state;
      if(raining()&&thunderStrength()>THUNDERING_LEVEL){
        const column=rollStrikeColumn(p.x,p.z,game.random);
        if(column){
          const target=findStrikeTarget(game,column.x,column.z,game.random,scratch);
          if(target&&isRainingOn(target.x,target.y,target.z))addBolt(target.x,target.y,target.z);
        }
      }
      precipitationTick(game.world,p.x,p.z,game.random,raining());
      for(let i=0;i<bolts.length;)if(tickBolt(game,bolts[i],game.random,scratch,boltEvents))i++;else bolts.splice(i,1);
      if(flashing())flash=Math.max(flash,flashPeak());
      for(const t of thunder)if(t.due>=0&&t.due<=ticks){t.due=-1;playThunder(t);}
      rainSound();
    },
    frame(dt){
      if(flashing())flash=Math.max(flash,flashPeak());
      else if(flash>0){flash*=Math.exp(-dt*(game.reducedMotion?SOFT_FLASH_DECAY:FLASH_DECAY));if(flash<.005)flash=0;}
      visuals?.frame(dt,cycle.rainLevel,bolts);
    },
    reset(){
      cycle=newCycle();bolts.length=0;flash=0;ticks=0;rainSoundIn=0;
      for(const t of thunder)t.due=-1;
      visuals?.reset();
    },
    serialize(){return{cycle:serializeCycle(cycle)};},
    restore(data){
      if(!data||typeof data!=='object')return;
      const parsed=parseCycle((data as {cycle?:unknown}).cycle);
      if(parsed)cycle=parsed;
    },
    dispose(){visuals?.dispose();visuals=null;}
  };
  return service;
}
