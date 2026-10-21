# Water Sort expansion and shared scoreboards

User scope: increase Water Sort from 9 to 27 levels; shared online leaderboards for
scored games. Preserve earlier fixes and the first nine Water Sort boards/indexes.

Implementation choices: append 18 deterministic boards across the existing three
tiers (nine per tier overall). Verify every board independently and through hints.
Use the arcade's existing Netlify host: a same-origin function and automatically
applied Postgres migrations. Each browser keeps a cryptographically random private
player token; the server stores only its hash. Players opt in with a public nickname.
Store one best per player/game; only a higher score replaces its timestamp. Top25
and the player's own rank are returned separately, ordered deterministically.
Exclude Globle, which has no score. Pending bests survive offline/reload; stale
rankings are labeled and never served by the service worker as fresh data.

Steps and validation:
1. Expand level tests (count/uniqueness, independent BFS, witness, hint and recovery),
   observe the count fail, append boards, keep legacy indexes, test final-level UI.
2. Add a parameterized Postgres repository/handler with positive integer score,
   supported game, nickname, bearer and payload validation. Exercise two independent
   identities, lower-score updates, game isolation, invalid requests and origins
   against the actual local Netlify database and migration.
3. Add opt-in score sync and menu dialog with request cancellation by generation,
   player highlighting, refresh and offline cached display. Bind native fetch,
   retain pending improvements through in-flight updates and retry after reconnect.
4. Integrate score publishing without changing the GameModule contract, pause/resume
   around the dialog, and exclude function URLs from the offline cache.
5. Validate a two-browser shared board against the actual handler/database, all
   Water Sort browser scenarios, shell checks, full unit suite, build and review.
6. Document local online development and Netlify activation. This work does not
   publish the site or alter an unrelated database. Production activation requires
   a Netlify build/deploy with these migrations and function included.
