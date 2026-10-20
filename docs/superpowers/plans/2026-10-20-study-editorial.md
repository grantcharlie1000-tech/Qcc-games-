# Study editorial local redesign

Scope is the parent's already-authorized implementation brief. Work only in this worktree, with no publication or external integration. Existing 20 chapter IDs, titles, headings, diagrams and worked answers remain authoritative.

1. Add four original SVG portraits and explicitly fictional bylines. Add 100–200 useful original words per article with concrete reasoning and misconceptions. Use eager same-origin raw imports.
2. Rework picker and reader into an editorial layout with three article structures, readable typography, responsive navigation and a normal visible Games anchor with a 44px hit area. Preserve retained-game return callbacks and native reading keyboard behavior.
3. Add disabled, clearly labelled advertisement placeholders only inside articles. No scripts, third-party requests, consent or hosting changes.
4. Update existing return tests only for the intended accessible link role/name. Run new editorial responsive coverage, existing Study and affected game return tests, complete units, production build and offline checks. Validate SVGs and inspect screenshots.
5. Commit the concrete local checkpoint for the parent's independent Astra review. Parent owns review and publication decisions; no child agents.

Review focus: same retained game after link activation; no requests on chapter change; native Space scrolling and topic select keys; 320px overflow and link target; all 20 articles retain five headings and diagram; fictional identities never imply credentials.

## Execution record

- Baseline editorial test failed against old UI because Site navigation > Games is absent (`/tmp/qcc-study-editorial-before.txt`, parent supplied).
- using-superpowers read; its dispatched-agent stop applies. SVG, brainstorming, planning, executing and verification guidance read. Brief supplies full design and authorization, so no permission gate or further delegation is needed.
- Implemented four original fictional portraits, three article structures and 137–151 topic-specific added words per chapter. Existing topics.ts/diagrams/session/main untouched.
- Read-time estimate counts explicit visible text, excluding SVG source/metadata.
- Initial units: 266/266 pass; production build and TypeScript pass; SVG validator and XML parser: 24/24 pass.
- Initial broad browser run: 71 pass, one contaminated native PageDown assertion (viewport.spec.ts:58). Preserved trace proves a second document GET at 2026-10-20T02:04:59.061Z and Vite reconnect after my source edit, replacing study-active with game-viewport while polling. Source frozen for a final configured two-worker run; assertions unchanged. Raw failure preserved in /tmp/qcc-study-editorial-failure/.
- Final frozen-source run: 72/72 Chromium cases passed with configured two workers, including the exact native PageDown assertion. No assertions/timeouts/skips/retries changed.
- Exact final build: 266/266 units passed, TypeScript/build passed, offline pack a32ee8f2f48e (69 files). Full13 offline passed both paths before read-time correction; final rebuilt2-game offline plus all20 chapters passed both paths. 24 SVGs validated/parsed. Six final responsive screenshots retained and inspected.
- Unrelated test-regenerated tracked screenshots/video restored. No new dependency, external integration, account change or publication. Concrete local checkpoint ready for parent's independent Astra review.
- Astra review of43c8a31: no Critical/Important; one minor modified-link interception corrected under parent's explicit follow-up. Read receiving-code-review; verified old handler cancels all clicks.
- New native browser regression RED at defaultPrevented=true for trusted Control-click, then GREEN after restricting interception to unmodified primary clicks (including no Alt). Other modified clicks stay native; ordinary click/Enter retain existing lifecycle. Raw pre-fix trace preserved /tmp/qcc-study-editorial-modified-failure/.
- Follow-up frozen-source verification:73/73 configured-two-worker Chromium cases pass;266/266 units and TypeScript/build pass. New pack0499990a7779 passes ColorBlocks+FlappyBird+all20chapters offline at both paths, with zero chapter-change/external requests. No existing assertion/timeout/skip/retry changed. Only product delta is Games click guard; exact follow-up review remains parent's next step.
- Approved integration: fetched/read back freshmain a62152e4507c60d8d350a5c083a246936f28fee7; merge-tree conflict-free. One CreateProcess transport failure prevented command start; recovered status confirmed clean5499 before one successful local merge e1db8859f69eb9476571110e1d82b764cd31fa3d. Reviewed commits preserved; no repeated uncertain merge.
- Integrated product/test patch equals reviewed5499 byte-for-byte, exact original41path set retained; all17 fair-dealing update files match freshmain. Only existing evidence/README/plan refreshed after tests.
- Frozen combined checks:274/274 units,156/156 fullChromium cases with configured2workers,TypeScript/build pass; packd18ca7b8ad5a passes ColorBlocks+FlappyBird+all20chapters offline at bothpaths with zeroexternal/chapter requests. Unrelated generated images/video/performanceJSON restored. No external publication, account/ads or hosting/workflow changes. Exact final integration review is parent-coordinated next.
