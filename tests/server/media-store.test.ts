import {beforeEach,describe,expect,it,vi} from 'vitest';

const blobs=vi.hoisted(()=>({put:vi.fn(),get:vi.fn(),del:vi.fn()}));
vi.mock('@vercel/blob',()=>blobs);
import {vercelBlobMediaStore} from '../../server/media-store';

const env={BLOB_READ_WRITE_TOKEN:'blob-test-token'};
const KEY='m_'+'a'.repeat(32)+'/full';
beforeEach(()=>vi.clearAllMocks());

describe('Vercel Blob media store',()=>{
 it('is disabled without a token',async()=>{
  expect(await vercelBlobMediaStore({})).toBeNull();
  expect(await vercelBlobMediaStore({BLOB_READ_WRITE_TOKEN:''})).toBeNull();
  expect(blobs.put).not.toHaveBeenCalled();
 });
 it('puts private objects under the qcc-media prefix with a stable pathname',async()=>{
  const store=(await vercelBlobMediaStore(env))!;
  await store.put(KEY,new Uint8Array([1,2,3,4]).subarray(1,3));
  expect(blobs.put).toHaveBeenCalledOnce();
  const [path,body,options]=blobs.put.mock.calls[0]!;
  expect(path).toBe('qcc-media/'+KEY);
  expect([...body as Buffer]).toEqual([2,3]);
  expect(options).toMatchObject({access:'private',token:'blob-test-token',addRandomSuffix:false,allowOverwrite:true});
 });
 it('reads bytes through the authenticated SDK call and maps a missing blob to null',async()=>{
  const store=(await vercelBlobMediaStore(env))!;
  blobs.get.mockResolvedValueOnce({statusCode:200,stream:new Response(new Uint8Array([9,8,7])).body});
  expect([...(await store.get(KEY))!]).toEqual([9,8,7]);
  expect(blobs.get).toHaveBeenCalledWith('qcc-media/'+KEY,expect.objectContaining({access:'private',token:'blob-test-token'}));
  blobs.get.mockResolvedValueOnce(null);
  expect(await store.get(KEY)).toBeNull();
 });
 it('deletes by pathname and surfaces SDK failures so callers keep the row',async()=>{
  const store=(await vercelBlobMediaStore(env))!;
  await store.delete(KEY);
  expect(blobs.del).toHaveBeenCalledWith('qcc-media/'+KEY,{token:'blob-test-token'});
  blobs.del.mockRejectedValueOnce(new Error('boom'));
  await expect(store.delete(KEY)).rejects.toThrow('boom');
 });
});
