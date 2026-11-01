# Crossy Road r5 audit implementation

Execute Charlie's supplied audit and brief in `/workspace/qcc-crossy`, branch `game/crossy-road`. Base: `8547f30`. All 23 ranked findings and the additional impact/carry continuity findings are in scope. Reference measurement, rather than the earlier approximate pitch, controls projection.

## Constraints

- Port 4190 only. Never touch ports 4173–4175 or `/workspace/qcc-lg`.
- UFO, one character, QCC shared shell/cards, crisp antialiasing/native DPR ≤3, full-screen canvas; no gifts/menu/economy. Idle timing remains the accepted 7 s / warning 5 s, with immediate 3-row back/behind.
- No push, PR, merge, deployment or migration command. No remote DB or secrets. Existing verification uses isolated local test fixtures only.
- Install the supplied poster unchanged; generated review PNGs go outside git.
- Before EVERY commit run `git checkout -- docs/evidence 'tests/games/*/evidence/*'`.

## Tasks

- [x] A/B: Reproduce/fix leaderboard option count; audit other catalog/home counts; copy and validate supplied poster, choose matching tile accent. Verify online Chromium test; commit.
- [x] 1/2/6/7/15/23: Pin 45°/20° measured projection, 8 phone cells / 14 central PC cells plus two dim edge cells, soft crop-aware horizontal following. Calibrate lit/edge palette and long lane-aligned hard shadows without chicken blob. Capture intermediate projection before sizing the bird; inspect references.
- [x] 3/4/8/11/13/14/16/18/19/20/21/22/23: Distinct physically sized compact/sedan/taxi models, square hubs, restrained cabins, truck vents/cool cargo; slim bird; continuous banded foliage/exposed trunks/hash heights; notched lavender rocks/stumps; narrow irregular logs/small pads; muted long dashes, sparse sleepers/purple rails and ground signal glow.
- [x] 5/10/12/17: Two-row river preference and log+lily pairs, balanced shorter logs, early triple rail groups, varied/denser safe traffic. Preserve F1–F7 over 2,000 seeds. Version regenerated worlds explicitly so existing saved worlds are not silently replayed against different hazards.
- [x] 9 + animation appendix: Record contact presentation on the road; preserve rendered impact height for train/UFO, distinguish side/hop-in impacts; carry bird visibly below saucer. Keep gameplay death/idle thresholds and supported hop timing.
- [x] C: Produce complete r6 (supersedes the interrupted r5 at Charlie’s 17:43 instruction) with seeds 11/7, all three viewports, and extra detail views as needed. Inspect against every cited frame, measure colours/projection/character size, iterate until the findings are addressed; record an item-by-item matrix.
- [ ] D: `npm run check`, `npm test`, and combined Chromium game/leaderboard/Study/viewport specs with `ARCADE_URL=http://127.0.0.1:4190`. Independent read-only review. Restore generated evidence, commit logical changes, no push.

## Review targets

Vehicle visuals/collision lengths agree; new river structures retain reachability; triple rails retain independent ≥1 s warnings; camera crop/culling works at both aspect ratios; impacts never teleport vertically or flatten on grass; colour output is measured after lighting, not assumed from input hex.

A/B validation: reproduced the 19/20 failure, then all 5 online leaderboard Chromium tests passed; `npm run check` passed. Other catalog/home counts already expect 22; Study counts are unrelated. Supplied SVG validated and copied byte-for-byte.

## 17:43 priority change

- r5 work preserved as `4b1ee7d` after 579 game unit tests and type-checking passed.
- Explicitly authorized local merge of `5d94c34` committed as `9b20fdc`. Four conflicts resolved preserving both responsive game lists and glass menu navigation.
- `5c53914` adopts the real shared bindings/styles, floating shell rankings control and light-tone sheets. No top strip; full viewport at native DPR. Four rendering/chrome Chromium tests and 25 death/lifecycle Chromium tests passed.
- R6 adds dedicated lane-junction, authored traffic, early triple-rail and shared-menu shots. Main comparison seeds stay 11 (start) and 7 (mixed row48; natural triple cluster at row22).
- Read-only code review of r5 found no concrete correctness issues; final visual and combined browser verification remain required.

R6 capture completed from `d5ffc06`: 45 views + native crop, all High/AA and native buffers, maximum 29 calls. Final independent visual review found no additional significant defects in 26 inspected images. Detailed matrix and measurement notes: `2026-11-01-crossy-road-r6-review.md`.
