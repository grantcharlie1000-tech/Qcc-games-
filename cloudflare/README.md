# Cloudflare Workers entry (preparation, not live)

Runs the same QCC handlers on Cloudflare Workers with the built `dist/` as static assets.
Nothing here is wired into Netlify or the GitHub Pages workflow, and root `package.json` is unchanged.

- Build the site first: `cd .. && npm ci && npm run build`
- Check the bundle: `npm ci && npm run check` (dry run, no account needed)
- Before any real deploy: create a Hyperdrive config for Postgres and replace the placeholder id in `wrangler.jsonc`; set secrets `TMDB_READ_TOKEN`, `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN`.
- Still to do before cutover: replace Netlify per-IP rate limits for accounts (600/min), leaderboard (300/min) and turn (20/min) with Worker-side limits.
