// A DOM-free, WebGL-free Game for unit tests (vitest runs in node). Every service is a recording
// no-op stub; replace any of them with a real one built on this game, e.g.
//   const game=createFakeGame();game.survival=createSurvival(game);game.survival.init?.();
// then drive time with game.runTicks(n). The world is a real VoxelWorld; fill it with flat().
import {EventBus} from '../../../../src/games/blockcraft/engine/events';
import {VoxelWorld} from '../../../../src/games/blockcraft/world/world';
import {B} from '../../../../src/games/blockcraft/data/blocks';
import {CHUNK_VOLUME,LAYER,DAY_TICKS} from '../../../../src/games/blockcraft/engine/constants';
import {daylightAt,skyDarkeningAt,sanitizeSettings} from '../../../../src/games/blockcraft/engine/game';
import {createPlayerState} from '../../../../src/games/blockcraft/player/player';
import {offlineNet} from '../../../../src/games/blockcraft/engine/players';
import type {GameContext} from '../../../../src/core/types';
import type {AdvancementsService,BlockEntityService,BlockTickService,CraftingService,EngineState,Entity,EntityService,Game,GameEvents,
  GameSettings,GameTime,HudService,InputAction,InputService,InteractionService,InventoryService,ItemStack,Mesher,PlayerService,RenderService,
  SoundName,SoundService,SurvivalService,System,TerrainService,UIService,Vec3,WeatherService} from '../../../../src/games/blockcraft/engine/contracts';

type Mutable<T>={-readonly [K in keyof T]:T[K]};
export interface FakeGame extends Mutable<Omit<Game,'settings'|'time'|'stats'>>{
  settings:GameSettings;time:GameTime;stats:{mined:number;placed:number;kills:number;deaths:number};
  /** Everything passed to sounds.play / ui.toast / context.setStatus, in order. */
  sounds:SoundService&{played:{name:SoundName;at?:Vec3|null}[]};
  toasts:string[];statuses:string[];
  /** Inputs for the fake input service: actions held down and presses queued for pressed(). */
  held:Set<InputAction>;queued:Set<InputAction>;
  /** Fills chunks cx,cz in [-r, r] with `block` up to (not including) y = height. */
  flat(height?:number,block?:number,r?:number):void;
  /** Calls tick() on each listed system (default: the game's services in contract tick order), advancing time. */
  runTicks(n:number,systems?:System[]):void;
  setState(state:EngineState):void;
}

const noop=()=>{};
export function fakeContext(overrides:Partial<GameContext>={}):GameContext{
  return{id:'blockcraft',settings:{sound:false,reducedMotion:false,colorBlind:false},highScore:0,setScore:noop,setLevel:noop,setStatus:noop,announce:noop,save:noop,sound:noop,...overrides};
}

export function createFakeGame(options:{seed?:number;random?:()=>number;mode?:'survival'|'creative'}={}):FakeGame{
  const events=new EventBus<GameEvents>();
  let seed=options.seed??1;
  const random=options.random??(()=>{seed=(Math.imul(seed^seed>>>15,0x2c1b3c6d)+0x6d2b79f5)>>>0;return seed/0x100000000;});
  const statuses:string[]=[],toasts:string[]=[],played:{name:SoundName;at?:Vec3|null}[]=[];
  const held=new Set<InputAction>(),queued=new Set<InputAction>();
  const world=new VoxelWorld(events,()=>0);
  const p=createPlayerState(.5,64,.5);
  const empty:ItemStack[]=[];
  const player:PlayerService={state:p,width:.6,height:1.8,eyeHeight:()=>p.sneaking?1.27:1.62,
    eye:()=>({x:p.x,y:p.y+(p.sneaking?1.27:1.62),z:p.z}),
    look:()=>({x:-Math.sin(p.yaw)*Math.cos(p.pitch),y:Math.sin(p.pitch),z:-Math.cos(p.yaw)*Math.cos(p.pitch)}),
    teleport(x,y,z){p.x=x;p.y=y;p.z=z;p.vx=p.vy=p.vz=0;p.fallDistance=0;},push(vx,vy,vz){p.vx+=vx;p.vy+=vy;p.vz+=vz;},
    rotate(dy,dp){p.yaw+=dy;p.pitch=Math.max(-1.55,Math.min(1.55,p.pitch+dp));}};
  const input:InputService={down:a=>held.has(a),pressed(a){const had=queued.has(a);queued.delete(a);return had;},
    move:()=>({forward:(+held.has('forward'))-(+held.has('back')),strafe:(+held.has('right'))-(+held.has('left'))}),
    capture:noop,release:noop,captured:false,touch:false,clear(){held.clear();queued.clear();},bindings:()=>[]};
  const slots:(ItemStack|null)[]=new Array(36).fill(null),armor:(ItemStack|null)[]=[null,null,null,null];
  const inventory:InventoryService={slots,armor,offhand:null,selected:0,held:()=>slots[0],select:noop,
    add(s){for(let i=0;i<36;i++)if(!slots[i]){slots[i]={...s};return 0;}return s.count;},consumeHeld:noop,damageHeld:noop,damageArmor:noop,
    armorIn:()=>null,setArmor:()=>true,setOffhand:noop,swapHands:noop,count:id=>slots.reduce((n,s)=>n+(s?.id===id?s.count:0),0),
    remove:()=>0,setSlot(i,s){slots[i]=s;},dropHeld:noop,dropAll:noop,clear(){slots.fill(null);armor.fill(null);},onChange:()=>noop};
  const survival:SurvivalService={health:20,maxHealth:20,food:20,saturation:5,air:300,maxAir:300,absorption:0,xpLevel:0,xpProgress:0,xpTotal:0,
    dead:false,deathMessage:'',hurtFlash:0,burning:0,armorPoints:()=>0,damage:a=>a,heal:noop,addExhaustion:noop,eat:noop,canEat:()=>true,addXp:noop,addEffect:noop,
    removeEffect:noop,clearEffects:noop,effects:()=>[],hasEffect:()=>false,ignite:noop,extinguish:noop,land:noop,respawn:noop,kill:noop};
  const entityList:Entity[]=[];
  const entities:EntityService={
    ai:{wander:noop,lookAt:noop,moveToward:()=>true,navigate:()=>true,flee:noop,canSee:()=>true,isSafe:()=>true,stop(e){e.moveX=e.moveZ=0;}},
    register:noop,kinds:()=>[],kind:()=>undefined,spawn:()=>null,remove(e){e.removed=true;},byId:id=>entityList.find(e=>e.id===id),all:()=>entityList,
    near:(_x,_y,_z,_r,_f,out=[])=>{out.length=0;return out;},raycast:()=>null,damage:()=>false,dropItem:noop,dropXp:noop,count:()=>0};
  const render={setChunkMesh:noop,setSelection:noop,setBreaking:noop,spawnParticles:noop,swing:noop,setViewDistance:noop,setFovScale:noop,
    setOverlay:noop,render:noop,info:()=>({drawCalls:0,triangles:0,chunks:0}),resolutionScale:1} as unknown as RenderService;
  const terrain={seed:1,generate:()=>({blocks:new Uint8Array(CHUNK_VOLUME),biomes:new Uint8Array(LAYER)}),spawnPoint:()=>({x:.5,y:64,z:.5}),
    biomeAt:()=>0,heightAt:()=>63,growTree:()=>false} as TerrainService;
  const game:FakeGame={
    context:fakeContext({setStatus:m=>{statuses.push(m);}}),
    root:{dataset:{}} as unknown as HTMLElement,canvas:{} as HTMLCanvasElement,
    events,settings:{...sanitizeSettings({}),mode:options.mode??'survival',difficulty:'normal',view:1,sensitivity:1,fov:70,volume:1,keepInventory:false,
      daylightCycle:true,mobSpawning:true,weatherCycle:true},
    time:{tick:0,dayTime:1000,day:1,daylight:1,skyDarkening:0},state:'playing',spawning:false,shellPaused:false,
    world,terrain,render,mesher:{meshChunk:()=>{throw new Error('fake mesher');},meshBlock:()=>{throw new Error('fake mesher');}} as Mesher,
    player,input,survival,inventory,
    crafting:{match:()=>null,smelt:()=>null,fuelSeconds:()=>0,recipesFor:()=>[],allRecipes:()=>[]} as CraftingService,
    blockEntities:{get:()=>undefined} as BlockEntityService,entities,
    interaction:{target:null,entityTarget:null,attackCharge:1,using:null,breaking:null,blockDrops:()=>empty} as InteractionService,
    ticks:{schedule:noop,explode:noop} as BlockTickService,
    ui:{open:noop,close:noop,screen:null,toast:m=>{toasts.push(m);}} as UIService,hud:{showMenu:noop} as HudService,
    sounds:{play(name,at){played.push({name,at});},played},
    weather:{state:'clear',intensity:0,thunder:0,flash:0,precipitationAt:()=>null,isRainingOn:()=>false,set:noop} as WeatherService,
    advancements:{list:()=>[],has:()=>false,grant:noop,mountScreen:()=>noop} as AdvancementsService,
    random,play:noop,respawn:noop,newWorld:noop,screenChanged:noop,
    setMode(mode){game.settings.mode=mode;events.emit('modeChanged',{mode});},setViewDistance(v){game.settings.view=v;},
    updateSettings(patch){Object.assign(game.settings,sanitizeSettings(patch));events.emit('settingsChanged',{settings:game.settings});},
    skipTime(dayTime){const from=game.time.dayTime;game.time.dayTime=dayTime%DAY_TICKS;events.emit('timeSkipped',{from,to:game.time.dayTime});},
    stats:{mined:0,placed:0,kills:0,deaths:0},reducedMotion:false,
    toasts,statuses,held,queued,
    flat(height=60,block=B.stone,r=2){
      for(let cz=-r;cz<=r;cz++)for(let cx=-r;cx<=r;cx++){
        const blocks=new Uint8Array(CHUNK_VOLUME);blocks.fill(block,0,height*LAYER);world.insert(cx,cz,{blocks,biomes:new Uint8Array(LAYER)});
      }
    },
    runTicks(n,systems){
      for(let i=0;i<n;i++){
        const t=game.time;t.tick++;if(game.settings.daylightCycle){t.dayTime=(t.dayTime+1)%DAY_TICKS;if(!t.dayTime)t.day++;}
        t.daylight=daylightAt(t.dayTime);t.skyDarkening=skyDarkeningAt(t.daylight,game.weather.intensity,game.weather.thunder);world.skyDarkening=t.skyDarkening;
        for(const s of systems??[game.survival,game.player,game.entities,game.ticks,game.blockEntities,game.weather,game.inventory,game.interaction,game.advancements] as System[])s.tick?.();
      }
    },
    setState(state){const from=game.state;game.state=state;events.emit('stateChanged',{from,to:state});},
    net:undefined as unknown as Game['net']
  };
  game.net=offlineNet(game as unknown as Game);
  return game;
}
