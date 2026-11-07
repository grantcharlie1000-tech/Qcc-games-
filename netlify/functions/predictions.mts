import {getDatabase} from '@netlify/database';
import {createGuardedHandler} from '../lib/runtime.mts';
import type {Config} from '@netlify/functions';
import {createPredictionsHandler} from '../../src/predictions/server';
import {isStorageFullError,storageFullResponse} from '../../server/storage-full';
let handle:((request:Request)=>Promise<Response>)|undefined;
export default async (request:Request)=>{
 try{
  handle??=createGuardedHandler(getDatabase().pool,db=>createPredictionsHandler(db),{allowMissingMarker:true});
  return await handle(request);
 }catch(error){if(isStorageFullError(error))return storageFullResponse();return Response.json({error:'predictions_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
};
export const config:Config={rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:600}};
