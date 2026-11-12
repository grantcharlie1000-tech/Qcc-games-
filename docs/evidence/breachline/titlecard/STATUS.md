# Breachline title card: status

Honest score after 5 rounds: **6/10**, measured against Last Light's cover at 7. The 7 target is not reached.

## Files
- `scripts/breachline-assets/titlecard/palette.ts`: all colours, three-shade ramps and light colours.
- `scripts/breachline-assets/titlecard/voxel.ts`: the isometric renderer. Each visible face covers two triangles of one screen lattice, the frontmost face wins each triangle, and same-colour triangles merge into polygons. Light is baked with spot cones, ray-cast shadows and ambient occlusion, then quantised. Noise is a hash, never `Math.random`.
- `scripts/breachline-assets/titlecard/scene.ts`: the room, figures and lights.
- `scripts/breachline-assets/titlecard/svg.ts`, `title.ts`, `build.ts`: build the two SVGs. Regenerate with `node --experimental-strip-types scripts/breachline-assets/titlecard/build.ts`.
- `tests/games/breachline/titlecard.test.ts`
- `public/game-art/breachline/cover.svg` and `title.svg`
- Net: about 570 new lines of TypeScript.

## Budgets
| File | Polygons | Size | Budget |
| --- | --- | --- | --- |
| cover.svg | 1170 | 71 KB | 150 KB |
| title.svg | 108 | 5.9 KB | 250 KB |

The topmost scene point is at y = 101. Nothing is drawn in the title band except the background.

## Rounds
| Round | Score | Change | Mismatches found and fixed in the next round |
| --- | --- | --- | --- |
| 1 | 3 | First full room. | A ceiling grid hid the hole. White debris cloud. Attackers poked over the wall. Light read white, not amber. Helmets read as hats. |
| 2 | 5 | Lit corridor behind the hole, light pool, defenders on the flanks, anchored crop. | The hole was too small for a figure. A defender stood in front of the hole. Lit strips at the edges. Murky palette. Busy at 160 px. |
| 3 | 5.5 | Spot cones (no stains on the left wall), warmer palette, tighter crop, ragged cut on the outer wall. A compact room was tried and rejected because it was more crowded. | A third attacker darkened the hole. Debris was a grey heap. Left defender was cropped into slivers. Wall top was too close to the band. Large dull walls. |
| 4 | 6 | Soot ring round the hole, debris flying through the glow, left defender fully framed in the light pool, helmet no wider than the head. | Attacker front too dark. Left half of the hole dim. No ceiling grid. Walls cool grey. Floor corner too bright. |
| 5 | 6 | Lighter attacker gear, warmer ambient, second corridor light. A ceiling grid, a light shaft and a rim light were tried and rejected. | See "Still wrong". |

## Palette
- Card: background `#1f2a33`, ink `#fff3df`, accent `#f0b429`.
- Ramps: plaster, dado, trim, studs, scorch and soot, carpet, two tiles, steel and dark steel, hazard stripes, desk, laminate, cabinet, monitor and screen.
- Attackers: cloth, vest, helmet, blue band.
- Defenders: cloth, vest, helmet, orange band.
- Shared: skin, gun, boot, visor, uplink and its glow, fire.
- Lights: amber breach, teal uplink, cool ambient.

## Gates
- `npx tsc --noEmit`: passes.
- `npx vitest run tests/games/breachline/titlecard.test.ts`: 5 tests pass. They cover determinism (committed files equal the generator output), viewBox and title/desc, no text, raster, script, font or external reference, the calm title band, the background colour and the size budgets.
- `npm run build`: passes.

## Still wrong
- It is busier than Last Light at card size. Last Light has one hero on open space; this is a full scene.
- The attacker is backlit, so his face is small and dark.
- The defenders face the hole, so we see their backs, and their banded helmets still half read as hats.
- The left half of the hole is dimmer than the right.
- The brief's ceiling grid is not drawn. Two versions both hid the breach, so the ceiling is shown fully cut away.

## Proposed change to show title.svg in the game (not made, `index.ts` is not mine)
This follows Last Light's pattern: an `sr-only` heading with a decorative image. The crest is dropped because the wordmark replaces it. Preview: `round-5-title-in-menu-preview.png`.

```diff
--- a/src/games/breachline/index.ts
-    <header class="bl-brand"><span class="bl-crest" aria-hidden="true"><i></i></span><div><h2 id="bl-menu-title">Breachline</h2><p>Breach the annex. Plant the uplink. Or hold the line.</p></div></header>
+    <header class="bl-brand"><div><h2 id="bl-menu-title" class="bl-title"><span class="sr-only">Breachline</span><img src="${import.meta.env.BASE_URL}game-art/breachline/title.svg" alt="" width="190" height="130"></h2><p>Breach the annex. Plant the uplink. Or hold the line.</p></div></header>
--- a/src/games/breachline/style.css
+.bl-title{margin:0;line-height:0}.bl-title img{display:block;width:190px;max-width:100%;height:auto}
```
