/** Bound a loading UI even when a transport/body reader never settles on abort.
 * A restored page checks wall time because bfcache can suspend its timer. */
export function loadWithDeadline<T>(run:(signal:AbortSignal)=>Promise<T>,parent:AbortSignal,milliseconds:number,timeoutError:()=>Error):Promise<T>{
  return new Promise((resolve,reject)=>{
    if(parent.aborted){reject(parent.reason);return;}
    const request=new AbortController(),deadline=Date.now()+milliseconds;
    let settled=false;
    const finish=(complete:()=>void)=>{
      if(settled)return;
      settled=true;clearTimeout(timer);parent.removeEventListener('abort',cancel);
      if(typeof window!=='undefined')window.removeEventListener('pageshow',restored);
      complete();
    };
    const expire=()=>finish(()=>{reject(timeoutError());request.abort();});
    const cancel=()=>finish(()=>{reject(parent.reason);request.abort();});
    const restored=()=>{if(Date.now()>=deadline)expire();};
    const timer=setTimeout(expire,milliseconds);
    parent.addEventListener('abort',cancel,{once:true});
    if(typeof window!=='undefined')window.addEventListener('pageshow',restored);
    try{run(request.signal).then(value=>finish(()=>resolve(value)),error=>finish(()=>reject(error)));}
    catch(error){finish(()=>reject(error));}
  });
}
