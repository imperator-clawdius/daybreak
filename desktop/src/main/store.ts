// Local persistence for Daybreak.
//
// v1 ships a single local JSON file in the OS user-data dir — no cloud, no
// auth, no telemetry, which is the user-facing promise. The DayLog[] shape is
// storage-agnostic on purpose: a SQLite-backed Store is a drop-in replacement
// behind this same interface (see docs/COMPLETION.md → known deviations).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { DayLog } from "@daybreak/core";

export interface PersistShape {
  version: 1;
  days: DayLog[];
  lastSeenIso: string | null;
}

const EMPTY: PersistShape = { version: 1, days: [], lastSeenIso: null };

export class Store {
  constructor(private readonly file: string) {}

  read(): PersistShape {
    if (!existsSync(this.file)) return { ...EMPTY };
    try {
      const raw = JSON.parse(readFileSync(this.file, "utf8"));
      if (raw && raw.version === 1 && Array.isArray(raw.days)) {
        return raw as PersistShape;
      }
      return { ...EMPTY };
    } catch {
      // Corrupt file should never brick the morning ritual.
      return { ...EMPTY };
    }
  }

  write(data: PersistShape): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(data, null, 2), "utf8");
  }

  upsertDay(day: DayLog): PersistShape {
    const current = this.read();
    const days = current.days.filter((d) => d.day !== day.day);
    days.push(day);
    days.sort((a, b) => (a.day < b.day ? -1 : 1));
    const next: PersistShape = { ...current, days };
    this.write(next);
    return next;
  }

  setLastSeen(iso: string): void {
    const current = this.read();
    this.write({ ...current, lastSeenIso: iso });
  }
}
