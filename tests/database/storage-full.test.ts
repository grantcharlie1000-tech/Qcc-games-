import {afterEach,expect,it,vi} from 'vitest';
vi.mock('@netlify/database',()=>({getDatabase:vi.fn()}));
import {getDatabase} from '@netlify/database';
import accounts from '../../netlify/functions/accounts.mts';
import leaderboard from '../../netlify/functions/leaderboard.mts';
import {createGuardedHandler} from '../../netlify/lib/runtime.mts';
import type {Database} from '../../src/leaderboard/server';

const body={error:'storage_full',message:'Storage is full right now. Your progress is kept on this device.'};
const failures=[
 {code:'53100',message:'private SQL and parameters'},
 {code:'53400',message:'private database URL'},
 new Error('Neon: project size limit exceeded'),
 new Error('could not extend file because project size limit (512 MB) exceeded'),
 new Error('project size limit (0.5 GB) exceeded'),
 new Error('database failed',{cause:{code:'53100'}}),
 new AggregateError([new Error('connection reset'),{code:'53400'}],'pool failed'),
];
afterEach(()=>vi.restoreAllMocks());
it.each(failures)('returns the capacity contract when a database guard fails: %j',async error=>{
 const log=vi.fn(),db:Database={query:async()=>{throw error;},connect:vi.fn()};
 const response=await createGuardedHandler(db,()=>async()=>Response.json({ok:true}),{context:'dev',log})(new Request('https://qcc.test/api'));
 expect(response.status).toBe(507);expect(await response.json()).toEqual(body);expect(response.headers.get('Cache-Control')).toBe('no-store');
 expect(JSON.stringify(log.mock.calls)).not.toContain('private');
});
it('translates capacity errors from the runtime flags check after environment validation',async()=>{
 const db:Database={query:async sql=>{if(sql.includes('qcc_environment'))return {rows:[{name:'development'}]};throw {code:'53100'};},connect:vi.fn()};
 const response=await createGuardedHandler(db,()=>async()=>Response.json({ok:true}),{context:'dev',log:()=>{}})(new Request('https://qcc.test/api'));
 expect(response.status).toBe(507);expect(await response.json()).toEqual(body);
});
it.each([['accounts',accounts],['leaderboard',leaderboard]] as const)('translates %s adapter initialization capacity errors',async(_name,handle)=>{
 vi.mocked(getDatabase).mockImplementation(()=>{throw {code:'53400',message:'private connection string'};});
 const response=await handle(new Request('https://qcc.test/api'));
 expect(response.status).toBe(507);expect(await response.json()).toEqual(body);
});
it.each([new Error('connection reset'),{code:'23505'},new Error('Request size limit exceeded'),null,undefined])('keeps unrelated database failures generic: %j',async error=>{
 const db:Database={query:async()=>{throw error;},connect:vi.fn()};
 const response=await createGuardedHandler(db,()=>async()=>Response.json({ok:true}),{context:'dev',log:()=>{}})(new Request('https://qcc.test/api'));
 expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'Service temporarily unavailable.'});
});
it('handles cyclic error causes without misclassifying them',async()=>{
 const error={message:'connection reset',cause:null as unknown};error.cause=error;
 const db:Database={query:async()=>{throw error;},connect:vi.fn()};
 const response=await createGuardedHandler(db,()=>async()=>Response.json({ok:true}),{context:'dev',log:()=>{}})(new Request('https://qcc.test/api'));
 expect(response.status).toBe(503);
});
