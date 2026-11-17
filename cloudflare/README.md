# Cloudflare Workers entry (preparation, not live)

Runs the same QCC handlers on Cloudflare Workers with the built `dist/` as static assets.
Nothing here is wired into Netlify or the GitHub Pages workflow, and root `package.json` is unchanged.

- Build the site first: `cd .. && npm ci && npm run build`
- Check the bundle: `npm ci && npm run check` (dry run, no account needed)
- Before any real deploy: create a Hyperdrive config for Postgres and replace the placeholder id in `wrangler.jsonc`; set secrets `TMDB_READ_TOKEN`, `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN`.
- Rate limits: Worker-side `ratelimits` bindings (accounts 600/min, leaderboard 300/min, turn 20/min per IP) replace the Netlify rules; the Worker returns 503 if a binding is missing. Counts are approximate per Cloudflare location. Free-plan availability of the binding is not yet confirmed.
- Existing draft PR #72 (standalone Postgres) is compatible: handlers and netlify/lib/runtime.mts are unchanged; a new database needs the `qcc_environment` marker row when `allowMissingMarker` is false.
