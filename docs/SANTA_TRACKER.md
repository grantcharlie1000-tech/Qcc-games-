# Santa Tracker

`#/santa` shows a live countdown to Santa's departure on Christmas Eve 2026. When the departure time arrives, the page switches by itself to QCC's **simulated** tracker. The homepage shows a compact countdown above the game grid while the Christmas theme is on. It links to the full page.

QCC's tracker is a simulation for fun. It is **not** NORAD Tracks Santa and shows no live tracking data. The page says so, and it links to noradsanta.org.

## Phase 1 research (checked 6 November 2026)

| What | Time | Source |
| --- | --- | --- |
| NORAD website tracking opens | 2:00 a.m. MST, 24 Dec = **09:00 UTC** | [DVIDS NORAD Tracks Santa](https://www.dvidshub.net/feature/NORADTracksSanta) |
| NORAD Operations Center and phone lines open | 4:00 a.m. MST = **11:00 UTC** (until midnight MST) | [noradsanta.org NORAD HQ](https://www.noradsanta.org/en/noradhq), [NORAD 2025 release](https://www.norad.mil/Newsroom/Press-Releases/Article/4344350/norad-ready-to-track-santas-flight-for-70th-anniversary-year/) |
| 2025: NORAD's countdown target | reached zero at about **09:00 UTC** ("Santa preparing") | [TechRadar live blog, 24 Dec 2025](https://www.techradar.com/news/live/santa-tracker-2025-live) |
| 2025: NORAD announced the departure | about **11:00 UTC** | same live blog |
| First place to reach Christmas Day | UTC+14 (Kiritimati, Kiribati) at **10:00 UTC** on 24 Dec | time-zone arithmetic |

**Tracking-centre opening is not the departure.** NORAD's countdown ends when its website starts tracking (09:00 UTC). In 2025 Santa was shown "preparing" for about two hours after that. NORAD has published **no 2026 departure time**. noradsanta.org renders its schedule with JavaScript and gave no 2026 times when fetched.

**Chosen value:** `2026-12-24T10:00:00Z`, labelled **Estimated departure**, with confidence **medium (±60 min)**. This is the midpoint of the 2025 window (09:00–11:00 UTC). It is also the moment Christmas Day begins at UTC+14.

## Correcting the time (no code change)

Edit `public/santa/departure.json` and redeploy. It is served with `Cache-Control: no-store` (`public/_headers`, `netlify.toml`).

- `departureUtc` must be an explicit UTC timestamp ending in `Z` on 23–25 December of `season`. Anything else is rejected, and the bundled fallback in `src/santa/config.ts` is used.
- `status: "official"` is accepted only when a reference has `kind: "official"` and a `url`. Otherwise the page still says "Estimated departure".
- References with `kind: "tracking-centre"` are listed separately as NORAD opening times, never as the departure.
- If you change the time for good, also update `FALLBACK_CONFIG` so offline visitors agree.

## Time handling

- `src/santa/clock.ts` `TrustedClock` anchors to the HTTP `Date` header of the no-store config request. It adds 0.5 s for the header's whole-second truncation and half the round trip. It then advances with `performance.now()`, which is monotonic, so device clock changes, time zones and daylight saving do not affect it.
- Each tick calls `check()`. If wall and monotonic elapsed times diverge by more than 2 s (sleep, or the user changing the clock), it keeps the monotonic time and resyncs with the server.
- A forward jump is applied only if that resync fails (offline). In that case it is treated as sleep, because device clocks keep counting while asleep.
- The clock also resyncs after the tab has been hidden for more than 60 s, and every 30 minutes.
- Every sync re-reads `departure.json`, so an open page picks up a corrected time.
- If the server cannot be reached, the device clock is used, and the page says so.
- `src/santa/ticker.ts` recomputes from the clock on every tick and fires just after each second boundary. Timers stop while the tab is hidden. Missed or throttled ticks therefore never accumulate error.
- Everything is UTC epoch milliseconds. Local times are shown with `Intl.DateTimeFormat`, which applies the visitor's zone and DST for that instant.

## Developer testing mode

Add a query to the hash. The setting lasts for the browser tab (sessionStorage), so a refresh keeps it. A dashed banner with **Exit test mode** shows while it is on, and the homepage countdown follows it too.

- `#/santa?test=10` departs 10 seconds from now. Watch it reach zero and switch to the tracker.
- `#/santa?at=2026-12-24T23:20:00Z` pretends it is that moment (for example, mid-flight).
- `#/santa?test=off` clears test mode.

## Phase 3 architecture

- `src/santa/tracker/route.ts`: the simulated route (35 stops, about local midnight each, as minutes after departure). `positionAt(now, departure)` is the single pure source of position, leg, next stop and progress, flying great circles.
- `src/santa/tracker/view.ts`: `TrackerPanel` (status, ETA in the visitor's time, stop list) draws through a `TrackerRenderer` interface. `FlatMapRenderer` is a lightweight SVG map for now. A `GlobeRenderer` (globe.gl and Three.js are already dependencies) can implement the same interface for the 3D globe and animated sleigh. The flat map stays as the fallback for low-end and no-WebGL devices.
- The tracker module is loaded only after departure, so the countdown page stays small.

## Performance

The scene is one inline SVG with CSS animations on transform and opacity only. Falling snow is a single tiled layer. Animations pause when the hero scrolls off-screen. They stop entirely under the OS reduced-motion setting or QCC's own Reduce motion setting. No images, fonts or libraries are added.

## Verification

- `npx vitest run tests/santa`: config validation, countdown arithmetic, clock (wrong device clock, clock change, sleep), route.
- `tests/e2e/santa-tracker.spec.ts`:
  - The homepage banner links to the page.
  - The server clock beats a device clock set to 2030.
  - Test mode reaches zero, switches to the tracker and survives a reload.
  - A malformed config falls back to the built-in estimate.
  - Backing out before the page loads leaves the library intact.
  - A refresh resumes the same test countdown.
- Screenshots: `docs/evidence/santa-tracker/` at desktop 1366×900 (Europe/London) and iPhone 13 (Pacific/Auckland).
