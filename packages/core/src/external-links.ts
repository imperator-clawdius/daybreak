export type ExternalLinkReason =
  | "ready"
  | "not_configured"
  | "not_stripe_payment_link"
  | "checkout_proof_missing"
  | "checkout_url_mismatch"
  | "checkout_not_active"
  | "checkout_not_live_mode"
  | "checkout_price_mismatch"
  | "checkout_not_one_time"
  | "url_not_configured"
  | "checksum_not_configured";

export interface ExternalLinkState {
  ready: boolean;
  reason: ExternalLinkReason;
}

export function isHttpsUrl(url: string): boolean {
  return /^https:\/\//.test(url);
}

export function isStripePaymentLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "buy.stripe.com";
  } catch {
    return false;
  }
}

export function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

export function isLiveCheckoutUrl(url: string): boolean {
  return isStripePaymentLink(url);
}

export function getCheckoutLinkState(url: string): ExternalLinkState {
  if (!isHttpsUrl(url)) {
    return { ready: false, reason: "not_configured" };
  }

  if (!isStripePaymentLink(url)) {
    return { ready: false, reason: "not_stripe_payment_link" };
  }

  return { ready: true, reason: "ready" };
}

interface StripeCheckoutProof {
  payment_link?: {
    url?: unknown;
    active?: unknown;
    livemode?: unknown;
  };
  line_items?: {
    data?: Array<{
      quantity?: unknown;
      price?: {
        unit_amount?: unknown;
        currency?: unknown;
        recurring?: unknown;
      };
    }>;
  };
}

export function getCheckoutProofState({
  checkoutUrl,
  expectedPriceUsd,
  proof,
}: {
  checkoutUrl: string;
  expectedPriceUsd: number;
  proof: unknown;
}): ExternalLinkState {
  if (!proof || typeof proof !== "object") {
    return { ready: false, reason: "checkout_proof_missing" };
  }

  const checkoutProof = proof as StripeCheckoutProof;
  const paymentLink = checkoutProof.payment_link;
  if (paymentLink?.url !== checkoutUrl) {
    return { ready: false, reason: "checkout_url_mismatch" };
  }
  if (paymentLink.active !== true) {
    return { ready: false, reason: "checkout_not_active" };
  }
  if (paymentLink.livemode !== true) {
    return { ready: false, reason: "checkout_not_live_mode" };
  }

  const items = checkoutProof.line_items?.data ?? [];
  const expectedCents = expectedPriceUsd * 100;
  const matchingOneTimeItem = items.find((item) => {
    const price = item.price;
    return (
      item.quantity === 1 &&
      price?.unit_amount === expectedCents &&
      price.currency === "usd" &&
      (price.recurring === null || price.recurring === undefined)
    );
  });

  if (!matchingOneTimeItem) {
    const hasRecurring = items.some((item) => item.price?.recurring);
    return {
      ready: false,
      reason: hasRecurring ? "checkout_not_one_time" : "checkout_price_mismatch",
    };
  }

  return { ready: true, reason: "ready" };
}

export function getVerifiedCheckoutLinkState({
  checkoutUrl,
  expectedPriceUsd,
  proof,
}: {
  checkoutUrl: string;
  expectedPriceUsd: number;
  proof: unknown;
}): ExternalLinkState {
  const linkState = getCheckoutLinkState(checkoutUrl);
  if (!linkState.ready) return linkState;

  return getCheckoutProofState({ checkoutUrl, expectedPriceUsd, proof });
}

export function getInstallerLinkState({
  url,
  sha256,
}: {
  url: string;
  sha256: string;
}): ExternalLinkState {
  if (!isHttpsUrl(url)) {
    return { ready: false, reason: "url_not_configured" };
  }

  if (!isSha256(sha256)) {
    return { ready: false, reason: "checksum_not_configured" };
  }

  return { ready: true, reason: "ready" };
}
