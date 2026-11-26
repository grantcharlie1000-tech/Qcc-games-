import {expect,test} from 'vitest';
import {megabytes} from '../../src/offline/downloads';

test('download sizes read naturally from nothing to gigabytes',()=>{
 expect(megabytes(0)).toBe('0 MB');
 expect(megabytes(20_000)).toBe('0.1 MB');
 expect(megabytes(1_730_000)).toBe('1.6 MB');
 expect(megabytes(81_000_000)).toBe('77.2 MB');
 expect(megabytes(150*1048576)).toBe('150 MB');
 expect(megabytes(3*1073741824)).toBe('3.0 GB');
});
