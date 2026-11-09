# Cloudflare Pages publishing

The live arcade is https://nceastudy.pages.dev. Its project name is `nceastudy`.
A successful GitHub build alone does not publish that site.

Normal production publication uses Cloudflare's Git integration on `production`.
`.github/workflows/pages.yml` runs verification; it does not publish.
The manual `.github/workflows/publish-arcade.yml` workflow supports production
recovery and isolated play-tests. Leave `preview_branch` empty on `production`
for recovery. To publish a feature branch for testing, dispatch that workflow
on the feature ref with a name such as `last-light-playtest` in `preview_branch`.
Preview names accept 1–40 lowercase letters, digits and hyphens. The workflow
rejects `production` as a preview target and does not change the live site.

## Credentials

Add these in the repository's Settings → Secrets and variables → Actions:

- `CLOUDFLARE_API_TOKEN`: Account → Cloudflare Pages → Edit for the account
  owning the existing project.
- `CLOUDFLARE_ACCOUNT_ID`: that account's ID.

The workflow validates the existing project's production branch and targets either
that branch with the checked-out `production` build or the named preview with
the selected feature build. It does not create a project or change Cloudflare's
configuration or application secrets. Any authorized agent that
can merge this repository can trigger the same publisher without seeing the
deployment token. Never commit `.env` files or paste tokens in workflow YAML.

## What is published

The static `dist/` output plus its compiled `_worker.js`, `_routes.json` and
headers are published together. The Worker preserves the existing Movies route
and accounts/leaderboard/TURN proxy; a static-only upload would omit those APIs.
Existing Cloudflare bindings such as `TMDB_READ_TOKEN`, `QCC_API_ORIGIN` and
`QCC_PROXY_SECRET` remain configured on the project.

Each manual build creates `deploy-info.json` with its source commit and branch.
The workflow requires the expected deployment environment and checks that the
production URL or immutable preview URL serves that same commit. Only then does
the publishing step finish successfully. Its summary links to the Last Light game.
Preview deployments use the project's existing preview bindings; production-only
API bindings are not copied or changed for play-tests.

The `nceastudy-pages-production` or `nceastudy-pages-<preview>` artifact contains an upload-ready build
even if publishing is blocked by missing credentials. It includes the compiled
Pages Worker. A local bundle is not evidence that production has been updated;
check the workflow's production verification or the live `deploy-info.json`.
