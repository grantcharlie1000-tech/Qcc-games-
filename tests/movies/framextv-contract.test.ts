import {expect,it} from 'vitest';
// @ts-expect-error Operator-only Node verification does not ship in browser code.
import {sustainedNativeProgress} from '../../scripts/framextv-live-check.mjs';
it('accepts sustained native advancement from an arbitrary resumed position',()=>{
 expect(sustainedNativeProgress([{time:3000,at:0},{time:3002.5,at:2500},{time:3005,at:5000},{time:3007.5,at:7500}])).toBe(false);
 expect(sustainedNativeProgress([{time:3000,at:0},{time:3002.5,at:2500},{time:3005,at:5000},{time:3007.5,at:7500},{time:3010,at:10000}])).toBe(true);
});
it('does not let a seek jump or compressed timestamps pass the live contract check',()=>{
 expect(sustainedNativeProgress([{time:0,at:0},{time:0,at:2500},{time:0,at:5000},{time:0,at:7500},{time:3000,at:10000}])).toBe(false);
 expect(sustainedNativeProgress([{time:0,at:0},{time:5,at:1},{time:10,at:2},{time:15,at:3},{time:20,at:4}])).toBe(false);
});
it('does not credit frozen or backward clocks, long gaps or invalid observations',()=>{
 expect(sustainedNativeProgress([{time:0,at:0},{time:0,at:2500},{time:0,at:5000},{time:0,at:7500},{time:0,at:10000}])).toBe(false);
 expect(sustainedNativeProgress([{time:20,at:0},{time:15,at:2500},{time:10,at:5000},{time:5,at:7500},{time:0,at:10000}])).toBe(false);
 expect(sustainedNativeProgress([{time:0,at:0},{time:10,at:20000},{time:20,at:40000},{time:30,at:60000},{time:40,at:80000}])).toBe(false);
 expect(sustainedNativeProgress([{time:0,at:0},{time:2.5,at:2500},{time:5,at:5000},{time:7.5,at:7500},{time:10,at:NaN}])).toBe(false);
});
