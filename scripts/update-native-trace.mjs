import {mkdir} from 'node:fs/promises';
import {appendFileSync} from 'node:fs';

// Optional diagnostics only. Collection failures must not change the update
// assertions, the original thrown error, or cleanup of test-owned contexts.
export function createUpdateNativeTrace({enabled=false,directory,log=console.error}){
 const output=directory+'/run-'+Date.now()+'-'+process.pid;
 const traces=[];
 const report=(kind,data={})=>{
  const value={at:new Date().toISOString(),kind,...data};
  try{appendFileSync(output+'/observations.jsonl',JSON.stringify(value)+'\n');}catch(error){try{log('NATIVE TRACE WRITE FAILED',error.message);}catch{}}
  try{log('NATIVE TRACE',JSON.stringify(value));}catch{}
 };
 const bounded=async(task,ms,label)=>{let timer;try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label)),ms);})]);}finally{clearTimeout(timer);}};
 async function stop(trace,reason){
  if(trace.stopping)return trace.stopping;
  trace.stopping=(async()=>{
   report('end-request',{index:trace.index,reason});
   try{
    await bounded(trace.cdp.send('Tracing.end'),5000,'native trace end command exceeded diagnostic bound');
    const result=await bounded(trace.complete,15000,'native trace flush exceeded diagnostic bound');
    report('complete',{index:trace.index,result,eventCount:trace.count,nativeEventCount:trace.nativeCount,usable:trace.nativeCount>0&&!trace.writeFailed&&result.dataLossOccurred===false});
   }catch(error){report('unavailable',{index:trace.index,reason,error:error.message,eventCount:trace.count});}
  })();return trace.stopping;
 }
 return {
  directory:output,
  async observe(context,details){
   if(!enabled)return;
   try{
    await mkdir(output,{recursive:true});
    const index=traces.length,cdp=await bounded(context.browser().newBrowserCDPSession(),5000,'native trace session setup exceeded diagnostic bound');
    const trace={index,cdp,count:0,nativeCount:0,writeFailed:false,complete:new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve))};
    cdp.on('Tracing.dataCollected',payload=>{
     trace.count+=payload.value.length;
     trace.nativeCount+=payload.value.filter(event=>event.cat?.split(',').includes('ServiceWorker')).length;
     try{appendFileSync(`${output}/service-worker-${index}.jsonl`,JSON.stringify(payload)+'\n');}catch(error){trace.writeFailed=true;report('batch-write-failed',{index,error:error.message});}
    });
    await bounded(cdp.send('Tracing.start',{categories:'ServiceWorker',transferMode:'ReportEvents',tracingBackend:'chrome'}),5000,'native trace start exceeded diagnostic bound');
    traces.push(trace);
    const close=context.close.bind(context);context.close=async(...args)=>{try{await stop(trace,'context-close');}finally{return close(...args);}};
    await bounded(cdp.send('Tracing.recordClockSyncMarker',{syncId:'qcc-native-start-'+Date.now()+'-'+index}),5000,'native trace clock marker exceeded diagnostic bound');
    report('start',{index,...details,directory:output,qualification:'Native tracing can alter timing. Category events are not proof of universal native quiescence.'});
   }catch(error){report('setup-unavailable',{...details,error:error.message});}
  },
  async failure(error,details){
   if(!enabled)return;
   // Caller awaits this before settling gates or closing contexts. Never throw
   // a collection error in place of the original failed assertion.
   try{report('assertion-failure-before-cleanup',{...details,message:error.message});await Promise.all(traces.map(trace=>stop(trace,'assertion-failure-before-cleanup')));}catch(collectionError){report('failure-capture-unavailable',{error:collectionError.message,originalError:error.message});}
  }
 };
}
