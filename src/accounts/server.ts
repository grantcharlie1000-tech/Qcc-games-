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
 async function consume(subject:string,limit:number){
  const result=await db.query(`INSERT INTO account_attempts(subject,attempts) VALUES ($1,1)
   ON CONFLICT(subject) DO UPDATE SET attempts=CASE WHEN account_attempts.started_at<=now()-interval '15 minutes' THEN 1 ELSE account_attempts.attempts+1 END,
   started_at=CASE WHEN account_attempts.started_at<=now()-interval '15 minutes' THEN now() ELSE account_attempts.started_at END
   RETURNING attempts,greatest(1,ceil(extract(epoch FROM started_at+interval '15 minutes'-now())))::int AS retry`,[subject]);
  return Number(result.rows[0].attempts)>limit?Number(result.rows[0].retry):0;
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
    data=await readJson(request,action==='sync'?MAX_BODY_BYTES:2048);
   }
   if(action==='signup'||action==='login'){
    const ip=request.headers.get('x-nf-client-connection-ip')?.trim()||'unknown';
    await db.query("DELETE FROM account_attempts WHERE started_at<now()-interval '1 day'");
    const retry=await consume('ip:'+sha(ip),30);if(retry)return respond({error:'Too many attempts. Try again later.'},429,{'Retry-After':String(retry)});
    if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!['username','password','guestToken'].includes(k))||!validUsername(data.username)||!validPassword(data.password)||('guestToken' in data&&!(typeof data.guestToken==='string'&&/^[a-f0-9]{64}$/.test(data.guestToken))))return respond({error:'Use a username of 3–24 letters, digits, underscores, hyphens or dots, and a password of 8–128 characters.'},400);
    const subject='username:'+sha(data.username.toLowerCase());
    if(action==='login'){
     const retry=await consume(subject,10);if(retry)return respond({error:'Too many attempts. Try again later.'},429,{'Retry-After':String(retry)});
     const account=(await db.query('SELECT id,username,password_hash FROM accounts WHERE lower(username)=lower($1)',[data.username])).rows[0];
     if(!await verifyPassword(data.password,account?.password_hash??null))return respond({error:'Username or password is incorrect.'},401);
     await db.query('DELETE FROM account_attempts WHERE subject=$1',[subject]);
     const token=await session(db.query.bind(db),account.id);return respond({token,username:account.username});
    }
    const passwordHash=await hashPassword(data.password),id=randomUUID(),playerId=randomBytes(32).toString('hex');
    const client=await db.connect();
    try{
     await client.query('BEGIN');
     await client.query('INSERT INTO arcade_players(id,name) VALUES ($1,$2)',[playerId,data.username]);
     await client.query('INSERT INTO accounts(id,username,password_hash,player_id) VALUES ($1,$2,$3,$4)',[id,data.username,passwordHash,playerId]);
     if(data.guestToken){
      const guestId=sha(data.guestToken);
      await client.query(`INSERT INTO arcade_scores(game_id,player_id,score,reached_at)
       SELECT game_id,$1,score,reached_at FROM arcade_scores WHERE player_id=$2
       ON CONFLICT(game_id,player_id) DO UPDATE SET score=excluded.score,reached_at=excluded.reached_at WHERE excluded.score>arcade_scores.score`,[playerId,guestId]);
      await client.query('DELETE FROM arcade_players WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM accounts WHERE player_id=$1)',[guestId]);
     }
     const token=await session(client.query.bind(client),id);await client.query('COMMIT');return respond({token,username:data.username},201);
    }catch(error){await client.query('ROLLBACK');if((error as {code?:string}).code==='23505')return respond({error:'That username is already taken.'},409);throw error;}finally{client.release();}
   }
   if(action==='logout'&&data&&typeof data==='object'&&Object.keys(data).length===1&&typeof data.sessionHash==='string'&&/^[a-f0-9]{64}$/.test(data.sessionHash)){
    // A hash is a revoke-only proof: it cannot read saves or authenticate a player.
    await db.query('DELETE FROM account_sessions WHERE token_hash=$1',[data.sessionHash]);return respond({ok:true});
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
    for(const [key,record] of Object.entries(saves))await client.query(`INSERT INTO account_saves(account_id,key,value,updated) VALUES ($1,$2,$3::jsonb,$4)
     ON CONFLICT(account_id,key) DO UPDATE SET value=excluded.value,updated=excluded.updated`,[account.id,key,JSON.stringify(record.value),record.updated]);
    await client.query('COMMIT');return respond({saves});
   }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }catch(error){
   if(error===413)return respond({error:'Request too large.'},413);
   if(error===400)return respond({error:'Invalid JSON.'},400);
   return respond({error:'Accounts are temporarily unavailable. Your progress stays on this device.'},503);
  }
 };
}
