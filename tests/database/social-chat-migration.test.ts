import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {randomUUID,randomBytes} from 'node:crypto';
import {LocalDB,createLocalPool} from '../support/local-db';
import type {Pool} from 'pg';
const local=new LocalDB();let pool:Pool;
beforeAll(async()=>{const connectionString=await local.start();await local.applyMigrations('db/migrations');pool=createLocalPool(connectionString);},30000);
afterAll(async()=>{await pool?.end();await local.stop();});
async function account(name:string){
 const id=randomUUID(),player=randomBytes(32).toString('hex');
 await pool.query('INSERT INTO arcade_players(id,name) VALUES ($1,$2)',[player,name]);
 await pool.query('INSERT INTO accounts(id,username,password_hash,player_id) VALUES ($1,$2,$3,$4)',[id,name,'scrypt$test',player]);return id;
}
const TABLES=['social_profiles','media_objects','social_posts','social_post_media','social_likes','social_follows','social_blocks','social_reports','social_moderation_actions','chat_contacts','chat_conversations','chat_messages'];
describe('social + chat migration',()=>{
 it('creates every table',async()=>{
  const rows=(await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1)",[TABLES])).rows.map((r:{table_name:string})=>r.table_name).sort();
  expect(rows).toEqual([...TABLES].sort());
 });
 it('rejects a reversed conversation pair',async()=>{
  const x=await account('conv_x'),y=await account('conv_y'),[low,high]=[x,y].sort();
  await pool.query('INSERT INTO chat_conversations(id,a_id,b_id) VALUES ($1,$2,$3)',[randomUUID(),low,high]);
  await expect(pool.query('INSERT INTO chat_conversations(id,a_id,b_id) VALUES ($1,$2,$3)',[randomUUID(),high,low])).rejects.toMatchObject({code:'23514'});
 });
 it('rejects a post body over 280 characters',async()=>{
  const a=await account('post_len');
  await pool.query('INSERT INTO social_posts(id,author_id,body) VALUES ($1,$2,$3)',[randomUUID(),a,'x'.repeat(280)]);
  await expect(pool.query('INSERT INTO social_posts(id,author_id,body) VALUES ($1,$2,$3)',[randomUUID(),a,'x'.repeat(281)])).rejects.toMatchObject({code:'23514'});
 });
 it('cascades posts and messages when an account is deleted',async()=>{
  const x=await account('casc_x'),y=await account('casc_y'),[low,high]=[x,y].sort(),conv=randomUUID(),post=randomUUID();
  await pool.query('INSERT INTO social_posts(id,author_id,body) VALUES ($1,$2,$3)',[post,x,'hi']);
  await pool.query('INSERT INTO chat_conversations(id,a_id,b_id) VALUES ($1,$2,$3)',[conv,low,high]);
  await pool.query("INSERT INTO chat_messages(conversation_id,sender_id,kind,body,expires_at) VALUES ($1,$2,'text','yo',now()+interval '1 day')",[conv,x]);
  await pool.query('DELETE FROM accounts WHERE id=$1',[x]);
  expect((await pool.query('SELECT 1 FROM social_posts WHERE id=$1',[post])).rows).toEqual([]);
  expect((await pool.query('SELECT 1 FROM chat_messages WHERE conversation_id=$1',[conv])).rows).toEqual([]);
  expect((await pool.query('SELECT 1 FROM chat_conversations WHERE id=$1',[conv])).rows).toEqual([]);
 });
});
