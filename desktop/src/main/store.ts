// Local persistence for Daybreak.
//
// v1 ships a single local JSON file in the OS user-data dir — no cloud, no
// auth, no telemetry, which is the user-facing promise. The DayLog[] shape is
// storage-agnostic on purpose: a SQLite-backed Store is a drop-in replacement
// behind this same interface (see docs/COMPLETION.md → known deviations).
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { isPersistedDayLogArray, type DayLog } from "@daybreak/core";

export interface PersistShape {
  version: 1;
  days: DayLog[];
  lastSeenIso: string | null;
}

const EMPTY: PersistShape = { version: 1, days: [], lastSeenIso: null };

function asPersistShape(raw: unknown): PersistShape | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as PersistShape;
  if (
    candidate.version === 1 &&
    isPersistedDayLogArray(candidate.days) &&
    (candidate.lastSeenIso === null || typeof candidate.lastSeenIso === "string")
  ) {
    return candidate;
  }
  return null;
}

export class Store {
  constructor(private readonly file: string) {}

  read(): PersistShape {
    const primary = this.readFile(this.file);
    if (primary) return primary;

    const backup = this.readFile(this.backupFile());
    if (backup) return backup;

    return { ...EMPTY };
  }

  private backupFile(): string {
    return `${this.file}.bak`;
  }

  private tempFile(): string {
    return `${this.file}.tmp`;
  }

  private readFile(file: string): PersistShape | null {
    if (!existsSync(file)) return null;
    try {
      return asPersistShape(JSON.parse(readFileSync(file, "utf8")));
    } catch {
      // Corrupt file should never brick the morning ritual.
      return null;
    }
  }

  write(data: PersistShape): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = this.tempFile();
    const hasValidPrimary = this.readFile(this.file) !== null;
    writeFileSync(temp, JSON.stringify(data, null, 2), "utf8");
    if (hasValidPrimary) {
      copyFileSync(this.file, this.backupFile());
    }
    renameSync(temp, this.file);
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
