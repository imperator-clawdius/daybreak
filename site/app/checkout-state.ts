import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getVerifiedCheckoutLinkState,
  getVerifiedInstallerLinkState,
  type ExternalLinkState,
} from "@daybreak/core";

import { CHECKOUT_URL, DOWNLOAD_SHA256, DOWNLOAD_URL, PRICE_USD } from "./config";

const STRIPE_PROOF_PATH = join("proof", "stripe-payment-link.json");
const INSTALLER_PROOF_PATH = join("proof", "installer-download.json");

function readProofFile(root: string, relativePath: string): unknown {
  const candidates = [
    join(root, relativePath),
    join(root, "..", relativePath),
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

export function readStripePaymentLinkProof(root = process.cwd()): unknown {
  return readProofFile(root, STRIPE_PROOF_PATH);
}

export function readInstallerDownloadProof(root = process.cwd()): unknown {
  return readProofFile(root, INSTALLER_PROOF_PATH);
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

export function getPublicDownloadState({
  downloadUrl = DOWNLOAD_URL,
  downloadSha256 = DOWNLOAD_SHA256,
  proof = readInstallerDownloadProof(),
}: {
  downloadUrl?: string;
  downloadSha256?: string;
  proof?: unknown;
} = {}): ExternalLinkState {
  return getVerifiedInstallerLinkState({
    url: downloadUrl,
    sha256: downloadSha256,
    proof,
  });
}
