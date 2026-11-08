import {getPool} from '../lib/db.mts';
import {createGuardedHandler} from '../lib/runtime.mts';
import {netlifyMediaStore} from '../lib/media-store.mts';
import type {Config} from '@netlify/functions';
import {createSocialHandler} from '../../src/social/server';
import {isStorageFullError,storageFullResponse} from '../../server/storage-full';
let handle:((request:Request)=>Promise<Response>)|undefined;
export default async (request:Request)=>{
 try{
  if(!handle){const store=await netlifyMediaStore();handle=createGuardedHandler(getPool(),db=>createSocialHandler(db,store),{allowMissingMarker:false});}
  return await handle(request);
 }catch(error){if(isStorageFullError(error))return storageFullResponse();return Response.json({error:'Social temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});}
};
export const config:Config={rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:600}};
