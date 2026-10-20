// The engine: creates every service, runs the fixed-tick world and per-frame rendering, owns the
// state machine (loading → ready → playing ⇄ screen ⇄ paused, dead, lost) and persistence.
import type {GameContext,GameInstance} from '../../../core/types';
import {CH,CS,DAY_TICKS,TPS,chunkKey} from './constants';
import {EventBus} from './events';
import {VIEW_DISTANCES,type BlockEntityService,type CraftingService,type Difficulty,type EngineState,type EntityService,type Game,type GameEvents,
  type GameMode,type GameSettings,type GameTime,type HudService,type InputService,type InteractionService,type PlayerService,type RenderService,
  type SoundService,type SurvivalService,type System,type TerrainService,type UIService,type BlockTickService,type InventoryService,type WeatherService} from './contracts';
import {ChunkStreamer} from './streaming';
import {bodyCollides} from './physics';
import {mulberry32} from '../world/noise';
import {VoxelWorld} from '../world/world';
import {createTerrain} from '../world/terrain';
import {createLightEngine} from '../world/light';
import {createBlockEntities} from '../world/blockentities';
import {createBlockTicks} from '../world/ticks';
import {createMesher} from '../render/mesher';
import {createRenderer} from '../render/renderer';
import {createInput} from '../player/input';
import {createPlayer,HALF_WIDTH,HEIGHT} from '../player/player';
import {createSurvival} from '../player/survival';
import {createInventory} from '../items/inventory';
import {createCrafting} from '../items/crafting';
import {createEntities} from '../entity/entities';
import {registerPassiveMobs} from '../entity/passive';
import {registerHostileMobs} from '../entity/hostile';
import {createInteraction} from '../interact/interaction';
import {createSounds} from '../audio/sounds';
import {createUI} from '../ui/screens';
import {createHud} from '../ui/hud';
import {createWeather} from '../world/weather';
import {createAdvancements} from '../ui/advancements';

export const SNAPSHOT_VERSION=2;
const DEFAULT_SEED=0x51ab1e;
const nextSeed=(seed:number)=>(Math.imul(seed^0x9e3779b9,0x85ebca6b)>>>0)||1;
const MODES:GameMode[]=['survival','creative'],DIFFICULTIES:Difficulty[]=['peaceful','easy','normal','hard'];

export function daylightAt(dayTime:number){
  // 1 through the day, 0 at night, with dawn and dusk transitions around 0 and 12000.
  return Math.max(0,Math.min(1,Math.cos((dayTime-6000)/DAY_TICKS*Math.PI*2)*2+.5));
}

export class Engine implements Game{
  readonly events=new EventBus<GameEvents>();
  readonly settings:GameSettings={mode:'survival',difficulty:'normal',view:1,sensitivity:1,keepInventory:false,daylightCycle:true};
  readonly time:GameTime={tick:0,dayTime:1000,day:1,daylight:1};
  readonly stats={mined:0,placed:0,kills:0,deaths:0};
  readonly root:HTMLElement;readonly canvas:HTMLCanvasElement;
  state:EngineState='loading';
  world:VoxelWorld;terrain:TerrainService;render:RenderService;input:InputService;player:PlayerService;survival:SurvivalService;
  inventory:InventoryService;crafting:CraftingService;blockEntities:BlockEntityService;entities:EntityService;interaction:InteractionService;
  ticks:BlockTickService;ui:UIService;hud:HudService;sounds:SoundService;weather:WeatherService;private advancements:System;
  private streamer:ChunkStreamer;private systems:[string,System][];
  private seed=DEFAULT_SEED;private rng=mulberry32(DEFAULT_SEED);
  private frameId=0;private last=0;private tickAcc=0;private shellPaused=false;private disposed=false;
  private spawnPending=true;private freshWorld=true;private restored=false;private wasLocked=false;private lastScore=-1;private lastDay=0;
  private abort=new AbortController();
  constructor(container:HTMLElement,readonly context:GameContext){
    this.root=document.createElement('div');this.root.className='blockcraft';
    this.root.innerHTML='<canvas tabindex="0" aria-label="Blockcraft 3D world. W A S D move, Space jump, Shift sneak, double-tap W sprint, mouse look, left click mine or attack, right click place or use, E inventory, 1 to 9 hotbar."></canvas>';
    container.append(this.root);
    this.canvas=this.root.querySelector('canvas')!;
    this.world=new VoxelWorld(this.events,(x,z)=>this.terrain.biomeAt(x,z));
    this.terrain=createTerrain(this.seed);
    this.render=createRenderer(this);// throws without WebGL 2
    this.input=createInput(this);this.player=createPlayer(this);this.survival=createSurvival(this);this.inventory=createInventory(this);
    this.crafting=createCrafting(this);this.blockEntities=createBlockEntities(this);this.entities=createEntities(this);
    this.interaction=createInteraction(this);this.ticks=createBlockTicks(this);this.sounds=createSounds(this);this.weather=createWeather(this);
    this.ui=createUI(this);this.hud=createHud(this);this.advancements=createAdvancements(this);
    registerPassiveMobs(this);registerHostileMobs(this);
    // Tick order: survival, entities, block ticks, block entities, then the rest.
    this.systems=[['survival',this.survival],['entities',this.entities],['ticks',this.ticks],['blockEntities',this.blockEntities],['crafting',this.crafting],
      ['inventory',this.inventory],['interaction',this.interaction],['player',this.player],['weather',this.weather],['advancements',this.advancements],['terrain',this.terrain],['input',this.input],['ui',this.ui],['hud',this.hud],['sounds',this.sounds],['render',this.render]];
    this.streamer=new ChunkStreamer(this.world,()=>this.terrain,createLightEngine(),createMesher(),this.render,()=>this.schedule());
    this.root.dataset.workers=String(this.streamer.workerCount);
    const signal=this.abort.signal;
    document.addEventListener('pointerlockchange',()=>{
      const locked=document.pointerLockElement===this.canvas;
      // The browser released the mouse (Escape): pause, unless a screen or menu did it.
      if(this.wasLocked&&!locked&&this.state==='playing')this.toPaused();
      this.wasLocked=locked;this.root.dataset.locked=String(locked);
    },{signal});
    this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.contextLost();},{signal});
    this.events.on('playerDied',({message})=>{
      this.stats.deaths++;this.ui.close();this.input.clear();this.input.release();this.setState('dead');this.hud.showMenu('dead');
      this.context.announce(message);this.context.setStatus(message);
    });
    this.events.on('entityDied',({source})=>{if(source.kind==='player')this.stats.kills++;});
    for(const [,s] of this.systems)s.init?.();
    this.setView(this.settings.view);
    this.resetWorld(this.seed);
    this.hud.showMenu('start');
    this.schedule();
    if(import.meta.env.DEV)(window as unknown as {blockcraft?:Engine}).blockcraft=this;
  }
  get reducedMotion(){return this.context.settings.reducedMotion;}
  random(){return this.rng();}
  private setState(to:EngineState){const from=this.state;if(from===to)return;this.state=to;this.root.dataset.phase=to;this.events.emit('stateChanged',{from,to});this.schedule();}

  // ---- State transitions --------------------------------------------------------------------
  play(){
    if(this.disposed||this.state==='lost'||this.state==='loading'||this.shellPaused)return;
    if(this.state==='dead')return;// respawn first
    this.hud.showMenu(null);this.setState('playing');this.canvas.focus({preventScroll:true});this.input.capture();
    this.context.setStatus(this.input.touch?'Drag to look. Hold to mine, tap to place.':'Mouse looks once captured. Left click mines, right click places, E opens the inventory.');
  }
  screenChanged(open:boolean){
    if(open){if(this.state!=='playing')return;this.input.clear();this.setState('screen');this.input.release();}
    else if(this.state==='screen'){this.setState('playing');this.input.capture();}
  }
  private toPaused(){
    if(this.state!=='playing'&&this.state!=='screen')return;
    this.ui.close();this.input.clear();this.setState('paused');this.input.release();this.hud.showMenu('resume');
  }
  private contextLost(){
    if(this.disposed)return;
    this.ui.close();this.input.clear();this.setState('lost');this.input.release();cancelAnimationFrame(this.frameId);this.frameId=0;
    this.hud.showMenu('lost');this.context.save(this.serialize());this.context.setStatus('Graphics context lost. Leave and reopen the game.');
  }
  setMode(mode:GameMode){if(this.settings.mode===mode)return;this.settings.mode=mode;if(mode==='survival')this.player.state.flying=false;this.events.emit('modeChanged',{mode});}
  setViewDistance(index:number){this.setView(index);}
  private setView(index:number){this.settings.view=Math.max(0,Math.min(VIEW_DISTANCES.length-1,index));this.render.setViewDistance(VIEW_DISTANCES[this.settings.view]);this.root.dataset.view=String(VIEW_DISTANCES[this.settings.view]);this.schedule();}

  // ---- Loop ---------------------------------------------------------------------------------
  private schedule(){if(!this.frameId&&!this.disposed&&!this.shellPaused&&this.state!=='lost'){this.last=0;this.frameId=requestAnimationFrame(t=>this.loop(t));}}
  private loop(time:number){
    this.frameId=0;if(this.disposed||this.shellPaused||this.state==='lost')return;
    const dt=Math.min(.1,this.last?(time-this.last)/1000:1/60);this.last=time;
    const p=this.player.state;
    this.streamer.setCentre(p.x,p.z,VIEW_DISTANCES[this.settings.view]);
    const built=this.streamer.update();
    if(this.spawnPending)this.trySpawn();
    const running=this.state==='playing'||this.state==='screen';
    if(running){
      this.tickAcc+=dt;
      while(this.tickAcc>=1/TPS){this.tickAcc-=1/TPS;this.tick();}
    }else this.tickAcc=0;
    for(const s of [this.input,this.player,this.interaction,this.entities,this.survival,this.blockEntities,this.ticks,this.weather,this.ui,this.hud,this.advancements,this.sounds,this.render])s.frame?.(dt);
    this.render.render();
    this.report(built);
    if(running||this.streamer.busy||this.spawnPending||built)this.schedule();
  }
  private tick(){
    const t=this.time;t.tick++;
    if(this.settings.daylightCycle){t.dayTime=(t.dayTime+1)%DAY_TICKS;if(t.dayTime===0)t.day++;}
    t.daylight=daylightAt(t.dayTime);this.world.skyDarkening=Math.round((1-t.daylight)*11);
    for(const [,s] of this.systems)s.tick?.();
  }
  private report(built:number){
    const d=this.root.dataset,p=this.player.state;
    d.x=p.x.toFixed(2);d.y=p.y.toFixed(2);d.z=p.z.toFixed(2);d.yaw=p.yaw.toFixed(3);d.grounded=String(p.onGround);
    d.chunks=String(this.world.chunks.size);d.meshes=String(this.streamer.meshedCount);d.ready=String(!this.spawnPending);
    d.mined=String(this.stats.mined);d.placed=String(this.stats.placed);d.slot=String(this.inventory.selected);d.mode=this.settings.mode;
    d.health=String(this.survival.health);d.dayTime=String(this.time.dayTime);
    const t=this.interaction.target;d.target=t?`${t.x},${t.y},${t.z}`:'';
    if(built||this.state==='playing'){const r=this.render.info();d.drawCalls=String(r.drawCalls);d.triangles=String(r.triangles);d.scale=this.render.resolutionScale.toFixed(2);}
    if(this.stats.mined!==this.lastScore){this.lastScore=this.stats.mined;this.context.setScore(this.stats.mined);}
    if(this.time.day!==this.lastDay){this.lastDay=this.time.day;this.context.setLevel(`Day ${this.time.day}`);}
  }
  /** Waits until the player's chunk and all eight neighbours exist, so collision is exact. */
  private trySpawn(){
    const p=this.player.state,cx=Math.floor(p.x/CS),cz=Math.floor(p.z/CS);
    if(!this.streamer.hasNeighbours(cx,cz)||!this.world.chunk(cx,cz)||!this.streamer.meshedCount)return;
    if(!this.world.chunks.has(chunkKey(cx,cz)))return;
    for(let i=0;i<CH&&bodyCollides(this.world,p,HALF_WIDTH,HEIGHT);i++)p.y+=1;
    if(this.freshWorld){p.spawn={x:p.x,y:p.y,z:p.z};this.freshWorld=false;}
    this.spawnPending=false;
    if(this.state==='loading'){this.setState('ready');this.hud.showMenu(this.restored?'resume':'start');}
  }

  // ---- World lifecycle ----------------------------------------------------------------------
  private resetWorld(seed:number){
    this.seed=seed>>>0;this.rng=mulberry32(this.seed^0xa5a5a5a5);
    this.streamer.clear();this.world.clear();this.terrain=createTerrain(this.seed);
    for(const [,s] of this.systems)s.reset?.();
    Object.assign(this.time,{tick:0,dayTime:1000,day:1,daylight:1});Object.assign(this.stats,{mined:0,placed:0,kills:0,deaths:0});
    const s=this.terrain.spawnPoint();this.player.teleport(s.x,s.y,s.z);this.player.state.spawn={...s};this.player.state.bedSpawn=null;
    this.spawnPending=true;this.freshWorld=true;this.restored=false;this.lastScore=-1;this.lastDay=0;
    if(this.state!=='lost')this.setState('loading');
    this.events.emit('worldReset',{});
  }
  restart(){
    if(this.state==='lost')return;
    this.ui.close();this.input.clear();this.input.release();
    this.resetWorld(nextSeed(this.seed));this.hud.showMenu('start');
    this.context.setStatus('A fresh world. Press Play when it is ready.');this.context.save(this.serialize());this.schedule();
  }
  serialize():unknown{
    const systems:Record<string,unknown>={};
    for(const [name,s] of this.systems){const v=s.serialize?.();if(v!==undefined)systems[name]=v;}
    return{version:SNAPSHOT_VERSION,seed:this.seed,settings:{...this.settings},time:{tick:this.time.tick,dayTime:this.time.dayTime,day:this.time.day},
      stats:{...this.stats},edits:this.world.serializeEdits(),systems};
  }
  restore(value:unknown){
    if(!value||typeof value!=='object')return;
    const v=value as Record<string,unknown>;
    if(v.version!==SNAPSHOT_VERSION||!Number.isInteger(v.seed)||(v.seed as number)<0||(v.seed as number)>0xffffffff)return;
    const probe=new VoxelWorld();if(!probe.restoreEdits(v.edits))return;
    this.ui.close();this.input.clear();this.input.release();
    this.resetWorld(v.seed as number);this.world.restoreEdits(v.edits);
    const st=v.settings as Partial<GameSettings>|undefined;
    if(st){
      if(MODES.includes(st.mode as GameMode))this.settings.mode=st.mode as GameMode;
      if(DIFFICULTIES.includes(st.difficulty as Difficulty))this.settings.difficulty=st.difficulty as Difficulty;
      if(Number.isInteger(st.view))this.setView(st.view as number);
      if(typeof st.sensitivity==='number'&&st.sensitivity>=.1&&st.sensitivity<=4)this.settings.sensitivity=st.sensitivity;
      if(typeof st.keepInventory==='boolean')this.settings.keepInventory=st.keepInventory;
      if(typeof st.daylightCycle==='boolean')this.settings.daylightCycle=st.daylightCycle;
    }
    const t=v.time as Partial<GameTime>|undefined;
    if(t&&Number.isInteger(t.tick)&&Number.isInteger(t.dayTime)&&Number.isInteger(t.day)&&t.dayTime!>=0&&t.dayTime!<DAY_TICKS&&t.day!>=1&&t.tick!>=0){
      this.time.tick=t.tick!;this.time.dayTime=t.dayTime!;this.time.day=t.day!;this.time.daylight=daylightAt(t.dayTime!);
    }
    const s=v.stats as Partial<Game['stats']>|undefined;
    if(s)for(const k of ['mined','placed','kills','deaths'] as const)if(Number.isInteger(s[k])&&s[k]!>=0)this.stats[k]=s[k]!;
    const systems=(v.systems&&typeof v.systems==='object'?v.systems:{}) as Record<string,unknown>;
    for(const [name,sys] of this.systems)if(name in systems){try{sys.restore?.(systems[name]);}catch{/* a broken part is ignored */}}
    this.freshWorld=false;this.restored=true;this.lastScore=-1;
    this.events.emit('modeChanged',{mode:this.settings.mode});
    this.context.setStatus(`Saved world ready: day ${this.time.day}, ${this.stats.mined} blocks mined.`);
    this.schedule();
  }
  shellPause(){
    this.shellPaused=true;cancelAnimationFrame(this.frameId);this.frameId=0;
    this.toPaused();this.input.clear();this.input.release();
  }
  shellResume(){if(this.disposed)return;this.shellPaused=false;this.schedule();}
  dispose(){
    if(this.disposed)return;this.disposed=true;cancelAnimationFrame(this.frameId);this.frameId=0;this.abort.abort();
    this.streamer.dispose();this.input.release();
    for(const [,s] of [...this.systems].reverse()){try{s.dispose?.();}catch{/* keep disposing */}}
    this.events.clear();this.root.remove();
  }
}

export function mountEngine(container:HTMLElement,context:GameContext):GameInstance{
  let engine:Engine;
  try{engine=new Engine(container,context);}
  catch{
    container.querySelector('.blockcraft')?.remove();
    const root=document.createElement('div');root.className='blockcraft';
    root.innerHTML='<div class="bc-fallback" role="status"><h2>3D graphics unavailable</h2><p>Blockcraft needs WebGL 2. Enable browser hardware acceleration or try a recent browser.</p><a class="game-button" href="#/">Choose another game</a></div>';
    container.append(root);context.setStatus('This browser could not create a WebGL 2 renderer.');
    return{pause(){},resume(){},restart(){},serialize:()=>null,restore(){},dispose(){root.remove();}};
  }
  return{
    pause:()=>engine.shellPause(),resume:()=>engine.shellResume(),restart:()=>engine.restart(),
    serialize:()=>engine.serialize(),restore:v=>engine.restore(v),dispose:()=>engine.dispose()
  };
}
