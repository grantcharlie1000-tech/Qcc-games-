import {afterEach,describe,expect,it,vi} from 'vitest';
import {copySocialLink} from '../../src/social/components/copy-link';
import type {SocialContext} from '../../src/social/context';
afterEach(()=>vi.unstubAllGlobals());
describe('copy link feedback',()=>{
 it('invokes the clipboard immediately and announces success only after it resolves',async()=>{
  let resolve!:()=>void;const writeText=vi.fn(()=>new Promise<void>(r=>{resolve=r;})),notify=vi.fn(),announce=vi.fn();
  vi.stubGlobal('navigator',{clipboard:{writeText}});
  const task=copySocialLink({notify,announce} as unknown as SocialContext,'https://qcc.test/#/social');
  expect(writeText).toHaveBeenCalledWith('https://qcc.test/#/social');expect(notify).not.toHaveBeenCalled();
  resolve();await task;expect(notify).toHaveBeenCalledWith('Link copied',{icon:'check'});expect(announce).toHaveBeenCalledWith('Link copied');
 });
 it('shows a persistent manual-copy fallback when clipboard is unavailable',async()=>{
  vi.stubGlobal('navigator',{});const notify=vi.fn(),announce=vi.fn();
  await copySocialLink({notify,announce} as unknown as SocialContext,'https://qcc.test/#/social');
  expect(notify).toHaveBeenCalledWith(expect.stringContaining('https://qcc.test/#/social'),{role:'alert',sticky:true});expect(announce).not.toHaveBeenCalled();
 });
});
