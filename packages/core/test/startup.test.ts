import { describe, expect, it } from "vitest";
import { planStartupRegistration } from "../src/startup";

describe("startup registration policy", () => {
  it("enables login startup for packaged Windows production builds", () => {
    expect(
      planStartupRegistration({
        platform: "win32",
        smoke: false,
        packaged: true,
        autoStart: true,
      }),
    ).toEqual({ shouldConfigure: true, openAtLogin: true, enabled: true });
  });

  it("disables login startup for a manual-start Windows build", () => {
    expect(
      planStartupRegistration({
        platform: "win32",
        smoke: false,
        packaged: true,
        autoStart: false,
      }),
    ).toEqual({ shouldConfigure: true, openAtLogin: false, enabled: false });
  });

  it.each([true, false])("does not change startup during smoke verification (autoStart=%s)", (autoStart) => {
    expect(
      planStartupRegistration({
        platform: "win32",
        smoke: true,
        packaged: true,
        autoStart,
      }),
    ).toEqual({ shouldConfigure: false, openAtLogin: false, enabled: false });
  });

  it.each([true, false])("does not change startup from an unpackaged dev run (autoStart=%s)", (autoStart) => {
    expect(
      planStartupRegistration({
        platform: "win32",
        smoke: false,
        packaged: false,
        autoStart,
      }),
    ).toEqual({ shouldConfigure: false, openAtLogin: false, enabled: false });
  });

  it.each([true, false])("does not change startup outside Windows (autoStart=%s)", (autoStart) => {
    expect(
      planStartupRegistration({
        platform: "linux",
        smoke: false,
        packaged: true,
        autoStart,
      }),
    ).toEqual({ shouldConfigure: false, openAtLogin: false, enabled: false });
  });
});
