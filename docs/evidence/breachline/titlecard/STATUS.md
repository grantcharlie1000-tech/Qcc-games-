# Breachline title card: status

Final, after 8 rounds: honest score **7/10**, measured against Last Light's cover at 7. The planner accepted round 7 at 7; round 8 was a last polish.

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
| cover.svg | 903 | 61 KB | 150 KB |
| title.svg | 108 | 5.9 KB | 250 KB |

The topmost scene point is at y = 106. Nothing is drawn in the title band except the background.

## Rounds
| Round | Score | Change | Mismatches found and fixed in the next round |
| --- | --- | --- | --- |
| 1 | 3 | First full room. | A ceiling grid hid the hole. White debris cloud. Attackers poked over the wall. Light read white, not amber. Helmets read as hats. |
| 2 | 5 | Lit corridor behind the hole, light pool, defenders on the flanks, anchored crop. | The hole was too small for a figure. A defender stood in front of the hole. Lit strips at the edges. Murky palette. Busy at 160 px. |
| 3 | 5.5 | Spot cones (no stains on the left wall), warmer palette, tighter crop, ragged cut on the outer wall. A compact room was tried and rejected because it was more crowded. | A third attacker darkened the hole. Debris was a grey heap. Left defender was cropped into slivers. Wall top was too close to the band. Large dull walls. |
| 4 | 6 | Soot ring round the hole, debris flying through the glow, left defender fully framed in the light pool, helmet no wider than the head. | Attacker front too dark. Left half of the hole dim. No ceiling grid. Walls cool grey. Floor corner too bright. |
| 5 | 6 | Lighter attacker gear, warmer ambient, second corridor light. A ceiling grid, a light shaft and a rim light were tried and rejected. | Planner review: the hero does not pop, the scene is too busy and cropped, the defender is a blob from behind, the soot is spread too wide, and the colours are one grey-blue. |
| 6 | 6.5 | A whole diorama floating on the card, with a clean slab and wall ends. One hero attacker framed by the glow, a second kneeling behind him, and one defender in three-quarter view behind the overturned desk (face, chin strap, low banded helmet, rifle on the desk). Pale wallboard core and tight soot at the hole, four large chunks in the air, muted walls and a lighter blue hero. A smaller room (figures 1.4 times larger) was tried and rejected because the hero then filled the hole. | The figures are still smaller than Last Light's character. The second attacker is hard to see. The carpet corner is a large dark area. The hero's rifle points at the viewer, so it reads as a short bar. |
| 7 | 7 | The hero's rifle swings across the frame toward the defender, with a muzzle flash and spent cases, and stops short of him so there is clear air between the rifles. Rifles are mid-grey with a light top edge. The second attacker is reduced to a banded helmet peeking into the hole. Paper, wall chunks and a fallen chair fill the carpet corner. The diorama is scaled about 10 percent larger. Sparse amber and pale specks sit round the slab, and the goggles glow. | Still busier than Last Light. The peeking helmet sits near the centre of the hole rather than at its edge. The fallen chair reads as a dark block. |
| 8 | 7 | Last polish: the reinforced panel and its braces are a step lighter, so the hero's right side no longer merges with it, and the chair is replaced by a tipped waste bin spilling paper. The title now shows in the game menu. | None found. |

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
- Still busier than Last Light at card size. Last Light has one figure on open space; this is a whole room.
- The second attacker's helmet sits near the centre of the hole rather than at its edge.
- The brief's ceiling grid is not drawn. Two versions both hid the breach, so the ceiling is shown fully cut away.
- The figures are about 1.1 times their round 4 size, not the 1.4 times asked for. Any larger and the hero fills the hole.

## Title in the game menu (made with the planner's authorisation)
`src/games/breachline/index.ts`: the menu header is now an `sr-only` heading named "Breachline", followed by a decorative `title.svg` image with `alt=""`, at 190 × 130. The crest and the tagline paragraph are removed. Nothing else in the file changed.
`src/games/breachline/style.css`: one rule for the wordmark (`.bl-title`) replaces the tagline rule. The two crest rules, unused now, are removed.

Checked with the dev server: at desktop and phone width, with the image loaded and with it blocked, the menu has exactly one heading named "Breachline" and no page errors.
- `final-menu-desktop.png` and `final-menu-phone.png`: image loaded.
- `final-menu-desktop-image-blocked.png` and `final-menu-phone-image-blocked.png`: image blocked.
- `final-card-desktop.png` and `final-card-phone.png`: the final card on the library page.

## Final gates
- `npx tsc --noEmit`: passes.
- `npx vitest run tests/games/breachline`: 17 files, 141 tests, all pass.
- `npx playwright test tests/games/breachline/play.spec.ts --project=chromium`: 6 of 6 pass.
- `npm run build`: passes.
