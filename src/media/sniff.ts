export type SniffedFormat='jpeg'|'png'|'webp'|'gif'|'heif'|'avif';
const ascii=(bytes:Uint8Array,offset:number,text:string)=>bytes.length>=offset+text.length&&[...text].every((c,i)=>bytes[offset+i]===c.charCodeAt(0));
const HEIF_BRANDS=['heic','heix','heim','heis','hevc','mif1','msf1'];
const AVIF_BRANDS=['avif','avis'];
/** Identifies an accepted image container from its leading bytes. Never trusts a declared type; the decode step still has to succeed. */
export function sniffFormat(bytes:Uint8Array):SniffedFormat|null {
 if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'jpeg';
 if(bytes.length>=8&&[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((v,i)=>bytes[i]===v))return 'png';
 if(ascii(bytes,0,'GIF87a')||ascii(bytes,0,'GIF89a'))return 'gif';
 if(ascii(bytes,0,'RIFF')&&ascii(bytes,8,'WEBP'))return 'webp';
 if(ascii(bytes,4,'ftyp')){
  if(HEIF_BRANDS.some(brand=>ascii(bytes,8,brand)))return 'heif';
  if(AVIF_BRANDS.some(brand=>ascii(bytes,8,brand)))return 'avif';
 }
 return null;
}
