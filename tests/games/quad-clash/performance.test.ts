import {test,expect} from 'vitest';
import * as THREE from 'three';
import {QUALITY,RenderPacer,renderRatio,isQuality} from '../../../src/games/quad-clash/performance';
import {createEffects} from '../../../src/games/quad-clash/effects';
import {createKit,batchStaticMeshes} from '../../../src/games/quad-clash/models';

test('both presets retain native 1080p and the same bounded high-DPI resolution',()=>{
 for(const [w,h,dpr] of [[1280,720,1],[1920,1080,1],[2560,1440,2],[3840,2160,3],[390,844,3]]) {
  const r=renderRatio(w,h,dpr,'potato');
  expect(w*h*r*r).toBeLessThanOrEqual(QUALITY.potato.maxPixels+1);
  expect(r).toBeLessThanOrEqual(2);expect(r).toBeGreaterThan(0);
  expect(r).toBe(renderRatio(w,h,dpr,'balanced'));
 }
 expect(renderRatio(1920,1080,1,'potato')).toBe(1);
 expect(renderRatio(1440,900,1,'potato')).toBe(1);
 expect(renderRatio(390,844,3,'potato')).toBe(2);
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


test('Potato changes the render target without cutting texture, lighting or effect quality',()=>{
 const {fps:slow,name:slowName,...potato}=QUALITY.potato;
 const {fps:fast,name:fastName,...balanced}=QUALITY.balanced;
 expect(potato).toEqual(balanced);expect(potato.shadows).toBe(true);expect(potato.effects).toBe(1);
 expect(slow).toBe(30);expect(fast).toBe(60);expect(slowName).not.toBe(fastName);
});
