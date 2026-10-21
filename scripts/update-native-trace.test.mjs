import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createUpdateNativeTrace,NATIVE_TRACE_LIMITS,nativeEventMetadata,diagnosticMetadata} from './update-native-trace.mjs';

async function fixture(t,{startError,endError,dataLoss=false,events=[{name:'ServiceWorkerVersion::Request',cat:'ServiceWorker'}],traceOptions={}}={}){
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
 const trace=createUpdateNativeTrace({enabled:true,directory,log:()=>{},...traceOptions});
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
 const snapshot=JSON.parse(await readFile(f.directory+'/failure-timeline.json','utf8'));
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
 const before=JSON.parse(await readFile(f.directory+'/failure-timeline.json','utf8'));
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


test('public diagnostic metadata excludes headers, bodies, queries and non-fixture URLs',()=>{
 const event=nativeEventMetadata({name:'URL_REQUEST_START_JOB',cat:'netlog',ph:'b',pid:1,tid:2,ts:3,id2:{local:'0x14'},args:{params:{url:'http://127.0.0.1:4181/sw.js?secret=redact#fragment',method:'GET',source_start_time:'10',headers:['Cookie: secret'],request_headers:'Authorization: secret',body:'private',key:'private cache key',source_dependency:{id:5,type:1}}}});
 assert.deepEqual(event.args,{params:{url:'http://127.0.0.1:4181/sw.js',method:'GET',source_start_time:'10',source_dependency:{id:5,type:1}}});
 assert.equal(nativeEventMetadata({args:{url:'https://private.invalid/account?secret=1'}}).args.url,'[non-fixture-url]');
 const metadata=diagnosticMetadata({scope:'/',headers:'private',versions:[{scriptURL:'http://127.0.0.1:4181/sw.js?secret=1',controlledClients:['test-client']}],error:'Failed https://private.invalid/path?secret=1'});
 assert.deepEqual(metadata,{scope:'/',versions:[{scriptURL:'http://127.0.0.1:4181/sw.js',controlledClients:['test-client']}],error:'Failed [non-fixture-url]'});
});

test('recent timeline survives earlier full-suite traffic and reserves the first failure snapshot',async t=>{
 const f=await fixture(t,{traceOptions:{limits:{...NATIVE_TRACE_LIMITS,timelineRows:4,snapshotBytes:10000},metadata:{checkout:'test-checkout',tree:'test-tree'}}});await f.trace.observe(f.context,{scope:'/'});
 for(let i=0;i<20;i++)f.trace.phase('prior-phase-'+i);
 f.trace.phase('controlled-waiting-WXY');f.trace.mark('W-release-request');
 const original=new Error('Timed out: W activates after topic away and back');await f.trace.failure(original,{scope:'/'});await f.trace.failure(new Error('later cleanup error'),{});
 const snapshot=JSON.parse(await readFile(f.directory+'/failure-timeline.json','utf8'));
 assert.equal(snapshot.phase,'controlled-waiting-WXY');assert.ok(snapshot.dropped>0);assert.equal(snapshot.metadata.checkout,'test-checkout');assert.ok(snapshot.events.some(row=>row.kind==='W-release-request'));assert.equal(snapshot.events.at(-1).message,original.message);assert.ok(snapshot.events.length<=4);
 await f.context.close();
});

test('native tail retains the latest batch and reports evicted events',async t=>{
 const event=name=>({name,cat:'ServiceWorker',ph:'I',ts:1,args:{status:'COMPLETED'}});
 const f=await fixture(t,{events:[event('at-deadline')],traceOptions:{limits:{...NATIVE_TRACE_LIMITS,traceBytesPerContext:180}}});await f.trace.observe(f.context,{scope:'/'});
 for(let i=0;i<5;i++)f.cdp.emit('Tracing.dataCollected',{value:[event('earlier-'+i)]});
 await f.context.close();const raw=await readFile(f.directory+'/service-worker-0.jsonl','utf8');assert.match(raw,/at-deadline/);assert.doesNotMatch(raw,/earlier-0/);
 const rows=(await readFile(f.directory+'/observations.jsonl','utf8')).trim().split('\n').map(JSON.parse),complete=rows.find(row=>row.kind==='complete');assert.ok(complete.traceDroppedEvents>0);assert.equal(complete.usable,false);assert.ok(complete.traceBytes<=180);
});

test('later context retains file capacity and explicit identity after completed-file eviction',async t=>{
 const f=await fixture(t,{traceOptions:{limits:{...NATIVE_TRACE_LIMITS,traceBytesTotal:100}}});
 await f.trace.observe(f.context,{scope:'/',profileId:0});await f.context.close();
 const second=Object.assign(new EventEmitter(),{browser:f.context.browser,pages:()=>[],close:async()=>{}});
 f.trace.phase('controlled-waiting-WXY');await f.trace.observe(second,{scope:'/Qcc-games-/',profileId:1});await second.close();
 await assert.rejects(readFile(f.directory+'/service-worker-0.jsonl'),{code:'ENOENT'});assert.match(await readFile(f.directory+'/service-worker-1.jsonl','utf8'),/ServiceWorkerVersion/);
 const rows=(await readFile(f.directory+'/observations.jsonl','utf8')).trim().split('\n').map(JSON.parse),last=rows.filter(row=>row.kind==='complete').at(-1);assert.deepEqual(last.retainedContextFiles,[1]);assert.deepEqual(last.evictedContexts,[0]);
});

test('failed setup does not reuse a later context identity',async t=>{
 const f=await fixture(t,{startError:new Error('first setup unavailable')});await f.trace.observe(f.context,{scope:'/'});
 const send=f.cdp.send;f.cdp.send=(method,params)=>method==='Tracing.start'?Promise.resolve():send(method,params);
 await f.trace.observe(f.context,{scope:'/Qcc-games-/'});await f.context.close();
 assert.match(await readFile(f.directory+'/service-worker-1.jsonl','utf8'),/ServiceWorkerVersion/);
 const rows=(await readFile(f.directory+'/observations.jsonl','utf8')).trim().split('\n').map(JSON.parse);assert.equal(rows.find(row=>row.kind==='setup-unavailable').index,0);assert.equal(rows.find(row=>row.kind==='start').index,1);
});


test('an oversized native batch and late completion cannot displace the retained boundary',async t=>{
 const f=await fixture(t,{events:[{name:'boundary',cat:'ServiceWorker'}],traceOptions:{limits:{...NATIVE_TRACE_LIMITS,traceBytesPerContext:180}}});await f.trace.observe(f.context,{scope:'/'});
 f.cdp.emit('Tracing.dataCollected',{value:[{name:'oversized',cat:'ServiceWorker',args:{status:'x'.repeat(500)}}]});await f.context.close();
 f.cdp.emit('Tracing.dataCollected',{value:[{name:'late',cat:'ServiceWorker'}]});
 const raw=await readFile(f.directory+'/service-worker-0.jsonl','utf8');assert.match(raw,/boundary/);assert.doesNotMatch(raw,/oversized|late/);
 const rows=(await readFile(f.directory+'/observations.jsonl','utf8')).trim().split('\n').map(JSON.parse);assert.equal(rows.find(row=>row.kind==='complete').traceDroppedEvents,1);assert.equal(rows.find(row=>row.kind==='complete').usable,false);
});


test('a timed-out unregistered start discards buffers and ignores late trace data',async t=>{
 const f=await fixture(t),send=f.cdp.send;let requested,finishStart,ended;
 const startRequested=new Promise(resolve=>requested=resolve),endObserved=new Promise(resolve=>ended=resolve);
 f.cdp.send=(method,params)=>{if(method==='Tracing.start'){requested();return new Promise(resolve=>finishStart=resolve);}const result=send(method,params);if(method==='Tracing.end')ended();return result;};
 t.mock.timers.enable({apis:['setTimeout']});const observing=f.trace.observe(f.context,{scope:'/'});await startRequested;
 f.cdp.emit('Tracing.dataCollected',{value:[{name:'before-setup-timeout',cat:'ServiceWorker'}]});
 t.mock.timers.tick(5000);await observing;finishStart();await endObserved;t.mock.timers.reset();
 await f.trace.failure(new Error('original'),{});await f.context.close();
 const snapshot=JSON.parse(await readFile(f.directory+'/failure-timeline.json','utf8'));
 const discard=snapshot.events.find(row=>row.kind==='unregistered-trace-buffer-discarded');assert.equal(discard.events,1);assert.ok(discard.bytes>0);assert.deepEqual(snapshot.workers,[]);
 assert.ok(snapshot.events.some(row=>row.kind==='late-native-batch-ignored'));assert.equal(f.calls.filter(call=>call.method==='Tracing.end').length,1);
 await assert.rejects(readFile(f.directory+'/service-worker-0.jsonl'),{code:'ENOENT'});
});
