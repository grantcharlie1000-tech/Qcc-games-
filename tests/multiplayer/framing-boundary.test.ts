import {expect,it} from 'vitest';
import {Reassembler} from '../../src/multiplayer/protocol';

it('rejects oversized whole messages at the configured limit',()=>{
 const reader=new Reassembler(20);
 expect(()=>reader.push(JSON.stringify({t:'hello',name:'too long'}))).toThrow();
});
it('rejects changed fragment counts and resets the partial message',()=>{
 const reader=new Reassembler(20000);
 reader.push(JSON.stringify({p:1,n:0,of:3,s:'{"t":'}));
 expect(()=>reader.push(JSON.stringify({p:1,n:1,of:2,s:'"ping"}'}))).toThrow();
 expect(()=>reader.push(JSON.stringify({p:1,n:1,of:3,s:'"ping"}'}))).toThrow();
});
