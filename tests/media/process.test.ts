import {describe,it,expect} from 'vitest';
import sharp from 'sharp';
import {randomBytes} from 'node:crypto';
import {crc32,deflateSync} from 'node:zlib';
import {processImage,MediaError,MEDIA_MESSAGES} from '../../src/media/process';
import {POLICIES} from '../../src/media/policy';
function noise(width:number,height:number,channels:3|4=3){return sharp(randomBytes(width*height*channels),{raw:{width,height,channels}});}
async function noisyJpeg(width:number,height:number,exif?:Record<string,Record<string,string>>){
 let image=noise(width,height).blur(2).jpeg({quality:90});if(exif)image=image.withMetadata({orientation:6,exif});return new Uint8Array(await image.toBuffer());
}
const code=async(promise:Promise<unknown>)=>{try{await promise;}catch(error){expect(error).toBeInstanceOf(MediaError);return (error as MediaError).code;}return 'none';};
describe('processImage',()=>{
 it('rotates, caps the edge, strips EXIF and GPS and stays under 1 MiB',async()=>{
  const input=await noisyJpeg(4000,3000,{IFD0:{Orientation:'6',Make:'TestCam'},IFD3:{GPSLatitudeRef:'S',GPSLatitude:'41/1 17/1 0/1'}});
  expect((await sharp(input).metadata()).orientation).toBe(6);
  const result=await processImage(input,'post');
  const meta=await sharp(result.full).metadata();
  expect(meta.format).toBe('webp');
  expect(Math.max(meta.width!,meta.height!)).toBeLessThanOrEqual(1600);
  expect(meta.width!).toBeLessThan(meta.height!);
  expect(meta.exif).toBeUndefined();
  expect(meta.orientation===undefined||meta.orientation===1).toBe(true);
  expect(result.full.byteLength).toBeLessThanOrEqual(1024*1024);
  expect({width:result.width,height:result.height}).toEqual({width:meta.width,height:meta.height});
  const thumb=await sharp(result.thumb!).metadata();
  expect(Math.max(thumb.width!,thumb.height!)).toBeLessThanOrEqual(480);
  expect(thumb.exif).toBeUndefined();
  expect(result.thumb!.byteLength).toBeLessThanOrEqual(POLICIES.post.thumbMaxBytes);
 },60000);
 it('does not upscale a small PNG',async()=>{
  const png=new Uint8Array(await sharp({create:{width:300,height:200,channels:3,background:'#336699'}}).png().toBuffer());
  const result=await processImage(png,'post');
  expect([result.width,result.height]).toEqual([300,200]);
  const meta=await sharp(result.full).metadata();expect([meta.width,meta.height]).toEqual([300,200]);
 });
 it('keeps transparency',async()=>{
  const png=new Uint8Array(await sharp({create:{width:64,height:64,channels:4,background:{r:255,g:0,b:0,alpha:0.5}}}).png().toBuffer());
  expect((await sharp((await processImage(png,'post')).full).metadata()).hasAlpha).toBe(true);
 });
 it('makes avatars exactly 256x256',async()=>{
  const png=new Uint8Array(await noise(800,500).png().toBuffer());
  const result=await processImage(png,'avatar');
  expect([result.width,result.height]).toEqual([256,256]);
  const meta=await sharp(result.full).metadata();expect([meta.width,meta.height]).toEqual([256,256]);
  expect(result.full.byteLength).toBeLessThanOrEqual(POLICIES.avatar.maxBytes);
  const thumb=await sharp(result.thumb!).metadata();expect(Math.max(thumb.width!,thumb.height!)).toBeLessThanOrEqual(96);
 });
 it('gives snaps no thumbnail',async()=>{
  const png=new Uint8Array(await sharp({create:{width:100,height:100,channels:3,background:'#fff'}}).png().toBuffer());
  expect((await processImage(png,'snap')).thumb).toBeNull();
 });
 it('rejects images over the pixel limit',async()=>{
  // 20000x20000 (the brief's size) cannot even be generated here: Sharp's own default limit rejects it.
  const manyPixels=new Uint8Array(await sharp({create:{width:8000,height:6000,channels:3,background:'#000'}}).png({compressionLevel:9}).toBuffer());
  expect(await code(processImage(manyPixels,'post'))).toBe('too_many_pixels');
  const tooWide=new Uint8Array(await sharp({create:{width:10001,height:16,channels:3,background:'#000'}}).png().toBuffer());
  expect(await code(processImage(tooWide,'post'))).toBe('too_many_pixels');
 },60000);
 it('rejects a truncated JPEG as corrupt',async()=>{
  const jpeg=await noisyJpeg(1200,900);
  expect(await code(processImage(jpeg.slice(0,Math.floor(jpeg.length/2)),'post'))).toBe('corrupt');
 });
 it('rejects a PNG signature followed by junk as corrupt',async()=>{
  const bytes=new Uint8Array(64).fill(7);bytes.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  expect(await code(processImage(bytes,'post'))).toBe('corrupt');
 });
 it('rejects non-images as unsupported_type',async()=>{
  expect(await code(processImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'),'post'))).toBe('unsupported_type');
 });
 it('reduces an animated GIF to one frame',async()=>{
  const frames=Buffer.concat([0,1,2].map(i=>Buffer.alloc(40*40*3,i*100)));
  const gif=new Uint8Array(await sharp(frames,{raw:{width:40,height:40*3,channels:3,pageHeight:40}}).gif({delay:[100,100,100],loop:0}).toBuffer());
  expect((await sharp(gif,{animated:true}).metadata()).pages).toBe(3);
  const result=await processImage(gif,'post');
  const meta=await sharp(result.full,{animated:true}).metadata();
  expect(meta.format).toBe('webp');expect(meta.pages??1).toBe(1);expect([meta.width,meta.height]).toEqual([40,40]);
 });
 it('maps an undecodable HEIF to a friendly unsupported_type',async()=>{
  const bytes=new Uint8Array(64);bytes.set([0,0,0,24],0);bytes.set(new TextEncoder().encode('ftypheic'),4);
  try{await processImage(bytes,'post');expect.unreachable();}catch(error){
   expect(error).toBeInstanceOf(MediaError);expect((error as MediaError).code).toBe('unsupported_type');
   expect((error as MediaError).message).toContain('HEIC');
  }
 });
});

describe('Whetū acceptance cases (kiakura tests/tutorPhotoProcessing.test.ts, adapted)',()=>{
 const flat=async(width:number,height:number,quality=92)=>new Uint8Array(await sharp({create:{width,height,channels:3,background:{r:245,g:244,b:236}}}).jpeg({quality}).toBuffer());
 it('keeps a smooth page at the top quality step, at the full edge, inside the target',async()=>{
  const result=await processImage(await flat(2400,1600),'post');
  expect(result.quality).toBe(82);expect(result.edgePx).toBe(POLICIES.post.maxEdge);
  expect(result.full.byteLength).toBeLessThanOrEqual(POLICIES.post.targetBytes);
  expect(Math.max(result.width,result.height)).toBe(1600);
 });
 it('never enlarges a small JPEG and keeps its resolution',async()=>{
  const result=await processImage(await flat(900,600),'post');
  expect([result.width,result.height]).toEqual([900,600]);
 });
 it('holds a busy, noisy photo under the hard maximum without dropping below the floor edge',async()=>{
  const raw=Buffer.alloc(2000*1500*3);let seed=7;
  for(let i=0;i<raw.length;i++){seed=(seed*1103515245+12345)&0x7fffffff;raw[i]=seed&0xff;}
  const input=new Uint8Array(await sharp(raw,{raw:{width:2000,height:1500,channels:3}}).jpeg({quality:95}).toBuffer());
  const result=await processImage(input,'post');
  expect(result.full.byteLength).toBeLessThanOrEqual(POLICIES.post.maxBytes);
  const longest=Math.max(result.width,result.height);
  expect(longest).toBeGreaterThanOrEqual(POLICIES.post.floorEdge);expect(longest).toBeLessThanOrEqual(POLICIES.post.maxEdge);
 },60000);
 it('maps corrupt data to a fixed reason that never echoes the decoder message',async()=>{
  const corrupt=new Uint8Array([0xff,0xd8,0xff,0xe0,...new Uint8Array(200).fill(0x5a)]);
  try{await processImage(corrupt,'post');expect.unreachable();}catch(error){
   expect(error).toBeInstanceOf(MediaError);expect((error as MediaError).code).toBe('corrupt');
   expect((error as MediaError).message).toBe(MEDIA_MESSAGES.corrupt);
   expect((error as MediaError).message).not.toMatch(/vips|jpeg|sharp|huffman/i);
  }
 });
 it('refuses a tiny file that declares a huge canvas from its header alone',async()=>{
  // A real PNG container (signature, IHDR, one IDAT row, IEND, valid CRCs) that declares 20000x20000. Its pixels were never written.
  const chunk=(type:string,data:Uint8Array)=>{const out=new Uint8Array(12+data.length),view=new DataView(out.buffer);
   view.setUint32(0,data.length);out.set(new TextEncoder().encode(type),4);out.set(data,8);view.setUint32(8+data.length,crc32(out.subarray(4,8+data.length)));return out;};
  const ihdr=new Uint8Array(13);new DataView(ihdr.buffer).setUint32(0,20000);new DataView(ihdr.buffer).setUint32(4,20000);ihdr.set([8,2,0,0,0],8);
  const header=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(new Uint8Array(60001))),chunk('IEND',new Uint8Array(0))]);
  expect(header.length).toBeLessThan(1000);
  expect(await code(processImage(header,'post'))).toBe('too_many_pixels');
 });
 it('strips EXIF and GPS and rotates a small original that the browser would send unchanged',async()=>{
  for(const purpose of ['post','avatar'] as const){
   const input=await noisyJpeg(800,600,{IFD0:{Make:'TestCam'},IFD3:{GPSLatitudeRef:'S',GPSLatitude:'41/1 17/1 0/1'}});
   expect(input.byteLength).toBeLessThan(1024*1024);
   const meta=await sharp((await processImage(input,purpose)).full).metadata();
   expect(meta.format).toBe('webp');expect(meta.exif).toBeUndefined();expect(meta.orientation===undefined||meta.orientation===1).toBe(true);
   if(purpose==='post')expect([meta.width,meta.height]).toEqual([600,800]);else expect([meta.width,meta.height]).toEqual([256,256]);
  }
 });
 it('refuses an empty body and a photo smaller than 16 px as unreadable',async()=>{
  expect(await code(processImage(new Uint8Array(0),'post'))).toBe('corrupt');
  const tiny=new Uint8Array(await sharp({create:{width:8,height:8,channels:3,background:'#fff'}}).png().toBuffer());
  expect(await code(processImage(tiny,'post'))).toBe('corrupt');
  const edge=new Uint8Array(await sharp({create:{width:16,height:16,channels:3,background:'#fff'}}).png().toBuffer());
  expect((await processImage(edge,'post')).width).toBe(16);
 });
 it('drops the colour profile from the output',async()=>{
  const p3=new Uint8Array(await sharp({create:{width:64,height:64,channels:3,background:'#c03030'}}).withIccProfile('p3').jpeg().toBuffer());
  expect((await sharp(p3).metadata()).icc).toBeDefined();
  expect((await sharp((await processImage(p3,'post')).full).metadata()).icc).toBeUndefined();
 });
});
