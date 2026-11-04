import {getDatabase} from '@netlify/database';
import {createGuardedHandler} from '../lib/runtime.mts';
import {netlifyMediaStore} from '../lib/media-store.mts';
import type {Config} from '@netlify/functions';
import {createMediaHandler} from '../../src/media/server';
import {isStorageFullError,storageFullResponse} from '../../server/storage-full';
let handle:((request:Request)=>Promise<Response>)|undefined;
export default async (request:Request)=>{
 try{
  if(!handle){
   const store=await netlifyMediaStore();
   const maxTotalBytes=Number(process.env.QCC_MEDIA_MAX_TOTAL_BYTES)||undefined;
   handle=createGuardedHandler(getDatabase().pool,db=>createMediaHandler(db,store,{maxTotalBytes}),{allowMissingMarker:true});
  }
  return await handle(request);
 }catch(error){if(isStorageFullError(error))return storageFullResponse();return Response.json({error:'Media temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});}
};
export const config:Config={rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:1200}};
