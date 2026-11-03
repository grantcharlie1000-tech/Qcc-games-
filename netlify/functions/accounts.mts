import {getDatabase} from '@netlify/database';
import {createGuardedHandler} from '../lib/runtime.mts';
import type {Config} from '@netlify/functions';
import {createAccountsHandler} from '../../src/accounts/server';
import {isStorageFullError,storageFullResponse} from '../../server/storage-full';
let handle:ReturnType<typeof createAccountsHandler>|undefined;
export default async (request:Request)=>{
 try{handle??=createGuardedHandler(getDatabase().pool,createAccountsHandler,{allowMissingMarker:true});return await handle(request);}
 catch(error){if(isStorageFullError(error))return storageFullResponse();return Response.json({error:'Accounts temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});}
};
export const config:Config={rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:600}};
