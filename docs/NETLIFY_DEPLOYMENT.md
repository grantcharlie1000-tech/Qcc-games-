# Mauri Gazette — GitHub continuous deployment

[Live site](https://mauri-gazette.netlify.app) · [Netlify project](https://app.netlify.com/projects/mauri-gazette) · [GitHub source](https://github.com/grantcharlie1000-tech/Qcc-games-)

Project `mauri-gazette`, site ID `4afc912c-6802-4c18-8f2c-273fb3e771ee`. Production branch: **main**. Build: `npm run build`; publish: `dist`; base: repository root; Node.js 22. These settings are supplied by `netlify.toml`.

## Observed publication

**Study Mode is published, and automatic updates from main are verified.** After the source update, the Netlify connector reported production deploy `6ad5fcc65c43d750cebd7d5c` ready, built from GitHub main commit [`2dbfce1`](https://github.com/grantcharlie1000-tech/Qcc-games-/commit/2dbfce1bdf7b471bd6c510e5190b69fd0324d7a4) and published at 2026-10-19T11:19:48.900Z. It is a Git build (`manual_deploy: false`), created automatically after main advanced. No manual Netlify upload or build trigger was used.

The connected GitHub app published the source because shell Git credentials were unavailable. Main advanced without force, guarded by its expected previous SHA. The remote tree `922d987c5a2a00308d822adf87eacb836da5b905` exactly matches reviewed local source commit `c5259d6ac505586cf8fc2e270f7577f16aacf2de`, including the original game owners' reviewed follow-ups. Future pushes to main use the existing Netlify Git connection. No token or repository connection change is required from the user.

## Verified local build

Offline-pack version **43dc049b82cb**, 57 required requests, exactly 12 games and 20 Study chapters. [Static ZIP](evidence/mauri-gazette-netlify.zip) contains every required file plus `_headers`; sourcemaps and the internal Vite manifest are excluded. [Deployment state](evidence/netlify-deployment.json) records archive size and SHA256. [Release checks](DELIVERY.md) and [Study evidence](STUDY_MODE.md) describe actual testing.

The same output passed production offline interaction checks at `/` and `/Qcc-games-/`. GitHub Pages remains separately configured in `.github/workflows/pages.yml`; no Pages publication is claimed here.

## Verification limits and browser updates

Netlify deployment state is read through the requested connector. This environment's proxy rejects direct browser/HTTP access to the live origin, so live pages, host headers and offline download on that origin have not been independently tested. A ready deployment is publication evidence, not a substitute for those checks.

Existing offline tabs keep their old release until all arcade tabs close. Reopen to activate an available update; download the new offline pack on that browser and origin. Cache retention depends on browser/device policy and never bypasses network or device controls.
