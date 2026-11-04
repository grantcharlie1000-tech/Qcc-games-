import type {MediaStore} from '../../src/media/store';
let cached:Promise<MediaStore|null>|undefined;
/** Netlify Blobs adapter. Resolves to null (media disabled) when Blobs is unavailable, e.g. outside Netlify. */
export function netlifyMediaStore():Promise<MediaStore|null> {
 cached??=(async()=>{
  try{
   const {getStore}=await import('@netlify/blobs');
   const store=getStore({name:'qcc-media',consistency:'strong'});
   return {
    async get(key){const data=await store.get(key,{type:'arrayBuffer'});return data===null?null:new Uint8Array(data);},
    async put(key,bytes){await store.set(key,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer);},
    async delete(key){await store.delete(key);}
   } satisfies MediaStore;
  }catch{return null;}
 })();
 return cached;
}
