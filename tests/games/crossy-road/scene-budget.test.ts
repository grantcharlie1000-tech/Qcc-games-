import {afterEach,expect,it,vi} from 'vitest';
import {Matrix4,Vector3} from 'three';
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

it.each([[390,844],[1366,768]])('avoids repeated static uploads during rapid late-game progress (%sx%s)',(width,height)=>{
  const {scene,frame}=setup(width,height);
  try{
    const terrain=ground();
    const count=120, framesPerRow=7;
    frame.state.started=true;
    // Generate the late course and warm the camera before sampling. Move at close
    // to the game's max rate, with the same lane sequence and pose on every run.
    frame.state.row=600;frame.state.maxRow=600;frame.state.safeLine=596;
    frame.pose.z=600;
    (frame.world as World).ensure(650);(frame.world as World).prune(550);
    scene.reset();scene.render(frame);
    let rebuilds=0,bytes=0,triangles=0;const durations:number[]=[];
    for(let i=1;i<=count*framesPerRow;i++){
      frame.state.t+=1/60;
      frame.pose.z=600+i/framesPerRow;
      frame.state.row=Math.floor(frame.pose.z);
      frame.state.maxRow=frame.state.row;
      frame.state.safeLine=frame.state.row-4;
      if(i%framesPerRow===0){
        (frame.world as World).ensure(frame.state.row+50);
        (frame.world as World).prune(frame.state.row-50);
      }
      const version=terrain.instanceMatrix.version,start=performance.now();
      scene.render(frame);
      durations.push(performance.now()-start);
      triangles+=scene.stats.triangles;
      if(terrain.instanceMatrix.version!==version){
        rebuilds++;
        bytes+=terrain.instanceMatrix.updateRanges.reduce((sum,range)=>sum+range.count*4,0);
      }
    }
    if(process.env.CROSSY_RESOURCE_REPORT){
      durations.sort((a,b)=>a-b);
      console.log(JSON.stringify({width,height,rebuilds,bytes,triangles:Math.round(triangles/durations.length),p95Ms:durations[Math.ceil(durations.length*.95)-1],p99Ms:durations[Math.ceil(durations.length*.99)-1]}));
    }
    expect(rebuilds).toBeLessThan(count);
    expect(bytes).toBeLessThan(width===390?4_000_000:11_000_000);
    // Extra instances at the cache edge must stay bounded.
    expect(triangles/durations.length).toBeLessThan(width===390?40_000:110_000);
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
