// Electron main process.
// Owns the hard invariant: the morning window cannot be closed until the
// renderer reports (via IPC) that every item has been wiped. The renderer
// computes that with @daybreak/core's canDismiss(); main trusts only the
// boolean it is told AND re-validates against the persisted board.
import { app, BrowserWindow, ipcMain, screen } from "electron";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildEveningSession,
  buildMorningSession,
  canDismiss,
  isAllowedDesktopNavigation,
  phaseForHour,
  planStartupRegistration,
  resolveLogForPhase,
  validateLogUpdate,
  type DayLog,
  type Phase,
} from "@daybreak/core";
import { Store } from "./store";

const SMOKE = process.env.DAYBREAK_SMOKE === "1";
const SMOKE_NOW = "2026-06-22T09:00:00.000Z";
const SMOKE_COMMIT_TEXT = `Daybreak smoke ${process.pid}`;

if (SMOKE) {
  app.setPath("userData", join(tmpdir(), `daybreak-smoke-${process.pid}`));
}

const store = new Store(join(app.getPath("userData"), "daybreak.json"));
let win: BrowserWindow | null = null;
let activeSession: { phase: Phase; log: DayLog } | null = null;
let dismissAllowed = false;
let smokeFailed = false;

function nowForSession(): Date {
  if (!SMOKE) return new Date();
  const raw = process.env.DAYBREAK_SMOKE_NOW ?? SMOKE_NOW;
  const forced = new Date(raw);
  return Number.isNaN(forced.getTime()) ? new Date(SMOKE_NOW) : forced;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const entryFile = join(__dirname, "index.html");
  const entryUrl = pathToFileURL(entryFile).toString();

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
      sandbox: true,
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
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, targetUrl) => {
    if (!isAllowedDesktopNavigation(entryUrl, targetUrl)) {
      event.preventDefault();
    }
  });

  // The gate: refuse close until a wiped board has been committed.
  win.on("close", (e) => {
    if (!dismissAllowed && !SMOKE) {
      e.preventDefault();
      win?.webContents.send("daybreak:nudge");
    }
  });

  win.loadFile(entryFile);

  if (SMOKE) {
    win.webContents.once("did-finish-load", () => {
      void runSmokeFlow();
    });
  }
}

async function runSmokeFlow(): Promise<void> {
  // Give the renderer's boot() (load + first save round-trip) time to run.
  await delay(500);
  const swipeFlow = await exerciseSwipeFlow();
  const data = store.read();
  const ok = !smokeFailed && data.version === 1 && swipeFlow;
  console.log(
    ok
      ? "DAYBREAK_SMOKE=pass renderer_loaded=true ipc_roundtrip=true swipe_flow=true"
      : "DAYBREAK_SMOKE=fail",
  );
  dismissAllowed = true;
  app.exit(ok ? 0 : 1);
}

async function exerciseSwipeFlow(): Promise<boolean> {
  if (!win) return false;

  const point = (await win.webContents.executeJavaScript(`
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      await wait(150);
      const form = document.getElementById("add-form");
      const input = document.getElementById("add-input");
      if (!(form instanceof HTMLFormElement) || !(input instanceof HTMLInputElement)) {
        return { ok: false, reason: "form_missing" };
      }
      if (getComputedStyle(form).display === "none") {
        return { ok: false, reason: "form_hidden" };
      }
      input.value = ${JSON.stringify(SMOKE_COMMIT_TEXT)};
      form.requestSubmit();
      await wait(250);
      const row = Array.from(document.querySelectorAll(".item")).find((element) =>
        element.textContent.includes(${JSON.stringify(SMOKE_COMMIT_TEXT)}),
      );
      if (!(row instanceof HTMLElement)) {
        return { ok: false, reason: "row_missing" };
      }
      const rect = row.getBoundingClientRect();
      return {
        ok: true,
        x: Math.round(rect.left + Math.min(40, rect.width / 3)),
        y: Math.round(rect.top + rect.height / 2),
      };
    })()
  `)) as { ok: boolean; reason?: string; x?: number; y?: number };

  if (!point.ok || point.x === undefined || point.y === undefined) {
    console.error("smoke flow setup failed:", point.reason ?? "unknown");
    return false;
  }

  win.webContents.sendInputEvent({
    type: "mouseDown",
    button: "left",
    clickCount: 1,
    x: point.x,
    y: point.y,
  });
  for (const offset of [24, 48, 72, 96, 120]) {
    win.webContents.sendInputEvent({
      type: "mouseMove",
      x: point.x + offset,
      y: point.y,
      movementX: 24,
      movementY: 0,
    });
    await delay(16);
  }
  win.webContents.sendInputEvent({
    type: "mouseUp",
    button: "left",
    x: point.x + 120,
    y: point.y,
  });

  await delay(400);
  const domResult = (await win.webContents.executeJavaScript(`
    (() => {
      const doneBtn = document.getElementById("done-btn");
      const row = Array.from(document.querySelectorAll(".item")).find((element) =>
        element.textContent.includes(${JSON.stringify(SMOKE_COMMIT_TEXT)}),
      );
      return {
        doneEnabled: doneBtn instanceof HTMLButtonElement && !doneBtn.disabled,
        stateOpen: row instanceof HTMLElement && row.classList.contains("state-open"),
      };
    })()
  `)) as { doneEnabled: boolean; stateOpen: boolean };
  const persisted = store.read();
  const persistedOpen = persisted.days.some((day) =>
    day.items.some(
      (item) => item.text === SMOKE_COMMIT_TEXT && item.state === "open",
    ),
  );
  if (!domResult.doneEnabled || !domResult.stateOpen || !persistedOpen) {
    console.error("smoke flow verification failed:", {
      ...domResult,
      persistedOpen,
    });
  }
  return domResult.doneEnabled && domResult.stateOpen && persistedOpen;
}

function configureStartupRegistration(): void {
  const plan = planStartupRegistration({
    platform: process.platform,
    smoke: SMOKE,
    packaged: app.isPackaged,
  });
  if (!plan.shouldRegister) return;

  app.setLoginItemSettings({
    openAtLogin: plan.openAtLogin,
    path: process.execPath,
  });
}

ipcMain.handle("daybreak:load", () => {
  const now = nowForSession();
  dismissAllowed = false;
  const { phase, log } = todaySession(now);
  activeSession = { phase, log };
  return { phase, log, now: now.toISOString() };
});

// Persist progress as the user wipes. Returns whether dismissal is now allowed.
ipcMain.handle("daybreak:save", (_evt, payload: { log: DayLog; phase: Phase }) => {
  if (!activeSession || activeSession.phase !== payload.phase) {
    dismissAllowed = false;
    return { canDismiss: false };
  }

  const update = validateLogUpdate(
    activeSession.log,
    payload.log,
    payload.phase,
  );
  if (!update.ok) {
    console.error("rejected log update:", update.reason);
    dismissAllowed = false;
    return { canDismiss: false };
  }

  const log = resolveLogForPhase(update.log, payload.phase);
  store.upsertDay(log);
  activeSession = { phase: payload.phase, log };
  const ok = canDismiss(log.items, payload.phase);
  dismissAllowed = ok;
  return { canDismiss: ok };
});

// Renderer asks to close after a confirmed-resolved board.
ipcMain.handle("daybreak:dismiss", (_evt, payload: { log: DayLog; phase: Phase }) => {
  if (!activeSession || activeSession.phase !== payload.phase) {
    dismissAllowed = false;
    return { closed: false };
  }

  const update = validateLogUpdate(
    activeSession.log,
    payload.log,
    payload.phase,
  );
  if (!update.ok) {
    console.error("rejected dismiss update:", update.reason);
    dismissAllowed = false;
    return { closed: false };
  }

  const log = resolveLogForPhase(update.log, payload.phase);
  const ok = canDismiss(log.items, payload.phase);
  dismissAllowed = ok;
  if (ok) {
    store.upsertDay(log);
    activeSession = { phase: payload.phase, log };
    store.setLastSeen(new Date().toISOString());
    win?.close();
  }
  return { closed: ok };
});

app.whenReady().then(() => {
  configureStartupRegistration();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // Single-shot ritual: quit once the board is cleared.
  if (process.platform !== "darwin") app.quit();
});
