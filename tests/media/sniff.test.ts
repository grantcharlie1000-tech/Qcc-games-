import {describe,it,expect} from 'vitest';
import {sniffFormat} from '../../src/media/sniff';
const ascii=(text:string)=>new Uint8Array([...text].map(c=>c.charCodeAt(0)));
const pad=(bytes:number[],length=32)=>{const out=new Uint8Array(length);out.set(bytes);return out;};
const ftyp=(brand:string)=>{const out=new Uint8Array(32);out.set([0,0,0,24],0);out.set(ascii('ftyp'+brand),4);return out;};
describe('sniffFormat',()=>{
 it('recognises each accepted format by its magic bytes',()=>{
  expect(sniffFormat(pad([0xff,0xd8,0xff,0xe0]))).toBe('jpeg');
  expect(sniffFormat(pad([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))).toBe('png');
  expect(sniffFormat(ascii('GIF87a'+'x'.repeat(20)))).toBe('gif');
  expect(sniffFormat(ascii('GIF89a'+'x'.repeat(20)))).toBe('gif');
  const webp=new Uint8Array(32);webp.set(ascii('RIFF'),0);webp.set(ascii('WEBP'),8);expect(sniffFormat(webp)).toBe('webp');
  for(const brand of ['heic','heix','heim','heis','hevc','mif1','msf1'])expect(sniffFormat(ftyp(brand))).toBe('heif');
  for(const brand of ['avif','avis'])expect(sniffFormat(ftyp(brand))).toBe('avif');
 });
 it('rejects svg, zip, tiff, RIFF non-webp, unknown ftyp brands, empty and short input',()=>{
  expect(sniffFormat(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  expect(sniffFormat(ascii('PK\x03\x04'+'x'.repeat(20)))).toBeNull();
  expect(sniffFormat(pad([0x49,0x49,0x2a,0x00]))).toBeNull();
  const wav=new Uint8Array(32);wav.set(ascii('RIFF'),0);wav.set(ascii('WAVE'),8);expect(sniffFormat(wav)).toBeNull();
  expect(sniffFormat(ftyp('mp42'))).toBeNull();
  expect(sniffFormat(new Uint8Array(0))).toBeNull();
  expect(sniffFormat(new Uint8Array([0xff,0xd8]))).toBeNull();
 });
 it('still calls a PNG signature with junk after it a png (decode rejects it later)',()=>{
  const bytes=new Uint8Array(64).fill(7);bytes.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  expect(sniffFormat(bytes)).toBe('png');
 });
});
