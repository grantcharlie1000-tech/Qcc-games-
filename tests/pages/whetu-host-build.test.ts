import {afterEach,describe,expect,it} from 'vitest';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareWhetuHost} from '../../scripts/prepare-whetu-host.mjs';

const directories:string[]=[];
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'qcc-study-build-'));directories.push(dir);
 for(const file of ['_headers','_routes.json'])writeFileSync(join(dir,file),readFileSync('public/'+file));
 return dir;
}
afterEach(()=>{for(const dir of directories.splice(0))rmSync(dir,{recursive:true,force:true});});
describe('dedicated Study build preparation',()=>{
 it('does not change default-off output headers or function routes at all',()=>{
  const dir=fixture();prepareWhetuHost(dir,undefined);
  for(const file of ['_headers','_routes.json'])expect(readFileSync(join(dir,file),'utf8')).toBe(readFileSync('public/'+file,'utf8'));
 });
 it('adds only same-origin framing in the explicit integrated parent build, preserving other security directives',()=>{
  const dir=fixture();prepareWhetuHost(dir,'on');const headers=readFileSync(join(dir,'_headers'),'utf8');
  expect(headers).toContain("frame-src 'self' https://framextv.xyz https://framextv.cc https://archive.org");
  expect(headers).toContain("frame-ancestors 'none'");expect(headers).toContain("script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'");
  expect(headers).not.toMatch(/frame-src[^;]*https:\/\/whetu\.app/);
  expect(readFileSync('public/_headers','utf8')).not.toContain("frame-src 'self'");
 });
 it('invokes Pages Functions for the approved private runtime paths without stealing QCC assets or PWA manifest',()=>{
  const dir=fixture();prepareWhetuHost(dir,'on');const routes=JSON.parse(readFileSync(join(dir,'_routes.json'),'utf8'));
  for(const route of ['/api/*','/.netlify/functions/*','/nceastudy','/nceastudy/google','/nceastudy/billing','/nceastudy/billing/return','/questions','/questions/*','/_next/*','/_content/*','/images/*'])expect(routes.include).toContain(route);
  for(const route of ['/*','/assets/*','/study/*','/game-art/*','/manifest.webmanifest','/robots.txt','/icon.svg','/nceastudy/billing/*'])expect(routes.include).not.toContain(route);
  expect(routes.include.length).toBeLessThanOrEqual(100);expect(new Set(routes.include).size).toBe(routes.include.length);
 });
 it('is idempotent and fails closed if the expected security directive is absent',()=>{
  const dir=fixture();prepareWhetuHost(dir,'on');const once=readFileSync(join(dir,'_headers'),'utf8');prepareWhetuHost(dir,'on');expect(readFileSync(join(dir,'_headers'),'utf8')).toBe(once);
  writeFileSync(join(dir,'_headers'),"/*\n  Content-Security-Policy: default-src 'self'\n");expect(()=>prepareWhetuHost(dir,'on')).toThrow('frame-src');
 });
});
