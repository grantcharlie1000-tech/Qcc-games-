import {afterEach,expect,it,vi} from 'vitest';
import {FrontSide,Matrix4,Vector3} from 'three';
import type * as Three from 'three';
import {writeFileSync,mkdirSync} from 'node:fs';
import {performance} from 'node:perf_hooks';

// Only replace the unavailable GPU/context boundary. The real scene, instance
// buffers, voxel builders, camera, terrain and animation all execute unchanged.
const observed=vi.hoisted(()=>({scene:null as Three.Scene|null,camera:null as Three.Camera|null}));
vi.mock('three',async()=>{
  const actual=await vi.importActual<typeof Three>('three');
  return {...actual,WebGLRenderer:class {
    readonly shadowMap={enabled:false};
    readonly info={render:{calls:0,triangles:0},memory:{geometries:0,textures:0},programs:[]};
    private ratio=1;
    constructor(private options:{canvas:HTMLCanvasElement}){}
    setClearColor(){} getPixelRatio(){return this.ratio;}
    setDrawingBufferSize(w:number,h:number,r:number){this.ratio=r;this.options.canvas.width=Math.floor(w*r);this.options.canvas.height=Math.floor(h*r);}
    compile(){} dispose(){} forceContextLoss(){}
    render(scene:Three.Scene,camera:Three.Camera){
      observed.scene=scene;observed.camera=camera;let calls=0,triangles=0;
      const geometries=new Set<Three.BufferGeometry>();
      scene.traverse(object=>{
        const mesh=object as Three.InstancedMesh;
        if(!mesh.isMesh||!mesh.visible)return;
        const count=mesh.isInstancedMesh?mesh.count:1;
        calls++;triangles+=(mesh.geometry.index?.count??mesh.geometry.getAttribute('position').count)/3*count;geometries.add(mesh.geometry);
      });
      this.info.render={calls,triangles};this.info.memory.geometries=geometries.size;
    }
  }};
});
const {createScene}=await import(process.env.CROSSY_BASELINE_SCENE || '../../../src/games/crossy-road/scene');
import {AHEAD_ROWS,BEHIND_ROWS, type SceneFrame} from '../../../src/games/crossy-road/config';
import {World} from '../../../src/games/crossy-road/world';
import {createRun,pose} from '../../../src/games/crossy-road/rules';


afterEach(()=>vi.unstubAllGlobals());
function setup(width=1366,height=768,seed=11){
  vi.stubGlobal('window',{devicePixelRatio:1});
  const canvas={clientWidth:width,clientHeight:height,width,height} as HTMLCanvasElement;
  const scene=createScene(canvas),state=createRun(seed),world=new World(seed);
  const frame:SceneFrame={state,world,pose:pose(state),dt:1/60,reducedMotion:false,colorBlind:false,ufoWarn:false};
  scene.render(frame);
  return {scene,frame};
}
function ground(){return observed.scene!.children.find(o=>(o as Three.InstancedMesh).instanceMatrix?.count===6400) as Three.InstancedMesh;}

it('keeps static terrain buffers unchanged while water, snow and traffic animate',()=>{
  const {scene,frame}=setup();
  try{
    const terrain=ground(),version=terrain.instanceMatrix.version;
    frame.state.t+=1/60;scene.render(frame);
    expect(terrain.instanceMatrix.version).toBe(version);
  }finally{scene.dispose();}
});

it('invalidates cached terrain for replacements, restarts, origin shifts and resize',()=>{
  const {scene,frame}=setup();
  try{
    const terrain=ground();let version=terrain.instanceMatrix.version;
    (frame.world as World).override([{kind:'rail',row:0,dir:1,speed:20,length:14,period:9,phase:0,color:0}]);
    scene.render(frame);expect(terrain.instanceMatrix.version).toBeGreaterThan(version);version=terrain.instanceMatrix.version;
    scene.resize(390,844);scene.render(frame);expect(terrain.instanceMatrix.version).toBeGreaterThan(version);version=terrain.instanceMatrix.version;
    frame.pose.x=1000;scene.reset();scene.render(frame);expect(terrain.instanceMatrix.version).toBeGreaterThan(version);version=terrain.instanceMatrix.version;
    frame.world=new World(22);frame.pose.x=4;scene.reset();scene.render(frame);expect(terrain.instanceMatrix.version).toBeGreaterThan(version);
  }finally{scene.dispose();}
});

it('continues animating water and vehicles while retaining the static terrain',()=>{
  const {scene,frame}=setup();
  try{
    const meshes=observed.scene!.children.filter(o=>(o as Three.InstancedMesh).isInstancedMesh) as Three.InstancedMesh[];
    const water=meshes.find(m=>m.instanceMatrix.count===640)!;
    const vehicles=meshes.filter(m=>m.count>0&&m.geometry.hasAttribute('paint'));
    const waterVersion=water.instanceMatrix.version,versions=vehicles.map(m=>m.instanceMatrix.version);
    frame.state.t+=.1;scene.render(frame);
    expect(water.instanceMatrix.version).toBeGreaterThan(waterVersion);
    expect(vehicles.some((m,i)=>m.instanceMatrix.version>versions[i])).toBe(true);
  }finally{scene.dispose();}
});

it('animated transforms equal a full rebuild after forward and sideways streaming',()=>{
  const {scene,frame}=setup();
  // Terrain intentionally keeps offscreen slack, but animated pools still draw
  // exactly the current window. Water, car bodies and snowfall identify them.
  const snapshot=()=>observed.scene!.children.filter(o=>{
    const m=o as Three.InstancedMesh;
    return m.isInstancedMesh&&(m.instanceMatrix.count===640||m.instanceMatrix.count===220||m.geometry.hasAttribute('paint'));
  }).map(o=>{
    const m=o as Three.InstancedMesh;
    return {count:m.count,matrix:Array.from(m.instanceMatrix.array.slice(0,m.count*16)),color:m.instanceColor?Array.from(m.instanceColor.array.slice(0,m.count*3)):null};
  });
  try{
    frame.dt=100; // Fully settle camera; resets must render exactly this view.
    for(const [x,row] of [[4,0],[4,1],[31.9,12],[32.1,13],[-33,40],[1000,80]]){
      frame.pose.x=x;frame.pose.z=row;frame.state.row=row;frame.state.t+=.03;
      scene.render(frame);const cached=snapshot();
      scene.reset();scene.render(frame);expect(snapshot()).toEqual(cached);
    }
  }finally{scene.dispose();}
});

it('records deterministic scene submission and GPU resource budgets when requested',()=>{
  const samples=[];
  for(const motion of ['stationary','forward','sideways']) for(const [width,height] of [[390,844],[1366,768]]){
    const {scene,frame}=setup(width,height);
    try{
      let uploads=0,bytes=0;
      const versions=new Map<Three.BufferAttribute,number>();
      const sample=()=>observed.scene!.traverse(o=>{
        const mesh=o as Three.InstancedMesh;if(!mesh.isInstancedMesh)return;
        for(const a of [mesh.instanceMatrix,mesh.instanceColor])if(a&&versions.get(a)!==a.version){
          if(versions.has(a)){uploads++;bytes+=a.updateRanges.reduce((n,r)=>n+r.count*4,0);}
          versions.set(a,a.version);
        }
      });
      sample();const started=performance.now();
      for(let i=0;i<600;i++){
        frame.state.t+=1/60;
        if(motion==='forward'){frame.pose.z=i/12;frame.state.row=Math.floor(frame.pose.z);}
        if(motion==='sideways')frame.pose.x=4+i/6;
        scene.render(frame);sample();
      }
      samples.push({motion,width,height,frames:600,cpuMs:performance.now()-started,uploads,uploadBytes:bytes,...scene.stats});
      expect(scene.stats.calls).toBeGreaterThan(0);
    }finally{scene.dispose();}
  }
  if(process.env.CROSSY_RESOURCE_REPORT){mkdirSync('tests/games/crossy-road/evidence',{recursive:true});writeFileSync(process.env.CROSSY_RESOURCE_REPORT,JSON.stringify({method:'600 deterministic frames per stationary/forward/sideways scene, seed 11, real scene and buffers; mocked GPU boundary. CPU timings are not browser FPS.',samples},null,2)+'\n');}
});

const rapidSweeps = [0, 240, 600].flatMap(row => [11, 74].flatMap(seed =>
  [390, 1366].map(width => ({row, seed, width, height: width === 390 ? 844 : 768}))));

it.each(rapidSweeps)('bounds terrain uploads during a rapid run from row $row, seed $seed ($width×$height)',({width,height,seed,row})=>{
  const {scene,frame}=setup(width,height,seed);
  try{
    const terrain=ground(),world=frame.world as World;
    const count=120, framesPerRow=7;
    frame.state.started=row>0;
    frame.state.row=row;frame.state.maxRow=row;frame.state.safeLine=Math.max(0,row-4);
    frame.pose.z=row;
    world.ensure(row+AHEAD_ROWS);world.prune(row-BEHIND_ROWS);
    scene.reset();scene.render(frame);
    let updates=0,bytes=0,triangles=0;const timings:number[]=[],uploads:number[]=[],geometry:number[]=[];
    for(let i=1;i<=count*framesPerRow;i++){
      frame.state.t+=1/60;
      frame.pose.z=row+i/framesPerRow;
      frame.state.row=Math.floor(frame.pose.z);
      frame.state.started=true;
      frame.state.maxRow=frame.state.row;
      frame.state.safeLine=Math.max(0,frame.state.row-4);
      if(i%framesPerRow===0){
        world.ensure(frame.state.row+AHEAD_ROWS);
        world.prune(frame.state.row-BEHIND_ROWS);
      }
      const version=terrain.instanceMatrix.version,start=performance.now();
      scene.render(frame);
      timings.push(performance.now()-start);
      const submitted=scene.stats.triangles;
      triangles+=submitted;geometry.push(submitted);
      let upload=0;
      if(terrain.instanceMatrix.version!==version){
        updates++;
        upload=terrain.instanceMatrix.updateRanges.reduce((sum,range)=>sum+range.count*4,0);
      }
      uploads.push(upload);bytes+=upload;
    }
    const quantile=(values:number[],q:number)=>values.sort((a,b)=>a-b)[Math.ceil(values.length*q)-1];
    const p95Upload=quantile(uploads,.95), p99Upload=quantile(uploads,.99);
    if(process.env.CROSSY_RESOURCE_REPORT){
      console.log(JSON.stringify({row,seed,width,updates,bytes,p95Upload,p99Upload,maxUpload:uploads.at(-1),
        triangles:Math.round(triangles/timings.length),p95Triangles:quantile(geometry,.95),maxTriangles:geometry.at(-1),
        p95Ms:quantile(timings,.95),p99Ms:quantile(timings,.99)}));
    }
    // Gates for the full game, not timing assertions on a shared CI host.
    expect(updates).toBeLessThan(count);
    expect(bytes).toBeLessThan(width===390?5_000_000:12_000_000);
    expect(p95Upload).toBeLessThan(width===390?42_000:110_000);
    expect(p99Upload).toBeLessThan(width===390?70_000:179_000);
  }finally{scene.dispose();}
});

it('warm and recentered terrain caches preserve visible projected shadows at the viewport edges',()=>{
  const {scene,frame}=setup(390,844);
  const visibleShadows=()=>{
    const camera=observed.camera!;
    camera.updateMatrixWorld();
    const matrix=new Matrix4(), point=new Vector3(), keys:string[]=[];
    for(const object of observed.scene!.children){
      const mesh=object as Three.InstancedMesh<Three.BufferGeometry,Three.ShaderMaterial>;
      if(!mesh.isInstancedMesh||!mesh.visible||!mesh.material.uniforms?.uFloor||mesh.geometry.hasAttribute('paint')||![320,160,48].includes(mesh.instanceMatrix.count))continue;
      mesh.geometry.computeBoundingBox();
      const {min,max}=mesh.geometry.boundingBox!;
      for(let i=0;i<mesh.count;i++){
        mesh.getMatrixAt(i,matrix);
        let loX=Infinity,loY=Infinity,hiX=-Infinity,hiY=-Infinity;
        for(const x of [min.x,max.x])for(const y of [min.y,max.y])for(const z of [min.z,max.z]){
          // The static tree, rock and post shadow shader projects onto y=.018.
          point.set(x,y,z).applyMatrix4(matrix);
          point.x+=point.y*mesh.material.uniforms.uSlope.value;
          point.y=.018;
          point.project(camera);
          loX=Math.min(loX,point.x);hiX=Math.max(hiX,point.x);
          loY=Math.min(loY,point.y);hiY=Math.max(hiY,point.y);
        }
        if(loX<=1&&hiX>=-1&&loY<=1&&hiY>=-1)keys.push(mesh.id+':'+[loX,loY,hiX,hiY].map(v=>v.toFixed(4)).join(','));
      }
    }
    return keys.sort();
  };
  try{
    const samples=[];
    frame.dt=100; // Settle the view immediately for a same-pose comparison.
    for(const [x,z] of [[4,600],[4,601],[4.4,601.25],[-31.5,620],[-31.3,621],[32,650],[32.4,651]]){
      frame.pose.x=x;frame.pose.z=z;frame.state.row=Math.floor(z);
      scene.render(frame);const cached=visibleShadows();
      scene.reset();scene.render(frame);
      expect(visibleShadows()).toEqual(cached);
      samples.push({x,z,shadows:cached});
    }
    if(process.env.CROSSY_SHADOW_REPORT) writeFileSync(process.env.CROSSY_SHADOW_REPORT,JSON.stringify(samples));
  }finally{scene.dispose();}
});

it('submits only camera-facing ground faces with the fixed orthographic camera',()=>{
  const {scene,frame}=setup();
  try{
    const terrain=ground();
    // Use the actual scene mesh, rather than testing an unused geometry helper.
    expect(terrain.geometry.index!.count).toBe(18);
    expect(terrain.geometry.getAttribute('position').count).toBe(12);
    const normals=terrain.geometry.getAttribute('normal');
    expect(new Set(Array.from({length:normals.count},(_,i)=>
      [normals.getX(i),normals.getY(i),normals.getZ(i)].join(',')))).toEqual(new Set(['1,0,0','0,1,0','0,0,1']));
    expect((terrain.material as Three.MeshLambertMaterial).side).toBe(FrontSide);
    expect(terrain.castShadow).toBe(false);
    expect(observed.scene!.children.filter(o=>(o as Three.InstancedMesh).instanceMatrix===terrain.instanceMatrix)).toEqual([terrain]);
    const direction=new Vector3(),matrix=new Matrix4();
    for(const [width,height,x,row] of [[390,844,4,0],[1366,768,-100,240],[2300,600,100,600]]){
      scene.resize(width,height);frame.pose.x=x;frame.pose.z=row;frame.state.row=row;
      scene.reset();scene.render(frame);
      expect((observed.camera as Three.OrthographicCamera).isOrthographicCamera).toBe(true);
      observed.camera!.getWorldDirection(direction);
      expect(direction.x<0&&direction.y<0&&direction.z<0).toBe(true);
      expect(terrain.count).toBeGreaterThan(0);
      for(let i=0;i<terrain.count;i++){
        terrain.getMatrixAt(i,matrix);
        const m=matrix.elements;
        if(!(m[0]>0&&m[5]>0&&m[10]>0&&!m[1]&&!m[2]&&!m[4]&&!m[6]&&!m[8]&&!m[9])) {
          throw new Error('Ground instances must not rotate or reflect the culled faces into view.');
        }
      }
    }
  }finally{scene.dispose();}
});
