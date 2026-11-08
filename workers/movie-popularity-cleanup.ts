import {cleanupMoviePopularity, type PopularityEnv} from '../server/movie-popularity';

export interface PopularityScheduledController {scheduledTime:number|Date;cron:string}
export interface PopularityWaitUntil {waitUntil(promise:Promise<unknown>):void}

function scheduledInstant(value:number|Date|undefined){
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(value instanceof Date&&Number.isFinite(value.getTime()))return value.getTime();
 return Date.now();
}

/** Deletes expired popularity rows even when nobody is watching and collection is off.
 * This is not a Pages Function: `functions/` is what Pages publishes, and Pages has no cron.
 * Do not add a wrangler config that binds a database until that deploy is separately approved.
 * The handler does not log tokens, addresses, secrets, or the database error. */
export async function onMoviePopularityScheduled(controller:PopularityScheduledController,env:PopularityEnv,ctx:PopularityWaitUntil):Promise<void>{
 const db=env.MOVIE_POPULARITY_DB;
 if(!db)return;
 const work=cleanupMoviePopularity(db,scheduledInstant(controller.scheduledTime)).then(()=>undefined,()=>{throw new Error('movie_popularity_cleanup_failed');});
 ctx.waitUntil(work);
 await work;
}

const worker={
 async fetch(){return new Response(null,{status:404,headers:{'cache-control':'no-store'}});},
 scheduled(controller:PopularityScheduledController,env:PopularityEnv,ctx:PopularityWaitUntil){return onMoviePopularityScheduled(controller,env,ctx);},
};
export default worker;
