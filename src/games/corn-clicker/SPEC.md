# Corn Clicker

An original corn-themed incremental game in the style of the genre's classics. You start by clicking a single cob and end up running corn production on a cosmic scale. Names, jokes and pixel artwork are original.

## Files
| File | Role |
| --- | --- |
| `data.ts` | **All content and balancing**: producers, upgrades (generated from tables), golden cob effects, achievements, skins, prestige constants, permanent upgrades, garden varieties, festivals, scarecrow bonuses, pests and news. Tune the game here. |
| `big.ts` | `Big` (mantissa × 10^exponent) arithmetic, parsing, serialization and number formatting. Values stay finite far beyond 1e308. |
| `model.ts` | Pure rules engine (`CornGame`) with no DOM. Covers production, pricing, purchases, clicks, time, golden cobs, festivals, scarecrow, pests, garden, achievements and Replant. |
| `state.ts` | State shape, fresh state, versioned serialization, migration from older layouts, validation and repair, and export codes. |
| `persistence.ts` | Cross-tab ownership lock, rolling backups and direct reads of the newest save. |
| `ui.ts`, `garden-view.ts`, `text.ts`, `audio.ts`, `style.css` | Interface, input, feedback, tooltips, modals and synthesised sounds. |
| `sprites.ts`, `art.ts` | Pixel art. Sprites are character grids with small palettes, covering the cob (8 skins as palette swaps), 20 producers, golden cob, pest, scarecrow hats, 4 plant stages (8 varieties as palette swaps) and icons. `art.ts` draws each sprite once to a canvas, then shows it as a crisp-scaled PNG; the farm backdrop is painted procedurally at 192×120. |

## Rules
- **Clicking.** Each pointer press (per finger), each non-repeating Space or Enter press on the focused cob, and each assistive-technology activation awards one click. A click is worth `(1 + Many Hands bonus) × click multipliers + production × click share`, and Kernel Storm multiplies the result by 777. The click-share upgrades (8 of them, plus permanent ones) keep clicking useful late in the game.
- **Producers.** There are 20 producers. Price = `base × 1.15^owned`, ceiled while exact. Bulk ×10/×100 prices are exact sums (a geometric series beyond 300). Max buys the largest affordable count. Rows show the real total and the real production gain, computed by applying the purchase. A producer appears once you have earned 35% of its base price.
- **Upgrades (162).** There are 103 producer tiers (×2 at 10/25/50/100/200 owned, plus 1 owned for the first three producers) and 11 click upgrades. Six Many Hands upgrades give Farmhands and clicks +0.1 per non-Farmhand building, then multiply that bonus. There are also 16 flavour upgrades (global %), and 14 synergies between producer pairs (low tier +5% per high-tier unit; high tier +0.1% per low-tier unit). Many of the synergies give early producers late-game partners. The rest are 3 golden-cob upgrades, 5 Butter churns and 4 feature unlocks. Tooltips are generated from the effect data and show the price and the unlock requirement. Locked upgrades over 25% of the way to unlocking are shown as "Coming soon".
- **Golden cobs.** A golden cob spawns after 150–330 s of active play, divided by frequency bonuses. The first one comes after 60–120 s. It stays 13 s, shown by a ring timer, and can be collected by click, tap or the **G** key. Effects are weighted:
  - *Lucky Harvest* (46): `min(15% of bank, 900 s of production) + 13`.
  - *Bumper Crop* (44): production ×7 for 77 s.
  - *Kernel Storm* (10): clicks ×777 for 13 s.

  **Stacking:** different effects multiply, so a click during Bumper + Storm earns its production share at ×7, then ×777. Lucky uses current boosted production. Collecting an effect that is already running sets its timer to the longer of the two and never doubles the multiplier.
- **Butter Bonus and skins.** There are 67 achievements, each worth +1% production (churns and Butter Vault raise this). Eight cob skins unlock at 0/5/10/18/26/34/44/55 achievements. The Goals tab shows the closest achievement and the next skin.
- **Replant.** `seeds ever available = floor(cbrt(lifetime kernels harvested / 1e9))`. Replanting claims only seeds not already claimed, and spending kernels never lowers lifetime harvest. Each seed ever claimed gives +4% production permanently, and spending seeds on permanent upgrades doesn't change that. Replanting resets kernels, producers, ordinary upgrades (feature unlocks included), garden plantings, boosts, festivals, pests and run statistics. It keeps achievements, skins, discovered varieties, seeds, permanent upgrades, lifetime statistics and options. There are 22 permanent upgrades across Active, Idle, Golden and Whole-farm paths, some with prerequisites.
- **Garden.** Unlocked by the *Kitchen Garden Plot* upgrade (needs 1 Greenhouse). The plot is 3×3, growing to 4×4 at 50 Greenhouses. Planting costs `max(50, production × plantSeconds)`. Ripe plants give their effect while they stand: production, click, golden frequency or golden duration. Harvesting pays the planting cost × `harvestMult` (1.4–2), fixed when the seed was planted, so constant replanting helps without dominating the economy; pulling an unripe plant pays nothing. Every 10 s, an empty plot next to the right two ripe parents (8-neighbourhood) may sprout a mutation. The recipes are: Popcorn = Sweet+Sweet, Blue Moon = Sweet+Popcorn, Candy = Sweet+Blue Moon, Ghost = Blue Moon+Blue Moon, Ember = Popcorn+Candy, Prism = Candy+Blue Moon, Starcob = Prism+Ghost. Discoveries are permanent. Recipes appear in the collection book once both parents are known. Seeds can be tapped then planted in a plot, or dragged onto a plot.
- **Scarecrow** (needs 1 Irrigation Network). It has one selectable bonus, or two with *Scarecrow Pact*:
  - +5% production
  - +15% clicks
  - +15% golden frequency
  - pests siphon half as much
  - +30% garden growth

  After the first choice, a change has a 60 s cooldown.
- **Harvest festivals** (needs 1 Corn Factory). A festival arrives every 15–25 minutes of active play and lasts 150 s. It is one of the Husking Bee (clicks ×3), the Popcorn Parade (golden ×2.5) or the Butter Bash (production ×1.5).
- **Cornpocalypse** (needs 1 Corn Cloner). A mutant pest appears every 80–160 s, up to 8 at once. Each siphons 5% of production into its belly. Popping one returns its stolen kernels ×1.25, so leaving pests to fatten pays more later. The Cornpocalypse can be paused from the Farm tab, which pops every pest.

## Time, saving and safety
- Production is computed from wall-clock elapsed time in ≤1 s steps, never from frame counts. A 1 s heartbeat keeps it running when animation frames are throttled.
- Short pauses (menu, rules, Study; up to 60 s) freeze the farm, golden cob included. A gap of up to 60 s between ticks while running counts as active play. A longer gap, whether the game was closed, hidden, paused or the device slept, counts as **time away**. Away time pays base production (no golden, festival or pest effects) at 50% for up to 8 h. Permanent upgrades raise this to 12 h, then 28 h, and to 75%, then 100%. Boosts and festivals count down through the whole gap. The garden grows for the credited time. The return dialog explains all of this. `lastTick` is saved, so a reload cannot pay the same gap twice, and imported codes start from "now".
- If the clock goes backwards, no time is credited and boost timers cannot grow. A high-water mark (`clockMax`) means time already paid is never paid again, even after moving the clock forward, back and forward. A save stamped more than a minute in the future is treated as "now".
- **Saving.**
  - The shell's 5 s autosave and its saves on pause and pagehide are used.
  - Significant actions also save: purchases (coalesced 0.7 s), prestige, imports, permanent upgrades and garden actions.
  - Backups are taken every 10 minutes and before replanting, importing, restoring or starting over. Five are kept.
  - A damaged save is replaced automatically by the newest readable backup. Any backup can be restored from Options.
  - Export codes are base64 JSON with an FNV checksum.
  - Older layouts migrate (version 1 → 2), and unknown or invalid fields are repaired or dropped.
- **Tabs.** Only one tab runs the farm. Others show "Playing in another tab". *Play here instead* claims the lock, waits for the old tab's final save, then loads the newest save, and the old tab steps aside. A tab that isn't the owner returns `undefined` from `serialize()`, and the shell skips that write, so it can never overwrite newer progress. Revisions only rise, including after Restart and backup restores. Taking over always continues from the stored save. A paused tab gives up the lock; when it resumes, it adopts a newer save written by another tab.
- **Restart** in the toolbar asks for confirmation and makes a backup before wiping everything.

## Interface
- **Desktop** (game area ≥ 900 px) has three columns:
  - The cob with counters, active effect timers, a contextual tip, the next goal, the next unlock and save status.
  - A news ticker and the Farm, Garden, Goals, Stats, Replant and Options sections. The Garden and Replant tabs appear when they become relevant.
  - The shop: upgrades, Coming soon, the ×1/×10/×100/Max selector and producers.
- **Narrow screens:** an accessible tablist (Cob, Shop, Farm) at the bottom and a compact kernel counter. Each panel scrolls internally, and the document never scrolls.
- **Farm scene:** the backdrop moves from countryside through industrial dusk and high-tech night to the cosmos as producers are bought. Each owned producer gets a lot with up to eight icons, on a log scale.
- **Feedback:** squash on every click, kernel particles (Full, Low or Off), floating earnings, toasts (several achievements at once share one), and live-region announcements. Optional synthesised sound has its own toggle and volume.
- **Reduced motion:** follows the in-game option, the arcade menu and the operating system. It removes squash, particles, wiggles and slides, but keeps state changes and timers.

## Pacing (checked by `tests/games/corn-clicker/pacing.test.ts`)
A greedy bot that clicks 6 times per second and collects golden cobs:
- owns its first producer within about 70 s (a single Farmhand is affordable after 15 clicks);
- makes 26 purchases in the first 5 minutes and at least 5 in every later 5-minute window;
- unlocks the garden at about 25 minutes;
- claims its first Golden Seed at about 41 minutes, 5 seeds at about 87 minutes and 10 seeds at about 3 hours.

After a Replant with 10+ seeds and the cheapest permanent upgrades, the next run harvests more than 3× as much in its first hour. An idle bot that clicks once every 3 seconds still reaches its first seed in under 2 hours.
