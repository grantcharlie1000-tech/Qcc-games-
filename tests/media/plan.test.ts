import {describe,it,expect} from 'vitest';
import {screenOriginal,canSendAsIs,fitForPurpose,encodeAttempts,MAX_ORIGINAL_BYTES,KEEP_AS_IS_BYTES} from '../../src/media/plan';
// Adapted from the Whetū client's preparePhotoFile / shrinkForUpload rules (kiakura 9208032).
const file=(type:string,size:number,name='p')=>({type,size,name});
describe('screenOriginal',()=>{
 it('refuses an empty file before any decode',()=>{expect(screenOriginal(file('image/jpeg',0))).toBe('empty');});
 it('refuses an original over the decode cap',()=>{
  expect(screenOriginal(file('image/jpeg',MAX_ORIGINAL_BYTES+1))).toBe('too_big');
  expect(screenOriginal(file('image/jpeg',MAX_ORIGINAL_BYTES))).toBeNull();
 });
 it('refuses declared non-image types, accepts every image type QCC takes',()=>{
  expect(screenOriginal(file('application/pdf',100))).toBe('unsupported');
  expect(screenOriginal(file('image/svg+xml',100))).toBe('unsupported');
  for(const type of ['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','image/avif','IMAGE/JPEG'])expect(screenOriginal(file(type,100))).toBeNull();
 });
 it('trusts the extension only when the browser gives no type (HEIC from some browsers)',()=>{
  expect(screenOriginal(file('',100,'IMG_1.HEIC'))).toBeNull();
  expect(screenOriginal(file('',100,'notes.txt'))).toBe('unsupported');
 });
});
describe('canSendAsIs',()=>{
 it('keeps a small, compatible photo that already fits the edge',()=>{
  expect(canSendAsIs(file('image/jpeg',200_000),800,600,1600,false)).toBe(true);
  expect(canSendAsIs(file('image/png',KEEP_AS_IS_BYTES),1600,900,1600,false)).toBe(true);
 });
 it('re-encodes when the photo is too big in bytes or edge',()=>{
  expect(canSendAsIs(file('image/jpeg',KEEP_AS_IS_BYTES+1),800,600,1600,false)).toBe(false);
  expect(canSendAsIs(file('image/jpeg',200_000),1601,900,1600,false)).toBe(false);
 });
 it('never passes HEIC or AVIF through, because the server cannot rely on decoding them',()=>{
  expect(canSendAsIs(file('image/heic',100_000),800,600,1600,false)).toBe(false);
  expect(canSendAsIs(file('image/avif',100_000),800,600,1600,false)).toBe(false);
  expect(canSendAsIs(file('',100_000),800,600,1600,false)).toBe(false);
 });
 it('judges a square purpose by its short side',()=>{
  expect(canSendAsIs(file('image/png',90_000),2000,256,256,true)).toBe(true);
  expect(canSendAsIs(file('image/png',90_000),800,500,256,true)).toBe(false);
 });
});
describe('fitForPurpose',()=>{
 it('fits the longest edge for ordinary purposes',()=>{
  expect(fitForPurpose(4000,3000,1600,false)).toEqual({width:1600,height:1200});
  expect(fitForPurpose(800,600,1600,false)).toEqual({width:800,height:600});
 });
 it('keeps the short side at the square size so the server crop never upscales',()=>{
  expect(fitForPurpose(800,500,256,true)).toEqual({width:410,height:256});
  expect(fitForPurpose(500,800,256,true)).toEqual({width:256,height:410});
  expect(fitForPurpose(200,300,256,true)).toEqual({width:200,height:300});
 });
});
describe('encodeAttempts',()=>{
 it('keeps sources that may carry transparency as PNG, with a JPEG fallback drawn on white',()=>{
  for(const type of ['image/png','image/webp','image/gif'])expect(encodeAttempts(type)).toEqual([['image/png',undefined,false],['image/jpeg',0.85,true]]);
 });
 it('starts other sources at JPEG 0.9 and always draws on white, as Whetū does, so a transparent AVIF never turns black',()=>{
  for(const type of ['image/jpeg','image/heic','image/avif',''])expect(encodeAttempts(type)).toEqual([['image/jpeg',0.9,true],['image/jpeg',0.8,true],['image/jpeg',0.7,true]]);
 });
});
