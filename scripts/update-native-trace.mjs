import {mkdir} from 'node:fs/promises';
import {appendFileSync} from 'node:fs';

// Optional diagnostics only. Collection failures must not change the update
// assertions, the original thrown error, or cleanup of test-owned contexts.
export function createUpdateNativeTrace({enabled=false,directory,log=console.error}){
 const output=directory+'/run-'+Date.now()+'-'+process.pid;
 const traces=[],timeline=[],pageObservers=new WeakMap();let sequence=0,dropped=0,responseId=0,timelineWriteFailed=false;
 const record=(kind,data={})=>{if(!enabled)return;try{const row={sequence:++sequence,at:new Date().toISOString(),monotonicNs:process.hrtime.bigint().toString(),kind,...data};if(timeline.length<8192)timeline.push(row);else dropped++;}catch{}};
 const snapshot=reason=>{try{appendFileSync(output+'/timeline-snapshots.jsonl',JSON.stringify({reason,at:new Date().toISOString(),monotonicNs:process.hrtime.bigint().toString(),dropped,events:timeline.slice(),workers:traces.map(trace=>({index:trace.index,versions:[...trace.versions.values()]})),limitations:['Version ID is not a worker-global epoch; optional target/status fields may be absent.','Page Network events do not cover all worker-internal response bodies. Server finish does not prove browser consumption.','The original timed-out poll is not cancelled; its in-flight/future version RPCs may continue during capture.']})+'\n');}catch(error){timelineWriteFailed=true;try{log('NATIVE TIMELINE WRITE FAILED',error.message);}catch{}}};
 const report=(kind,data={})=>{
  const value={at:new Date().toISOString(),kind,...data};
  try{appendFileSync(output+'/observations.jsonl',JSON.stringify(value)+'\n');}catch(error){try{log('NATIVE TRACE WRITE FAILED',error.message);}catch{}}
  try{log('NATIVE TRACE',JSON.stringify(value));}catch{}
 };
 const bounded=async(task,ms,label)=>{let timer;try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label)),ms);})]);}finally{clearTimeout(timer);}};
 async function stop(trace,reason){
  if(trace.stopping)return trace.stopping;
  trace.stopping=(async()=>{
   trace.finalized=true;snapshot(reason);report('end-request',{index:trace.index,reason});
   try{
    await bounded(trace.cdp.send('Tracing.end'),5000,'native trace end command exceeded diagnostic bound');
    const result=await bounded(trace.complete,15000,'native trace flush exceeded diagnostic bound');
    report('complete',{index:trace.index,result,eventCount:trace.count,nativeEventCount:trace.nativeCount,eventNames:[...trace.eventNames],categoryCoverage:trace.categoryCoverage,responseBodyCoverage:'unknown',timelineWriteFailed,timelineDropped:dropped,usable:trace.nativeCount>0&&!trace.writeFailed&&result.dataLossOccurred===false});
   }catch(error){report('unavailable',{index:trace.index,reason,error:error.message,eventCount:trace.count});}
  })();return trace.stopping;
 }
 async function observePage(trace,context,page){
  if(trace.finalized)return;const sessionId=`${trace.index}:${trace.pageCount++}`;
  try{
   const cdp=await bounded(context.newCDPSession(page),5000,'passive page session setup exceeded diagnostic bound');
   if(trace.finalized){record('late-page-session-ignored',{sessionId});void cdp.detach().catch(()=>{});return;}
   cdp.on('ServiceWorker.workerVersionUpdated',({versions})=>{if(trace.finalized)return;for(const delta of versions){const key=delta.registrationId+':'+delta.versionId;trace.versions.set(key,{...trace.versions.get(key),...delta,lastDelta:delta,observedMonotonicNs:process.hrtime.bigint().toString()});}record('worker-version-deltas',{sessionId,versions});});
   cdp.on('ServiceWorker.workerRegistrationUpdated',data=>!trace.finalized&&record('worker-registration-deltas',{sessionId,...data}));
   cdp.on('ServiceWorker.workerErrorReported',data=>!trace.finalized&&record('worker-error',{sessionId,...data}));
   cdp.on('Network.requestWillBeSent',data=>!trace.finalized&&record('page-request',{sessionId,requestId:data.requestId,timestamp:data.timestamp,url:data.request.url,method:data.request.method,type:data.type}));
   cdp.on('Network.responseReceived',data=>!trace.finalized&&record('page-response-headers',{sessionId,requestId:data.requestId,timestamp:data.timestamp,url:data.response.url,status:data.response.status,fromServiceWorker:data.response.fromServiceWorker}));
   for(const name of ['dataReceived','loadingFinished','loadingFailed'])cdp.on('Network.'+name,data=>{if(trace.finalized)return;const {requestId,timestamp,dataLength,encodedDataLength,errorText,canceled}=data;record('page-'+name,{sessionId,requestId,timestamp,dataLength,encodedDataLength,errorText,canceled});});
   await bounded(Promise.all([Promise.resolve().then(()=>!trace.finalized&&cdp.send('ServiceWorker.enable')),Promise.resolve().then(()=>!trace.finalized&&cdp.send('Network.enable'))]),5000,'passive page observers exceeded diagnostic bound');
   if(trace.finalized){record('late-page-observers-ignored',{sessionId});return;}
   record('page-observers-ready',{sessionId,url:page.url(),qualification:'Page session only; no worker attachment or lifecycle command. Observers can perturb timing.'});
  }catch(error){record('page-observers-unavailable',{sessionId,error:error.message});}
 }
 return {
  directory:output,
  async ready(page){if(enabled)await pageObservers.get(page);},
  mark(kind,data={}){
   if(!enabled)return;try{record(kind,{...data,workers:traces.map(trace=>({index:trace.index,versions:[...trace.versions.values()]}))});
   for(const trace of traces){if(trace.finalized)continue;const syncId='qcc-'+kind+'-'+process.hrtime.bigint();record('clock-marker-send',{index:trace.index,syncId});void bounded(Promise.resolve().then(()=>trace.cdp.send('Tracing.recordClockSyncMarker',{syncId})),5000,'clock marker acknowledgment exceeded diagnostic bound').then(()=>record('clock-marker-ack',{index:trace.index,syncId}),error=>record('clock-marker-unavailable',{index:trace.index,syncId,error:error.message}));}}catch(error){record('marker-unavailable',{kind,error:error.message});}
  },
  observeResponse(request,response,details){
   if(!enabled)return;
   try{const id=++responseId;record('server-request',{id,...details,method:request.method,url:request.url});
   const state=()=>{try{return {requestComplete:request.complete,requestDestroyed:request.destroyed,responseFinished:response.writableFinished,responseDestroyed:response.destroyed};}catch(error){return {unavailable:error.message};}};
   for(const name of ['aborted','close'])request.on(name,()=>record('server-request-'+name,{id,...state()}));
   for(const name of ['finish','close'])response.on(name,()=>record('server-response-'+name,{id,...state()}));}catch(error){record('server-observer-unavailable',{error:error.message});}
  },
  async observe(context,details){
   if(!enabled)return;let trace;
   try{
    await mkdir(output,{recursive:true});
    const index=traces.length,cdp=await bounded(context.browser().newBrowserCDPSession(),5000,'native trace session setup exceeded diagnostic bound');
    trace={index,cdp,count:0,nativeCount:0,writeFailed:false,versions:new Map(),pageCount:0,eventNames:new Set(),categoryCoverage:'unknown',complete:new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve))};
    cdp.on('Tracing.dataCollected',payload=>{
     trace.count+=payload.value.length;for(const event of payload.value)if(trace.eventNames.size<256)trace.eventNames.add(event.name);
     trace.nativeCount+=payload.value.filter(event=>event.cat?.split(',').includes('ServiceWorker')).length;
     try{appendFileSync(`${output}/service-worker-${index}.jsonl`,JSON.stringify(payload)+'\n');}catch(error){trace.writeFailed=true;report('batch-write-failed',{index,error:error.message});}
    });
    const requested=['ServiceWorker','loading','netlog'];let discovered=[];
    try{discovered=(await bounded(cdp.send('Tracing.getCategories'),5000,'category discovery exceeded diagnostic bound')).categories||[];}catch(error){record('category-discovery-unavailable',{index,error:error.message});}
    trace.categoryCoverage=requested.every(name=>discovered.includes(name))?'requested categories listed; event/body completeness unknown':'unknown';
    record('category-discovery',{index,requested,discovered,coverage:trace.categoryCoverage});
    const starting=Promise.resolve().then(()=>cdp.send('Tracing.start',{categories:requested.join(','),transferMode:'ReportEvents',tracingBackend:'chrome'}));
    void starting.then(()=>{if(trace.finalized){record('late-trace-start-ended',{index});void bounded(Promise.resolve().then(()=>cdp.send('Tracing.end')),5000,'late trace end exceeded diagnostic bound').catch(error=>record('late-trace-end-unavailable',{index,error:error.message}));}},()=>{});
    await bounded(starting,5000,'native trace start exceeded diagnostic bound');
    traces.push(trace);
    const onPage=page=>{if(!pageObservers.has(page))pageObservers.set(page,observePage(trace,context,page));};context.on('page',onPage);
    for(const page of context.pages()){onPage(page);await pageObservers.get(page);}
    const close=context.close.bind(context);context.close=async(...args)=>{try{await stop(trace,'context-close');}finally{context.off('page',onPage);return close(...args);}};
    await bounded(cdp.send('Tracing.recordClockSyncMarker',{syncId:'qcc-native-start-'+Date.now()+'-'+index}),5000,'native trace clock marker exceeded diagnostic bound');
    report('start',{index,...details,directory:output,qualification:'Native tracing can alter timing. Category events are not proof of universal native quiescence.'});
   }catch(error){if(trace)trace.finalized=true;report('setup-unavailable',{...details,error:error.message});}
  },
  async failure(error,details){
   if(!enabled)return;
   // Caller awaits this before settling gates or closing contexts. Never throw
   // a collection error in place of the original failed assertion.
   try{record('original-assertion-failure',{...details,message:error.message});snapshot('original-assertion-failure-before-cleanup-or-diagnostic-RPC');report('assertion-failure-before-cleanup',{...details,message:error.message});await Promise.all(traces.map(trace=>stop(trace,'assertion-failure-before-cleanup')));}catch(collectionError){report('failure-capture-unavailable',{error:collectionError.message,originalError:error.message});}
  }
 };
}
