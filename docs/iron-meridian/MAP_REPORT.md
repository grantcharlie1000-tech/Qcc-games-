# Iron Meridian map and artwork

## Authored geography

The original Meridian map uses a 1600 by 1000 coordinate system. It contains 84 irregular province polygons across a jagged mainland and the Sund island. Mainland homelands have 18, 11, 13, 14 and 14 provinces; Sund has 14. Every homeland is connected through physical shared borders. Aster has several land neighbors and a broad starting territory.

Each of the six nations begins with 7 civilian factories, 8 military factories, 2 dockyards, 28 steel and 18 oil. Production is distributed across provinces. Each nation has one named capital and two coastal ports. Capitals provide 8 victory points, other cities 3 and other terrain 1. Plains, forests, hills, mountains and cities have spatially coherent distributions, including the central ridge and watershed.

`neighbors` contains physical land borders only. `SEA_LINKS` contains ten undirected port connections, each between provinces without a shared land border. Land and sea links together reach every province, including Sund. `RIVERS` and `ROADS` supply original scenic geometry. No external or protected map data, artwork or fonts are used.

The polygons were generated locally from original coastline points and deterministic relaxed Voronoi cells. The shipped file contains complete static data and has no geometry dependency. The generator used Shapely for local authoring only; it is not a runtime or build dependency.

## Presentation

The Canvas renderer uses muted sage, blue, brick, ochre, lavender and teal over a dark navy sea. It draws coastal contours, an atlas grid, terrain marks, roads, rivers, original place names and national lettering. The map remains a full Canvas surface beneath the interface. No scene space is reserved for controls.

Political ownership drives color. Occupied provinces retain diagonal marks in their homeland's color. Terrain view changes province colors and terrain mark contrast. Supply view consumes the simulation's exact `supplyLevels` results for each current owner, using one graph pass per nation rather than one per province. War borders, battle balance rings and unit order arrows reflect campaign state.

Unit counters include national initials, infantry or armor symbols, stack size, strength and organization bars. Counter sizes use CSS pixels to preserve readability at different zoom levels. Strength and organization use the model's 0 to 100 range. The renderer owns no simulation state or timers. All selection and screen coordinates use `world * zoom + pan`. DPR is capped at 2. Disposal clears the surface and disables further drawing and hit testing.

The cover is an original SVG composition using the authored province geometry, compass rose, fleet silhouettes, operational arrows and tactical counters. It uses a 320 by 410 viewBox, no text, no external resources and a subdued title area. It is 23,425 bytes at initial validation.

## Verification

- `npx.cmd vitest run tests/games/iron-meridian/map.test.ts`: 4 tests passed. These check simple polygons, valid selectable centers, unique province names, bounds, landmass area conservation, exact symmetric physical adjacency, connected homelands, coastal ports, balanced resources and industry, terrain coverage, accessible Aster borders and island transport reachability.
- Python XML and asset checks: SVG parsed successfully; correct viewBox; all 4 IDs unique; 153 SVG elements; no text, embedded image or external href.
- Static renderer border inspection: 206 shared province edges and 42 national border edges available to draw from exact geometry.
- Cover rendered in memory with Sharp at 640 by 820 and visually inspected: clear dark title region, coherent muted atlas, readable compass, operational arrows, counters and fleet silhouettes. No raster artifact was added to the project.
- An intermediate app-wide `npx.cmd tsc --noEmit --pretty false` reported integration and save-validation issues outside this task's ownership. It reported no map or renderer errors. The parent owns the final integrated typecheck, browser run and production build.

The first parent setup capture used a frozen Playwright clock before the first requested animation frame. The parent was asked to advance the virtual clock before capture. The subsequent live capture, `tests/games/iron-meridian/evidence/probe-setup.png`, was visually inspected at 1440 by 900: navy water and atlas grid fill the entire screen, the land runs beneath the glass setup panel and app dock, each national color is distinct, and terrain, rivers, borders, ports and counters are visible. The parent's initial appearance review approved the map without visual changes. The final supply helper substitution preserves values while reducing graph passes from 84 to 6 per supply frame.

No branch changes, commits, publishing or deployment were performed by this task.
