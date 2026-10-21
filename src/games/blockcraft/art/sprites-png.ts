// Minimal PNG encoder (RGBA, 8 bits per channel, stored deflate blocks) so item icons get data URLs without
// a canvas: in Node tests, in DOM-free services, and in browsers whose canvas is unavailable.
const CRC_TABLE=new Uint32Array(256);
for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;CRC_TABLE[n]=c>>>0;}
function crc32(bytes:Uint8Array,start:number,end:number){
  let c=0xffffffff;for(let i=start;i<end;i++)c=CRC_TABLE[(c^bytes[i])&255]^(c>>>8);return(c^0xffffffff)>>>0;
}
function adler32(bytes:Uint8Array){
  let a=1,b=0;for(let i=0;i<bytes.length;i++){a=(a+bytes[i])%65521;b=(b+a)%65521;}return((b<<16)|a)>>>0;
}
/** zlib stream of stored (uncompressed) deflate blocks. */
function zlibStored(data:Uint8Array){
  const blocks=Math.max(1,Math.ceil(data.length/65535)),out=new Uint8Array(2+data.length+blocks*5+4);
  out[0]=0x78;out[1]=0x01;let at=2;
  for(let b=0;b<blocks;b++){
    const start=b*65535,len=Math.min(65535,data.length-start);
    out[at++]=b===blocks-1?1:0;out[at++]=len&255;out[at++]=len>>8;out[at++]=~len&255;out[at++]=(~len>>8)&255;
    out.set(data.subarray(start,start+len),at);at+=len;
  }
  const adler=adler32(data);out[at++]=adler>>>24;out[at++]=adler>>>16&255;out[at++]=adler>>>8&255;out[at++]=adler&255;
  return out;
}
/** Encodes width×height RGBA pixels (row-major, top row first) as a PNG file. */
export function encodePng(width:number,height:number,rgba:ArrayLike<number>):Uint8Array{
  const raw=new Uint8Array(height*(1+width*4));
  for(let y=0;y<height;y++){
    raw[y*(1+width*4)]=0;
    for(let i=0;i<width*4;i++)raw[y*(1+width*4)+1+i]=rgba[y*width*4+i];
  }
  const ihdr=new Uint8Array(13),idat=zlibStored(raw),view=new DataView(ihdr.buffer);
  view.setUint32(0,width);view.setUint32(4,height);ihdr[8]=8;ihdr[9]=6;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
  const chunks:[string,Uint8Array][]=[['IHDR',ihdr],['IDAT',idat],['IEND',new Uint8Array(0)]];
  const out=new Uint8Array(8+chunks.reduce((n,[,d])=>n+12+d.length,0)),ov=new DataView(out.buffer);
  out.set([137,80,78,71,13,10,26,10]);let at=8;
  for(const [type,data] of chunks){
    ov.setUint32(at,data.length);for(let i=0;i<4;i++)out[at+4+i]=type.charCodeAt(i);
    out.set(data,at+8);ov.setUint32(at+8+data.length,crc32(out,at+4,at+8+data.length));at+=12+data.length;
  }
  return out;
}
const B64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function base64(bytes:Uint8Array):string{
  let s='';
  for(let i=0;i<bytes.length;i+=3){
    const a=bytes[i],b=bytes[i+1],c=bytes[i+2],n=a<<16|(b??0)<<8|(c??0);
    s+=B64[n>>18&63]+B64[n>>12&63]+(b===undefined?'=':B64[n>>6&63])+(c===undefined?'=':B64[n&63]);
  }
  return s;
}
/** `data:image/png;base64,...` for RGBA pixels. */
export const pngDataUrl=(width:number,height:number,rgba:ArrayLike<number>)=>`data:image/png;base64,${base64(encodePng(width,height,rgba))}`;
