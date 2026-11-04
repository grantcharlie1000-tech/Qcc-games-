# X-style Social Feed: Pattern Reference for QCC Social

Status: research notes only. No code. Purpose: describe the feature set and interaction patterns
of a microblogging feed so that "QCC Social" can reproduce the *behaviour* in its own visual
identity. Nothing here may be copied as brand identity (see section 6).

## Research provenance (read first)

- Web access: **partially working.** Web search returned results; WebFetch of the Help Center
  reply page returned HTTP 403, so Help Center wording was NOT read directly. Help-center facts
  below come from search-result excerpts and secondary write-ups, and are marked **[secondary]**.
- Items marked **[general knowledge]** come from long-standing product conventions and were not
  re-verified in this session.
- Items marked **[verify]** conflict between sources or may have changed in 2026. Re-check before
  relying on them.
- Accessibility items (WCAG, MDN) were checked against search-result summaries, not the full specs.

---

## 1. Information architecture

### 1.1 Global structure

| Area | Purpose | Mobile form | Desktop form |
| --- | --- | --- | --- |
| Primary nav | Home, Search/Explore, Notifications, Messages, Profile, Compose | Bottom bar (4-5 items) | Left rail with labels |
| Main column | The feed, post detail, profile, results | Full width | Centred column, ~600px max |
| Side rail (right) | Search box, suggestions, "who to follow", trends | Hidden; reached via search | Right rail, optional |
| Compose | New post | Floating action button + sheet | Inline box at top of Home + rail button |

- Keep the main column as the only scrolling region on desktop; rails can be sticky.
- Nav is always reachable; the active item is shown by weight and icon fill, not colour alone.

### 1.2 Home timeline

- Two tabs at the top of Home: a **personalised** tab and a **chronological / followed-only** tab.
  - [secondary] Help Center describes "For you" (mixes followed accounts with recommendations,
    filtered for harmful or spammy content) and "Following" (followed accounts only,
    reverse-chronological). Switching is by tap, click, or horizontal swipe. The app remembers
    the last-open tab.
  - [verify] A March 2026 report says the Following tab may default to a popularity ordering on
    some clients, with a toggle to recent. Do not assume "Following" is strictly chronological in
    the reference; design QCC's version explicitly.
- Tab bar behaviour:
  - The active tab has a clear indicator (underline or bar), not only a colour change.
  - Tapping the active tab again scrolls to top and refreshes.
  - Swipe between tabs must not conflict with vertical scroll (use a horizontal-dominant gesture check).
- Feed items are posts, reposts, and occasionally "social context" lines (e.g. "X liked this").
- Pagination: cursor-based, newest-first, see section 4.5.

### 1.3 Post detail (thread view)

- Shows the focused post at full size with its engagement counts and timestamp.
- Above it: parent posts in the same conversation (a "reply chain") shown compactly, linked by a
  thread connector line (section 2.6).
- Below it: direct replies, sorted by a relevance/recency control. Replies can nest one level
  visually; deeper replies are shown as "Show more replies" affordances.
- A reply composer sits at the top or in a sticky footer.
- Focused post is visually distinguished (no border needed; slightly larger text, no connector above
  it except to its parent).

### 1.4 Profile page

Layout, top to bottom:

1. **Banner** image (wide, ~3:1 on desktop, shorter on mobile), optional, with a neutral fallback fill.
2. **Avatar** overlapping the banner's bottom-left edge, circular, with a visible ring against the page.
3. Action row at right: Follow/Edit profile (own profile shows Edit), overflow menu.
4. **Display name** (can contain emoji, any case) and **@handle** (unique, lowercase-normalised).
5. Optional **badge** (see section 6 - do not use an X-like mark).
6. **Bio** (short, wraps, links and @mentions detected).
7. Meta row: location, website link, **joined** month and year.
8. **Following / Followers** counts, each tappable to a list.
9. Tab strip: **Posts | Replies | Media | Likes** (Likes may be hidden per privacy setting).
10. Content list for the active tab; empty states per tab (section 4.8).

- Sticky tab strip on scroll; the header collapses to a compact bar showing name and post count.
- Protected accounts show a lock/notice in place of posts for non-followers (section 5.3).

### 1.5 Search and Explore

- A persistent search field. Results grouped into tabs: **Top | Latest | People | Media**.
- Typeahead suggestions after 1-2 characters: recent searches, accounts, hashtags.
- Hashtags and "trending" topics are a separate surface; QCC should use "Discover" (section 6).
- Search results for school-age audience: search should be scoped to the app's own content and
  moderated handles only; no open web search.

### 1.6 Notifications

- Single chronological list grouped by type or by target post. Types:
  - **Likes** ("X and Y liked your post"): stacked avatars, count, tap to open the post.
  - **Replies / mentions**: show the reply excerpt; tap opens thread at that reply.
  - **Follows**: stacked avatars; a Follow-back button where relevant.
  - **Reposts / shares**: same stacking as likes.
- Optional tabs: **All | Mentions**. A dot or count badge on the nav item; cleared when viewed.
- Notifications from muted or blocked accounts are suppressed (section 5.1).

### 1.7 Compose sheet

- Opened from a floating button (mobile) or top-of-feed box (desktop).
- Contains: avatar, multi-line text area (auto-grows), media attach row, reply-settings control,
  character ring, and a primary submit button.
- Closing with content present asks whether to keep a draft (section 3.6).

---

## 2. Post anatomy

### 2.1 Two-column card

```
[avatar col] [content col                                   ]
  (44px)     header line: Name  @handle  · 3m
             body text (wraps, links, @mentions, #tags)
             media grid (optional)
             quoted post card (optional)
             action row: reply | repost | like | share | (bookmark)
```

- Avatar column is fixed width (~48px incl. gutter); content column flexes.
- Gutter between cards: a hairline divider, not a bordered box, so the feed reads as one stream.
- Whole card is tappable to open the post; inner links, media, and action buttons stop propagation.

### 2.2 Header line

- Order: **display name** (bold, truncates with ellipsis) then **@handle** (muted) then **separator dot** then **relative time**.
- Relative time format:

| Age | Display |
| --- | --- |
| under 60 s | "now" or "Ns" |
| under 60 min | "Nm" |
| under 24 h | "Nh" |
| same year, older than a day | "Mon D" (e.g. "Mar 4") |
| previous years | "Mon D, YYYY" |

- Full timestamp (locale-formatted) appears as a tooltip on desktop and in the post detail view.
- Refresh relative times once per minute while visible; do not re-render the whole list.

### 2.3 Text body

- Preserve line breaks; collapse runs of more than two blank lines.
- Auto-detect and style:
  - **URLs**: display shortened host + path; use `rel="noopener noreferrer"`; show a warning
    interstitial for unknown external domains (recommended for school use).
  - **@mentions**: link to profile; mentioned accounts can reply under reply settings (section 3.5).
  - **#hashtags**: link to a search/topic view.
- Long posts: collapse after N lines with "Show more" (keeps feed scannable).
- Emoji render at body text size; no emoji-only enlargement needed.

### 2.4 Media grid

Rules for attached images (sizes are design targets, not API limits):

| Count | Layout | Aspect per tile | Crop rule |
| --- | --- | --- | --- |
| 1 | Single wide tile | Keep source ratio within a min/max band (e.g. 16:9 to 4:5) | Centre-crop beyond band |
| 2 | Two columns side by side | 1:1 or 7:8 | Centre-crop |
| 3 | One tall tile left, two stacked right | Left 1:1 spanning two rows; right 1:1 each | Centre-crop |
| 4 | 2x2 grid | 1:1 each | Centre-crop |

- Small gap (2-4px) between tiles; rounded corners on the outer container only.
- Tapping a tile opens a full-screen viewer with swipe, pinch zoom, and alt text (section 4).
- Show an "ALT" or "Describe" badge when alt text exists; encourage alt text in the composer.
- Sensitive media: blurred with a "Show" tap-through; default-on for under-18 accounts in QCC.
- Video and GIF: autoplay muted only when in view and only if reduced-motion is off; otherwise a play button.

### 2.5 Replying-to line

- When a post is a reply, show a small line above the body: "Replying to @handle" (muted,
  linked). For multiple mentions, show the first and "and N others".
- In the feed, replies can appear with this line to give context; in threads, the line is omitted
  because the connector shows it.

### 2.6 Thread connector

- A thin vertical line runs from the bottom of the parent's avatar down to the child's avatar
  when posts in a sequence are by the same author, or when a reply chain is shown.
- Line colour: a muted token, not an accent colour, so it does not compete with content.
- Stops at the avatar of the last post in the chain.

### 2.7 Action row

- Four core actions, in this order: **Reply | Repost-type action | Like | Share**.
  - Bookmark (save privately) may be a fifth or be moved into the overflow menu.
- Each action: icon + count. Count hidden at 0. Counts abbreviated (1.2K, 3.4M) with full number on long press/tooltip.
- Hit area at least 24x24 CSS px per WCAG 2.2 SC 2.5.8 **(AA minimum)**; prefer 44x44 spacing
  for mobile (AAA-style target 2.5.5 is a sensible design goal) [general knowledge for 44px].
- Share opens a native share sheet where available, else a small menu (copy link, copy text).
- Repost-type action opens a small choice: "Share as-is" or "Quote" (with compose) [general knowledge].

### 2.8 Overflow menu (the "..." control)

Own post:
- Delete post (confirmation required)
- Edit (only if product supports it)
- Change who can reply
- Pin to profile (optional)

Other user's post:
- Mute account
- Block account
- Report post
- Copy link / Share
- Not interested (optional, feeds personalisation)

- The menu is a bottom sheet on mobile, a small popover on desktop.
- Destructive items (delete, block) are visually separated and use a confirmation step.

### 2.9 Deleted and unavailable posts

- Deleted post in a thread: placeholder row "This post was deleted" keeps the connector intact,
  without author or content. Replies to it remain visible.
- Unavailable (blocked, protected, suspended) posts: placeholder text that does not reveal
  the reason to a blocked user; say "This post is unavailable".
- Do not show "This account is blocked" messages to the blocked party in QCC; keep it neutral.

---

## 3. Composer

### 3.1 Character limit and counter

- Limit: 280 characters per post is the long-standing baseline. [secondary] Longer posts are
  reported for some paid tiers, with figures that disagree across sources [verify].
  **QCC recommendation: fixed 280 limit,** no paid tier.
- Counting: count Unicode code points, not UTF-16 units, so emoji count as one character
  [general knowledge; confirm the QCC implementation counts consistently].
- URLs: shortened or counted as a fixed length (design choice; state it in QCC docs).

### 3.2 Circular progress ring

- A small ring (~20-24px) next to the submit button fills clockwise as the limit is approached.
- Colour bands (use QCC tokens, not any brand palette):
  - 0 to ~80%: neutral/track colour, filling with the accent.
  - ~80% to 100% (last 20 characters): **warning** token (amber family).
  - Over the limit: **danger** token (red family), ring shows full with a negative count.
- Accessibility: the ring alone is not enough. Expose the number in text.
  - Show the remaining count as text **only in the last 20 characters**, so the view is not
    cluttered early on.
  - Use `aria-live="polite"` on the count and update it at most once per second, so screen-reader
    users are not spammed while typing.
- Over-limit behaviour: the Post button is disabled; the text is not truncated silently.

### 3.3 Post button rules

- Disabled when: text is empty and no media attached; text length is over the limit; a media
  upload is still in progress; the post is already submitting.
- When disabled, explain why via a tooltip or helper line, and do not rely on colour alone.
- Enable only after the user has typed; do not enable on focus.
- Prevent double submit: disable immediately on press and show a spinner in the button.
- Button label: use a verb unique to QCC (see section 6), not the common "Post" / "Tweet" labels.

### 3.4 Media attach

- Up to 4 images per post (matches the grid in section 2.4); a single video or GIF alternative.
- Attach row: image, GIF (optional), poll (optional, later), emoji. Only the first two are needed in v1.
- Each attachment shows a thumbnail, remove button, and an **alt text** field.
- Client-side checks: file type, size limit, and strip EXIF location metadata before upload.
  This matters for a school audience.

### 3.5 Reply composer: inline vs sheet

- **Inline** (desktop, thread view): reply box sits directly under the parent post, expands on focus.
- **Sheet** (mobile, or from the feed): opens a full compose sheet with "Replying to" context at the top.
- Reply settings (who can reply) are shown next to the composer; default for school context is
  restrictive (section 5.4).

### 3.6 Draft keeping

- Keep an unsent draft in memory while the app is open; restore when the compose sheet is reopened.
- Optionally persist drafts locally (per user, per device) with an expiry; never send drafts to a server
  without an explicit action.
- On close with unsent text: a confirm dialog with "Keep draft" and "Discard" options.
- Replies keep their own draft keyed by parent post id.

### 3.7 Reply settings control (composer)

- A chip near the composer, e.g. "Who can reply: Everyone".
- Changing it applies to the post being created; existing posts can be changed later from the overflow menu.
- Explain the effect in one line under the chip.

---

## 4. Interaction details and micro-interactions

### 4.1 Like interaction

- Tap: icon changes state (outline to filled), colour shifts to the QCC "liked" token, count
  increments by one. Total time under 300 ms for the visible change.
- Animation (optional, motion-safe only):
  - Scale pulse: icon scales to ~1.2x then settles at 1.0x over ~200-250 ms with an ease-out curve.
  - Particle burst: 6-8 small dots radiating outward and fading over ~400 ms. Keep particles
    decorative and skip when reduced motion is requested.
  - Count "roll": old digit slides up and out, new digit slides in, ~150 ms.
- Un-like: same button, reverse state, no particle burst; count decrements.
- Repeated taps within a short window toggle state; debounce network calls (send final state).

### 4.2 Optimistic updates and rollback

- Apply the local state change immediately (like, repost, follow, reply insertion).
- Queue the network request with the post id and the intended state (not a delta), so retries are idempotent.
- On success: keep state; optionally replace temporary ids with server ids.
- On failure: revert the UI to the last server-confirmed state; show a non-blocking toast
  ("Couldn't like that. Try again.") with a retry action.
- Never roll back silently. Never roll back a composed post the user has typed; keep it in the composer.
- Counts: after rollback, re-fetch the single post to correct the number.

### 4.3 Pull-to-refresh and "new posts" pill

- Pull-to-refresh on mobile at scroll top; show a spinner and haptic (where available).
- Background polling (e.g. every 30-60 s while visible, backing off when hidden) detects new posts.
- Do **not** insert new posts above the user's current scroll position automatically. Instead:
  - Show a floating pill at the top, e.g. "5 new posts" with a small avatar stack.
  - Tapping the pill scrolls to top and merges the new items.
  - If the user is already at top, merge silently.
- The pill is dismissed by tapping or by scrolling to the top.

### 4.4 Scroll position and restore

- Keep scroll position per tab when switching tabs or returning from a post.
- Restore by item id, not pixel offset, because heights change when media loads.

### 4.5 Infinite scroll with cursor pagination

- Request pages with an opaque **cursor** (e.g. the id/time of the last item), never page numbers.
- Trigger the next-page fetch when the user is within ~1-2 viewport heights of the end.
- De-duplicate by post id when merging pages and when the pill merges new posts.
- Show a "load more" button as a fallback if the scroll trigger fails (keyboard users, bug reports).
- Stop requesting when the response has no cursor; show an end-of-feed marker.

### 4.6 Skeleton loaders

- On first load and tab switch, show placeholder cards with the same two-column layout:
  circle avatar block, two text bars in the header, 2-3 body bars, optional media block.
- Skeletons use a gentle shimmer that is disabled under reduced motion (fall back to static grey).
- Keep skeleton height close to real card height to avoid layout jump.

### 4.7 Relative time updates

- See section 2.2. Update text on a 60-second timer per visible card batch, not per card.

### 4.8 Empty states

| Surface | Empty message intent | Suggested action |
| --- | --- | --- |
| Following tab, no follows | Explain the tab is empty until follows exist | Button: "Discover people" |
| Replies tab, none | Neutral statement | None |
| Likes tab, none | Neutral statement | None |
| Notifications, none | "Nothing yet" with what will appear here | None |
| Search, no results | Suggest spelling or different terms | Clear search |
| Protected account (non-follower) | "These posts are only visible to followers" | Button: "Request to follow" |

- Keep copy short, friendly, and non-judgemental.

### 4.9 Tap targets and touch

- Minimum 24x24 CSS px for any pointer target (WCAG 2.2 SC 2.5.8, AA).
- Recommended 44x44 for primary mobile actions; keep at least 8px spacing between adjacent actions.
- Action row icons must have an accessible name (`aria-label`) and a tooltip on desktop.
- Long-press menus must have a visible equivalent (overflow button).

### 4.10 Keyboard shortcuts (desktop)

Mirror the pattern without copying any product's exact key map; QCC should publish its own list.

| Key | Action (pattern) |
| --- | --- |
| `j` / `k` | Move focus to next / previous post |
| `n` | Open compose |
| `l` | Like focused post |
| `r` | Reply to focused post |
| `o` or `Enter` | Open focused post |
| `Esc` | Close sheet/menu |
| `/` | Focus search |
| `?` | Show shortcut help |

- Shortcuts are ignored while typing in a text field.
- Provide a toggle to disable single-key shortcuts (accessibility and accidental-trigger safety).
- Focus must be visible (outline) at all times.

### 4.11 Responsive layout

- Mobile (under ~600px): single column, bottom nav, full-width cards with 16px side gutter.
- Tablet/desktop: centred feed column, **max width ~600px**, side rails optional and hidden below ~1100px.
- No horizontal page scroll at any width; media scales inside its tile.
- Sticky headers must not cover focused elements (use `scroll-margin-top`).

### 4.12 Motion and reduced motion

- Honour `prefers-reduced-motion: reduce`: disable particle bursts, shimmer, count roll, and
  autoplay video; keep state changes instant (colour/icon only). [MDN summary: the query is
  well supported; use it in CSS and in `matchMedia` in TypeScript.]
- Motion should communicate state, not decorate. Keep durations under ~300 ms for UI feedback.

---

## 5. Safety controls

### 5.1 Block vs mute

| Control | Who is affected | Effect on viewer | Effect on target | Notification to target |
| --- | --- | --- | --- | --- |
| **Mute** | Only the muter | Hides target's posts/notifications from them | Nothing visible | None |
| **Block** | Both directions | Viewer cannot see target's posts in many surfaces | Target cannot follow, see protected posts, or interact with viewer's posts | None (in the reference model) |

- [secondary] In the reference model, blocked accounts can still see public posts but cannot like,
  reply to, or repost them, and blocking removes follows in both directions.
- Mute can also cover **keywords** and **entire conversations** (threads) for the muter's view only.
- QCC note: for a school audience, a **block** should be visible to staff/moderators, and a
  "tell a teacher" option should exist alongside block (section 5.6).

### 5.2 Report flow

- Reason categories typically used by the reference model:
  - Spam or scams
  - Harassment or bullying
  - Hate or abusive content
  - Sexual or adult content
  - Self-harm or threats
  - Private information (doxxing, personal details)
  - Impersonation
  - Other
- Flow: pick the category, optionally pick the target (this post, or the account), add an
  optional note, submit, confirmation screen. Offer block/mute as an alternative on the same screen.
- [secondary] Reports cover violations of the platform's rules; accounts that have protected
  their posts cannot be reported by non-followers in the reference model.
- QCC note: reports should route to a moderation queue with a staff view; the reporter should get
  an acknowledgement, not the outcome details.

### 5.3 Protected / private accounts

- A protected account's posts are visible only to approved followers.
- Non-followers see the profile header but a notice in place of posts; they can send a follow request.
- Protection changes search and replies: protected posts are not shown to non-followers in search or
  to users the account has blocked.
- QCC: recommend **protected by default** for under-13 and under-18 accounts, with a clear switch
  for guardians/teachers.

### 5.4 Reply controls ("who can reply")

[secondary] Reference-model options, listed in third-party write-ups (exact menu wording may have changed):

| Option (pattern) | Who can reply |
| --- | --- |
| Everyone | Any account |
| Accounts you follow | Only followed accounts |
| Only accounts you mention | Only mentioned accounts |
| Verified accounts (reference-only, not for QCC) | Accounts with a verification mark |

- Mentioned accounts can reply under every setting in the reference model.
- QCC equivalent: **Everyone in my class | People I follow | Only people I mention | Nobody (comments off)**,
  using QCC's own roster concept instead of verification.
- Default for school-age accounts: "People I follow" or stricter.
- Replies hidden by the author's settings should show a neutral note, not an error.

### 5.5 Other controls worth copying in principle

- Hide a reply (author hides a reply from their post) - useful for moderation.
- Restrict a user (their replies are visible only to them until approved) - softer than block.
- Show a "sensitive content" warning on media before display.
- Limit who can send direct messages; for QCC, consider no DMs in v1.

### 5.6 Suitability for a school-age audience

| Control | Suits school use? | Notes |
| --- | --- | --- |
| Block | Yes | Keep; add "tell a teacher" path |
| Mute (accounts, keywords) | Yes | Good low-friction option; keyword mute helps with bullying |
| Report with categories | Yes, essential | Route to staff; simplify category labels for younger users |
| Protected accounts | Yes, default on | Strongly recommended |
| Reply controls | Yes | Stricter defaults; "only people I follow" |
| Verified-only replies | No | Not meaningful for a closed roster |
| Public follower/following counts | Review | Consider hiding counts for minors |
| Open search of all users | No | Limit to roster and approved content |
| Public trends and hashtags | No (in v1) | Use curated topics |
| Direct messages | No (in v1) | Add later with strong moderation |
| Location in posts | No | Strip metadata and disable geotags |

---

## 6. "Do not copy" list and original alternatives

### 6.1 Do not copy (brand-identifying elements)

| Element | Why to avoid | QCC alternative |
| --- | --- | --- |
| Bird or any bird mark, the "X" letterform or cross mark, any logo | Direct brand identity | A new wordmark and a simple QCC glyph (e.g. speech-bubble-plus-dot) drawn from scratch with the svg-skill |
| Blue verification-style check badge and its shape | Recognised brand mark | A small QCC "Roster" badge (e.g. a diamond or ringed dot) in a QCC token colour |
| The specific brand blue and any brand palette | Colour-as-brand | QCC dark-glass tokens with an original accent (e.g. teal or violet) |
| Button labelled "Tweet" or "Post" with the same shape/colour | Exact label + styling | Verb label such as "Share" or "Send to feed" |
| "For you" exact copy and tab names | Exact wording from the product | "Following" + "Discover" (both generic UI words) |
| "Repost" as a label with the same icon | Exact wording + icon | "Share to feed" or "Boost" with an original icon |
| "Quote" label with reference-model styling | Exact styling | "Quote with comment" |
| Exact notification phrasing ("X and Y liked your post") | Copyable copy | Write QCC phrasing from scratch, e.g. "Sam and Lee liked your post" (still a generic pattern; keep it original) |
| Exact help-centre headings or paragraphs | Copyright | Write QCC's own help text |
| Profile layout with identical arrangement and "Joined" wording | Pattern, not brand; acceptable in general but keep wording original | Use "Member since" |
| Icon set copied from any product | Copyright / trademark | Original icon set from svg-skill |
| Relative-time strings in identical style | Fine as a convention; keep the format general | Keep the convention; no brand-specific formatting |
| Product name "X", "Twitter", handles, or any brand text in UI | Brand names | "QCC Social" only |

### 6.2 Original QCC alternatives (naming and copy)

| Concept | QCC name / copy |
| --- | --- |
| Personalised tab | "Following" (curated people) and "Discover" (curated topics) |
| Chronological tab | "Latest" |
| Compose button | "New post" (FAB) and "Share" (submit) |
| Repost | "Boost" or "Share to feed" |
| Like | "Like" with a heart-or-star token, both drawn fresh |
| Reply | "Reply" |
| Share | "Share" (system share sheet, else copy link) |
| Bookmark | "Save" |
| Mute | "Quiet" (mute) |
| Block | "Block" |
| Report | "Report" with categories |
| Protected | "Friends only" (class-friendly wording) |
| Badge | "Roster" badge |
| Reply settings | "Who can reply" |
| Empty state for Following | "Follow classmates to fill this feed" |

### 6.3 Visual identity rules for QCC

- Original wordmark, glyph, icon set, and accent colours.
- Dark-glass surfaces: translucent panels with blur, token-based colours, `:root` variables with
  dark defaults and `prefers-color-scheme` handling as required by the project.
- No brand blue, no bird, no X mark, no copied icons.

---

## 7. Accessibility checklist for the feature set

- Every icon-only control has an accessible name.
- Focus order follows visual order; focus ring visible on all controls.
- Target size: at least 24x24 CSS px (WCAG 2.2 SC 2.5.8); prefer 44x44 on touch.
- Colour is never the only signal (liked state has icon fill + count change; over-limit has text).
- Live regions: new-posts pill and character count use `aria-live="polite"` with throttling.
- Reduced motion honoured (section 4.12).
- Alt text on images with an easy edit path in the composer.

---

## 8. Sources

### Consulted (search results or fetched; this session)

- https://help.x.com/en/resources/recommender-systems/for-you-home-timeline-recommendations.html
  (search excerpt; For you / Following description)
- https://help.x.com/en/using-x/x-timeline (search excerpt; timeline tabs)
- https://help.x.com/en/using-x/x-conversations (search excerpt; reply options; help-centre page
  was listed in results; the reply-options wording was taken from a secondary write-up)
- https://help.x.com/rules-and-policies/x-reach-limited (search excerpt; reach limits)
- https://help.x.com/en/using-x/blocking-and-unblocking-accounts (search excerpt; blocking)
- https://help.x.com/safety-and-security/control-your-twitter-experience (search excerpt; mute,
  block, report, protected posts)
- https://help.x.com/en/using-twitter/mentions-and-replies (listed in results; not opened)
- https://www.engadget.com/x-now-lets-you-restrict-replies-to-verified-accounts-only-092514846.html
  (secondary; reply restriction launch coverage, 2023)
- https://www.gigazine.net/gsc_news/en/20231011-x-post-reply-only-verified-accounts (secondary)
- https://www.gigazine.net/gsc_news/en/20260422-x-custom-timeline/ (secondary; Custom Timelines,
  2026; treat as unverified)
- https://www.newsbytesapp.com/news/science/x-users-can-now-lock-replies-to-verified-accounts-only/story
  (secondary)
- https://bundle.social/blog/twitter-character-counter-guide (secondary; character limits)
- https://www.metricool.com/ (search excerpt via help.metricool.com/en/article/character-limit-for-each-social-network-4ivf8t/)
  (secondary; 280 vs long-form limits)
- https://w3c.github.io/wcag/understanding/target-size-minimum.html (listed; editor's draft, treat
  as provisional)
- https://kb.daisy.org/publishing/docs/wcag/target-size-minimum.html (secondary; SC 2.5.8 summary)
- https://dequeuniversity.com/rules/axe/4.8/target-size (secondary; target size rule summary)
- https://developer.mozilla.org/ru/docs/Web/CSS/@media/prefers-reduced-motion (listed; not opened in English)
- https://web.dev/articles/prefers-reduced-motion (listed in results; search excerpt)
- https://web-platform-dx.github.io/web-features-explorer/features/prefers-reduced-motion (search excerpt; support data)

### Attempted but not readable

- https://help.x.com/en/using-x/x-replies - WebFetch returned HTTP 403. Reply-settings wording is
  therefore from secondary sources only.

### Not consulted (general knowledge marked above)

- W3C WCAG 2.2 full text, WAI-ARIA live-region spec, Apple HIG and Material touch-target guidance.
  Recommended follow-up: open the published WCAG 2.2 SC 2.5.8 and 2.5.5 pages and the MDN
  English prefers-reduced-motion page before the design is locked.

---

## 9. Open questions for the design pass

1. Confirm the Following-tab ordering for QCC (strict chronological vs ranked-but-followed-only).
2. Decide the character-counting rule (code points vs grapheme clusters) and URL counting.
3. Decide whether media alt text is required or encouraged for images.
4. Confirm the reply-controls default for each age band.
5. Decide whether "Discover" uses curated topics only, with no open trends.
