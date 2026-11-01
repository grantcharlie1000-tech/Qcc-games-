// @ts-nocheck -- tests the imported JS facade without broadening repo TS options.
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import Input from '../../../src/games/strongroom/engine/core/input.js';
import {EventBus} from '../../../src/games/strongroom/engine/shared/events.js';
import Settings from '../../../src/games/strongroom/engine/core/settings.js';

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
it('a glass control click never captures the mouse or fires through the control',()=>{
 game.debug=true;input._onMouseDown({button:0,target:{closest:()=>({tagName:'BUTTON'})}});
 expect(input.locked).toBe(false);expect(input.firing).toBe(false);
});
it.each(['paused','text field'])('typing P in %s never opens a gameplay menu',state=>{
 let actions=0;game.events.on('input:keydown',()=>actions++);game.paused=state==='paused';
 input._onKeyDown({key:'p',target:state==='text field'?{closest:()=>({tagName:'INPUT'})}:null});
 expect(actions).toBe(0);expect(input.isDown('p')).toBe(false);
});
it('mouse actions follow swaps and a mouse button can restore a captured binding',()=>{
 game.settings=new Settings(game,null);game.settings.rebind('fire','w');input.locked=true;
 input._onMouseDown({button:0,target:canvas});expect(input.isActionDown('moveForward')).toBe(true);expect(input.firing).toBe(false);
 input._onMouseUp({button:0});expect(input.isActionDown('moveForward')).toBe(false);
 input._onKeyDown({key:'w'});expect(input.isActionDown('fire')).toBe(true);input._onKeyUp({key:'w'});
 input.locked=false;const capture=vi.fn();input.captureNextKey(capture);input._onMouseDown({button:2,target:canvas});expect(capture).toHaveBeenCalledWith('mouse2',{cancelled:false});expect(input.locked).toBe(false);
});
