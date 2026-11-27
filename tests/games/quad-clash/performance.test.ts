import {test,expect} from 'vitest';
import * as THREE from 'three';
import {FLOOR_DISPLAY_HZ,FLOOR_PIXEL_CAP} from '../../../src/perf/floor';
import {QUALITY,RenderPacer,renderRatio,isQuality} from '../../../src/games/quad-clash/performance';
import {createEffects} from '../../../src/games/quad-clash/effects';
import {createKit,batchStaticMeshes} from '../../../src/games/quad-clash/models';

test('potato draws a cheaper picture and both presets stay inside their pixel caps',()=>{
 for(const [w,h,dpr] of [[1280,720,1],[1920,1080,1],[2560,1440,2],[3840,2160,3],[390,844,3]]) {
  const potato=renderRatio(w,h,dpr,'potato'),balanced=renderRatio(w,h,dpr,'balanced');
  expect(potato).toBeLessThanOrEqual(balanced);
  expect(w*h*potato*potato).toBeLessThanOrEqual(QUALITY.potato.maxPixels+1);
  expect(w*h*balanced*balanced).toBeLessThanOrEqual(QUALITY.balanced.maxPixels+1);
  expect(balanced).toBeLessThanOrEqual(2);expect(potato).toBeGreaterThan(0);expect(balanced).toBeGreaterThan(0);
 }
 expect(renderRatio(1920,1080,1,'balanced')).toBe(1);
 expect(renderRatio(1920,1080,1,'potato')).toBeLessThan(1);
 expect(renderRatio(390,844,3,'balanced')).toBe(2);
 expect(renderRatio(390,844,3,'potato')).toBeLessThanOrEqual(1);
 expect(QUALITY.potato.pixelCap).toBeLessThanOrEqual(1);
 expect(isQuality('ultra')).toBe(false);expect(isQuality('potato')).toBe(true);
});

test('idle effects do not upload buffers; bursts expire and budget changes clear them',()=>{
 const texture=new THREE.Texture(),e=createEffects(texture);e.setBudget(.35);
 const points=e.group.children.find(o=>o instanceof THREE.Points) as THREE.Points;
 const conf=e.group.children.find(o=>o instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
 const position=points.geometry.getAttribute('position') as THREE.BufferAttribute;
 const initial=position.version;e.update(1/60,false);
 expect(points.visible).toBe(false);expect(conf.visible).toBe(false);expect(position.version).toBe(initial);
 e.sparks(0,1,0,0,1,0,0xffffff,12);e.confetti(0,1,0,0xffc23d,70);e.update(1/60,false);
 expect(points.visible).toBe(true);expect(conf.visible).toBe(true);expect(conf.count).toBeLessThan(360);
 e.update(5,false);expect(points.visible).toBe(false);expect(conf.visible).toBe(false);
 const expired=position.version;e.update(1/60,false);expect(position.version).toBe(expired);
 e.smoke(0,1,0,10);e.setBudget(1);e.update(1/60,false);expect(points.visible).toBe(false);expect(conf.count).toBe(360);
 e.dispose();texture.dispose();
});

test('batching fixed parts preserves their transformed shape and material',()=>{
 const kit=createKit(),g=new THREE.Group(),mat=kit.mat(0xffffff);
 g.position.set(3,1,2);
 for(let i=0;i<2;i++) {
  const mesh=new THREE.Mesh(kit.geo('unit-box',()=>new THREE.BoxGeometry(1,2,3)),mat);
  mesh.position.set(i*2,0,-i);mesh.rotation.z=i*.4;mesh.scale.set(1+i*.2,1,1);g.add(mesh);
 }
 const before=new THREE.Box3().setFromObject(g);batchStaticMeshes(kit,g,'test');
 const after=new THREE.Box3().setFromObject(g);
 expect(g.children).toHaveLength(1);expect((g.children[0] as THREE.Mesh).material).toBe(mat);
 expect(before.min.distanceTo(after.min)).toBeLessThan(1e-6);expect(before.max.distanceTo(after.max)).toBeLessThan(1e-6);
 kit.dispose();
});


test.each([60,60.01,75,120,144])('30 fps pacing at %s Hz stays capped without double-counting visual time',hz=>{
 const pacer=new RenderPacer();let rendered=0,visual=0,wall=0;
 for(let i=0;i<Math.floor(hz*20);i++) {
  const interval=1/hz;wall+=interval;
  const dt=pacer.next(interval,30);if(dt>0){rendered++;visual+=dt;}
 }
 expect(rendered).toBeLessThanOrEqual(Math.ceil(wall*30));expect(rendered).toBeGreaterThan(wall*30-2);
 expect(visual).toBeLessThanOrEqual(wall+1e-8);expect(wall-visual).toBeLessThan(1/30+1/hz);
});
test('jitter and resuming do not cause catch-up render bursts or retain paused visual time',()=>{
 const pacer=new RenderPacer();let rendered=0,visual=0,wall=0;
 for(let i=0;i<1200;i++) {const interval=[.0167,.0166,.0167][i%3];wall+=interval;const dt=pacer.next(interval,30);if(dt){rendered++;visual+=dt;}}
 expect(rendered).toBeLessThanOrEqual(Math.ceil(wall*30));expect(visual).toBeLessThanOrEqual(wall+1e-8);
 pacer.next(.02,30);pacer.reset();expect(pacer.next(.016,30)).toBe(0);expect(pacer.next(.018,30)).toBeCloseTo(.034);
 pacer.next(1,30);expect(pacer.next(.001,30)).toBe(0);
});


test('Potato displays at 60 with a cheaper picture than balanced',()=>{
 expect(QUALITY.potato.fps).toBe(FLOOR_DISPLAY_HZ);expect(QUALITY.balanced.fps).toBe(FLOOR_DISPLAY_HZ);
 expect(QUALITY.potato.shadows).toBe(false);expect(QUALITY.balanced.shadows).toBe(true);
 expect(QUALITY.potato.effects).toBeLessThan(QUALITY.balanced.effects);
 expect(QUALITY.potato.maxPixels).toBe(FLOOR_PIXEL_CAP);
 expect(QUALITY.potato.maxPixels).toBeLessThan(QUALITY.balanced.maxPixels);
 expect(QUALITY.potato.textureSize).toBe(QUALITY.balanced.textureSize);
 expect(QUALITY.potato.anisotropy).toBe(QUALITY.balanced.anisotropy);
 expect(QUALITY.potato.name).not.toBe(QUALITY.balanced.name);
});
