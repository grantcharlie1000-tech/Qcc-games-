// @ts-nocheck -- tests the imported JS facade without broadening repo TS options.
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import Input from '../../../src/games/shooter/core/input.js';
import {EventBus} from '../../../src/games/shooter/shared/events.js';

let doc,canvas,game,input,rejectRequest,resolveRequest;
beforeEach(()=>{
  doc=new EventTarget();doc.pointerLockElement=null;
  doc.exitPointerLock=vi.fn(()=>{doc.pointerLockElement=null;doc.dispatchEvent(new Event('pointerlockchange'));});
  vi.stubGlobal('document',doc);vi.stubGlobal('window',new EventTarget());
  canvas={isConnected:true,requestPointerLock:vi.fn(()=>new Promise((resolve,reject)=>{resolveRequest=resolve;rejectRequest=reject;}))};
  game={canvas,events:new EventBus(),paused:false,disposed:false,
    listen:(target,type,cb,options)=>target?.addEventListener(type,cb,options)};
  input=new Input(game);
});
afterEach(()=>vi.unstubAllGlobals());

it.each(['paused','disposed'])('does not retry a rejected pointer request after the game is %s',async state=>{
  input.requestLock();game[state]=true;rejectRequest(new Error('raw input unsupported'));
  await Promise.resolve();await Promise.resolve();
  expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1);
  expect(input.locked).toBe(false);
});
it.each(['paused','disposed'])('releases a pending pointer lock that succeeds after the game is %s',async state=>{
  input.requestLock();game[state]=true;doc.pointerLockElement=canvas;
  resolveRequest();await Promise.resolve();await Promise.resolve();
  expect(doc.pointerLockElement).toBe(null);expect(input.locked).toBe(false);
});
it('releases late lock events from older void-returning browsers',()=>{
  canvas.requestPointerLock=vi.fn(()=>undefined);
  input.requestLock();game.paused=true;doc.pointerLockElement=canvas;
  doc.dispatchEvent(new Event('pointerlockchange'));
  expect(doc.pointerLockElement).toBe(null);expect(input.locked).toBe(false);
});
it('retries without raw input while the same game is still active',async()=>{
  input.requestLock();rejectRequest(new Error('raw input unsupported'));
  await Promise.resolve();await Promise.resolve();
  expect(canvas.requestPointerLock).toHaveBeenCalledTimes(2);
  doc.pointerLockElement=canvas;resolveRequest();doc.dispatchEvent(new Event('pointerlockchange'));
  expect(input.locked).toBe(true);
});
