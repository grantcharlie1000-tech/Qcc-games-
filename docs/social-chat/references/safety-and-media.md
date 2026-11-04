# QCC Social and QCC Chat: Safety and Media Reference Pack

Status: research notes only. No app code. Audience: the engineers and reviewers building the MVP.

## Source status (read first)

Web access was partial when this pack was compiled (2026-11-04).

- **Fetched and verified:** Sharp API pages (`api-operation`, `api-input`, `api-constructor`, `api-output`, `api-resize`, `performance`, `install`), and the OWASP API Security Top 10 2023 list (after a redirect).
- **Search snippets only:** the eSafety Safety by Design overview, the NZ Harmful Digital Communications Act (HDCA) principles, and the Privacy Act 2020 principles.
- **Blocked (403 or 503):** the ICO Age Appropriate Design Code page, the eSafety SbD principles PDF, and the NZ legislation.govt.nz pages.
- **Knowledge-based (unverified this session):** the ICO 15 standards list, the HDCA ten principles, the Privacy Act 13 IPP names, iOS canvas limits, browser upload-progress behaviour, Vercel and Netlify packaging notes, and HEIC/HEIF caveats. Re-check each against the official source before relying on it.

---

## 1. Threat model for teen social and chat

Assumptions: users are 13 to 18, accounts are username-only, there is no real-name requirement, and there is no location data. The MVP has no public DMs.

| Threat | What it looks like | MVP mitigations |
| --- | --- | --- |
| Grooming via DMs | An adult builds trust, moves the chat off-platform, asks for images or meetings | Friend-only 1:1 chat (both sides accept). Friend requests from accounts with no shared activity are rate-limited. No DMs from non-friends at all. Report and block on every chat. Keyword and link flags for review (not auto-deleting). Never display age, school, or location. |
| Harassment and pile-ons | Many accounts target one user in replies or DMs | Per-user reply and mention rate limits. Block removes the blocked user from all of the target's surfaces. Report thresholds auto-hide a post pending review. A "limit replies" setting on posts is a later option. |
| Spam and flooding | Bots post or message in bulk | Per-account and per-IP rate limits (see section 6). New-account throttles (lower limits for the first 24 to 72 hours). Duplicate-content check on posts. Captcha or proof-of-work only after abuse signals. |
| Impersonation | Copied usernames, display names that look like staff or friends | Unique usernames with a normalised form for comparison (case, confusables, look-alike characters). Block reserved names (`qcc`, `admin`, `support`, `moderator`). No avatar upload in MVP, or a moderated avatar set. |
| Doxxing and private info sharing | Phone numbers, addresses, school names posted in text or images | No location, school, or phone fields. Text heuristics on posts and chat (phone and address patterns) that flag for review. EXIF stripping on every upload (see section 3). |
| Image abuse (nudity, non-consensual images) | Explicit images sent in DMs or posted publicly | Image uploads limited to posts in MVP, or to chat only when the recipient is a confirmed friend. Strict MIME and signature checks. Hash-matching against known-bad lists if a provider is available. Report flow on every image. Fast removal and audit trail. Treat any sexual content involving under-18s as a mandatory reporting event; follow legal advice. |
| Self-harm content | Posts or DMs encouraging or describing self-harm | Keyword and phrase flags routed to a human queue. Show support resources in the report flow and in a prompt when a user searches or posts a flagged phrase (wording reviewed by a safety adviser). Do not auto-delete a distressed user's post without a human look. |
| Account takeover | Credential stuffing, reused passwords, session theft | Hashed passwords (argon2id or bcrypt). Rate-limit login per account and per IP. Generic error messages. Secure, httpOnly session cookies with a short idle timeout. Log sign-ins. Optional email or parent contact recovery (decide later). |
| User enumeration | Attackers probe which usernames or friend lists exist | Uniform responses for "user not found" and "friend request sent". Rate-limit username lookups. Do not expose friend lists to non-friends. Return the same timing for existing and missing accounts where practical. |
| Scraping | Bulk download of posts, profiles, and friend graphs | Authenticated-only reads for profiles and feeds. Pagination caps. Per-session read quotas. Do not expose sequential IDs in URLs for private objects (use opaque IDs). |
| Broken object-level access | A user changes an ID and reads someone else's DM | Server-side checks on every object read and write (see section 2.4). |

### Moderation controls to build in from day one

- **Report threshold rule:** when N distinct, non-related reporters report the same post within a window, auto-hide it pending review. Start with N = 3 within 24 hours and tune. Reporters who report repeatedly without cause lose weight.
- **Auto-hide is reversible:** hidden content is only hidden from others. The author sees a notice and can appeal.
- **Moderation audit trail:** every moderator action writes an immutable row (who, what, when, why, before and after state). Include the report IDs that led to the action.
- **No public DMs:** no discovery of chat endpoints for non-friends, no "message anyone" button.
- **Block is total:** blocking hides the blocker and blocked user from each other's posts, replies, friend list, and search, and cancels any pending requests.

---

## 2. Relevant guidance (summaries in our own words)

### 2.1 UK ICO Age Appropriate Design Code (Children's Code)

Status: knowledge-based (ICO page blocked). Official page: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/

The code is a statutory code of practice under the UK Data Protection Act 2018 for online services likely to be accessed by children. It is relevant to us because our users are under 18 and the UK is a plausible audience for a browser game. It sets 15 standards:

| # | Standard (short name) | One-line gist |
| --- | --- | --- |
| 1 | Best interests of the child | Child's best interests come first in design. |
| 2 | Data protection impact assessments | Assess risks to children before launch and during change. |
| 3 | Age appropriate application | Apply the code by risk-based age assurance, or treat everyone as a child. |
| 4 | Transparency | Explain data use in terms a child can understand. |
| 5 | Detrimental use of data | Do not use child data in ways that harm wellbeing. |
| 6 | Policies and community standards | Enforce your own published standards. |
| 7 | Default settings | Use high-privacy defaults for children. |
| 8 | Data minimisation | Collect only what you need. |
| 9 | Data sharing | Do not share child data without a strong reason. |
| 10 | Geolocation | Switch off precise location by default; hide it clearly. |
| 11 | Parental controls | Tell children when parental monitoring is on. |
| 12 | Profiling | Switch off profiling by default. |
| 13 | Nudge techniques | Do not use dark patterns to weaken privacy choices. |
| 14 | Connected toys and devices | Applies to physical connected products. Not relevant to us. |
| 15 | Online tools | Give children easy tools to exercise their data rights. |

Practical takeaways for us: no location, no profiling for feed ranking in MVP (chronological or simple ranking), privacy-on defaults, a clear report and delete-my-data tool.

### 2.2 NZ Privacy Act 2020 (basics)

Status: knowledge-based. Reference: https://www.legislation.govt.nz/act/public/2020/0031/latest/LMS23223.html (blocked for this session) and https://www.privacy.org.nz/privacy-act-2020/privacy-principles/ (search snippet only).

- Applies to agencies (organisations and businesses) that collect or hold personal information, which means information about an identifiable person.
- Came into force 1 December 2020. It replaces the 1993 Act.
- Sets 13 Information Privacy Principles (IPPs). Short names: 1 purpose of collection; 2 source; 3 collection notice; 4 manner of collection; 5 storage and security; 6 access; 7 correction; 8 accuracy before use; 9 retention; 10 use limits; 11 disclosure limits; 12 cross-border disclosure; 13 unique identifiers.
- Notifiable privacy breaches: a breach that is likely to cause serious harm must be reported to the Privacy Commissioner and affected people. Keep an incident log.
- Practical takeaways: collect only usernames, passwords (hashed), and what users post. State why. Keep retention rules (section 7). Give users access and correction. Plan a breach runbook before launch.

Note: some older guides count the IPPs differently. Check the current text.

### 2.3 NZ Harmful Digital Communications Act 2015 (HDCA)

Status: structure from search snippets; the ten principles are knowledge-based. Reference: https://www.legislation.govt.nz/act/public/2015/0063/latest/DLM5711810.html (blocked) and https://netsafe.org.nz/ (search snippet).

- Purpose: deter, prevent, and mitigate harm caused by digital communications, and provide a quick way to remove harmful content.
- Section 6 sets ten communication principles. The known ones include: no disclosure of sensitive personal facts; no threatening, intimidating, or menacing content; no sexually explicit or intimate recordings shared without consent; no indecent or obscene content; no harassment; no false allegations; no breach of confidence; no incitement to suicide; no denigration on protected grounds (race, religion, gender, sexual orientation, disability, and similar); no incitement to send harmful messages. Verify exact wording on NZLII.
- Netsafe is the designated "Approved Agency" that takes complaints and tries to resolve them. It cannot compel platforms and cannot unmask anonymous users. Serious cases go to the District Court for orders (takedown, cease and desist, etc.). A 2022 amendment added non-consensual posting of intimate visual recordings.
- Practical takeaways: our report flow should preserve evidence (store the reported content snapshot and metadata) so a user can take it to Netsafe. Keep a takedown process that acts quickly. Provide a clear path to Netsafe in the help text. Keep moderation logs for lawful requests.

### 2.4 eSafety Commissioner Safety by Design (Australia, applied as good practice)

Status: principles from search snippet (official pages blocked). Reference: https://www.esafety.gov.au/industry/safety-by-design and https://www.esafety.gov.au/sites/default/files/2019-10/SBD%20-%20%20Principles.pdf.

eSafety frames Safety by Design around three principles:

1. **Service provider responsibility:** put user safety into the product from the start. Name someone accountable for safety policy and its operation. Set escalation paths for user concerns. Detect, flag, and remove illegal and harmful content.
2. **User empowerment and autonomy:** give users controls (block, mute, privacy settings, report), clear policies, and informed choices. Keep defaults safe.
3. **Transparency and accountability:** publish policies, report on enforcement, and keep records that show decisions can be reviewed.

eSafety also publishes six "foundations" for embedding safety in culture, policy, and design. Check the current industry pages before citing details.

Practical takeaways: name a safety owner in the team doc. Build block, mute, and report before launch. Publish community guidelines. Keep moderation audit logs.

### 2.5 OWASP API Security Top 10 (2023)

Status: list verified via fetch after redirect. Reference: https://owasp.org/API-Security/editions/2023/en/0x11-t10/ (redirects to https://api-security.owasp.org/editions/2023/en/0x11-t10).

The 2023 list:

| ID | Title |
| --- | --- |
| API1 | Broken Object Level Authorization (BOLA) |
| API2 | Broken Authentication |
| API3 | Broken Object Property Level Authorization |
| API4 | Unrestricted Resource Consumption |
| API5 | Broken Function Level Authorization |
| API6 | Unrestricted Access to Sensitive Business Flows |
| API7 | Server Side Request Forgery |
| API8 | Security Misconfiguration |
| API9 | Improper Inventory Management |
| API10 | Unsafe Consumption of APIs |

**BOLA (API1), the most relevant item for us.** Any endpoint that takes an object ID (conversation, message, post, image) must check on the server that the caller is allowed to access that exact object. Checking only that the user is logged in is not enough.

Concrete rules for QCC Chat:

- `GET /conversations/:id/messages` must confirm the caller is one of the two participants of conversation `:id`. Do this query server-side: `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`, and return 404 if no row, so existence is not leaked.
- Do not trust a client-supplied `recipient_id` for access. Check that the two users are friends (accepted, not blocked in either direction) at the moment of sending, and again if the conversation is opened.
- Use opaque IDs (UUIDs or random IDs), not sequential integers, for conversations and messages.
- Apply the same checks to edit, delete, react, and report endpoints.
- Property-level (API3): do not return fields such as `email`, `last_seen_ip`, or moderation notes in the public profile DTO. Use an allow-list response shape.
- Resource consumption (API4): see section 6.
- Function-level (API5): admin and moderator routes need role checks on the server, not just hidden UI.

---

## 3. Server-side image processing with Sharp

Source: https://sharp.pixelplumbing.com/ (API pages verified; install page verified; some sections knowledge-based).

### 3.1 Pipeline outline

1. Receive upload (size-capped at the request layer).
2. Sniff magic bytes (section 4). Reject unknown types before decoding.
3. Decode with Sharp using safety options: `limitInputPixels` default, `failOn` default, `animated: false` unless needed.
4. `.rotate()` with no arguments, first in the chain, to apply EXIF orientation.
5. `.resize({ width, height, fit: 'inside', withoutEnlargement: true })`.
6. Encode to WebP (or AVIF) with explicit quality and effort.
7. Do not call `withMetadata()` or `keepMetadata()`. Output strips metadata by default.
8. Write only the processed buffer to storage. Store width, height, and byte size in the DB, not the original.

### 3.2 Key API facts (verified unless marked)

| Topic | Behaviour |
| --- | --- |
| `.rotate()` with no args | Auto-orients using EXIF. Must come first. Later rotate calls are ignored (except this one). |
| `.rotate(angle)` | Angle is normalised to positive. Non-90 multiples use the `background` option (default black). |
| Call order | `.rotate(x).extract(y)` differs from `.extract(y).rotate(x)`. Put orientation first. |
| Metadata default | `toBuffer` and `toFile` remove all metadata, including the EXIF orientation tag. This is why `rotate()` must run before output, and why we keep `rotate()` in the chain. |
| `keepMetadata()` | Keeps EXIF, ICC, XMP, IPTC. Do not use for user uploads (location, device data). |
| `withMetadata()` | Keeps most metadata and adds an sRGB profile. Also avoid for user uploads. |
| `withExif()` | Writes only the EXIF you supply. Use only if we add our own tags, which we do not plan to. |
| `limitInputPixels` | Default 268402689 (0x3FFF x 0x3FFF). Inputs above width x height are rejected. `0` or `false` disables the limit; do not disable. |
| `failOn` | Default `'warning'`, the most sensitive. Levels from least to most sensitive: `none`, `truncated`, `error`, `warning`. Invalid metadata always aborts. The docs recommend the default for untrusted input. |
| `pages` / `animated` | Default `pages: 1`. `pages: -1` (or `animated: true`) reads all frames of GIF, WebP, or TIFF input. Multi-frame output is stacked vertically. |
| `unlimited` | Default false. Setting true disables memory guards for JPEG, PNG, SVG, and HEIF. Never set it for user uploads. |
| `fit: 'inside'` | Scales to fit inside the box, keeping aspect ratio. Combine with `withoutEnlargement: true` so small images are not upscaled. |
| Other fits | `cover` (default, crops), `contain` (pads), `fill` (stretches), `outside` (fills and may exceed). For posts use `inside`. |
| WebP `quality` | 1 to 100, default 80. Start at 80 for photos. |
| WebP `effort` | 0 (fastest) to 6 (slowest), default 4. Use 4 for a serverless timeout budget. |
| WebP `smartSubsample` | Default false. Set true for better chroma quality at a small cost. |
| `sharp.concurrency()` | Threads per image. Defaults to the core count, but glibc Linux without jemalloc may default to 1. In serverless, set explicitly (often 1). |
| `sharp.cache(false)` | libvips caching is on by default. In serverless, consider `sharp.cache(false)` to lower steady-state memory. Benchmark before choosing. |
| `UV_THREADPOOL_SIZE` | libuv pool default 4. Limits parallel images in one process. |
| `MALLOC_ARENA_MAX` | On glibc Linux, set to 2 or 4 before Node starts to reduce memory fragmentation. |

### 3.3 Animated GIF handling

- MVP default: read only the first frame (`pages: 1`) and output a static WebP. This avoids large memory use and hides animation-based abuse.
- If animated GIF support is wanted later: cap frame count and total pixels, and enforce a file size budget. Output animated WebP with `loop` and `delay` set explicitly. `interFrameMaxError` enables lossy size reduction. `keepDuplicateFrames` defaults to false.
- Reject GIFs above the frame cap instead of truncating silently.

### 3.4 HEIC and HEIF caveats

- The Sharp install page lists prebuilt input formats as JPEG, PNG, WebP, AVIF, TIFF, GIF, SVG, and Ultra HDR. HEIC/HEIF is not listed as a guaranteed prebuilt input.
- HEIF support depends on how libvips was built (libheif and a codec). Do not promise HEIC support. Check at startup with `sharp.format.heif.input.file` and reject HEIC if it is not available.
- Practical choice for MVP: accept JPEG, PNG, WebP, GIF (first frame), and AVIF. Ask iPhone users to upload JPEG (iOS Photos converts on share by default). Show a clear error for HEIC.
- Do not set `unlimited` to get HEIF decoding past the memory guard.

### 3.5 Deploying Sharp on serverless (Lambda, Vercel, Netlify)

- The install page confirms that `node_modules` must contain the right binary for the target architecture. Build on a different machine with cross-platform install flags, for example `npm install --os=linux --cpu=x64 sharp`.
- linux-x64 prebuilt requires glibc 2.28 or newer (or musl 1.2.5 or newer) and a CPU with SSE4.2.
- Lambda: more memory means more CPU. The docs cite about 12x more CPU at 1536 MB than at 128 MB. Pick memory with image size in mind.
- Symbolic links are not supported in Lambda packages.
- Vercel and Netlify (knowledge-based; check their current docs): keep `sharp` as an external dependency so the bundler does not try to inline the native binary. Confirm the function includes the linux-x64 binary in its trace. Use a lazy import inside the upload handler so cold-start for other routes is not slowed.
- Lazy import pattern: `const sharp = (await import('sharp')).default` inside the handler, not at module top level, so the module is only loaded for upload routes.
- Set `sharp.concurrency(1)` and `sharp.cache(false)` at the start of the upload handler unless benchmarks say otherwise.
- Font handling (`FONTCONFIG_PATH`) applies only to SVG text rendering. We do not accept SVG uploads.
- SVG uploads: do not accept them. SVG can carry scripts and external references.

---

## 4. File signature sniffing (magic bytes)

Check the first bytes of the uploaded buffer. Never trust the `Content-Type` header or the file extension.

| Format | Signature (hex) | Notes |
| --- | --- | --- |
| JPEG | `FF D8 FF` | Third byte varies (E0, E1, DB, and others). |
| PNG | `89 50 4E 47 0D 0A 1A 0A` | Eight bytes. |
| GIF | ASCII `GIF87a` or `GIF89a` | Six bytes. |
| WebP | `52 49 46 46` ("RIFF") at 0, then `57 45 42 50` ("WEBP") at offset 8 | Bytes 4 to 7 hold the RIFF size. |
| HEIC / HEIF | ASCII `ftyp` at offset 4, then brand: `heic`, `heix`, `heim`, `heis`, `hevc`, `mif1`, `msf1` | Recognise so we can reject with a clear message. |
| AVIF | `ftyp` at offset 4, then brand `avif` or `avis` | AVIF is an ISO BMFF container. |
| TIFF (not accepted) | `49 49 2A 00` or `4D 4D 00 2A` | Reject. |
| SVG (not accepted) | Text starting with `<svg` or `<?xml` | Reject. |

### Sniff rules

1. Read the first 16 to 32 bytes. Check the signature against an allow-list.
2. Check the declared type matches the signature family. Reject mismatches.
3. Run Sharp's own metadata read after sniffing, with `failOn: 'warning'`. Reject on error.
4. Enforce a size cap before decoding (for example 8 MB in the request handler, lower for chat).

### Polyglot and container risks

- A file can satisfy one signature and carry data another parser interprets (for example, a JPEG with an appended ZIP or HTML). Re-encoding through Sharp removes trailing data, which is why we re-encode and store only Sharp's output.
- Do not serve original bytes. Serve the processed WebP with `Content-Type: image/webp` and `X-Content-Type-Options: nosniff`.
- Do not store uploads under a user-controlled filename. Use generated keys.

---

## 5. Browser-side pre-compression

Purpose: smaller uploads, faster on mobile data, fewer server-side decode costs. The server still re-processes everything (section 3). Browser work is an optimisation, never a security control.

### 5.1 Decoding and orientation

- `createImageBitmap(file, { imageOrientation: 'from-image' })` applies EXIF orientation in modern browsers. Older Safari versions may not honour this option, so test on iOS.
- Read the image's dimensions before decoding. Refuse huge inputs (for example, over 40 megapixels) before allocating memory.
- Release bitmaps with `bitmap.close()` after use.

### 5.2 Resizing and encoding

- Draw into an `OffscreenCanvas` if available, else a hidden `<canvas>`.
- Use `canvas.toBlob(callback, 'image/webp', quality)` where supported. Chrome, Edge, and Firefox support WebP encoding. Safari encoding of WebP support has been added in recent versions but has varied; detect by checking whether the returned blob type is `image/webp`, and fall back to `image/jpeg` at quality 0.8 if not.
- Target long edge of 1600 px for posts, and a lower size for chat.
- Do not rely on PNG output for photos; it is large.

### 5.3 Safari and low-end device limits

- iOS Safari has a canvas area limit around 16.7 megapixels (knowledge-based; some devices and versions differ). Downscale in steps, or cap input before drawing.
- Low-memory phones can fail silently when a large canvas is allocated. Catch errors and show a message asking the user to pick a smaller image.
- Avoid holding many full-size bitmaps at once. Process one file at a time.

### 5.4 Cancellation and progress

- Use `AbortController` to cancel decode, encode, and upload. Check `signal.aborted` between steps.
- Upload progress: `fetch` does not expose upload progress in most browsers (knowledge-based). Use `XMLHttpRequest` and read `xhr.upload.onprogress` for progress. Wire `signal` to `xhr.abort()`.
- Show a retry path on failure. Do not auto-retry non-idempotent posts (use an idempotency key).

### 5.5 Privacy in the browser

- Pre-compression re-encodes and so removes EXIF. Still never send original files to the server.
- Do not read or send the device's location or camera metadata through any other API.

---

## 6. Rate limits and quotas (MVP starting points)

Values are starting points to tune with data. Apply per authenticated account unless marked per IP. Enforce on the server with a token bucket or fixed window stored in Postgres or a cache. Return HTTP 429 with `Retry-After`.

| Action | Suggested MVP limit | Rationale |
| --- | --- | --- |
| Posts | 10 per hour; 30 per day | Keeps the feed readable. New accounts (under 72 h): 3 per hour. |
| Replies / comments | 30 per hour | Limits pile-ons without blocking real conversation. |
| Likes / reactions | 200 per hour | Cheap actions, but bots still need limits. |
| Follows / friend requests sent | 20 per day; 5 per hour | Friend requests are a grooming vector; keep low. |
| Friend request acceptances | No hard limit; flag if over 30 per day | Abnormal acceptance patterns are a signal. |
| Chat messages | 20 per minute per user; 300 per hour | Stops flooding. Also cap per conversation (for example, 10 per minute). |
| New conversations opened | 10 per day | Limits spray messaging. |
| Image uploads | 20 per day (posts); 10 per day (chat) | Bounds storage and Sharp CPU. |
| Storage per user | 100 MB total processed media (approx. 150 images at 600 KB) | Bounds Neon storage cost. Surface a clear message near the limit. |
| Username lookups | 60 per minute per IP | Anti-enumeration. |
| Login attempts | 10 per 15 minutes per account; 50 per 15 minutes per IP | Anti credential stuffing. Use progressive delay. |
| Report submissions | 20 per day | Stops report abuse; still generous for real users. |
| Password reset | 3 per hour per account | Prevents mail flooding. |

Rationale notes:

- Lower limits for new accounts are the single most useful spam control.
- Rate limits should count failures as well as successes for login and reset.
- Log every 429 with a reason code so we can see tuning needs without content.
- For chat, count messages by sender, not by conversation, so one user cannot flood many friends.

---

## 7. Retention and deletion

### 7.1 Soft versus hard delete

| Pattern | Use for | Notes |
| --- | --- | --- |
| Soft delete (`deleted_at`) | Posts and messages the author removes; hidden moderation actions | Hide from all reads. Keep for a short window (for example 30 days) for appeals and evidence. Purge job removes after window. |
| Hard delete | Media binaries after purge window; account data on deletion request | Remove from storage and DB. Keep only aggregate counts. |
| Tombstone | Threaded replies where the parent is deleted | Keep the row with `body = null` and `deleted = true` so child replies still hang together. Show "removed" placeholder. |
| Audit row | Moderator actions | Never delete. Keep for a set period as required by policy. |

### 7.2 Purge jobs

- Run a scheduled job (for example hourly) that deletes rows where `deleted_at < now() - interval '30 days'`, in batches of 500 to avoid long locks.
- Media purge: delete storage objects first, then DB rows, so a crash leaves a dangling row rather than an orphan file that cannot be found. Or use a deletion queue table with retries.
- Keep a purge log (counts and timestamps, not content).
- Test the purge job against a copy of production data before enabling.

### 7.3 Account deletion cascade

Order of operations:

1. Mark the account `pending_deletion` and revoke all sessions.
2. Hide the profile and all posts immediately.
3. Queue a job that:
   - Deletes or anonymises the user's posts, replies, reactions, and friend links.
   - Deletes chat messages the user sent. For the other participant, show "message removed" tombstones so the thread still makes sense, or delete both sides (decide with the safety adviser).
   - Deletes stored media keys and objects.
   - Removes username reservation only after the retention window, to prevent instant reuse by an impersonator.
4. Keep a minimal record (user ID hash, deletion date) to prove completion, then delete it after the legal retention period.

Legal notes: check NZ Privacy Act retention rules and any policy on keeping evidence of reported abuse. Keep reported content evidence for the period needed to handle the report and any Netsafe or court process.

---

## 8. Sources

Status column: V = fetched and verified this session. S = search snippet only. K = knowledge-based, not re-checked. X = blocked.

| Source | URL | Status |
| --- | --- | --- |
| Sharp API: operation (rotate, auto-orient) | https://sharp.pixelplumbing.com/api-operation | V |
| Sharp API: input (limitInputPixels, failOn, pages, animated, unlimited) | https://sharp.pixelplumbing.com/api-input | V |
| Sharp API: constructor | https://sharp.pixelplumbing.com/api-constructor | V |
| Sharp API: output (metadata, WebP, GIF options) | https://sharp.pixelplumbing.com/api-output | V |
| Sharp API: resize (fit, withoutEnlargement) | https://sharp.pixelplumbing.com/api-resize | V |
| Sharp performance (concurrency, memory) | https://sharp.pixelplumbing.com/performance | V |
| Sharp install (prebuilt, linux-x64, Lambda) | https://sharp.pixelplumbing.com/install | V |
| OWASP API Security Top 10 2023 | https://api-security.owasp.org/editions/2023/en/0x11-t10 (redirected from owasp.org) | V |
| eSafety Safety by Design (industry page) | https://www.esafety.gov.au/industry/safety-by-design | X (403); S via search |
| eSafety SbD principles PDF | https://www.esafety.gov.au/sites/default/files/2019-10/SBD%20-%20%20Principles.pdf | X (503); S via search |
| ICO Age Appropriate Design Code | https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/ | X (403); S via search |
| NZ Privacy Act 2020 (legislation) | https://www.legislation.govt.nz/act/public/2020/0031/latest/LMS23223.html | X (403) |
| NZ Privacy principles (OPC) | https://www.privacy.org.nz/privacy-act-2020/privacy-principles/ | S |
| NZ Harmful Digital Communications Act 2015 (legislation) | https://www.legislation.govt.nz/act/public/2015/0063/latest/DLM5711810.html | X (403) |
| Netsafe (HDCA Approved Agency) | https://netsafe.org.nz/ | S |
| HDCA section 6 (NZLII) | https://www.nzlii.org/nz/legis/consol_act/hdca2015303/s6.html | S (listed, not fetched) |
| Sharp known-issue and HEIF build notes | https://sharp.pixelplumbing.com/install | V (no HEIF detail given; K for the rest) |
| Lambda memory and CPU notes (via Sharp install page) | https://sharp.pixelplumbing.com/install | V |
| WHATWG / MDN: createImageBitmap, canvas.toBlob, XHR upload progress | https://developer.mozilla.org/ | K (not fetched) |
| Vercel and Netlify packaging for native modules | https://vercel.com/docs, https://docs.netlify.com/ | K (not fetched) |
| iOS canvas size limit | — | K (widely reported, not verified) |

## 9. Open items before implementation

- Verify the ICO standards list and the HDCA principle wording on the official sites, once they are reachable.
- Confirm HEIC/HEIF availability in the actual Sharp build used in the Netlify or Vercel runtime, with a startup check.
- Confirm the Vercel or Netlify function size and memory settings for the upload handler.
- Agree the report-threshold numbers and self-harm wording with a safety adviser before launch.
- Decide whether chat images are in MVP scope.
