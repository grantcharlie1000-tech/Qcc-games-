import type {Database} from '../leaderboard/server';
// Shared by the runtime guard and both handlers. The emergency env override is
// checked on every call; only the DB flag is cached, for at most ten seconds.
const freezeCache=new WeakMap<object,{value:boolean;until:number}>();
export async function writeFrozen(db:Pick<Database,'query'>,env:NodeJS.ProcessEnv=process.env,now=Date.now()):Promise<boolean>{
 if(/^(1|true|yes|on)$/i.test(env.QCC_WRITE_FREEZE?.trim()??''))return true;
 let cached=freezeCache.get(db);
 if(!cached||cached.until<=now){
  const result=await db.query('SELECT write_freeze FROM qcc_runtime_flags WHERE id=true');
  if(result.rows.length!==1||typeof result.rows[0].write_freeze!=='boolean')throw new Error('Runtime flags unavailable');
  cached={value:result.rows[0].write_freeze,until:now+10000};freezeCache.set(db,cached);
 }
 return cached.value;
}
export function readOnlyResponse():Response {
 return Response.json({error:'read_only',retryable:true},{status:503,headers:{'Retry-After':'120','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
