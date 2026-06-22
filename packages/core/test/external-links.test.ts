import { describe, expect, it } from "vitest";

import {
  getCheckoutLinkState,
  getInstallerLinkState,
  isLiveCheckoutUrl,
} from "../src/external-links";

describe("external launch links", () => {
  it("keeps checkout inactive for placeholders and non-Stripe URLs", () => {
    expect(isLiveCheckoutUrl("PENDING_STRIPE_PAYMENT_LINK")).toBe(false);
    expect(isLiveCheckoutUrl("https://example.com/pay")).toBe(false);
  });

  it("activates checkout only for Stripe Payment Links", () => {
    expect(isLiveCheckoutUrl("https://buy.stripe.com/live_123")).toBe(true);
  });

  it("explains why checkout is not live", () => {
    expect(getCheckoutLinkState("PENDING_STRIPE_PAYMENT_LINK")).toMatchObject({
      ready: false,
      reason: "not_configured",
    });
    expect(getCheckoutLinkState("https://example.com/pay")).toMatchObject({
      ready: false,
      reason: "not_stripe_payment_link",
    });
  });

  it("keeps installer download inactive until both URL and checksum are real", () => {
    expect(
      getInstallerLinkState({
        url: "PENDING_INSTALLER_DOWNLOAD",
        sha256: "PENDING_INSTALLER_SHA256",
      }),
    ).toMatchObject({ ready: false, reason: "url_not_configured" });

    expect(
      getInstallerLinkState({
        url: "https://downloads.example.com/daybreak.exe",
        sha256: "PENDING_INSTALLER_SHA256",
      }),
    ).toMatchObject({ ready: false, reason: "checksum_not_configured" });
  });

  it("activates installer download only when URL is HTTPS and checksum is SHA-256", () => {
    expect(
      getInstallerLinkState({
        url: "https://downloads.example.com/daybreak.exe",
        sha256:
          "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
      }),
    ).toMatchObject({ ready: true, reason: "ready" });
  });
});
