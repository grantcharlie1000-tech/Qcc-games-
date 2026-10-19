import{describe,it,expect}from'vitest';import{readFileSync}from'node:fs';
import Matter from'matter-js';
import{frameCamera}from'../../../src/games/animal-stack/framing';
import{AnimalWorld,createAnimal,KINDS,WIDTH,HEIGHT,FLOOR}from'../../../src/games/animal-stack/model';
const saved=JSON.parse(readFileSync(new URL('./tall-run.json',import.meta.url),'utf8'));
describe('render-only tall-stack framing',()=>{
 it('restores a real seed51 five-animal settled run without geometry changes',()=>{const w=new AnimalWorld(51);for(let n=0;n<5;n++){expect(w.drop()).toBe(true);for(let tick=0;tick<600;tick++)w.step();}expect(w.over).toBe(false);expect(w.snapshot()).toEqual(saved);expect(w.supportedCount).toBe(5);w.dispose();});
 for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1366,height:768}])it(`keeps every waiting cutout/rotation below HUD in ${viewport.width}×${viewport.height}`,()=>{const w=new AnimalWorld();expect(w.restore(saved)).toBe(true);const before=w.snapshot(),width=Math.min(viewport.width,viewport.height*.54),scale=Math.min(width/WIDTH,viewport.height/HEIGHT),top=viewport.height*.73-FLOOR*scale;for(const kind of KINDS)for(const angle of [0,Math.PI/4,Math.PI/2,Math.PI,Math.PI*1.5]){const p=createAnimal(kind,w.aimX,w.spawnY);Matter.Body.setAngle(p.body,angle);for(const immediate of [false,true]){const camera=frameCamera({previous:0,stackTop:w.cameraTop,cutoutTop:p.body.bounds.min.y,top,scale,immediate});expect(top+(p.body.bounds.min.y-4+camera)*scale,`${kind} ${angle}`).toBeGreaterThanOrEqual(84-1e-9);}}expect(w.snapshot()).toEqual(before);w.dispose();});
 it('leaves the ordinary initial landscape scene camera unchanged',()=>{const w=new AnimalWorld(),p=createAnimal(w.nextKind,w.aimX,w.spawnY);expect(frameCamera({previous:0,stackTop:w.cameraTop,cutoutTop:p.body.bounds.min.y,top:0,scale:390/HEIGHT,immediate:false})).toBe(0);w.dispose();});
});
