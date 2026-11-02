// Server-only database error classification. Never return or log driver messages/parameters.
import {STORAGE_FULL} from './shared';

export function storageFullResponse(error:unknown):Response|undefined {
 const seen=new Set<unknown>();
 for(let current=error;current&&typeof current==='object'&&!seen.has(current);){
  seen.add(current);
  const {code,message,cause}=current as {code?:unknown;message?:unknown;cause?:unknown};
  if(code==='53100'||code==='53400'||[code,message].some(value=>typeof value==='string'&&/project[ _-]+size[ _-]+limit/i.test(value)))
   return Response.json(STORAGE_FULL,{status:507,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  current=cause;
 }
 return undefined;
}
