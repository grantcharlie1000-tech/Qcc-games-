# Cloudflare Pages production publishing

The live arcade is https://nceastudy.pages.dev. Its project name is `nceastudy`.
A successful GitHub build alone does not publish that site.

The `build` job in `.github/workflows/pages.yml` now publishes after its existing
unit tests, production build, noindex checks and returning-visitor recovery checks
succeed. Publication runs only for `main`, including a manual workflow dispatch
on `main`; pull requests and `work` never publish to production. The separate
full browser suites continue to run and report their results.

## Credentials

Add these in the repository's Settings → Secrets and variables → Actions:

- `CLOUDFLARE_API_TOKEN`: Account → Cloudflare Pages → Edit for the account
  owning the existing project.
- `CLOUDFLARE_ACCOUNT_ID`: that account's ID.

The workflow reads the existing project's production branch and targets that
branch with the checked-out `main` build. It does not create a project or change
Cloudflare's configuration or application secrets. Any authorized agent that
can merge this repository can trigger the same publisher without seeing the
deployment token. Never commit `.env` files or paste tokens in workflow YAML.

## What is published

The static `dist/` output plus its compiled `_worker.js`, `_routes.json` and
headers are published together. The Worker preserves the existing Movies route
and accounts/leaderboard/TURN proxy; a static-only upload would omit those APIs.
Existing Cloudflare bindings such as `TMDB_READ_TOKEN`, `QCC_API_ORIGIN` and
`QCC_PROXY_SECRET` remain configured on the project.

Each production build also creates `deploy-info.json` with its source commit.
The workflow requires a production deployment and checks that the public URL
serves that same commit. Only then does the publishing step finish successfully.

The `nceastudy-pages-production` Actions artifact contains an upload-ready build
even if publishing is blocked by missing credentials. It includes the compiled
Pages Worker. A local bundle is not evidence that production has been updated;
check the workflow's production verification or the live `deploy-info.json`.
