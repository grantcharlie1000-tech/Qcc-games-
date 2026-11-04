import {randomUUID} from 'node:crypto';
import type {Database} from '../leaderboard/server';
import {resolveAccount} from '../accounts/server';
import {writeFrozen,readOnlyResponse} from '../accounts/write-freeze';
import {HttpError,respond,readJson,sameOrigin,rateLimit,errorResponse,cursorEncode,cursorDecode} from '../../server/api';
import {attachMedia,type MediaStore} from '../media/store';
import {mediaKey,validMediaId} from '../media/policy';
import {accountByUsername,isBlockedEitherWay,setBlock} from './blocks';
import {PAGE_SIZE,POST_MAX_MEDIA,DISPLAY_NAME_MAX,BIO_MAX,REPORT_NOTE_MAX,AUTO_HIDE_REPORTS,REPORT_CATEGORIES,LIMITS,codePoints,validPostBody,
 type Author,type MediaRef,type PostView,type Page,type ProfileView,type ActivityItem,type SocialMe,type ReportCategory} from './shared';

type Query=Database['query'];
const BODY_LIMIT=16*1024;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ts=(column:string)=>`to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const bad=(message='Invalid request.')=>new HttpError(400,'invalid_request',message);
const notFound=()=>new HttpError(404,'not_found','Not found.');
/** One reusable visibility predicate: author not blocked either way with the viewer, and hidden posts only for their author. Tombstones are filtered separately. */
const visible=(post:string,viewer='$1')=>`(NOT EXISTS(SELECT 1 FROM social_blocks vb WHERE (vb.blocker_id=${viewer} AND vb.blocked_id=${post}.author_id) OR (vb.blocker_id=${post}.author_id AND vb.blocked_id=${viewer}))
  AND (NOT ${post}.hidden OR ${post}.author_id=${viewer}))`;
const displayName=(profile:string,account:string)=>`COALESCE(NULLIF(${profile}.display_name,''),${account}.username)`;
const POST_COLUMNS=`p.id,p.body,p.deleted,p.hidden,p.reply_to,p.author_id,${ts('p.created_at')} AS created_at,a.username,${displayName('sp','a')} AS display_name,sp.avatar_id,
 (SELECT count(*)::int FROM social_likes l WHERE l.post_id=p.id) AS likes,
 (SELECT count(*)::int FROM social_posts r WHERE r.reply_to=p.id AND NOT r.deleted AND ${visible('r')}) AS replies,
 EXISTS(SELECT 1 FROM social_likes l WHERE l.post_id=p.id AND l.account_id=$1) AS liked,
 (SELECT pa.username FROM social_posts pp JOIN accounts pa ON pa.id=pp.author_id WHERE pp.id=p.reply_to AND ${visible('pp')}) AS reply_to_username,
 (SELECT COALESCE(json_agg(json_build_object('id',m.id,'width',m.width,'height',m.height,'thumb',m.thumb_bytes>0) ORDER BY pm.position),'[]'::json)
   FROM social_post_media pm JOIN media_objects m ON m.id=pm.media_id WHERE pm.post_id=p.id) AS media`;
const POST_FROM=`FROM social_posts p JOIN accounts a ON a.id=p.author_id LEFT JOIN social_profiles sp ON sp.account_id=p.author_id`;
const authorOf=(row:any):Author=>({username:row.username,displayName:row.display_name,avatar:row.avatar_id??null});
function postView(row:any,viewer:string):PostView {
 const deleted=!!row.deleted;
 return {
  id:row.id,author:authorOf(row),body:deleted?'':row.body,
  media:deleted?[]:(row.media as any[]).map((m):MediaRef=>({id:m.id,width:Number(m.width),height:Number(m.height),thumb:!!m.thumb})),
  replyTo:row.reply_to??null,replyToUsername:row.reply_to_username??null,createdAt:row.created_at,
  likes:Number(row.likes),replies:Number(row.replies),liked:!!row.liked,mine:row.author_id===viewer,deleted,hidden:!!row.hidden
 };
}
interface PageOptions {joins?:string;where:string;params?:unknown[];sort?:string;dir?:'DESC'|'ASC';tombstones?:boolean;cursor:string|null}
/** Keyset pagination on (sort column, post id); extra params start at $4. */
async function postPage(query:Query,viewer:string,options:PageOptions):Promise<Page<PostView>> {
 const sort=options.sort??'p.created_at',dir=options.dir??'DESC',op=dir==='DESC'?'<':'>';
 let cursor:{createdAt:string;id:string}|null=null;
 if(options.cursor!==null){cursor=cursorDecode(options.cursor);if(!cursor)throw bad('Invalid cursor.');}
 const result=await query(`SELECT ${POST_COLUMNS},${ts(sort)} AS sort_ts ${POST_FROM} ${options.joins??''}
  WHERE ${visible('p')}${options.tombstones?'':' AND NOT p.deleted'} AND (${options.where})
   AND ($2::timestamptz IS NULL OR (${sort},p.id) ${op} ($2::timestamptz,$3::uuid))
  ORDER BY ${sort} ${dir},p.id ${dir} LIMIT ${PAGE_SIZE+1}`,[viewer,cursor?.createdAt??null,cursor?.id??null,...(options.params??[])]);
 const rows=result.rows.slice(0,PAGE_SIZE),last=rows[rows.length-1];
 return {items:rows.map(row=>postView(row,viewer)),cursor:result.rows.length>PAGE_SIZE&&last?cursorEncode(last.sort_ts,last.id):null};
}
async function postsByIds(query:Query,viewer:string,ids:string[]):Promise<PostView[]> {
 if(!ids.length)return [];
 const result=await query(`SELECT ${POST_COLUMNS} ${POST_FROM} WHERE p.id=ANY($2::uuid[]) AND ${visible('p')}`,[viewer,ids]);
 const byId=new Map<string,PostView>(result.rows.map(row=>[row.id as string,postView(row,viewer)]));
 return ids.flatMap(id=>byId.get(id)??[]);
}
async function profileView(query:Query,viewer:string,accountId:string):Promise<ProfileView|null> {
 const result=await query(`SELECT a.id,a.username,${ts('a.created_at')} AS joined,${displayName('sp','a')} AS display_name,COALESCE(sp.bio,'') AS bio,sp.avatar_id,sp.banner_id,
   (SELECT count(*)::int FROM social_follows WHERE followee_id=a.id) AS followers,
   (SELECT count(*)::int FROM social_follows WHERE follower_id=a.id) AS following,
   (SELECT count(*)::int FROM social_posts x WHERE x.author_id=a.id AND NOT x.deleted AND (NOT x.hidden OR x.author_id=$1)) AS posts,
   EXISTS(SELECT 1 FROM social_follows WHERE follower_id=a.id AND followee_id=$1) AS follows_you,
   EXISTS(SELECT 1 FROM social_follows WHERE follower_id=$1 AND followee_id=a.id) AS followed_by_me,
   EXISTS(SELECT 1 FROM social_blocks WHERE blocker_id=$1 AND blocked_id=a.id) AS blocked_by_me
  FROM accounts a LEFT JOIN social_profiles sp ON sp.account_id=a.id WHERE a.id=$2`,[viewer,accountId]);
 const row=result.rows[0];if(!row)return null;
 return {username:row.username,displayName:row.display_name,bio:row.bio,avatar:row.avatar_id??null,banner:row.banner_id??null,joinedAt:row.joined,
  followers:row.followers,following:row.following,posts:row.posts,followsYou:!!row.follows_you,followedByMe:!!row.followed_by_me,blockedByMe:!!row.blocked_by_me,mine:row.id===viewer};
}
const likePattern=(text:string)=>text.replace(/[\\%_]/g,match=>'\\'+match);
const isObject=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const GET_ACTIONS=new Set(['me','feed','thread','profile','posts','search','activity','blocks']);
const POST_ACTIONS=new Set(['post','delete_post','like','follow','block','report','profile','delete_all']);

export function createSocialHandler(db:Database,store:MediaStore|null):(request:Request)=>Promise<Response> {
 async function tx<T>(work:(query:Query)=>Promise<T>):Promise<T> {
  const client=await db.connect();
  try{
   await client.query('BEGIN');
   const result=await work(client.query.bind(client) as Query);
   await client.query('COMMIT');return result;
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client.release();}
 }
 /** Best-effort, after COMMIT: an orphaned blob is harmless, a failed delete must not fail the request. */
 async function dropBlobs(ids:string[]):Promise<void> {
  if(!store)return;
  for(const id of ids)for(const variant of ['full','thumb'] as const)try{await store.delete(mediaKey(id,variant));}catch{/* best effort */}
 }
 const targetAccount=async(viewer:string,username:unknown)=>{
  if(typeof username!=='string'||!/^[A-Za-z0-9_.-]{3,24}$/.test(username))throw notFound();
  const target=await accountByUsername(db.query,username);
  if(!target||(target.id!==viewer&&await isBlockedEitherWay(db.query,viewer,target.id)))throw notFound();
  return target;
 };
 const postId=(value:unknown):string=>{if(typeof value!=='string'||!UUID.test(value))throw notFound();return value.toLowerCase();};
 const visiblePost=async(viewer:string,id:string,allowDeleted=false)=>{
  const result=await db.query(`SELECT p.id,p.author_id,p.deleted FROM social_posts p WHERE p.id=$2 AND ${visible('p')}${allowDeleted?'':' AND NOT p.deleted'}`,[viewer,id]);
  if(!result.rows[0])throw notFound();return result.rows[0] as {id:string;author_id:string;deleted:boolean};
 };

 async function get(action:string,viewer:string,params:URLSearchParams):Promise<unknown> {
  const cursor=params.get('cursor')||null;
  switch(action){
   case 'me':{
    const profile=await profileView(db.query,viewer,viewer);if(!profile)throw notFound();
    return {profile,media:store!==null} satisfies SocialMe;
   }
   case 'feed':{
    const tab=params.get('tab');
    if(tab==='following')return postPage(db.query,viewer,{cursor,where:'p.author_id=$1 OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=$1 AND f.followee_id=p.author_id)'});
    if(tab==='discover')return postPage(db.query,viewer,{cursor,where:'p.reply_to IS NULL'});
    throw bad('Unknown tab.');
   }
   case 'thread':{
    const id=postId(params.get('id'));
    const [post]=await postsByIds(db.query,viewer,[id]);if(!post)throw notFound();
    const chain=await db.query(`WITH RECURSIVE chain(id,reply_to,depth) AS (
      SELECT p.id,p.reply_to,1 FROM social_posts p WHERE p.id=(SELECT reply_to FROM social_posts WHERE id=$2) AND ${visible('p')}
      UNION ALL SELECT p.id,p.reply_to,c.depth+1 FROM social_posts p JOIN chain c ON p.id=c.reply_to WHERE c.depth<20 AND ${visible('p')}
     ) SELECT id FROM chain ORDER BY depth DESC`,[viewer,id]);
    const ancestors=await postsByIds(db.query,viewer,chain.rows.map(row=>row.id as string));
    const replies=await postPage(db.query,viewer,{cursor,where:'p.reply_to=$4',params:[id],dir:'ASC',tombstones:true});
    return {ancestors,post,replies};
   }
   case 'profile':{
    const target=await targetAccount(viewer,params.get('username'));
    const profile=await profileView(db.query,viewer,target.id);if(!profile)throw notFound();return profile;
   }
   case 'posts':{
    const kind=params.get('kind');
    if(!['posts','replies','media','likes'].includes(kind??''))throw bad('Unknown kind.');
    const target=await targetAccount(viewer,params.get('username'));
    if(kind==='likes'){
     if(target.id!==viewer)return {items:[],cursor:null};
     return postPage(db.query,viewer,{cursor,joins:'JOIN social_likes lk ON lk.post_id=p.id AND lk.account_id=$4',where:'true',params:[viewer],sort:'lk.created_at'});
    }
    const where={posts:'p.author_id=$4 AND p.reply_to IS NULL',replies:'p.author_id=$4 AND p.reply_to IS NOT NULL',
     media:'p.author_id=$4 AND EXISTS(SELECT 1 FROM social_post_media pm WHERE pm.post_id=p.id)'}[kind as 'posts'|'replies'|'media'];
    return postPage(db.query,viewer,{cursor,where,params:[target.id]});
   }
   case 'search':{
    const q=(params.get('q')??'').trim();
    if(!q||codePoints(q)>50)throw bad('Search must be 1 to 50 characters.');
    await rateLimit(db.query,'social:search:'+viewer,60,60);
    const pattern=likePattern(q);
    const users=await db.query(`SELECT a.username,${displayName('sp','a')} AS display_name,sp.avatar_id FROM accounts a LEFT JOIN social_profiles sp ON sp.account_id=a.id
     WHERE (lower(a.username) LIKE lower($2)||'%' OR sp.display_name ILIKE '%'||$2||'%')
      AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=a.id) OR (b.blocker_id=a.id AND b.blocked_id=$1))
     ORDER BY (lower(a.username) LIKE lower($2)||'%') DESC,lower(a.username) LIMIT 20`,[viewer,pattern]);
    const posts=await db.query(`SELECT ${POST_COLUMNS} ${POST_FROM} WHERE ${visible('p')} AND NOT p.deleted AND p.body ILIKE '%'||$2||'%'
     ORDER BY p.created_at DESC,p.id DESC LIMIT 20`,[viewer,pattern]);
    return {users:users.rows.map(authorOf),posts:posts.rows.map(row=>postView(row,viewer))};
   }
   case 'activity':{
    const result=await db.query(`SELECT x.kind,x.post_id,left(x.snippet,80) AS snippet,${ts('x.at')} AS at,a.username,${displayName('sp','a')} AS display_name,sp.avatar_id FROM (
      SELECT 'like' AS kind,l.account_id AS actor,p.id AS post_id,p.body AS snippet,l.created_at AS at FROM social_likes l JOIN social_posts p ON p.id=l.post_id
       WHERE p.author_id=$1 AND l.account_id<>$1 AND NOT p.deleted
      UNION ALL SELECT 'reply',r.author_id,r.id,r.body,r.created_at FROM social_posts r JOIN social_posts p ON p.id=r.reply_to
       WHERE p.author_id=$1 AND r.author_id<>$1 AND NOT r.deleted AND NOT r.hidden
      UNION ALL SELECT 'follow',f.follower_id,NULL::uuid,NULL::text,f.created_at FROM social_follows f WHERE f.followee_id=$1
     ) x JOIN accounts a ON a.id=x.actor LEFT JOIN social_profiles sp ON sp.account_id=a.id
     WHERE NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=x.actor) OR (b.blocker_id=x.actor AND b.blocked_id=$1))
     ORDER BY x.at DESC LIMIT 50`,[viewer]);
    return {items:result.rows.map((row):ActivityItem=>({kind:row.kind,actor:authorOf(row),postId:row.post_id??null,snippet:row.snippet??null,at:row.at}))};
   }
   default:{
    const result=await db.query(`SELECT a.username,${displayName('sp','a')} AS display_name,sp.avatar_id FROM social_blocks b JOIN accounts a ON a.id=b.blocked_id
     LEFT JOIN social_profiles sp ON sp.account_id=a.id WHERE b.blocker_id=$1 ORDER BY b.created_at DESC`,[viewer]);
    return {users:result.rows.map(authorOf)};
   }
  }
 }

 async function createPost(viewer:string,data:Record<string,unknown>):Promise<PostView> {
  const media=data.media===undefined?[]:data.media;
  if(!Array.isArray(media)||media.length>POST_MAX_MEDIA||!media.every(validMediaId)||new Set(media).size!==media.length)throw bad('Invalid media.');
  if(!validPostBody(data.body,media.length))throw bad('A post needs 1 to 280 characters or a photo.');
  const replyTo=data.replyTo===undefined||data.replyTo===null?null:postId(data.replyTo);
  if(media.length&&!store)throw new HttpError(503,'media_not_configured','Photos are not available.');
  await rateLimit(db.query,'social:post:'+viewer,LIMITS.post.limit,LIMITS.post.seconds);
  const id=randomUUID(),body=(data.body as string).trim();
  await tx(async q=>{
   if(replyTo){
    const parent=await q(`SELECT p.id FROM social_posts p WHERE p.id=$2 AND NOT p.deleted AND ${visible('p')} FOR SHARE OF p`,[viewer,replyTo]);
    if(!parent.rows[0])throw notFound();
   }
   await attachMedia(q,viewer,media,'post');
   await q('INSERT INTO social_posts(id,author_id,body,reply_to) VALUES ($1,$2,$3,$4)',[id,viewer,body,replyTo]);
   if(media.length)await q(`INSERT INTO social_post_media(post_id,position,media_id) SELECT $1,(t.n-1)::smallint,t.m FROM unnest($2::text[]) WITH ORDINALITY AS t(m,n)`,[id,media]);
  });
  const [view]=await postsByIds(db.query,viewer,[id]);if(!view)throw notFound();return view;
 }

 async function deletePost(viewer:string,data:Record<string,unknown>) {
  const id=postId(data.id);
  const dropped=await tx(async q=>{
   const own=await q('SELECT id FROM social_posts WHERE id=$1 AND author_id=$2 AND NOT deleted FOR UPDATE',[id,viewer]);
   if(!own.rows[0])throw notFound();
   const media=(await q('SELECT media_id FROM social_post_media WHERE post_id=$1',[id])).rows.map(row=>row.media_id as string);
   const replied=(await q('SELECT 1 FROM social_posts WHERE reply_to=$1 LIMIT 1',[id])).rows.length>0;
   await q('DELETE FROM social_likes WHERE post_id=$1',[id]);
   if(replied)await q(`UPDATE social_posts SET deleted=true,body='' WHERE id=$1`,[id]);
   else await q('DELETE FROM social_posts WHERE id=$1',[id]);
   if(media.length)await q('DELETE FROM media_objects WHERE id=ANY($1::text[])',[media]);
   return media;
  });
  await dropBlobs(dropped);
  return {ok:true};
 }

 async function like(viewer:string,data:Record<string,unknown>) {
  const id=postId(data.id);
  if(typeof data.on!=='boolean')throw bad();
  await visiblePost(viewer,id);
  await rateLimit(db.query,'social:like:'+viewer,LIMITS.like.limit,LIMITS.like.seconds);
  if(data.on)await db.query(`INSERT INTO social_likes(post_id,account_id) SELECT $1,$2 WHERE EXISTS(SELECT 1 FROM social_posts p WHERE p.id=$1 AND NOT p.deleted AND ${visible('p','$2')}) ON CONFLICT DO NOTHING`,[id,viewer]);
  else await db.query('DELETE FROM social_likes WHERE post_id=$1 AND account_id=$2',[id,viewer]);
  const result=await db.query('SELECT count(*)::int AS likes,bool_or(account_id=$2) AS liked FROM social_likes WHERE post_id=$1',[id,viewer]);
  return {likes:result.rows[0].likes as number,liked:!!result.rows[0].liked};
 }

 async function follow(viewer:string,data:Record<string,unknown>) {
  if(typeof data.on!=='boolean')throw bad();
  const target=await targetAccount(viewer,data.username);
  if(target.id===viewer)throw bad('You cannot follow yourself.');
  await rateLimit(db.query,'social:follow:'+viewer,LIMITS.follow.limit,LIMITS.follow.seconds);
  if(data.on)await db.query(`INSERT INTO social_follows(follower_id,followee_id) SELECT $1,$2 WHERE NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=$2) OR (b.blocker_id=$2 AND b.blocked_id=$1)) ON CONFLICT DO NOTHING`,[viewer,target.id]);
  else await db.query('DELETE FROM social_follows WHERE follower_id=$1 AND followee_id=$2',[viewer,target.id]);
  const result=await db.query(`SELECT count(*)::int AS followers,COALESCE(bool_or(follower_id=$1),false) AS mine FROM social_follows WHERE followee_id=$2`,[viewer,target.id]);
  return {followedByMe:!!result.rows[0].mine,followers:result.rows[0].followers as number};
 }

 async function block(viewer:string,data:Record<string,unknown>) {
  if(typeof data.on!=='boolean')throw bad();
  if(typeof data.username!=='string'||!/^[A-Za-z0-9_.-]{3,24}$/.test(data.username))throw notFound();
  const target=await accountByUsername(db.query,data.username);if(!target)throw notFound();
  if(target.id===viewer)throw bad('You cannot block yourself.');
  await setBlock(db.query,viewer,target.id,data.on);
  return {blockedByMe:data.on};
 }

 async function report(viewer:string,data:Record<string,unknown>) {
  const category=data.category as ReportCategory;
  if(data.kind!=='post'&&data.kind!=='account')throw bad();
  if(!REPORT_CATEGORIES.includes(category))throw bad('Choose a report category.');
  const note=data.note===undefined||data.note===null?'':data.note;
  if(typeof note!=='string'||codePoints(note.trim())>REPORT_NOTE_MAX)throw bad('Note is too long.');
  let targetId:string,accountId:string;
  if(data.kind==='post'){
   // Victims usually block first, so reports look the target up directly: only a missing or hard-deleted target is a 404.
   const found=await db.query('SELECT id,author_id FROM social_posts WHERE id=$1 AND NOT deleted',[postId(data.id)]);
   const post=found.rows[0] as {id:string;author_id:string}|undefined;if(!post)throw notFound();
   if(post.author_id===viewer)throw bad('You cannot report yourself.');
   targetId=post.id;accountId=post.author_id;
  }else{
   if(typeof data.username!=='string'||!/^[A-Za-z0-9_.-]{3,24}$/.test(data.username))throw notFound();
   const target=await accountByUsername(db.query,data.username);if(!target)throw notFound();
   if(target.id===viewer)throw bad('You cannot report yourself.');
   targetId=accountId=target.id;
  }
  await rateLimit(db.query,'social:report:'+viewer,LIMITS.report.limit,LIMITS.report.seconds);
  await tx(async q=>{
   await q(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,['report:'+targetId]);
   const inserted=await q(`INSERT INTO social_reports(reporter_id,target_kind,target_id,target_account_id,category,note) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id`,
    [viewer,data.kind,targetId,accountId,category,note.trim()]);
   if(inserted.rows[0]&&data.kind==='post')await q(`UPDATE social_posts SET hidden=true WHERE id=$1 AND NOT hidden
     AND (SELECT count(DISTINCT reporter_id) FROM social_reports WHERE target_kind='post' AND target_id=$2 AND reporter_id IS NOT NULL)>=$3`,[targetId,targetId,AUTO_HIDE_REPORTS]);
  });
  return {ok:true};
 }

 async function updateProfile(viewer:string,data:Record<string,unknown>) {
  const text=(value:unknown,max:number)=>{
   if(typeof value!=='string')throw bad();const trimmed=value.trim();if(codePoints(trimmed)>max)throw bad('Too long.');return trimmed;
  };
  const name=data.displayName===undefined?undefined:text(data.displayName,DISPLAY_NAME_MAX);
  const bio=data.bio===undefined?undefined:text(data.bio,BIO_MAX);
  const imageField=(value:unknown)=>{if(value===undefined||value===null)return value;if(!validMediaId(value))throw bad('Invalid media.');return value;};
  const avatarId=imageField(data.avatarId),bannerId=imageField(data.bannerId);
  if((avatarId||bannerId)&&!store)throw new HttpError(503,'media_not_configured','Photos are not available.');
  const dropped=await tx(async q=>{
   await q('INSERT INTO social_profiles(account_id) VALUES ($1) ON CONFLICT DO NOTHING',[viewer]);
   const current=(await q('SELECT display_name,bio,avatar_id,banner_id FROM social_profiles WHERE account_id=$1 FOR UPDATE',[viewer])).rows[0];
   const drop:string[]=[];
   const next={avatar:current.avatar_id as string|null,banner:current.banner_id as string|null};
   for(const [key,value,purpose] of [['avatar',avatarId,'avatar'],['banner',bannerId,'banner']] as const){
    if(value===undefined||value===next[key])continue;
    if(value!==null)await attachMedia(q,viewer,[value],purpose);
    if(next[key])drop.push(next[key]!);
    next[key]=value;
   }
   await q('UPDATE social_profiles SET display_name=$2,bio=$3,avatar_id=$4,banner_id=$5,updated_at=now() WHERE account_id=$1',
    [viewer,name??current.display_name,bio??current.bio,next.avatar,next.banner]);
   if(drop.length)await q('DELETE FROM media_objects WHERE id=ANY($1::text[]) AND owner_id=$2',[drop,viewer]);
   return drop;
  });
  await dropBlobs(dropped);
  const profile=await profileView(db.query,viewer,viewer);if(!profile)throw notFound();return profile;
 }

 async function deleteAll(viewer:string,data:Record<string,unknown>) {
  if(data.confirm!=='DELETE')throw bad('Confirmation required.');
  const dropped=await tx(async q=>{
   await q('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[viewer]);
   const media=new Set<string>();
   const owned=await q('SELECT id FROM media_objects WHERE owner_id=$1',[viewer]);
   // Snaps the other person sent into the caller's conversations disappear with those conversations.
   const chat=await q(`SELECT m.media_id FROM chat_messages m JOIN chat_conversations c ON c.id=m.conversation_id WHERE (c.a_id=$1 OR c.b_id=$1) AND m.media_id IS NOT NULL`,[viewer]);
   for(const row of [...owned.rows,...chat.rows])media.add((row.id??row.media_id) as string);
   await q(`UPDATE social_posts p SET deleted=true,body='' WHERE p.author_id=$1 AND NOT p.deleted AND EXISTS(SELECT 1 FROM social_posts r WHERE r.reply_to=p.id AND r.author_id<>$1)`,[viewer]);
   await q('DELETE FROM social_likes WHERE account_id=$1 OR post_id IN (SELECT id FROM social_posts WHERE author_id=$1)',[viewer]);
   if(media.size)await q('DELETE FROM media_objects WHERE id=ANY($1::text[])',[[...media]]);
   await q('DELETE FROM social_posts WHERE author_id=$1 AND NOT deleted',[viewer]);
   await q('DELETE FROM social_follows WHERE follower_id=$1 OR followee_id=$1',[viewer]);
   await q('DELETE FROM social_blocks WHERE blocker_id=$1',[viewer]);
   await q('DELETE FROM social_profiles WHERE account_id=$1',[viewer]);
   await q('DELETE FROM chat_contacts WHERE owner_id=$1 OR contact_id=$1',[viewer]);
   await q('DELETE FROM chat_conversations WHERE a_id=$1 OR b_id=$1',[viewer]);
   await q('UPDATE social_reports SET reporter_id=NULL WHERE reporter_id=$1',[viewer]);
   return [...media];
  });
  await dropBlobs(dropped);
  return {ok:true};
 }

 const posts:Record<string,(viewer:string,data:Record<string,unknown>)=>Promise<unknown>>={
  delete_post:deletePost,like,follow,block,report,profile:updateProfile,delete_all:deleteAll
 };

 return async request=>{
  try{
   const params=new URL(request.url).searchParams,action=params.get('action')??'';
   const isGet=GET_ACTIONS.has(action),isPost=POST_ACTIONS.has(action);
   if(!isGet&&!isPost)return respond({error:'not_found'},404);
   const wanted=request.method==='GET'?isGet:request.method==='POST'?isPost:false;
   if(!wanted)return respond({error:'method_not_allowed'},405,{Allow:request.method==='GET'||!isGet?'POST':'GET'});
   const account=await resolveAccount(db,request);
   if(!account)return respond({error:'Please log in again.'},401);
   if(request.method==='GET')return respond(await get(action,account.id,params));
   if(!sameOrigin(request))throw new HttpError(403,'forbidden','Cross-origin requests are not allowed.');
   if(!(request.headers.get('content-type')??'').toLowerCase().startsWith('application/json'))throw new HttpError(415,'unsupported_type','Content-Type must be application/json.');
   if(await writeFrozen(db))return readOnlyResponse();
   const data=await readJson(request,BODY_LIMIT);
   if(!isObject(data))throw bad();
   if(action==='post')return respond(await createPost(account.id,data),201);
   return respond(await posts[action]!(account.id,data));
  }catch(error){
   if(error instanceof HttpError&&error.code==='not_found')return respond({error:'not_found'},404);
   if(error instanceof HttpError&&error.code==='media_not_configured')return respond({error:'media_not_configured'},503);
   return errorResponse(error,'social_unavailable');
  }
 };
}
