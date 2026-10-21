// Hostile mobs: zombie, husk, drowned (entity/hostile-zombies.ts), skeleton, stray (entity/hostile-skeletons.ts),
// creeper (entity/hostile-creeper.ts) and spider (entity/hostile-spider.ts), plus the projectile kinds arrow, snowball,
// egg and ender pearl (entity/projectiles.ts). Shared targeting, melee and shields are in entity/hostile-ai.ts; models
// and textures in entity/hostile-models.ts. Every hostile mob despawns away from the player, spawns in the dark (no
// natural spawns in peaceful, where existing ones are removed) and hurts the player through game.survival.damage with
// its base (normal difficulty) damage, which survival scales by difficulty.
import type {EntityKind,Game} from '../engine/contracts';
import {creeperKind} from './hostile-creeper';
import {skeletonKinds} from './hostile-skeletons';
import {spiderKind} from './hostile-spider';
import {zombieKinds} from './hostile-zombies';
import {registerProjectiles} from './projectiles';

export const HOSTILE_MOBS=['zombie','husk','drowned','skeleton','stray','creeper','spider'] as const;
export type HostileMob=typeof HOSTILE_MOBS[number];

/** Every hostile mob kind (fresh objects: models are built per call). */
export function hostileKinds():EntityKind[]{return[...zombieKinds(),...skeletonKinds(),creeperKind(),spiderKind()];}

export function registerHostileMobs(game:Game):void{
  for(const kind of hostileKinds())game.entities.register(kind);
  registerProjectiles(game);
}
