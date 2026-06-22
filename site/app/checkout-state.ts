import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getInstallerLinkState,
  getVerifiedCheckoutLinkState,
  type ExternalLinkState,
} from "@daybreak/core";

import { CHECKOUT_URL, DOWNLOAD_SHA256, DOWNLOAD_URL, PRICE_USD } from "./config";

const STRIPE_PROOF_PATH = join("proof", "stripe-payment-link.json");

export function readStripePaymentLinkProof(root = process.cwd()): unknown {
  const candidates = [
    join(root, STRIPE_PROOF_PATH),
    join(root, "..", STRIPE_PROOF_PATH),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      return JSON.parse(readFileSync(candidate, "utf8"));
    } catch {
      return null;
    }
  }

  return null;
}

export function getPublicCheckoutState({
  checkoutUrl = CHECKOUT_URL,
  expectedPriceUsd = PRICE_USD,
  proof = readStripePaymentLinkProof(),
}: {
  checkoutUrl?: string;
  expectedPriceUsd?: number;
  proof?: unknown;
} = {}): ExternalLinkState {
  return getVerifiedCheckoutLinkState({
    checkoutUrl,
    expectedPriceUsd,
    proof,
  });
}

export function getPublicDownloadState(): ExternalLinkState {
  return getInstallerLinkState({
    url: DOWNLOAD_URL,
    sha256: DOWNLOAD_SHA256,
  });
}
