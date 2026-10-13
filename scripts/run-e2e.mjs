process.env.RUN_E2E = "1";
import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["vitest", "run", "tests/e2e.test.ts"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});
process.exit(result.status ?? 1);
