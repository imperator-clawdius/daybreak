import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readRepoFile = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), "utf8");

describe("local data documentation", () => {
  it("documents the buyer backup and deletion path", () => {
    const guide = readRepoFile("docs", "LOCAL_DATA.md");

    expect(guide).toContain("%APPDATA%\\Daybreak\\daybreak.json");
    expect(guide).toContain("daybreak.json.bak");
    expect(guide).toContain("daybreak.json.tmp");
    expect(guide).toContain("Quit Daybreak");
    expect(guide).toContain("Delete `daybreak.json` and `daybreak.json.bak`");
    expect(guide).toMatch(/Uninstalling the app\s+does not prove/);
    expect(guide).toContain("founder@daybreak.rest");
  });

  it("keeps the README linked to the local data guide", () => {
    const readme = readRepoFile("README.md");

    expect(readme).toContain("docs/LOCAL_DATA.md");
    expect(readme).toContain("manual delete/backup path");
  });

  it("keeps buyer-facing legal copy explicit about local data removal", () => {
    const privacy = readRepoFile("site", "app", "privacy", "page.tsx");
    const license = readRepoFile(
      "desktop",
      "assets",
      "installer-license.txt",
    );

    for (const copy of [privacy, license]) {
      expect(copy).toContain("%APPDATA%\\Daybreak\\daybreak.json");
      expect(copy).toContain("daybreak.json.bak");
      expect(copy).toContain("delete");
    }

    expect(license).toContain("Uninstalling the app does not prove");
  });
});
