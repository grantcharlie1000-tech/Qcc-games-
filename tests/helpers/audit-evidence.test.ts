import {beforeEach,describe,expect,it,vi} from 'vitest';
import {writeFile} from 'node:fs/promises';
import type {Page,TestInfo} from '@playwright/test';
import {captureAuditEvidence} from './audit-evidence';

vi.mock('node:fs/promises',()=>({writeFile:vi.fn()}));
beforeEach(()=>vi.clearAllMocks());

function harness(){
 const events:string[]=[],png=Buffer.from('synthetic screenshot bytes');
 const screenshot=vi.fn(async()=>{events.push('screenshot');return png;});
 const attach=vi.fn(async()=>{events.push('attach');});
 const page={viewportSize:()=>({width:390,height:844}),evaluate:vi.fn(async()=>{events.push('fonts');}),screenshot} as unknown as Page;
 const info={outputPath:(name:string)=>`/capture/${name}`,attach} as unknown as TestInfo;
 vi.mocked(writeFile).mockImplementation(async()=>{events.push('write');});
 return {events,png,screenshot,attach,page,info};
}

describe('audit evidence state guards',()=>{
 it('checks the successful state immediately before and after capture, then persists the image',async()=>{
  const h=harness(),assertState=vi.fn(async()=>{h.events.push('state');});
  await captureAuditEvidence(h.page,h.info,'Chat message',assertState);
  expect(h.events).toEqual(['fonts','state','screenshot','state','write','attach']);
  expect(assertState.mock.calls).toEqual([['before'],['after']]);
  expect(writeFile).toHaveBeenCalledWith('/capture/after-Chat-message-390x844.png',h.png);
  expect(h.screenshot).toHaveBeenCalledWith({fullPage:false,caret:'hide'});
 });

 it('does not capture a state that is already invalid',async()=>{
  const h=harness(),assertState=vi.fn(async()=>{throw new Error('Message missing');});
  await expect(captureAuditEvidence(h.page,h.info,'message',assertState)).rejects.toThrow('Message missing');
  expect(h.screenshot).not.toHaveBeenCalled();expect(writeFile).not.toHaveBeenCalled();expect(h.attach).not.toHaveBeenCalled();
 });

 it('does not publish an after-image when state changes during the screenshot',async()=>{
  const h=harness(),assertState=vi.fn<()=>Promise<void>>().mockResolvedValueOnce().mockRejectedValueOnce(new Error('Menu closed'));
  await expect(captureAuditEvidence(h.page,h.info,'menu',assertState)).rejects.toThrow('Menu closed');
  expect(h.screenshot).toHaveBeenCalledOnce();expect(writeFile).not.toHaveBeenCalled();expect(h.attach).not.toHaveBeenCalled();
 });

 it('keeps the existing filename and attachment for unguarded captures',async()=>{
  const h=harness();await captureAuditEvidence(h.page,h.info,'existing');
  expect(h.events).toEqual(['fonts','screenshot','write','attach']);
  expect(h.attach).toHaveBeenCalledWith('after-existing-390x844',{path:'/capture/after-existing-390x844.png',contentType:'image/png'});
 });
});
