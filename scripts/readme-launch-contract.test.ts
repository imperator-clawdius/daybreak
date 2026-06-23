import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("README launch contract", () => {
  it("documents the packaged Windows app launch path separately from dev Electron launch", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toContain("## Launch locally");
    expect(readme).toContain("npm start");
    expect(readme).toContain(
      '& "desktop\\release\\win-unpacked\\Daybreak.exe"',
    );
    expect(readme).toContain("Do not rely on a global `electron` command");
  });
});
