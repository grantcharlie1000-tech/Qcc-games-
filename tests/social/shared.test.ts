import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {codePoints,validPostBody} from '../../src/social/shared';
import {validMediaId} from '../../src/media/policy';
import {cursorEncode,cursorDecode,rateLimit,HttpError} from '../../server/api';
const local=new NetlifyDB({logger:()=>{}});let pool:ReturnType<typeof getDatabase>['pool'];
beforeAll(async()=>{const connectionString=await local.start();await local.applyMigrations('netlify/database/migrations');pool=getDatabase({connectionString}).pool;},30000);
afterAll(async()=>{await pool?.end();await local.stop();});
describe('social shared contracts',()=>{
 it('counts code points, not UTF-16 units',()=>{expect(codePoints('😀'.repeat(280))).toBe(280);});
 it('validates post bodies against media count',()=>{
  expect(validPostBody('😀'.repeat(280),0)).toBe(true);
  expect(validPostBody('',1)).toBe(true);expect(validPostBody('',0)).toBe(false);
  expect(validPostBody(' '.repeat(5),0)).toBe(false);expect(validPostBody('x'.repeat(281),0)).toBe(false);
  expect(validPostBody(5,1)).toBe(false);
 });
 it('round-trips cursors and rejects garbage',()=>{
  const id=randomUUID();
  expect(cursorDecode(cursorEncode('2026-11-04T00:00:00.000Z',id))).toEqual({createdAt:'2026-11-04T00:00:00.000Z',id});
  expect(cursorDecode(cursorEncode(new Date('2026-11-04T00:00:00.000Z'),id))?.createdAt).toBe('2026-11-04T00:00:00.000Z');
  expect(cursorDecode('garbage')).toBeNull();
 });
 it('validates media ids',()=>{expect(validMediaId('m_'+'a'.repeat(32))).toBe(true);expect(validMediaId('m_'+'A'.repeat(32))).toBe(false);expect(validMediaId('../x')).toBe(false);});
});
describe('rateLimit with real Postgres',()=>{
 it('throws 429 with Retry-After on call limit+1',async()=>{
  const subject='test:'+randomUUID();
  for(let i=0;i<3;i++)await rateLimit(pool.query.bind(pool),subject,3,60);
  const error=await rateLimit(pool.query.bind(pool),subject,3,60).then(()=>null,e=>e);
  expect(error).toBeInstanceOf(HttpError);expect(error.status).toBe(429);expect(error.code).toBe('rate_limited');
  expect(Number(error.headers['Retry-After'])).toBeGreaterThan(0);
 });
 it('keeps subjects independent',async()=>{
  await rateLimit(pool.query.bind(pool),'test:a'+randomUUID(),1,60);await rateLimit(pool.query.bind(pool),'test:b'+randomUUID(),1,60);
 });
});
