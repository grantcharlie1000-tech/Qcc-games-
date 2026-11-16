import {getDatabase} from '@netlify/database';
import {createGuardedHandler} from '../lib/runtime.mts';
import type {Config} from '@netlify/functions';
import {createChessHandler} from '../../src/games/chess/online/server';
import {isStorageFullError,storageFullResponse} from '../../server/storage-full';
let handle:ReturnType<typeof createChessHandler>|undefined;
export default async (request:Request)=>{
 try{handle??=createGuardedHandler(getDatabase().pool,db=>createChessHandler(db),{allowMissingMarker:true});return await handle(request);}
 catch(error){if(isStorageFullError(error))return storageFullResponse();return Response.json({error:'Chess temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});}
};
// Ranked play polls about once a second per player; the per-account limit in the handler is the tighter guard.
export const config:Config={rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:600}};
