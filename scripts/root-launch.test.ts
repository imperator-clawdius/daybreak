import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PackageJson = {
  main?: string;
  scripts?: Record<string, string>;
};

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;
}

describe("root desktop launch contract", () => {
  it("lets Electron launched from the repo root enter the desktop main process", () => {
    const packageJson = readPackageJson();

    expect(packageJson.main).toBe("desktop/dist/main.js");
  });

  it("offers npm start as the root desktop dev launcher", () => {
    const packageJson = readPackageJson();

    expect(packageJson.scripts?.start).toBe("npm run dev:desktop");
  });
});
