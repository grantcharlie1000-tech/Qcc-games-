import {getDatabase} from '@netlify/database';
import type {Config} from '@netlify/functions';
import {createAccountsHandler} from '../../src/accounts/server';
let handle:ReturnType<typeof createAccountsHandler>|undefined;
export default async (request:Request)=>{
 try{handle??=createAccountsHandler(getDatabase().pool);return await handle(request);}
 catch{return Response.json({error:'Accounts temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});}
};
export const config:Config={rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:600}};
