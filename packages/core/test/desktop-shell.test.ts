import { describe, expect, it } from "vitest";
import {
  getDesktopWindowChromePolicy,
  getDesktopWebPreferencesPolicy,
  getDesktopContentSecurityPolicy,
  isAllowedDesktopNavigation,
  shouldBlockDesktopShortcut,
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

  it("defines strict BrowserWindow web preference policy", () => {
    expect(getDesktopWebPreferencesPolicy()).toEqual({
      allowRunningInsecureContent: false,
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
});
