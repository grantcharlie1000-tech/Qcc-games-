import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const list = [
  "ingame-glass",
  "clear-glass",
  "glass-visibility",
  "apple-glass",
  "glass-contrast-sampling",
  "liquid-glass",
  "live-glass",
  "lens-refraction",
  "glass-menus",
  "webgl-glass-lens",
];
const env = { ...process.env };
delete env.ARCADE_URL;
// Long measurements reuse the same locked assertions, with 30s scroll samples.
const long = spawnSync(
  process.execPath,
  ["scripts/check-liquid-glass.mjs", "--long"],
  { env, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 1800000 },
);
writeFileSync(
  "/workspace/liquid-glass/holdout-long.log",
  long.stdout + long.stderr,
);
const summary = JSON.parse(
  readFileSync("/workspace/liquid-glass/score-report.json", "utf8"),
);
let failed = summary.failures;
if (long.status !== 0) throw Error("Long measurement infrastructure failed");
const result = spawnSync(
  process.execPath,
  [
    "node_modules/@playwright/test/cli.js",
    "test",
    ...list.map((name) => `tests/e2e/${name}.spec.ts`),
    "--workers=1",
    "--reporter=json",
  ],
  { env, encoding: "utf8", maxBuffer: 30 * 1024 * 1024, timeout: 1800000 },
);
writeFileSync("/workspace/liquid-glass/holdout-existing.json", result.stdout);
const report = JSON.parse(result.stdout);
let count = 0;
const visit = (suite) => {
  for (const spec of suite.specs ?? [])
    for (const test of spec.tests ?? []) {
      count++;
      if (test.status === "unexpected" || test.status === "flaky") failed++;
    }
  for (const child of suite.suites ?? []) visit(child);
};
for (const suite of report.suites ?? []) visit(suite);
if (!count || report.errors?.length || result.status === null)
  throw Error(`Holdout infrastructure failed: ${result.stderr}`);
console.log(
  `Existing glass holdout: ${count} tests; full timing and existing assertion failures follow.`,
);
console.log(failed);
