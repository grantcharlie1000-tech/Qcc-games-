# Movies & TV design references

Reviewed on 2026-10-25 following the user's request to copy Netflix's UI and use references.

| Reference | Applied design |
| --- | --- |
| [Netflix's official mobile redesign](https://about.netflix.com/en/news/introducing-exciting-new-ways-to-find-and-enjoy-your-next-favorite-on-mobile) and [Home UI still](https://images.ctfassets.net/4cd45et68cgf/7lu1rd3OPvoAzqjZCOu0bJ/8ba82a8110bd5dfd256a17bba05c5fca/en-US-Home-UI-Still.jpg) | Framed mobile feature card, pill filters, Play/My List actions, persistent bottom navigation |
| [Netflix Tudum's official interface guide](https://www.netflix.com/tudum/articles/netflix-new-homepage-layout-user-guide) | Content-first browsing, top navigation, visible search/list, categories and details |
| [Netflix's TV experience announcement](https://about.netflix.com/en/news/unveiling-our-innovative-new-tv-experience) | Prominent imagery and simpler top-level shortcuts |
| [Classic desktop browse screenshot](https://cdn.mos.cms.futurecdn.net/eWPve9UkA8ehWcRq9eRKpk.png), [published by Tom's Guide](https://www.tomsguide.com/news/netflix-just-killed-a-feature-that-seemed-like-a-great-idea) | Dense landscape shelves, small gutters, dark surfaces and familiar desktop navigation |

The desktop layout uses a compact 72px header, 4% page gutters, a cinematic hero, white Play/gray More Info actions and horizontal rows. Mobile has an inset feature card, pill navigation and Home/Search/My List/Study controls. QCC retains its own branding and is not affiliated with Netflix.

## Actual artwork, not generated substitutes

All generated movie images and synthetic poster files were removed from the final implementation, along with outdated preview screenshots that showed them. Posters/backdrops now come from TMDB image URLs; `src/movies/artwork.ts` records poster file IDs for the starter titles. Imported catalogs use their own TMDB poster/backdrop fields. Browser access to `image.tmdb.org` is explicitly allowed by CSP. Images have empty decorative alt text on cards and a meaningful poster label in title details.

The workspace's network policy blocks TMDB image downloads, so a live screenshot containing the actual remote artwork could not be verified here. Browser security/layout tests mock image transport; those fixtures are not movie artwork and are not shipped. The interface shows simple title fallbacks on failed images rather than inventing replacement pictures. Reference screenshots are linked for design research only and are not loaded by the app.
