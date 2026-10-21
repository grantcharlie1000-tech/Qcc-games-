import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createUpdateNativeTrace} from './update-native-trace.mjs';

async function fixture(t,{startError,endError,dataLoss=false,events=[{name:'ServiceWorkerVersion::Request',cat:'ServiceWorker'}]}={}){
 const directory=await mkdtemp(join(tmpdir(),'qcc-native-trace-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const calls=[],cdp=new EventEmitter();let closed=false;
 cdp.send=async(method,params)=>{
  calls.push({method,params});if(method==='Tracing.getCategories')return {categories:[]};if(method==='Tracing.start'&&startError)throw startError;
  if(method==='Tracing.end'){
   if(endError)throw endError;
   cdp.emit('Tracing.dataCollected',{value:events});
   cdp.emit('Tracing.tracingComplete',{dataLossOccurred:dataLoss});
  }
 };
 const context=Object.assign(new EventEmitter(),{browser:()=>({newBrowserCDPSession:async()=>cdp}),pages:()=>[],close:async()=>{closed=true;}});
 const trace=createUpdateNativeTrace({enabled:true,directory,log:()=>{}});
 return {directory:trace.directory,calls,cdp,context,trace,closed:()=>closed};
}

test('disabled diagnostics do not access or decorate the context',async()=>{
 let accesses=0;const close=async()=>{};const context={browser(){accesses++;throw new Error('Must stay uninstrumented');},close};
 const trace=createUpdateNativeTrace({directory:'/unused'});await trace.observe(context,{scope:'/'});await trace.failure(new Error('original'),{scope:'/'});
 assert.equal(accesses,0);assert.equal(context.close,close);
});

test('native capture records failure before cleanup and retains the original assertion',async t=>{
 const f=await fixture(t);await f.trace.observe(f.context,{scope:'/'});const original=new Error('Timed out: user accepted waiting D');let gatesCleaned=false;
 await assert.rejects(async()=>{try{throw original;}catch(error){await f.trace.failure(error,{scope:'/',heldManifest:true});assert.equal(gatesCleaned,false);gatesCleaned=true;throw error;}},error=>error===original);
 const observations=(await readFile(f.directory+'/observations.jsonl','utf8')).trim().split('\n').map(JSON.parse);
 assert.ok(observations.findIndex(row=>row.kind==='assertion-failure-before-cleanup')<observations.findIndex(row=>row.kind==='end-request'));
 assert.equal(observations.find(row=>row.kind==='complete').usable,true);
 assert.match(await readFile(f.directory+'/service-worker-0.jsonl','utf8'),/ServiceWorkerVersion::Request/);
 await f.context.close();assert.equal(f.closed(),true);assert.equal(f.calls.filter(call=>call.method==='Tracing.end').length,1);
});

test('end failure cannot replace an assertion or prevent context cleanup',async t=>{
 const f=await fixture(t,{endError:new Error('Protocol disconnected')});await f.trace.observe(f.context,{scope:'/Qcc-games-/'});const original=new Error('Timed out: W activates after topic away and back');
 await assert.rejects(async()=>{try{throw original;}catch(error){await f.trace.failure(error,{scope:'/Qcc-games-/'});throw error;}},error=>error===original);
 await f.context.close();assert.equal(f.closed(),true);assert.match(await readFile(f.directory+'/observations.jsonl','utf8'),/unavailable.*Protocol disconnected/);
});

test('unsupported setup leaves ordinary context cleanup intact',async t=>{
 const f=await fixture(t,{startError:new Error('Tracing unavailable')});const close=f.context.close;await f.trace.observe(f.context,{scope:'/'});
 assert.equal(f.context.close,close);await f.context.close();assert.equal(f.closed(),true);assert.match(await readFile(f.directory+'/observations.jsonl','utf8'),/setup-unavailable.*Tracing unavailable/);
});

test('reported data loss is marked unusable rather than treated as complete evidence',async t=>{
 const f=await fixture(t,{dataLoss:true});await f.trace.observe(f.context,{scope:'/'});await f.context.close();
 const rows=(await readFile(f.directory+'/observations.jsonl','utf8')).trim().split('\n').map(JSON.parse);assert.equal(rows.find(row=>row.kind==='complete').usable,false);
});

test('metadata alone is not marked usable native service-worker evidence',async t=>{
 const f=await fixture(t,{events:[{name:'thread_name',cat:'__metadata'}]});await f.trace.observe(f.context,{scope:'/'});await f.context.close();
 const rows=(await readFile(f.directory+'/observations.jsonl','utf8')).trim().split('\n').map(JSON.parse);assert.equal(rows.find(row=>row.kind==='complete').usable,false);
});

test('a stalled optional browser session is bounded without changing cleanup',async t=>{
 const f=await fixture(t);let started;const requested=new Promise(resolve=>started=resolve);
 f.context.browser=()=>({newBrowserCDPSession:()=>{started();return new Promise(()=>{});}});
 t.mock.timers.enable({apis:['setTimeout']});const observing=f.trace.observe(f.context,{scope:'/'});await requested;t.mock.timers.tick(5000);await observing;
 t.mock.timers.reset();await f.context.close();assert.equal(f.closed(),true);assert.match(await readFile(f.directory+'/observations.jsonl','utf8'),/setup-unavailable.*session setup exceeded diagnostic bound/);
});


test('passive worker deltas retain last-known optional fields without inventing an epoch',async t=>{
 const f=await fixture(t),page={url:()=>'about:blank'},pageCdp=new EventEmitter(),commands=[];
 pageCdp.send=async(method)=>{commands.push(method);};f.context.pages=()=>[page];f.context.newCDPSession=async()=>pageCdp;
 await f.trace.observe(f.context,{scope:'/'});
 pageCdp.emit('ServiceWorker.workerVersionUpdated',{versions:[{registrationId:'r',versionId:'b',status:'activated',runningStatus:'running',targetId:'old-target'}]});
 pageCdp.emit('ServiceWorker.workerVersionUpdated',{versions:[{registrationId:'r',versionId:'b',runningStatus:'stopped'}]});
 assert.equal(f.trace.mark('W-release-request'),undefined);
 const original=new Error('Timed out: W activates after topic away and back');await f.trace.failure(original,{scope:'/'});
 const rows=(await readFile(f.directory+'/timeline-snapshots.jsonl','utf8')).trim().split('\n').map(JSON.parse),snapshot=rows.find(r=>r.reason==='original-assertion-failure-before-cleanup-or-diagnostic-RPC');
 const marker=snapshot.events.find(r=>r.kind==='W-release-request'),worker=marker.workers[0].versions[0];
 assert.equal(worker.targetId,'old-target');assert.equal(worker.runningStatus,'stopped');assert.deepEqual(worker.lastDelta,{registrationId:'r',versionId:'b',runningStatus:'stopped'});assert.equal('epoch' in worker,false);assert.equal('controlledClients' in worker,false);
 assert.deepEqual(commands,['ServiceWorker.enable','Network.enable']);assert.ok(snapshot.events.some(r=>r.kind==='category-discovery'&&r.discovered.length===0&&r.coverage==='unknown'));
 await f.context.close();
});

test('HTTP metadata observes finish, premature close and abort without consuming bodies',async t=>{
 const f=await fixture(t);await f.trace.observe(f.context,{scope:'/'});
 const request=Object.assign(new EventEmitter(),{method:'GET',url:'/owned-stream',complete:true,destroyed:false}),response=Object.assign(new EventEmitter(),{writableFinished:false,destroyed:false});
 f.trace.observeResponse(request,response,{scope:'/'});assert.equal(request.listenerCount('data'),0);assert.equal(request.listenerCount('readable'),0);
 request.emit('aborted');response.destroyed=true;response.emit('close');
 const original=new Error('original assertion');await f.trace.failure(original,{scope:'/'});
 response.writableFinished=true;response.emit('finish');await f.context.close();
 const snapshots=(await readFile(f.directory+'/timeline-snapshots.jsonl','utf8')).trim().split('\n').map(JSON.parse),before=snapshots.find(r=>r.reason==='original-assertion-failure-before-cleanup-or-diagnostic-RPC');
 assert.ok(before.events.some(r=>r.kind==='server-request-aborted'));assert.ok(before.events.some(r=>r.kind==='server-response-close'&&r.responseFinished===false));assert.equal(before.events.some(r=>r.kind==='server-response-finish'),false);
});

test('throwing passive metadata access and clock sends cannot replace the original failure',async t=>{
 const f=await fixture(t);await f.trace.observe(f.context,{scope:'/'});
 const send=f.cdp.send;f.cdp.send=(method,params)=>{if(method==='Tracing.recordClockSyncMarker')throw new Error('clock unavailable');return send(method,params);};
 assert.doesNotThrow(()=>f.trace.observeResponse(new Proxy({},{get(){throw new Error('metadata unavailable');}}),{},{}));
 const original=new Error('original assertion');await assert.rejects(async()=>{try{throw original;}catch(error){f.trace.mark('original-deadline',{label:error.message});await f.trace.failure(error,{});throw error;}},error=>error===original);
 await f.context.close();
});


test('a late passive page session cannot enable observation after setup timeout and failure capture',async t=>{
 const f=await fixture(t),page={url:()=>'about:blank'},pageCdp=new EventEmitter(),commands=[];let resolveSession,requested;
 const requestedSession=new Promise(resolve=>requested=resolve);pageCdp.send=async method=>{commands.push(method);};
 f.context.pages=()=>[page];f.context.newCDPSession=()=>{requested();return new Promise(resolve=>resolveSession=resolve);};
 t.mock.timers.enable({apis:['setTimeout']});const observing=f.trace.observe(f.context,{scope:'/'});await requestedSession;t.mock.timers.tick(5000);await observing;
 await f.trace.failure(new Error('original'),{});resolveSession(pageCdp);await Promise.resolve();await Promise.resolve();assert.deepEqual(commands,[]);
 t.mock.timers.reset();await f.context.close();
});
