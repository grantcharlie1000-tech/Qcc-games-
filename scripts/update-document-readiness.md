# Update reload readiness

The quota-recovery C and later D reloads arm a real main-document navigation before the original Reload button click. A non-null document response, DOMContentLoaded and a changed native time origin establish a fresh same-URL document before the existing three-fruit label is used. The strict release and saved-settings assertions remain immediate; readiness never polls for the desired release.

The click, navigation and restored-label prerequisites share one 30000 ms budget, matching the previous implicit Playwright action/count wait. There are no retry clicks or sleeps, and activation/RPC deadlines are unchanged. In-flight browser commands cannot be cancelled by the Node bound; expiry guards prevent further helper steps after it fires.

Disposable root/subpath browser fixtures hold a genuine reload before commit while old B already displays three fruits, and separately serve a NEW wrong B document which must still fail strict C. They do not patch product callbacks or activation logic. The observed historical B-versus-C failure demonstrates a readiness gap; post-cleanup C snapshots do not establish its exact original document identity or cause.

Run the focused cases with `npx playwright test tests/core/update-document-readiness.spec.ts` and the existing built-app update verifier with `npm run verify:update`.
