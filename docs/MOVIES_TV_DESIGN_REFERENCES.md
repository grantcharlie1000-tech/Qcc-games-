# Movies & TV design references

Reviewed on 2026-10-26 after the request to base the catalog interface on FrameXTV.

| Reference | Applied design |
| --- | --- |
| [FrameXTV Movies](https://framextv.xyz/movies) | The requested `.xyz` address redirects to FrameXTV's `.cc` catalog. It has full-width feature artwork, compact section navigation, searchable movie/TV catalog, curated horizontal rows, genre discovery, and concise type/rating/year metadata. Its catalog labels sections such as Trending Movies, Popular Movies, In Theaters, Sci-Fi, Horror, and Thrillers. |
| [FrameXTV API & Embed Documentation](https://framextv.xyz/api) | The requested `.xyz` address redirects to the `.cc` documentation. Standard movie and episode iframe routes use TMDB IDs. The published API describes iframe embeds and player postMessage controls; it does not document a catalog/search REST endpoint. |
| [TMDB search and discovery guide](https://developer.themoviedb.org/docs/finding-data) | Search and discovery provide the metadata index for the complete catalog rather than relying on a small checked-in sample. |

QCC keeps its own branding and game navigation while adopting FrameXTV's media-library structure: a feature title, visible search, category filters, poster-led cards, horizontal discovery shelves, metadata labels, title details, and episode selection. Poster images are real TMDB artwork, not generated substitutes.

Search uses a same-origin Netlify function backed by TMDB. It is paginated and can resolve title details and selected-season episodes on demand. Search text is sent only to the metadata service, never to FrameXTV; FrameXTV is contacted only when the user opens its playback iframe. A server-side TMDB read token is required and is not bundled into client code.

The layout keeps the existing reduced-motion behavior and responsive desktop, Chromebook, and mobile breakpoints. QCC is not affiliated with FrameXTV or TMDB.
