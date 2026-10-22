import {describe,expect,test} from 'vitest';
import * as THREE from 'three';
import {sharedUniforms} from '../../../src/games/blockcraft/render/renderer';
import {createFakeGame,type FakeGame} from './helpers/fake-game';
import {B} from '../../../src/games/blockcraft/data/blocks';
import {biomeId} from '../../../src/games/blockcraft/data/biomes';
import {COLUMN_NONE,COLUMN_RAIN,COLUMN_SNOW,DROP_CAP,DROP_RADIUS,DropSim,INSTANCE_FLOATS,KIND_RAIN,KIND_SNOW,KIND_SPLASH,PrecipitationField,
  SPLASH_CAP,visualRandom,type DropFrame} from '../../../src/games/blockcraft/render/weather-drops';
import {BOLT_SEGMENTS,BOLT_SEGMENT_HEIGHT,BOLT_VERTICES,writeBolt} from '../../../src/games/blockcraft/render/weather-bolt';
import {createWeatherVisuals,PRECIPITATION_CAPACITY} from '../../../src/games/blockcraft/render/weather';
import {createWeather} from '../../../src/games/blockcraft/world/weather';
import type {ParticleKind,RenderService,SharedUniforms} from '../../../src/games/blockcraft/engine/contracts';

function world(biome='plains'){
  const game=createFakeGame();game.flat(64,B.grass,2);
  for(const c of game.world.chunks.values())c.biomes.fill(biomeId(biome));
  return game;
}
const frame=(over:Partial<DropFrame>={}):DropFrame=>({dt:1/60,camX:.5,camY:65.6,camZ:.5,originX:0,originY:65,originZ:0,intensity:1,reducedMotion:false,...over});
/** Instances written by the sim as world-space records. */
function instances(sim:DropSim,count:number,f:DropFrame){
  const out:{x:number;y:number;z:number;kind:number;alpha:number}[]=[];
  for(let i=0;i<count;i++){const o=i*INSTANCE_FLOATS;out.push({x:sim.out[o]+f.originX,y:sim.out[o+1]+f.originY,z:sim.out[o+2]+f.originZ,kind:sim.out[o+3],alpha:sim.out[o+6]});}
  return out;
}

describe('precipitation field',()=>{
  test('columns record where rain stops, its surface and rain or snow by biome',()=>{
    const game=world('plains');
    game.world.set(3,70,0,B.stone);game.world.set(4,63,0,B.water);
    const field=new PrecipitationField();field.update(game.world,.5,65.6,.5);
    const at=(x:number,z:number)=>field.index(x,z);
    expect(field.height[at(0,0)]).toBe(64);expect(field.surface[at(0,0)]).toBe(64);expect(field.kind[at(0,0)]).toBe(COLUMN_RAIN);
    expect(field.height[at(3,0)]).toBe(71);
    expect(field.surface[at(4,0)]).toBeCloseTo(63+8/9,5);
    expect(field.update(game.world,.7,65.9,.2)).toBe(false);// same column: no rebuild
    game.world.set(5,66,5,B.stone);field.touch(5,5);
    expect(field.update(game.world,.7,65.9,.2)).toBe(true);
    for(const [biome,kind] of [['snowy_plains',COLUMN_SNOW],['desert',COLUMN_NONE],['badlands',COLUMN_NONE]] as const){
      const g=world(biome),f=new PrecipitationField();f.update(g.world,.5,65.6,.5);expect(f.kind[f.index(0,0)]).toBe(kind);
    }
  });
});

describe('drop simulation',()=>{
  function run(game:FakeGame,seconds:number,over:Partial<DropFrame>={},onLava?:(x:number,y:number,z:number)=>void){
    const field=new PrecipitationField(),sim=new DropSim(visualRandom(1),onLava),f=frame(over);
    field.update(game.world,f.camX,f.camY,f.camZ);
    let n=0;const all:ReturnType<typeof instances>=[];
    // Every frame is simulated; every sixth frame's instances are kept for checks.
    for(let t=0;t<seconds*60;t++){n=sim.update(f,field);if(t%6===5)for(const d of instances(sim,n,f))all.push(d);}
    return{field,sim,n,f,all,last:instances(sim,n,f)};
  }
  test('rain never appears inside covered spaces',()=>{
    const game=world('plains');
    for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++)game.world.set(x,68,z,B.stone);// a roof over the camera
    for(let x=6;x<=11;x++)for(let z=-4;z<=4;z++)game.world.set(x,95,z,B.stone);// cover above the whole drop box (a cave roof)
    const {all,field}=run(game,3);
    expect(all.length).toBeGreaterThan(10000);
    let outside=0,belowSurface=0,underRoof=0,onRoof=0,inCave=0;
    for(const d of all){
      const i=field.index(d.x,d.z);if(i<0){outside++;continue;}
      if(d.kind===KIND_SPLASH)continue;
      if(d.y<field.surface[i])belowSurface++;
      if(d.x>=-4&&d.x<5&&d.z>=-4&&d.z<5){if(d.y<69)underRoof++;else onRoof++;}
      if(d.x>=6&&d.x<12&&d.z>=-4&&d.z<5)inCave++;
    }
    expect({outside,belowSurface,underRoof,inCave}).toEqual({outside:0,belowSurface:0,underRoof:0,inCave:0});
    expect(onRoof).toBeGreaterThan(100);// rain still falls onto the roof
  });
  test('the drop count follows intensity and stays within the cap; drops wrap around the camera',()=>{
    const game=world('plains');
    const full=run(game,1),half=run(game,1,{intensity:.5}),none=run(game,1,{intensity:0});
    expect(full.sim.drops).toBeGreaterThan(DROP_CAP*.7);expect(full.sim.drops).toBeLessThanOrEqual(DROP_CAP);
    expect(half.sim.drops).toBeLessThanOrEqual(DROP_CAP/2);expect(half.sim.drops).toBeGreaterThan(DROP_CAP*.3);
    expect(none.sim.drops).toBe(0);expect(full.n).toBeLessThanOrEqual(DROP_CAP+SPLASH_CAP);
    for(const d of full.last){expect(Math.abs(d.x-.5)).toBeLessThanOrEqual(DROP_RADIUS+.5);expect(Math.abs(d.z-.5)).toBeLessThanOrEqual(DROP_RADIUS+.5);}
    const reduced=run(game,1,{reducedMotion:true});expect(reduced.sim.drops).toBeLessThanOrEqual(DROP_CAP/2);
  });
  test('rain splashes on the ground; snow falls slowly as flakes; deserts stay dry',()=>{
    const rain=run(world('plains'),2);
    const kinds=new Set(rain.all.map(d=>d.kind));
    expect(kinds.has(KIND_RAIN)).toBe(true);expect(kinds.has(KIND_SPLASH)).toBe(true);expect(kinds.has(KIND_SNOW)).toBe(false);
    const splashes=rain.all.filter(d=>d.kind===KIND_SPLASH);
    for(const s of splashes){expect(s.y).toBeGreaterThanOrEqual(64);expect(s.y).toBeLessThan(65);}
    const snow=run(world('snowy_plains'),2);
    expect(new Set(snow.all.map(d=>d.kind))).toEqual(new Set([KIND_SNOW]));
    const dry=run(world('desert'),1);expect(dry.all).toHaveLength(0);
  });
  test('rain over lava makes smoke instead of splashes',()=>{
    const game=world('plains');
    for(let x=-12;x<=12;x++)for(let z=-12;z<=12;z++)game.world.set(x,63,z,B.lava);
    const smoke:number[]=[];const {all}=run(game,2,{},(_x,y)=>smoke.push(y));
    expect(smoke.length).toBeGreaterThan(2);expect(smoke.length).toBeLessThanOrEqual(9);
    expect(all.filter(d=>d.kind===KIND_SPLASH&&Math.abs(d.x)<=12&&Math.abs(d.z)<=12)).toHaveLength(0);
  });
  test('a paused frame (dt 0) keeps every drop still',()=>{
    const game=world('plains'),field=new PrecipitationField(),sim=new DropSim(visualRandom(3)),f=frame();
    field.update(game.world,f.camX,f.camY,f.camZ);sim.update(f,field);
    const y=[...sim.y];sim.update({...f,dt:0},field);expect([...sim.y]).toEqual(y);
  });
});

describe('lightning bolt geometry',()=>{
  test('a bolt of nested tubes stands on the strike and reaches 128 blocks up',()=>{
    const out=new Float32Array(BOLT_VERTICES*3);
    expect(writeBolt(out,0,10,64,-5,12345)).toBe(BOLT_VERTICES*3);
    let minY=Infinity,maxY=-Infinity;const bottom:number[][]=[];
    for(let i=0;i<out.length;i+=3){
      minY=Math.min(minY,out[i+1]);maxY=Math.max(maxY,out[i+1]);
      if(out[i+1]===64)bottom.push([out[i],out[i+2]]);
    }
    expect(minY).toBe(64);expect(maxY).toBe(64+BOLT_SEGMENTS*BOLT_SEGMENT_HEIGHT);
    for(const [x,z] of bottom){expect(Math.abs(x-10)).toBeLessThan(.7);expect(Math.abs(z+5)).toBeLessThan(.7);}
    const again=new Float32Array(BOLT_VERTICES*3);writeBolt(again,0,10,64,-5,12345);expect(again).toEqual(out);
    const other=new Float32Array(BOLT_VERTICES*3);writeBolt(other,0,10,64,-5,999);expect(other).not.toEqual(out);
  });
});

describe('weather visuals in a scene',()=>{
  function sceneGame(biome='plains'){
    const game=world(biome);
    const uniforms:SharedUniforms={daylight:{value:1},skyDarkening:{value:0},fogColor:{value:new THREE.Color()},fogNear:{value:60},fogFar:{value:90},time:{value:0},flash:{value:0}};
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.set(.5,65.6,.5);
    const particles:ParticleKind[]=[];
    game.render={...game.render,scene,camera,uniforms,spawnParticles:(kind:ParticleKind)=>{particles.push(kind);}} as unknown as RenderService;
    return{game,scene,camera,uniforms,particles};
  }
  test('rain, snow and splashes are one instanced draw call and bolts one more; fog and light uniforms are shared',()=>{
    const {game,scene,uniforms}=sceneGame();
    const visuals=createWeatherVisuals(game);
    expect(visuals.meshes).toHaveLength(2);for(const m of visuals.meshes)expect(scene.children).toContain(m);
    const [precipitation,bolt]=visuals.meshes;
    visuals.frame(1/60,0,[]);expect(precipitation.visible).toBe(false);expect(bolt.visible).toBe(false);
    for(let i=0;i<90;i++)visuals.frame(1/60,1,[]);
    const geometry=precipitation.geometry as THREE.InstancedBufferGeometry;
    expect(precipitation.visible).toBe(true);expect(geometry.instanceCount).toBeGreaterThan(1000);expect(geometry.instanceCount).toBeLessThanOrEqual(PRECIPITATION_CAPACITY);
    const material=precipitation.material as THREE.RawShaderMaterial;
    expect(material.uniforms.fogColor).toBe(uniforms.fogColor);expect(material.uniforms.daylight).toBe(uniforms.daylight);expect(material.uniforms.flash).toBe(uniforms.flash);
    // Lit by the renderer's lightmap at full sky light and fogged like the chunks; neutral extras without the renderer's.
    expect(material.vertexShader).toContain('bcLightmap(15.,0.,daylight,flash,flicker,nightVision)');
    expect(material.fragmentShader).toContain('bcFog(bcFogDistance(vRel,fogShape),fogNear,fogFar)');
    expect(material.uniforms.flicker.value).toBe(0);expect(material.uniforms.nightVision.value).toBe(0);expect(material.uniforms.fogShape.value).toBe(1);
    expect(material.transparent).toBe(true);expect(material.depthWrite).toBe(false);
    visuals.frame(1/60,1,[{x:3,y:64,z:3,life:2,flashes:1,seed:42}]);
    expect(bolt.visible).toBe(true);expect((bolt.geometry as THREE.BufferGeometry).drawRange.count).toBe(BOLT_VERTICES);
    expect(scene.children.filter(c=>c.visible&&(c as THREE.Mesh).isMesh).length).toBeLessThanOrEqual(2);
    visuals.frame(1/60,1,[]);expect(bolt.visible).toBe(false);
    visuals.dispose();
    for(const m of visuals.meshes)expect(scene.children).not.toContain(m);
  });
  test('with the renderer\'s uniforms the precipitation shares flicker, night vision and the fog shape',()=>{
    const {game}=sceneGame();
    const full=sharedUniforms();game.render={...game.render,uniforms:full} as unknown as RenderService;
    const visuals=createWeatherVisuals(game),material=visuals.meshes[0].material as THREE.RawShaderMaterial;
    for(const k of ['daylight','flash','flicker','nightVision','fogColor','fogNear','fogFar','fogShape'] as const)expect(material.uniforms[k],k).toBe(full[k]);
    visuals.dispose();
  });
  test('the service builds its visuals from game.render and drives them every frame',()=>{
    const {game,scene}=sceneGame('snowy_plains');
    const weather=createWeather(game);game.weather=weather;weather.init?.();
    expect(scene.children.filter(c=>c.name.startsWith('weather-'))).toHaveLength(2);
    weather.set('rain');game.runTicks(120,[weather]);
    for(let i=0;i<60;i++)weather.frame?.(1/60);
    const precipitation=scene.getObjectByName('weather-precipitation') as THREE.Mesh;
    expect(precipitation.visible).toBe(true);
    weather.dispose?.();expect(scene.children.filter(c=>c.name.startsWith('weather-'))).toHaveLength(0);
  });
});
