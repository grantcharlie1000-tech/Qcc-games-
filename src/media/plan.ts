/**
 * Pure decisions the browser step makes before it touches a canvas. Adapted from the Whetū client
 * (kiakura lib/tutorUploads/client.ts at 9208032, used with the owner's permission): screen the file,
 * keep small compatible originals, size the redraw. Everything here is advisory; the server re-checks.
 */
export interface OriginalInfo {type:string;size:number;name:string}
/** Largest original the browser will try to decode. The upload itself is capped by MAX_UPLOAD_BYTES after shrinking. */
export const MAX_ORIGINAL_BYTES=20*1024*1024;
/** A photo this small that already fits the purpose's edge is sent exactly as it is (Whetū KEEP_AS_IS_BYTES). */
export const KEEP_AS_IS_BYTES=1024*1024;
const IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','image/avif']);
const IMAGE_EXTENSION=/\.(jpe?g|png|webp|gif|heic|heif|avif)$/i;
/** Types the server decodes without help from the browser, so the bytes may be sent untouched. */
const PASS_THROUGH_TYPES=new Set(['image/jpeg','image/png','image/webp','image/gif']);
export type Screening='empty'|'too_big'|'unsupported';
/** Whetū preparePhotoFile order: type, then size, then empty. A missing type falls back to the extension, as some browsers omit it for HEIC. */
export function screenOriginal(file:OriginalInfo):Screening|null {
 const type=file.type.toLowerCase();
 if(type===''?!IMAGE_EXTENSION.test(file.name):!IMAGE_TYPES.has(type))return 'unsupported';
 if(file.size>MAX_ORIGINAL_BYTES)return 'too_big';
 if(file.size===0)return 'empty';
 return null;
}
/** Square purposes (avatar) are judged by the short side: the server crops, so only the short side decides whether anything needs shrinking. */
export function canSendAsIs(file:OriginalInfo,width:number,height:number,maxEdge:number,square:boolean):boolean {
 if(!PASS_THROUGH_TYPES.has(file.type.toLowerCase())||file.size>KEEP_AS_IS_BYTES)return false;
 if(square&&Math.max(width,height)>4*maxEdge)return false;
 return (square?Math.min(width,height):Math.max(width,height))<=maxEdge;
}
/**
 * The size to redraw at. Ordinary purposes fit the longest edge. Square purposes keep the SHORT side at the
 * square size, because the server then crops to a square: shrinking the long edge to 256 would leave a short
 * side the crop has to upscale. Never enlarges.
 */
export function fitForPurpose(width:number,height:number,maxEdge:number,square:boolean):{width:number;height:number} {
 const basis=square?Math.min(width,height):Math.max(width,height);
 if(!(basis>0))return {width,height};
 let scale=basis<=maxEdge?1:maxEdge/basis;
 // The server crops a square, so a long side beyond 4x the square is never used; the cap keeps the canvas and the server's 10,000 px side limit safe.
 if(square&&Math.max(width,height)*scale>4*maxEdge)scale=4*maxEdge/Math.max(width,height);
 if(scale>=1)return {width,height};
 return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
/** [mime, quality, drawOnWhite] tried in order until one fits the transport limit. White under every JPEG (Whetū encodeFitted) so transparency never turns black. */
export function encodeAttempts(type:string):Array<[string,number|undefined,boolean]> {
 return ['image/png','image/webp','image/gif'].includes(type.toLowerCase())?[['image/png',undefined,false],['image/jpeg',0.85,true]]:[['image/jpeg',0.9,true],['image/jpeg',0.8,true],['image/jpeg',0.7,true]];
}
