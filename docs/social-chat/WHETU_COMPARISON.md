# Whetū photo pipeline comparison

**Provenance.** QCC's photo module was first written from the issue #110 description, because the repository was not reachable. It has now been compared with the owner's private Whetū repository (`kiakura`), used with the owner's permission, at commit `9208032`. Whetū code is adapted, not copied wholesale: no `server-only`, no `@/` aliases, no React or Next, and none of the tutor-specific limits. The Whetū clone was read-only and nothing was pushed to it.

Citations: `W` = file:line in kiakura (`IP` = `lib/server/tutorUploads/imageProcessing.ts`, `IF` = `lib/server/tutorUploads/imageFormat.ts`, `L` = `lib/tutorUploads/limits.ts`, `C` = `lib/tutorUploads/client.ts`, `CR` = `lib/avatars/crop.ts`, `T` = `tests/tutorPhotoProcessing.test.ts`, `B` = `docs/benchmarks/tutor-photo-pipeline.json`). `Q` = file:line in this repo, after this change. QCC purpose policies (SPEC "Media pipeline") are kept wherever they differ from the tutor limits.

Status key: **Same**; **QCC differs** (reason given); **Missing in QCC** (ported = ported in this change with a failing test first); **QCC-only**.

| # | Behaviour | Whetū | QCC | Status |
| --- | --- | --- | --- | --- |
| 1 | Server validation order | `IF:142-160`: empty, byte ceiling, signature, MIME agreement, min side, max side/pixels; decode only after (`IP:45`) | `server.ts:36-41` (content-type gate, purpose, rate limit, body cap), then `process.ts:26-45` (empty, signature, header read, min side, max side/pixels), decode `process.ts:46-51` | QCC differs: same order of concerns, plus HTTP gates and a Sharp header read instead of a hand parser |
| 2 | Empty input | `IF:142` unreadable | `process.ts:26` corrupt (was `unsupported_type` before this change) | Missing in QCC (ported) |
| 3 | Byte ceiling before sniffing | 12 MiB, `IF:143`, `L:14` | 4 MiB, enforced on the stream not just `Content-Length`, `server.ts:14-28`, `policy.ts:10` | QCC differs: SPEC keeps uploads under the function body limit; the browser shrinks first |
| 4 | Accepted signatures | JPEG, PNG, WebP only; HEIC refused, `IF:115-131`, `L:10` | adds GIF, HEIF, AVIF, `sniff.ts:7-14` | QCC differs: SPEC accepts GIF and HEIC |
| 5 | Signature depth | Header structure must parse: JPEG SOF scan, PNG IHDR first with 13-byte body, WebP VP8/VP8L/VP8X start codes, `IF:59-111` | Magic bytes only, `sniff.ts:7-8`; Sharp then rejects a bad header (`process.test.ts:63`) | QCC differs: libvips does the structural check for all six formats |
| 6 | Declared MIME must match the bytes | Mismatch is `unsupported-type`, `IF:149` | Declared type is ignored; only `image/*` or octet-stream is required, `server.ts:36-37`; `server.test.ts:40` | QCC differs: SPEC says sniff and ignore the declared type; the output is always re-encoded, so a lying type cannot reach storage |
| 7 | Extension agreement | None on the server | None on the server | Same |
| 8 | Minimum side 16 px | `IF:28,150-152` unreadable | `policy.ts:14`, `process.ts:43` corrupt | Missing in QCC (ported) |
| 9 | Max side 10,000 px and 40 MP | `IF:25-27,153-158` too-large | `policy.ts:11-12`, `process.ts:45` `too_many_pixels` | Same (limits identical; code name differs, see #28) |
| 10 | How dimensions are read | Hand-parsed from the bytes in JS before Sharp loads, `IF:59-111` | `sharp().metadata()` with `limitInputPixels`, header only, `process.ts:41`. A crafted 20000x20000 PNG of under 1 KB is refused (`process.test.ts:116`) | QCC differs: covers GIF/HEIF/AVIF with no parser to maintain. Trade-off: Sharp loads before the refusal, and a header with no pixel chunk reports `corrupt`, not `too_many_pixels`. Neither allocates pixels |
| 11 | Orientation vs size limits | Declared size used as is (symmetric limits) | Same, comment at `process.ts:44` | Same |
| 12 | Decode options | `limitInputPixels: 40 MP`, `failOn: "error"`, `IP:45-48` | Same, `process.ts:31` | Same |
| 13 | Animated input | Not handled | `animated:false`, first frame only, `process.ts:31`, test `process.test.ts:70` | QCC-only |
| 14 | EXIF rotate | `.rotate()`, `IP:49` | `process.ts:47` | Same |
| 15 | Resize fit and kernel | `fit:"inside"`, `withoutEnlargement`, edge x edge, default kernel, `IP:50` | `process.ts:48`, default kernel | Same |
| 16 | Square cover crop | None on the server (crop is in the browser, `CR`) | `fit:'cover'`, `position:'attention'` for avatars, `process.ts:48` | QCC-only |
| 17 | Colour space | No explicit handling; Sharp converts to sRGB and drops the profile | Same, test `process.test.ts:132` | Same |
| 18 | Metadata strip | No `withMetadata`, `IP:15-17,51`; test `T:39-51` | `process.ts:49`; tests `process.test.ts:13-28` | Same |
| 19 | Output format | WebP, effort 4, `IP:51` | `process.ts:49` | Same |
| 20 | Quality ladder | 82, 76, 70, `IP:38` | `policy.ts:9` | Same |
| 21 | Ladder search | Full edge only until target max is met (`IP:64-69`); if still over, accept the q70 result under the hard ceiling (`IP:72-74`); only then floor edge at q70 only (`IP:76-79`) | Full edge ladder, then floor edge with the full ladder; first result within target wins, else the smallest within the hard maximum, `process.ts:52-60` | QCC differs: SPEC says reduce toward the floor to hit the target. Whetū keeps full edge whenever it is under the ceiling, so QCC gives up 1600 px sooner (pure noise: 1280 px, 529 KB) |
| 22 | Target size | `{min:200K,max:500K}`; only `max` is used, `L:17`, `IP:66` | `targetBytes` per purpose, post 500 KiB, `policy.ts:4` | Same |
| 23 | Hard size ceiling | 1 MiB, `L:16`, `IP:72,77` | Per purpose: post/snap 1 MiB, avatar 150 KiB, banner 600 KiB, `policy.ts:4-7` | QCC differs: SPEC purpose maxima |
| 24 | Edge and floor | 1600 / 1280, `L:20,22` | post 1600/1280 (same); snap 1440/1080, avatar 256, banner 1600/1200, `policy.ts:4-7` | QCC differs: SPEC purposes |
| 25 | Result metadata | Returns `quality` and `edgePx` with the bytes, `IP:29-35` | `process.ts:15,68` (added; used by tests and the benchmark) | Missing in QCC (ported) |
| 26 | Thumbnails | None | 480/640/96 px variants, `process.ts:61-67` | QCC-only |
| 27 | Size failure | `PhotoProcessingError("too-large")`, `IP:80` | `cannot_compress`, `process.ts:60` | QCC differs: separate code, same behaviour |
| 28 | Error codes | `too-large`, `unreadable` (`IP:23`); `unsupported-type`, `unreadable`, `too-large` (`IF:30`) | `unsupported_type`, `too_large`, `too_many_pixels`, `corrupt`, `cannot_compress`, `process.ts:3`; HTTP status map `server.ts:11` | QCC differs: finer split for the UI and HTTP statuses |
| 29 | Error messages | Fixed student-facing lines, brand-specific, `L:56-70` | Fixed lines, `process.ts:4-11` | QCC differs: wording is QCC's own |
| 30 | Decoder text never surfaced | `IP:54-58` (comment says why) | `wrap`, `process.ts:33-40`; test `process.test.ts:108` | Same |
| 31 | HEIC on the server | Refused as unsupported, `IF:14-15` | Friendly `HEIC_MESSAGE` when Sharp cannot decode it, `process.ts:11,37` | QCC differs: SPEC lets a Sharp build with HEIC support decode it |
| 32 | Lazy Sharp import | Dynamic import per call so a route does not depend on the native binary, `IP:41-43` | Memoised dynamic import, `process.ts:17-21` | Same |
| 33 | Sharp tuning | None | `cache(false)`, `concurrency(1)`, `process.ts:19` | QCC-only |
| 34 | `server-only` and `@/` imports | Next-specific, `IP:1,3-9`, `IF:1,3-6` | Plain relative imports | QCC differs: not applicable (Vite/vanilla) |
| 35 | Server processing timeout | None in these files | None | Same |
| 36 | Client screening order | HEIC first, then type not accepted, then size, then empty, `C:184-191`; HEIC with no type detected by extension, `C:186` | `plan.ts:17-23` (type, then size, then empty; extension only when the type is empty), used at `client.ts:19-22` | Missing in QCC (ported) |
| 37 | Client original size cap | 12 MiB, `C:190` | 20 MiB, `plan.ts:8`; stops the browser decoding a huge file | Missing in QCC (ported); the 20 MiB value is QCC's own estimate, not Whetū's (12 MiB, tied to its bucket). It only bounds browser decode work; the upload after shrinking is still capped at 4 MiB |
| 38 | Empty file | `unreadable`, `C:191` | `client.ts:22` | Missing in QCC (ported) |
| 39 | Size check after shrink | `C:193` | Encode loop throws `TOO_BIG_PHOTO`, `client.ts:52-57` | Same |
| 40 | Decode upright | `createImageBitmap(file,{imageOrientation:"from-image"})`, null on failure, `C:135-141` | `client.ts:25` | Same |
| 41 | Client max edge | One constant 1600, `C:145` | Per purpose, `client.ts:28` | QCC differs: SPEC purposes |
| 42 | Fit without enlarging | `fittedSize`, `C:120-128` | `fitWithin`, `src/apps/image.ts:2-7` (identical, plus NaN guard) | Same |
| 43 | Square purposes | Not needed (crop is separate) | `fitForPurpose` keeps the short side at 256 so the server crop does not upscale, `plan.ts:34-39`, `client.ts:31`. Before: an 800x500 avatar was shrunk to 256x160, then the server's cover crop enlarged it | QCC-only (defect found during comparison, fixed with a test). Long side capped at 4x so a 30000x300 image cannot make a huge canvas (`plan.ts:34-42`) |
| 44 | White under the photo | Always, `C:151-153` | `encodeAttempts` draws every JPEG on white, `plan.ts:41-43`. Before, only alpha-source fallbacks did, so a transparent AVIF came out black | Missing in QCC (ported) |
| 45 | JPEG quality 0.9 | `C:114` | First attempt, `plan.ts:42` | Same |
| 46 | PNG kept for transparent sources, 0.8/0.7 JPEG steps | None; always JPEG 0.9 | `plan.ts:41-43`, `client.ts:51-57` | QCC-only |
| 47 | Canvas pixel cap 16 MP | None | `client.ts:11,32-35` | QCC-only |
| 48 | Keep small compatible originals | Fits the edge and is 1 MiB or less: sent unchanged, `C:111,171-172` | `canSendAsIs`, `plan.ts:25-28`, `client.ts:30`. Only JPEG, PNG, WebP, GIF pass through (HEIC/AVIF always re-encode); avatars judged by short side, and not passed through if the long side exceeds 4x | Missing in QCC (ported). Deliberate deviations: GIF also passes through (Whetū: JPEG, PNG, WebP only; the server keeps the first frame), and the avatar rule |
| 49 | Browser cannot decode | Send the original, the server judges, `C:168-169` | `fallback`, `client.ts:23-25` (only if 4 MiB or less) | Same |
| 50 | HEIC in the browser | Convert to JPEG where decodable; otherwise refuse with `heic-not-decodable`, never sent as HEIC, `C:186-208` | Converts where decodable (same path as any image). Otherwise the original goes to the server, which answers `HEIC_MESSAGE` (SPEC step 1) | QCC differs: SPEC; the server stays authoritative |
| 51 | Upload progress | XHR `upload.onprogress`, `C:86-88` | `client.ts:73` (clamped to 1) | Same |
| 52 | Compress stage | None | `UploadStage` includes `compressing`, `client.ts:5` | QCC-only |
| 53 | Reading progress and poll (110 x 1.5 s) | `C:54-56,237-256` | None: there is no AI reading step | QCC differs: not applicable |
| 54 | Cancellation | `AbortSignal` aborts the XHR and reports `upload-failed`; checks the signal between polls, `C:103,244,268` | `AbortError` (not a failure), checked at every stage, `client.ts:12-13,65,88` | QCC differs: cancel is distinguishable from an error |
| 55 | Retry | Server-side re-read of a kept photo; `photoId` carried on the error, `C:21,259-294,335-345` | Retry button restarts prepare and upload, `src/apps/upload-chip.ts` (`start()`); nothing exists on the server until an upload succeeds | QCC differs: not applicable |
| 56 | Upload timeout | None | 60 s, `client.ts:72,86` | QCC-only |
| 57 | Server refusal mapping | 5xx gives a fixed `upload-failed` line, 429/400/413 use codes, `C:219-231` | `errorFromBody`, `src/apps/api.ts:35-44` (QCC's own fixed messages; 429 gets a rate-limit line) | QCC differs: same intent, different table |
| 58 | Network error | `upload-failed`, `C:101-102` | `NETWORK_MESSAGE`, `client.ts:85` | Same |
| 59 | Injectable transport | `PhotoTransport`, `C:36-52` | `options.xhr`, `client.ts:61-63`, tested in `tests/apps/clients.test.ts` | Same |
| 60 | Sent content type | Prepared file's type, `C:85,194` | `blob.type`, `client.ts:70` | Same |
| 61 | Tutor-only limits and API (2 photos per message, 20 per conversation, retention, attempts, reading kinds, corrections, delete) | `L:24-51,78-123`, `C:296-389` | Not copied, per the issue | QCC differs: not applicable |
| 62 | Avatar crop | Browser centre crop with zoom to 256x256, WebP 0.88, refuses over 1 MiB or a non-WebP result, `CR:2-31` | No browser crop. Client shrinks to a 256 short side (#43); the server crops (`cover`, `attention`) and runs the ladder to 100 KiB / 150 KiB | QCC differs: see Avatar decision below |
| 63 | Test: EXIF orientation applied | `T:26-37` | `process.test.ts:13-28` | Same |
| 64 | Test: camera metadata removed | `T:39-51` | `process.test.ts:13-28` | Same |
| 65 | Test: smooth page at q82, full edge, in target | `T:53-64` | `process.test.ts:89-94` | Missing in QCC (ported) |
| 66 | Test: small photo never enlarged | `T:66-75` | `process.test.ts:30,95` | Same |
| 67 | Test: noisy photo under the ceiling and above the floor | `T:77-87` | `process.test.ts:99-107` (passes at 1280 px, q70, which is #21) | Missing in QCC (ported) |
| 68 | Test: corrupt data gives a fixed reason | `T:89-99` | `process.test.ts:108-115` | Missing in QCC (ported) |
| 69 | Benchmark scenarios and fields | 5 phone-like scenarios; per row original/copy bytes and dims, quality, edge, within target and ceiling, `B:1-70` | `scripts/media-benchmark.mjs`, 7 scenarios with the same fields | Missing in QCC (ported) |
| 70 | Benchmark times validation separately | `validateMs` and `processMs`, `B` | `validateMs` (sniff plus header read) and `processMs` (median of 3) | Missing in QCC (ported) |
| 71 | Benchmark environment | Records Node version and time only | Also records Sharp version, CPU count, platform, and states cloud container, not a phone, `MEDIA_BENCHMARK.md:3` | QCC-only |

## Avatar decision

Whetū crops in the browser only because its UI has a zoom control, so the user picks the framing. QCC's settings screen offers a "Change photo" button and no zoom or reposition control (`src/social/screens/settings.ts:128-142`), so a browser crop would add a step with no input to it. The server must stay authoritative anyway, and `canvas.toBlob("image/webp")` is not available in every browser (Whetū's crop throws if it is not, `CR:24-26`). So QCC does not add a browser crop. The server's `cover` + `attention` crop to 256x256 and WebP ladder stay as they are, and the browser step now shrinks avatars to a 256 px short side, so the crop is never an upscale. If a zoom control is added later, a Whetū-style crop could feed this same pipeline and the server would still re-crop and re-encode.

## What was ported

Server: empty body refused (#2), 16 px minimum side (#8), `quality` and `edgePx` on the result (#25). Browser (`src/media/plan.ts`, used by `src/media/client.ts`): screening by type, size and emptiness (#36-38), small-original pass-through (#48), white under every JPEG (#44), and the avatar short-side fit (#43). Tests: `tests/media/plan.test.ts`, `tests/media/client.spec.ts` (Playwright: pass-through, shrink, avatar short side, empty file in a real browser), a small-original EXIF/GPS case in `process.test.ts` and `server.test.ts`, and the Whetū acceptance cases in `tests/media/process.test.ts`. Benchmark script and doc: #69-70.

## Not ported, deliberately

Hand-written header parsers (#5, #10), MIME agreement (#6), refusing HEIC (#4, #31, #50), the tutor reading, retry and quota code (#53, #55, #61), Whetū's "full edge whenever under the ceiling" rule (#21), and the browser avatar crop (#62). Each follows a SPEC decision or has no counterpart in QCC.
