import { spawnSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import contract from "../tests/liquid-glass-score/contract.json" with { type: "json" };
const output = "/workspace/liquid-glass";
mkdirSync(output, { recursive: true });
// No external server, grep, project selection, retry or cached report can reduce coverage.
const env = {
  ...process.env,
  LIQUID_GLASS_LONG: process.argv.includes("--long") ? "1" : "0",
};
for (const key of [
  "ARCADE_URL",
  "PLAYWRIGHT_JSON_OUTPUT_NAME",
  "PLAYWRIGHT_JSON_OUTPUT_FILE",
  "CI",
  "CHROMIUM_PATH",
  "BLOCKCRAFT_HEADED",
  "BLOCKCRAFT_BROWSER_CHANNEL",
])
  delete env[key];
const run = spawnSync(
  process.execPath,
  [
    "node_modules/@playwright/test/cli.js",
    "test",
    "--config=tests/liquid-glass-score/playwright.config.ts",
  ],
  { env, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: process.argv.includes("--long") ? 1800000 : 1000000 },
);
writeFileSync(`${output}/score-playwright.json`, run.stdout || "");
let failures = 0,
  infrastructure = false;
const measurements = [];
const expected = new Set([
  "chromium/1280",
  "chromium/390",
  "webkit/1280",
  "webkit/390",
]);
try {
  const report = JSON.parse(run.stdout);
  const visit = (suite) => {
    for (const spec of suite.specs ?? [])
      for (const test of spec.tests ?? [])
        for (const result of test.results ?? [])
          for (const attachment of result.attachments ?? [])
            if (attachment.name === "liquid-glass-measurements") {
              const data = JSON.parse(
                attachment.body
                  ? Buffer.from(attachment.body, "base64")
                  : readFileSync(attachment.path),
              );
              const key = `${data.engine}/${data.width}`;
              if (!expected.delete(key))
                throw Error(`Duplicate or unexpected matrix ${key}`);
              const ids = new Set();
              for (const id of contract.ids) {
                const rows = data.assertions.filter((r) => r.id === id);
                if (rows.length !== 1 || typeof rows[0].pass !== "boolean") {
                  failures++;
                  infrastructure = true;
                  continue;
                }
                ids.add(id);
                const row = rows[0];
                measurements.push({ matrix: key, ...row });
                if (!row.pass) {
                  failures++;
                  console.log(
                    `FAIL ${key} ${id}: ${JSON.stringify(row.evidence)}`,
                  );
                }
              }
              if (data.assertions.length !== ids.size)
                throw Error("Unexpected assertion coverage");
            }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);
  if (run.status !== 0 || report.errors?.length) {
    infrastructure = true;
    console.error(
      "Playwright infrastructure failed",
      JSON.stringify(report.errors),
      run.stderr,
    );
    failures++;
  }
} catch (error) {
  infrastructure = true;
  failures++;
  console.error(String(error), run.stderr);
}
for (const missing of expected) {
  infrastructure = true;
  failures += contract.ids.length;
  console.error(`Missing matrix ${missing}`);
}
writeFileSync(
  `${output}/score-report.json`,
  JSON.stringify(
    { failures, infrastructure, assertions: measurements },
    null,
    2,
  ),
);
console.log(
  `Assertions: ${measurements.length}. WebKit uses frost and is exempt from displacement; its visibility, usability and contrast still score.`,
);
console.log(failures);
if (infrastructure) process.exitCode = 2;
