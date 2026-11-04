import {describe,expect,it,vi} from 'vitest';
vi.mock('@netlify/blobs',()=>({getStore:()=>{throw new Error('no Netlify environment');}}));
describe('netlifyMediaStore',()=>{
 it('returns null when Netlify Blobs is unavailable',async()=>{
  const {netlifyMediaStore}=await import('../../netlify/lib/media-store.mts');
  expect(await netlifyMediaStore()).toBeNull();
 });
});
