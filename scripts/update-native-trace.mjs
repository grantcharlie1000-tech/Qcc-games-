import {mkdir} from 'node:fs/promises';
import {appendFileSync,writeFileSync,unlinkSync} from 'node:fs';

export const NATIVE_TRACE_LIMITS=Object.freeze({timelineRows:8192,traceBytesPerContext:64*1024*1024,traceBytesTotal:512*1024*1024,snapshotBytes:16*1024*1024,observationBytes:4*1024*1024});
const argumentKeys=new Set(['name','sync_id','syncId','Document URL','Client URL','URL','Status','client_url','status','Registration ID','Scope','Script URL','request_url','Purpose','Script','script_url','Source','begin_read_result','write_data_result','success','New Status','Event type','Request id','result','Handled','url','controller','queued','commit_responsibility_','fetch_response_from','metadata size','error_code','reason','document_url','event_type','initial_worker_status','main_script_url','state','error','bytes_available','bytes_written','Version Status','will_be_terminated','Restart','version_id','registration_id','params','source_type','source_start_time','source_dependency','id','type','byte_count','method','request_type','net_error']);
export function fixtureURL(value){try{const url=new URL(value);return url.origin==='http://127.0.0.1:4181'?url.origin+url.pathname:'[non-fixture-url]';}catch{return '[unavailable-url]';}}
// Allow only lifecycle/flow metadata. Never serialize arbitrary netlog headers,
// bodies, cache keys, addresses, credentials or non-fixture URLs.
const omittedKeys=new Set(['headers','request_headers','response_headers','cookie','cookies','authorization','body','postData','hex_encoded_bytes','payload']);
export function diagnosticMetadata(value,key=''){
 if(typeof value==='string')return key==='scope'&&['/','/Qcc-games-/','both'].includes(value)?value:/url|scope/i.test(key)?fixtureURL(value):value.replace(/https?:\/\/[^\s"'<>]+/g,url=>fixtureURL(url)).slice(0,1024);
 if(value===null||typeof value==='number'||typeof value==='boolean')return value;
 if(Array.isArray(value))return value.map(item=>diagnosticMetadata(item,key));
 if(!value||typeof value!=='object')return undefined;
 return Object.fromEntries(Object.entries(value).filter(([name])=>!omittedKeys.has(name)).map(([name,item])=>[name,diagnosticMetadata(item,name)]));
}
export function nativeMetadata(value,key=''){
 if(typeof value==='string')return /url|scope|script/i.test(key)?fixtureURL(value):diagnosticMetadata(value,key).slice(0,256);
 if(value===null||typeof value==='number'||typeof value==='boolean')return value;
 if(!value||Array.isArray(value)||typeof value!=='object')return undefined;
 return Object.fromEntries(Object.entries(value).filter(([name])=>argumentKeys.has(name)).map(([name,item])=>[name,nativeMetadata(item,name)]));
}
export function nativeEventMetadata(event){
 const fields=['name','cat','ph','pid','tid','ts','dur','tts','tdur','id','id2','bp','s','bind_id'];
 return {...Object.fromEntries(fields.filter(key=>key in event).map(key=>[key,event[key]])),args:nativeMetadata(event.args||{})};
}

// Optional diagnostics only. Collection failures must not change the update
// assertions, the original thrown error, or cleanup of test-owned contexts.
export function createUpdateNativeTrace({enabled=false,directory,log=console.error,metadata={},limits=NATIVE_TRACE_LIMITS}){
 const output=directory+'/run-'+Date.now()+'-'+process.pid;
 const runMetadata=diagnosticMetadata(metadata);
 const traces=[],timeline=[],pageObservers=new WeakMap();let nextContext=0,sequence=0,dropped=0,responseId=0,timelineWriteFailed=false,totalTraceBytes=0,failureCapture,phase='startup';const fileBytes=new Map(),nativeFiles=[],evictedContexts=[];
 const append=(path,value,maximum)=>{const bytes=Buffer.byteLength(value),used=fileBytes.get(path)||0;if(used+bytes>maximum)return false;appendFileSync(path,value);fileBytes.set(path,used+bytes);return true;};
 const record=(kind,data={})=>{if(!enabled)return;try{const row={sequence:++sequence,at:new Date().toISOString(),monotonicNs:process.hrtime.bigint().toString(),kind,phase,...diagnosticMetadata(data)};if(timeline.length===limits.timelineRows){timeline.shift();dropped++;}timeline.push(row);}catch{}};
 const snapshot=reason=>{try{const failure=reason==='original-assertion-failure-before-cleanup-or-diagnostic-RPC';if(!append(output+(failure?'/failure-timeline.json':'/timeline-snapshots.jsonl'),JSON.stringify({reason,phase,metadata:runMetadata,limits,retention:'most recent timeline rows; dropped counts evicted older rows',at:new Date().toISOString(),monotonicNs:process.hrtime.bigint().toString(),dropped,events:timeline.slice(),workers:traces.map(trace=>({index:trace.index,details:trace.details,finalized:trace.finalized,versions:[...trace.versions.values()]})),limitations:['Version ID is not a worker-global epoch; optional target/status fields may be absent.','Page Network events do not cover all worker-internal response bodies. Server finish does not prove browser consumption.','The original timed-out poll is not cancelled; its in-flight/future version RPCs may continue during capture.']})+'\n',limits.snapshotBytes))throw new Error('diagnostic snapshot byte cap reached');}catch(error){timelineWriteFailed=true;try{log('NATIVE TIMELINE WRITE FAILED',error.message);}catch{}}};
 const report=(kind,data={})=>{
  const value={at:new Date().toISOString(),kind,...diagnosticMetadata(data)};
  try{if(!append(output+'/observations.jsonl',JSON.stringify(value)+'\n',limits.observationBytes))throw new Error('diagnostic observation byte cap reached');}catch(error){timelineWriteFailed=true;try{log('NATIVE TRACE WRITE FAILED',error.message);}catch{}}
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
    trace.captureEnded=true;
    while(nativeFiles.length&&totalTraceBytes+trace.bytes>limits.traceBytesTotal){const old=nativeFiles.shift();try{unlinkSync(old.path);totalTraceBytes-=old.bytes;evictedContexts.push(old.index);report('native-context-file-evicted',{index:old.index,bytes:old.bytes,events:old.events,reason:'total byte cap; newest context retains capacity'});}catch(error){trace.writeFailed=true;report('native-context-eviction-failed',{index:old.index,error:error.message});break;}}
    const path=`${output}/service-worker-${trace.index}.jsonl`;
    if(totalTraceBytes+trace.bytes<=limits.traceBytesTotal){writeFileSync(path,trace.batches.map(batch=>batch.value).join(''));totalTraceBytes+=trace.bytes;nativeFiles.push({index:trace.index,path,bytes:trace.bytes,events:trace.retainedEvents});}else{trace.writeFailed=true;report('native-file-unavailable',{index:trace.index,reason:'total byte cap could not be released'});}
    trace.batches=[];
    report('complete',{index:trace.index,result,eventCount:trace.count,nativeEventCount:trace.nativeCount,eventNames:[...trace.eventNames],categoryCoverage:trace.categoryCoverage,responseBodyCoverage:'unknown',timelineWriteFailed,timelineDropped:dropped,traceBytes:trace.bytes,traceRetainedEvents:trace.retainedEvents,traceDroppedEvents:trace.droppedEvents,totalTraceBytes,retainedContextFiles:nativeFiles.map(file=>file.index),evictedContexts:[...evictedContexts],limits,usable:trace.nativeCount>0&&!trace.writeFailed&&trace.droppedEvents===0&&result.dataLossOccurred===false});
   }catch(error){report('unavailable',{index:trace.index,reason,error:error.message,eventCount:trace.count});}finally{trace.captureEnded=true;trace.batches=[];}
  })();return trace.stopping;
 }
 async function observePage(trace,context,page){
  if(trace.finalized)return;const sessionId=`${trace.index}:${trace.pageCount++}`;
  try{
   const cdp=await bounded(context.newCDPSession(page),5000,'passive page session setup exceeded diagnostic bound');
   if(trace.finalized){record('late-page-session-ignored',{sessionId});void cdp.detach().catch(()=>{});return;}
   cdp.on('ServiceWorker.workerVersionUpdated',({versions})=>{if(trace.finalized)return;for(const raw of versions){const delta=diagnosticMetadata(raw),key=delta.registrationId+':'+delta.versionId;trace.versions.set(key,{...trace.versions.get(key),...delta,lastDelta:delta,observedMonotonicNs:process.hrtime.bigint().toString()});}record('worker-version-deltas',{sessionId,versions});});
   cdp.on('ServiceWorker.workerRegistrationUpdated',data=>!trace.finalized&&record('worker-registration-deltas',{sessionId,registrations:data.registrations.map(row=>({...row,scopeURL:fixtureURL(row.scopeURL)}))}));
   cdp.on('ServiceWorker.workerErrorReported',data=>!trace.finalized&&record('worker-error',{sessionId,versionId:data.errorMessage?.versionId,errorOccurred:true}));
   cdp.on('Network.requestWillBeSent',data=>!trace.finalized&&record('page-request',{sessionId,requestId:data.requestId,timestamp:data.timestamp,url:fixtureURL(data.request.url),method:data.request.method,type:data.type}));
   cdp.on('Network.responseReceived',data=>!trace.finalized&&record('page-response-headers',{sessionId,requestId:data.requestId,timestamp:data.timestamp,url:fixtureURL(data.response.url),status:data.response.status,fromServiceWorker:data.response.fromServiceWorker}));
   for(const name of ['dataReceived','loadingFinished','loadingFailed'])cdp.on('Network.'+name,data=>{if(trace.finalized)return;const {requestId,timestamp,dataLength,encodedDataLength,errorText,canceled}=data;record('page-'+name,{sessionId,requestId,timestamp,dataLength,encodedDataLength,errorText,canceled});});
   await bounded(Promise.all([Promise.resolve().then(()=>!trace.finalized&&cdp.send('ServiceWorker.enable')),Promise.resolve().then(()=>!trace.finalized&&cdp.send('Network.enable'))]),5000,'passive page observers exceeded diagnostic bound');
   if(trace.finalized){record('late-page-observers-ignored',{sessionId});return;}
   record('page-observers-ready',{sessionId,url:fixtureURL(page.url()),qualification:'Page session only; no worker attachment or lifecycle command. Observers can perturb timing.'});
  }catch(error){record('page-observers-unavailable',{sessionId,error:error.message});}
 }
 return {
  directory:output,
  phase(name,details={}){if(!enabled)return;phase=name;record('phase',{...details});},
  async ready(page){if(enabled)await pageObservers.get(page);},
  mark(kind,data={}){
   if(!enabled)return;try{record(kind,{...data,workers:traces.map(trace=>({index:trace.index,details:trace.details,finalized:trace.finalized,versions:[...trace.versions.values()]}))});
   for(const trace of traces){if(trace.finalized)continue;const syncId='qcc-'+kind+'-'+process.hrtime.bigint();record('clock-marker-send',{index:trace.index,syncId});void bounded(Promise.resolve().then(()=>trace.cdp.send('Tracing.recordClockSyncMarker',{syncId})),5000,'clock marker acknowledgment exceeded diagnostic bound').then(()=>record('clock-marker-ack',{index:trace.index,syncId}),error=>record('clock-marker-unavailable',{index:trace.index,syncId,error:error.message}));}}catch(error){record('marker-unavailable',{kind,error:error.message});}
  },
  observeResponse(request,response,details){
   if(!enabled)return;
   try{const id=++responseId;record('server-request',{id,...details,method:request.method,url:fixtureURL(new URL(request.url,'http://127.0.0.1:4181').href)});
   const state=()=>{try{return {requestComplete:request.complete,requestDestroyed:request.destroyed,responseFinished:response.writableFinished,responseDestroyed:response.destroyed};}catch(error){return {unavailable:error.message};}};
   for(const name of ['aborted','close'])request.on(name,()=>record('server-request-'+name,{id,...state()}));
   for(const name of ['finish','close'])response.on(name,()=>record('server-response-'+name,{id,...state()}));}catch(error){record('server-observer-unavailable',{error:error.message});}
  },
  async observe(context,details){
   if(!enabled)return;let trace;const index=nextContext++;
   try{
    await mkdir(output,{recursive:true});
    const cdp=await bounded(context.browser().newBrowserCDPSession(),5000,'native trace session setup exceeded diagnostic bound');
    trace={index,details:{...diagnosticMetadata(details),phase},cdp,batches:[],bytes:0,retainedEvents:0,droppedEvents:0,count:0,nativeCount:0,writeFailed:false,versions:new Map(),pageCount:0,eventNames:new Set(),categoryCoverage:'unknown',complete:new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve))};
    cdp.on('Tracing.dataCollected',payload=>{
     if(trace.captureEnded){record('late-native-batch-ignored',{index,events:payload.value.length});return;}
     trace.count+=payload.value.length;for(const event of payload.value)if(trace.eventNames.size<256)trace.eventNames.add(event.name);
     trace.nativeCount+=payload.value.filter(event=>event.cat?.split(',').includes('ServiceWorker')).length;
     try{const value=JSON.stringify({value:payload.value.map(nativeEventMetadata)})+'\n',bytes=Buffer.byteLength(value);
      if(bytes>limits.traceBytesPerContext){trace.droppedEvents+=payload.value.length;return;}
      while(trace.batches.length&&trace.bytes+bytes>limits.traceBytesPerContext){const old=trace.batches.shift();trace.bytes-=old.bytes;trace.retainedEvents-=old.events;trace.droppedEvents+=old.events;}
      trace.batches.push({value,bytes,events:payload.value.length});trace.bytes+=bytes;trace.retainedEvents+=payload.value.length;
     }catch(error){trace.writeFailed=true;report('batch-write-failed',{index,error:error.message});}
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
    report('start',{index,...details,phase,metadata:runMetadata,limits,metadataFiltered:true,retention:'tail timeline; native metadata buffered as recent chunks until stop; oldest completed native files may be evicted at total cap',directory:output,qualification:'Native tracing can alter timing. Category events are not proof of universal native quiescence.'});
   }catch(error){if(trace){trace.finalized=true;if(!traces.includes(trace)){trace.captureEnded=true;record('unregistered-trace-buffer-discarded',{index,bytes:trace.bytes,events:trace.retainedEvents});trace.batches=[];trace.bytes=0;trace.retainedEvents=0;}}report('setup-unavailable',{index,...details,error:error.message});}
  },
  async failure(error,details){
   if(!enabled)return;
   // Caller awaits this before settling gates or closing contexts. Never throw
   // a collection error in place of the original failed assertion.
   if(failureCapture)return failureCapture;
   failureCapture=(async()=>{try{record('original-assertion-failure',{...details,message:error.message});snapshot('original-assertion-failure-before-cleanup-or-diagnostic-RPC');report('assertion-failure-before-cleanup',{...details,message:error.message});await Promise.all(traces.filter(trace=>!trace.stopping).map(trace=>stop(trace,'assertion-failure-before-cleanup')));}catch(collectionError){report('failure-capture-unavailable',{error:collectionError.message,originalError:error.message});}})();return failureCapture;
  }
 };
}
