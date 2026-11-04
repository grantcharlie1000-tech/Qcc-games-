# Media pipeline benchmark

**These numbers come from a cloud container (4 vCPU, linux-x64, Node v22.23.4, sharp 0.35.5, `sharp.concurrency(1)`, `sharp.cache(false)`), not from a phone and not from a deployed Netlify function.** They time the server step only. The browser shrink step (`createImageBitmap` + canvas) was not measured here. A serverless function with less CPU will be slower, and a phone's JPEG decode and canvas encode time is unknown.

Measured with `node scripts/media-benchmark.mjs` on 2026-11-04. The method follows the Whetū benchmark (`docs/benchmarks/tutor-photo-pipeline.json` in kiakura, commit 9208032): several phone-like scenarios, header validation timed separately from processing, and every row records the quality step, the edge, and whether the copy met the target and the hard maximum. Differences from Whetū's run: QCC reports the median of three runs per row (Whetū's file shows one value), and its `process` time includes the thumbnail encode, which Whetū has no equivalent of. All fixtures are generated in the script (a ruled page of text-like blocks with paper grain, plus noise and screenshot-like images); Whetū's fixtures are not available, so the original byte sizes differ from its table.

- **Validate** = `sniffFormat` plus Sharp's header read (`metadata()` with the 40 MP limit). No pixels are decoded.
- **Process** = the whole `processImage(input,'post')` call: validate, the full-size WebP encode through the quality ladder, and the 480 px thumbnail encode.
- Targets for `post`: 500 KiB target, 1 MiB hard maximum.

| Scenario | Original dims | Original bytes | Validate (ms) | Process runs (ms) | Median process (ms) | Full copy | Thumb | Quality @ edge | In target | In max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 12 MP phone JPEG, clean page | 4032x3024 | 940,946 | 0.88 | 342, 376, 331 | 342 | 110,564 B, 1600x1200 | 42,344 B | 82 @ 1600 | yes | yes |
| 12 MP phone JPEG, textured page | 4032x3024 | 3,742,748 | 0.72 | 440, 442, 452 | 442 | 183,850 B, 1600x1200 | 42,408 B | 82 @ 1600 | yes | yes |
| 12 MP phone PNG, clean page | 4032x3024 | 6,159,683 | 0.54 | 424, 403, 383 | 403 | 110,752 B, 1600x1200 | 42,316 B | 82 @ 1600 | yes | yes |
| 1920x1440 JPEG, clean page | 1920x1440 | 214,217 | 0.76 | 249, 226, 220 | 226 | 34,424 B, 1600x1200 | 6,866 B | 82 @ 1600 | yes | yes |
| 800x600 JPEG, clean page | 800x600 | 37,389 | 0.65 | 71, 71, 78 | 71 | 3,648 B, 800x600 | 3,918 B | 82 @ 1600 | yes | yes |
| 4000x3000 noisy JPEG (blurred random noise, q90) | 4000x3000 | 2,625,273 | 0.70 | 435, 455, 497 | 455 | 426,942 B, 1600x1200 | 8,076 B | 82 @ 1600 | yes | yes |
| 3000x4000 screenshot-like PNG | 3000x4000 | 175,168 | 0.53 | 249, 249, 250 | 249 | 60,338 B, 1200x1600 | 24,778 B | 82 @ 1600 | yes | yes |

The 12 MP PNG row is 6.1 MB, over the 4 MiB transport limit. In the app the browser shrinks it first, so the server would never receive that file; it is timed here only to match Whetū's PNG scenario.

Every row above was accepted at the first quality step, so these are best-case encode times. The worst case measured (ad hoc, same machine): 2000x1500 JPEG of pure random noise, 3.05 MB in. It missed the 500 KiB target at every step of the full edge, fell back to the 1280 px floor, and returned 529,306 B at quality 70 and 1280x960, after about 2.5 s (2,439 / 2,503 / 2,580 ms over three runs). Whetū's ladder would instead stop at full edge when under its 1 MiB ceiling; see `WHETU_COMPARISON.md`.
