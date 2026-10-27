export class MovieNetworkError extends Error {
 constructor(readonly kind:'network'|'timeout'|'service'|'invalid',readonly status?:number){super(kind);}
}

// Covers both fetch and JSON body reads. Detail requests can make two sequential
// eight-second upstream requests, so their browser deadline allows twenty seconds.
export async function movieJson(url:string,signal:AbortSignal,timeout=20000):Promise<any>{
 if(signal.aborted)throw new DOMException('Request cancelled','AbortError');
 const controller=new AbortController();let timedOut=false;
 const cancel=()=>controller.abort();signal.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeout);
 try{
  const response=await fetch(url,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',redirect:'error'});
  if(!response.ok)throw new MovieNetworkError('service',response.status);
  try{return await response.json();}catch(error){if(controller.signal.aborted)throw error;throw new MovieNetworkError('invalid');}
 }catch(error){
  if(signal.aborted)throw error;
  if(timedOut)throw new MovieNetworkError('timeout');
  if(error instanceof MovieNetworkError)throw error;
  throw new MovieNetworkError('network');
 }finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
}

export function movieNetworkMessage(error:unknown,subject:string){
 if(error instanceof MovieNetworkError&&error.kind==='timeout')return `${subject} timed out. Check your connection and try again.`;
 if(error instanceof MovieNetworkError&&error.kind==='network')return `${subject} could not be reached. Check your connection and try again.`;
 return `${subject} is temporarily unavailable. Try again.`;
}
