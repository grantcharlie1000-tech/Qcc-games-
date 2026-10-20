import {expect,test,vi} from 'vitest';
import {reloadAfterActivation} from '../../src/core/update';
test('serialization or durable save refusal leaves the document intact before activation',async()=>{
 const reload=vi.fn(),activate=vi.fn(async()=>{});
 expect(await reloadAfterActivation(()=>{throw new Error('serialization failed');},activate,reload)).toBe('save-failed');
 expect(await reloadAfterActivation(()=>false,activate,reload)).toBe('save-failed');expect(activate).not.toHaveBeenCalled();expect(reload).not.toHaveBeenCalled();
});
test('activation failure does not reload and a later successful request saves twice',async()=>{
 const reload=vi.fn(),save=vi.fn(()=>true);
 expect(await reloadAfterActivation(save,async()=>{throw new Error('blocked activation');},reload)).toBe('activation-failed');expect(reload).not.toHaveBeenCalled();
 save.mockClear();expect(await reloadAfterActivation(save,async()=>{},reload)).toBe('reloaded');expect(save).toHaveBeenCalledTimes(2);expect(reload).toHaveBeenCalledOnce();
});
test('a preference write becoming memory-only during delayed activation blocks the actual reload',async()=>{
 const map=new Map<string,string>();let quota=false;
 vi.stubGlobal('localStorage',{getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{if(quota)throw new DOMException('full','QuotaExceededError');map.set(key,value);},removeItem:(key:string)=>map.delete(key)});
 const store=await import('../../src/core/storage');store.write('settings',{sound:false});const reload=vi.fn();
 const save=()=>{const game=store.saveGame('fruit-merge',{fruit:3});return store.flushPending()&&game;};
 expect(await reloadAfterActivation(save,async()=>{quota=true;expect(store.write('settings',{sound:true})).toBe(false);},reload)).toBe('save-failed');
 expect(reload).not.toHaveBeenCalled();expect(JSON.parse(map.get('pocket-arcade:v1:settings')!)).toEqual({sound:false});
 quota=false;expect(await reloadAfterActivation(save,async()=>{},reload)).toBe('reloaded');expect(JSON.parse(map.get('pocket-arcade:v1:settings')!)).toEqual({sound:true});
 vi.unstubAllGlobals();
});

test('resuming or navigating during delayed activation cancels the pending reload without another pause/save',async()=>{
 const save=vi.fn(()=>true),reload=vi.fn();let requestCurrent=true;
 expect(await reloadAfterActivation(save,async()=>{requestCurrent=false;},reload,()=>requestCurrent)).toBe('cancelled');expect(save).toHaveBeenCalledOnce();expect(reload).not.toHaveBeenCalled();
});
