# Globle — specification

An original country-guessing game on a 3D globe, written for Pocket Arcade. It follows the well-known
"Globle" idea (guess a hidden country; guesses are coloured by proximity) but contains none of the
original Globle code, data or artwork, whose source is under a noncommercial licence.

## Stack

- Vanilla TypeScript `GameModule` (the arcade has no React), rendered with **globe.gl 2.46.2** on the
  arcade's existing Three.js 0.180. globe.gl and the data load only when the game opens (lazy chunk).
- No textures, fonts or network requests: the ocean is a `MeshPhongMaterial`, land is polygon geometry.

## Countries and geography

- Playable list (`countries.ts`): 193 UN members + Vatican City + Palestine + Kosovo + Taiwan = 197.
  Canonical id = Natural Earth `ADM0_A3`. Victory compares canonical ids only.
- Source: Natural Earth Admin 0 Countries (public domain), pinned to natural-earth-vector commit
  `ca96624a56bd078437bca8184e78163e5039ad19`; the generator records the SHA-256 of both input files.
- Merged into a playable country (their land counts for it): Northern Cyprus and the UN buffer zone → Cyprus,
  Somaliland → Somalia, Baikonur → Kazakhstan, Guantánamo Bay → Cuba, Åland → Finland, Hong Kong and Macao → China.
- Dependent / overseas land never counts towards a parent's distance. Natural Earth already separates
  dependencies (Greenland, Puerto Rico, Hong Kong, New Caledonia…). Four sovereign polygons also contain
  overseas parts, which are cut out and drawn as neutral land: France's five overseas regions, the
  Caribbean Netherlands, Bouvet Island (Norway) and Tokelau (New Zealand). Integral islands and states
  (Hawaii, Alaska, Canaries, Ceuta/Melilla, Azores, Svalbard, Galápagos…) are kept.
- Non-playable land (Antarctica, Western Sahara, territories) is drawn neutral and cannot be guessed;
  typing a well-known one explains why (e.g. “England is part of the United Kingdom”).

## Distances (`scripts/build-globle-data.mjs` → `data/distances.json`)

- Metric: shortest great-circle distance between the two countries' **land boundaries** (all rings of every
  polygon, so islands and multi-part countries are handled), sphere R = 6371.0088 km.
- Geometry: Natural Earth **1:10m** (548k vertices). Each boundary is densified so no gap exceeds 1 km,
  then an exact branch-and-bound search over bounding-sphere trees finds the minimum chord, converted
  to arc length. Result is within 1 km of the exact 1:10m boundary distance, rounded to whole km.
- Shared borders and enclaves are exactly 0 km (Natural Earth borders share vertices): 316 bordering pairs.
- The generator asserts known facts (France–Spain 0, Italy–Vatican 0, Spain–Morocco 0 via Ceuta/Melilla,
  Dover Strait 20–50 km, Diomede Islands < 10 km, France–Brazil > 5000 km because French Guiana is excluded).
- 19,306 pairs bundled as an upper-triangle array (~100 KB). Lookups are instant; nothing is computed at runtime.

## Display geometry (`data/world.json`)

Separate from the distance geometry: Natural Earth **1:50m**, Douglas–Peucker 0.03°, 0.001° precision,
exteriors re-wound clockwise (a reversed ring would cover the whole sphere). Includes label points and
land areas used only for camera framing and tiny-country markers.

## Rules

- A hidden country is chosen. Type a name; Enter or **Guess** submits. Unlimited guesses.
- Matching ignores case, accents and punctuation; `St` ≡ `Saint`; aliases (UK, USA, Ivory Coast, Czech
  Republic, Burma, Holland, DRC…). Empty, unknown (with a “Did you mean…?” suggestion), ambiguous
  (“Congo”, “Korea”), non-playable and duplicate entries explain themselves and never count.
- Colour by distance: neighbour (0 km) dark red; < 1000 km red; then a smooth ramp through orange to
  pale cream at ≥ 12,000 km. Correct = green. Unguessed land is a mid grey so even the palest guess stands out, and
  guessed countries get a dark outline. Colour-blind palette: a magma-like ramp (deep purple → magenta → salmon →
  pale yellow) whose luminance rises with distance and never resembles the blue ocean; correct = cyan.
  Every guess also shows name, distance in km, a band label and closeness % (100% = touching, 0% = antipodal).
- The list is ordered closest first; the latest guess is outlined. Win panel shows the guess count.

## Modes and saving

- **Daily**: answer derived from the New Zealand (Pacific/Auckland) calendar date; each 197-day cycle is a
  seeded permutation visiting every country once. Same for everyone, stable across reloads; resets at NZ
  midnight (checked on resume, guess, mode switch and every 30 s).
- **Practice**: unlimited random rounds; “Play again” and the toolbar Restart start a new practice round.
  Restart never re-rolls or clears the daily puzzle.
- Snapshot (through the shell's `context.save`) holds both rounds, daily stats (played, wins, current/best streak,
  average) separately from practice stats (played, wins, average, best), and the local colour-blind override.
  Each part is validated on its own: a damaged or outdated round is replaced without losing statistics.
- Two open tabs: a `storage` listener merges the other tab's save forwards only (later daily date, longer guess
  list, higher counts), so a stale tab's autosave can never erase a newer win. A guess submitted just after NZ
  midnight is held back and the player is told the new puzzle has started.

## Interaction and performance

- OrbitControls drag/rotate, wheel and pinch zoom; `touch-action:none` on the globe only. The camera flies
  to each guess with an own RAF tween that any pointer, wheel or touch cancels immediately.
- `enablePointerInteraction(false)`: no raycasting, hover tooltip or click handler, so unguessed countries
  can't be revealed or submitted by pointing.
- Rendering runs only while something moves (≈1.2 s idle timeout); paused by the shell/visibility.
  Pixel ratio ≤ 1.5 and a 1.4 MP backing-store budget; antialiasing off on high-density screens.
- Land is one merged vertex-coloured mesh plus one merged border mesh (2 draw calls instead of ~3,200), built
  in ≤10 ms slices; recolouring rewrites colour attributes only. Unused globe.gl dependencies (Three's WebGPU/TSL
  builds, h3-js) are aliased to stubs, so the lazy chunk is 1.29 MB (460 KB gzip).
- A fly-to interrupted by pausing resumes afterwards; one interrupted by the player is dropped.
- Dispose: cancels timers/listeners/observers, `_destructor()`, disposes renderer, meshes and materials, forces
  WebGL context loss and removes the canvas. A lost context gets 5 s to be restored before list-only play.
- The shell's Escape → Study behaviour is untouched (the game never handles Escape).
