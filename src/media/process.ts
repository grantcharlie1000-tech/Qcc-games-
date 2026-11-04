import {POLICIES,QUALITY_LADDER,MAX_INPUT_PIXELS,MAX_INPUT_SIDE,type Purpose,type Policy} from './policy';
import {sniffFormat} from './sniff';
export type MediaErrorCode='unsupported_type'|'too_large'|'too_many_pixels'|'corrupt'|'cannot_compress';
export const MEDIA_MESSAGES:Record<MediaErrorCode,string>={
 unsupported_type:'Use a JPEG, PNG, WebP, GIF or HEIC photo.',
 too_large:'That file is over 4 MB.',
 too_many_pixels:'That photo is too large. Use one under 40 megapixels.',
 corrupt:"That photo couldn't be read.",
 cannot_compress:"That photo couldn't be made small enough. Try another."
};
export const HEIC_MESSAGE="This HEIC photo can't be read here. Change your camera setting to Most Compatible, or send a JPEG.";
export class MediaError extends Error {
 constructor(readonly code:MediaErrorCode,message:string=MEDIA_MESSAGES[code]){super(message);this.name='MediaError';}
}
export interface ProcessedImage {full:Uint8Array;thumb:Uint8Array|null;width:number;height:number}
type Sharp=typeof import('sharp').default;
let loaded:Promise<Sharp>|undefined;
function loadSharp():Promise<Sharp> {
 loaded??=import('sharp').then(module=>{const sharp=module.default;sharp.cache(false);sharp.concurrency(1);return sharp;});
 return loaded;
}
const pixelLimit=(error:unknown)=>/pixel limit/i.test(error instanceof Error?error.message:String(error));
interface Encoded {data:Uint8Array;width:number;height:number}
export async function processImage(input:Uint8Array,purpose:Purpose):Promise<ProcessedImage> {
 const format=sniffFormat(input);
 if(!format)throw new MediaError('unsupported_type');
 const policy:Policy=POLICIES[purpose];
 const sharp=await loadSharp();
 const open=()=>sharp(input,{limitInputPixels:MAX_INPUT_PIXELS,failOn:'error',animated:false});
 // Any Sharp failure is a bad photo; pixel-limit errors and unreadable HEIF get their own codes.
 async function wrap<T>(work:()=>Promise<T>):Promise<T>{
  try{return await work();}catch(error){
   if(error instanceof MediaError)throw error;
   if(pixelLimit(error))throw new MediaError('too_many_pixels');
   if(format==='heif')throw new MediaError('unsupported_type',HEIC_MESSAGE);
   throw new MediaError('corrupt');
  }
 }
 const meta=await wrap(()=>open().metadata());
 if(!meta.width||!meta.height)throw new MediaError('corrupt');
 // Orientation 5-8 swaps the sides, but the limits are symmetric.
 if(meta.width>MAX_INPUT_SIDE||meta.height>MAX_INPUT_SIDE||meta.width*meta.height>MAX_INPUT_PIXELS)throw new MediaError('too_many_pixels');
 const encode=(edge:number,quality:number)=>wrap(async():Promise<Encoded>=>{
  const base=open().rotate();
  const resized=policy.square?base.resize({width:edge,height:edge,fit:'cover',position:'attention'}):base.resize({width:edge,height:edge,fit:'inside',withoutEnlargement:true});
  const {data,info}=await resized.webp({quality,effort:4}).toBuffer({resolveWithObject:true});
  return {data:new Uint8Array(data),width:info.width,height:info.height};
 });
 const edges=policy.floorEdge<policy.maxEdge?[policy.maxEdge,policy.floorEdge]:[policy.maxEdge];
 let full:Encoded|null=null,fallback:Encoded|null=null;
 search:for(const edge of edges)for(const quality of QUALITY_LADDER){
  const candidate=await encode(edge,quality);
  if(candidate.data.byteLength<=policy.targetBytes){full=candidate;break search;}
  if(candidate.data.byteLength<=policy.maxBytes&&(!fallback||candidate.data.byteLength<fallback.data.byteLength))fallback=candidate;
 }
 full??=fallback;
 if(!full)throw new MediaError('cannot_compress');
 let thumb:Uint8Array|null=null;
 if(policy.thumbEdge){
  for(const quality of [70,50,35]){
   const candidate=await encode(policy.thumbEdge,quality);thumb=candidate.data;
   if(thumb.byteLength<=policy.thumbMaxBytes)break;
  }
 }
 return {full:full.data,thumb,width:full.width,height:full.height};
}
