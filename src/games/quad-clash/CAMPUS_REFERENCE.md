# QCC Campus — supplied satellite image

The campus arena now uses the satellite screenshot supplied by the user as its primary layout reference. It replaces the earlier generic five-block approximation.

## Source and tracing

- User attachment: `1-Photo-1.jpg`, 590 × 1280 pixels.
- SHA-256: `7052dff7f432d52ae05e60f82a2cd031d5b5622367cac037c95f0ea165801bca`.
- The game uses the school/field portion approximately within image x=5…585, y=90…790. The phone controls, map pin, labels and surrounding homes are not reproduced.
- `campus-layout.ts` records thirteen manually read rectangular roof/footprint sections in source-image pixels, plus the courts and pool. This makes every placement traceable without bundling the original screenshot.
- Image-right becomes +x, image-down becomes +z. The screenshot compass is slightly rotated, so these are image axes rather than surveyed geographic bearings.
- Scale is a gameplay choice: 0.17 world metres per source pixel, around image origin (295,440). The image has no scale bar, so these are not measured real-world dimensions.

## Matched layout

- A large open field lies above/north of the buildings, with Joseph Sullivan Drive along the image's upper edge.
- Three courts occupy the west side, with the rectangular outdoor pool immediately south of them.
- The long pale-roof west hall and its dark extension sit between the courts and the compact main-school cluster.
- The larger muted-roof north hall, small west annexes, long north and south wings, inner wings and east block follow their visible relative positions.
- The east parking area and the smaller parking area beside the pool follow the image. The south approach enters between them and the school cluster.
- Roof materials distinguish the bright west hall, muted grey/green large blocks and dark connecting wings.

## Simplifications for gameplay

Roof outlines are simplified to axis-aligned rectangles. Heights, wall finishes, doorways, interiors, signs, trees, parked vehicles and cover objects are estimates or game additions. Spatial labels such as “North Hall” and “East Block” do not claim actual school room names. Small structures and roof details are omitted or simplified. No exact interior plan can be inferred from this image.

The pool has a tiled raised rim and a blue floor surface with swim-lane markings; swimming and depth physics are not simulated. A nine-step outside staircase is a gameplay addition to reach the 4.4 m west-hall roof. The boundary fence is an arena boundary, not a traced real fence. Movement stays within that boundary at every jump height.

All spawns, pickups, interiors and objectives are checked against the main navigation component. Existing matches from the earlier campus layout keep their scores, health and equipment; live fighters move to valid new spawns and pickups/projectiles are reset for the new geometry. New saves record map revision 2.

No network image request or external asset download is needed at runtime.

## Added school clutter

The user requested more clutter after the screenshot layout was established. Benches with backs, picnic tables, bins/recycling bins, bike racks, planters, sports storage carts, stacked equipment cases, noticeboards and indoor desks/lockers are game additions. They do not change the traced footprints. All solid parts share the batched render/collision boxes; planters use the existing decorative foliage. Placement keeps spawn/pickup positions, room centres and objective routes usable.
