import {expect, test, vi} from 'vitest';
import {capabilityProblem, inspectWorldZip, nativeExitProblem, nativeSaveProblem, observeRuntimeErrors, parseParentCommand, readWorldMetadata, startNativeOperation} from '../../../public/voxelibre/launcher-helpers.js';

const supported = {secure:true, isolated:true, sharedMemory:true, offscreenCanvas:true, jspi:true, webgl2:true};

test('unsupported graphics or isolation prevents the expensive runtime launch', () => {
  expect(capabilityProblem(supported)).toBeNull();
  expect(capabilityProblem({...supported, isolated:false})).toMatch(/isolation/i);
  expect(capabilityProblem({...supported, webgl2:false})).toMatch(/graphics/i);
  expect(capabilityProblem({...supported, jspi:false})).toMatch(/browser/i);
});

test('bridge only accepts commands from the exact parent and origin', () => {
  const parent = {};
  const command = {type:'QCC_VOXELIBRE_COMMAND', command:'quit', requestId:'leave-1'};
  expect(parseParentCommand({source:parent, origin:'https://qcc.test', data:command}, 'https://qcc.test', parent)).toEqual(command);
  expect(parseParentCommand({source:{}, origin:'https://qcc.test', data:command}, 'https://qcc.test', parent)).toBeNull();
  expect(parseParentCommand({source:parent, origin:'https://other.test', data:command}, 'https://qcc.test', parent)).toBeNull();
  expect(parseParentCommand({source:parent, origin:'https://qcc.test', data:{...command, requestId:42}}, 'https://qcc.test', parent)).toBeNull();
  expect(parseParentCommand({source:parent, origin:'https://qcc.test', data:{type:command.type, command:'delete'}}, 'https://qcc.test', parent)).toBeNull();
  expect(parseParentCommand({source:parent, origin:'https://qcc.test', data:{type:command.type, command:'settings', settings:{sound:'false', reducedMotion:false}}}, 'https://qcc.test', parent)).toBeNull();
});

test('captures a failed native engine script and reports a useful retry without treating images as engine failures', () => {
  const surface = new EventTarget();
  const subscribe = vi.spyOn(surface, 'addEventListener');
  const report = vi.fn();
  const stop = observeRuntimeErrors(surface, 'https://qcc.test/voxelibre/runtime/', report);
  expect(subscribe).toHaveBeenCalledWith('error', expect.any(Function), true);
  function failure(tagName:string, src:string) {
    const event = new Event('error', {bubbles:false});
    Object.defineProperty(event, 'target', {value:{tagName,src}});
    surface.dispatchEvent(event);
  }
  failure('IMG', 'https://qcc.test/voxelibre/runtime/missing.png');
  failure('SCRIPT', 'https://elsewhere.test/voxelibre/runtime/luanti.js');
  failure('SCRIPT', 'https://qcc.test/unrelated.js');
  expect(report).not.toHaveBeenCalled();
  failure('SCRIPT', 'https://qcc.test/voxelibre/runtime/luanti.js');
  expect(report).toHaveBeenCalledOnce();
  expect(report.mock.calls[0][0].message).toMatch(/engine.*downloaded.*connection.*again/i);
  stop();
  failure('SCRIPT', 'https://qcc.test/voxelibre/runtime/luanti.js');
  expect(report).toHaveBeenCalledOnce();
});

test.each([
  'ERROR[Server]: ServerMap: Failed to save map to /luanti/worlds/test, exception: database or disk is full',
  'WARNING[Main]: Map saving will be disabled.',
  'ERROR[Server]: Failed to save player singleplayer exception: Failed to commit SQLite3 transaction',
  "Some exception: Couldn't save env meta",
  'ServerEnvironment::saveMeta(): Failed to write /luanti/worlds/test/env_meta.txt',
  "ERROR[Server]: ModStorageDatabaseFiles: Unable to save. '/world/mod_storage' cannot be created.",
  'ERROR[Server]: ModStorageDatabaseFiles[mcl_maps]: failed to write file.',
  'DatabaseException: Failed to commit SQLite3 transaction: disk I/O error',
  'DatabaseException: Failed to save block: database or disk is full',
  'ERROR[Main]: Failed to close database: unable to close due to unfinalized statements',
])('a native storage error remains an uncertain save even when process exit status is zero: %s', output => {
  const failure = nativeSaveProblem(output);
  expect(failure).not.toBeNull();
  expect(nativeExitProblem(0, failure)).toMatch(/save could not be confirmed/i);
});

test('normal native output does not create a storage failure, while a nonzero exit is still reported', () => {
  expect(nativeSaveProblem('ServerMap: Saved map to /luanti/worlds/test')).toBeNull();
  expect(nativeSaveProblem('SQLite3 database has been locked for 100 ms.')).toBeNull();
  expect(nativeSaveProblem('WARNING[Main]: Texture not found')).toBeNull();
  expect(nativeExitProblem(0, null)).toBeNull();
  expect(nativeExitProblem(1, null)).toMatch(/code 1.*save could not be confirmed/i);
});

test('an engine failure rejects an unfinished native backup instead of waiting forever for its callback', async () => {
  const task = startNativeOperation(() => new Promise<string>(() => {}));
  const closing = task.promise;
  task.fail(new Error('Engine stopped during ZIP export'));
  await expect(closing).rejects.toThrow(/ZIP export/);
  const completed = startNativeOperation(async () => 'world.zip');
  await expect(completed.promise).resolves.toBe('world.zip');
});

// A small stored ZIP fixture keeps these checks independent of a ZIP library.
function zip(entries: Array<{path:string, text:string, localPath?:string}>) {
  const encoder = new TextEncoder();
  const locals:Uint8Array[] = [], directories:Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name=encoder.encode(entry.path), localName=encoder.encode(entry.localPath??entry.path), content=encoder.encode(entry.text);
    const local=new Uint8Array(30+localName.length+content.length), l=new DataView(local.buffer);
    l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);
    l.setUint32(18,content.length,true);l.setUint32(22,content.length,true);l.setUint16(26,localName.length,true);
    local.set(localName,30);local.set(content,30+localName.length);
    const central=new Uint8Array(46+name.length), c=new DataView(central.buffer);
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);
    c.setUint32(20,content.length,true);c.setUint32(24,content.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);
    central.set(name,46);locals.push(local);directories.push(central);offset+=local.length;
  }
  const centralSize=directories.reduce((sum,item)=>sum+item.length,0);
  const result=new Uint8Array(offset+centralSize+22);let cursor=0;
  for(const piece of [...locals,...directories]){result.set(piece,cursor);cursor+=piece.length;}
  const end=new DataView(result.buffer,cursor);end.setUint32(0,0x06054b50,true);
  end.setUint16(8,entries.length,true);end.setUint16(10,entries.length,true);end.setUint32(12,centralSize,true);end.setUint32(16,offset,true);
  return result.buffer;
}

test('world ZIP import identifies one nested world and reads its actual game metadata', async () => {
  const bytes=zip([{path:'My world/world.mt',text:'gameid = mineclone2\nworld_name = Aotearoa\n'}, {path:'My world/map.sqlite',text:'test map'}]);
  const info=inspectWorldZip(bytes);
  expect(info.prefix).toBe('My world/');
  expect(info.count).toBe(2);
  expect(await readWorldMetadata(bytes,info)).toEqual({gameid:'mineclone2',name:'Aotearoa'});
});

test('world import accepts the zero block padding written by native world export', async () => {
  const archive=zip([{path:'My world/world.mt',text:'gameid = mineclone2\nworld_name = Aotearoa\n'}, {path:'My world/map.sqlite',text:'test map'}]);
  // libarchive's in-memory writer pads its last output block to 10 KiB.
  const padded=new Uint8Array(Math.ceil(archive.byteLength/10240)*10240);
  padded.set(new Uint8Array(archive));
  const info=inspectWorldZip(padded);
  expect(info.prefix).toBe('My world/');
  expect(info.count).toBe(2);
  expect(await readWorldMetadata(padded,info)).toEqual({gameid:'mineclone2',name:'Aotearoa'});
});

test('world import rejects nonzero trailing data instead of treating it as native padding', () => {
  const archive=zip([{path:'world.mt',text:'gameid = mineclone2'}]);
  const extra=new Uint8Array(archive.byteLength+64);
  extra.set(new Uint8Array(archive));
  extra[archive.byteLength+12]=42;
  expect(()=>inspectWorldZip(extra)).toThrow(/complete world ZIP/i);
});

test('world import rejects padding larger than one native output block', () => {
  const archive=zip([{path:'world.mt',text:'gameid = mineclone2'}]);
  const excessive=new Uint8Array(archive.byteLength+10241);
  excessive.set(new Uint8Array(archive));
  expect(()=>inspectWorldZip(excessive)).toThrow(/complete world ZIP/i);
});

test('world import refuses traversal, multiple worlds and excessive expanded data', () => {
  expect(()=>inspectWorldZip(zip([{path:'../world.mt',text:'gameid = mineclone2'}]))).toThrow(/unsafe/i);
  expect(()=>inspectWorldZip(zip([{path:'a/world.mt',text:''},{path:'b/world.mt',text:''}]))).toThrow(/one world/i);
  expect(()=>inspectWorldZip(zip([{path:'world.mt',text:'long metadata'}]),{maxExpanded:4})).toThrow(/large/i);
  expect(()=>inspectWorldZip(new Uint8Array([1,2,3]).buffer)).toThrow(/ZIP/i);
});

test('world import rejects another game before giving the archive to the native installer', async () => {
  const bytes=zip([{path:'world.mt',text:'gameid = another_game'}]);
  await expect(readWorldMetadata(bytes,inspectWorldZip(bytes))).rejects.toThrow(/VoxeLibre/i);
});

test('world import rejects ambiguous or inconsistent file paths before writing a copy', () => {
  const marker={path:'world.mt',text:'gameid = mineclone2'};
  expect(()=>inspectWorldZip(zip([marker,{path:'map.sqlite',text:'first'},{path:'./map.sqlite',text:'second'}]))).toThrow(/duplicate/i);
  expect(()=>inspectWorldZip(zip([{...marker,localPath:'other.mt'}]))).toThrow(/inconsistent/i);
  expect(()=>inspectWorldZip(zip([marker,{path:'bad\nname',text:''}]))).toThrow(/unsafe/i);
});
