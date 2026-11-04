# Quad Clash low-spec performance

Potato is the default preset and targets 30 rendered frames per second; Balanced targets 60. Both now retain the same picture: 2048-pixel floor atlas, up to 8× anisotropic filtering, antialiasing, standard material lighting, 1024-pixel desktop shadows and full effect budgets. They share a 2,073,600-pixel drawing budget (1080p-equivalent), preserving native 1920 × 1080 at DPR 1 and up to DPR 2 on smaller screens. Slow frames no longer trigger automatic resolution cuts. Touch devices retain the existing shadow policy.

Input and simulation remain independent of rendering. The fixed simulation runs at 60 Hz with all seven bots, the same difficulty, hitboxes, clutter, objectives and saves. Potato reduces render frequency rather than texture or scene quality. Targets are not guaranteed frame rates on unmeasured hardware.

## Work avoided without reducing the picture

- Trees and planter foliage use two instanced draws instead of a separate mesh for every leaf cluster.
- Fixed weapon and face parts are baked by material; animated body/feet/arms remain separate. Geometry is cached and disposed by the model kit.
- Shell tessellation is reduced where the silhouette remains smooth, particularly the thin colour ring.
- Idle particles and confetti are hidden and skip buffer uploads; active effects retain their full budget.
- A conservative static spatial index reduces collision, floor, ray and navigation candidates. Exact narrow-phase calculations and equal-distance ray ordering are preserved.
- Render scheduling is separate from elapsed animation time. Menu rendering is capped at 15 Hz; Potato at 30 Hz and Balanced at 60 Hz. Input remains responsive between renders.
- Changing presets retains the arena's textures, meshes and shader resources. It changes scheduling only.

## Sharper materials within a bounded texture budget

Campus weatherboards/windows use 512 × 416 pixels; roof variants, timber, concrete, crates and pool tiles use 256 × 256 pixels. Fine material depth is painted into colour textures, avoiding normal maps and additional lighting passes. All are static and mipmapped.

All eight weapons use five shared finish sheets: painted receivers (512 × 128), brushed steel (128 × 256), timber (256 × 128), rubber grips and brass (128 × 128 each). Together they use about 0.83 MiB including mipmaps. The model kit creates each sheet on demand, shares it between first-person/menu/bot guns and disposes it once. Receivers use 44-triangle chamfers; barrels, stocks, sight posts and scope details still batch by material.

The floor uses its existing 2048-pixel maximum colour/markings atlas plus a single 256 × 256 repeating neutral detail texture (about 0.33 MiB including mipmaps). The ground shader adds one texture lookup, with no extra ground draw. All outdoor court paint is merged into one static draw so nearby lines stay sharp without a much larger atlas. Fence edges use alpha-to-coverage with the antialiased renderer.

## Measurement

Profiles use the same House campus match (seed 4), 1280 × 720 viewport, DPR 1 and four camera headings. Chromium uses SwiftShader and a 4× main-thread CPU slowdown. Simulation is frozen during render samples, with three warm-up renders and twenty samples per heading. Counts include all render passes. Timings vary with software rendering, host load and shader compilation, so they do not establish hardware FPS.

The earlier 720p/no-shadow Potato experiment averaged 62 draw calls versus 232.25 before batching, but reduced visual quality. That profile has been superseded by the user's full-detail requirement; its 73% reduction is not the current full-detail result.

The current full-detail profile, including desktop shadow passes:

| Metric | Before batching | Full detail now | Reduction |
| --- | ---: | ---: | ---: |
| Mean draw calls | 232.25 | 154.75 | 33.4% |
| Mean triangles | 50,528 | 43,887 | 13.1% |
| Navigation nodes | 13,053 | 13,053 | Unchanged |

77 game tests and 11 Chromium checks pass, including exact rendered-frame parity across preset changes. Build/typecheck pass. Details are recorded in `TEST_RESULTS.md`. Raw profiles and screenshots are under `/workspace/qcc-evidence/`, outside git. No deployment was performed.
