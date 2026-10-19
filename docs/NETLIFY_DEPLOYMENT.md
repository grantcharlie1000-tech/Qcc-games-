# Mauri Gazette — GitHub continuous deployment

[Live site](https://mauri-gazette.netlify.app) · [Netlify project](https://app.netlify.com/projects/mauri-gazette) · [GitHub source](https://github.com/grantcharlie1000-tech/Qcc-games-)

Project `mauri-gazette`, site ID `4afc912c-6802-4c18-8f2c-273fb3e771ee`. Production branch: **main**. Build: `npm run build`; publish: `dist`; base: repository root; Node.js 22. These settings are supplied by `netlify.toml`.

## Observed publication

The Netlify connector reports production deploy `6ad5f146ee5b92088567adcc` ready, built from GitHub main commit `d6951917923c391b522b013136f334744f3d040e` and published at 2026-10-19T10:30:48.411Z. This supersedes the earlier record that the arcade was unpublished. It is a Git build (`manual_deploy: false`).

Study Mode's new source is being published to main; its automatic production update is not yet claimed in this record. The connector will be checked against the new source commit before that claim is made. No account token or repository connection change is required from the user.

## Verified local build

Offline-pack version **43dc049b82cb**, 57 required requests, exactly 12 games and 20 Study chapters. [Static ZIP](evidence/mauri-gazette-netlify.zip) contains every required file plus `_headers`; sourcemaps and the internal Vite manifest are excluded. [Deployment state](evidence/netlify-deployment.json) records archive size and SHA256. [Release checks](DELIVERY.md) and [Study evidence](STUDY_MODE.md) describe actual testing.

The same output passed production offline interaction checks at `/` and `/Qcc-games-/`. GitHub Pages remains separately configured in `.github/workflows/pages.yml`; no Pages publication is claimed here.

## Verification limits and browser updates

Netlify deployment state is read through the requested connector. This environment's proxy rejects direct browser/HTTP access to the live origin, so live pages, host headers and offline download on that origin have not been independently tested. A ready deployment is publication evidence, not a substitute for those checks.

Existing offline tabs keep their old release until all arcade tabs close. Reopen to activate an available update; download the new offline pack on that browser and origin. Cache retention depends on browser/device policy and never bypasses network or device controls.
