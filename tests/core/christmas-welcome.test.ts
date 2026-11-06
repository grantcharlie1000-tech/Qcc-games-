import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {ChristmasWelcomeState} from '../../src/festive/welcome-state';
let local:Map<string,string>,session:Map<string,string>;
beforeEach(()=>{
  local=new Map();session=new Map();
  for(const [name,values] of [['localStorage',local],['sessionStorage',session]] as const)vi.stubGlobal(name,{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
});
afterEach(()=>vi.unstubAllGlobals());

test('a guest is never prompted, but an account gets one welcome per release on this browser',()=>{
  const state=new ChristmasWelcomeState();
  expect(state.shouldShow(undefined)).toBe(false);expect(state.shouldShow('PlayerOne')).toBe(true);
  state.markSeen('PlayerOne');
  expect(state.shouldShow('playerone')).toBe(false);
  expect(new ChristmasWelcomeState().shouldShow('PLAYERONE')).toBe(false);
  expect(state.shouldShow('PlayerTwo')).toBe(true);
  expect([...local.keys()].some(key=>key.startsWith('pocket-arcade:'))).toBe(false);
});
test('blocked local storage falls back to session storage across a reload',()=>{
  vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}});
  const state=new ChristmasWelcomeState();expect(state.shouldShow('PlayerOne')).toBe(true);state.markSeen('PlayerOne');
  expect(new ChristmasWelcomeState().shouldShow('PlayerOne')).toBe(false);
});
test('blocked storage still suppresses repeats during the visit',()=>{
  for(const name of ['localStorage','sessionStorage'])vi.stubGlobal(name,{getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('full');}});
  const state=new ChristmasWelcomeState();state.markSeen('PlayerOne');
  expect(state.shouldShow('PlayerOne')).toBe(false);expect(state.shouldShow('PlayerTwo')).toBe(true);
});
