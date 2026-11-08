import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {LocalDB,createLocalPool} from '../support/local-db';
import {createAccountsHandler} from '../../src/accounts/server';
import {createStudyLinkHandler} from '../../server/study-pairing';
import {createApp} from '../../server/app';
import type {Database} from '../../src/leaderboard/server';
const local=new LocalDB();let db:ReturnType<typeof createLocalPool>;
const origin='https://study.test';
const env={QCC_WHETU_PAIRING:'on',QCC_NCEASTUDY_ORIGIN:origin};
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
beforeAll(async()=>{db=createLocalPool(await local.start());await local.applyMigrations('db/migrations');},30000);
afterAll(async()=>{await db?.end();await local.stop();});
beforeEach(async()=>{await db.query('TRUNCATE arcade_players,account_attempts CASCADE');});
async function signup(username='Alice',database:Database=db,trusted=true){
 const response=await createAccountsHandler(database,{trustedStudyProxy:()=>trusted})(new Request(origin+'/accounts?action=signup',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username,password:'a test password'})}));
 expect(response.status).toBe(201);
 return {...await response.json(),cookie:response.headers.getSetCookie()[0]?.split(';')[0] as string|undefined};
}
function select(token?:string,cookie?:string){return createStudyLinkHandler(db,{env})(new Request(origin+'/study-link?action=select',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{})},body:'{}'}));}
it('auth mints exact-session authority, and selection is read-only',async()=>{
 const user=await signup();expect(user.cookie).toMatch(/^__Host-nceastudy_browser=[a-f0-9]{64}$/);
 const before=(await db.query('SELECT * FROM qcc_study_browsers')).rows;
 expect(before).toHaveLength(1);expect(before[0].qcc_session_hash).toBe(sha(user.token));
 const response=await select(user.token,user.cookie);expect(response.status).toBe(200);expect(response.headers.getSetCookie()).toEqual([]);
 expect((await db.query('SELECT * FROM qcc_study_browsers')).rows).toEqual(before);
});
it('late anonymous and other-tab selection cannot clear or rebind authority or revoke QCC',async()=>{
 const alice=await signup(),bob=await signup('Bob');const before=(await db.query('SELECT * FROM qcc_study_browsers ORDER BY digest')).rows;
 const responses=await Promise.all([select(undefined,bob.cookie),select(alice.token,bob.cookie),select(bob.token,alice.cookie)]);
 expect(responses.map(r=>r.status)).toEqual([401,409,409]);for(const response of responses)expect(response.headers.getSetCookie()).toEqual([]);
 expect((await db.query('SELECT * FROM qcc_study_browsers ORDER BY digest')).rows).toEqual(before);
 expect((await db.query('SELECT * FROM account_sessions')).rows).toHaveLength(2);
});
it('untrusted authentication stays usable but cannot mint Study authority',async()=>{
 const user=await signup('Alice',db,false);expect(user.cookie).toBeUndefined();expect((await select(user.token)).status).toBe(409);
 expect((await db.query('SELECT * FROM account_sessions')).rows).toHaveLength(1);expect((await db.query('SELECT * FROM qcc_study_browsers')).rows).toHaveLength(0);
});
it('optional Study metadata failure preserves QCC signup and rotates to an unbound proof',async()=>{
 const broken:Database={query:db.query.bind(db),connect:async()=>{const client=await db.connect();return {query:async(sql,values)=>{if(sql.startsWith('INSERT INTO qcc_study_browsers'))return client.query('SELECT 1/0');return client.query(sql,values);},release:()=>client.release()};}};
 const user=await signup('Alice',broken);expect(user.cookie).toMatch(/^__Host-nceastudy_browser=[a-f0-9]{64}$/);
 expect((await db.query('SELECT * FROM account_sessions')).rows).toHaveLength(1);expect((await select(user.token,user.cookie)).status).toBe(409);
});
it('revoked exact session cannot regain authority by selecting it',async()=>{
 const user=await signup();await db.query('DELETE FROM account_sessions WHERE token_hash=$1',[sha(user.token)]);
 expect((await select(user.token,user.cookie)).status).toBe(401);expect((await db.query('SELECT * FROM account_sessions')).rows).toHaveLength(0);
});
it('HTTP provenance headers cannot substitute for trusted adapter context',async()=>{
 const app=createApp({env:{...env,QCC_ALLOWED_ORIGINS:origin},database:()=>db});
 const request=(username:string)=>new Request(origin+'/api/accounts?action=signup',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','x-qcc-public-origin':origin,'x-qcc-internal-study-account-origin':origin},body:JSON.stringify({username,password:'a test password'})});
 const forged=await app(request('Forged'));expect(forged.status).toBe(201);expect(forged.headers.getSetCookie()).toEqual([]);
 const trusted=await app(request('Trusted'),'',{studyAccountOrigin:origin});expect(trusted.status).toBe(201);expect(trusted.headers.getSetCookie()[0]).toMatch(/^__Host-nceastudy_browser=/);
 expect((await db.query('SELECT * FROM qcc_study_browsers')).rows).toHaveLength(1);
});
