export type ExternalLinkReason =
  | "ready"
  | "not_configured"
  | "not_stripe_payment_link"
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
