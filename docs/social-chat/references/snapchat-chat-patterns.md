# Snapchat-style Chat: Pattern Reference for QCC Chat

Status: research notes only. No code, no copied assets or text.
Purpose: describe the messaging feature set and interaction patterns that QCC Chat should borrow in principle, then list what must not be copied.

## 0. Research provenance (read first)

- Web access worked, but many pages failed. Some help URLs redirected, and several Snap "values" pages returned 404.
- Each claim below is tagged:
  - **[F]** fetched and summarised from a Snap page in this pass.
  - **[S]** seen only in a search-result snippet, not opened.
  - **[G]** general knowledge, not verified in this pass. Treat as a hypothesis to test.
- The Snapchat "Friending" help article redirected to the help-center home, which had no useful article links. Friend-model details below therefore rely mostly on [S] snippets and the teen pages [F].
- Snap's own pages disagree in places (for example, unopened-snap timing). Where they do, both values are recorded.

---

## 1. Friends model

### 1.1 Core rules
- Chatting is **friend-gated**. Two users normally need an accepted mutual friendship before either can start a one-on-one chat. [F, teen page; S, friend-removal article]
- Adding a friend uses a **username search** or a **shared contact / QR-style link**. Adding a friend sends a **request**. The other side must accept before the friendship exists. [G for the exact flow]
- A request that is not yet accepted leaves the sender in a "pending" state. The UI shows a grey or pending indicator in the list. [S, icon article: "pending (gray)"]
- **Quick Add** is a suggestion surface that proposes accounts based on mutual friends, contacts, or location. [G] It is the main source of unsolicited contact. See section 6 for why QCC Chat should omit it for minors.

### 1.2 "Who can contact me" (privacy setting)
Typical options in this model, as described by Snap at a high level [G for exact labels]:

| Option (conceptual) | Who can start a chat | Use in QCC Chat |
| --- | --- | --- |
| Everyone | Any account that finds you | Do not use |
| Friends only | Accepted friends | Default for all |
| Friends + phone/shared contacts | Friends and saved-contact matches | Not applicable (no phone numbers in school arcade) |

- Snap's teen defaults restrict contact to **mutually accepted friends or phone contacts** [F, teen page]. For QCC Chat the equivalent is "accepted friends (approved by a teacher/admin) only".
- Teens who message or receive a message from someone with no mutual friend or shared contact see a **"think before you connect" style warning** [F, teen page]. Use an original warning when a non-friend thread is first opened, even if QCC Chat has no open discovery.

### 1.3 Quick Add (and why to omit it for minors)
- Quick Add surfaces people the user may know. It works by inferring from mutual friends, contacts, or nearby signals. [G]
- It creates **unsolicited introductions** between strangers, which is the core grooming risk for minors. Snap's own teen protections explicitly limit search and suggestions for teens unless there is an existing connection (several mutual friends or a shared contact) [F, teen page].
- **Recommendation: omit Quick Add entirely.** Friend requests should only come from (a) a classmate code or (b) a teacher-approved roster. No suggestions, no "people you may know".

### 1.4 Removing and blocking
Two different actions [S, removal and block articles]:

| Action | Effect | Original QCC Chat wording idea |
| --- | --- | --- |
| **Remove friend** | Ends the friendship. Former friend can still search and send a new request, and may still message depending on settings. | "Remove" removes them from your list. They can ask again. |
| **Block** | Stops messages, stops profile visibility, stops search and re-adding. The blocked person is not notified. Unblocking does **not** restore the friendship. Saved messages may be removed. | "Block" stops all contact. Unblock does not re-add them. |

- Removing or blocking should remove saved messages from the thread **for the user who blocked**, and should say so before confirming [S].
- A block must be silent to the blocked user (no notification) to avoid escalation. [S]

---

## 2. Chat list screen

### 2.1 Row anatomy
Each row, top to bottom, left to right [G, consistent across chat-list designs]:

- **Avatar** (left). Initials-based or simple original icon in QCC Chat.
- **Name** (primary line, bold if unread).
- **Status line** (secondary line): a small status glyph plus a short status phrase.
- **Relative time** (right): for example "2m", "3h", "Mon".
- **Unread marker** (optional dot or count).

### 2.2 Status phrases
Snap's help article lists these chat-list states [F, partial]:

| Phrase class (semantic) | Meaning | Who sees it |
| --- | --- | --- |
| Sent | You sent a message (or snap). | Sender |
| Opened | Recipient has opened your message. | Sender |
| Received | You have a message you have not opened yet. | Recipient |
| Viewed | Recipient has looked at your message. Separate from "opened" in Snap's wording. | Sender |
| Screenshot | Someone captured your message. | Sender |
| Replay | Someone replayed a snap you sent. | Sender |
| Pending (grey) | Friend request or item not yet resolved. | Both |

Not confirmed in this pass (general knowledge, [G]): "New chat", "Delivered", "Typing…". Define them ourselves.

**QCC Chat original state set (proposal):**
- `Sent` (you sent, not yet read)
- `Read` (recipient has read the thread)
- `New message` (you have unread text)
- `New photo` (you have an unopened view-once image)
- `Typing…` (live indicator, see section 3.6)
- `Pending` (friend request awaiting approval)
- `Expired` (retained item deleted)

### 2.3 Status iconography: semantics only
Describe meaning, not appearance. Designers should create original glyphs from these rules.

- **Message type is encoded by shape family.** Use one shape for "photo / view-once" and another for "text thread". Snap's family uses a square-like form for media and a speech-bubble-like form for text [G]. QCC Chat should use a **rounded frame with a play-triangle or dot** for view-once media and a **pill or rounded-rectangle with a tail** for text. Pick distinct silhouettes so they read in greyscale.
- **Filled vs outlined** usually encodes state: filled = unopened or needs attention; outlined = already handled [G]. Keep this rule explicit in the QCC Chat design system.
- **Direction encodes ownership.** Arrow into the glyph = received; arrow out of the glyph = sent [G]. Alternative for accessibility: use a text label as well, never icon alone.
- **Colour encodes message type or state, not decoration.** Common pattern [G]: one hue for media, one for text, one for alerts (screenshot/replay). QCC Chat uses its own accent palette; do not map to any brand hue.
- **Greyed = pending, expired, or disabled.** [F, partial: "pending (grey)"]

Rule for the design team: every glyph must have a text equivalent and pass contrast on the dark glass background.

### 2.4 Ordering
- Sort by **unread first**, then by most recent activity [G].
- Pin rule (optional): a small, fixed number of pinned threads, for example the class teacher or a group. Keep it simple for v1.

### 2.5 Swipe and long-press
- **Swipe a row horizontally to open or reveal actions** [G]. Right-swipe opens the thread. Left-swipe reveals quick actions (mute, delete-from-list). Avoid destructive swipes without confirmation.
- **Long-press a row** opens a small action menu: mute, mark read, remove from list, and (for blocking or reporting) a second menu [G]. Snap routes "report" through a press-and-hold on the name, then a manage-friendship menu [S]. QCC Chat should use a visible menu button as well, so keyboard and touch users can reach it.

---

## 3. Conversation screen

### 3.1 Grouping by sender (no bubbles)
- Group consecutive messages from the same sender under one name label. Use a **coloured name label or a left accent bar** per sender [G]. Avoid chat bubbles on the sides. This makes long threads scannable and reads more like a transcript.
- Within a group, space messages tightly. Between groups, add a larger gap.
- Each sender gets a stable colour from a fixed palette. Assign colours per thread, not globally, so colours stay consistent in the thread.

### 3.2 Date separators
- Insert a centred, small-caps date separator when the calendar day changes, and for gaps longer than about an hour [G].
- Use relative words ("Today", "Yesterday") then dates.

### 3.3 Saving messages ("saved in chat")
From the help article [F]:
- **Tap** a message to save it (tap again to unsave). Saved messages get a distinct background that everyone in the chat can see.
- **Press and hold** is for **delete**, not save. This is an unusual mapping. QCC Chat can choose its own gesture, but must make it discoverable.
- Saved messages are kept longer than default. Saving also keeps reactions [F].

Recommendation for QCC Chat: **tap to save** is fine, but use a visible "keep" control as well. Show who saved it.

### 3.4 Retention and disappearing messages
From the deletion article [F]:

- **One-on-one default:** messages are deleted **24 hours after everyone has viewed them, or 31 days after sending, whichever comes first.**
- **Per-chat options** (Snap's model): delete right after viewing, 24 hours after viewing (default), 7 days after viewing, or never. [F]
- Changing the setting applies **only to messages sent afterward**. Older messages keep the setting they were sent under [F]. Make this explicit in QCC Chat.
- **Group chats** follow similar options. Community or large group chats may use shorter windows [F].
- Saved or reacted-to messages are kept longer. Users can delete retained messages manually [F].

### 3.5 Read indicators
- Show sent, then read, per message or as a small status under the last message [G].
- For group chats, show who has read, or a count, rather than a per-person list [G].

### 3.6 Typing indicator
- Show "Name is typing…" with three animated dots while the other user has the composer focused and has typed in the last few seconds [G].
- Stop after a short idle timeout (for example 4 seconds, original value to choose).
- Respect reduced motion: replace animated dots with static text "typing…" (section 5).

### 3.7 Composer
Typical layout, described not copied [G]:
- Left: a camera or capture button (opens a view-once snap flow).
- Centre: a text field with a placeholder.
- Right: a media or attach button, then a send button. Send is disabled while empty.
- Optional: an emoji or sticker tray. For a school arcade, keep the tray to text emoji only, or drop it for v1.

### 3.8 Reactions
- Long-press (or hover on desktop) a message to show a short reaction set. [G]
- Reactions are small, fixed, and count toward the thread. Snap keeps reactions with saved messages [F]. Keep reactions in the retention rules, not as a separate store.
- QCC Chat: limit to a small fixed set (for example 4 to 6 reactions). Do not allow arbitrary emoji.

### 3.9 Reply-to-message
- Swipe a message, or use a menu action, to reply. The reply quotes the original message in a compact preview above the composer [G].
- A reply to a deleted message shows a neutral "original removed" line.

### 3.10 Delete and unsend
- Users can delete their own messages. Snap's rule [F]: you can delete your own messages and snaps but not others' messages. Others can see that a deletion happened, and deletion may not reach every device immediately.
- For QCC Chat: "delete for everyone" is allowed for your own messages within a short window. After that, only "delete for me". Show a visible note: "deleted by sender".

### 3.11 Screenshot notices, and why the web cannot detect them reliably
- Snap's chat icons include a screenshot state that tells the **sender** a capture happened [F, icon article]. This is a platform-app feature: the native OS hooks the app.
- **The web cannot reliably detect screenshots.** A browser page has no portable event for OS screenshots or for another app capturing the screen. Screen-capture APIs exist, but they only cover capture the page itself starts (with user consent). They do not tell you when the viewer captures your page. Do not claim that QCC Chat detects screenshots.
- Practical options for QCC Chat (honest):
  1. State in the UI that screenshots are not blocked or detected in the browser.
  2. Reduce exposure instead: view-once media is blurred until held, and disabled in some browsers.
  3. Use a visible "this may be saved" hint on view-once media. Do not promise prevention.

---

## 4. Snaps (view-once media)

### 4.1 Capture and attach
- Capture: the camera button opens a capture view, takes a photo, and offers send to one or more friends [G].
- Attach: pick a photo from the device gallery, and set the view mode (view-once or replayable, see 4.3) [G].
- Optional caption text, drawn on top. Keep it simple for QCC Chat v1.

### 4.2 Opening
- Unopened items show a "new" state in the chat list and the thread [G].
- **Open: press and hold, or tap, depending on the mode.** Hold-to-view is common: the image shows only while held, which discourages casual copying. [G]
- Opening sends an "opened" receipt to the sender [F].

### 4.3 Timers and replay limits
- A **countdown ring** (or equivalent) indicates remaining view time, typically a few seconds. [G]
- Replay limits: Snap's model [F, replay article]: a sender may see a replay state; a Snap may be replayed only in some plans, and replays are notified to the sender. For QCC Chat: **no replay** in v1. A snap is viewed once. Keep the sender's "viewed" receipt only.
- Views and replays notify the sender. Snap's model notifies on screenshot and replay [F]. For QCC Chat, notify only on "opened".

### 4.4 Expiry of unopened snaps
- Snap's help article says unopened snaps are deleted from servers after **31 days** [F]. An older post says 30 days [S]. Record both, use the current figure for research, but QCC Chat will define its own period.
- Opened snaps: deleted from servers once every recipient has viewed them [F].

### 4.5 "Opened" receipts
- Show "Opened" to the sender once the recipient has opened the item. Keep receipts coarse: "opened", not "viewed for 3.2 seconds".

---

## 5. Motion and micro-interactions

All motion must respect the user's reduced-motion preference. Under `prefers-reduced-motion`, replace movement with a fade or a static state, and keep timing short. [G, and consistent with the project's animation rule]

| Interaction | Motion pattern (original) | Reduced-motion alternative |
| --- | --- | --- |
| Open a chat from the list | Row slides or the thread panel slides in from the right, 180 to 240 ms, eased out. | Instant swap with a fade of 120 ms. |
| Send a message | Message scales up slightly from the composer and settles into the thread. | Message appears in place. |
| Typing indicator | Three dots pulse in sequence. | Static text "typing…". |
| Snap opening | Ring counts down; image reveals with a short scale-in. | Image shows at once with a timer label. |
| Snap closing | Image fades and the thread item updates to "opened". | Instant state change. |
| Save a message | Small pulse on the saved background. | Colour change only. |
| Swipe to reply | Row offset follows the finger, with a snap-back. | Tap a reply control instead. |

Web haptic equivalents:
- The Vibration API is **not supported on iOS Safari** and is restricted in many contexts. Treat haptics as optional.
- Substitute with a brief visual pulse plus, where supported, a short vibration on Android. Never rely on vibration alone to signal state.

Frame budget and performance: keep animations to transform and opacity, under 300 ms, and avoid layout thrash in long threads.

---

## 6. Safety and teen protection

### 6.1 Snap's published model (summarised)
- **Teen accounts (13 to 17) are private by default.** [F, teen page]
- **Contact limits:** teens can message only mutually accepted friends or phone contacts, and can be tagged only by existing friends. [F]
- **Search:** teens are kept out of search and suggestions unless there is an existing connection (mutual friends or shared contact). [F]
- **Public discovery** is off by default for teens. Public profiles are only for 16 to 17 year olds who opt in. [F]
- **Location sharing** is off by default and limited to friends. [F]
- **Like counts** are hidden on teen stories and videos. [F]
- **Reporting and blocking** are available in-app to every user. [F]

### 6.2 Family Center concept
- A parent-side tool that lets a guardian see **who their teen has talked to recently** and the group members in active group chats, **without reading messages** [F, search summary of Family Center pages; the parents pages were in results but the summary is from snippets]. Parents can also confidentially report concerns to the platform's safety team [F].
- Snap states that **contact limits cannot be set by parents** and cannot be turned off for teens [F].
- For QCC Chat (no parent accounts, school-run), the equivalent is a **teacher or admin view**: rosters, friend-connection list, and a report queue. Do not give teachers access to message content by default. Make the access explicit in the policy and show the same notice to students.

### 6.3 Default contact settings for minors (QCC Chat proposal)
- Friends only, accepted by an adult, from a class roster.
- No Quick Add, no search by name, no public profiles, no discovery.
- No location, no read of other people's contacts.
- Non-roster requests are not possible in v1. No stranger can find a student.

### 6.4 Report flow
Snap's report categories [S, report article], and a QCC Chat proposal:

| Snap category (summary) | QCC Chat category (original) |
| --- | --- |
| Bullying, harassment, defamation | Bullying or unkind messages |
| Nudity and sexual content | Inappropriate images |
| Threats, violence, dangerous behaviour | Threats or harm |
| Hate speech, extremism | Hateful content |
| Drugs and weapons | Unsafe items |
| Suicide and self-harm | Someone may be at risk (show help resources) |
| False information, deceptive practices | Scams or pretending to be someone |
| Spam | Spam |

- Report flow: choose a category, optional note, confirm. The reporter sees "Thanks, a teacher will review this". The reported account is not told who reported.
- For self-harm or threat reports, show an immediate, original help card (school counsellor, local emergency number) before the confirm step.
- Snap's transparency reports now call categories "policy reasons" [S]. Note this if we publish our own transparency log later.

### 6.5 Blocking effects
- A block is silent (no notification to the blocked user) [S].
- It removes the thread from the blocker's list, hides profile and search, and blocks new requests [S].
- Unblocking does not restore the friendship. The user must request again [S].

### 6.6 Suitability for a school arcade
Suitable, with changes:
- Friend-gated 1:1 chat, roster-based, with no discovery.
- Coarse receipts, no screenshot promises.
- Retention defaults that delete quickly, plus a teacher-visible report queue.

Not suitable, drop from the design:
- Public stories or discovery feeds.
- Quick Add and location features.
- Streaks or ranking mechanics that push frequent contact.
- Any open invite link that works for strangers.

---

## 7. Retention and deletion policy (Snap's published model, summarised)

Summarised from [F] (deletion article) and [S] (snippets). Confirm current text before relying on figures.

| Item | Snap's published behaviour (summary) |
| --- | --- |
| Unopened snap | Deleted from servers after about 31 days (an older post says 30). |
| Opened snap | Deleted from servers once every recipient has viewed it. |
| One-on-one chat | Default: deleted 24 hours after everyone has viewed it, or 31 days after sending, whichever is first. Options: right after viewing, 7 days after viewing, never. |
| Saved message | Kept longer. Deleted if the users stop being friends or block each other. |
| Group chat | Similar options. Community groups may default to shorter windows. |
| Changes | Apply only to messages sent after the change. |

Snap also notes that deletion is "automatic" but cannot promise a specific timeframe [S].

### 7.1 Original QCC Chat retention policy (proposal to define)
Define our own, explicit policy. Suggested starting values for review:

| Item | QCC Chat proposal |
| --- | --- |
| Unopened view-once photo | Auto-delete after 7 days. |
| Opened view-once photo | Delete immediately after the recipient's view ends. Never stored. |
| Text message | Delete 24 hours after all participants have read it, or after 7 days if unread, whichever is first. |
| Saved message | Kept for 30 days from save, then deleted. Teacher can clear. |
| Deleted by sender | Removed from all devices where possible, with a visible "deleted" stub. |
| Blocked or removed friendship | Saved messages removed for the user who blocked. Other side keeps its own copy only if the thread is still allowed. |
| Account deletion or class end | Thread and media deleted within 30 days. |
| Reports | Kept only for the review window (for example 90 days), then deleted, except where a school policy requires more. |

Each value is a placeholder. Set them with the school's data-protection and safeguarding policy before shipping.

---

## 8. "Do not copy" list

Do not reproduce any of these. Use the original alternative.

| Element to avoid | Why | Original alternative |
| --- | --- | --- |
| Ghost logo or any ghost-like silhouette | Brand identifier | Original mark: an abstract symbol or a wordmark in a neutral typeface. |
| Snapchat yellow as the brand or accent colour | Brand colour | Use a QCC Chat palette (for example cool teal or indigo on dark glass). Check it does not read as the target brand. |
| Bitmoji or any avatar-character system | Brand product | Initial-based avatars or original geometric icons. |
| Brand names in UI ("Snap", "Snaps", "Chat", "Stories", "Spotlight") | Trademark | Use QCC terms: "photo", "message", "moment", "channel". Keep "chat" only as a generic noun if needed. |
| Exact status phrases copied from the app | Wording | Write original status labels (section 2.2). |
| Copied icon shapes (square-with-corners for media, speech bubble with a specific tail) | Copied asset look | Original glyphs designed from the semantic rules in section 2.3. |
| Snap's specific ring-timer graphic | Visual signature | Original progress indicator (for example a bar or a dot sequence). |
| Snap's specific press-and-hold-to-delete mapping | Interaction signature | Choose a documented mapping and show it in a visible menu too. |
| Snap's exact sound or haptic signature | Asset | Original short sound, or none. |
| Any copied help-center text or policy text | Copyright | Write our own policy text from section 7.1. |
| "Snap Map", "Stories", "Spotlight", "Memories", "Discover" | Product names | Do not build these features at all. |

---

## 9. Sources

Fetched in this pass ([F]):
- https://values.snap.com/privacy/teens (teen defaults, public discovery, reporting, location)
- https://parents.snapchat.com/safeguards-for-teens (teen safeguards summary)
- https://help.snapchat.com/hc/en-gb/articles/7012392635156-How-do-I-save-or-delete-Snapchat-Chat-messages (save and delete chat messages)
- https://help.snapchat.com/hc/en-us/articles/7012315702548-What-do-the-icons-on-the-Chat-Screen-mean (chat-screen status semantics)
- https://help.snapchat.com/hc/en-us/articles/7012334940948-When-does-Snapchat-delete-Snaps-and-Chats (deletion timings)

Attempted, redirected or not usable:
- https://support.snapchat.com/en-US/article/friending (redirected to help-center home)
- https://help.snapchat.com/hc/en-us/ (home only; no useful article links returned)
- https://values.snap.com/privacy/privacy-by-design (404)
- https://values.snap.com/safety/safety-privacy-defaults (404)

Seen in search results only ([S]), not opened:
- https://help.snapchat.com/hc/en-us/articles/7012401093396-How-do-I-block-a-friend-on-Snapchat
- https://help.snapchat.com/hc/en-us/articles/7012410297364-How-to-Remove-a-Friend-on-Snapchat
- https://help.snapchat.com/hc/en-us/articles/7012399221652-How-do-I-report-abuse-illegal-content-or-other-violations-on-Snapchat
- https://parents.snapchat.com/family-center
- https://newsroom.snap.com/snaps-stored (older post; cited for the 30-day figure)
- https://values.snap.com/privacy/tips-for-teens

General knowledge ([G]), not checked against any page in this pass:
- Quick Add mechanics, typing-indicator timing, swipe and long-press conventions, reaction counts, Vibration API support on iOS Safari, and the browser's lack of screenshot events.

Caveats to resolve before design sign-off:
- Snap's unopened-snap figure is 31 days (current) and 30 days (older). Confirm current text.
- Friend-request flow and Quick Add details need a fresh read of the friending article when reachable.
- The chat-status glyph semantics (filled vs outlined, shape families, colours) are partly general knowledge. Design original glyphs from section 2.3, and do not copy any appearance.
