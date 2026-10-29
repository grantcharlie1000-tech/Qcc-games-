import {writeFrozen,readOnlyResponse} from '../../src/accounts/write-freeze';
import type {Database} from '../../src/leaderboard/server';
export type Environment='production'|'preview'|'development';
interface Options {
 allowMissingMarker?:boolean; context?:string; expectedEnv?:string; env?:NodeJS.ProcessEnv;
 now?:()=>number; log?:(message:string)=>void;
}
export function expectedEnvironment(context:string|undefined):Environment {
 if(context==='production')return 'production';
 if(context==='deploy-preview'||context==='branch-deploy')return 'preview';
 if(!context||context==='dev'||context==='development'||context==='test')return 'development';
 throw new Error('Unrecognized deploy context');
}
export {writeFrozen as isWriteFrozen} from '../../src/accounts/write-freeze';
export function createGuardedHandler(pool:Database,factory:(db:Database)=>(request:Request)=>Promise<Response>,options:Options={}){
 const env=options.env??process.env;const now=options.now??Date.now;
 let checked:Promise<void>|undefined;const handle=factory(pool);
 async function check(){
  const netlify=(globalThis as typeof globalThis&{Netlify?:{context?:{deploy?:{context?:string}}}}).Netlify;
  const expected=expectedEnvironment(options.context??netlify?.context?.deploy?.context??env.CONTEXT);
  const explicit=options.expectedEnv??env.QCC_DB_EXPECTED_ENV;
  if(explicit&&explicit!==expected)throw new Error('Expected environment conflicts with deploy context');
  const result=await pool.query('SELECT name FROM qcc_environment WHERE id=true');
  if(!result.rows.length&&options.allowMissingMarker)return;
  if(result.rows.length!==1||result.rows[0].name!==expected)throw new Error('Database environment mismatch');
 }
 return async(request:Request):Promise<Response>=>{
  try{
   // Retry a failed check on the next request, but never allow the handler before it passes.
   checked??=check().catch(error=>{checked=undefined;throw error;});await checked;
   if(await writeFrozen(pool,env,now())&&!['GET','HEAD'].includes(request.method))return readOnlyResponse();
   return await handle(request);
  }catch{
   // Never log driver errors: they can contain URLs, SQL parameters, or row contents.
   (options.log??console.error)('QCC database access refused: environment, flags, or connection unavailable.');
   return Response.json({error:'Service temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
 };
}
