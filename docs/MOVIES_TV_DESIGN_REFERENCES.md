# Movies & TV design references

References reviewed on 2026-10-25 after the user's direction to copy Netflix's interface and use visual references. The implementation uses QCC branding and original local artwork. Netflix reference screenshots and licensed title art are not copied into the production app.

| Reference | What it informs | Implementation |
| --- | --- | --- |
| [Netflix's official mobile home redesign](https://about.netflix.com/en/news/introducing-exciting-new-ways-to-find-and-enjoy-your-next-favorite-on-mobile) and its [published Home UI still](https://images.ctfassets.net/4cd45et68cgf/7lu1rd3OPvoAzqjZCOu0bJ/8ba82a8110bd5dfd256a17bba05c5fca/en-US-Home-UI-Still.jpg) | Framed feature artwork, pill filters, Play/My List actions, persistent bottom navigation | At 650px and below, rounded inset hero, top filter pills, local My List, and Home/Search/My List/Study navigation |
| [Netflix Tudum's official interface guide](https://www.netflix.com/tudum/articles/netflix-new-homepage-layout-user-guide) | Content-first browsing, top navigation, visible search and list controls, category shelves, metadata on title exploration | Home/TV Shows/Movies/My List navigation, search control, horizontal rows, genre selector, native details/seasons/episodes |
| [Netflix's TV experience announcement](https://about.netflix.com/en/news/unveiling-our-innovative-new-tv-experience) | Prominent content imagery and simpler top-level shortcuts | Large cinematic hero, red QCC wordmark, compact navigation and clear primary/secondary actions |
| [Classic desktop browse screenshot](https://cdn.mos.cms.futurecdn.net/eWPve9UkA8ehWcRq9eRKpk.png), published in [Tom's Guide](https://www.tomsguide.com/news/netflix-just-killed-a-feature-that-seemed-like-a-great-idea) | Dense landscape title shelves, small gutters, dark background, familiar desktop navigation | Desktop landscape cards, title overlays, small gutters, hover affordances and near-black surfaces |

## Concrete layout decisions

Desktop uses a 72px navigation bar, 4% page gutters, a wide cinematic feature with white Play and gray More Info actions, and landscape rows showing five cards at 1366px. Mobile follows the mobile reference rather than shrinking the desktop page: a framed portrait feature, compact pill controls, paired Play/My List actions and a fixed four-action bottom bar. All actions have functional equivalents in this repository; there are no decorative account menus, fake notifications, external previews or unimplemented streaming controls.

Reference personalization and account activity are intentionally replaced by local list/progress. Current-trending claims appear only for an imported, timestamped TMDB snapshot. Playback remains unavailable without verified licensed files. Study Mode is available from the desktop header, mobile bottom navigation and Escape. There is no Netflix affiliation.

## Original art provenance

`public/movies/art/cinema-hero.webp` is an original generated cinematic space landscape. `collection-stills.webp` is an original generated 4×2 genre-illustration atlas for the starter titles. Neither is an official frame, poster, endorsement, or likeness of a film actor. Starter rows crop the atlas with CSS; imported TMDB catalogs use their locally downloaded posters instead. The eight SVG posters and five inline card decorations are original vector art. Production image files are WebP (approximately 142KB for the hero) and are served only by this site. Source generated PNGs remain in the workspace's generated-image library and are not committed to the app.

See `docs/evidence/movies/root-home.png` and `root-mobile.png` for implementation screenshots, and `audit.json` for the resource and offline audit. All reference links are documentation-only and are never fetched by the user's browser.
