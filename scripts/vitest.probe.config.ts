import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['scripts/heavy-sim-probe.test.ts'], testTimeout: 180000, hookTimeout: 180000 } });
