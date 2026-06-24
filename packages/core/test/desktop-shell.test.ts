import { describe, expect, it } from "vitest";
import {
  shouldRejectDesktopCertificateError,
  shouldDenyDesktopPermission,
  getDesktopWindowChromePolicy,
  getDesktopWindowOwnershipPolicy,
  getDesktopStoragePartitionPolicy,
  getDesktopWebPreferencesPolicy,
  hasUnsafeDesktopLaunchArg,
  getDesktopContentSecurityPolicy,
  isAllowedDesktopIpcSender,
  isAllowedDesktopNavigation,
  shouldBlockDesktopShortcut,
  shouldEnableDesktopContentProtection,
  shouldStartDesktopPowerSaveBlocker,
  shouldPreventDesktopClipboardExfiltration,
  shouldPreventDesktopContextMenu,
  shouldPreventDesktopDownloads,
  shouldPreventDesktopDragDropNavigation,
  shouldRecoverDesktopRendererCrash,
  shouldGuardDesktopFrameNavigation,
  shouldGuardDesktopRedirects,
  shouldDisableDesktopApplicationMenu,
  shouldDisableDesktopDevTools,
  shouldEnforceDesktopSingleInstance,
} from "../src/desktop-shell";

describe("desktop shell policy", () => {
  it("allows staying on the packaged Daybreak HTML entrypoint", () => {
    expect(
      isAllowedDesktopNavigation(
        "file:///C:/Daybreak/resources/app.asar/dist/index.html",
        "file:///C:/Daybreak/resources/app.asar/dist/index.html",
      ),
    ).toBe(true);
  });

  it("blocks web navigation from the desktop renderer", () => {
    expect(
      isAllowedDesktopNavigation(
        "file:///C:/Daybreak/resources/app.asar/dist/index.html",
        "https://daybreak.rest/",
      ),
    ).toBe(false);
  });

  it("blocks navigation to a different local file", () => {
    expect(
      isAllowedDesktopNavigation(
        "file:///C:/Daybreak/resources/app.asar/dist/index.html",
        "file:///C:/Daybreak/resources/app.asar/dist/other.html",
      ),
    ).toBe(false);
  });

  it("blocks malformed navigation targets", () => {
    expect(
      isAllowedDesktopNavigation(
        "file:///C:/Daybreak/resources/app.asar/dist/index.html",
        "not a url",
      ),
    ).toBe(false);
  });

  it("trusts IPC only from the packaged Daybreak HTML entrypoint", () => {
    const entrypoint = "file:///C:/Daybreak/resources/app.asar/dist/index.html";

    expect(isAllowedDesktopIpcSender(entrypoint, entrypoint)).toBe(true);
    expect(isAllowedDesktopIpcSender(entrypoint, "https://daybreak.rest/")).toBe(
      false,
    );
    expect(
      isAllowedDesktopIpcSender(
        entrypoint,
        "file:///C:/Daybreak/resources/app.asar/dist/other.html",
      ),
    ).toBe(false);
    expect(isAllowedDesktopIpcSender(entrypoint, "not a url")).toBe(false);
  });

  it("defines a strict local-only renderer content security policy", () => {
    expect(getDesktopContentSecurityPolicy()).toBe(
      [
        "default-src 'none'",
        "script-src 'self'",
        "style-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'none'",
        "object-src 'none'",
        "frame-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ].join("; "),
    );
  });

  it("requires the desktop shell to remove the Electron application menu", () => {
    expect(shouldDisableDesktopApplicationMenu()).toBe(true);
  });

  it("requires the desktop shell to disable Chromium DevTools", () => {
    expect(shouldDisableDesktopDevTools()).toBe(true);
  });

  it("requires the desktop shell to enforce a single running instance", () => {
    expect(shouldEnforceDesktopSingleInstance()).toBe(true);
  });

  it("requires the desktop shell to guard renderer redirects", () => {
    expect(shouldGuardDesktopRedirects()).toBe(true);
  });

  it("requires the desktop shell to guard frame navigation", () => {
    expect(shouldGuardDesktopFrameNavigation()).toBe(true);
  });

  it("requires the desktop shell to prevent drag/drop navigation", () => {
    expect(shouldPreventDesktopDragDropNavigation()).toBe(true);
  });

  it("requires the desktop shell to prevent downloads", () => {
    expect(shouldPreventDesktopDownloads()).toBe(true);
  });

  it("requires the desktop shell to prevent clipboard exfiltration", () => {
    expect(shouldPreventDesktopClipboardExfiltration()).toBe(true);
  });

  it("requires the desktop shell to prevent the browser context menu", () => {
    expect(shouldPreventDesktopContextMenu()).toBe(true);
  });

  it("requires the desktop shell to recover a crashed renderer", () => {
    expect(shouldRecoverDesktopRendererCrash()).toBe(true);
  });

  it("requires the desktop shell to enable content protection", () => {
    expect(shouldEnableDesktopContentProtection()).toBe(true);
  });

  it("requires the desktop shell to block idle sleep during the ritual", () => {
    expect(shouldStartDesktopPowerSaveBlocker()).toBe(true);
  });

  it("requires the desktop shell to disable renderer background throttling", () => {
    expect(getDesktopWebPreferencesPolicy().backgroundThrottling).toBe(false);
  });

  it("defines strict BrowserWindow web preference policy", () => {
    expect(getDesktopWebPreferencesPolicy()).toEqual({
      allowRunningInsecureContent: false,
      backgroundThrottling: false,
      contextIsolation: true,
      devTools: false,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webSecurity: true,
      webviewTag: false,
    });
  });

  it("defines locked kiosk window chrome policy", () => {
    expect(getDesktopWindowChromePolicy()).toEqual({
      fullscreenable: false,
      maximizable: false,
      minimizable: false,
      movable: false,
      resizable: false,
    });
  });

  it("defines production window ownership policy across workspaces", () => {
    expect(getDesktopWindowOwnershipPolicy()).toEqual({
      alwaysOnTop: true,
      alwaysOnTopLevel: "screen-saver",
      fullscreen: true,
      visibleOnAllWorkspaces: true,
      visibleOnFullScreen: true,
    });
  });

  it("requires Chromium storage surfaces to stay disabled", () => {
    expect(getDesktopStoragePartitionPolicy()).toEqual({
      cookies: false,
      indexedDB: false,
      localStorage: false,
      partition: "daybreak-ritual",
      persistent: false,
      serviceWorkers: false,
      sessionStorage: false,
      shaderCache: false,
      webSQL: false,
    });
  });

  it("detects unsafe desktop launch arguments", () => {
    for (const args of [
      ["Daybreak.exe", "--remote-debugging-port=9222"],
      ["Daybreak.exe", "--remote-debugging-pipe"],
      ["Daybreak.exe", "--inspect=127.0.0.1:9229"],
      ["Daybreak.exe", "--inspect-brk"],
      ["Daybreak.exe", "--user-data-dir=C:\\temp\\profile"],
      ["Daybreak.exe", "--load-extension=C:\\extension"],
      ["Daybreak.exe", "--disable-web-security"],
      ["Daybreak.exe", "--js-flags=--expose-gc"],
    ]) {
      expect(hasUnsafeDesktopLaunchArg(args)).toBe(true);
    }

    expect(hasUnsafeDesktopLaunchArg(["Daybreak.exe"])).toBe(false);
    expect(hasUnsafeDesktopLaunchArg(["Daybreak.exe", "--smoke"])).toBe(false);
  });

  it("denies Chromium permission requests in the desktop shell", () => {
    for (const permission of [
      "camera",
      "clipboard-read",
      "geolocation",
      "media",
      "microphone",
      "notifications",
      "unknown-future-permission",
    ]) {
      expect(shouldDenyDesktopPermission(permission)).toBe(true);
    }
  });

  it("rejects desktop TLS certificate errors", () => {
    expect(
      shouldRejectDesktopCertificateError({
        url: "https://daybreak.rest/",
        error: "net::ERR_CERT_AUTHORITY_INVALID",
      }),
    ).toBe(true);
    expect(
      shouldRejectDesktopCertificateError({
        url: "file:///C:/Daybreak/resources/app.asar/dist/index.html",
        error: "not a certificate error",
      }),
    ).toBe(true);
  });

  it("blocks browser shell shortcuts while allowing ordinary text entry", () => {
    expect(shouldBlockDesktopShortcut({ key: "r", control: true })).toBe(true);
    expect(shouldBlockDesktopShortcut({ key: "R", control: true })).toBe(true);
    expect(shouldBlockDesktopShortcut({ key: "r", meta: true })).toBe(true);
    expect(shouldBlockDesktopShortcut({ key: "F5" })).toBe(true);
    expect(
      shouldBlockDesktopShortcut({ key: "I", control: true, shift: true }),
    ).toBe(true);
    expect(
      shouldBlockDesktopShortcut({ key: "J", meta: true, alt: true }),
    ).toBe(true);
    expect(shouldBlockDesktopShortcut({ key: "F12" })).toBe(true);
    expect(shouldBlockDesktopShortcut({ key: "n", control: true })).toBe(true);
    expect(shouldBlockDesktopShortcut({ key: "F11" })).toBe(true);
    expect(shouldBlockDesktopShortcut({ key: "ArrowLeft", alt: true })).toBe(
      true,
    );
    expect(shouldBlockDesktopShortcut({ key: "=", control: true })).toBe(true);
    expect(shouldBlockDesktopShortcut({ key: "-", control: true })).toBe(true);
    expect(shouldBlockDesktopShortcut({ key: "0", control: true })).toBe(true);

    expect(shouldBlockDesktopShortcut({ key: "Type a commitment" })).toBe(false);
    expect(shouldBlockDesktopShortcut({ key: "r" })).toBe(false);
    expect(shouldBlockDesktopShortcut({ key: "ArrowLeft" })).toBe(false);
  });

  it("blocks print and save browser shell shortcuts", () => {
    expect(shouldBlockDesktopShortcut({ key: "p", control: true })).toBe(true);
    expect(shouldBlockDesktopShortcut({ key: "P", meta: true })).toBe(true);
    expect(shouldBlockDesktopShortcut({ key: "s", control: true })).toBe(true);
    expect(shouldBlockDesktopShortcut({ key: "S", meta: true })).toBe(true);
  });

  it("blocks close and quit shell shortcuts", () => {
    expect(shouldBlockDesktopShortcut({ key: "w", control: true })).toBe(true);
    expect(shouldBlockDesktopShortcut({ key: "W", meta: true })).toBe(true);
    expect(shouldBlockDesktopShortcut({ key: "q", control: true })).toBe(true);
    expect(shouldBlockDesktopShortcut({ key: "Q", meta: true })).toBe(true);
    expect(shouldBlockDesktopShortcut({ key: "F4", alt: true })).toBe(true);
  });

  it("blocks system, search, help, open, and find accelerators", () => {
    for (const key of ["f1", "f3", "f10"]) {
      expect(shouldBlockDesktopShortcut({ key })).toBe(true);
    }
    for (const key of ["e", "f", "g", "h", "l", "o"]) {
      expect(shouldBlockDesktopShortcut({ key, control: true })).toBe(true);
      expect(shouldBlockDesktopShortcut({ key: key.toUpperCase(), meta: true }))
        .toBe(true);
    }
    expect(shouldBlockDesktopShortcut({ key: "Tab", alt: true })).toBe(true);
    expect(shouldBlockDesktopShortcut({ key: "Escape", alt: true })).toBe(true);
    expect(shouldBlockDesktopShortcut({ key: "Space", alt: true })).toBe(true);
  });
});
