import {it,expect} from 'vitest';
import {MovieStorage,MOVIES_KEY} from '../../src/movies/storage';
it('keeps list and progress local under a separate key',()=>{
 const values=new Map<string,string>();
 const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)} as unknown as Storage;
 const s=new MovieStorage(()=>storage);s.toggle('movie-1');s.progress('movie-1',42);
 expect([...values.keys()]).toEqual([MOVIES_KEY]);
 expect(new MovieStorage(()=>storage).data).toEqual({list:['movie-1'],progress:{'movie-1':42}});
 s.clear();expect(s.data).toEqual({list:[],progress:{}});
});
it('retains changes in memory when storage is blocked',()=>{
 const s=new MovieStorage(()=>{throw new Error('blocked');});s.toggle('movie-1');s.progress('movie-1',10);
 expect(s.durable).toBe(false);expect(s.data.list).toEqual(['movie-1']);expect(s.data.progress['movie-1']).toBe(10);
});
