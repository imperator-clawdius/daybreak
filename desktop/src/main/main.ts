// Electron main process.
// Owns the hard invariant: the morning window cannot be closed until the
// renderer reports (via IPC) that every item has been wiped. The renderer
// computes that with @daybreak/core's canDismiss(); main trusts only the
// boolean it is told AND re-validates against the persisted board.
import { app, BrowserWindow, Menu, ipcMain, screen, session } from "electron";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildDaySession,
  canDismiss,
  getDesktopWindowChromePolicy,
  getDesktopWebPreferencesPolicy,
  isAllowedDesktopNavigation,
  makeItem,
  planStartupRegistration,
  resolveLogForPhase,
  shouldBlockDesktopShortcut,
  shouldDenyDesktopPermission,
  shouldDisableDesktopApplicationMenu,
  shouldDisableDesktopDevTools,
  shouldEnforceDesktopSingleInstance,
  shouldRejectDesktopCertificateError,
  validateLogUpdate,
  type DayLog,
  type Phase,
} from "@daybreak/core";
import { Store } from "./store";

const SMOKE = process.env.DAYBREAK_SMOKE === "1";
const SMOKE_SCENARIO =
  process.env.DAYBREAK_SMOKE_SCENARIO === "evening" ? "evening" : "morning";
const SMOKE_CLOSE_PROBE = process.env.DAYBREAK_SMOKE_CLOSE_PROBE === "1";
const SMOKE_SCREENSHOT = process.env.DAYBREAK_SMOKE_SCREENSHOT;
const SMOKE_SCREENSHOT_WIDTH = 1000;
const SMOKE_SCREENSHOT_HEIGHT = 700;
const SMOKE_DAY = "2026-06-22";
const SMOKE_MORNING_NOW = `${SMOKE_DAY}T09:00:00`;
const SMOKE_EVENING_NOW = `${SMOKE_DAY}T18:00:00`;
const SMOKE_COMMIT_TEXT =
  process.env.DAYBREAK_SMOKE_COMMIT_TEXT ?? `Daybreak smoke ${process.pid}`;

if (SMOKE) {
  app.setPath("userData", join(tmpdir(), `daybreak-smoke-${process.pid}`));
}

const store = new Store(join(app.getPath("userData"), "daybreak.json"));
let win: BrowserWindow | null = null;
let activeSession: { phase: Phase; log: DayLog } | null = null;
let dismissAllowed = false;
let smokeFailed = false;
let applicationMenuDisabled = false;
let devToolsDisabled = false;
let webPreferencesApplied = false;
let desktopShortcutsBlocked = false;
let singleInstanceLocked = false;
let windowChromeLocked = false;
let permissionsDenied = false;
let certificateErrorsRejected = false;

if (SMOKE && SMOKE_SCENARIO === "evening") {
  const prior = {
    ...makeItem("Prior smoke week", "2026-06-15", () => "smoke-prior-week"),
    state: "done" as const,
  };
  const item = {
    ...makeItem(SMOKE_COMMIT_TEXT, SMOKE_DAY, () => "smoke-evening-item"),
    state: "open" as const,
  };
  store.write({
    version: 1,
    lastSeenIso: null,
    days: [
      {
        day: "2026-06-15",
        morningResolved: true,
        eveningResolved: true,
        items: [prior],
      },
      {
        day: SMOKE_DAY,
        morningResolved: true,
        eveningResolved: false,
        items: [item],
      },
    ],
  });
}

function configureSingleInstanceLock(): boolean {
  if (!shouldEnforceDesktopSingleInstance()) return true;
  const locked = app.requestSingleInstanceLock();
  singleInstanceLocked = locked;
  if (!locked) {
    app.quit();
    return false;
  }

  app.on("second-instance", () => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    win.webContents.send("daybreak:nudge");
  });

  return true;
}

function nowForSession(): Date {
  if (!SMOKE) return new Date();
  const defaultNow =
    SMOKE_SCENARIO === "evening" ? SMOKE_EVENING_NOW : SMOKE_MORNING_NOW;
  const raw = process.env.DAYBREAK_SMOKE_NOW ?? defaultNow;
  const forced = new Date(raw);
  return Number.isNaN(forced.getTime()) ? new Date(defaultNow) : forced;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const entryFile = join(__dirname, "index.html");
  const entryUrl = pathToFileURL(entryFile).toString();
  const webPreferencesPolicy = getDesktopWebPreferencesPolicy();
  const windowChromePolicy = getDesktopWindowChromePolicy();

  win = new BrowserWindow({
    // Smoke mode: small, hidden, non-intrusive so CI / verification never
    // hijacks the screen. Production: full-screen kiosk that owns the morning.
    width: SMOKE ? (SMOKE_SCREENSHOT ? SMOKE_SCREENSHOT_WIDTH : 800) : width,
    height: SMOKE ? (SMOKE_SCREENSHOT ? SMOKE_SCREENSHOT_HEIGHT : 600) : height,
    show: !SMOKE,
    fullscreen: !SMOKE,
    frame: false,
    closable: true,
    alwaysOnTop: !SMOKE,
    skipTaskbar: false,
    ...windowChromePolicy,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      ...webPreferencesPolicy,
    },
  });
  windowChromeLocked =
    windowChromePolicy.fullscreenable === false &&
    windowChromePolicy.maximizable === false &&
    windowChromePolicy.minimizable === false &&
    windowChromePolicy.movable === false &&
    windowChromePolicy.resizable === false &&
    !win.isResizable() &&
    !win.isMaximizable() &&
    !win.isMinimizable();
  devToolsDisabled =
    shouldDisableDesktopDevTools() && !win.webContents.isDevToolsOpened();
  webPreferencesApplied =
    webPreferencesPolicy.allowRunningInsecureContent === false &&
    webPreferencesPolicy.contextIsolation &&
    webPreferencesPolicy.devTools === false &&
    webPreferencesPolicy.nodeIntegration === false &&
    webPreferencesPolicy.sandbox &&
    webPreferencesPolicy.spellcheck === false &&
    webPreferencesPolicy.webSecurity &&
    webPreferencesPolicy.webviewTag === false;

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
  win.webContents.on("before-input-event", (event, input) => {
    if (
      shouldBlockDesktopShortcut({
        key: input.key,
        control: input.control,
        meta: input.meta,
        alt: input.alt,
        shift: input.shift,
      })
    ) {
      event.preventDefault();
    }
  });
  desktopShortcutsBlocked = [
    { key: "r", control: true },
    { key: "F5" },
    { key: "I", control: true, shift: true },
    { key: "F12" },
    { key: "n", control: true },
    { key: "F11" },
    { key: "ArrowLeft", alt: true },
    { key: "=", control: true },
  ].every(shouldBlockDesktopShortcut);

  // The gate: refuse close until a wiped board has been committed.
  win.on("close", (e) => {
    if (!dismissAllowed && (!SMOKE || SMOKE_CLOSE_PROBE)) {
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

function configurePermissionPolicy(): void {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(!shouldDenyDesktopPermission(permission));
    },
  );
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission) => !shouldDenyDesktopPermission(permission),
  );
  permissionsDenied = [
    "camera",
    "clipboard-read",
    "geolocation",
    "media",
    "microphone",
    "notifications",
    "unknown-future-permission",
  ].every(shouldDenyDesktopPermission);
}

function configureCertificatePolicy(): void {
  app.on("certificate-error", (event, _webContents, url, error, _certificate, callback) => {
    if (shouldRejectDesktopCertificateError({ url, error })) {
      event.preventDefault();
      callback(false);
      return;
    }
    callback(true);
  });
  certificateErrorsRejected = shouldRejectDesktopCertificateError({
    url: "file:///daybreak-certificate-error-probe",
    error: "net::ERR_CERT_AUTHORITY_INVALID",
  });
}

async function runSmokeFlow(): Promise<void> {
  // Give the renderer's boot() (load + first save round-trip) time to run.
  await delay(500);
  const closeProbe = SMOKE_CLOSE_PROBE ? await exerciseCloseProbe() : true;
  const swipeFlow =
    SMOKE_SCENARIO === "evening"
      ? await exerciseEveningSwipeFlow()
      : await exerciseMorningSwipeFlow();
  const data = store.read();
  let screenshotCaptured = false;
  let ok = !smokeFailed && data.version === 1 && closeProbe && swipeFlow;
  if (ok && SMOKE_SCREENSHOT && win) {
    try {
      await stabilizeSmokeScreenshot();
      const image = await win.webContents.capturePage();
      await writeFile(SMOKE_SCREENSHOT, image.toPNG());
      screenshotCaptured = true;
    } catch (error) {
      console.error("smoke screenshot failed:", error);
      ok = false;
    }
  }
  console.log(
    ok
      ? `DAYBREAK_SMOKE=pass renderer_loaded=true ipc_roundtrip=true scenario=${SMOKE_SCENARIO} swipe_flow=true${
          SMOKE_SCENARIO === "evening" ? " streak_summary=true" : ""
        } app_menu_disabled=${applicationMenuDisabled ? "true" : "false"}${
          devToolsDisabled ? " devtools_disabled=true" : " devtools_disabled=false"
        }${webPreferencesApplied ? " web_preferences=strict" : " web_preferences=loose"}${
          desktopShortcutsBlocked
            ? " shortcuts_blocked=true"
            : " shortcuts_blocked=false"
        }${
          singleInstanceLocked
            ? " single_instance_lock=true"
            : " single_instance_lock=false"
        }${
          windowChromeLocked ? " window_chrome=locked" : " window_chrome=loose"
        }${
          permissionsDenied
            ? " permissions_denied=true"
            : " permissions_denied=false"
        }${
          certificateErrorsRejected
            ? " certificate_errors_rejected=true"
            : " certificate_errors_rejected=false"
        }${
          SMOKE_CLOSE_PROBE ? " close_probe=true" : ""
        }${
          screenshotCaptured ? " screenshot=true" : ""
        }`
      : "DAYBREAK_SMOKE=fail",
  );
  dismissAllowed = true;
  app.exit(ok ? 0 : 1);
}

async function exerciseCloseProbe(): Promise<boolean> {
  if (!win) return false;
  win.close();
  await delay(150);
  const stillOpen = !win.isDestroyed();
  if (!stillOpen) {
    console.error("smoke close probe failed: unresolved window closed");
  }
  return stillOpen;
}

async function stabilizeSmokeScreenshot(): Promise<void> {
  if (!win) return;
  await win.webContents.executeJavaScript(`
    (() => {
      for (const row of document.querySelectorAll(".item")) {
        if (!(row instanceof HTMLElement)) continue;
        row.style.transform = "";
        row.classList.remove(
          "dragging",
          "swipe-preview-commit",
          "swipe-preview-done",
          "swipe-preview-defer",
          "swipe-preview-kill",
        );
      }
    })()
  `);
  await delay(50);
}

async function exerciseMorningSwipeFlow(): Promise<boolean> {
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

  await sendMouseSwipe(point.x, point.y, 120, 0);

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

async function exerciseEveningSwipeFlow(): Promise<boolean> {
  if (!win) return false;

  const point = (await win.webContents.executeJavaScript(`
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      await wait(150);
      const form = document.getElementById("add-form");
      if (form instanceof HTMLElement && getComputedStyle(form).display !== "none") {
        return { ok: false, reason: "form_visible" };
      }
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
    console.error("evening smoke flow setup failed:", point.reason ?? "unknown");
    return false;
  }

  await sendMouseSwipe(point.x, point.y, 120, 0);

  await delay(400);
  const domResult = (await win.webContents.executeJavaScript(`
    (() => {
      const doneBtn = document.getElementById("done-btn");
      const streak = document.getElementById("streak");
      const row = Array.from(document.querySelectorAll(".item")).find((element) =>
        element.textContent.includes(${JSON.stringify(SMOKE_COMMIT_TEXT)}),
      );
      return {
        doneEnabled: doneBtn instanceof HTMLButtonElement && !doneBtn.disabled,
        stateDone: row instanceof HTMLElement && row.classList.contains("state-done"),
        streakText: streak instanceof HTMLElement ? streak.textContent : "",
      };
    })()
  `)) as { doneEnabled: boolean; stateDone: boolean; streakText: string };
  const persisted = store.read();
  const persistedDone = persisted.days.some(
    (day) =>
      day.day === SMOKE_DAY &&
      day.eveningResolved &&
      day.items.some(
        (item) => item.text === SMOKE_COMMIT_TEXT && item.state === "done",
      ),
  );
  const streakRendered = domResult.streakText === "1-day / 2-week streak";
  if (
    !domResult.doneEnabled ||
    !domResult.stateDone ||
    !persistedDone ||
    !streakRendered
  ) {
    console.error("evening smoke flow verification failed:", {
      ...domResult,
      persistedDone,
      streakRendered,
    });
  }
  return (
    domResult.doneEnabled && domResult.stateDone && persistedDone && streakRendered
  );
}

async function sendMouseSwipe(
  startX: number,
  startY: number,
  deltaX: number,
  deltaY: number,
): Promise<void> {
  if (!win) return;
  win.webContents.sendInputEvent({
    type: "mouseDown",
    button: "left",
    clickCount: 1,
    x: startX,
    y: startY,
  });
  for (const step of [0.2, 0.4, 0.6, 0.8, 1]) {
    win.webContents.sendInputEvent({
      type: "mouseMove",
      x: Math.round(startX + deltaX * step),
      y: Math.round(startY + deltaY * step),
      movementX: Math.round(deltaX / 5),
      movementY: Math.round(deltaY / 5),
    });
    await delay(16);
  }
  win.webContents.sendInputEvent({
    type: "mouseUp",
    button: "left",
    x: startX + deltaX,
    y: startY + deltaY,
  });
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

function configureApplicationMenu(): void {
  if (!shouldDisableDesktopApplicationMenu()) return;
  Menu.setApplicationMenu(null);
  applicationMenuDisabled = Menu.getApplicationMenu() === null;
}

ipcMain.handle("daybreak:load", () => {
  const now = nowForSession();
  dismissAllowed = false;
  const history = store.read().days;
  const { phase, log } = buildDaySession(now, history);
  activeSession = { phase, log };
  return { phase, log, history, now: now.toISOString() };
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

if (configureSingleInstanceLock()) app.whenReady().then(() => {
  configureApplicationMenu();
  configureStartupRegistration();
  configurePermissionPolicy();
  configureCertificatePolicy();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // Single-shot ritual: quit once the board is cleared.
  if (process.platform !== "darwin") app.quit();
});
