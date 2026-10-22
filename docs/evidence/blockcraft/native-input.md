# Blockcraft native input verification

The 22 October 2026 audit retained native mouse input and unchanged gameplay assertions.
No synthetic mouse events or direct player rotation were substituted for the controls gate.

At head 82672ae6257ef698fcfceb0394301646a3ab6221, the full suite passed 587 browser cases and failed three Chromium Blockcraft cases (20 existing skips). Controls diagnostics recorded trusted mouse events with zero movement deltas while pointer lock and gameplay were active. The interaction trace also showed a nominal 30 ms click split across protocol calls became a hold longer than 800 ms. Multiple placements were valid for that hold. The interaction fixture now positions the mouse before aiming and uses a single native zero-delay click; exact block-count and inventory assertions remain.

- Original diagnostic failure: https://github.com/grantcharlie1000-tech/Qcc-games-/actions/runs/39759404739
- Mode comparison, head a42499c4a97aa2fe9bf55d6af9db5ad268c2b682: https://github.com/grantcharlie1000-tech/Qcc-games-/actions/runs/39766565805
- Full Chromium headed: all three controls, interaction, and play-through cases passed in 44.5 seconds (job 119783369846).
- Full Chromium new-headless: the same three cases passed in 52.7 seconds (job 119783370009).

Both passing modes used Playwright's installed Chromium 156.0.8078.4, revision 1248, the same SwiftShader flags, one worker and Xvfb. These results establish the tested browser setup, not universal hardware performance. Full-suite acceptance remains separate from these focused results.

The main browser suite now uses the full Chromium channel under Xvfb. The three-mode comparison remains manually dispatchable for diagnosis; it is not a recurring PR gate for the known problematic headless-shell input path. Browser versions remain controlled by the existing package lock. No test thresholds, assertions, project coverage or product input logic were weakened.
