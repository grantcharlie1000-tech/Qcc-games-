import pathlib,sys,shutil,hashlib,json
root=pathlib.Path(sys.argv[1]);here=pathlib.Path(__file__).parent

def edit(path,changes,imp):
 p=root/path;s=p.read_text()
 for old,new in changes:
  if s.count(old)!=1:raise RuntimeError(f'{path}: expected one occurrence of {old!r}, got {s.count(old)}')
  s=s.replace(old,new)
 p.write_text(imp+'\n'+s)
shutil.copy(here/'timing.ts',root/'src/ballrun-diagnostic-timing.ts')
edit('src/main.ts',[
 ('async function route(){','async function route(){\n  brMark("route.enter");'),
 ('const loaded=await loadGame(id);','brMark("load.start");const loaded=await loadGame(id);brMark("load.end");'),
 ('const mounted=await loaded.mount(stage,{','brMark("mount.start");const mountResult=loaded.mount(stage,{'),
 ('    if(token!==generation){mounted.dispose();return;}','    brMark("mount.sync-return");const mounted=await mountResult;brMark("mount.await-continuation");\n    if(token!==generation){mounted.dispose();return;}'),
 ('instance.restore(saved);','brMark("restore.start");instance.restore(saved);brMark("restore.end");requestAnimationFrame(()=>brMark("restore.next-frame"));')
],"import {mark as brMark} from './ballrun-diagnostic-timing';")
edit('src/games/ball-run/scene.ts',[
 ('const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: \'low-power\' });',"const renderer = brSpan('renderer.create',()=>new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' }));brMark('scene.build.start');"),
 ('    renderer.render(scene, camera);',"    brSpan('renderer.render',()=>renderer.render(scene, camera));"),
 ('    notifyGlassFrame(canvas);',"    brSpan('glass.notify',()=>notifyGlassFrame(canvas));"),
 ('  resize(canvas.clientWidth || 1, canvas.clientHeight || 1);',"  brMark('scene.build.end');resize(canvas.clientWidth || 1, canvas.clientHeight || 1);"),
 ('  drawFrame();\n  return { resize,',"  brSpan('scene.warmup',drawFrame);\n  return { resize,")
],"import {mark as brMark,span as brSpan} from '../../ballrun-diagnostic-timing';")
edit('src/ui/webgl-glass.ts',[
 ('const g=ensureGpu();',"const g=brSpan('glass.ensureGpu',ensureGpu);"),
 ('stagingCtx.drawImage(source,cx0*kx,cy0*ky,(cx1-cx0)*kx,(cy1-cy0)*ky,0,0,stW,stH);',"brSpan('glass.staging.drawImage',()=>stagingCtx!.drawImage(source,cx0*kx,cy0*ky,(cx1-cx0)*kx,(cy1-cy0)*ky,0,0,stW,stH));"),
 ('stagingCtx.getImageData(0,0,stW,stH).data',"brSpan('glass.staging.getImageData',()=>stagingCtx!.getImageData(0,0,stW,stH)).data"),
 ('gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,stW,stH,gl.RGBA,gl.UNSIGNED_BYTE,staging);',"brSpan('glass.texture.upload',()=>gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,stW,stH,gl.RGBA,gl.UNSIGNED_BYTE,staging!));"),
 ('lens.ctx.drawImage(g.canvas,0,plan.slot,plan.outW,plan.outH,0,0,plan.outW,plan.outH);',"brSpan('glass.output.drawImage',()=>lens.ctx!.drawImage(g.canvas,0,plan.slot,plan.outW,plan.outH,0,0,plan.outW,plan.outH));")
],"import {span as brSpan} from '../ballrun-diagnostic-timing';")
edit('src/ui/canvas-ink.ts',[
 ('ctx.drawImage(source,0,0,width,height);',"brSpan('ink.drawImage',()=>ctx!.drawImage(source,0,0,width,height));"),
 ('ctx.getImageData(0,0,width,height).data',"brSpan('ink.getImageData',()=>ctx!.getImageData(0,0,width,height)).data")
],"import {span as brSpan} from '../ballrun-diagnostic-timing';")
shutil.copy(here/'hooks.ts',root/'tests/ballrun-diagnostic-hooks.ts')
p=root/'tests/games/ball-run/play.spec.ts';original=p.read_text()
p.write_text("import {registerTiming} from '../../ballrun-diagnostic-hooks';\n"+original.replace("test.use({video:","registerTiming(test);\ntest.use({video:",1))
# Both variants retain every original action and assertion verbatim.
config=root/'playwright.ballrun-diagnostic.config.ts'
config.write_text("import base from './playwright.config';\nimport {defineConfig} from '@playwright/test';\nexport default defineConfig({...base,workers:1,retries:0});\n")
# Set only the blur search flag before application modules run, preserving the original goto and hash.
hooks=root/'tests/ballrun-diagnostic-hooks.ts';s=hooks.read_text();s=s.replace('  blocked=[];',"  blocked=[];\n  await context.addInitScript(variant=>{if(variant==='blur'&&location.origin==='http://127.0.0.1:4600'){const u=new URL(location.href);u.searchParams.set('glass','blur');history.replaceState(null,'',u.href);}},process.env.BALLRUN_VARIANT);")
hooks.write_text(s)
(root/'diagnostic-integrity.json').write_text(json.dumps({'pin':'d453cbb17a414f6786728763191dc88b132d9c5c','originalTestSha256':hashlib.sha256(original.encode()).hexdigest(),'testBodyUnchanged':p.read_text().replace("import {registerTiming} from '../../ballrun-diagnostic-hooks';\n",'',1).replace('registerTiming(test);\n','',1)==original},indent=2))
