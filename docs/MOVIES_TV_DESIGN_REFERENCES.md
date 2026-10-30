# Movies & TV design references

Reviewed on 2026-10-26 after the request to base the catalog interface on FrameXTV. The streaming-style redesign has its own notes below. Its [spec](superpowers/specs/2026-10-28-streaming-redesign-design.md) is dated 2026-10-28.

| Reference | Applied design |
| --- | --- |
| [FrameXTV Movies](https://framextv.xyz/movies) | The requested `.xyz` address redirects to FrameXTV's `.cc` catalog. It has full-width feature artwork, compact section navigation, searchable movie/TV catalog, curated horizontal rows, genre discovery, and concise type/rating/year metadata. Its catalog labels sections such as Trending Movies, Popular Movies, In Theaters, Sci-Fi, Horror, and Thrillers. Applied in the Movies hero, filter bar, rails, poster cards and title pages. |
| [FrameXTV API & Embed Documentation](https://framextv.xyz/api) | The requested `.xyz` address redirects to the `.cc` documentation. Standard movie and episode iframe routes use TMDB IDs. The published API describes iframe embeds and player postMessage controls; it does not document a catalog/search REST endpoint. QCC builds these embed routes in `src/movies/provider.ts` on the `.cc` host, and it builds no other FrameXTV address. |
| [TMDB search and discovery guide](https://developer.themoviedb.org/docs/finding-data) | Search and discovery provide the metadata index for the complete catalog rather than relying on a small checked-in sample. Search, discovery, rails, genres, credits and stills come from TMDB through the same-origin function `netlify/functions/movies-search.mts`, which holds a server-side read token. |

QCC keeps its own branding and game navigation while adopting FrameXTV's media-library structure: a feature title, visible search, category filters, poster-led cards, horizontal discovery shelves, metadata labels, title details, and episode selection. Poster images are real TMDB artwork, not generated substitutes.

## Streaming-style redesign

The redesign's reference values were read from FrameXTV's public stylesheet and script as declared text. FrameXTV's anti-DevTools guard stopped its pages from rendering for automated inspection. We did not bypass it. The values are therefore declared, and they were not checked against a rendered page. They cover colours, sizes, radii, breakpoints, type sizes, motion and page structure. They are applied as tokens and `ui-` components in `src/theme.css`.

No FrameXTV code, CSS, icons, logo, wordmark, artwork or wording is used. The icons are inline SVG paths in `src/ui/icons.ts`. The interface is original work under the Mauri Study Notes brand. QCC is not affiliated with FrameXTV or TMDB.

Search uses a same-origin Netlify function backed by TMDB. It is paginated and can resolve title details and selected-season episodes on demand. Search text is sent only to the metadata service, never to a streaming server. A streaming server is contacted only when a viewer opens a play page, and after a failover, the next server. A server-side TMDB read token is required and is not bundled into client code.

The layout uses the breakpoints in `src/theme.css` (640, 768, 1024 and 1280 px). It follows reduced motion, reduced transparency, more contrast and forced colours.
