import {describe,expect,test} from 'vitest';
import {createFakeGame,type FakeGame} from './helpers/fake-game';
import {createWeather,type WeatherController} from '../../../src/games/blockcraft/world/weather';
import {isTickingChunk,precipitationHeight} from '../../../src/games/blockcraft/world/weather-columns';
import {WEATHER_EDIT_SHARE,precipitateColumn} from '../../../src/games/blockcraft/world/weather-snow';
import {LIGHTNING_CHANCE,rollStrikeColumn} from '../../../src/games/blockcraft/world/weather-lightning';
import {MAX_EDITS} from '../../../src/games/blockcraft/world/world';
import {RAIN_DELAY} from '../../../src/games/blockcraft/world/weather-cycle';
import {B,blockId} from '../../../src/games/blockcraft/data/blocks';
import {biomeId} from '../../../src/games/blockcraft/data/biomes';
import {CHUNK_VOLUME,CS,voxelIndex} from '../../../src/games/blockcraft/engine/constants';
import type {DamageSource,Entity,EntityCategory,EntityKind,SoundName,Vec3} from '../../../src/games/blockcraft/engine/contracts';

const FIRE=blockId('fire');
/** A flat grass world (ground top y=63) of one biome with a real weather service. */
function setup(biome='plains',options:{height?:number}={}){
  const game=createFakeGame();
  game.flat(options.height??64,B.grass,2);
  setBiome(game,biome);
  const weather=createWeather(game);game.weather=weather;weather.init?.();
  const sounds:{name:SoundName;at:Vec3|null|undefined;volume:number;pitch:number}[]=[];
  game.sounds={play(name,at,o){sounds.push({name,at,volume:o?.volume??1,pitch:o?.pitch??1});},played:[]};
  return{game,weather,sounds};
}
function setBiome(game:FakeGame,name:string){const id=biomeId(name);for(const c of game.world.chunks.values())c.biomes.fill(id);}
const tick=(game:FakeGame,n=1)=>game.runTicks(n,[game.weather]);
function startRain(game:FakeGame,weather:WeatherController,state:'rain'|'thunder'='rain'){weather.set(state,100000);tick(game,110);}

let nextId=1;
function entities(game:FakeGame){
  const list:Entity[]=[],hits:{entity:Entity;amount:number;source:DamageSource}[]=[];
  const add=(kind:string,category:EntityCategory,x:number,y:number,z:number)=>{
    const e={id:nextId++,kind,category,x,y,z,vx:0,vy:0,vz:0,yaw:0,pitch:0,headYaw:0,moveX:0,moveZ:0,jump:false,width:.6,height:1.7,onGround:true,
      inWater:false,inLava:false,collidedH:false,collidedV:false,health:20,maxHealth:20,age:0,hurtTime:0,deathTime:0,removed:false,fire:0,baby:false,data:{}} as Entity;
    list.push(e);return e;
  };
  game.entities={...game.entities,all:()=>list,
    near(x,y,z,r,filter,out=[]){out.length=0;for(const e of list)if(Math.hypot(e.x-x,e.y+e.height/2-y,e.z-z)<=r+2&&(!filter||filter(e)))out.push(e);return out;},
    damage(entity,amount,source){hits.push({entity,amount,source});entity.health-=amount;return true;},
    kind:name=>({kind:name,category:'passive',width:.6,height:1.7,maxHealth:20,fireImmune:false}) as EntityKind};
  return{list,hits,add};
}
function playerHits(game:FakeGame){
  const hits:{amount:number;source:DamageSource}[]=[],ignited:number[]=[];
  game.survival={...game.survival,damage:(amount,source)=>{hits.push({amount,source});return amount;},ignite:s=>{ignited.push(s);}};
  return{hits,ignited};
}

describe('weather service: state and cycle',()=>{
  test('a new world is clear for at least half a day, then the cycle can bring rain',()=>{
    const {game,weather}=setup();
    expect(weather.state).toBe('clear');expect(weather.intensity).toBe(0);
    tick(game,RAIN_DELAY[0]);
    expect(weather.state).toBe('clear');
  });
  test('set() changes the state at once and intensity eases over 100 ticks, darkening the sky',()=>{
    const {game,weather}=setup();
    game.time.dayTime=5999;
    weather.set('rain');
    expect(weather.state).toBe('rain');expect(weather.intensity).toBe(0);
    tick(game,1);expect(weather.intensity).toBeCloseTo(.01,6);
    tick(game,50);expect(weather.intensity).toBeCloseTo(.51,6);
    tick(game,60);expect(weather.intensity).toBe(1);expect(weather.thunder).toBe(0);
    tick(game,1);expect(game.time.skyDarkening).toBe(3);
    weather.set('thunder');tick(game,101);
    expect(weather.state).toBe('thunder');expect(weather.thunder).toBe(1);
    tick(game,1);expect(game.time.skyDarkening).toBe(8);
    weather.set('clear');tick(game,101);
    expect(weather.state).toBe('clear');expect(weather.intensity).toBe(0);expect(weather.thunder).toBe(0);
  });
  test('thunder strength is scaled by the rain level',()=>{
    const {game,weather}=setup();
    weather.set('thunder');tick(game,30);
    expect(weather.thunder).toBeCloseTo(.3*.3,6);
  });
  test('settings.weatherCycle false freezes the current weather',()=>{
    const {game,weather}=setup();
    weather.set('rain',50);game.updateSettings({weatherCycle:false});
    tick(game,400);expect(weather.state).toBe('rain');expect(weather.intensity).toBe(1);
    game.updateSettings({weatherCycle:true});tick(game,60);expect(weather.state).toBe('clear');
  });
  test('set clear without a duration (sleeping) keeps it clear for at least half a day',()=>{
    const {game,weather}=setup();
    weather.set('thunder');tick(game,10);weather.set('clear');
    tick(game,RAIN_DELAY[0]-1);expect(weather.state).toBe('clear');
  });
  test('sleeping in clear weather keeps the countdown, so rain still comes for a player who sleeps every night',()=>{
    const {game,weather}=setup();tick(game,600);
    const cycle=()=>(weather.serialize?.() as {cycle:{rt:number;tt:number;ct:number}}).cycle;
    const before=cycle();
    weather.set('clear');
    expect(cycle()).toEqual(before);
    // The countdown runs out within 7.5 days of awake time even with a set('clear') every 12542 ticks.
    let rained=false;
    for(let day=0;day<15&&!rained;day++){
      for(let t=0;t<12542&&!rained;t+=50){tick(game,50);if(weather.state==='rain'||weather.state==='thunder')rained=true;}
      if(!rained)weather.set('clear');
    }
    expect(rained).toBe(true);
  });
  test('reset() returns to a clear new world',()=>{
    const {game,weather}=setup();startRain(game,weather,'thunder');
    weather.reset?.();
    expect(weather.state).toBe('clear');expect(weather.intensity).toBe(0);expect(weather.thunder).toBe(0);expect(weather.flash).toBe(0);
  });
  test('serialize and restore round-trip; invalid data is ignored without throwing',()=>{
    const {game,weather}=setup();weather.set('thunder',5000);tick(game,40);
    const saved=JSON.parse(JSON.stringify(weather.serialize?.()));
    const other=setup();other.weather.restore?.(saved);
    expect(other.weather.state).toBe('thunder');expect(other.weather.intensity).toBeCloseTo(weather.intensity,6);
    expect(other.weather.serialize?.()).toEqual(weather.serialize?.());
    for(const bad of [null,undefined,42,'rain',[],{cycle:{r:'yes'}},{cycle:null},{cycle:{r:true,t:false,ct:0,rt:-4,tt:0,rl:0,tl:0}}]){
      const s=setup();s.weather.set('rain',300);
      expect(()=>s.weather.restore?.(bad)).not.toThrow();
      expect(s.weather.state).toBe('rain');
    }
  });
  test('calls game.random as a method of the game, never unbound',()=>{
    const {game,weather}=setup('snowy_plains');
    const base=game.random;
    game.random=function(this:unknown){if(this!==game)throw new Error('game.random called unbound');return base();};
    expect(()=>{
      weather.set('thunder');tick(game,300);
      weather.strike(1,64,1);tick(game,20);
      weather.set('clear');weather.set('rain');tick(game,5);
    }).not.toThrow();
  });
  test('works with the fake renderer stub: frames run without a scene',()=>{
    const {game,weather}=setup();startRain(game,weather,'thunder');
    expect(()=>{for(let i=0;i<5;i++)weather.frame?.(1/60);weather.dispose?.();}).not.toThrow();
  });
});

describe('precipitation by biome',()=>{
  test('none while clear',()=>{
    const {weather}=setup('plains');
    expect(weather.precipitationAt(0,0)).toBeNull();expect(weather.isRainingOn(0,64,0)).toBe(false);
  });
  test('rain in temperate biomes, snow in cold ones, nothing in deserts, savannas and badlands',()=>{
    const expected:Record<string,'rain'|'snow'|null>={plains:'rain',forest:'rain',jungle:'rain',ocean:'rain',snowy_plains:'snow',snowy_taiga:'snow',
      frozen_river:'snow',snowy_peaks:'snow',desert:null,savanna:null,badlands:null};
    for(const [biome,kind] of Object.entries(expected)){
      const {game,weather}=setup(biome);startRain(game,weather);
      expect(weather.precipitationAt(0,0),biome).toBe(kind);
      expect(weather.precipitationAt(5,-7,64),biome).toBe(kind);
    }
  });
  test('cold falls with height: windswept hills rain low and snow high',()=>{
    const {game,weather}=setup('mountains');startRain(game,weather);
    expect(weather.precipitationAt(0,0,64)).toBe('rain');
    expect(weather.precipitationAt(0,0,100)).toBe('rain');
    expect(weather.precipitationAt(0,0,120)).toBe('snow');
  });
  test('gameplay counts it as raining only once the level passes 0.2 (vanilla isRaining)',()=>{
    const {game,weather}=setup('plains');
    weather.set('rain');tick(game,20);expect(weather.precipitationAt(0,0)).toBeNull();
    tick(game,2);expect(weather.precipitationAt(0,0)).toBe('rain');
  });
});

describe('sky exposure',()=>{
  test('isRainingOn needs open sky above the block',()=>{
    const {game,weather}=setup('plains');startRain(game,weather);
    expect(weather.isRainingOn(.5,64,.5)).toBe(true);
    expect(weather.isRainingOn(3.2,64.9,-1.7)).toBe(true);
    // A roof (stone, glass or leaves) shelters everything under it.
    for(const [roof,x] of [[B.stone,4],[B.glass,6],[B.oakLeaves,8]] as const){
      game.world.set(x,70,0,roof);
      expect(weather.isRainingOn(x,64,0)).toBe(false);expect(weather.isRainingOn(x,69,0)).toBe(false);
      expect(weather.isRainingOn(x,71,0)).toBe(true);
    }
    // Plants, torches and snow layers do not stop rain.
    game.world.set(10,64,0,B.shortGrass);game.world.set(11,64,0,B.torch);
    expect(weather.isRainingOn(10,64,0)).toBe(true);expect(weather.isRainingOn(11,64,0)).toBe(true);
    // Under water it is not raining on the swimmer.
    game.world.set(12,63,0,B.water);game.world.set(12,62,0,B.water);
    expect(weather.isRainingOn(12,62,0)).toBe(false);expect(weather.isRainingOn(12,64,0)).toBe(true);
    // Unloaded columns are never rained on.
    expect(weather.isRainingOn(500,64,500)).toBe(false);
  });
  test('precipitation height skips plants and stops at solids and liquids',()=>{
    const {game}=setup('plains');
    expect(precipitationHeight(game.world,0,0)).toBe(64);
    game.world.set(0,64,0,B.shortGrass);expect(precipitationHeight(game.world,0,0)).toBe(64);
    game.world.set(0,80,0,B.glass);expect(precipitationHeight(game.world,0,0)).toBe(81);
    game.world.set(1,64,1,B.water);expect(precipitationHeight(game.world,1,1)).toBe(65);
    expect(precipitationHeight(game.world,900,900)).toBe(-1);
  });
  test('it never rains on blocks in snowy, desert or clear columns',()=>{
    for(const biome of ['snowy_plains','desert']){
      const {game,weather}=setup(biome);startRain(game,weather);
      expect(weather.isRainingOn(.5,64,.5)).toBe(false);
    }
    const {game,weather}=setup('plains');weather.set('rain');tick(game,200);weather.set('clear');tick(game,100);
    expect(weather.isRainingOn(.5,64,.5)).toBe(false);
  });
});

describe('snow layers and ice',()=>{
  test('while it snows, snow builds up on exposed tops but not under cover or in warm biomes',()=>{
    const {game,weather}=setup('snowy_plains');
    for(let x=-8;x<8;x++)for(let z=-8;z<8;z++)game.world.set(x,70,z,B.stone);
    tick(game,3000);
    let before=0;for(let x=-40;x<40;x++)for(let z=-40;z<40;z++)if(game.world.get(x,64,z)===B.snow)before++;
    expect(before).toBe(0);// clear weather: nothing
    startRain(game,weather);tick(game,3000);
    let open=0,covered=0,roof=0;
    for(let x=-40;x<40;x++)for(let z=-40;z<40;z++){
      if(game.world.get(x,64,z)!==B.snow)continue;
      if(x>=-8&&x<8&&z>=-8&&z<8)covered++;else open++;
    }
    for(let x=-8;x<8;x++)for(let z=-8;z<8;z++)if(game.world.get(x,71,z)===B.snow)roof++;
    expect(open).toBeGreaterThan(500);expect(covered).toBe(0);expect(roof).toBeGreaterThan(10);
    const warm=setup('plains');startRain(warm.game,warm.weather);tick(warm.game,3000);
    let snow=0;for(let x=-40;x<40;x++)for(let z=-40;z<40;z++)if(warm.game.world.get(x,64,z)===B.snow)snow++;
    expect(snow).toBe(0);
  });
  test('top water sources freeze from the edges inward; flowing water and lit water do not',()=>{
    const {game,weather}=setup('snowy_plains');startRain(game,weather);
    for(let x=0;x<4;x++)for(let z=0;z<4;z++)game.world.set(x,63,z,B.water);
    expect(precipitateColumn(game.world,1,1)).toBeNull();// surrounded by water
    expect(precipitateColumn(game.world,0,1)).toBe('ice');expect(game.world.get(0,63,1)).toBe(B.ice);
    expect(precipitateColumn(game.world,1,1)).toBe('ice');// now next to ice
    game.world.set(10,63,10,blockId('water_3'));
    expect(precipitateColumn(game.world,10,10)).toBeNull();
    game.world.set(20,63,20,B.water);
    const chunk=game.world.chunk(1,1)!;chunk.light=new Uint8Array(CHUNK_VOLUME).fill(0xf0);chunk.light[voxelIndex(4,63,4)]=0xfc;
    expect(precipitateColumn(game.world,20,20)).toBeNull();
    // Warm water never freezes.
    const warm=setup('plains');warm.game.world.set(0,63,0,B.water);expect(precipitateColumn(warm.game.world,0,0)).toBeNull();
    expect(weather.state).toBe('rain');
  });
  test('cold water freezes and snow falls only while it snows (WeatherService contract)',()=>{
    const {game,weather}=setup('snowy_plains');
    for(let x=-30;x<30;x++)for(let z=-30;z<30;z++)game.world.set(x,63,z,B.water);
    const count=()=>{
      let ice=0,snow=0,edgeIce=0;
      for(let x=-30;x<30;x++)for(let z=-30;z<30;z++){
        if(game.world.get(x,63,z)===B.ice){ice++;if(x===-30||x===29||z===-30||z===29)edgeIce++;}
        if(game.world.get(x,64,z)===B.snow)snow++;
      }
      return{ice,snow,edgeIce};
    };
    tick(game,4000);
    expect(weather.state).toBe('clear');expect(count()).toEqual({ice:0,snow:0,edgeIce:0});
    expect(precipitateColumn(game.world,-30,-20,false)).toBeNull();
    expect(game.world.get(-30,63,-20)).toBe(B.water);
    startRain(game,weather);tick(game,4000);
    const {ice,edgeIce}=count();
    expect(ice).toBeGreaterThan(100);expect(edgeIce).toBeGreaterThan(20);
  });
  test('only chunks within 128 blocks of the player get snow and ice',()=>{
    const {game,weather}=setup('snowy_plains');
    game.player.teleport(300.5,64,.5);
    startRain(game,weather);tick(game,3000);
    let changed=0;for(let x=-40;x<40;x++)for(let z=-40;z<40;z++)if(game.world.get(x,64,z)===B.snow)changed++;
    expect(changed).toBe(0);
  });
  test('natural snow and ice leave the last quarter of the edit budget to the player',()=>{
    const {game,weather}=setup('snowy_plains');
    Object.defineProperty(game.world,'editCount',{configurable:true,get:()=>MAX_EDITS*WEATHER_EDIT_SHARE});
    startRain(game,weather);tick(game,2000);
    const snowAt=()=>{let n=0;for(let x=-40;x<40;x++)for(let z=-40;z<40;z++)if(game.world.get(x,64,z)===B.snow)n++;return n;};
    expect(snowAt()).toBe(0);
    Object.defineProperty(game.world,'editCount',{configurable:true,get:()=>MAX_EDITS*WEATHER_EDIT_SHARE-1});
    tick(game,2000);
    expect(snowAt()).toBeGreaterThan(100);
  });
  test('snow needs an air cell on an opaque block (or leaves) with block light below 10',()=>{
    const {game}=setup('snowy_plains');
    expect(precipitateColumn(game.world,3,3)).toBe('snow');expect(game.world.get(3,64,3)).toBe(B.snow);
    expect(precipitateColumn(game.world,3,3)).toBeNull();// already snowy
    game.world.set(5,64,5,B.shortGrass);expect(precipitateColumn(game.world,5,5)).toBeNull();
    game.world.set(6,64,6,B.oakLeaves);expect(precipitateColumn(game.world,6,6)).toBe('snow');expect(game.world.get(6,65,6)).toBe(B.snow);
    game.world.set(7,64,7,B.glass);expect(precipitateColumn(game.world,7,7)).toBeNull();
    const chunk=game.world.chunk(0,0)!;chunk.light=new Uint8Array(CHUNK_VOLUME).fill(0xf0);chunk.light[voxelIndex(9,64,9)]=0xfa;
    expect(precipitateColumn(game.world,9,9)).toBeNull();
  });
});

describe('lightning',()=>{
  test('a strike hurts mobs within 3 blocks for 5 lightning damage, sets them on fire and charges creepers; pigs are unaffected',()=>{
    const {game,weather}=setup('plains');startRain(game,weather);
    const mobs=entities(game);
    const creeper=mobs.add('creeper','hostile',3.5,64,2.5),pig=mobs.add('pig','passive',1.5,64,1.5),zombie=mobs.add('zombie','hostile',20.5,64,.5);
    const item=mobs.add('item','item',2.5,64,2.5),orb=mobs.add('xp_orb','xp',1.5,64,3.5),farItem=mobs.add('item','item',9.5,64,2.5);
    const flyer=mobs.add('chicken','passive',2.5,72,2.5);
    game.player.teleport(40.5,64,.5);
    weather.strike(2,64,2);tick(game,1);
    const hit=mobs.hits.map(h=>h.entity);
    expect(hit).toContain(creeper);expect(hit).toContain(flyer);
    expect(hit).not.toContain(pig);expect(hit).not.toContain(zombie);expect(hit).not.toContain(item);
    for(const h of mobs.hits){expect(h.amount).toBe(5);expect(h.source.kind).toBe('lightning');}
    expect(creeper.data.charged).toBe(true);expect(creeper.fire).toBe(160);
    expect(pig.data.charged).toBeUndefined();expect(pig.fire).toBe(0);expect(zombie.fire).toBe(0);
    // Dropped items and experience orbs (5 health in vanilla) are destroyed by the strike.
    expect(item.removed).toBe(true);expect(orb.removed).toBe(true);expect(farItem.removed).toBe(false);
    expect(weather.flash).toBeGreaterThan(.5);
  });
  test('the player within reach takes lightning damage and catches fire',()=>{
    const {game,weather}=setup('plains');startRain(game,weather);
    const {hits,ignited}=playerHits(game);
    weather.strike(2,64,1);tick(game,1);
    expect(hits[0]).toMatchObject({amount:5,source:{kind:'lightning'}});expect(ignited[0]).toBe(8);
    const far=setup('plains');startRain(far.game,far.weather);const farHits=playerHits(far.game);
    far.weather.strike(30,64,30);tick(far.game,1);expect(farHits.hits).toHaveLength(0);
  });
  test('fire starts at the strike on normal and hard but not on easy',()=>{
    for(const [difficulty,fire] of [['normal',true],['hard',true],['easy',false],['peaceful',false]] as const){
      const {game,weather}=setup('plains');startRain(game,weather);game.updateSettings({difficulty});
      game.player.teleport(40.5,64,.5);
      weather.strike(6,64,6);tick(game,1);
      expect(game.world.get(6,64,6)===FIRE,difficulty).toBe(fire);
    }
  });
  test('fire takes hold where vanilla fire can stay: on a sturdy top or beside something flammable',()=>{
    const {game,weather}=setup('plains');startRain(game,weather);game.player.teleport(60.5,64,.5);
    // A tree canopy: the strike lands on leaves with nothing sturdy below the fire cell.
    for(let x=4;x<=8;x++)for(let z=4;z<=8;z++)game.world.set(x,70,z,B.oakLeaves);
    weather.strike(6,71,6);tick(game,1);
    expect(game.world.get(6,71,6)).toBe(FIRE);
    // A glass roof is neither sturdy for fire nor flammable.
    for(let x=14;x<=18;x++)for(let z=14;z<=18;z++)game.world.set(x,70,z,B.glass);
    weather.strike(16,71,16);tick(game,1);
    for(let x=15;x<=17;x++)for(let y=70;y<=72;y++)for(let z=15;z<=17;z++)expect(game.world.get(x,y,z)).not.toBe(FIRE);
    // A plank wall: fire clings beside it in mid-air.
    for(let y=64;y<=72;y++)game.world.set(24,y,24,B.oakPlanks);
    weather.strike(25,70,24);tick(game,1);
    expect(game.world.get(25,70,24)).toBe(FIRE);
  });
  test('lightning fire uses the fire odds families (world/fire.ts): not beside crafting tables or barrels, beside coal and moss blocks',()=>{
    const {game,weather}=setup('plains');startRain(game,weather);game.player.teleport(90.5,64,.5);
    const column=(x:number,z:number,id:number)=>{for(let y=64;y<=72;y++)game.world.set(x,y,z,id);};
    const cases:[string,boolean][]=[['crafting_table',false],['barrel',false],['coal_block',true],['moss_block',true],['bookshelf',true],['white_wool',true]];
    cases.forEach(([name,burns],i)=>{
      const x=-30+i*12;column(x,-20,blockId(name));
      weather.strike(x+1,70,-20);tick(game,1);
      expect(game.world.get(x+1,70,-20)===FIRE,name).toBe(burns);
    });
  });
  test('thunder is heard after a delay of 1 second per 40 blocks',()=>{
    const {game,weather,sounds}=setup('plains');startRain(game,weather);
    game.player.teleport(.5,64,.5);
    weather.strike(30,64,40);// 50 blocks away: 25 ticks
    tick(game,24);expect(sounds.filter(s=>s.name==='thunder')).toHaveLength(0);
    tick(game,3);
    const thunder=sounds.filter(s=>s.name==='thunder');
    expect(thunder).toHaveLength(1);expect(thunder[0].pitch).toBeGreaterThanOrEqual(.8);expect(thunder[0].pitch).toBeLessThanOrEqual(1);
  });
  test('the flash decays over a few frames and bolts disappear',()=>{
    const {game,weather}=setup('plains');startRain(game,weather);game.player.teleport(40.5,64,.5);
    weather.strike(2,64,2);tick(game,1);
    expect(weather.flash).toBeGreaterThan(.5);expect(weather.bolts.length).toBe(1);
    tick(game,40);for(let i=0;i<30;i++)weather.frame?.(1/60);
    expect(weather.flash).toBeLessThan(.05);expect(weather.bolts.length).toBe(0);
  });
  test('the flash holds between ticks but fades once the world stops ticking (death screen, pause) with a bolt alive',()=>{
    const {game,weather}=setup('plains');startRain(game,weather,'thunder');game.player.teleport(40.5,64,.5);
    weather.strike(2,64,2);tick(game,1);
    for(let i=0;i<3;i++)weather.frame?.(1/60);
    expect(weather.flash).toBe(1);
    game.setState('dead');
    for(let i=0;i<600;i++)weather.frame?.(1/60);
    expect(weather.bolts.length).toBe(1);expect(weather.bolts[0].life).toBeGreaterThanOrEqual(0);
    expect(weather.flash).toBe(0);
  });
  test('lightning ticks the chunks whose centre is within 128 blocks of the player (vanilla), each at 1/100000 per tick',()=>{
    expect(isTickingChunk(0,0,.5,.5)).toBe(true);expect(isTickingChunk(-8,0,.5,.5)).toBe(true);
    expect(isTickingChunk(7,0,.5,.5)).toBe(true);expect(isTickingChunk(8,0,.5,.5)).toBe(false);
    expect(isTickingChunk(5,5,.5,.5)).toBe(true);expect(isTickingChunk(6,6,.5,.5)).toBe(false);
    let ticking=0;for(let cz=-10;cz<=10;cz++)for(let cx=-10;cx<=10;cx++)if(isTickingChunk(cx,cz,.5,.5))ticking++;
    expect(ticking).toBeGreaterThan(190);expect(ticking).toBeLessThan(215);
    let seed=99;const random=()=>{seed=(Math.imul(seed^seed>>>15,0x2c1b3c6d)+0x6d2b79f5)>>>0;return seed/0x100000000;};
    const rolls=2000000;let strikes=0;
    for(let i=0;i<rolls;i++){
      const c=rollStrikeColumn(.5,.5,random);if(!c)continue;strikes++;
      expect(isTickingChunk(Math.floor(c.x/CS),Math.floor(c.z/CS),.5,.5)).toBe(true);
    }
    const expected=rolls*ticking*LIGHTNING_CHANCE;
    expect(strikes).toBeGreaterThan(expected*.85);expect(strikes).toBeLessThan(expected*1.15);
  });
  test('thunderstorms strike near the player at the vanilla rate; never in snowy biomes or plain rain',()=>{
    const count=(biome:string,state:'rain'|'thunder')=>{
      const {game,weather,sounds}=setup(biome);startRain(game,weather,state);playerHits(game);
      tick(game,40000);
      return sounds.filter(s=>s.name==='thunder').length;
    };
    // 25 loaded chunks × 40000 ticks / 100000 = 10 expected strikes.
    const storm=count('plains','thunder');
    expect(storm).toBeGreaterThanOrEqual(2);expect(storm).toBeLessThanOrEqual(30);
    expect(count('snowy_plains','thunder')).toBe(0);
    expect(count('plains','rain')).toBe(0);
  });
});

describe('leaves drip in the rain (vanilla LeavesBlock.animateTick)',()=>{
  /** A leaf canopy at y=70 over x,z in [-12,12], with spawned particles recorded. */
  function canopy(biome='plains'){
    const s=setup(biome);
    for(let x=-12;x<=12;x++)for(let z=-12;z<=12;z++)s.game.world.set(x,70,z,B.oakLeaves);
    const drips:Vec3[]=[];
    s.game.render={...s.game.render,spawnParticles:(kind,x,y,z)=>{if(kind==='drip')drips.push({x,y,z});}};
    return{...s,drips};
  }
  test('leaves rained on drip water from their underside near the player',()=>{
    const {game,weather,drips}=canopy();startRain(game,weather);drips.length=0;
    tick(game,2000);
    // 625 rained-on leaf columns of the 1089 around the player, about 1 drip per column per 550 ticks.
    expect(drips.length).toBeGreaterThan(1000);expect(drips.length).toBeLessThan(4000);
    for(const d of drips){
      expect(d.y).toBeGreaterThan(69.9);expect(d.y).toBeLessThan(70);
      expect(Math.floor(d.x)).toBeGreaterThanOrEqual(-12);expect(Math.floor(d.x)).toBeLessThanOrEqual(12);
      expect(Math.floor(d.z)).toBeGreaterThanOrEqual(-12);expect(Math.floor(d.z)).toBeLessThanOrEqual(12);
    }
  });
  test('no drips in clear weather, under cover, in snow, or onto an opaque block below',()=>{
    const clear=canopy();tick(clear.game,2000);expect(clear.drips).toHaveLength(0);
    const snowy=canopy('snowy_plains');startRain(snowy.game,snowy.weather);snowy.drips.length=0;tick(snowy.game,2000);
    expect(snowy.drips).toHaveLength(0);
    // The west half of the canopy rests on stone: water cannot drip out of it.
    const half=canopy();
    for(let x=-12;x<0;x++)for(let z=-12;z<=12;z++)half.game.world.set(x,69,z,B.stone);
    startRain(half.game,half.weather);half.drips.length=0;tick(half.game,2000);
    expect(half.drips.length).toBeGreaterThan(100);
    for(const d of half.drips)expect(d.x).toBeGreaterThanOrEqual(0);
    const roofed=canopy();
    for(let x=-12;x<=12;x++)for(let z=-12;z<=12;z++)roofed.game.world.set(x,75,z,B.stone);
    startRain(roofed.game,roofed.weather);roofed.drips.length=0;tick(roofed.game,2000);
    expect(roofed.drips).toHaveLength(0);
  });
  test('leaves more than 16 blocks above the player do not drip',()=>{
    const {game,weather,drips}=canopy();
    game.player.teleport(.5,40,.5);
    startRain(game,weather);drips.length=0;tick(game,2000);
    expect(drips).toHaveLength(0);
  });
});

describe('rain sound',()=>{
  test('rain is heard at intervals, following the intensity; none when clear or dry',()=>{
    const {game,weather,sounds}=setup('plains');
    tick(game,200);expect(sounds.filter(s=>s.name==='rain')).toHaveLength(0);
    startRain(game,weather);sounds.length=0;
    tick(game,200);
    const rain=sounds.filter(s=>s.name==='rain');
    expect(rain.length).toBeGreaterThanOrEqual(6);expect(rain.length).toBeLessThanOrEqual(16);
    for(const r of rain){expect(r.volume).toBeCloseTo(1,6);expect(r.at).toBeTruthy();expect(Math.hypot(r.at!.x-.5,r.at!.z-.5)).toBeLessThan(16);}
    const dry=setup('desert');startRain(dry.game,dry.weather);dry.sounds.length=0;tick(dry.game,200);
    expect(dry.sounds.filter(s=>s.name==='rain')).toHaveLength(0);
  });
  test('rain is quieter and muffled when the player is under cover',()=>{
    const {game,weather,sounds}=setup('plains');
    for(let x=-12;x<=12;x++)for(let z=-12;z<=12;z++)game.world.set(x,67,z,B.stone);
    startRain(game,weather);sounds.length=0;tick(game,200);
    const rain=sounds.filter(s=>s.name==='rain');
    expect(rain.length).toBeGreaterThan(0);
    expect(rain.some(r=>r.volume<.6&&r.pitch<.6)).toBe(true);
    expect(rain.every(r=>r.volume<1)).toBe(true);
  });
  test('rain is quieter under a low roof right above the head (a 2-high room)',()=>{
    const {game,weather,sounds}=setup('plains');
    for(let x=-12;x<=12;x++)for(let z=-12;z<=12;z++)game.world.set(x,66,z,B.stone);
    startRain(game,weather);sounds.length=0;tick(game,200);
    const rain=sounds.filter(s=>s.name==='rain');
    expect(rain.length).toBeGreaterThan(0);
    for(const r of rain){expect(r.volume).toBeLessThanOrEqual(.5);expect(r.pitch).toBe(1);}// vanilla rain-above pitch needs a higher roof
  });
});
