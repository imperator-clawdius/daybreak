// Electron main process.
// Owns the hard invariant: the morning window cannot be closed until the
// renderer reports (via IPC) that every item has been wiped. The renderer
// computes that with @daybreak/core's canDismiss(); main trusts only the
// boolean it is told AND re-validates against the persisted board.
import { app, BrowserWindow, ipcMain, screen } from "electron";
import { join } from "node:path";
import {
  buildEveningSession,
  buildMorningSession,
  canDismiss,
  phaseForHour,
  type DayLog,
  type Phase,
} from "@daybreak/core";
import { Store } from "./store";

const SMOKE = process.env.DAYBREAK_SMOKE === "1";

const store = new Store(join(app.getPath("userData"), "daybreak.json"));
let win: BrowserWindow | null = null;
let dismissAllowed = false;
let smokeFailed = false;

function todaySession(now: Date): { phase: Phase; log: DayLog } {
  const phase = phaseForHour(now.getHours());
  const data = store.read();
  if (phase === "evening") {
    const todayKey = buildMorningSession(now, []).day;
    const existing = data.days.find((d) => d.day === todayKey);
    const log = existing
      ? buildEveningSession(existing)
      : buildMorningSession(now, data.days);
    return { phase, log };
  }
  // Morning: carry forward unresolved history into a fresh board.
  const history = data.days;
  return { phase, log: buildMorningSession(now, history) };
}

function createWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    // Smoke mode: small, hidden, non-intrusive so CI / verification never
    // hijacks the screen. Production: full-screen kiosk that owns the morning.
    width: SMOKE ? 800 : width,
    height: SMOKE ? 600 : height,
    show: !SMOKE,
    fullscreen: !SMOKE,
    frame: false,
    closable: true,
    alwaysOnTop: !SMOKE,
    skipTaskbar: false,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Surface any renderer-side failure as a smoke failure.
  win.webContents.on("console-message", (_e, level, message) => {
    if (level >= 3) {
      console.error("renderer error:", message);
      smokeFailed = true;
    }
  });
  win.webContents.on("render-process-gone", (_e, details) => {
    console.error("render process gone:", details.reason);
    smokeFailed = true;
  });

  // The gate: refuse close until a wiped board has been committed.
  win.on("close", (e) => {
    if (!dismissAllowed && !SMOKE) {
      e.preventDefault();
      win?.webContents.send("daybreak:nudge");
    }
  });

  win.loadFile(join(__dirname, "index.html"));

  if (SMOKE) {
    win.webContents.once("did-finish-load", () => {
      // Give the renderer's boot() (load + first save round-trip) time to run.
      setTimeout(() => {
        const data = store.read();
        const ok = !smokeFailed && data.version === 1;
        console.log(
          ok
            ? "DAYBREAK_SMOKE=pass renderer_loaded=true ipc_roundtrip=true"
            : "DAYBREAK_SMOKE=fail",
        );
        dismissAllowed = true;
        app.exit(ok ? 0 : 1);
      }, 2500);
    });
  }
}

ipcMain.handle("daybreak:load", () => {
  const now = new Date();
  dismissAllowed = false;
  const { phase, log } = todaySession(now);
  return { phase, log, now: now.toISOString() };
});

// Persist progress as the user wipes. Returns whether dismissal is now allowed.
ipcMain.handle("daybreak:save", (_evt, payload: { log: DayLog; phase: Phase }) => {
  const { log, phase } = payload;
  store.upsertDay(log);
  const ok = canDismiss(log.items, phase);
  dismissAllowed = ok;
  return { canDismiss: ok };
});

// Renderer asks to close after a confirmed-resolved board.
ipcMain.handle("daybreak:dismiss", (_evt, payload: { log: DayLog; phase: Phase }) => {
  const ok = canDismiss(payload.log.items, payload.phase);
  dismissAllowed = ok;
  if (ok) {
    store.setLastSeen(new Date().toISOString());
    win?.close();
  }
  return { closed: ok };
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // Single-shot ritual: quit once the board is cleared.
  if (process.platform !== "darwin") app.quit();
});
