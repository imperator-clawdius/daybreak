import {
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPackageWithOptions, extractAll } from "@electron/asar";

const FORBIDDEN_MANIFEST_KEYS = ["build", "devDependencies", "scripts"];

export function slimPackageManifest(manifest) {
  const slimmed = { ...manifest };
  for (const key of FORBIDDEN_MANIFEST_KEYS) {
    delete slimmed[key];
  }
  return slimmed;
}

function rewriteManifest(path) {
  if (!existsSync(path)) return false;
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  const slimmed = slimPackageManifest(manifest);
  writeFileSync(`${path}.tmp`, `${JSON.stringify(slimmed, null, 2)}\n`, "utf8");
  renameSync(`${path}.tmp`, path);
  return true;
}

export async function slimPackagedManifests(appOutDir) {
  const asarPath = join(appOutDir, "resources", "app.asar");
  if (!existsSync(asarPath)) return { rewritten: [] };

  const tempDir = mkdtempSync(join(tmpdir(), "daybreak-asar-slim-"));
  try {
    extractAll(asarPath, tempDir);
    const manifestPaths = [
      join(tempDir, "package.json"),
      join(tempDir, "node_modules", "@daybreak", "core", "package.json"),
    ];
    const rewritten = manifestPaths.filter(rewriteManifest);
    await createPackageWithOptions(tempDir, `${asarPath}.tmp`, {});
    renameSync(`${asarPath}.tmp`, asarPath);
    return { rewritten };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export default async function afterPack(context) {
  await slimPackagedManifests(context.appOutDir);
}
