import { describe, expect, it } from "vitest";
import { isAllowedDesktopNavigation } from "../src/desktop-shell";

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
});
