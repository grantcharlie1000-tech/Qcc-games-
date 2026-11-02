import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {MeshoptDecoder as WasmDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
// @ts-expect-error -- official meshoptimizer JavaScript reference implementation.
import {MeshoptDecoder} from '../../../src/games/strongroom/engine/gfx/operators/meshopt-decoder.js';
it('CSP-compatible decoder reproduces the optimized decoder for every compressed operator buffer',async()=>{
 await WasmDecoder.ready;let buffers=0;
 for(const file of ['soldier_ct.glb','soldier_t.glb','viewmodels/arms_attack.glb','viewmodels/arms_defend.glb']){const raw=readFileSync('public/game-assets/strongroom/models/'+file),jsonLength=raw.readUInt32LE(12),g=JSON.parse(raw.toString('utf8',20,20+jsonLength)),binStart=28+jsonLength;
  for(const view of g.bufferViews){const c=view.extensions?.EXT_meshopt_compression;if(!c)continue;const source=new Uint8Array(raw.subarray(binStart+c.byteOffset,binStart+c.byteOffset+c.byteLength)),a=new Uint8Array(c.count*c.byteStride),b=new Uint8Array(a.length);MeshoptDecoder.decodeGltfBuffer(a,c.count,c.byteStride,source,c.mode,c.filter);WasmDecoder.decodeGltfBuffer(b,c.count,c.byteStride,source,c.mode,c.filter);expect(a).toEqual(b);buffers++;}
 }expect(buffers).toBeGreaterThan(20);
});
