import {STORAGE_FULL_MESSAGE} from '../src/core/storage-full';

// Drivers may wrap the Postgres error in a cause or a pool AggregateError.
// Inspect only error metadata; never return or log database details.
export function isStorageFullError(error:unknown):boolean {
 const seen=new Set<object>();
 const capacityMessage=/\b(?:disk_full|configuration_limit_exceeded|no space left on device)\b|\bproject[ _-]+size[ _-]+limit/i;
 function matches(value:unknown):boolean {
  if(typeof value==='string')return capacityMessage.test(value);
  if(!value||typeof value!=='object'||seen.has(value))return false;
  seen.add(value);
  const item=value as {code?:unknown;sqlState?:unknown;sqlstate?:unknown;message?:unknown;detail?:unknown;cause?:unknown;errors?:unknown};
  return [item.code,item.sqlState,item.sqlstate].some(code=>code==='53100'||code==='53400')
   ||matches(item.code)
   ||matches(item.message)||matches(item.detail)||matches(item.cause)
   ||(Array.isArray(item.errors)&&item.errors.some(matches));
 }
 return matches(error);
}
export function storageFullResponse():Response {
 return Response.json({error:'storage_full',message:STORAGE_FULL_MESSAGE},{status:507,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
