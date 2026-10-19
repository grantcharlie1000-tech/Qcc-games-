# Netlify publication handoff

The requested newspaper-style name was `the-daily-ledger`. It was already taken, so Netlify created **the-daily-ledger-kh16** in the connected `grantcharlie1000` team.

- Project dashboard: https://app.netlify.com/projects/the-daily-ledger-kh16
- Site ID: `4afc912c-6802-4c18-8f2c-273fb3e771ee`
- Prepared upload: [the-daily-ledger-kh16-netlify.zip](evidence/the-daily-ledger-kh16-netlify.zip)
- Artifact/deployment status: [netlify-deployment.json](evidence/netlify-deployment.json)

**The arcade has not been published to this project.** Creating the project does not establish that it serves the arcade. No deployed-page or live offline verification is claimed.

## Publication blocker

The connected Netlify tools can create and inspect a project, but expose no operation for uploading a deployment. The installed official Netlify CLI reported `NOT_LOGGED_IN`, and the environment has no configured `NETLIFY_AUTH_TOKEN`. A request to `https://api.netlify.com/api/v1/sites` failed at the environment proxy with HTTP403. The enforced cloud policy currently permits package hosts, not Netlify's API or this site's origin.

The user subsequently specified **use the connector**. That is the selected publication route. Its actual available deployment actions are `netlify_deploy_get_deploy` and `netlify_deploy_get_deploy_for_site`, both read-only. The new-project action explicitly creates an empty project. There is no available connector operation for uploading files, creating a deploy, connecting a source repository, or triggering a build. The available tool inventory was checked again after that instruction; plugin discovery did not reveal another Netlify deployment connector. No additional project was created and no unrelated site was modified.

No token is requested for this connector-only route. A connector upload/create-deploy action must be available before the agent can finish publication through it. The earlier CLI checks establish a separate fallback's limitations, not a missing authorization for the connected Netlify account. Local `.netlify/state.json` identifies the created site and is excluded from Git by the existing `.netlify/` rule.

Alternatively, open the project dashboard's Deploys tab and upload the prepared static folder (extract the ZIP first if the upload control requests a folder). The ZIP contains `index.html` at its root, all required chunks, local graphics/font, licence notices, manifest, service worker and Netlify `_headers`. It excludes sourcemaps and the internal Vite manifest. The `_headers` file matches the existing `netlify.toml` security and service-worker caching rules for manual uploads.

## Build evidence

A fresh strict TypeScript/Vite build passed for this request. The prepared pack remains version `bf379fc014bf` with all 57 required requests accounted for; host header configuration is deliberately excluded from the offline manifest. All earlier gameplay/offline verification still refers to that same game build; see [DELIVERY.md](DELIVERY.md). The archive was checked for every required manifest file and for exact header values from `netlify.toml`. Those local checks do not replace verification of a successfully published Netlify origin.
