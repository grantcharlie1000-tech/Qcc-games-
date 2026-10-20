# Browser CI follow-up

The approved CI checkpoint `14b94248181286d812333d5b137c9e791741cc5a`
was pushed to PR #1 and its branch identity verified through GitHub. The first
full PR run is [39348788634](https://github.com/grantcharlie1000-tech/Qcc-games-/actions/runs/39348788634).
These follow-up changes address the seven WebKit cases previously failing on
main; hosted verification is still required. No failure is waived.

## Changes and evidence

- **Animal Stack:** resizing cleared both pointer gestures and physically held
  keys. A deterministic browser regression reproduced the exact aim=190 failure
  after a real held `d` plus viewport resize. Resizing now cancels only the pointer
  gesture; blur, focus loss, pause, restart and disposal still clear all input.
  The test retains the >210 aim assertion after 500 ms, adds a resize and an
  opposite-direction check, and still verifies focus loss stops movement.
- **Water Sort:** observing field size missed viewport resizes that leave its
  capped scene dimensions unchanged. A real pointer regression reproduced held
  capture after changing a wide window from 1200×800 to 1210×800. A window resize
  listener now cancels capture as well, and is removed by the existing abort
  controller on disposal. The test checks the unchanged-field case too and waits
  for asynchronous resize cancellation before continuing its native gesture.
- **Color Blocks:** the grid's `height:100%` depended on an aspect-ratio-sized
  parent with padding. The three failed WebKit cases differed by exactly the
  frame's combined vertical padding (8 px or 6 px). The grid now derives its own
  square height from its width using `aspect-ratio:1; height:auto`. All original
  square, placement, footprint and containment assertions remain unchanged.
- **Pool test:** at landscape fit, the 440-unit table is about 81 CSS px wide.
  Requesting logical x=180 can land on an integer native pixel mapping to
  x≈176.7. The test now deliberately sends an integer CSS-pixel native click,
  verifies the trusted event's exact client coordinates, and checks saved cue
  placement against that event's logical coordinates at the original 0.5-unit
  tolerance. It also waits for stable native canvas actionability before
  measuring. It does not accept a looser cue-position tolerance or change Pool.
- **Solitaire test:** the test previously compared three bounds obtained in
  separate browser calls while resize fitting could advance between them. It now
  waits for stable native card actionability and samples all bounds in one DOM
  evaluation. The column-containment and message-clearance assertions are
  unchanged; no Solitaire rules or layout code changed.

## Local verification

- Animal Stack regression before fix: failed with aim **190**, expected **>210**.
- Water Sort unchanged-field resize before fix: failed with capture **true**,
  expected **false**, even after waiting for cancellation.
- All seven targeted Chromium cases after changes: **7/7 passed**.
- `npm test`: **266/266 passed**, 23 files.
- `npm run check`: **passed**.
- `npm run build`: **passed**, 69-file offline pack.
- Raw output is in `docs/evidence/ci-browser-repairs/`.

WebKit remains unavailable locally because its earlier installer dependency
download was rejected with HTTP 403 `Domain forbidden`. No alternate download
route was attempted. Full hosted Chromium/WebKit, offline and update checks must
pass before a green result can be claimed. A fresh exact-commit Astra review is
required before these code changes are uploaded. No merge, production deployment,
account, security, permission, credential or spending changes are part of this
repair.
