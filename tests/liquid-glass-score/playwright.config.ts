import { defineConfig } from "@playwright/test";
import base from "../../playwright.config";
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: ["score.spec.ts", "pixels.spec.ts"],
  workers: 1,
  retries: 0,
  timeout: process.env.LIQUID_GLASS_LONG === "1" ? 600000 : 240000,
  projects: base.projects!.map((project) => ({
    ...project,
    use: { ...project.use, deviceScaleFactor: 1 },
  })),
  reporter: "json",
  outputDir: "../../test-results/liquid-glass-score",
  use: {
    ...base.use,
    deviceScaleFactor: 1,
    colorScheme: "dark",
    trace: "off",
    screenshot: "off",
  },
  webServer: {
    command: "npm run dev -- --port 4600 --strictPort",
    url: "http://127.0.0.1:4600",
    reuseExistingServer: false,
  },
});
