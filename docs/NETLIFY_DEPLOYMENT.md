# Mauri Gazette — GitHub continuous deployment

Netlify project: **Mauri Gazette**, slug `mauri-gazette`. The existing project was renamed through the connected Netlify app; the site ID is unchanged. Local `.netlify/` linkage is excluded from Git.

- [Netlify project](https://app.netlify.com/projects/mauri-gazette)
- Site ID: `4afc912c-6802-4c18-8f2c-273fb3e771ee`
- [GitHub repository](https://github.com/grantcharlie1000-tech/Qcc-games-), production branch **main**
- Build command: `npm run build`
- Publish directory: `dist`
- Base directory: repository root
- Node.js: 22, set in `netlify.toml`
- [Prepared static ZIP](evidence/mauri-gazette-netlify.zip), for review or manual upload
- [Recorded deployment state](evidence/netlify-deployment.json)

## One-time repository connection

The requested update policy is Netlify Git continuous deployment: each push to GitHub `main` builds the repository and publishes the resulting `dist/` to this same Netlify site. This does not require an application token or a backend in the arcade.

**The Git connection is not configured yet, and the arcade is not published on this Netlify project.** The connector successfully creates, renames and inspects projects, but its available actions omit repository linking, build-setting updates, build triggering and deployment uploads. It cannot establish Git continuous deployment in this session. No claim is made that the automatic update policy is already active.

In the project dashboard, link the GitHub repository `grantcharlie1000-tech/Qcc-games-`, choose `main` as the production branch, and use the build/publish settings above. The checked-in `netlify.toml` already supplies the command, output directory, Node version and headers. Once that one-time connection is saved, Netlify handles subsequent `main` pushes automatically. The agent can then inspect deployment status through the connector.

No token is requested for this connector-based setup. GitHub Pages deployment remains separately configured by `.github/workflows/pages.yml`; enabling Netlify does not require changing the game routes or assets.

## Verified build

The ready build is offline-pack version `bf379fc014bf`, with 57 required requests and all twelve games. The upload ZIP contains the required files plus Netlify `_headers`, and excludes sourcemaps and the internal Vite manifest. Header values match `netlify.toml`. See [the full game verification report](DELIVERY.md) for actual logic/browser/offline results and the outstanding WebKit/physical-device checks.

A future Netlify build's first published URL, headers, all twelve routes and offline download still need live-origin verification. Existing offline tabs activate a waiting game release after those tabs close; each release's complete offline pack must be downloaded on that origin.
