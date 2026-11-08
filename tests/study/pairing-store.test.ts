import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type {Pool} from 'pg';
import {LocalDB,createLocalPool} from '../support/local-db';
import {createPostgresPairingStore} from '../../server/study-pairing-store';
import type {PairingIntent} from '../../server/study-pairing-core';
const local=new LocalDB();let pool:Pool;let store:ReturnType<typeof createPostgresPairingStore>;
const hash=()=>randomBytes(32).toString('hex');
let accountId:string,sessionHash:string,browserDigest:string,browserEpoch:string;
const whetuSessionId="whetu-session-one";
beforeAll(async()=>{pool=createLocalPool(await local.start());await local.applyMigrations('db/migrations');store=createPostgresPairingStore(pool);},30000);
afterAll(async()=>{await pool?.end();await local.stop();});
beforeEach(async()=>{
 await pool.query('TRUNCATE qcc_study_browsers,qcc_study_contexts,qcc_study_links,qcc_study_pairing_intents,account_attempts,account_saves,account_sessions,accounts,arcade_players CASCADE');
 accountId=randomUUID();sessionHash=hash();const player=hash();
 await pool.query('INSERT INTO arcade_players(id,name) VALUES($1,$2)',[player,'Student']);
 await pool.query("INSERT INTO accounts(id,username,password_hash,player_id) VALUES($1,'Student','scrypt$fixture',$2)",[accountId,player]);
 await pool.query("INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[sessionHash,accountId]);
 browserDigest=hash();browserEpoch=(await store.selectBrowser({digest:browserDigest,qccAccountId:accountId,qccSessionHash:sessionHash,now:Date.now()}))!.epoch;
});
function intent():PairingIntent {const now=Date.now();return {digest:hash(),browserDigest,browserEpoch,scope:'qcc:whetu:link:v1',returnPath:'/nceastudy',qccAccountId:accountId,qccSessionHash:sessionHash,qccConsentedAt:now,expiresAt:now+300000,state:'pending'};}
async function reviewed(subject='project:user') {
 const i=intent();expect(await store.create(i)).toBe('created');const challengeDigest=hash();
 expect(await store.review({digest:i.digest,browserDigest,browserEpoch,whetuSessionId,whetuSubject:subject,challengeDigest,now:Date.now()})).toBe(true);
 return {digest:i.digest,browserDigest,browserEpoch,whetuSessionId,whetuSubject:subject,challengeDigest,now:Date.now(),whetuAuthenticatedAt:Date.now()-1000,contextDigest:hash(),contextExpiresAt:Date.now()+900000};
}
it('persists hash-only intent and immutable review binding',async()=>{
 const i=intent();expect(await store.create(i)).toBe('created');expect(await store.read(i.digest)).toEqual(i);
 const challengeDigest=hash();expect(await store.review({digest:i.digest,browserDigest,browserEpoch,whetuSessionId,whetuSubject:'project:first',challengeDigest,now:Date.now()})).toBe(true);
 expect(await store.review({digest:i.digest,browserDigest,browserEpoch,whetuSessionId,whetuSubject:'project:other',challengeDigest:hash(),now:Date.now()})).toBe(false);
 expect((await store.read(i.digest))?.whetuSubject).toBe('project:first');
});
it('limits per-account intent starts atomically without writing extra intent',async()=>{
 const results=await Promise.all(Array.from({length:8},()=>store.create(intent())));
 expect(results.filter(r=>r==='created')).toHaveLength(5);expect(results.filter(r=>r==='rate-limited')).toHaveLength(3);
 expect((await pool.query('SELECT * FROM qcc_study_pairing_intents')).rows).toHaveLength(5);
});
it('commits link and context once; replay cannot issue a second context',async()=>{
 const input=await reviewed();const results=await Promise.all([store.commit(input),store.commit({...input,contextDigest:hash()})]);
 expect(results.sort()).toEqual(['invalid','linked']);expect((await pool.query('SELECT * FROM qcc_study_links')).rows).toHaveLength(1);
 expect((await pool.query('SELECT * FROM qcc_study_contexts')).rows).toHaveLength(1);expect((await store.read(input.digest))?.state).toBe('consumed');
 expect(await store.verifyContext({digest:input.contextDigest,browserDigest,whetuSessionId,whetuSubject:input.whetuSubject,now:Date.now()})).toMatchObject({qccAccountId:accountId,whetuSubject:input.whetuSubject});
});
it('cancellation, expired intent, wrong challenge and wrong subject never commit',async()=>{
 const a=await reviewed();await store.cancel(a.digest,browserDigest);expect(await store.commit(a)).toBe('invalid');
 const b=await reviewed();await pool.query('UPDATE qcc_study_pairing_intents SET qcc_consented_at=$2,expires_at=$3 WHERE digest=$1',[b.digest,Date.now()-301000,Date.now()-1000]);expect(await store.commit(b)).toBe('invalid');
 const c=await reviewed();expect(await store.commit({...c,challengeDigest:hash()})).toBe('invalid');expect(await store.commit({...c,whetuSubject:'other:user'})).toBe('invalid');
 expect((await pool.query('SELECT * FROM qcc_study_links')).rows).toHaveLength(0);
});
it('rechecks QCC session revocation, expiry, and authentication age inside commit',async()=>{
 for(const change of ['DELETE FROM account_sessions','UPDATE account_sessions SET expires_at=now()-interval \'1 second\'','UPDATE account_sessions SET created_at=now()-interval \'11 minutes\'']) {
  const input=await reviewed();await pool.query(change);expect(await store.commit(input)).toBe('invalid');
  await pool.query('DELETE FROM account_sessions');await pool.query("INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[sessionHash,accountId]);
 }
 expect((await pool.query('SELECT * FROM qcc_study_contexts')).rows).toHaveLength(0);
});
it('rejects stale/future Whetū proof and excessive context lifetime using DB time, not caller now',async()=>{
 const input=await reviewed();
 for(const patch of [{whetuAuthenticatedAt:Date.now()-601000},{whetuAuthenticatedAt:Date.now()+60000},{contextExpiresAt:Date.now()+1000000},{now:0,whetuAuthenticatedAt:0}])expect(await store.commit({...input,...patch})).toBe('invalid');
 expect((await pool.query('SELECT * FROM qcc_study_links')).rows).toHaveLength(0);
});
it('one-to-one conflicts preserve existing links and game saves',async()=>{
 await pool.query("INSERT INTO account_saves(account_id,key,value,updated) VALUES($1,'best:snake','12',1)",[accountId]);
 const a=await reviewed();expect(await store.commit(a)).toBe('linked');const before=(await pool.query('SELECT * FROM account_saves')).rows;
 const b=await reviewed('project:other');expect(await store.commit(b)).toBe('conflict');
 expect((await pool.query('SELECT * FROM account_saves')).rows).toEqual(before);
 expect((await pool.query('SELECT whetu_subject FROM qcc_study_links')).rows).toEqual([{whetu_subject:'project:user'}]);
 // The Whetū unique constraint also applies independently of the QCC primary key.
 const second=randomUUID(),player=hash();await pool.query("INSERT INTO arcade_players(id,name) VALUES($1,'Other')",[player]);await pool.query("INSERT INTO accounts(id,username,password_hash,player_id) VALUES($1,'Other','scrypt$fixture',$2)",[second,player]);
 await expect(pool.query('INSERT INTO qcc_study_links(qcc_account_id,whetu_subject,linked_at) VALUES($1,$2,$3)',[second,'project:user',Date.now()])).rejects.toMatchObject({code:'23505'});
});
it('context requires exact Whetū identity, live QCC session and active mapping; revoke preserves link',async()=>{
 const input=await reviewed();expect(await store.commit(input)).toBe('linked');const query={digest:input.contextDigest,browserDigest,whetuSessionId,whetuSubject:input.whetuSubject,now:Date.now()};
 expect(await store.verifyContext({...query,whetuSubject:'project:other'})).toBeNull();
 await pool.query("UPDATE account_sessions SET created_at=now()-interval '1 day'");expect(await store.verifyContext(query)).not.toBeNull();
 await store.revokeContext(input.contextDigest);expect(await store.verifyContext(query)).toBeNull();expect((await pool.query('SELECT * FROM qcc_study_links')).rows).toHaveLength(1);
});
it('expired context and revoked QCC sessions cannot access linked workspace',async()=>{
 const input=await reviewed();expect(await store.commit(input)).toBe('linked');const query={digest:input.contextDigest,browserDigest,whetuSessionId,whetuSubject:input.whetuSubject,now:0};
 await pool.query('UPDATE qcc_study_contexts SET expires_at=$1',[Date.now()-1]);expect(await store.verifyContext(query)).toBeNull();
 await pool.query('UPDATE qcc_study_contexts SET expires_at=$1',[Date.now()+10000]);await pool.query('DELETE FROM account_sessions');expect(await store.verifyContext(query)).toBeNull();
});
it('migration is locally idempotent; public and unprivileged roles cannot read identity tables',async()=>{
 await pool.query(await readFile('db/migrations/20261108120000_study_pairing.sql','utf8'));
 await pool.query("DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='pairing_untrusted_test') THEN CREATE ROLE pairing_untrusted_test; END IF; END $$");
 const client=await pool.connect();try {
  await client.query('SET ROLE pairing_untrusted_test');
  for(const table of ['qcc_study_browsers','qcc_study_pairing_intents','qcc_study_links','qcc_study_contexts'])await expect(client.query('SELECT * FROM '+table)).rejects.toMatchObject({code:'42501'});
 }finally{await client.query('RESET ROLE');client.release();}
});
it('context write failure rolls back link insertion and intent consumption together',async()=>{
 const input=await reviewed();await pool.query('INSERT INTO qcc_study_contexts(digest,qcc_account_id,qcc_session_hash,whetu_subject,expires_at,browser_digest,browser_epoch,whetu_session_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[input.contextDigest,accountId,sessionHash,'project:preexisting',Date.now()+10000,browserDigest,browserEpoch,whetuSessionId]);
 await expect(store.commit(input)).rejects.toMatchObject({code:'23505'});
 expect((await pool.query('SELECT * FROM qcc_study_links')).rows).toHaveLength(0);
 expect((await store.read(input.digest))?.state).toBe('pending');
});
it('cancelling an already consumed transaction preserves its immutable link',async()=>{
 const input=await reviewed();expect(await store.commit(input)).toBe('linked');await store.cancel(input.digest,browserDigest);
 expect((await store.read(input.digest))?.state).toBe('consumed');expect((await pool.query('SELECT * FROM qcc_study_links')).rows).toHaveLength(1);
 await pool.query('DELETE FROM qcc_study_links');expect(await store.verifyContext({digest:input.contextDigest,browserDigest,whetuSessionId,whetuSubject:input.whetuSubject,now:Date.now()})).toBeNull();
});
it('RLS denies identity rows even if a client role is accidentally granted SELECT',async()=>{
 const input=await reviewed();expect(await store.commit(input)).toBe('linked');
 await pool.query("DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='pairing_rls_test') THEN CREATE ROLE pairing_rls_test; END IF; END $$");
 await pool.query('GRANT SELECT ON qcc_study_browsers,qcc_study_links,qcc_study_contexts,qcc_study_pairing_intents TO pairing_rls_test');
 const client=await pool.connect();try{await client.query('SET ROLE pairing_rls_test');for(const table of ['qcc_study_browsers','qcc_study_links','qcc_study_contexts','qcc_study_pairing_intents'])expect((await client.query('SELECT * FROM '+table)).rows).toEqual([]);}
 finally{await client.query('RESET ROLE');client.release();await pool.query('REVOKE ALL ON qcc_study_browsers,qcc_study_links,qcc_study_contexts,qcc_study_pairing_intents FROM pairing_rls_test');}
});
it('authentication expiring during link insertion rolls back all pairing writes',async()=>{
 const input=await reviewed();
 const delayed=createPostgresPairingStore({query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();return {query:async(sql,params)=>{const result=await client.query(sql,params);if(sql.includes('INSERT INTO qcc_study_links')){await client.query("UPDATE account_sessions SET expires_at=clock_timestamp()+interval '50 milliseconds' WHERE token_hash=$1",[sessionHash]);await client.query('SELECT pg_sleep(0.1)');}return result;},release:()=>client.release()};}});
 expect(await delayed.commit(input)).toBe('invalid');
 expect((await pool.query('SELECT * FROM qcc_study_links')).rows).toEqual([]);expect((await pool.query('SELECT * FROM qcc_study_contexts')).rows).toEqual([]);expect((await store.read(input.digest))?.state).toBe('pending');
});
it('fresh explicit proofs can renew context for the exact immutable pair without rewriting link time',async()=>{
 const a=await reviewed();expect(await store.commit(a)).toBe('linked');const before=(await pool.query('SELECT * FROM qcc_study_links')).rows;
 const b=await reviewed();expect(await store.commit(b)).toBe('linked');expect((await pool.query('SELECT * FROM qcc_study_links')).rows).toEqual(before);expect((await pool.query('SELECT * FROM qcc_study_contexts')).rows).toHaveLength(2);
});
it('another QCC account cannot claim an already-bound Whetū subject',async()=>{
 const a=await reviewed();expect(await store.commit(a)).toBe('linked');
 const player=hash();accountId=randomUUID();sessionHash=hash();await pool.query("INSERT INTO arcade_players(id,name) VALUES($1,'Second')",[player]);await pool.query("INSERT INTO accounts(id,username,password_hash,player_id) VALUES($1,'Second','scrypt$fixture',$2)",[accountId,player]);await pool.query("INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[sessionHash,accountId]);
 browserEpoch=(await store.selectBrowser({digest:browserDigest,qccAccountId:accountId,qccSessionHash:sessionHash,now:Date.now()}))!.epoch;
 const b=await reviewed();expect(await store.commit(b)).toBe('conflict');expect((await pool.query('SELECT * FROM qcc_study_links')).rows).toHaveLength(1);expect((await store.read(b.digest))?.state).toBe('pending');
});
it('same browser selection is idempotent and preserves active context across reload',async()=>{
 const input=await reviewed();expect(await store.commit(input)).toBe('linked');
 const reloaded=createPostgresPairingStore(pool);
 expect(await reloaded.selectBrowser({digest:browserDigest,qccAccountId:accountId,qccSessionHash:sessionHash,now:0})).toEqual({epoch:browserEpoch,changed:false});
 expect(await reloaded.getBrowser(browserDigest)).toEqual({digest:browserDigest,epoch:browserEpoch,qccAccountId:accountId,qccSessionHash:sessionHash});
 expect(await reloaded.verifyContext({...input,digest:input.contextDigest})).not.toBeNull();
});
it('server browser selection rejects both stale intents and old context without client markers or session deletion',async()=>{
 const active=await reviewed();expect(await store.commit(active)).toBe('linked');
 const [first,second]=await Promise.all([reviewed(),reviewed()]);
 const switched=await store.selectBrowser({digest:browserDigest,qccAccountId:null,qccSessionHash:null,now:0});
 expect(switched).toEqual({epoch:String(BigInt(browserEpoch)+1n),changed:true});
 expect((await pool.query('SELECT * FROM account_sessions')).rows).toHaveLength(1);
 const reloaded=createPostgresPairingStore(pool);
 expect(await reloaded.commit(first)).toBe('invalid');expect(await reloaded.commit(second)).toBe('invalid');
 expect(await reloaded.verifyContext({...active,digest:active.contextDigest})).toBeNull();
 expect(await reloaded.create(intent())).toBe('invalid');
 expect((await store.read(first.digest))?.state).toBe('cancelled');
});
it('same-account new session changes epoch and rejects same-user Whetū session replay',async()=>{
 const input=await reviewed();
 expect(await store.review({...input,whetuSessionId:'different-session'})).toBe(false);
 expect(await store.commit({...input,whetuSessionId:'different-session'})).toBe('invalid');
 expect(await store.commit(input)).toBe('linked');
 expect(await store.verifyContext({...input,digest:input.contextDigest,whetuSessionId:'different-session'})).toBeNull();
 const next=hash();await pool.query("INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[next,accountId]);
 expect(await store.selectBrowser({digest:browserDigest,qccAccountId:accountId,qccSessionHash:next,now:0})).toEqual({epoch:String(BigInt(browserEpoch)+1n),changed:true});
 expect(await store.verifyContext({...input,digest:input.contextDigest})).toBeNull();
});
it('cancel is browser scoped and never deletes an existing context',async()=>{
 const active=await reviewed();expect(await store.commit(active)).toBe('linked');
 const pending=await reviewed();const other=hash();
 await store.selectBrowser({digest:other,qccAccountId:accountId,qccSessionHash:sessionHash,now:0});
 await store.cancel(pending.digest,other);expect((await store.read(pending.digest))?.state).toBe('pending');
 await store.cancel(pending.digest,browserDigest);expect((await store.read(pending.digest))?.state).toBe('cancelled');
 await store.cancel(active.digest,browserDigest);
 expect(await store.verifyContext({...active,digest:active.contextDigest})).not.toBeNull();
 expect(await store.verifyContext({...active,digest:active.contextDigest,browserDigest:other})).toBeNull();
});
it('invalid session selection cannot retarget or invalidate the current browser',async()=>{
 const active=await reviewed();expect(await store.commit(active)).toBe('linked');
 expect(await store.selectBrowser({digest:browserDigest,qccAccountId:accountId,qccSessionHash:hash(),now:0})).toBeNull();
 expect((await store.getBrowser(browserDigest))?.epoch).toBe(browserEpoch);
 expect(await store.verifyContext({...active,digest:active.contextDigest})).not.toBeNull();
});
it('queued selection then stale confirm cannot recreate an old context (single-connection local engine)',async()=>{
 const input=await reviewed();
 const selecting=store.selectBrowser({digest:browserDigest,qccAccountId:null,qccSessionHash:null,now:0});
 const confirming=store.commit(input);
 expect(await selecting).toMatchObject({changed:true});expect(await confirming).toBe('invalid');
 expect((await pool.query('SELECT * FROM qcc_study_contexts')).rows).toEqual([]);
});
function renewal(input:Awaited<ReturnType<typeof reviewed>>) {
 return {...input,qccAccountId:accountId,qccSessionHash:sessionHash,contextDigest:hash(),contextExpiresAt:Date.now()+900000};
}
it('returning live old-auth session renews consented pair without rewriting link or existing context',async()=>{
 const input=await reviewed();expect(await store.commit(input)).toBe('linked');
 const before=(await pool.query('SELECT * FROM qcc_study_links')).rows;
 await pool.query("UPDATE account_sessions SET created_at=now()-interval '1 day'");
 const next=renewal(input);expect(await store.renewContext(next)).toBe(true);
 expect((await pool.query('SELECT * FROM qcc_study_links')).rows).toEqual(before);
 for(const digest of [input.contextDigest,next.contextDigest])expect(await store.verifyContext({...input,digest})).not.toBeNull();
});
it('renewal requires exact live browser selection and existing immutable mapping',async()=>{
 const input=await reviewed(),next=renewal(input);
 expect(await store.renewContext(next)).toBe(false);expect(await store.commit(input)).toBe('linked');
 for(const patch of [{whetuSubject:'wrong:subject'},{browserDigest:hash()},{browserEpoch:'999'},{qccSessionHash:hash()},{qccAccountId:randomUUID()},{whetuSessionId:''},{contextExpiresAt:0},{contextExpiresAt:Date.now()+1000000}])expect(await store.renewContext({...next,...patch})).toBe(false);
 await pool.query("UPDATE account_sessions SET expires_at=now()-interval '1 second'");
 expect(await store.renewContext(next)).toBe(false);
 expect((await pool.query('SELECT * FROM qcc_study_contexts')).rows).toHaveLength(1);
});
it('renewal binds the currently verified Whetū session, not an older session for the same user',async()=>{
 const input=await reviewed();expect(await store.commit(input)).toBe('linked');
 const next={...renewal(input),whetuSessionId:'new-verified-session'};
 expect(await store.renewContext(next)).toBe(true);
 expect(await store.verifyContext({...input,digest:next.contextDigest})).toBeNull();
 expect(await store.verifyContext({...next,digest:next.contextDigest})).not.toBeNull();
});
it('session expiration during renewal insertion rolls back the new context only',async()=>{
 const input=await reviewed();expect(await store.commit(input)).toBe('linked');const next=renewal(input);
 const delayed=createPostgresPairingStore({query:pool.query.bind(pool),connect:async()=>{const client=await pool.connect();return {query:async(sql,params)=>{const result=await client.query(sql,params);if(sql.includes('INSERT INTO qcc_study_contexts')){await client.query("UPDATE account_sessions SET expires_at=clock_timestamp()+interval '50 milliseconds' WHERE token_hash=$1",[sessionHash]);await client.query('SELECT pg_sleep(0.1)');}return result;},release:()=>client.release()};}});
 expect(await delayed.renewContext(next)).toBe(false);
 expect((await pool.query('SELECT digest FROM qcc_study_contexts')).rows).toEqual([{digest:input.contextDigest}]);
 expect((await pool.query('SELECT * FROM qcc_study_links')).rows).toHaveLength(1);
});

it('renewal prunes expired contexts only for its own browser and preserves active contexts',async()=>{
 const input=await reviewed();expect(await store.commit(input)).toBe('linked');
 const keep=renewal(input);expect(await store.renewContext(keep)).toBe(true);
 await pool.query('UPDATE qcc_study_contexts SET expires_at=0 WHERE digest=$1',[input.contextDigest]);
 const otherBrowser=hash(),otherContext=hash();const selected=await store.selectBrowser({digest:otherBrowser,qccAccountId:accountId,qccSessionHash:sessionHash,now:0});
 await pool.query('INSERT INTO qcc_study_contexts(digest,qcc_account_id,qcc_session_hash,whetu_subject,expires_at,browser_digest,browser_epoch,whetu_session_id) VALUES($1,$2,$3,$4,0,$5,$6,$7)',[otherContext,accountId,sessionHash,input.whetuSubject,otherBrowser,selected!.epoch,input.whetuSessionId]);
 const next=renewal(input);expect(await store.renewContext(next)).toBe(true);
 expect((await pool.query('SELECT digest FROM qcc_study_contexts ORDER BY digest')).rows.map(row=>row.digest).sort()).toEqual([keep.contextDigest,next.contextDigest,otherContext].sort());
});
