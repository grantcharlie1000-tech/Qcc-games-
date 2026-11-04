// Vercel Blob adapter for the QCC MediaStore. Server-only: never import from src/.
// Media stays disabled (text social and chat keep working) unless BLOB_READ_WRITE_TOKEN is set.
import type {MediaStore} from '../src/media/store';

const PREFIX='qcc-media/';
type Env=Record<string,string|undefined>;

/**
 * Blobs are stored with access:'private' so they have no public URL and can only be read with the store token,
 * through the authenticated media handler. Resolves to null (media disabled) without a token or if the SDK cannot load.
 */
export async function vercelBlobMediaStore(env:Env=process.env):Promise<MediaStore|null>{
 const token=env.BLOB_READ_WRITE_TOKEN;
 if(!token)return null;
 let sdk:typeof import('@vercel/blob');
 try{sdk=await import('@vercel/blob');}catch{return null;}
 const path=(key:string)=>PREFIX+key;
 return {
  async put(key,bytes){
   await sdk.put(path(key),Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength),{
    access:'private',token,addRandomSuffix:false,allowOverwrite:true,contentType:'image/webp',cacheControlMaxAge:60
   });
  },
  async get(key){
   const result=await sdk.get(path(key),{access:'private',token,useCache:false});
   if(!result||result.statusCode!==200||!result.stream)return null;
   return new Uint8Array(await new Response(result.stream).arrayBuffer());
  },
  async delete(key){await sdk.del(path(key),{token});}
 };
}
