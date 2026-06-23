import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanReleaseSidecars } from "./release-core.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const releaseDir = join(root, "desktop", "release");
const result = cleanReleaseSidecars({ releaseDir });

for (const removedPath of result.removedPaths) {
  console.log(`removed ${removedPath}`);
}
