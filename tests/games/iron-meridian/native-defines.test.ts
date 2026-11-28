import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { OrderedDefines, LuaConfigurationError } from '../../../src/games/iron-meridian/native/defines';

const wasmBinary = new Uint8Array(readFileSync(new URL('../../../src/games/iron-meridian/native/lua51/runtime.wasm', import.meta.url)));
const contexts: OrderedDefines[] = [];
const load = async (sources: (string | Uint8Array)[]) => {
  const context = await OrderedDefines.load(sources.map((source, index) => ({ source, path: `chunk-${index}.lua` })), { wasmBinary });
  contexts.push(context);
  return context;
};
afterEach(() => { for (const context of contexts.splice(0)) context.close(); });

describe('identified Lua 5.1.1 configuration dependency compiled to WASM', () => {
  it('executes expressions and mutations in supplied chunk order in one state', async () => {
    const context = await load([
      'NDefines = { NTechnology = { MIN_RESEARCH_SPEED = 0.1 } }; function twice(v) return v * 2 end',
      'for i=1,3 do NDefines.NTechnology.MIN_RESEARCH_SPEED = twice(NDefines.NTechnology.MIN_RESEARCH_SPEED) end',
      'NDefines.NTechnology.MIN_RESEARCH_SPEED = NDefines.NTechnology.MIN_RESEARCH_SPEED + 0.05',
    ]);
    expect(context.get('NDefines', 'NTechnology', 'MIN_RESEARCH_SPEED')).toEqual({ type: 'number', value: 0.8500000000000001 });
  });

  it('opens the observed library set and leaves io and os uninitialized', async () => {
    const context = await load(['result = coroutine.wrap(function() coroutine.yield(17) end)()']);
    expect(context.get('_VERSION')).toEqual({ type: 'string', value: new TextEncoder().encode('Lua 5.1') });
    for (const name of ['package', 'table', 'string', 'math', 'debug', 'coroutine']) expect(context.get(name).type).toBe('table');
    expect(context.get('io')).toEqual({ type: 'nil' });
    expect(context.get('os')).toEqual({ type: 'nil' });
    expect(context.get('result')).toEqual({ type: 'number', value: 17 });
  });

  it('aborts the ordered load on syntax or runtime failure', async () => {
    await expect(load(['NDefines={}', 'this is invalid Lua', 'NDefines.reached=true'])).rejects.toMatchObject({ phase: 'execute', path: 'chunk-1.lua', status: 3 });
    await expect(load(['NDefines={}', 'error("stop")', 'NDefines.reached=true'])).rejects.toBeInstanceOf(LuaConfigurationError);
    const fresh = await load(['NDefines={}']);
    expect(fresh.get('NDefines', 'reached')).toEqual({ type: 'nil' });
  });

  it('preserves typed values, string null bytes and protected field access', async () => {
    const context = await load(['NDefines={s="17", n=17, b=false, text="A\\000B", proxy=setmetatable({}, {__index=function(_,k) if k=="good" then return 41 end error("bad key") end})}']);
    expect(context.get('NDefines', 's')).toEqual({ type: 'string', value: new TextEncoder().encode('17') });
    expect(context.get('NDefines', 'n')).toEqual({ type: 'number', value: 17 });
    expect(context.get('NDefines', 'b')).toEqual({ type: 'boolean', value: false });
    expect(context.get('NDefines', 'text')).toEqual({ type: 'string', value: new Uint8Array([65, 0, 66]) });
    expect(context.get('NDefines', 'proxy', 'good')).toEqual({ type: 'number', value: 41 });
    expect(() => context.get('NDefines', 'proxy', 'bad')).toThrow(LuaConfigurationError);
    expect(context.get('NDefines', 'n')).toEqual({ type: 'number', value: 17 });
    context.close();
    context.close();
    expect(() => context.get('NDefines')).toThrow('closed');
  });

  it('preserves distinct non-UTF8 Lua strings and original chunk bytes', async () => {
    const context = await load([new Uint8Array([...new TextEncoder().encode('a="'), 255, ...new TextEncoder().encode('"; b="'), 254, 34])]);
    const first = context.get('a');
    expect(first).toEqual({ type: 'string', value: new Uint8Array([255]) });
    expect(context.get('b')).toEqual({ type: 'string', value: new Uint8Array([254]) });
    context.close();
    expect(first).toEqual({ type: 'string', value: new Uint8Array([255]) });
  });

  it('reports a C return-hook error after field access and remains usable', async () => {
    const context = await load([`NDefines={n=19, proxy=setmetatable({}, {__index=function()
      debug.sethook(function()
        local info=debug.getinfo(2,"Sf")
        if info.what=="C" and info.func~=debug.sethook then
          debug.sethook(); error("late return hook")
        end
      end,"r")
      return "copied before the hook"
    end})}`]);
    expect(() => context.get('NDefines', 'proxy', 'x')).toThrow('late return hook');
    expect(context.get('NDefines', 'n')).toEqual({ type: 'number', value: 19 });
  });

  const basePath = 'C:/Program Files (x86)/Steam/steamapps/common/Hearts of Iron IV/common/defines/';
  it.runIf(existsSync(basePath + '00_defines.lua'))('executes the three supplied installed base chunks without claiming effective overlay order', async () => {
    const bytes = readFileSync(basePath + '00_defines.lua');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('727ac0522ac7e55313dd249c819f273a248c4a438c5e4ce21c867923f9dd0767');
    const context = await OrderedDefines.load(['00_defines.lua', '00_graphics.lua', '01_career_profile.lua'].map(path => ({ path, source: new Uint8Array(readFileSync(basePath + path)) })), { wasmBinary });
    contexts.push(context);
    expect(context.get('NDefines', 'NTechnology', 'MIN_RESEARCH_SPEED')).toEqual({ type: 'number', value: 0.1 });
    expect(context.get('NDefines_Graphics').type).toBe('table');
    expect(context.get('NDefines', 'NCareerProfile').type).toBe('table');
    expect(context.get('NDefines', 'NCareerProfile', 'PARADROP_AWARD_DIVISION_MIN_BATTALION_COUNT')).toEqual({ type: 'number', value: 5 });
  });
});
