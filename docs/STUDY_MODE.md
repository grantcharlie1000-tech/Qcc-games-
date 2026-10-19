# Study Mode

On the first visit in a tab, choose one of 20 NCEA-related revision chapters. The choice is held in `sessionStorage`, so reloading keeps it and a fresh tab gets a new choice. Blocked storage falls back to memory and explains that reloading will ask again.

During gameplay, **Esc** pauses the game and serializes progress before opening the chapter. A discreet **Return to Arcade** control restores the same game instance and DOM. Previously running games resume; manual pauses remain paused. A hidden tab is never resumed by returning. Esc also works from rules, the shared menu and a pending game import. Holding Esc does not toggle back into play.

Change chapters using the Study topic selector. Each has a learning focus, three explanatory sections, an original SVG diagram with an accessible description, a worked example and a self-check with an expandable explanation. Contents links scroll within the article without touching the game route. Study Mode also opens from the hamburger menu.

## Chapters

| # | Subject | Topic |
| --- | --- | --- |
| 1 | English | Close reading and language |
| 2 | English | Essay structure and evidence |
| 3 | English | Speaker, imagery and tone in poetry |
| 4 | English | Camera, sound and editing |
| 5 | Maths | Linear relationships |
| 6 | Maths | Quadratic roots, factors and turning points |
| 7 | Maths | Right-angled trigonometry |
| 8 | Maths | Probability and conditional events |
| 9 | Science | Forces and acceleration |
| 10 | Science | Energy transfers and efficiency |
| 11 | Science | Acids, bases and neutralisation |
| 12 | Science | Genes, alleles and inheritance |
| 13 | Science | Ecology and energy flow |
| 14 | History | Sources, perspectives and evidence |
| 15 | History | Te Tiriti: texts and historical context |
| 16 | History | The origins of the First World War |
| 17 | Geography | Catchments, flooding and risk |
| 18 | Economics | Supply, demand and equilibrium |
| 19 | Digital Technologies | Sequence, selection and iteration |
| 20 | Health | Hauora and Te Whare Tapa Whā |

These are original general revision notes, without claims of coverage for a particular achievement standard, level or assessment year. All worked passages, scenarios and diagrams were written for this product. Use alongside class materials.

## Implementation

`src/study/topics.ts` holds typed chapter data and eagerly imported SVG source; `session.ts` validates the session choice; `view.ts` owns reading UI; scoped CSS supplies the textbook layout. `src/main.ts` owns pause/save, focus, dialogs, visibility and the retained game. The game API and save envelopes are unchanged.

Visibility preserves the underlying Canvas dimensions. `inert` plus capture-phase keyboard isolation prevents retained document/window game handlers from consuming reading keys. Native Space scrolling, selectors and buttons still work. Topic changes, contents links and Return never import a game or change the hash route. There is no transition animation, loading screen, fetch, external font or externally loaded diagram. Article text and vectors ship in the existing shell cache, and the full pack still caches all 12 lazy games.

Fruit Merge and Animal Stack cancel their RAF loops while paused, resume once with fresh timing and stop drawing on disposal. Their original owners supplied isolated changes and Canvas draw-count regressions. Missing/full localStorage still permits in-memory play. Study reports whether progress was saved to the device, held in memory or could not be serialized. Caching remains browser/origin-specific and may be disabled or evicted by device policy.

## Sources and skills

Consulted on 19 October 2026 using the available web tool. Official guidance informed the revision framing; the teaching text and art are original. The shipped product fetches none of these sources.

- [Ministry of Education: English](https://ncea.education.govt.nz/english/english), [Science](https://ncea.education.govt.nz/science/science), [History](https://ncea.education.govt.nz/social-sciences/history).
- [NZQA: Mathematics and Statistics](https://www2.nzqa.govt.nz/ncea/subjects/select-subject/mathematics-and-statistics/) — search listing accessible; direct page fetch returned 403. No current standard numbers are inferred from it.
- [Waitangi Tribunal: About the treaty](https://www.waitangitribunal.govt.nz/en/about/the-treaty/about-the-treaty).
- [Manatū Taonga / NZHistory: Origins of the war](https://nzhistory.govt.nz/war/first-world-war-overview/origins).
- [Ministry of Health: Te Whare Tapa Whā](https://www.health.govt.nz/maori-health/maori-health-models/te-whare-tapa-wha).

[Actual skill usage](../src/study/SKILL_USAGE.md). [Implementation plan](superpowers/plans/2026-10-19-study-mode.md).

## Verification evidence

[Results](evidence/study-results.json), [independent review](evidence/study-review.md), [production offline results](evidence/release/offline-results.json).

Screenshots: [chooser, 390](evidence/study-picker-390.png), [article, 390](evidence/study-article-390.png), [768](evidence/study-article-768.png), [1366](evidence/study-article-1366.png), [all diagrams](evidence/study-diagrams-contact.png).

The Study browser suite exercises every running game, a six-second frozen autosave, all articles, same-instance return, keyboard reading, modal/delayed-mount transitions, a live card drag, storage failure, manual pause and hidden-page return. Existing game interaction tests retain their assertions and use a shared fixture representing an already selected topic; first-visit tests use Playwright's base fixture.

Chromium keyboard and viewport checks are proxies for device testing. This environment has no physical Chromebook or managed Mac. Missing WebKit is recorded as unavailable, never passed. Production output is tested at `/` and `/Qcc-games-/`. A ready connector deploy does not replace live-origin browser testing when network policy blocks that origin.
