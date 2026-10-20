# Retained legacy clients upgrade to the current 15-game release

An existing production-class client can retain its 13-game shell after an ordinary reload while the server has a newer release. This local comparison uses authentic source builds and the same persistent profile for a failing current-main baseline followed by the update candidate. It passes at both `/` and `/Qcc-games-/` on Chromium 154.0.8037.57.

## Inputs and identity

- Legacy source: `0cec65902d85570640ec7e1b7a3c817a6b59f2aa`, entry `assets/index-C_SjeUHA.js`, pack `ffcdb1e5c685`.
- Current unmodified main: `bad65ea564d1c9ad65a1e10193e9d66782032316`, entry `assets/index-UE6I1vKs.js`, pack `34b865fc098c`, 15 games including Globle.
- Candidate code: `dc98dcc202bc03a1d48abfd019653ad41baa2844`, entry `assets/index-OtXyNVjA.js`, pack `075bc0982680`, 15 games including Globle.
- The recovered product source has tree `dd8288710fb114c151ef27d11013081078b717cc`; integration with current main is commit `c59c91867cb7fff27b0172af4460b85794433736`. The final driver commit only generalizes explicit comparison inputs and preserves failed profiles.
- Globle/main game source, covers, game tests, catalog/types, viewport code, dependency lock and Vite aliases are unchanged by the integration. The existing web app manifest is unchanged. Pages deployment remains removed.

## Observed comparison

For each scope, the driver opens the genuine legacy release, downloads its offline pack, saves a real Fruit Merge action and preferences, and restarts Chromium with the same profile. Both original documents remain open during the subsequent baseline and candidate upgrades.

The current-main baseline installs as a waiting worker while the legacy worker remains active. An ordinary reload still returns 13 cards and the old entry. The actual required-content assertion fails with `13 !== 15`; an independent HTTP request serves the current 15-game entry. This expected failure is retained in the results.

The candidate then activates with both original documents still retained. A new tab displays all 15 cards, including separate Neon Coil and Globle links, and the candidate entry. Both old documents keep their identity. With network disabled, the old entry and Ball Run lazy chunk remain byte-for-byte available even though neither is present on the candidate server. The retained old Fruit Merge game accepts a second real action.

An ordinary reload upgrades that game to the candidate entry. A further actual Chromium/profile restart preserves its progress, preferences, best score, favourite and test cookie. No storage clearing, unregister operation or old-tab closure is used to make activation succeed.

`results.json` contains the two completed scope results. The screenshots show the stale baseline, the new 15-game catalog and the retained game. Raw request logs, six traces and complete execution checkpoints are retained in the validation workspace; they are not claimed as transferred historical evidence.

## Validation and limits

At the candidate code commit: 364 unit tests, seven native-helper tests, TypeScript/production build and the complete retained-profile comparison passed. The driver retains its original 15-second behavior polls and validates explicit expected counts instead of deriving acceptance from observed content. Failed profiles are retained for diagnosis.

The historical 13-to-14 comparison remains separate. Synthetic W/D activation stalls are still unclassified; this result does not establish their cause or a causal repair. These are owned local-profile observations, including local worker/cache queries; no production worker/cache state is asserted. The actual retained production tab still requires parent verification after a green, reviewed merge.

Current main's independent run `39499331149` failed five Globle WebKit behavior assertions (373 passed, 18 skipped). Their causes are not classified by this comparison. Globle source and assertions are preserved; full hosted verification remains a merge gate.
