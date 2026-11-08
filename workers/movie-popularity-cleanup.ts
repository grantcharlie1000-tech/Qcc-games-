import {cleanupMoviePopularity, type PopularityEnv} from '../server/movie-popularity';

export interface PopularityScheduledController {scheduledTime:number;cron:string}
export interface PopularityWaitUntil {waitUntil(promise:Promise<unknown>):void}

/** Deletes expired popularity rows even when nobody is watching and collection is off.
 * This is not a Pages Function: `functions/` is what Pages publishes, and Pages has no cron.
 * Do not add a wrangler config that binds a database until that deploy is separately approved.
 * The handler does not log tokens, addresses, secrets, or the database error. */
export async function onMoviePopularityScheduled(_controller:PopularityScheduledController,env:PopularityEnv,ctx:PopularityWaitUntil):Promise<void>{
 const db=env.MOVIE_POPULARITY_DB;
 if(!db)return;
 const at=Number.isFinite(_controller.scheduledTime)?_controller.scheduledTime:Date.now();
 const work=cleanupMoviePopularity(db,at).then(()=>undefined,()=>{throw new Error('movie_popularity_cleanup_failed');});
 ctx.waitUntil(work);
 await work;
}
