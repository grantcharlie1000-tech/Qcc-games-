import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {createChatHandler,purgeExpiredChat} from '../../src/chat/server';
import {createMemoryStore} from '../../src/media/store';
import type {Database} from '../../src/leaderboard/server';
const local=new NetlifyDB({logger:()=>{}});let pool:ReturnType<typeof getDatabase>['pool'];
const query=(text:string,values?:unknown[])=>pool.query(text,values);
const db:Database={query:(text,values)=>pool.query(text,values) as any,connect:()=>pool.connect() as any};
beforeAll(async()=>{const connectionString=await local.start();await local.applyMigrations('netlify/database/migrations');pool=getDatabase({connectionString}).pool;},30000);
afterAll(async()=>{await pool?.end();await local.stop();});
let n=0;
async function account(name?:string){
 name??=`ch${++n}_${randomBytes(3).toString('hex')}`;
 const id=randomUUID(),player=randomBytes(32).toString('hex'),token='acct_'+randomBytes(32).toString('hex');
 await query('INSERT INTO arcade_players(id,name) VALUES ($1,$2)',[player,name]);
 await query('INSERT INTO accounts(id,username,password_hash,player_id) VALUES ($1,$2,$3,$4)',[id,name,'scrypt$test',player]);
 await query(`INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES ($1,$2,now()+interval '1 day')`,[createHash('sha256').update(token).digest('hex'),id]);
 return {id,token,name};
}
type User=Awaited<ReturnType<typeof account>>;
const store=createMemoryStore(),handler=createChatHandler(db,store);
const URL_='https://qcc.test/.netlify/functions/chat';
function call(user:User|null,action:string,body?:unknown,extra:Record<string,string>={}){
 const post=body!==undefined;
 return handler(new Request(`${URL_}?action=${action}`,{method:post?'POST':'GET',headers:{...(post?{'content-type':'application/json'}:{}),...(user?{authorization:'Bearer '+user.token}:{}),...extra},body:post?JSON.stringify(body):undefined}));
}
const get=(user:User|null,qs:string)=>handler(new Request(`${URL_}?${qs}`,{headers:user?{authorization:'Bearer '+user.token}:{}}));
const json=async(r:Response)=>r.json();
async function befriend(a:User,b:User){
 expect(await json(await call(a,'request',{username:b.name}))).toEqual({status:'sent'});
 expect(await json(await call(b,'respond',{username:a.name,accept:true}))).toEqual({status:'friends'});
}
async function pair(){const a=await account(),b=await account();await befriend(a,b);return {a,b};}
const text=async(from:User,to:User,body='hi')=>{const r=await call(from,'send',{to:to.name,kind:'text',body});expect(r.status).toBe(201);return r.json();};
const mid=()=>'m_'+randomBytes(16).toString('hex');
async function snapMedia(owner:string){
 const id=mid();
 await query(`INSERT INTO media_objects(id,owner_id,purpose,state,bytes,thumb_bytes,width,height) VALUES ($1,$2,'snap','pending',1000,0,640,480)`,[id,owner]);
 await store.put(id+'/full',new Uint8Array([7,8,9]));await store.put(id+'/thumb',new Uint8Array([1]));return id;
}
const snap=async(from:User,to:User)=>{const media=await snapMedia(from.id);const r=await call(from,'send',{to:to.name,kind:'snap',mediaId:media});expect(r.status).toBe(201);return {...(await r.json()),media};};
const row=async(id:string)=>(await query('SELECT * FROM chat_messages WHERE id=$1',[id])).rows[0];
const deltaMs=async(id:string,now=false)=>{
 const r=(await query('SELECT extract(epoch FROM expires_at-now())*1000 AS d FROM chat_messages WHERE id=$1',[id])).rows[0];return Number(r.d);
};
const near=(actualMs:number,expectedMs:number)=>expect(Math.abs(actualMs-expectedMs)).toBeLessThan(5000);
const H=3600000,D=24*H;

describe('chat handler',{timeout:60000},()=>{
 it('requires login and rejects bad methods and cross-origin posts',async()=>{
  const a=await account();
  expect((await call(null,'summary')).status).toBe(401);
  expect((await call(a,'nope')).status).toBe(404);
  expect((await get(a,'action=send')).status).toBe(405);
  expect((await call(a,'block',{username:'xyz'},{origin:'https://evil.test'})).status).toBe(403);
  expect((await handler(new Request(`${URL_}?action=block`,{method:'POST',headers:{authorization:'Bearer '+a.token,'content-type':'text/plain'},body:'{}'}))).status).toBe(415);
 });
 it('friend request must be accepted before messaging',async()=>{
  const a=await account(),b=await account();
  expect((await call(a,'send',{to:b.name,kind:'text',body:'hi'})).status).toBe(404);
  expect(await json(await call(a,'request',{username:b.name}))).toEqual({status:'sent'});
  expect((await call(a,'send',{to:b.name,kind:'text',body:'hi'})).status).toBe(404);
  expect((await call(b,'send',{to:a.name,kind:'text',body:'hi'})).status).toBe(404);
  const incoming=(await json(await get(b,'action=list'))).incoming;
  expect(incoming.map((r:any)=>r.friend.username)).toEqual([a.name]);
  expect((await json(await get(a,'action=list'))).outgoing.map((r:any)=>r.friend.username)).toEqual([b.name]);
  expect(await json(await call(b,'respond',{username:a.name,accept:true}))).toEqual({status:'friends'});
  expect((await call(a,'send',{to:b.name,kind:'text',body:'hi'})).status).toBe(201);
  expect((await get(a,`action=messages&with=${b.name}`)).status).toBe(200);
 });
 it('request replies are identical for unknown, blocked and real users and cover edge cases',async()=>{
  const a=await account(),b=await account(),c=await account(),d=await account();
  await call(c,'block',{username:a.name});
  const real=await call(a,'request',{username:b.name}),unknown=await call(a,'request',{username:'nobody_'+randomBytes(3).toString('hex')}),blocked=await call(a,'request',{username:c.name});
  for(const r of [real,unknown,blocked]){expect(r.status).toBe(200);expect(await json(r)).toEqual({status:'sent'});}
  expect((await query('SELECT 1 FROM chat_contacts WHERE owner_id=$1',[a.id])).rows).toHaveLength(1);
  expect((await call(a,'request',{username:a.name})).status).toBe(400);
  expect(await json(await call(a,'request',{username:b.name}))).toEqual({status:'sent'});
  expect((await query('SELECT 1 FROM chat_contacts WHERE owner_id=$1',[a.id])).rows).toHaveLength(1);
  // mutual: target already requested the caller
  await call(d,'request',{username:a.name});
  expect(await json(await call(a,'request',{username:d.name}))).toEqual({status:'friends'});
  // respond without pending request
  expect((await call(a,'respond',{username:c.name,accept:true})).status).toBe(404);
  expect((await call(b,'respond',{username:c.name,accept:true})).status).toBe(404);
  // decline
  expect(await json(await call(b,'respond',{username:a.name,accept:false}))).toEqual({status:'declined'});
  expect((await query('SELECT 1 FROM chat_contacts WHERE owner_id=$1 AND contact_id=$2',[a.id,b.id])).rows).toHaveLength(0);
  expect((await call(b,'respond',{username:a.name,accept:'yes'})).status).toBe(400);
 });
 it('rejects every action on a conversation the caller is not in',async()=>{
  const {a,b}=await pair();const c=await account(),d=await account();await befriend(a,c);await befriend(b,c);
  const t=await text(a,b,'secret'),s=await snap(a,b);
  const snapshot=async()=>({m:(await query('SELECT id,viewed_at,saved_at,expires_at,media_id FROM chat_messages ORDER BY id')).rows,o:(await query('SELECT id,state FROM media_objects ORDER BY id')).rows,k:store.keys(),c:(await query('SELECT id,retention FROM chat_conversations WHERE a_id=least($1::uuid,$2::uuid) AND b_id=greatest($1::uuid,$2::uuid)',[a.id,b.id])).rows});
  const before=await snapshot();
  expect((await get(c,`action=messages&with=${a.name}`)).status).toBe(200);
  expect((await json(await get(c,`action=messages&with=${a.name}`))).messages.map((m:any)=>m.id)).not.toContain(t.id);
  expect((await call(c,'save',{id:t.id,on:true})).status).toBe(404);
  expect((await call(c,'unsend',{id:t.id})).status).toBe(404);
  expect((await call(c,'unsend',{id:s.id})).status).toBe(404);
  expect((await call(c,'open_snap',{id:s.id})).status).toBe(404);
  expect((await call(c,'report',{messageId:t.id,category:'spam'})).status).toBe(404);
  expect((await call(c,'report',{messageId:s.id,category:'spam'})).status).toBe(404);
  expect((await call(c,'save',{id:'abc',on:true})).status).toBe(404);
  expect((await call(c,'open_snap',{id:'99999999999999999999'})).status).toBe(404);
  expect((await call(c,'retention',{with:'nobody_x',mode:'week'})).status).toBe(404);
  expect((await call(d,'delete_conversation',{with:a.name})).status).toBe(404);
  expect((await call(d,'retention',{with:a.name,mode:'week'})).status).toBe(404);
  expect((await call(d,'retention',{with:b.name,mode:'week'})).status).toBe(404);
  expect((await call(c,'delete_conversation',{with:b.name})).status).toBe(404);
  expect(await snapshot()).toEqual(before);
  expect((await query('SELECT 1 FROM social_reports WHERE reporter_id=$1',[c.id])).rows).toHaveLength(0);
  expect((await query('SELECT 1 FROM chat_conversations WHERE a_id=least($1::uuid,$2::uuid) AND b_id=greatest($1::uuid,$2::uuid)',[a.id,b.id])).rows).toHaveLength(1);
 });
 it('snap is single-use and recipient-only',async()=>{
  const {a,b}=await pair();const c=await account();await befriend(a,c);
  const s=await snap(a,b);
  expect(s).toMatchObject({kind:'snap',body:null,snap:{opened:false},mine:true});
  expect((await call(a,'open_snap',{id:s.id})).status).toBe(404);
  expect((await call(c,'open_snap',{id:s.id})).status).toBe(404);
  const first=await call(b,'open_snap',{id:s.id});
  expect(first.status).toBe(200);expect(first.headers.get('content-type')).toBe('image/webp');
  expect(first.headers.get('cache-control')).toBe('no-store');expect(first.headers.get('x-content-type-options')).toBe('nosniff');
  expect([...new Uint8Array(await first.arrayBuffer())]).toEqual([7,8,9]);
  const second=await call(b,'open_snap',{id:s.id});expect(second.status).toBe(410);expect(await json(second)).toEqual({error:'opened'});
  expect(store.keys().filter(k=>k.startsWith(s.media))).toEqual([]);
  expect((await query('SELECT 1 FROM media_objects WHERE id=$1',[s.media])).rows).toHaveLength(0);
  const r=await row(s.id);expect(r.media_id).toBeNull();expect(r.viewed_at).not.toBeNull();
  near(await deltaMs(s.id),D);
  const view=(await json(await get(b,`action=messages&with=${a.name}`))).messages.find((m:any)=>m.id===s.id);
  expect(view).toMatchObject({kind:'snap',body:null,snap:{opened:true}});
 });
 it('purged snap blob gives 410 and keeps the snap unopened',async()=>{
  const {a,b}=await pair();const s=await snap(a,b);
  await store.delete(s.media+'/full');
  expect((await call(b,'open_snap',{id:s.id})).status).toBe(410);
  expect((await row(s.id)).viewed_at).toBeNull();
 });
 it('viewing sets 24 h expiry in viewed mode and saved messages expire in 90 days',async()=>{
  const {a,b}=await pair();
  const t=await text(a,b,'one'),u=await text(a,b,'two');
  near(await deltaMs(t.id),30*D);
  const view=await json(await get(b,`action=messages&with=${a.name}`));
  expect(view.retention).toBe('viewed');expect(view.friend.username).toBe(a.name);
  near(await deltaMs(t.id),D);
  expect(view.messages.map((m:any)=>m.body)).toEqual(['one','two']);
  expect(view.messages.every((m:any)=>m.mine===false)).toBe(true);
  // sender's own read does not start the clock for their messages
  const mine=await text(b,a,'mine');
  await get(b,`action=messages&with=${a.name}`);expect((await row(mine.id)).viewed_at).toBeNull();near(await deltaMs(mine.id),30*D);
  // save
  const saved=await json(await call(b,'save',{id:t.id,on:true}));expect(saved.saved).toBe(true);near(await deltaMs(t.id),90*D);
  await get(b,`action=messages&with=${a.name}`);near(await deltaMs(t.id),90*D);
  expect((await call(a,'save',{id:u.id,on:true})).status).toBe(200);
  const off=await json(await call(b,'save',{id:t.id,on:false}));expect(off.saved).toBe(false);near(await deltaMs(t.id),D);
  const s=await snap(a,b);expect((await call(b,'save',{id:s.id,on:true})).status).toBe(400);
  expect((await call(b,'save',{id:t.id,on:'x'})).status).toBe(400);
  // after pagination
  const after=await json(await get(b,`action=messages&with=${a.name}&after=${t.id}`));
  expect(after.messages.every((m:any)=>BigInt(m.id)>BigInt(t.id))).toBe(true);
  expect((await get(b,`action=messages&with=${a.name}&after=zz`)).status).toBe(400);
 });
 it('week mode sets 7-day expiry and records a system line',async()=>{
  const {a,b}=await pair();
  const t=await text(a,b,'old');near(await deltaMs(t.id),30*D);
  const view=await json(await call(b,'retention',{with:a.name,mode:'week'}));
  expect(view.retention).toBe('week');
  const sys=view.messages.find((m:any)=>m.kind==='system');
  expect(sys).toMatchObject({body:'retention:week',mine:false,snap:null});
  near(await deltaMs(t.id),7*D);near(await deltaMs(sys.id),7*D);
  const w=await text(a,b,'new');near(await deltaMs(w.id),7*D);
  await get(b,`action=messages&with=${a.name}`);near(await deltaMs(w.id),7*D);
  const keep=await text(a,b,'keep');await call(b,'save',{id:keep.id,on:true});
  await call(b,'retention',{with:a.name,mode:'viewed'});
  near(await deltaMs(keep.id),90*D);
  expect((await call(b,'retention',{with:a.name,mode:'forever'})).status).toBe(400);
 });
 it('purge removes expired messages and their snap media',async()=>{
  const {a,b}=await pair();
  const t=await text(a,b,'bye'),s=await snap(a,b),keep=await text(a,b,'stay');
  await query(`UPDATE chat_messages SET expires_at=now()-interval '1 second' WHERE id=ANY($1::bigint[])`,[[t.id,s.id]]);
  await get(b,'action=summary');
  expect(await row(t.id)).toBeUndefined();expect(await row(s.id)).toBeUndefined();expect(await row(keep.id)).toBeDefined();
  expect(store.keys().filter(k=>k.startsWith(s.media))).toEqual([]);
  expect((await query('SELECT 1 FROM media_objects WHERE id=$1',[s.media])).rows).toHaveLength(0);
  const s2=await snap(a,b);await query(`UPDATE chat_messages SET expires_at=now()-interval '1 second' WHERE id=$1`,[s2.id]);
  expect(await purgeExpiredChat(db.query,store)).toBeGreaterThanOrEqual(1);expect(store.keys().filter(k=>k.startsWith(s2.media))).toEqual([]);
  // a failing purge never blocks chat
  const broken=createChatHandler({query:(text:string,values?:unknown[])=>text.includes('DELETE FROM chat_messages WHERE id IN')?Promise.reject(new Error('x')):db.query(text,values),connect:db.connect} as Database,store);
  expect((await broken(new Request(`${URL_}?action=summary`,{headers:{authorization:'Bearer '+a.token}}))).status).toBe(200);
 });
 it('block and remove_friend answer identically for unknown and real usernames',async()=>{
  const a=await account(),b=await account();
  for(const action of ['remove_friend','block']){
   const real=await call(a,action,{username:b.name}),unknown=await call(a,action,{username:'nobody_'+randomBytes(3).toString('hex')});
   expect(unknown.status).toBe(real.status);expect(await json(unknown)).toEqual(await json(real));
   expect((await call(a,action,{username:a.name})).status).toBe(400);
  }
 });
 it('victim can block first and still report the message',async()=>{
  const {a,b}=await pair();const t=await text(a,b,'bad words');
  await call(b,'block',{username:a.name});
  expect(await json(await call(b,'report',{messageId:t.id,category:'harassment'}))).toEqual({ok:true});
  expect((await query('SELECT snapshot FROM social_reports WHERE reporter_id=$1',[b.id])).rows[0].snapshot).toBe('bad words');
 });
 it('concurrent open_snap yields exactly one 200 and one 410',async()=>{
  const {a,b}=await pair();const s=await snap(a,b);
  const rs=await Promise.all([call(b,'open_snap',{id:s.id}),call(b,'open_snap',{id:s.id})]);
  expect(rs.map(r=>r.status).sort()).toEqual([200,410]);
 });
 it('unsend only by sender',async()=>{
  const {a,b}=await pair();
  const t=await text(a,b,'oops'),s=await snap(a,b);
  expect((await call(b,'unsend',{id:t.id})).status).toBe(404);
  expect(await row(t.id)).toBeDefined();
  expect(await json(await call(a,'unsend',{id:t.id}))).toEqual({ok:true});expect(await row(t.id)).toBeUndefined();
  expect((await call(a,'unsend',{id:t.id})).status).toBe(404);
  expect((await call(a,'unsend',{id:s.id})).status).toBe(200);
  expect(store.keys().filter(k=>k.startsWith(s.media))).toEqual([]);
  expect((await query('SELECT 1 FROM media_objects WHERE id=$1',[s.media])).rows).toHaveLength(0);
 });
 it('block severs friendship and refuses send, request and messages',async()=>{
  const {a,b}=await pair();const t=await text(a,b,'before');
  expect(await json(await call(b,'block',{username:a.name}))).toEqual({ok:true});
  for(const [x,y] of [[a,b],[b,a]] as const){
   expect((await call(x,'send',{to:y.name,kind:'text',body:'x'})).status).toBe(404);
   expect((await get(x,`action=messages&with=${y.name}`)).status).toBe(404);
   expect(await json(await call(x,'request',{username:y.name}))).toEqual({status:'sent'});
   expect((await call(x,'retention',{with:y.name,mode:'week'})).status).toBe(404);
   expect((await json(await get(x,'action=list'))).friends).toHaveLength(0);
  }
  expect((await query('SELECT 1 FROM chat_contacts WHERE owner_id=ANY($1)',[[a.id,b.id]])).rows).toHaveLength(0);
  expect((await call(b,'save',{id:t.id,on:true})).status).toBe(404);
  expect(await json(await call(b,'report',{messageId:t.id,category:'spam'}))).toEqual({ok:true});
  expect(await json(await call(b,'block',{username:'nobody_zz'}))).toEqual({ok:true});
  // either side can still delete the conversation, and the sender can unsend
  expect((await call(a,'unsend',{id:t.id})).status).toBe(200);
  expect(await json(await call(b,'delete_conversation',{with:a.name}))).toEqual({ok:true});
 });
 it('unread summary counts incoming unviewed messages and pending requests',async()=>{
  const {a,b}=await pair();const c=await account(),d=await account();
  await call(c,'request',{username:a.name});await call(d,'request',{username:a.name});
  await text(b,a,'1');await text(b,a,'2');await snap(b,a);await text(a,b,'mine');
  expect(await json(await get(a,'action=summary'))).toEqual({unread:3,requests:2});
  const list=await json(await get(a,'action=list'));
  expect(list.friends).toHaveLength(1);expect(list.friends[0]).toMatchObject({unread:3,friend:{username:b.name,displayName:b.name,avatar:null},last:{kind:'text',mine:true,viewed:false}});
  expect(list.incoming.map((r:any)=>r.friend.username).sort()).toEqual([c.name,d.name].sort());
  await get(a,`action=messages&with=${b.name}`);
  expect(await json(await get(a,'action=summary'))).toEqual({unread:1,requests:2});
  await call(a,'block',{username:c.name});
  expect((await json(await get(a,'action=summary'))).requests).toBe(1);
  await call(a,'remove_friend',{username:b.name});
  expect(await json(await get(a,'action=summary'))).toEqual({unread:0,requests:1});
 });
 it('friends are ordered by last activity and use profile names',async()=>{
  const a=await account(),b=await account(),c=await account();await befriend(a,b);await befriend(a,c);
  await query(`INSERT INTO social_profiles(account_id,display_name,avatar_id) VALUES ($1,'Bee',$2)`,[b.id,mid()]);
  await text(a,c,'x');await text(a,b,'y');
  const list=await json(await get(a,'action=list'));
  expect(list.friends.map((f:any)=>f.friend.username)).toEqual([b.name,c.name]);
  expect(list.friends[0].friend.displayName).toBe('Bee');expect(list.friends[0].friend.avatar).toMatch(/^m_/);
 });
 it('report snapshots message text',async()=>{
  const {a,b}=await pair();
  const t=await text(a,b,'mean words'),s=await snap(a,b),own=await text(b,a,'mine');
  expect(await json(await call(b,'report',{messageId:t.id,category:'harassment',note:' rude '}))).toEqual({ok:true});
  const r=(await query('SELECT * FROM social_reports WHERE reporter_id=$1',[b.id])).rows[0];
  expect(r).toMatchObject({target_kind:'message',target_id:t.id,target_account_id:a.id,category:'harassment',note:'rude',snapshot:'mean words'});
  expect((await call(b,'report',{messageId:s.id,category:'sexual'})).status).toBe(200);
  expect((await query(`SELECT snapshot FROM social_reports WHERE target_id=$1`,[s.id])).rows[0].snapshot).toBe('[photo]');
  expect((await call(b,'report',{messageId:t.id,category:'spam'})).status).toBe(200);
  expect((await query('SELECT 1 FROM social_reports WHERE reporter_id=$1 AND target_id=$2',[b.id,t.id])).rows).toHaveLength(1);
  expect((await call(a,'report',{messageId:t.id,category:'spam'})).status).toBe(400);
  expect((await call(b,'report',{messageId:own.id,category:'spam'})).status).toBe(400);
  expect((await call(b,'report',{messageId:t.id,category:'bogus'})).status).toBe(400);
  expect((await call(b,'report',{messageId:t.id,category:'spam',note:'x'.repeat(501)})).status).toBe(400);
 });
 it('send validates input and delete_conversation removes messages and blobs',async()=>{
  const {a,b}=await pair();
  for(const body of ['',' ','x'.repeat(1001),5,undefined])expect((await call(a,'send',{to:b.name,kind:'text',body})).status).toBe(400);
  expect((await call(a,'send',{to:b.name,kind:'text',body:'😀'.repeat(1000)})).status).toBe(201);
  expect((await call(a,'send',{to:b.name,kind:'video'})).status).toBe(400);
  expect((await call(a,'send',{to:b.name,kind:'snap',mediaId:'bad'})).status).toBe(400);
  expect((await call(a,'send',{to:b.name,kind:'snap',mediaId:mid()})).status).toBe(400);
  const other=await account();const foreign=await snapMedia(other.id);
  expect((await call(a,'send',{to:b.name,kind:'snap',mediaId:foreign})).status).toBe(400);
  const s=await snap(a,b);
  expect((await call(a,'delete_conversation',{with:'nobody_zz'})).status).toBe(404);
  await call(a,'remove_friend',{username:b.name});
  expect(await json(await call(a,'delete_conversation',{with:b.name}))).toEqual({ok:true});
  expect((await query('SELECT 1 FROM chat_messages WHERE id=$1',[s.id])).rows).toHaveLength(0);
  expect(store.keys().filter(k=>k.startsWith(s.media))).toEqual([]);
  expect((await call(a,'delete_conversation',{with:b.name})).status).toBe(404);
 });
 it('message rate limit 31st in a minute → 429',async()=>{
  const {a,b}=await pair();
  for(let i=0;i<30;i++)expect((await call(a,'send',{to:b.name,kind:'text',body:'m'+i})).status).toBe(201);
  const r=await call(a,'send',{to:b.name,kind:'text',body:'one too many'});
  expect(r.status).toBe(429);expect(r.headers.get('retry-after')).toBeTruthy();
 });
 it('friend request rate limit is 30 per day',async()=>{
  const a=await account();
  for(let i=0;i<30;i++)expect((await call(a,'request',{username:'nobody_'+i+randomBytes(2).toString('hex')})).status).toBe(200);
  expect((await call(a,'request',{username:'nobody_zzz'})).status).toBe(429);
 });
});
