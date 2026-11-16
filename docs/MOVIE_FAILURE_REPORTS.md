# Opt-in movie playback failure reports

The external FrameXTV player runs in a cross-origin iframe. The app cannot inspect its internal DNS queries, HTTP failures, stream hosts, or error pages. Do not diagnose DNS blocking from an iframe timeout alone.

## Enable email delivery

In **Cloudflare Pages → nceastudy → Settings → Variables and Secrets**, configure these four values in the environment used for testing (Production or Preview), then deploy the matching branch:

| Name | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Secret API key for the Resend email service |
| `QCC_MOVIE_REPORT_TO` | Owner's email address where reports arrive |
| `QCC_MOVIE_REPORT_FROM` | Verified Resend sender address, e.g. `QCC Alerts <alerts@your-verified-domain.example>` |
| `QCC_MOVIE_REPORT_CODE` | Private, random 24 to 128 character alphanumeric/underscore/hyphen code, ideally 32+ random characters |

Never put these values in the repository, `VITE_` variables, URLs or public front-end assets. Do not share the Resend API key or sender configuration with testers. Share **only the diagnostic code** privately with a trusted tester. Rotate the code after the investigation. The API refuses to send any emails until all four values are set.

To generate a random diagnostic code locally with Node: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`.

## How to test

1. The tester opens NCEAstudy, selects a movie, and clicks Play.
2. In **Before you watch**, they actively select **Send error report if playback fails**, enter the diagnostic code, then Continue. Leaving it unchecked sends nothing.
3. If FrameXTV's iframe does not load in 15 seconds, or loads but never sends the ready signal within 12 seconds, the browser posts the failure to the same-origin endpoint `/api/movie-failure-report`.
4. If the iframe claims it is ready but never reports playback progress, an opt-in diagnostic is sent after 30 seconds. This is a **possible stall**, not proof of a failed request or filtering. Browser autoplay restrictions can cause it too.
5. The player shows **Diagnostic sent** only when the email API accepted the report, otherwise **Diagnostic could not be sent**.

Each attempt sends at most one report. The tester's choice is held in memory for that playback and is not saved to localStorage, accounts or cookies.

Email content includes **UTC timestamp, failure reason, last player stage and the browser's online/offline flag**. It excludes account names, user/session identifiers, IP addresses, title/episode identifiers, URLs and viewing history. Like any website, the origin host may still process the visitor's IP as part of the normal network connection, but this implementation does not include it in the email. The server rejects extra fields, large bodies, wrong origins, unknown reasons, and incorrect diagnostic codes. The code is used only to authorize this one email destination. It is not included in the email.

Report categories: `frame-load-timeout`, `frame-ready-timeout`, `frame-error`, `frame-csp-blocked` and `no-playback-after-ready`. The last category is observational. Browser `iframe.onload` can fire for failed cross-origin navigations, so categories do not directly identify DNS blocks.

**Operations:** The report code limits unauthorised use but is not a substitute for rate limiting. Configure a Cloudflare WAF/rate-limit rule on `/api/movie-failure-report` (for example, limit a single IP to a handful of posts per minute), monitor email delivery and disable the feature by removing a binding after testing. A school's public IP may be shared by many users, so avoid excessively strict rules.
