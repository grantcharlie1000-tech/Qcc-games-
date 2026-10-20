# Neon Coil draft publication checkpoint

Published the reviewed `feat/neon-coil-arena` branch under the parent's fresh publication approval as draft PR https://github.com/grantcharlie1000-tech/Qcc-games-/pull/5.

- Published head: `1e08484b890bb2d60ced32989bfc139d075acc44`.
- Reviewed runtime: `9e187e8a23c5df263092dc27ec3b7b6ac5ad837f`; only review documentation/evidence differs at the published head.
- Remote main/base was verified as `a7f7631d4f606667f23b016ad6091cb3899365e8` by both the connected GitHub app and `git ls-remote` before publication.
- No existing PR matched the branch or Neon Coil title, and the remote branch was absent before the successful non-force push.
- Fresh local unit suite: 288 passed across 25 files (3.69 seconds).
- Remote PR changed-file list confirms no existing Snake, Pool, Study source or workflow changes. Existing shared shell tests only adjust expected catalog size from 13 to 14.
- PR-triggered full workflow: https://github.com/grantcharlie1000-tech/Qcc-games-/actions/runs/39416296107.
- PR test merge: `0254e4d1113304e8d64b87a5b27fb7b1b02012f0`, parents are the verified base and published head; its tree `87fce6d05a1eb79ce5162e70d6939c6b1bc9aad2` exactly matches the published head.

The CLI's initial read-only `gh api .../branches/main` request returned `Forbidden`. The supported connected GitHub app successfully read repository/main/PR state, and standard `git ls-remote`/`git push` succeeded. No account credentials/settings or network-bypass configuration were changed; no repeated CLI API attempt was made.

**An automatic Netlify preview deployment occurred** when PR 5 opened: preview ID `6ad7528435ea96f481471e54`, commit `1e08484b890bb2d60ced32989bfc139d075acc44`, context `deploy-preview`, created 11:37:40 UTC and ready by 11:38:02 UTC. URL: https://deploy-preview-5--mauri-gazette.netlify.app. The absence of a manual deployment does not mean no deployment occurred. This side effect should have been checked before publication under the user's no-deploy restriction. The parent has disclosed it. No further writes that trigger deployments are authorized; no settings were changed and no preview was deleted or promoted.

Read-only Netlify checks confirmed that the current production deployment remains `6ad6e364522e436f764bb8bc`, commit `a7f7631d4f606667f23b016ad6091cb3899365e8`, context `production`, branch `main`, published at 03:43:46 UTC before this PR. Safe metadata is saved in `PRODUCTION_DEPLOYMENT.json` and `PREVIEW_DEPLOYMENT.json`.

The workflow's PR guards exclude Pages configuration/artifact/deploy. No workflow_dispatch was used because that non-PR path can deploy. Full CI reached terminal failure on attempt 1: 329 browser tests passed, 1 failed, 14 skipped. The one failure is the Neon Coil WebKit resize/ranking assertion at `tests/games/neon-coil/play.spec.ts:90`: expected five rows, received ten. Build, update verification and offline verification were skipped after the browser failure; Pages configuration, Pages artifact and deploy were skipped. No test was weakened or rerun and no further remote write was made.

The exact checked-out test merge is confirmed by the retained job log. `CI_JOB.log`, `FAILURE_EXCERPT.log`, `FINAL_RUN.json`, `FINAL_JOBS.json`, `FINAL_PR.json`, `FINAL_STATUSES.json` and `ARTIFACTS.json` preserve the final outcome. The failed screenshot, trace and HTML report remain in GitHub artifact `12261214108` (39,135,530 bytes, digest in the artifact manifest), also downloaded by the supported connector into reusable file `file_00000000b26481f5aabbf20c1730d183`.

Materializing that artifact's supplied signed file URL into `/workspace/neon-coil-ci/first-ci-failure.zip` was blocked before bytes were received: `URLError <urlopen error Tunnel connection failed: 403 Forbidden>` for the `sdmntprcentralus.oaiusercontent.com` host. No retry, alternate host, proxy change or network bypass was attempted. The GitHub-hosted artifact and reusable connector file remain available; screenshot/trace contents were not inspected locally. The log evidence establishes the failure, but no runtime-versus-test-timing diagnosis is claimed.
