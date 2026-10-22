// Companion mobs: the wolf (wild packs, taming with bones, sitting, following and teleporting to the owner, fighting at
// the owner's side, breeding tamed puppies) and the squid (swimming in water with tentacle pulses, ink when hurt).
// registerCompanionMobs(game) is called by engine/game.ts before any init(): it registers both kinds with game.entities
// and wires the owner-defence events (what hurts the player, what the player hits) on the game's event bus.
// Behaviour lives in entity/companions-wolf.ts and entity/companions-squid.ts, models and textures in
// entity/companions-art.ts.
import type {Game} from '../engine/contracts';
import {wireOwnerEvents,wolfKind} from './companions-wolf';
import {squidKind} from './companions-squid';

/** Kinds registered here (see the shared entity kinds in engine/contracts.ts). */
export const COMPANION_KINDS=['wolf','squid'] as const;

export function registerCompanionMobs(game:Game):void{
  game.entities.register(wolfKind(game));
  game.entities.register(squidKind(game));
  // Listeners live as long as the game's event bus (cleared by the engine on dispose).
  wireOwnerEvents(game);
}
