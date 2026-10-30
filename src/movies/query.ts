import {movieJson,MovieNetworkError} from './network';

export const SEARCH_STALE=300_000,DEFAULT_STALE=900_000,RETRY_DELAYS=[500,1500],CACHE_LIMIT=100;
export interface QueryOptions{staleTime?:number;timeout?:number}
export interface QueryResult<T=any>{data:T;stale:boolean}

// In-memory only. Map insertion order doubles as recency: a stored URL moves to the end.
const cache=new Map<string,{data:unknown;time:number}>();
const RETRY_STATUSES=[429,502,504];

const abortError=()=>new DOMException('Request cancelled','AbortError');

// Waits out a retry delay, but rejects as soon as the caller aborts.
function pause(ms:number,signal:AbortSignal){
 return new Promise<void>((resolve,reject)=>{
  if(signal.aborted)return reject(abortError());
  const timer=setTimeout(()=>{signal.removeEventListener('abort',onAbort);resolve();},ms);
  function onAbort(){clearTimeout(timer);reject(abortError());}
  signal.addEventListener('abort',onAbort,{once:true});
 });
}

// Dropped connections and transient gateway or rate-limit responses are worth another attempt.
function retryable(error:unknown){
 return error instanceof MovieNetworkError&&(error.kind==='network'||(error.kind==='service'&&RETRY_STATUSES.includes(error.status??0)));
}

// Stale data stands in for an unavailable service only, never for a definitive answer such as 404.
function unavailable(error:unknown){
 if(!(error instanceof MovieNetworkError))return false;
 return error.kind==='service'?error.status===429||(error.status??0)>=500:true;
}

export async function cachedJson<T=any>(url:string,signal:AbortSignal,options?:QueryOptions):Promise<QueryResult<T>>{
 if(signal.aborted)throw abortError();
 const{staleTime=DEFAULT_STALE,timeout}=options??{};
 const cached=cache.get(url);
 if(cached&&Date.now()-cached.time<staleTime)return{data:cached.data as T,stale:false};
 for(let attempt=0;;attempt++){
  try{
   const data=await movieJson(url,signal,timeout);
   cache.delete(url);cache.set(url,{data,time:Date.now()});
   while(cache.size>CACHE_LIMIT)cache.delete(cache.keys().next().value as string);
   return{data,stale:false};
  }catch(error){
   if(signal.aborted)throw error;
   if(attempt<RETRY_DELAYS.length&&retryable(error)){await pause(RETRY_DELAYS[attempt],signal);continue;}
   // Read the cache again: a concurrent call may have stored a newer copy while this one waited.
   const copy=cache.get(url);
   if(copy&&unavailable(error))return{data:copy.data as T,stale:true};
   throw error;
  }
 }
}

export function clearQueryCache(){cache.clear();}
// An answer is used only while the page still wants the request it answers. A genre or search the page has moved away from is dropped.
export const answersRequest=(wantedKey:string|undefined,answerKey:string)=>wantedKey===answerKey;
