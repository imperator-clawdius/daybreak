import { describe, expect, it } from "vitest";
import {
  getDesktopContentSecurityPolicy,
  isAllowedDesktopNavigation,
  shouldDisableDesktopApplicationMenu,
  shouldDisableDesktopDevTools,
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
});
