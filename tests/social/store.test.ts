import {describe,it,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFileStore,createMemoryStore,attachMedia,deleteMediaObjects} from '../../src/media/store';
import {HttpError} from '../../server/api';
const id='m_'+'a'.repeat(32);
describe('media stores',()=>{
 it('round-trips and deletes in memory',async()=>{
  const store=createMemoryStore();await store.put(id+'/full',new Uint8Array([1,2]));
  expect([...(await store.get(id+'/full'))!]).toEqual([1,2]);expect(store.keys()).toEqual([id+'/full']);
  await store.delete(id+'/full');expect(await store.get(id+'/full')).toBeNull();
 });
 it('file store rejects traversal keys and returns null when absent',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'media-'));
  try{
   const store=createFileStore(dir);
   for(const key of ['../x','m_'+'a'.repeat(32)+'/../../x',id+'/other','/etc/passwd'])await expect(store.put(key,new Uint8Array([1]))).rejects.toThrow('Invalid media key');
   await store.put(id+'/thumb',new Uint8Array([9]));expect([...(await store.get(id+'/thumb'))!]).toEqual([9]);
   expect(await store.get(id+'/full')).toBeNull();await store.delete(id+'/thumb');expect(await store.get(id+'/thumb')).toBeNull();
  }finally{await rm(dir,{recursive:true,force:true});}
 });
 it('attachMedia keeps input order and rejects a partial match; deleteMediaObjects clears both variants',async()=>{
  const ids=['m_'+'b'.repeat(32),'m_'+'c'.repeat(32)];
  const rows=ids.map((m,i)=>({id:m,width:10+i,height:20,thumb:i===0}));
  const query=async(sql:string,values?:unknown[])=>{
   if(sql.startsWith('UPDATE'))return {rows:(values![0] as string[]).includes(ids[0]!)?[rows[1]!,rows[0]!].map(r=>({...r,thumb:r.thumb})).filter(r=>(values![0] as string[]).includes(r.id)):[]};
   return {rows:[]};
  };
  const refs=await attachMedia(query,'owner',[ids[1]!,ids[0]!],'post');
  expect(refs.map(r=>r.id)).toEqual([ids[1],ids[0]]);
  await expect(attachMedia(query,'owner',[ids[0]!,'m_'+'d'.repeat(32)],'post')).rejects.toBeInstanceOf(HttpError);
  const store=createMemoryStore();for(const m of ids){await store.put(m+'/full',new Uint8Array([1]));await store.put(m+'/thumb',new Uint8Array([1]));}
  await deleteMediaObjects(query,store,ids);expect(store.keys()).toEqual([]);
 });
});
