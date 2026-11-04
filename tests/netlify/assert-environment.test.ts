import {describe,it,expect} from 'vitest';
import {assertEnvironment} from '../../netlify/lib/runtime.mts';
import type {Database} from '../../src/leaderboard/server';
const pool=(rows:{name:string}[])=>({query:async()=>({rows})}) as unknown as Database;
describe('assertEnvironment',()=>{
 it('passes when the marker matches the context',async()=>{
  await expect(assertEnvironment(pool([{name:'production'}]),{context:'production',env:{}})).resolves.toBeUndefined();
 });
 it('rejects a mismatched or missing marker unless allowed',async()=>{
  await expect(assertEnvironment(pool([{name:'preview'}]),{context:'production',env:{}})).rejects.toThrow('mismatch');
  await expect(assertEnvironment(pool([]),{context:'production',env:{},allowMissingMarker:false})).rejects.toThrow('mismatch');
  await expect(assertEnvironment(pool([]),{context:'dev',env:{},allowMissingMarker:true})).resolves.toBeUndefined();
 });
 it('rejects a conflicting expected environment',async()=>{
  await expect(assertEnvironment(pool([{name:'production'}]),{context:'production',expectedEnv:'preview',env:{}})).rejects.toThrow('conflicts');
 });
});
