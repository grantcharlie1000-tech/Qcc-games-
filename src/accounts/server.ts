import {createHash,randomBytes,randomUUID,scrypt,timingSafeEqual} from 'node:crypto';
import type {Database} from '../leaderboard/server';
import {validUsername,validPassword,validSaves,MAX_BODY_BYTES,type Saves} from './shared';
import {mergeSaves} from './merge';
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const DUMMY='scrypt$16384$8$1$00000000000000000000000000000000$'+'00'.repeat(64);
const derive=(password:string,salt:Buffer,N:number,r:number,p:number)=>new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N,r,p,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));
async function hashPassword(password:string){const salt=randomBytes(16);return `scrypt$16384$8$1$${salt.toString('hex')}$${(await derive(password,salt,16384,8,1)).toString('hex')}`;}
export async function verifyPassword(password:string,encoded:string|null):Promise<boolean>{
 const valid=typeof encoded==='string'&&/^scrypt\$16384\$8\$1\$[a-f0-9]{32,64}\$[a-f0-9]{128}$/.test(encoded);
 const [,n,r,p,salt,hash]=(valid?encoded:DUMMY).split('$');
 const actual=await derive(password,Buffer.from(salt!,'hex'),Number(n),Number(r),Number(p));
 return timingSafeEqual(actual,Buffer.from(hash!,'hex'))&&valid;
}
export interface Account {id:string;username:string;playerId:string}
export async function resolveAccount(db:Database,request:Request):Promise<Account|null>{
 const token=request.headers.get('authorization')?.match(/^Bearer (acct_[a-f0-9]{64})$/)?.[1];if(!token)return null;
 const result=await db.query(`UPDATE account_sessions s SET last_used=now() FROM accounts a
  WHERE s.token_hash=$1 AND s.expires_at>now() AND a.id=s.account_id
  RETURNING a.id,a.username,a.player_id AS "playerId"`,[sha(token)]);
 return result.rows[0]??null;
}
async function readJson(request:Request,limit:number){
 if(Number(request.headers.get('content-length'))>limit)throw 413;
 const reader=request.body?.getReader();const decoder=new TextDecoder();let size=0,text='';
 if(reader)try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>limit){await reader.cancel();throw 413;}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
 try{return JSON.parse(text);}catch{throw 400;}
}
const savesFrom=(rows:any[]):Saves=>Object.fromEntries(rows.map(row=>[row.key,{value:row.value,updated:Number(row.updated)}]));
export function createAccountsHandler(db:Database){
 const pending=new Map<string,Promise<void>>();
 async function lock(key:string){
  const previous=pending.get(key);let release!:()=>void;
  const next=new Promise<void>(resolve=>{release=resolve;});pending.set(key,next);await previous;
  return ()=>{release();if(pending.get(key)===next)pending.delete(key);};
 }
 async function limited(query:Database['query'],subject:string,limit:number,seconds=900){
  const result=await query("SELECT greatest(1,ceil(extract(epoch FROM started_at+($2*interval '1 second')-now())))::int AS retry FROM account_attempts WHERE subject=$1 AND attempts>=$3 AND started_at>now()-($2*interval '1 second')",[subject,seconds,limit]);
  return Number(result.rows[0]?.retry??0);
 }
 async function consume(query:Database['query'],subject:string,seconds=900){
  const result=await query(`INSERT INTO account_attempts(subject,attempts) VALUES ($1,1)
   ON CONFLICT(subject) DO UPDATE SET attempts=CASE WHEN account_attempts.started_at<=now()-($2*interval '1 second') THEN 1 ELSE account_attempts.attempts+1 END,
   started_at=CASE WHEN account_attempts.started_at<=now()-($2*interval '1 second') THEN now() ELSE account_attempts.started_at END
   RETURNING attempts,greatest(1,ceil(extract(epoch FROM started_at+($2*interval '1 second')-now())))::int AS retry`,[subject,seconds]);
  return {attempts:Number(result.rows[0].attempts),retry:Number(result.rows[0].retry)};
 }
 async function session(query:(text:string,values?:unknown[])=>Promise<unknown>,accountId:string){
  const token='acct_'+randomBytes(32).toString('hex');
  await query(`INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES ($1,$2,now()+interval '60 days')`,[sha(token),accountId]);return token;
 }
 return async function handle(request:Request):Promise<Response>{
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  const respond=(body:unknown,status=200,extra:Record<string,string>={})=>Response.json(body,{status,headers:{...headers,...extra}});
  const action=new URL(request.url).searchParams.get('action');
  const allowed=action==='me'?['GET']:action==='sync'?['GET','PUT']:['signup','login','logout'].includes(action??'')?['POST']:[];
  if(!allowed.length)return respond({error:'Unknown account action.'},404);
  if(!allowed.includes(request.method))return respond({error:'Method not allowed.'},405,{Allow:allowed.join(', ')});
  try{
   let data:any;
   if(request.method!=='GET'){
    const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return respond({error:'This request is not allowed.'},403);
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return respond({error:'Send JSON.'},415);
    try{data=await readJson(request,action==='sync'?MAX_BODY_BYTES:2048);}catch(error){throw error===413?413:400;}
   }
   if(action==='signup'||action==='login'){
    const ip=request.headers.get('x-nf-client-connection-ip')?.trim()||'unknown';
    await db.query("DELETE FROM account_attempts WHERE started_at<now()-interval '1 day'");
    await db.query('DELETE FROM account_sessions WHERE expires_at<=now()');
    if(data&&typeof data.username==='string')data.username=data.username.trim();
    if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!['username','password','guestToken'].includes(k))||!validUsername(data.username)||!validPassword(data.password)||('guestToken' in data&&!(typeof data.guestToken==='string'&&/^[a-f0-9]{64}$/.test(data.guestToken))))return respond({error:'Use a username of 3–24 letters, digits, underscores, hyphens or dots, and a password of 8–128 characters.'},400);
    const subject='username:'+sha(data.username.toLowerCase()),ipSubject=(action==='login'?'login-ip:':'signup-ip:')+sha(ip);
    const subjects=(action==='login'?[ipSubject,subject]:[ipSubject]).sort(),releases:(()=>void)[]=[];
    for(const key of subjects)releases.push(await lock(key));
    let auth:Awaited<ReturnType<Database['connect']>>|undefined,failed=false;
    try{
    auth=await db.connect();const query=auth.query.bind(auth) as Database['query'];
    // Pin the backend through authentication, including on transaction-pooled hosts.
    // Local locks also support the development database's shared backend.
    await query('BEGIN');
    for(const key of subjects)await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
    const retry=await limited(query,ipSubject,action==='login'?100:60,action==='login'?900:3600);if(retry)return respond({error:'Too many attempts. Try again later.'},429,{'Retry-After':String(retry)});
    if(action==='login'){
     const retry=await limited(query,subject,10);if(retry)return respond({error:'Too many attempts. Try again later.'},429,{'Retry-After':String(retry)});
     const account=(await query('SELECT id,username,password_hash FROM accounts WHERE lower(username)=lower($1)',[data.username])).rows[0];
     if(!await verifyPassword(data.password,account?.password_hash??null)){
      const user=await consume(query,subject),ip=await consume(query,ipSubject);
      if(user.attempts>10||ip.attempts>100)return respond({error:'Too many attempts. Try again later.'},429,{'Retry-After':String(Math.max(user.retry,ip.retry))});
      return respond({error:'Username or password is incorrect.'},401);
     }
     await query('DELETE FROM account_attempts WHERE subject=$1',[subject]);
     const token=await session(query,account.id);return respond({token,username:account.username});
    }
    const attempt=await consume(query,ipSubject,3600);if(attempt.attempts>60)return respond({error:'Too many attempts. Try again later.'},429,{'Retry-After':String(attempt.retry)});
    if((await query('SELECT id FROM accounts WHERE lower(username)=lower($1)',[data.username])).rows.length)return respond({error:'That username is already taken.'},409);
    const passwordHash=await hashPassword(data.password),id=randomUUID(),playerId=randomBytes(32).toString('hex');
    const client=auth;
    try{
     await client.query('SAVEPOINT signup');
     await client.query('INSERT INTO arcade_players(id,name) VALUES ($1,$2)',[playerId,data.username]);
     await client.query('INSERT INTO accounts(id,username,password_hash,player_id) VALUES ($1,$2,$3,$4)',[id,data.username,passwordHash,playerId]);
     if(data.guestToken){
      const guestId=sha(data.guestToken);
      await client.query(`INSERT INTO arcade_scores(game_id,player_id,score,reached_at)
       SELECT game_id,$1,score,reached_at FROM arcade_scores WHERE player_id=$2
       ON CONFLICT(game_id,player_id) DO UPDATE SET score=excluded.score,reached_at=excluded.reached_at WHERE excluded.score>arcade_scores.score`,[playerId,guestId]);
      await client.query('DELETE FROM arcade_players WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM accounts WHERE player_id=$1)',[guestId]);
     }
     const token=await session(client.query.bind(client),id);await client.query('RELEASE SAVEPOINT signup');return respond({token,username:data.username},201);
    }catch(error){await client.query('ROLLBACK TO SAVEPOINT signup');if((error as {code?:string}).code==='23505')return respond({error:'That username is already taken.'},409);throw error;}
    }catch(error){failed=true;if(auth)await auth.query('ROLLBACK');throw error;}
    finally{try{if(auth&&!failed)await auth.query('COMMIT');}finally{auth?.release();for(const release of releases.reverse())release();}}
   }
   if(action==='logout'){
    if(!data||typeof data!=='object'||Array.isArray(data))return respond({error:'Invalid logout request.'},400);
    if(Object.keys(data).length){
     if(Object.keys(data).length!==1||typeof data.sessionHash!=='string'||!/^[a-f0-9]{64}$/.test(data.sessionHash))return respond({error:'Invalid logout request.'},400);
     // A hash is a revoke-only proof: it cannot read saves or authenticate a player.
     await db.query('DELETE FROM account_sessions WHERE token_hash=$1',[data.sessionHash]);return respond({ok:true});
    }
   }
   const account=await resolveAccount(db,request);if(!account)return respond({error:'Please log in again.'},401);
   if(action==='me')return respond({username:account.username});
   if(action==='logout'){
    const token=request.headers.get('authorization')!.slice(7);await db.query('DELETE FROM account_sessions WHERE token_hash=$1',[sha(token)]);return respond({ok:true});
   }
   if(request.method==='GET')return respond({saves:savesFrom((await db.query('SELECT key,value,updated FROM account_saves WHERE account_id=$1',[account.id])).rows)});
   if(!data||typeof data!=='object'||Object.keys(data).length!==1||!validSaves(data.saves))return respond({error:'Invalid save keys or values. Oversized saves stay on this device.'},400);
   const client=await db.connect();
   try{
    await client.query('BEGIN');await client.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[account.id]);
    const previous=await client.query('SELECT key,value,updated FROM account_saves WHERE account_id=$1',[account.id]) as {rows:any[]};
    const saves=mergeSaves(savesFrom(previous.rows),data.saves);
    for(const key of Object.keys(data.saves)){const record=saves[key]!;await client.query(`INSERT INTO account_saves(account_id,key,value,updated) VALUES ($1,$2,$3::jsonb,$4)
     ON CONFLICT(account_id,key) DO UPDATE SET value=excluded.value,updated=excluded.updated`,[account.id,key,JSON.stringify(record.value),record.updated]);}
    await client.query('COMMIT');return respond({saves});
   }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }catch(error){
   if(error===413)return respond({error:'Request too large.'},413);
   if(error===400)return respond({error:'Invalid JSON.'},400);
   return respond({error:'Accounts are temporarily unavailable. Your progress stays on this device.'},503);
  }
 };
}
