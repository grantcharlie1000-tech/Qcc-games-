import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {LocalDB,createLocalPool} from '../support/local-db';
import type {Pool} from 'pg';
import {createSocialHandler} from '../../src/social/server';
import {createMemoryStore} from '../../src/media/store';
import type {Database} from '../../src/leaderboard/server';
const local=new LocalDB();let pool:Pool;
const query=(text:string,values?:unknown[])=>pool.query(text,values);
const db:Database={query:(text,values)=>pool.query(text,values) as any,connect:()=>pool.connect() as any};
beforeAll(async()=>{const connectionString=await local.start();await local.applyMigrations('db/migrations');pool=createLocalPool(connectionString);},30000);
afterAll(async()=>{await pool?.end();await local.stop();});
let n=0;
async function account(name?:string){
 name??=`su${++n}_${randomBytes(3).toString('hex')}`;
 const id=randomUUID(),player=randomBytes(32).toString('hex'),token='acct_'+randomBytes(32).toString('hex');
 await query('INSERT INTO arcade_players(id,name) VALUES ($1,$2)',[player,name]);
 await query('INSERT INTO accounts(id,username,password_hash,player_id) VALUES ($1,$2,$3,$4)',[id,name,'scrypt$test',player]);
 await query(`INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES ($1,$2,now()+interval '1 day')`,[createHash('sha256').update(token).digest('hex'),id]);
 return {id,token,name};
}
type User=Awaited<ReturnType<typeof account>>;
const store=createMemoryStore(),handler=createSocialHandler(db,store);
const URL_='https://qcc.test/.netlify/functions/social';
function call(user:User|null,action:string,body?:unknown,extra:Record<string,string>={},h=handler){
 const post=body!==undefined;
 return h(new Request(`${URL_}?action=${action}`,{method:post?'POST':'GET',headers:{...(post?{'content-type':'application/json'}:{}),...(user?{authorization:'Bearer '+user.token}:{}),...extra},body:post?JSON.stringify(body):undefined}));
}
const get=(user:User|null,qs:string)=>handler(new Request(`${URL_}?${qs}`,{headers:user?{authorization:'Bearer '+user.token}:{}}));
const post=async(user:User,body:string,more:Record<string,unknown>={})=>{const r=await call(user,'post',{body,...more});expect(r.status).toBe(201);return r.json();};
const feed=async(user:User,tab:string,cursor?:string)=>(await get(user,`action=feed&tab=${tab}${cursor?'&cursor='+cursor:''}`)).json();
const mid=()=>'m_'+randomBytes(16).toString('hex');
async function media(owner:string,purpose='post'){
 const id=mid();
 await query(`INSERT INTO media_objects(id,owner_id,purpose,state,bytes,thumb_bytes,width,height) VALUES ($1,$2,$3,'pending',1000,100,640,480)`,[id,owner,purpose]);
 await store.put(id+'/full',new Uint8Array([1]));await store.put(id+'/thumb',new Uint8Array([2]));return id;
}
describe('social handler',()=>{
 it('post and read back in following and discover feeds',async()=>{
  const a=await account(),b=await account();
  const p=await post(a,'hello world');
  expect(p).toMatchObject({body:'hello world',mine:true,likes:0,replies:0,liked:false,deleted:false,replyTo:null,media:[]});
  expect(p.author).toMatchObject({username:a.name,displayName:a.name,avatar:null});
  expect((await feed(a,'following')).items.map((i:any)=>i.id)).toContain(p.id);
  const d=await feed(b,'discover');expect(d.items.map((i:any)=>i.id)).toContain(p.id);
  expect(d.items.find((i:any)=>i.id===p.id).mine).toBe(false);
  expect((await feed(b,'following')).items.map((i:any)=>i.id)).not.toContain(p.id);
  const me=await (await get(a,'action=me')).json();
  expect(me).toMatchObject({media:true,profile:{username:a.name,displayName:a.name,bio:'',avatar:null,mine:true}});
  expect((await query('SELECT 1 FROM social_profiles WHERE account_id=$1',[a.id])).rows).toHaveLength(0);
 });
 it('rejects 281 code points and empty text without media',async()=>{
  const a=await account();
  expect((await call(a,'post',{body:'x'.repeat(281)})).status).toBe(400);
  expect((await call(a,'post',{body:'😀'.repeat(281)})).status).toBe(400);
  expect((await call(a,'post',{body:'😀'.repeat(280)})).status).toBe(201);
  expect((await call(a,'post',{body:'   '})).status).toBe(400);
  expect((await call(a,'post',{body:''})).status).toBe(400);
  expect((await call(a,'post',{body:5})).status).toBe(400);
  const m=await media(a.id);const r=await call(a,'post',{body:'',media:[m]});expect(r.status).toBe(201);
  expect((await r.json()).media).toEqual([{id:m,width:640,height:480,thumb:true}]);
  expect((await call(a,'post',{body:'x',media:[await media(a.id),await media(a.id),await media(a.id),await media(a.id),await media(a.id)]})).status).toBe(400);
 });
 it('cursor pagination returns 20 then the rest with no overlap',async()=>{
  const a=await account();const ids:string[]=[];
  for(let i=0;i<25;i++)ids.push((await post(a,'p'+i)).id);
  const one=await feed(a,'following');expect(one.items).toHaveLength(20);expect(one.cursor).toBeTruthy();
  const two=await feed(a,'following',one.cursor);expect(two.items).toHaveLength(5);expect(two.cursor).toBeNull();
  const all=[...one.items,...two.items].map((i:any)=>i.id);
  expect(new Set(all).size).toBe(25);expect(all).toEqual([...ids].reverse());
  expect((await get(a,'action=feed&tab=following&cursor=garbage')).status).toBe(400);
 });
 it('reply appears in thread and replies count increments',async()=>{
  const a=await account(),b=await account();
  const root=await post(a,'root'),r1=await post(b,'r1',{replyTo:root.id}),r2=await post(a,'r2',{replyTo:r1.id});
  expect(r1.replyTo).toBe(root.id);expect(r1.replyToUsername).toBe(a.name);
  const t=await (await get(b,`action=thread&id=${r2.id}`)).json();
  expect(t.ancestors.map((p:any)=>p.id)).toEqual([root.id,r1.id]);expect(t.post.id).toBe(r2.id);
  const t2=await (await get(b,`action=thread&id=${root.id}`)).json();
  expect(t2.post.replies).toBe(1);expect(t2.replies.items.map((p:any)=>p.id)).toEqual([r1.id]);
  expect((await feed(a,'discover')).items.map((i:any)=>i.id)).not.toContain(r1.id);
  expect((await call(a,'post',{body:'x',replyTo:randomUUID()})).status).toBe(404);
 });
 it('like is idempotent and counts once',async()=>{
  const a=await account(),b=await account(),p=await post(a,'like me');
  for(let i=0;i<2;i++)expect(await (await call(b,'like',{id:p.id,on:true})).json()).toEqual({likes:1,liked:true});
  expect(await (await call(a,'like',{id:p.id,on:true})).json()).toEqual({likes:2,liked:true});
  expect(await (await call(b,'like',{id:p.id,on:false})).json()).toEqual({likes:1,liked:false});
  expect(await (await call(b,'like',{id:p.id,on:false})).json()).toEqual({likes:1,liked:false});
  expect((await call(b,'like',{id:randomUUID(),on:true})).status).toBe(404);
  expect((await call(b,'like',{id:p.id,on:'yes'})).status).toBe(400);
 });
 it('follow adds author to following feed',async()=>{
  const a=await account(),b=await account(),p=await post(b,'from b');
  expect((await feed(a,'following')).items).toHaveLength(0);
  expect(await (await call(a,'follow',{username:b.name,on:true})).json()).toEqual({followedByMe:true,followers:1});
  expect((await call(a,'follow',{username:b.name,on:true})).status).toBe(200);
  expect((await feed(a,'following')).items.map((i:any)=>i.id)).toEqual([p.id]);
  const prof=await (await get(a,`action=profile&username=${b.name.toUpperCase()}`)).json();
  expect(prof).toMatchObject({username:b.name,followers:1,following:0,posts:1,followedByMe:true,followsYou:false,mine:false});
  expect((await call(a,'follow',{username:a.name,on:true})).status).toBe(400);
  expect((await call(a,'follow',{username:'nobody_here',on:true})).status).toBe(404);
  expect(await (await call(a,'follow',{username:b.name,on:false})).json()).toEqual({followedByMe:false,followers:0});
  const act=await (await get(b,'action=activity')).json();expect(act.items.some((i:any)=>i.kind==='follow'&&i.actor.username===a.name)).toBe(false);
 });
 it('block severs follows both ways and hides profile, posts and search results both ways',async()=>{
  const a=await account(),b=await account(),pa=await post(a,'zzqxa'),pb=await post(b,'zzqxb');
  await call(a,'follow',{username:b.name,on:true});await call(b,'follow',{username:a.name,on:true});
  await call(b,'like',{id:pa.id,on:true});
  expect(await (await call(a,'block',{username:b.name,on:true})).json()).toEqual({blockedByMe:true});
  expect((await query('SELECT 1 FROM social_follows WHERE follower_id=ANY($1)',[[a.id,b.id]])).rows).toHaveLength(0);
  for(const [x,y,py,tag] of [[a,b,pb,'zzqxb'],[b,a,pa,'zzqxa']] as const){
   expect((await get(x,`action=profile&username=${y.name}`)).status).toBe(404);
   expect((await get(x,`action=thread&id=${py.id}`)).status).toBe(404);
   expect((await feed(x,'discover')).items.map((i:any)=>i.id)).not.toContain(py.id);
   expect((await (await get(x,`action=posts&username=${y.name}&kind=posts`)).json()).items ?? []).toHaveLength(0);
   const s=await (await get(x,`action=search&q=${tag}`)).json();expect(s.posts).toHaveLength(0);
   const su=await (await get(x,`action=search&q=${y.name}`)).json();expect(su.users).toHaveLength(0);
   expect((await call(x,'like',{id:py.id,on:true})).status).toBe(404);
   expect((await call(x,'follow',{username:y.name,on:true})).status).toBe(404);
   expect((await call(x,'post',{body:'hi',replyTo:py.id})).status).toBe(404);
  }
  expect((await (await get(a,'action=activity')).json()).items.filter((i:any)=>i.actor.username===b.name)).toHaveLength(0);
  expect((await (await get(a,'action=blocks')).json()).users.map((u:any)=>u.username)).toEqual([b.name]);
  expect((await (await get(b,'action=blocks')).json()).users).toEqual([]);
  await call(a,'block',{username:b.name,on:false});
  expect((await get(b,`action=profile&username=${a.name}`)).status).toBe(200);
  expect((await call(a,'block',{username:a.name,on:true})).status).toBe(400);
 });
 it('three distinct reports auto-hide a post except for its author',async()=>{
  const a=await account(),r=[await account(),await account(),await account()],other=await account(),p=await post(a,'spammy');
  expect((await call(a,'report',{kind:'post',id:p.id,category:'spam'})).status).toBe(400);
  for(const u of r.slice(0,2))expect(await (await call(u,'report',{kind:'post',id:p.id,category:'spam',note:'bad'})).json()).toEqual({ok:true});
  await call(r[0]!,'report',{kind:'post',id:p.id,category:'spam'});
  expect((await feed(other,'discover')).items.map((i:any)=>i.id)).toContain(p.id);
  await call(r[2]!,'report',{kind:'post',id:p.id,category:'hate'});
  expect((await feed(other,'discover')).items.map((i:any)=>i.id)).not.toContain(p.id);
  expect((await get(other,`action=thread&id=${p.id}`)).status).toBe(404);
  const mine=(await feed(a,'discover')).items.find((i:any)=>i.id===p.id);expect(mine).toMatchObject({hidden:true,mine:true});
  expect((await call(r[0]!,'report',{kind:'post',id:p.id,category:'bogus'})).status).toBe(400);
  expect((await call(r[0]!,'report',{kind:'account',username:a.name,category:'other'})).status).toBe(200);
  const row=(await query(`SELECT target_id,target_account_id FROM social_reports WHERE target_kind='account' AND reporter_id=$1`,[r[0]!.id])).rows[0];
  expect(row).toEqual({target_id:a.id,target_account_id:a.id});
  expect((await call(a,'report',{kind:'account',username:a.name,category:'other'})).status).toBe(400);
 });
 it('delete_post tombstones a post with replies and hard-deletes one without',async()=>{
  const a=await account(),b=await account();
  const m=await media(a.id),withReply=(await (await call(a,'post',{body:'parent',media:[m]})).json()),reply=await post(b,'child',{replyTo:withReply.id});
  const lone=await post(a,'lonely');
  expect(await (await call(a,'delete_post',{id:withReply.id})).json()).toEqual({ok:true});
  expect(await (await call(a,'delete_post',{id:lone.id})).json()).toEqual({ok:true});
  expect((await query('SELECT 1 FROM social_posts WHERE id=$1',[lone.id])).rows).toHaveLength(0);
  const t=await (await get(b,`action=thread&id=${reply.id}`)).json();
  expect(t.ancestors[0]).toMatchObject({id:withReply.id,body:'',media:[],deleted:true,author:{username:a.name}});
  expect((await feed(b,'discover')).items.map((i:any)=>i.id)).not.toContain(withReply.id);
  expect((await query('SELECT 1 FROM media_objects WHERE id=$1',[m])).rows).toHaveLength(0);
  expect(await store.get(m+'/full')).toBeNull();expect(await store.get(m+'/thumb')).toBeNull();
  expect((await call(b,'like',{id:withReply.id,on:true})).status).toBe(404);
  expect((await call(a,'delete_post',{id:withReply.id})).status).toBe(404);
 });
 it("cannot delete another user's post",async()=>{
  const a=await account(),b=await account(),p=await post(a,'mine');
  expect((await call(b,'delete_post',{id:p.id})).status).toBe(404);
  expect((await call(b,'delete_post',{id:randomUUID()})).status).toBe(404);
  expect((await query('SELECT 1 FROM social_posts WHERE id=$1',[p.id])).rows).toHaveLength(1);
 });
 it("cannot attach another account's media or a snap-purpose media to a post",async()=>{
  const a=await account(),b=await account();
  const theirs=await media(b.id),snap=await media(a.id,'snap');
  expect((await call(a,'post',{body:'x',media:[theirs]})).status).toBe(400);
  expect((await call(a,'post',{body:'x',media:[snap]})).status).toBe(400);
  expect((await call(a,'post',{body:'x',media:['nope']})).status).toBe(400);
  expect((await query('SELECT state FROM media_objects WHERE id=ANY($1)',[[theirs,snap]])).rows.every((r:any)=>r.state==='pending')).toBe(true);
  expect((await query(`SELECT 1 FROM social_posts WHERE author_id=$1`,[a.id])).rows).toHaveLength(0);
 });
 it('profile update upserts, attaches media and deletes replaced avatar',async()=>{
  const a=await account(),m1=await media(a.id,'avatar'),m2=await media(a.id,'avatar');
  const r=await call(a,'profile',{displayName:'  Ann <b>  ',bio:'hi',avatarId:m1});expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({displayName:'Ann <b>',bio:'hi',avatar:m1,banner:null,mine:true});
  const r2=await (await call(a,'profile',{avatarId:m2})).json();expect(r2).toMatchObject({displayName:'Ann <b>',avatar:m2});
  expect((await query('SELECT 1 FROM media_objects WHERE id=$1',[m1])).rows).toHaveLength(0);expect(await store.get(m1+'/full')).toBeNull();
  expect((await call(a,'profile',{displayName:'x'.repeat(41)})).status).toBe(400);
  expect((await call(a,'profile',{bio:'x'.repeat(161)})).status).toBe(400);
  expect((await call(a,'profile',{avatarId:await media(a.id,'post')})).status).toBe(400);
  expect(await (await call(a,'profile',{avatarId:null})).json()).toMatchObject({avatar:null});
  const noStore=createSocialHandler(db,null);
  expect((await call(a,'profile',{avatarId:m2},{},noStore)).status).toBe(503);
  expect(await (await call(a,'post',{body:'x',media:[m2]},{},noStore)).json()).toEqual({error:'media_not_configured'});
  expect((await (await call(a,'me',undefined,{},noStore)).json()).media).toBe(false);
 });
 it('posts kinds, likes privacy and search escaping',async()=>{
  const a=await account(),b=await account(),root=await post(a,'rootp');
  const rep=await post(a,'a reply',{replyTo:root.id}),m=await media(a.id),pm=await (await call(a,'post',{body:'with 50%_pic',media:[m]})).json();
  const kinds=async(u:User,k:string,who=a)=>(await (await get(u,`action=posts&username=${who.name}&kind=${k}`)).json());
  expect((await kinds(b,'posts')).items.map((i:any)=>i.id)).toEqual([pm.id,root.id]);
  expect((await kinds(b,'replies')).items.map((i:any)=>i.id)).toEqual([rep.id]);
  expect((await kinds(b,'media')).items.map((i:any)=>i.id)).toEqual([pm.id]);
  await call(b,'like',{id:root.id,on:true});await call(b,'like',{id:pm.id,on:true});
  expect((await kinds(b,'likes',b)).items.map((i:any)=>i.id)).toEqual([pm.id,root.id]);
  expect(await kinds(a,'likes',b)).toEqual({items:[],cursor:null});
  expect((await get(a,`action=posts&username=${a.name}&kind=nope`)).status).toBe(400);
  expect((await get(a,'action=posts&username=nobody_zz&kind=posts')).status).toBe(404);
  const s=await (await get(b,'action=search&q='+encodeURIComponent('50%_'))).json();expect(s.posts.map((p:any)=>p.id)).toEqual([pm.id]);
  expect((await (await get(b,'action=search&q='+encodeURIComponent('%'))).json()).posts.length).toBe(1);
  expect((await (await get(b,'action=search&q='+encodeURIComponent(a.name.slice(0,4).toUpperCase()))).json()).users.map((u:any)=>u.username)).toContain(a.name);
  expect((await get(b,'action=search&q=')).status).toBe(400);
  expect((await get(b,'action=search&q='+'x'.repeat(51))).status).toBe(400);
  const act=await (await get(a,'action=activity')).json();
  expect(act.items.filter((i:any)=>i.kind==='like').length).toBe(2);
 });
 it('activity lists replies to my posts by others',async()=>{
  const a=await account(),b=await account(),p=await post(a,'q');await post(b,'answer',{replyTo:p.id});await post(a,'self',{replyTo:p.id});
  const items=(await (await get(a,'action=activity')).json()).items;
  expect(items).toHaveLength(1);expect(items[0]).toMatchObject({kind:'reply',actor:{username:b.name},snippet:'answer'});expect(items[0].postId).toBeTruthy();
 });
 it('delete_all removes profile, posts, likes, follows, messages and media',async()=>{
  const a=await account(),b=await account(),c=await account();
  const m=await media(a.id),tm=await media(a.id,'avatar');
  await call(a,'profile',{displayName:'Gone',avatarId:tm});
  const p=await (await call(a,'post',{body:'bye',media:[m]})).json(),lone=await post(a,'lone'),answered=await post(a,'answered');
  const rep=await post(b,'to a',{replyTo:answered.id}),bp=await post(b,'b post');
  await call(a,'like',{id:bp.id,on:true});await call(b,'like',{id:p.id,on:true});
  await call(a,'follow',{username:b.name,on:true});await call(b,'follow',{username:a.name,on:true});await call(a,'block',{username:c.name,on:true});
  await call(b,'report',{kind:'post',id:bp.id,category:'spam'});await call(a,'report',{kind:'post',id:bp.id,category:'spam'});
  const [lo,hi]=a.id<b.id?[a.id,b.id]:[b.id,a.id];const conv=randomUUID();
  await query('INSERT INTO chat_contacts(owner_id,contact_id) VALUES ($1,$2),($2,$1)',[a.id,b.id]);
  await query('INSERT INTO chat_conversations(id,a_id,b_id) VALUES ($1,$2,$3)',[conv,lo,hi]);
  const snap=await media(b.id,'snap');await store.put(snap+'/full',new Uint8Array([3]));
  await query(`INSERT INTO chat_messages(conversation_id,sender_id,kind,body,expires_at) VALUES ($1,$2,'text','hey',now()+interval '1 day')`,[conv,a.id]);
  await query(`INSERT INTO chat_messages(conversation_id,sender_id,kind,media_id,expires_at) VALUES ($1,$2,'snap',$3,now()+interval '1 day')`,[conv,b.id,snap]);
  expect((await call(a,'delete_all',{confirm:'delete'})).status).toBe(400);
  expect((await call(a,'delete_all',{})).status).toBe(400);
  expect(await (await call(a,'delete_all',{confirm:'DELETE'})).json()).toEqual({ok:true});
  const count=async(sql:string,v:unknown[])=>(await query(sql,v)).rows.length;
  expect(await count('SELECT 1 FROM social_profiles WHERE account_id=$1',[a.id])).toBe(0);
  expect(await count('SELECT 1 FROM social_posts WHERE id=ANY($1)',[[p.id,lone.id]])).toBe(0);
  expect((await query('SELECT deleted,body FROM social_posts WHERE id=$1',[answered.id])).rows[0]).toEqual({deleted:true,body:''});
  expect(await count('SELECT 1 FROM social_likes WHERE account_id=$1 OR post_id=$2',[a.id,p.id])).toBe(0);
  expect(await count('SELECT 1 FROM social_follows WHERE follower_id=$1 OR followee_id=$1',[a.id])).toBe(0);
  expect(await count('SELECT 1 FROM social_blocks WHERE blocker_id=$1',[a.id])).toBe(0);
  expect(await count('SELECT 1 FROM chat_contacts WHERE owner_id=$1 OR contact_id=$1',[a.id])).toBe(0);
  expect(await count('SELECT 1 FROM chat_conversations WHERE id=$1',[conv])).toBe(0);
  expect(await count('SELECT 1 FROM chat_messages WHERE conversation_id=$1',[conv])).toBe(0);
  expect(await count('SELECT 1 FROM media_objects WHERE id=ANY($1)',[[m,tm,snap]])).toBe(0);
  for(const k of [m+'/full',m+'/thumb',tm+'/full',snap+'/full'])expect(await store.get(k)).toBeNull();
  expect(await count('SELECT 1 FROM social_reports WHERE reporter_id=$1',[a.id])).toBe(0);
  expect(await count(`SELECT 1 FROM social_reports WHERE target_id=$1 AND reporter_id IS NULL`,[bp.id])).toBe(1);
  expect(await count('SELECT 1 FROM social_posts WHERE id=ANY($1)',[[rep.id,bp.id]])).toBe(2);
  expect(await count('SELECT 1 FROM accounts WHERE id=$1',[a.id])).toBe(1);
 });
 it('reports on blocked targets are accepted (victims block first)',async()=>{
  const a=await account(),b=await account(),p=await post(a,'rude');
  await call(b,'block',{username:a.name,on:true});
  expect(await (await call(b,'report',{kind:'account',username:a.name,category:'harassment'})).json()).toEqual({ok:true});
  expect(await (await call(b,'report',{kind:'post',id:p.id,category:'harassment'})).json()).toEqual({ok:true});
  expect((await query('SELECT 1 FROM social_reports WHERE reporter_id=$1',[b.id])).rows).toHaveLength(2);
  expect((await call(b,'report',{kind:'post',id:randomUUID(),category:'spam'})).status).toBe(404);
  expect((await call(b,'report',{kind:'account',username:'nobody_zz',category:'spam'})).status).toBe(404);
 });
 it('thread truncates at a blocked or hidden ancestor and hidden posts 404 for strangers',async()=>{
  const a=await account(),b=await account(),c=await account(),d=await account();
  const root=await post(a,'root'),mid=await post(b,'mid',{replyTo:root.id}),leaf=await post(c,'leaf',{replyTo:mid.id});
  await call(c,'block',{username:a.name,on:true});
  let t=await (await get(c,`action=thread&id=${leaf.id}`)).json();
  expect(t.ancestors.map((p:any)=>p.id)).toEqual([mid.id]);
  t=await (await get(d,`action=thread&id=${leaf.id}`)).json();expect(t.ancestors.map((p:any)=>p.id)).toEqual([root.id,mid.id]);
  await query('UPDATE social_posts SET hidden=true WHERE id=$1',[mid.id]);
  t=await (await get(d,`action=thread&id=${leaf.id}`)).json();expect(t.ancestors.map((p:any)=>p.id)).toEqual([]);
  expect(t.post.replyToUsername).toBeNull();
  expect(JSON.stringify(t)).not.toContain('mid');
  expect((await get(d,`action=thread&id=${mid.id}`)).status).toBe(404);
  expect((await call(d,'like',{id:mid.id,on:true})).status).toBe(404);
  expect((await call(d,'post',{body:'x',replyTo:mid.id})).status).toBe(404);
  expect((await (await get(d,`action=posts&username=${b.name}&kind=posts`)).json()).items).toHaveLength(0);
  expect((await (await get(b,`action=posts&username=${b.name}&kind=replies`)).json()).items).toHaveLength(1);
 });
 it('paginates likes and thread replies and breaks created_at ties by id',async()=>{
  const a=await account(),b=await account(),root=await post(a,'root');
  const replies:string[]=[];for(let i=0;i<22;i++)replies.push((await post(b,'r'+i,{replyTo:root.id})).id);
  const one=await (await get(a,`action=thread&id=${root.id}`)).json();expect(one.replies.items).toHaveLength(20);
  const two=await (await get(a,`action=thread&id=${root.id}&cursor=${one.replies.cursor}`)).json();
  expect([...one.replies.items,...two.replies.items].map((p:any)=>p.id)).toEqual(replies);expect(two.replies.cursor).toBeNull();
  for(const id of replies)await call(a,'like',{id,on:true});
  const l1=await (await get(a,`action=posts&username=${a.name}&kind=likes`)).json();expect(l1.items).toHaveLength(20);
  const l2=await (await get(a,`action=posts&username=${a.name}&kind=likes&cursor=${l1.cursor}`)).json();
  expect([...l1.items,...l2.items].map((p:any)=>p.id)).toEqual([...replies].reverse());
  const c=await account();const ids:string[]=[];for(let i=0;i<23;i++)ids.push((await post(c,'t'+i)).id);
  await query(`UPDATE social_posts SET created_at='2000-01-01T00:00:00.123456Z' WHERE id=ANY($1)`,[ids.slice(0,22)]);
  const f1=await feed(c,'following'),f2=await feed(c,'following',f1.cursor);
  const got=[...f1.items,...f2.items].map((p:any)=>p.id);expect(got).toHaveLength(23);expect(new Set(got).size).toBe(23);
  expect((await get(c,'action=feed&tab=following&cursor=')).status).toBe(200);
 },60000);
 it('like and follow rate limits return 429',async()=>{
  const a=await account(),b=await account(),p=await post(b,'x');
  await query('INSERT INTO account_attempts(subject,attempts) VALUES ($1,300),($2,100)',['social:like:'+a.id,'social:follow:'+a.id]);
  expect((await call(a,'like',{id:p.id,on:true})).status).toBe(429);
  const r=await call(a,'follow',{username:b.name,on:true});expect(r.status).toBe(429);expect(r.headers.get('retry-after')).toBeTruthy();
  await query('INSERT INTO account_attempts(subject,attempts) VALUES ($1,60)',['social:search:'+a.id]);
  expect((await get(a,'action=search&q=abc')).status).toBe(429);
 });
 it('requests without a token get 401',async()=>{
  const body={error:'Please log in again.'};
  for(const action of ['me','feed','blocks','activity']){const r=await call(null,action);expect(r.status).toBe(401);expect(await r.json()).toEqual(body);}
  expect((await call(null,'post',{body:'x'})).status).toBe(401);
  expect((await call({token:'acct_'+'0'.repeat(64)} as User,'me')).status).toBe(401);
 });
 it('cross-origin POST is 403, wrong content type 415, bad method 405, unknown action 404',async()=>{
  const a=await account();
  expect((await call(a,'post',{body:'x'},{origin:'https://evil.test'})).status).toBe(403);
  expect((await call(a,'post',{body:'x'},{origin:'https://qcc.test'})).status).toBe(201);
  const r=await handler(new Request(`${URL_}?action=post`,{method:'POST',headers:{authorization:'Bearer '+a.token,'content-type':'text/plain'},body:'{"body":"x"}'}));expect(r.status).toBe(415);
  const m=await handler(new Request(`${URL_}?action=post`,{headers:{authorization:'Bearer '+a.token}}));expect(m.status).toBe(405);expect(m.headers.get('allow')).toBe('POST');
  const m2=await call(a,'me',{});expect(m2.status).toBe(405);expect(m2.headers.get('allow')).toBe('GET');
  expect((await get(a,'action=nonsense')).status).toBe(404);
  expect((await call(a,'post','not an object' as any)).status).toBe(400);
  expect((await handler(new Request(`${URL_}?action=post`,{method:'POST',headers:{authorization:'Bearer '+a.token,'content-type':'application/json'},body:'{bad'}))).status).toBe(400);
  expect((await get(a,'action=feed')).headers.get('cache-control')).toBe('no-store');
 });
 it('post rate limit returns 429 with Retry-After after 30',async()=>{
  const a=await account();
  await query('INSERT INTO account_attempts(subject,attempts) VALUES ($1,30)',['social:post:'+a.id]);
  const r=await call(a,'post',{body:'one too many'});expect(r.status).toBe(429);expect(r.headers.get('retry-after')).toBeTruthy();
 });
 it('user text is returned verbatim (no HTML processing)',async()=>{
  const a=await account(),text='<img src=x onerror=alert(1)> &amp; "q" \'s\' <script>x</script>';
  const p=await post(a,text);expect(p.body).toBe(text);
  expect((await feed(a,'discover')).items.find((i:any)=>i.id===p.id).body).toBe(text);
 });
 it('honours the write freeze for writes only',async()=>{
  const a=await account();
  await query('UPDATE qcc_runtime_flags SET write_freeze=true');
  try{
   const fresh=createSocialHandler({query:db.query,connect:db.connect},store);
   const r=await call(a,'post',{body:'x'},{},fresh);expect(r.status).toBe(503);expect((await r.json()).error).toBe('read_only');
   expect((await call(a,'me',undefined,{},fresh)).status).toBe(200);
  }finally{await query('UPDATE qcc_runtime_flags SET write_freeze=false');}
 });
});
