import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {
  ...process.env,
  DAYBREAK_AUTO_START: "0",
  DAYBREAK_BETA: "0",
};

delete env.DAYBREAK_BETA_TESTER;
delete env.DAYBREAK_BETA_BUILD_ID;

execSync("npm run package -w @daybreak/desktop", {
  cwd: repo,
  env,
  stdio: "inherit",
  shell: true,
});
