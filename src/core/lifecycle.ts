import type {GameInstance} from './types';

// Multiple hash changes can request the same departure while a world is saving.
// Keep one shutdown promise, and do not remove its DOM until it succeeds.
const departures=new WeakMap<GameInstance,Promise<void>>();
export function disposeGame(game:GameInstance):Promise<void> {
  const existing=departures.get(game);
  if(existing)return existing;
  const departing=(async()=>{
    await game.beforeLeave?.();
    game.dispose();
  })();
  departures.set(game,departing);
  void departing.catch(()=>{if(departures.get(game)===departing)departures.delete(game);});
  return departing;
}
