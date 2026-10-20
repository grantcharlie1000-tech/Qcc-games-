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
