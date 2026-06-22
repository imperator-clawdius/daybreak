import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type LockPackage = {
  version?: string;
};

type PackageLock = {
  packages?: Record<string, LockPackage>;
};

function readPackageLock(): PackageLock {
  return JSON.parse(readFileSync("package-lock.json", "utf8")) as PackageLock;
}

function parseVersion(version: string): [number, number, number] {
  const [major = "0", minor = "0", patch = "0"] = version.split(".");
  return [Number(major), Number(minor), Number(patch)];
}

function versionAtLeast(version: string, minimum: string): boolean {
  const currentParts = parseVersion(version);
  const minimumParts = parseVersion(minimum);

  for (let index = 0; index < minimumParts.length; index += 1) {
    if (currentParts[index] > minimumParts[index]) {
      return true;
    }

    if (currentParts[index] < minimumParts[index]) {
      return false;
    }
  }

  return true;
}

describe("dependency security posture", () => {
  it("keeps all locked PostCSS packages on the patched CSS stringify release", () => {
    const packages = readPackageLock().packages ?? {};
    const postcssPackages = Object.entries(packages)
      .filter(([packagePath]) => packagePath.endsWith("node_modules/postcss"))
      .map(([packagePath, packageInfo]) => ({
        packagePath,
        version: packageInfo.version ?? "0.0.0",
      }));

    expect(postcssPackages.length).toBeGreaterThan(0);

    const vulnerablePackages = postcssPackages
      .filter(({ version }) => !versionAtLeast(version, "8.5.10"))
      .map(({ packagePath, version }) => `${packagePath}@${version}`);

    expect(vulnerablePackages).toEqual([]);
  });
});
