import { describe, expect, it } from "vitest";
import { planStartupRegistration } from "../src/startup";

describe("startup registration policy", () => {
  it("enables login startup for packaged Windows production builds", () => {
    expect(
      planStartupRegistration({
        platform: "win32",
        smoke: false,
        packaged: true,
      }),
    ).toEqual({ shouldRegister: true, openAtLogin: true });
  });

  it("does not register login startup during smoke verification", () => {
    expect(
      planStartupRegistration({
        platform: "win32",
        smoke: true,
        packaged: true,
      }),
    ).toEqual({ shouldRegister: false, openAtLogin: false });
  });

  it("does not register login startup from an unpackaged dev run", () => {
    expect(
      planStartupRegistration({
        platform: "win32",
        smoke: false,
        packaged: false,
      }),
    ).toEqual({ shouldRegister: false, openAtLogin: false });
  });

  it("does not register login startup outside Windows", () => {
    expect(
      planStartupRegistration({
        platform: "linux",
        smoke: false,
        packaged: true,
      }),
    ).toEqual({ shouldRegister: false, openAtLogin: false });
  });
});
