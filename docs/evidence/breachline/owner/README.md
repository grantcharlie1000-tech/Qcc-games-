# Owner play tests

## 2026-11-12, second preview (commit 572036f), `2026-11-12-readout-sharp-yard.jpg`

Owner's words: "Little bit buggy in places (this is in sharp mode btw) but all round it is much better."

Readout in the screenshot: 28 fps, 35.6 ms, worst 50.8 ms; script 9.4 ms; 106 draws; 103k triangles; 1890x1016;
Sharp; post high; art light; GPU "ANGLE (Intel, Intel(R) HD Graphics 630 ...)".

What it tells us:

- The browser is drawing on the integrated Intel HD Graphics 630, not the computer's gaming card.
- On that chip, Sharp at about 1080p runs at 28 fps: about 26 ms of GPU work and 9.4 ms of script per frame.
- The art tier rule worked (Intel HD got the light tier).

Faults visible in the frame (planner's list):

1. "Go" and "Plant the uplink in A or B" still showing under the ROUND LOST banner.
2. The yard: flat untextured grey ground, a flat sky and a skyline of plain pastel blocks.
3. The rifle reads pale flat grey and the glove plain, with a pale blue-white lens disc.
4. The corner pillar on the left has a stone texture at a much too large scale.
5. The room seen through the opening is flat and dark.
