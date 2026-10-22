// The engine: creates every service, runs the fixed-tick world and per-frame rendering, owns the
// state machine (loading → ready → playing ⇄ screen ⇄ paused, dead, lost) and persistence.
import type {GameContext,GameInstance} from '../../../core/types';
import {CH,CS,DAY_TICKS,TPS} from './constants';
import {FACING_VECTOR,blockDef} from '../data/blocks';
import {EventBus} from './events';
import {VIEW_DISTANCES,type AdvancementsService,type BlockEntityService,type CraftingService,type Difficulty,type EngineState,type EntityService,type Game,
  type GameEvents,type GameMode,type GameSettings,type GameTime,type HudService,type InputService,type InteractionService,type Mesher,type PlayerService,
  type RenderService,type SoundService,type SurvivalService,type System,type TerrainService,type UIService,type BlockTickService,type InventoryService,
  type WeatherService} from './contracts';
import {ChunkStreamer} from './streaming';
import {bedStandUp,bodyCollides} from './physics';
import {mulberry32} from '../world/noise';
import {VoxelWorld} from '../world/world';
import {createTerrain} from '../world/terrain';
import {createLightEngine} from '../world/light';
import {createBlockEntities} from '../world/blockentities';
import {createBlockTicks,registerWorldEntities} from '../world/ticks';
import {createMesher} from '../render/mesher';
import {createRenderer} from '../render/renderer';
import {createInput} from '../player/input';
import {createPlayer,HALF_WIDTH,HEIGHT} from '../player/player';
import {createSurvival} from '../player/survival';
import {createInventory} from '../items/inventory';
import {createCrafting} from '../items/crafting';
import {createEntities} from '../entity/entities';
import {registerPassiveMobs} from '../entity/passive';
import {registerCompanionMobs} from '../entity/companions';
import {registerHostileMobs} from '../entity/hostile';
import {registerMonsters} from '../entity/monsters';
import {createInteraction} from '../interact/interaction';
import {createSounds} from '../audio/sounds';
import {createUI} from '../ui/screens';
import {createHud} from '../ui/hud';
import {createWeather} from '../world/weather';
import {createAdvancements} from '../ui/advancements';
import {createNet,type NetController,type NetHooks} from '../net/net';
import {avatarKind} from '../net/avatar';
import {SHARED_SETTINGS} from '../net/protocol';
import type {GuestWorld} from '../net/guest';

export const SNAPSHOT_VERSION=2;
const DEFAULT_SEED=0x51ab1e;
const nextSeed=(seed:number)=>(Math.imul(seed^0x9e3779b9,0x85ebca6b)>>>0)||1;
const MODES:GameMode[]=['survival','creative'],DIFFICULTIES:Difficulty[]=['peaceful','easy','normal','hard'];
const DEFAULT_SETTINGS:GameSettings={mode:'survival',difficulty:'normal',view:1,sensitivity:1,fov:70,volume:1,keepInventory:false,daylightCycle:true,mobSpawning:true,weatherCycle:true};
const BOOLEAN_SETTINGS=['keepInventory','daylightCycle','mobSpawning','weatherCycle'] as const;
/** Valid fields of an untrusted settings patch. */
export function sanitizeSettings(patch:unknown):Partial<GameSettings>{
  const out:Partial<GameSettings>={};if(!patch||typeof patch!=='object')return out;
  const p=patch as Record<string,unknown>,num=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
  if(MODES.includes(p.mode as GameMode))out.mode=p.mode as GameMode;
  if(DIFFICULTIES.includes(p.difficulty as Difficulty))out.difficulty=p.difficulty as Difficulty;
  if(Number.isInteger(p.view)&&num(p.view,0,VIEW_DISTANCES.length-1))out.view=p.view as number;
  if(num(p.sensitivity,.1,4))out.sensitivity=p.sensitivity as number;
  if(num(p.fov,50,110))out.fov=p.fov as number;
  if(num(p.volume,0,1))out.volume=p.volume as number;
  for(const k of BOOLEAN_SETTINGS)if(typeof p[k]==='boolean')out[k]=p[k] as boolean;
  return out;
}

export function daylightAt(dayTime:number){
  // 1 through the day, 0 at night, with dawn and dusk transitions around 0 and 12000.
  return Math.max(0,Math.min(1,Math.cos((dayTime-6000)/DAY_TICKS*Math.PI*2)*2+.5));
}
/** Sky light levels lost to night and weather (rain up to 3, thunder up to 5 more). */
export function skyDarkeningAt(daylight:number,rain:number,thunder:number){
  // Vanilla Level.updateSkyBrightness: weather scales the daylight down (rain by up to 5/16, thunder by 5/16 more).
  const c=(v:number)=>Math.max(0,Math.min(1,v));
  return Math.floor((1-c(daylight)*(1-c(rain)*5/16)*(1-c(thunder)*5/16))*11);
}

export class Engine implements Game{
  readonly events=new EventBus<GameEvents>();
  readonly settings:GameSettings={...DEFAULT_SETTINGS};
  readonly time:GameTime={tick:0,dayTime:1000,day:1,daylight:1,skyDarkening:0};
  readonly stats={mined:0,placed:0,kills:0,deaths:0};
  readonly root:HTMLElement;readonly canvas:HTMLCanvasElement;
  state:EngineState='loading';
  readonly mesher:Mesher=createMesher();
  world:VoxelWorld;terrain:TerrainService;render:RenderService;input:InputService;player:PlayerService;survival:SurvivalService;
  inventory:InventoryService;crafting:CraftingService;blockEntities:BlockEntityService;entities:EntityService;interaction:InteractionService;
  ticks:BlockTickService;ui:UIService;hud:HudService;sounds:SoundService;weather:WeatherService;advancements:AdvancementsService;
  readonly net:NetController;
  private streamer:ChunkStreamer;
  /** Systems whose tick simulates the shared world: skipped on an online guest (the host runs them). */
  private hostOnly:Set<System>;
  /** Online guest: play is held while the host is paused or the shared world loads. */
  private netHeld=false;
  /** Services in creation order (disposed in reverse) and in tick / frame order. */
  private created:[string,System][];private ticked:System[];private framed:System[];
  private seed=DEFAULT_SEED;private rng=mulberry32(DEFAULT_SEED);
  private frameId=0;private last=0;private tickAcc=0;private paused=false;private disposed=false;
  private diedAt=0;private spawnPending=true;private respawnPending=false;private bedPending=false;private freshWorld=true;private restored=false;private wasLocked=false;private lastScore=-1;private lastDay=0;
  private abort=new AbortController();
  constructor(container:HTMLElement,readonly context:GameContext){
    this.root=document.createElement('div');this.root.className='blockcraft';
    this.root.innerHTML='<canvas tabindex="0" aria-label="Blockcraft 3D world. W A S D move, Space jump, Shift sneak, Control or double-tap W sprint, mouse look, left click mine or attack, right click place or use, E inventory, Q drop, F swap hands, L advancements, 1 to 9 hotbar."></canvas>';
    container.append(this.root);
    this.canvas=this.root.querySelector('canvas')!;
    this.world=new VoxelWorld(this.events,(x,z)=>this.terrain.biomeAt(x,z));
    this.terrain=createTerrain(this.seed);
    this.render=createRenderer(this);// throws without WebGL 2
    this.input=createInput(this);this.player=createPlayer(this);this.survival=createSurvival(this);this.inventory=createInventory(this);
    this.crafting=createCrafting(this);this.blockEntities=createBlockEntities(this);this.entities=createEntities(this);
    this.interaction=createInteraction(this);this.ticks=createBlockTicks(this);this.sounds=createSounds(this);this.weather=createWeather(this);
    this.ui=createUI(this);this.hud=createHud(this);this.advancements=createAdvancements(this);
    this.net=createNet(this,this.netHooks());
    registerPassiveMobs(this);registerCompanionMobs(this);registerHostileMobs(this);registerMonsters(this);registerWorldEntities(this);
    this.entities.register(avatarKind());
    this.created=[['terrain',this.terrain],['render',this.render],['input',this.input],['player',this.player],['survival',this.survival],
      ['inventory',this.inventory],['crafting',this.crafting],['blockEntities',this.blockEntities],['entities',this.entities],
      ['interaction',this.interaction],['ticks',this.ticks],['sounds',this.sounds],['weather',this.weather],['ui',this.ui],['hud',this.hud],
      ['advancements',this.advancements],['net',this.net]];
    this.hostOnly=new Set<System>([this.entities,this.ticks,this.blockEntities,this.weather]);
    this.ticked=this.ordered(['survival','player','net','entities','ticks','blockEntities','weather']);
    this.framed=this.ordered(['input','player','interaction','render','entities','weather','ui','hud']);
    this.streamer=new ChunkStreamer(this.world,()=>this.terrain,createLightEngine(),this.mesher,this.render,()=>this.schedule());
    this.root.dataset.workers=String(this.streamer.workerCount);this.root.dataset.locked='false';
    const signal=this.abort.signal;
    document.addEventListener('pointerlockchange',()=>{
      const locked=document.pointerLockElement===this.canvas;
      // The browser released the mouse (Escape): pause, unless a screen or menu did it.
      if(this.wasLocked&&!locked&&this.state==='playing')this.toPaused();
      // A lock requested just before a screen or menu opened can arrive late: give the mouse back at once.
      if(locked&&this.state!=='playing'){this.input.release();this.wasLocked=false;this.root.dataset.locked='false';return;}
      this.wasLocked=locked;this.root.dataset.locked=String(locked);
    },{signal});
    this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.contextLost();},{signal});
    this.events.on('playerDied',({message})=>{
      this.stats.deaths++;this.diedAt=performance.now();this.setState('dead');this.ui.close();this.input.clear();this.input.release();this.hud.showMenu('dead');
      this.context.announce(message);this.context.setStatus(message);
    });
    this.events.on('entityDied',({source})=>{if(source.byPlayer||source.kind==='player')this.stats.kills++;});
    for(const [,s] of this.created)s.init?.();
    this.setView(this.settings.view);
    this.resetWorld(this.seed);
    this.hud.showMenu('start');
    this.schedule();
    if(import.meta.env.DEV)(window as unknown as {blockcraft?:Engine}).blockcraft=this;
  }
  /** The named services first, in that order, then every other service in creation order. */
  private ordered(first:string[]):System[]{
    const byName=new Map(this.created);
    return [...first.map(n=>byName.get(n)!),...this.created.filter(([n])=>!first.includes(n)).map(([,s])=>s)];
  }
  get reducedMotion(){return this.context.settings.reducedMotion;}
  get spawning(){return this.spawnPending;}
  get shellPaused(){return this.paused;}
  /** An arrow so it also works unbound (`const r=game.random`). */
  readonly random=()=>this.rng();
  private setState(to:EngineState){const from=this.state;if(from===to)return;this.state=to;this.root.dataset.phase=to;this.events.emit('stateChanged',{from,to});this.schedule();}

  // ---- State transitions --------------------------------------------------------------------
  // Leaving 'playing'/'screen' sets the new state BEFORE ui.close(), so the screenChanged(false) it triggers is ignored.
  play(){
    if(this.disposed||this.state==='lost'||this.state==='loading'||this.paused||this.spawnPending||this.netHeld)return;
    if(this.state==='dead')return;// respawn first
    this.hud.showMenu(null);this.setState('playing');this.canvas.focus({preventScroll:true});this.input.capture();
    this.context.setStatus(this.input.touch?'Drag to look. Hold to mine, tap to place.':'Mouse looks once captured. Left click mines, right click places, E opens the inventory.');
  }
  respawn(){
    if(this.disposed||this.state!=='dead')return;
    this.survival.respawn();
    const p=this.player.state,bed=p.bedSpawn;
    // At the bed, trySpawn gets the player up beside it once its chunks are loaded.
    const at=bed?{x:bed.x+.5,y:bed.y+1,z:bed.z+.5}:p.spawn;
    this.player.teleport(at.x,at.y,at.z);
    this.spawnPending=true;this.respawnPending=true;this.bedPending=!!bed;this.setState('ready');
    this.events.emit('playerRespawned',{});
    this.hud.showMenu(null);
    this.trySpawn();
    if(!this.spawnPending)this.play();
  }
  screenChanged(open:boolean){
    if(open){if(this.state!=='playing')return;this.input.clear();this.setState('screen');this.input.release();}
    else if(this.state==='screen'){this.input.clear();this.setState('playing');this.input.capture();}
  }
  private toPaused(){
    if(this.state!=='playing'&&this.state!=='screen')return;
    this.setState('paused');this.ui.close();this.input.clear();this.input.release();this.hud.showMenu('resume');
  }
  private contextLost(){
    if(this.disposed)return;
    this.setState('lost');this.ui.close();this.input.clear();this.input.release();cancelAnimationFrame(this.frameId);this.frameId=0;
    this.hud.showMenu('lost');this.context.save(this.shellSerialize());this.context.setStatus('Graphics context lost. Leave and reopen the game.');
  }
  setMode(mode:GameMode){this.updateSettings({mode});}
  setViewDistance(index:number){this.updateSettings({view:Math.max(0,Math.min(VIEW_DISTANCES.length-1,Math.round(index)))});}
  updateSettings(patch:Partial<GameSettings>){
    const clean=sanitizeSettings(patch);let changed=false;
    for(const k of Object.keys(clean) as (keyof GameSettings)[])if(this.settings[k]!==clean[k]){(this.settings as unknown as Record<string,unknown>)[k]=clean[k];changed=true;}
    if(!changed)return;
    if(clean.view!==undefined)this.setView(clean.view);
    // The menu can change mode after the render loop has gone idle. Keep observers current without waking it.
    if(clean.mode!==undefined){this.root.dataset.mode=this.settings.mode;if(clean.mode==='survival')this.player.state.flying=false;this.events.emit('modeChanged',{mode:clean.mode});}
    this.events.emit('settingsChanged',{settings:this.settings});
  }
  private setView(index:number){this.settings.view=index;this.render.setViewDistance(VIEW_DISTANCES[index]);this.root.dataset.view=String(VIEW_DISTANCES[index]);this.schedule();}
  skipTime(dayTime:number){
    const t=this.time,from=t.dayTime,to=((Math.round(dayTime)%DAY_TICKS)+DAY_TICKS)%DAY_TICKS,delta=(to-from+DAY_TICKS)%DAY_TICKS;
    if(!delta)return;
    t.tick+=delta;if(to<from)t.day++;t.dayTime=to;this.updateLight();
    // Waking clears the weather only while the weather cycle runs (vanilla doWeatherCycle).
    if(this.settings.weatherCycle)this.weather.set('clear');
    this.events.emit('timeSkipped',{from,to});
  }
  private updateLight(){
    const t=this.time;t.daylight=daylightAt(t.dayTime);
    t.skyDarkening=skyDarkeningAt(t.daylight,this.weather.intensity,this.weather.thunder);this.world.skyDarkening=t.skyDarkening;
  }

  // ---- Loop ---------------------------------------------------------------------------------
  /** Wake the loop. Only a loop that had stopped restarts its clock (its first frame then counts as 1/60 s). */
  private schedule(){if(!this.frameId&&!this.disposed&&!this.paused&&this.state!=='lost'){this.last=0;this.frameId=requestAnimationFrame(t=>this.loop(t));}}
  /** Next frame of a running loop: keeps the clock so dt is the real time between frames. */
  private continueLoop(){if(!this.frameId&&!this.disposed&&!this.paused&&this.state!=='lost')this.frameId=requestAnimationFrame(t=>this.loop(t));}
  private loop(time:number){
    this.frameId=0;if(this.disposed||this.paused||this.state==='lost')return;
    const dt=Math.min(.1,this.last?(time-this.last)/1000:1/60);this.last=time;
    const p=this.player.state;
    this.streamer.setCentre(p.x,p.z,VIEW_DISTANCES[this.settings.view]);
    const built=this.streamer.update();
    if(this.spawnPending)this.trySpawn();
    const running=this.state==='playing'||this.state==='screen';
    if(running){
      this.tickAcc+=dt;
      while(this.tickAcc>=1/TPS){this.tickAcc-=1/TPS;this.tick();if(this.state!=='playing'&&this.state!=='screen')break;}
    }else this.tickAcc=0;
    for(const s of this.framed)s.frame?.(dt);
    this.render.render();
    this.report(built);
    // Keep drawing for a second after death so the death animation plays out.
    if(running||this.streamer.busy||this.spawnPending||built||this.state==='dead'&&time-this.diedAt<1000)this.continueLoop();
  }
  private tick(){
    const t=this.time;t.tick++;
    if(this.settings.daylightCycle){t.dayTime=(t.dayTime+1)%DAY_TICKS;if(t.dayTime===0)t.day++;}
    this.updateLight();
    const authority=this.net.authority;
    for(const s of this.ticked)if(authority||!this.hostOnly.has(s))s.tick?.();
  }
  private report(built:number){
    const d=this.root.dataset,p=this.player.state;
    d.x=p.x.toFixed(2);d.y=p.y.toFixed(2);d.z=p.z.toFixed(2);d.yaw=p.yaw.toFixed(3);d.grounded=String(p.onGround);
    d.chunks=String(this.world.chunks.size);d.meshes=String(this.streamer.meshedCount);d.ready=String(!this.spawnPending);
    d.mined=String(this.stats.mined);d.placed=String(this.stats.placed);d.slot=String(this.inventory.selected);d.mode=this.settings.mode;
    d.health=String(this.survival.health);d.food=String(this.survival.food);d.dayTime=String(this.time.dayTime);d.weather=this.weather.state;
    d.entities=String(this.entities.all().length);
    const t=this.interaction.target;d.target=t?`${t.x},${t.y},${t.z}`:'';
    const e=this.interaction.entityTarget;d.entityTarget=e?e.kind:'';
    if(built||this.state==='playing'){const r=this.render.info();d.drawCalls=String(r.drawCalls);d.triangles=String(r.triangles);d.scale=this.render.resolutionScale.toFixed(2);}
    if(this.stats.mined!==this.lastScore){this.lastScore=this.stats.mined;this.context.setScore(this.stats.mined);}
    if(this.time.day!==this.lastDay){this.lastDay=this.time.day;this.context.setLevel(`Day ${this.time.day}`);}
  }
  /** Waits until the player's chunk and all eight neighbours exist and are meshed, so collision is exact. */
  private trySpawn(){
    const p=this.player.state,cx=Math.floor(p.x/CS),cz=Math.floor(p.z/CS);
    if(!this.streamer.hasNeighbours(cx,cz)||!this.streamer.isMeshed(cx,cz))return;
    if(this.bedPending&&!this.standUp()){this.trySpawn();return;}
    // Restored chunks are now available: resolve crouching/crawling before repairing obstruction.
    this.player.teleport(p.x,p.y,p.z);
    const savedY=p.y;
    for(let i=0;i<CH&&bodyCollides(this.world,p,HALF_WIDTH,this.player.height);i++)p.y+=1;
    if(p.y!==savedY)this.player.teleport(p.x,p.y,p.z);
    if(this.freshWorld){p.spawn={x:p.x,y:p.y,z:p.z};this.freshWorld=false;}
    this.spawnPending=false;
    // A world saved on the death screen loads back onto it.
    if(this.state==='loading'&&this.survival.dead){this.diedAt=performance.now();this.setState('dead');this.hud.showMenu('dead');}
    else if(this.state==='loading'){this.setState('ready');this.hud.showMenu(this.restored?'resume':'start');}
    // A respawn far away finished loading after the click: pointer lock needs a new gesture.
    else if(this.respawnPending&&this.state==='ready')this.hud.showMenu('resume');
    this.respawnPending=false;
  }

  /** Respawning at a bed: get up beside it (vanilla BedBlock.findStandUpPosition). A bed that is gone or obstructed is
   *  forgotten and the player goes to the world spawn instead (false: its chunks may still have to load). */
  private standUp(){
    this.bedPending=false;
    const p=this.player.state,bed=p.bedSpawn;if(!bed)return true;
    const d=blockDef(Math.max(0,this.world.get(bed.x,bed.y,bed.z))),v=d.family==='bed'&&d.facing?FACING_VECTOR[d.facing]:null;
    // FACING_VECTOR points from the head to the foot.
    const at=v&&bedStandUp(this.world,bed.x,bed.y,bed.z,-v[0],-v[1],HALF_WIDTH,HEIGHT);
    if(at){this.player.teleport(at.x,at.y,at.z);return true;}
    p.bedSpawn=null;this.ui.toast('You have no home bed, or it was obstructed');
    this.player.teleport(p.spawn.x,p.spawn.y,p.spawn.z);
    return false;
  }

  // ---- World lifecycle ----------------------------------------------------------------------
  private resetWorld(seed:number){
    this.seed=seed>>>0;this.rng=mulberry32(this.seed^0xa5a5a5a5);
    this.streamer.clear();this.world.clear();
    this.terrain.dispose?.();this.terrain=createTerrain(this.seed);
    this.created[0]=['terrain',this.terrain];
    this.ticked=this.ordered(['survival','player','net','entities','ticks','blockEntities','weather']);
    this.framed=this.ordered(['input','player','interaction','render','entities','weather','ui','hud']);
    Object.assign(this.time,{tick:0,dayTime:1000,day:1});Object.assign(this.stats,{mined:0,placed:0,kills:0,deaths:0});
    for(const [,s] of this.created)s.reset?.();
    this.updateLight();
    const s=this.terrain.spawnPoint();this.player.teleport(s.x,s.y,s.z);this.player.state.spawn={...s};this.player.state.bedSpawn=null;
    this.spawnPending=true;this.respawnPending=false;this.bedPending=false;this.freshWorld=true;this.restored=false;this.lastScore=-1;this.lastDay=0;
    if(this.state!=='lost')this.setState('loading');
    this.events.emit('worldReset',{});
  }
  /** The shell's Restart button: a new world deletes this one, so ask first (the menu's Create calls newWorld()). The shell
   *  resumes and saves right after this call, which keeps the current world until the player confirms. */
  restart(){
    if(this.disposed||this.state==='lost')return;
    if(this.net.role==='guest'){this.ui.toast('Only the host can start a new world.');return;}
    this.playOnShellResume=false;
    if(this.state==='playing'||this.state==='screen')this.toPaused();
    this.ui.close();this.input.clear();this.input.release();this.hud.showMenu('restart');
  }
  newWorld(){
    if(this.disposed||this.state==='lost')return;
    // This answers the Restart question, so it closes it (a showing question otherwise stays up over 'start').
    this.hud.showMenu(null);
    this.setState('loading');this.ui.close();this.input.clear();this.input.release();
    this.resetWorld(nextSeed(this.seed));this.hud.showMenu('start');
    this.context.setStatus('A fresh world. Press Play when it is ready.');this.context.save(this.shellSerialize());this.schedule();
  }
  serialize():unknown{
    const systems:Record<string,unknown>={};
    for(const [name,s] of this.created){const v=s.serialize?.();if(v!==undefined)systems[name]=v;}
    return{version:SNAPSHOT_VERSION,seed:this.seed,settings:{...this.settings},time:{tick:this.time.tick,dayTime:this.time.dayTime,day:this.time.day},
      stats:{...this.stats},edits:this.world.serializeEdits(),populated:this.world.serializePopulated(),systems};
  }
  restore(value:unknown){
    if(!value||typeof value!=='object'||this.state==='lost')return;
    const v=value as Record<string,unknown>;
    if(v.version!==SNAPSHOT_VERSION||!Number.isInteger(v.seed)||(v.seed as number)<0||(v.seed as number)>0xffffffff)return;
    const probe=new VoxelWorld();if(!probe.restoreEdits(v.edits))return;
    this.setState('loading');this.ui.close();this.input.clear();this.input.release();
    this.resetWorld(v.seed as number);this.world.restoreEdits(v.edits);this.world.restorePopulated(v.populated);
    const st=sanitizeSettings(v.settings);
    Object.assign(this.settings,st);this.setView(this.settings.view);
    if(this.settings.mode==='survival')this.player.state.flying=false;
    const t=v.time as Partial<GameTime>|undefined;
    if(t&&Number.isInteger(t.tick)&&Number.isInteger(t.dayTime)&&Number.isInteger(t.day)&&t.dayTime!>=0&&t.dayTime!<DAY_TICKS&&t.day!>=1&&t.tick!>=0){
      this.time.tick=t.tick!;this.time.dayTime=t.dayTime!;this.time.day=t.day!;
    }
    const s=v.stats as Partial<Game['stats']>|undefined;
    if(s)for(const k of ['mined','placed','kills','deaths'] as const)if(Number.isInteger(s[k])&&s[k]!>=0)this.stats[k]=s[k]!;
    const systems=(v.systems&&typeof v.systems==='object'?v.systems:{}) as Record<string,unknown>;
    for(const [name,sys] of this.created)if(name in systems){try{sys.restore?.(systems[name]);}catch{/* a broken part is ignored */}}
    this.updateLight();
    this.freshWorld=false;this.restored=true;this.lastScore=-1;
    this.events.emit('modeChanged',{mode:this.settings.mode});this.events.emit('settingsChanged',{settings:this.settings});
    this.events.emit('restored',{});
    this.context.setStatus(`Saved world ready: day ${this.time.day}, ${this.stats.mined} blocks mined.`);
    this.schedule();
  }
  // ---- Online play ----------------------------------------------------------------------------------
  /** What the shell saves: online, the single-player world kept aside (the shared world has its own save). */
  shellSerialize():unknown{return this.net.kept??this.serialize();}
  shellRestore(value:unknown){if(this.net.kept!==null)this.net.keep(value);else this.restore(value);}
  private netHooks():NetHooks{
    return{
      serialize:()=>this.serialize(),
      restore:v=>this.restore(v),
      freshWorld:seed=>{
        this.setState('loading');this.ui.close();this.input.clear();this.input.release();
        this.resetWorld(seed);this.hud.showMenu('start');this.schedule();
      },
      loadGuestWorld:w=>this.loadGuestWorld(w),
      setExtraCentres:points=>{this.streamer.setExtraCentres(points,4);if(points.length)this.schedule();},
      hold:on=>{
        if(this.netHeld===on)return;
        this.netHeld=on;
        if(on){if(this.state==='playing'||this.state==='screen')this.toPaused();this.input.clear();this.input.release();}
        else if(this.state==='paused')this.hud.showMenu('resume');
        this.schedule();
      },
      wake:()=>this.schedule(),
      lost:()=>this.state==='lost'
    };
  }
  /** An online guest enters the host's world: same seed and generation, the host's edits, containers, time, weather and
   *  rules, standing where the host put it (with its own items when it played here before). */
  private loadGuestWorld(w:GuestWorld){
    if(this.disposed||this.state==='lost')return;
    this.setState('loading');this.ui.close();this.input.clear();this.input.release();
    this.resetWorld(w.seed);
    this.world.restoreEdits(w.edits);
    try{this.blockEntities.restore?.(w.be);}catch{/* invalid containers are ignored */}
    try{if(w.weather)this.weather.restore?.(w.weather);}catch{/* keep clear weather */}
    if(w.time){const t=w.time;if(t.dayTime>=0&&t.dayTime<DAY_TICKS&&t.day>=1&&t.tick>=0){this.time.tick=t.tick;this.time.dayTime=t.dayTime;this.time.day=t.day;}}
    const patch:Record<string,unknown>={};for(const k of SHARED_SETTINGS)patch[k]=w.settings[k];
    this.updateSettings(sanitizeSettings(patch));
    if(w.record){
      for(const [sys,data] of [[this.player,w.record.player],[this.inventory,w.record.inventory],[this.survival,w.record.survival]] as const)
        if(data)try{sys.restore?.(data);}catch{/* a broken part starts fresh */}
    }
    this.player.teleport(w.you.x,w.you.y,w.you.z);
    this.player.state.spawn={...w.spawn};
    if(this.settings.mode==='survival')this.player.state.flying=false;
    this.updateLight();this.freshWorld=false;this.restored=false;this.lastScore=-1;
    this.events.emit('modeChanged',{mode:this.settings.mode});this.events.emit('settingsChanged',{settings:this.settings});
    this.hud.showMenu('start');
    this.context.setStatus('Joined the shared world. Press Play when it is ready.');
    this.schedule();
  }
  /** The shell's pause stopped play: its resume (a click on Keep playing, Study's Games link, a closed dialog) plays again. */
  private playOnShellResume=false;
  shellPause(){
    if(this.paused)return;
    this.paused=true;cancelAnimationFrame(this.frameId);this.frameId=0;
    const playing=this.state==='playing'||this.state==='screen';
    this.toPaused();this.input.clear();this.input.release();
    this.playOnShellResume=playing&&this.state==='paused';
    this.events.emit('shellPaused',{paused:true});
  }
  shellResume(){
    if(this.disposed||!this.paused)return;
    this.paused=false;this.events.emit('shellPaused',{paused:false});this.schedule();
    // One click resumes, not the shell's Keep playing and then the Game Menu's Resume. The shell calls this from the click,
    // so the pointer lock request is still inside the user gesture.
    const play=this.playOnShellResume&&this.state==='paused';this.playOnShellResume=false;
    if(play)this.play();
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;cancelAnimationFrame(this.frameId);this.frameId=0;this.abort.abort();
    this.streamer.dispose();this.input.release();
    for(const [,s] of [...this.created].reverse()){try{s.dispose?.();}catch{/* keep disposing */}}
    this.events.clear();this.root.remove();
    // Drop the voxel buffers even if something still holds the world.
    this.world.clear();
  }
}

/** The game without WebGL 2. The shell restores the saved world right after mount and saves every 5 s, on pause and on
 *  leave: hand back what was restored, so a visit without 3D graphics never replaces the save. */
export function fallbackInstance(dispose:()=>void):GameInstance{
  let kept:unknown=null;
  return{pause(){},resume(){},restart(){},serialize:()=>kept,restore(v){kept=v;},dispose};
}

export function mountEngine(container:HTMLElement,context:GameContext):GameInstance{
  let engine:Engine;
  try{engine=new Engine(container,context);}
  catch{
    container.querySelector('.blockcraft')?.remove();
    const root=document.createElement('div');root.className='blockcraft';
    root.innerHTML='<div class="bc-fallback" role="status"><h2>3D graphics unavailable</h2><p>Blockcraft needs WebGL 2. Enable browser hardware acceleration or try a recent browser.</p><a class="game-button" href="#/">Choose another game</a></div>';
    container.append(root);context.setStatus('This browser could not create a WebGL 2 renderer.');
    return fallbackInstance(()=>root.remove());
  }
  return{
    pause:()=>engine.shellPause(),resume:()=>engine.shellResume(),restart:()=>engine.restart(),
    serialize:()=>engine.shellSerialize(),restore:v=>engine.shellRestore(v),dispose:()=>engine.dispose()
  };
}
