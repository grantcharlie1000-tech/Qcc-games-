import type {Database} from '../src/leaderboard/server';
import type {PairingStore,PairingIntent} from './study-pairing-core';
const INVALID=Symbol('invalid-pairing-proof');
const CLOCK="floor(extract(epoch FROM clock_timestamp())*1000)::bigint";
const pending=`scope='qcc:whetu:link:v1' AND return_path='/nceastudy' AND state='pending' AND expires_at>${CLOCK} AND qcc_consented_at<=${CLOCK}`;
const digest=(value:string)=>/^[a-f0-9]{64}$/.test(value);
const subject=(value:string)=>typeof value==='string'&&value.length>0&&value.length<=512;
const decode=(row:any):PairingIntent=>({digest:row.digest,browserDigest:row.browser_digest,browserEpoch:String(row.browser_epoch),scope:row.scope,returnPath:row.return_path,qccAccountId:row.qcc_account_id,qccSessionHash:row.qcc_session_hash,qccConsentedAt:Number(row.qcc_consented_at),expiresAt:Number(row.expires_at),state:row.state,...(row.whetu_subject?{whetuSubject:row.whetu_subject,whetuSessionId:row.whetu_session_id,challengeDigest:row.challenge_digest}:{})});
/** Server-owned durable authority. Never accepts browser account IDs or copies saves. */
export function createPostgresPairingStore(db:Database):PairingStore {
 async function transaction<T>(work:(query:Database['query'])=>Promise<T>):Promise<T>{
  const client=await db.connect();try{await client.query('BEGIN');const result=await work(client.query.bind(client));await client.query('COMMIT');return result;}
  catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
 }
 async function lockBrowser(query:Database['query'],hash:string,epoch:string) {
  if(!digest(hash)||!/^\d+$/.test(epoch))return null;
  const row=(await query('SELECT * FROM qcc_study_browsers WHERE digest=$1 FOR UPDATE',[hash])).rows[0];
  if(!row||String(row.epoch)!==epoch||!row.qcc_account_id)return null;
  const session=await query(`SELECT token_hash FROM account_sessions WHERE token_hash=$1 AND account_id=$2 AND expires_at>clock_timestamp() AND created_at<=clock_timestamp() FOR UPDATE`,[row.qcc_session_hash,row.qcc_account_id]);
  return session.rows.length?row:null;
 }
 return {
  async getBrowser(hash){
   if(!digest(hash))return null;
   const row=(await db.query('SELECT * FROM qcc_study_browsers WHERE digest=$1',[hash])).rows[0];
   return row?{digest:row.digest,epoch:String(row.epoch),qccAccountId:row.qcc_account_id,qccSessionHash:row.qcc_session_hash}:null;
  },
  async selectBrowser(input){
   // Browser authority is minted only by successful QCC authentication.
   // Selection cannot create, rebind or clear another tab's authority.
   if(!digest(input.digest)||!input.qccAccountId||!input.qccSessionHash||!digest(input.qccSessionHash))return null;
   const row=(await db.query(`SELECT b.epoch FROM qcc_study_browsers b
    JOIN account_sessions s ON s.account_id=b.qcc_account_id AND s.token_hash=b.qcc_session_hash
    WHERE b.digest=$1 AND b.qcc_account_id=$2 AND b.qcc_session_hash=$3
     AND s.expires_at>clock_timestamp() AND s.created_at<=clock_timestamp()`,
    [input.digest,input.qccAccountId,input.qccSessionHash])).rows[0];
   return row?{epoch:String(row.epoch),changed:false}:null;
  },
  async create(intent){
   return transaction(async query=>{
    const browser=await lockBrowser(query,intent.browserDigest,intent.browserEpoch);
    if(!browser||browser.qcc_account_id!==intent.qccAccountId||browser.qcc_session_hash!==intent.qccSessionHash)return 'invalid';
    // Serialize the shared account budget across workers, not merely this process.
    const key='study-pairing:'+intent.qccAccountId;
    await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
    const budget=await query(`INSERT INTO account_attempts(subject,attempts) VALUES($1,1)
     ON CONFLICT(subject) DO UPDATE SET
      attempts=CASE WHEN account_attempts.started_at<=clock_timestamp()-interval '60 seconds' THEN 1 ELSE account_attempts.attempts+1 END,
      started_at=CASE WHEN account_attempts.started_at<=clock_timestamp()-interval '60 seconds' THEN clock_timestamp() ELSE account_attempts.started_at END
     WHERE account_attempts.started_at<=clock_timestamp()-interval '60 seconds' OR account_attempts.attempts<5
     RETURNING attempts`,[key]);
    if(!budget.rows.length)return 'rate-limited';
    await query(`INSERT INTO qcc_study_pairing_intents(digest,scope,return_path,qcc_account_id,qcc_session_hash,qcc_consented_at,expires_at,state,browser_digest,browser_epoch)
     VALUES($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9)`,[intent.digest,intent.scope,intent.returnPath,intent.qccAccountId,intent.qccSessionHash,intent.qccConsentedAt,intent.expiresAt,intent.browserDigest,intent.browserEpoch]);
    return 'created';
   });
  },
  async read(hash){if(!digest(hash))return null;const row=(await db.query('SELECT * FROM qcc_study_pairing_intents WHERE digest=$1',[hash])).rows[0];return row?decode(row):null;},
  async review(input){
   if(!digest(input.digest)||!digest(input.challengeDigest)||!subject(input.whetuSubject)||!subject(input.whetuSessionId))return false;
   return transaction(async query=>{
    const browser=await lockBrowser(query,input.browserDigest,input.browserEpoch);if(!browser)return false;
    const result=await query(`UPDATE qcc_study_pairing_intents SET whetu_subject=$2,challenge_digest=$3,whetu_session_id=$4
     WHERE digest=$1 AND ${pending} AND browser_digest=$5 AND browser_epoch=$6 AND qcc_account_id=$7 AND qcc_session_hash=$8
      AND (whetu_subject IS NULL OR (whetu_subject=$2 AND whetu_session_id=$4)) RETURNING digest`,[input.digest,input.whetuSubject,input.challengeDigest,input.whetuSessionId,input.browserDigest,input.browserEpoch,browser.qcc_account_id,browser.qcc_session_hash]);
    return result.rows.length===1;
   });
  },
  async commit(input){
   if(!digest(input.digest)||!digest(input.challengeDigest)||!digest(input.contextDigest)||!subject(input.whetuSubject)||!subject(input.whetuSessionId)||!Number.isSafeInteger(input.whetuAuthenticatedAt)||!Number.isSafeInteger(input.contextExpiresAt))return 'invalid';
   try{return await transaction(async query=>{
    const browser=await lockBrowser(query,input.browserDigest,input.browserEpoch);if(!browser)return 'invalid';
    const row=(await query(`SELECT * FROM qcc_study_pairing_intents WHERE digest=$1 AND ${pending} AND whetu_subject=$2 AND challenge_digest=$3 AND whetu_session_id=$4 AND browser_digest=$5 AND browser_epoch=$6 AND qcc_account_id=$7 AND qcc_session_hash=$8 FOR UPDATE`,[input.digest,input.whetuSubject,input.challengeDigest,input.whetuSessionId,input.browserDigest,input.browserEpoch,browser.qcc_account_id,browser.qcc_session_hash])).rows[0];
    if(!row)return 'invalid';
    // Lock the original session so concurrent logout cannot revoke it between
    // this ownership check and committing the pairing. Use database time, never
    // a caller's supplied 'now'. last_used is not recent credential proof.
    const session=await query(`SELECT token_hash FROM account_sessions WHERE token_hash=$1 AND account_id=$2
     AND expires_at>clock_timestamp() AND created_at<=clock_timestamp()
     AND created_at>clock_timestamp()-interval '10 minutes' FOR UPDATE`,[row.qcc_session_hash,row.qcc_account_id]);
    if(!session.rows.length)return 'invalid';
    const time=Number((await query(`SELECT ${CLOCK} AS time`)).rows[0].time);
    if(input.whetuAuthenticatedAt>time||time-input.whetuAuthenticatedAt>=600000||input.contextExpiresAt<=time||input.contextExpiresAt>time+900000||Number(row.expires_at)<=time)return 'invalid';
    const linked=await query(`INSERT INTO qcc_study_links(qcc_account_id,whetu_subject,linked_at) VALUES($1,$2,$3)
     ON CONFLICT DO NOTHING RETURNING qcc_account_id`,[row.qcc_account_id,row.whetu_subject,time]);
    if(!linked.rows.length){
     // An exact pre-existing pair can receive a new context after fresh explicit
     // proofs. Never change the immutable mapping or its original linked_at.
     const same=await query('SELECT qcc_account_id FROM qcc_study_links WHERE qcc_account_id=$1 AND whetu_subject=$2 FOR UPDATE',[row.qcc_account_id,row.whetu_subject]);
     if(!same.rows.length)return 'conflict';
    }
    await query(`INSERT INTO qcc_study_contexts(digest,qcc_account_id,qcc_session_hash,whetu_subject,expires_at,browser_digest,browser_epoch,whetu_session_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[input.contextDigest,row.qcc_account_id,row.qcc_session_hash,row.whetu_subject,input.contextExpiresAt,input.browserDigest,input.browserEpoch,input.whetuSessionId]);
    // INSERT/uniqueness locks may have waited. Validate again after those waits,
    // rolling back every write if any proof expired in the meantime.
    const final=await query(`SELECT token_hash FROM account_sessions WHERE token_hash=$1 AND account_id=$2
     AND expires_at>clock_timestamp() AND created_at<=clock_timestamp()
     AND created_at>clock_timestamp()-interval '10 minutes'
     AND $3::bigint>${CLOCK} AND $4::bigint<=${CLOCK} AND $4::bigint>${CLOCK}-600000
     AND $5::bigint>${CLOCK}`,[row.qcc_session_hash,row.qcc_account_id,row.expires_at,input.whetuAuthenticatedAt,input.contextExpiresAt]);
    if(!final.rows.length)throw INVALID;
    await query("UPDATE qcc_study_pairing_intents SET state='consumed' WHERE digest=$1",[input.digest]);
    return 'linked' as const;
   });}catch(error){if(error===INVALID)return 'invalid';throw error;}
  },
  async cancel(hash,browserDigest){
   if(!digest(hash)||!digest(browserDigest))return;
   await transaction(async query=>{
    await query('SELECT digest FROM qcc_study_browsers WHERE digest=$1 FOR UPDATE',[browserDigest]);
    await query("UPDATE qcc_study_pairing_intents SET state='cancelled' WHERE digest=$1 AND browser_digest=$2 AND state='pending'",[hash,browserDigest]);
   });
  },
  async verifyContext(input){
   if(!digest(input.digest)||!digest(input.browserDigest)||!subject(input.whetuSubject)||!subject(input.whetuSessionId))return null;
   const row=(await db.query(`SELECT l.qcc_account_id,l.whetu_subject,l.linked_at FROM qcc_study_contexts c
    JOIN qcc_study_browsers b ON b.digest=c.browser_digest AND b.epoch=c.browser_epoch AND b.qcc_account_id=c.qcc_account_id AND b.qcc_session_hash=c.qcc_session_hash
    JOIN qcc_study_links l ON l.qcc_account_id=c.qcc_account_id AND l.whetu_subject=c.whetu_subject
    JOIN account_sessions s ON s.account_id=c.qcc_account_id AND s.token_hash=c.qcc_session_hash
    WHERE c.digest=$1 AND c.whetu_subject=$2 AND c.browser_digest=$3 AND c.whetu_session_id=$4 AND c.expires_at>${CLOCK} AND s.expires_at>clock_timestamp()`,[input.digest,input.whetuSubject,input.browserDigest,input.whetuSessionId])).rows[0];
   return row?{qccAccountId:row.qcc_account_id,whetuSubject:row.whetu_subject,linkedAt:Number(row.linked_at)}:null;
  },
  async renewContext(input){
   if(!digest(input.contextDigest)||!subject(input.whetuSubject)||!subject(input.whetuSessionId)||!Number.isSafeInteger(input.contextExpiresAt))return false;
   try{return await transaction(async query=>{
    const browser=await lockBrowser(query,input.browserDigest,input.browserEpoch);
    if(!browser||browser.qcc_account_id!==input.qccAccountId||browser.qcc_session_hash!==input.qccSessionHash)return false;
    const link=await query('SELECT qcc_account_id FROM qcc_study_links WHERE qcc_account_id=$1 AND whetu_subject=$2 FOR UPDATE',[input.qccAccountId,input.whetuSubject]);
    if(!link.rows.length)return false;
    const time=Number((await query(`SELECT ${CLOCK} AS time`)).rows[0].time);
    if(input.contextExpiresAt<=time||input.contextExpiresAt>time+900000)return false;
    await query(`DELETE FROM qcc_study_contexts WHERE browser_digest=$1 AND expires_at<=${CLOCK}`,[input.browserDigest]);
    await query(`INSERT INTO qcc_study_contexts(digest,qcc_account_id,qcc_session_hash,whetu_subject,expires_at,browser_digest,browser_epoch,whetu_session_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[input.contextDigest,input.qccAccountId,input.qccSessionHash,input.whetuSubject,input.contextExpiresAt,input.browserDigest,input.browserEpoch,input.whetuSessionId]);
    const valid=await query(`SELECT token_hash FROM account_sessions WHERE token_hash=$1 AND account_id=$2 AND expires_at>clock_timestamp() AND created_at<=clock_timestamp() AND $3::bigint>${CLOCK}`,[input.qccSessionHash,input.qccAccountId,input.contextExpiresAt]);
    if(!valid.rows.length)throw INVALID;
    return true;
   });}catch(error){if(error===INVALID)return false;throw error;}
  },
  async revokeContext(hash){if(digest(hash))await db.query('DELETE FROM qcc_study_contexts WHERE digest=$1',[hash]);},
 };
}
