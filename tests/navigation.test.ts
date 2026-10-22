import {expect,it} from 'vitest';
import {entryHash,entryFromHash,collectionHash} from '../src/core/navigation';
it('uses neutral stable collection URLs and accepts old bookmarks',()=>{
 expect(collectionHash).toBe('#/collection');expect(entryHash('pool')).toBe('#/collection/14');
 expect(entryFromHash(entryHash('pool'))).toBe('pool');expect(entryFromHash('#/game/pool')).toBe('pool');
 for(const invalid of ['#/collection/0','#/collection/999','#/collection/14/extra','#/game/pool/extra'])expect(entryFromHash(invalid)).toBeUndefined();
});
