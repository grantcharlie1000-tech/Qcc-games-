import {afterEach,expect,it,vi} from 'vitest';
import type * as Three from 'three';
import {writeFileSync,mkdirSync} from 'node:fs';
import {performance} from 'node:perf_hooks';

// Only replace the unavailable GPU/context boundary. The real scene, instance
// buffers, voxel builders, camera, terrain and animation all execute unchanged.
const observed=vi.hoisted(()=>({scene:null as Three.Scene|null}));
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
    render(scene:Three.Scene){
      observed.scene=scene;let calls=0,triangles=0;
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
import {World} from '../../../src/games/crossy-road/world';
import {createRun,pose} from '../../../src/games/crossy-road/rules';
import type {SceneFrame} from '../../../src/games/crossy-road/config';

afterEach(()=>vi.unstubAllGlobals());
function setup(width=1366,height=768){
  vi.stubGlobal('window',{devicePixelRatio:1});
  const canvas={clientWidth:width,clientHeight:height,width,height} as HTMLCanvasElement;
  const scene=createScene(canvas),state=createRun(11),world=new World(11);
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

it('cached transforms equal a full rebuild after forward and sideways streaming',()=>{
  const {scene,frame}=setup();
  const snapshot=()=>observed.scene!.children.filter(o=>(o as Three.InstancedMesh).isInstancedMesh).map(o=>{
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
