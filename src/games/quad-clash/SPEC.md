# Quad Clash

An original first-person arena shooter set on the QCC campus. It is in the same genre as browser arena shooters such as Shell Shockers: fast cartoon combat against bots, a class-based weapon choice, a sidearm, grenades, respawns and streak rewards. It copies no game's characters, maps, art, names or sounds. The fighters are Q-bots: rounded robots wearing the QCC crest. The arenas are school grounds, and every weapon is named after school life.

## Modes (five-minute cap)

| Mode | Teams | Win condition |
| --- | --- | --- |
| Lunchtime Brawl | Free-for-all, you + 7 bots | First to 25 eliminations |
| House Match | Kōwhai (gold ▲) v Moana (blue ●), 4 v 4 | First house to 40 eliminations |
| Hold the Quad | Kōwhai v Moana | The house with more living members inside the zone scores 1 point per second; equal numbers contest it. The zone moves every 60 s. First to 60. |

At the time limit the leader wins; equal scores are a draw. Team colours also carry shapes (▲ / ●) and teammates wear a marker, so colour is never the only cue.

## Arenas

- **The Quad**: courtyard ringed by brick classroom blocks. A raised assembly stage with steps on four sides sits in the middle. The library balcony is 3 m up a staircase, and there are a locker hall, a bike shed, cafeteria tables, planters and low walls. Zones: the stage, the balcony, the bike shed and the locker hall.
- **Sports Field**: a pitch with a four-row grandstand and a pavilion with a 3.5 m roof deck. There are goalposts, kit-bag cover and two scoreboard towers climbed by jumping up crates. Zones: the centre circle, the pavilion roof and the grandstand.

Every collider is an axis-aligned box, and the renderer draws the same boxes.

## Weapons

| Weapon | Role | Notes |
| --- | --- | --- |
| Bell Ringer | Assault rifle | 22 dmg, full auto, 30 rounds |
| Detention | Shotgun | 10 × 12 dmg pellets, steep falloff |
| Hall Pass | Marksman | 42 dmg, ×2 head, semi-auto, 2× zoom |
| Fire Drill | Launcher | Rocket, 120 splash in 4.2 m, knockback (rocket jumps work) |
| Recess | SMG | 15 dmg, fastest fire and feet |
| Valedictorian | Sniper | 92 dmg, ×2.4 head, 4× scope with a full-screen reticle |
| Triple Period | Burst rifle | 3-round bursts |
| Pencil Pusher | Sidearm (everyone) | Never runs out of reserve |

Science Fair flask grenades: up to 3 carried, 2.1 s fuse, bouncing, 115 splash in 5.2 m. Explosions hurt their owner at 45%. There is no friendly fire. Spread grows when moving, airborne or firing quickly, and shrinks while aiming down sights. Health is 100, and it refills at 16/s after 4.5 s without damage.

## Streaks, pickups, scoring

- 3 eliminations: **Merit Award** (full reserve and +1 flask). 5: **Prefect Shield** (half damage, 15 s). 8: **Principal’s Pass** (30% faster movement, 40% faster reloads, 15 s). The streak resets on death.
- Fallen fighters drop ammo (and a flask 35% of the time) for 20 s. Fixed ammo and flask pickups respawn after 18 s.
- Respawn after 3 s at the safest spawn. A 2 s spawn shield ends when you fire.
- Points (the shell score and the leaderboard value): 100 per elimination, +25 for a headshot, +50 per streak reward, +5 per second holding the zone, +100 for finishing and +500 for winning.

## Controls

Desktop: WASD, mouse look (pointer lock), click to fire, right-click or Shift to aim, Space to jump, R to reload, Q, 1, 2 or the wheel to swap, G or E for a grenade, Tab for scores (while the mouse is captured). Esc or P pauses. Keyboard-only alternatives: arrow keys look and F fires. While waiting to respawn, the mouse is freed and keys 1–7 pick the next weapon.
Touch: a floating left stick, drag-to-look on the right and buttons for Fire (drag it to keep aiming), a second Fire, Aim (toggle), Jump, Reload, Flask, Swap and Board.

## Architecture

Pure and deterministic, with no DOM: `config.ts`, `map.ts`, `physics.ts` (box collision, step-up and stair snapping, rays), `nav.ts` (a 1 m navigation grid with walk, jump and drop links, and A*), `state.ts`, `sim.ts` (the match at a 60 Hz fixed step: weapons, projectiles, damage, streaks, pickups, objectives, saving) and `bots.ts`. Bots perceive with line of sight and a field of view, react after a skill-based delay and aim with drifting error. They burst-fire, strafe, hold their weapon's range, throw flasks and press the same buttons as the player.
Presentation: `scene.ts` (Three.js arena, models, viewmodel overlay, death camera), `models.ts`, `effects.ts` (pooled tracers, particles, blasts, confetti), `textures.ts` (canvas-drawn textures, no image files), `hud.ts`, `input.ts`, `audio.ts` (Web Audio synthesis) and `index.ts` (the shell contract).

Saving: the snapshot holds the menu choices and, mid-match, the whole match (fighters, projectiles, pickups, clock and the seeded RNG word). Restore validates every field, clamps counts, rejects other versions, and shows a Continue card. Bot brains are rebuilt.

## Menu and icons

The setup menu shows the player's own Q-bot in 3D on a gold-rimmed pedestal in the chosen arena, holding the selected weapon. It sits beside a bright card on wide screens and above a bottom sheet on phones. The menu has these parts:
- A row of seven weapon icons, with the selected weapon's name, role, blurb and stats.
- Mode, arena and bot pills.
- A Play button that stays in reach.

`icons.ts` holds the original SVG icon set (made with the svg-skill, every icon passing `validate.sh`):
- Side-view icons for all eight weapons and the flask grenade.
- `currentColor` UI icons for the touch buttons, the HUD, the respawn picker and kill-feed weapon icons.
