import {expect, test, vi} from 'vitest';
import type {GameInstance} from '../../src/core/types';
import {disposeGame} from '../../src/core/lifecycle';

function game(beforeLeave?:()=>Promise<void>):GameInstance {
  return {pause:vi.fn(),resume:vi.fn(),restart:vi.fn(),serialize:()=>null,restore:vi.fn(),dispose:vi.fn(),beforeLeave};
}

test('navigation keeps a saving game alive until its shutdown acknowledges completion',async()=>{
  let finish!:()=>void;
  const pending=new Promise<void>(resolve=>{finish=resolve;});
  const instance=game(vi.fn(()=>pending));
  const leaving=disposeGame(instance);
  expect(instance.dispose).not.toHaveBeenCalled();
  finish();await leaving;
  expect(instance.dispose).toHaveBeenCalledOnce();
});

test('overlapping navigation shares the same shutdown and never disposes twice',async()=>{
  let finish!:()=>void;
  const instance=game(vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;})));
  const first=disposeGame(instance),second=disposeGame(instance);
  expect(instance.beforeLeave).toHaveBeenCalledOnce();
  finish();await Promise.all([first,second]);await disposeGame(instance);
  expect(instance.dispose).toHaveBeenCalledOnce();
});

test('a failed shutdown preserves the game and permits an explicit retry',async()=>{
  const instance=game(vi.fn().mockRejectedValueOnce(new Error('World storage is unavailable')).mockResolvedValueOnce(undefined));
  await expect(disposeGame(instance)).rejects.toThrow('World storage is unavailable');
  expect(instance.dispose).not.toHaveBeenCalled();
  await disposeGame(instance);
  expect(instance.beforeLeave).toHaveBeenCalledTimes(2);
  expect(instance.dispose).toHaveBeenCalledOnce();
});

test('existing synchronous games dispose without needing a shutdown hook',async()=>{
  const instance=game();await disposeGame(instance);
  expect(instance.dispose).toHaveBeenCalledOnce();
});
