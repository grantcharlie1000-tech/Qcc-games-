import {getPool} from '../lib/db.mts';
import {createGuardedHandler} from '../lib/runtime.mts';
import type {Config} from '@netlify/functions';
import {createLeaderboardHandler} from '../../src/leaderboard/server';
let handle:ReturnType<typeof createLeaderboardHandler>|undefined;
export default async (request:Request)=>{
 try{handle??=createGuardedHandler(getPool(),createLeaderboardHandler,{allowMissingMarker:false});return await handle(request);}
 catch{return Response.json({error:'Leaderboard temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});}
};
export const config:Config={rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:300}};
