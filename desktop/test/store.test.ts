import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store, type PersistShape } from "../src/main/store";
import type { DayLog } from "@daybreak/core";

const tempDirs: string[] = [];

function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "daybreak-store-"));
  tempDirs.push(dir);
  return join(dir, "daybreak.json");
}

function log(day: string, text: string): DayLog {
  return {
    day,
    morningResolved: false,
    eveningResolved: false,
    items: [
      {
        id: `${day}-item`,
        text,
        day,
        state: "pending",
        createdDay: day,
        carryCount: 0,
      },
    ],
  };
}

function shape(day: string, text: string): PersistShape {
  return {
    version: 1,
    days: [log(day, text)],
    lastSeenIso: null,
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("Store", () => {
  it("recovers from a valid backup when the primary JSON is corrupt", () => {
    const file = tempFile();
    const backup = `${file}.bak`;
    const good = shape("2026-06-22", "ship");
    writeFileSync(file, "{", "utf8");
    writeFileSync(backup, JSON.stringify(good, null, 2), "utf8");

    expect(new Store(file).read()).toEqual(good);
  });

  it("recovers from backup when the primary JSON has malformed day logs", () => {
    const file = tempFile();
    const good = shape("2026-06-22", "ship");
    writeFileSync(
      file,
      JSON.stringify({ version: 1, days: [{ day: "2026-06-22" }] }),
      "utf8",
    );
    writeFileSync(`${file}.bak`, JSON.stringify(good, null, 2), "utf8");

    expect(new Store(file).read()).toEqual(good);
  });

  it("keeps the previous valid store as a backup after replacing it", () => {
    const file = tempFile();
    const store = new Store(file);
    const previous = shape("2026-06-22", "ship");
    const next = shape("2026-06-23", "sell");

    store.write(previous);
    store.write(next);

    expect(JSON.parse(readFileSync(`${file}.bak`, "utf8"))).toEqual(previous);
    expect(store.read()).toEqual(next);
  });

  it("does not overwrite a valid backup with a corrupt primary during recovery writes", () => {
    const file = tempFile();
    const recovered = shape("2026-06-22", "ship");
    const next = shape("2026-06-23", "sell");
    writeFileSync(file, "{", "utf8");
    writeFileSync(`${file}.bak`, JSON.stringify(recovered, null, 2), "utf8");

    const store = new Store(file);
    expect(store.read()).toEqual(recovered);
    store.write(next);

    expect(JSON.parse(readFileSync(`${file}.bak`, "utf8"))).toEqual(recovered);
    expect(store.read()).toEqual(next);
  });

  it("does not leave a temp write file behind after a successful write", () => {
    const file = tempFile();
    const temp = `${file}.tmp`;

    new Store(file).write(shape("2026-06-22", "ship"));

    expect(existsSync(temp)).toBe(false);
  });
});
