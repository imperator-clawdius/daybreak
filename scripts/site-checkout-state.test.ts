import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  getPublicCheckoutState,
  getPublicDownloadState,
  readInstallerDownloadProof,
  readStripePaymentLinkProof,
} from "../site/app/checkout-state";

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "daybreak-site-proof-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const checkoutUrl = "https://buy.stripe.com/live_123";
const matchingProof = {
  payment_link: {
    id: "plink_live_123",
    url: checkoutUrl,
    active: true,
    livemode: true,
  },
  line_items: {
    data: [
      {
        quantity: 1,
        price: {
          unit_amount: 1900,
          currency: "usd",
          recurring: null,
        },
      },
    ],
  },
};

const downloadUrl = "https://downloads.example.com/daybreak.exe";
const downloadSha256 =
  "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
const matchingInstallerProof = {
  download: { url: downloadUrl, sha256: downloadSha256 },
  signature: {
    status: "Valid",
    signer: "CN=Passive Print Labs LLC",
    timestamped: true,
  },
};

describe("public checkout state", () => {
  it("keeps the public checkout pending until Stripe proof is present", () => {
    expect(
      getPublicCheckoutState({
        checkoutUrl,
        expectedPriceUsd: 19,
        proof: null,
      }),
    ).toMatchObject({
      ready: false,
      reason: "checkout_proof_missing",
    });

    expect(
      getPublicCheckoutState({
        checkoutUrl,
        expectedPriceUsd: 19,
        proof: matchingProof,
      }),
    ).toMatchObject({
      ready: true,
      reason: "ready",
    });
  });

  it("loads Stripe proof from repo root or site workspace build context", () =>
    withTempDir((dir) => {
      const siteRoot = join(dir, "site");
      const proofDir = join(dir, "proof");
      mkdirSync(siteRoot);
      mkdirSync(proofDir);
      writeFileSync(
        join(proofDir, "stripe-payment-link.json"),
        JSON.stringify(matchingProof),
        "utf8",
      );

      expect(readStripePaymentLinkProof(dir)).toMatchObject(matchingProof);
      expect(readStripePaymentLinkProof(siteRoot)).toMatchObject(matchingProof);
    }));

  it("keeps the public download pending until signed installer proof is present", () => {
    expect(
      getPublicDownloadState({
        downloadUrl,
        downloadSha256,
        proof: null,
      }),
    ).toMatchObject({
      ready: false,
      reason: "installer_proof_missing",
    });

    expect(
      getPublicDownloadState({
        downloadUrl,
        downloadSha256,
        proof: matchingInstallerProof,
      }),
    ).toMatchObject({
      ready: true,
      reason: "ready",
    });
  });

  it("loads installer proof from repo root or site workspace build context", () =>
    withTempDir((dir) => {
      const siteRoot = join(dir, "site");
      const proofDir = join(dir, "proof");
      mkdirSync(siteRoot);
      mkdirSync(proofDir);
      writeFileSync(
        join(proofDir, "installer-download.json"),
        JSON.stringify(matchingInstallerProof),
        "utf8",
      );

      expect(readInstallerDownloadProof(dir)).toMatchObject(
        matchingInstallerProof,
      );
      expect(readInstallerDownloadProof(siteRoot)).toMatchObject(
        matchingInstallerProof,
      );
    }));
});
