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
  | "checkout_extra_line_items"
  | "checkout_line_items_incomplete"
  | "checkout_line_items_invalid"
  | "checkout_proof_malformed"
  | "checkout_proof_contains_sensitive_data"
  | "url_not_configured"
  | "checksum_not_configured"
  | "installer_proof_missing"
  | "installer_url_mismatch"
  | "installer_checksum_mismatch"
  | "installer_signature_not_valid"
  | "installer_signer_mismatch"
  | "installer_proof_malformed"
  | "installer_proof_contains_sensitive_data";

export interface ExternalLinkState {
  ready: boolean;
  reason: ExternalLinkReason;
}

export function isHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

export function isStripePaymentLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "buy.stripe.com" &&
      parsed.pathname.length > 1
    );
  } catch {
    return false;
  }
}

function isStripePaymentLinkId(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("plink_") && trimmed.length > "plink_".length;
}

export function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

export function isLiveCheckoutUrl(url: string): boolean {
  return isStripePaymentLink(url);
}

const DISALLOWED_PROOF_KEYS = new Set([
  "api_key",
  "apikey",
  "address",
  "authorization",
  "billing_details",
  "certificate_private_key",
  "client_secret",
  "cookie",
  "customer",
  "customer_details",
  "customer_email",
  "email",
  "name",
  "order",
  "order_count",
  "orders",
  "password",
  "payment_intent",
  "payment_method",
  "payment_method_details",
  "p12",
  "pfx",
  "private_key",
  "phone",
  "receipt_email",
  "request",
  "request_headers",
  "response",
  "response_headers",
  "secret_key",
  "session",
  "session_data",
  "sessions",
  "set_cookie",
  "shipping_details",
  "signing_key",
  "stripe_secret_key",
  "x_api_key",
]);

function normalizeProofKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

function containsSensitiveProofData(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;

  return Object.entries(value).some(
    ([key, nested]) =>
      DISALLOWED_PROOF_KEYS.has(normalizeProofKey(key)) ||
      containsSensitiveProofData(nested),
  );
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
    id?: unknown;
    url?: unknown;
    active?: unknown;
    livemode?: unknown;
  };
  line_items?: {
    has_more?: unknown;
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
  if (containsSensitiveProofData(proof)) {
    return {
      ready: false,
      reason: "checkout_proof_contains_sensitive_data",
    };
  }

  const checkoutProof = proof as StripeCheckoutProof;
  const paymentLink = checkoutProof.payment_link;
  if (
    paymentLink !== undefined &&
    (!paymentLink || typeof paymentLink !== "object" || Array.isArray(paymentLink))
  ) {
    return { ready: false, reason: "checkout_proof_malformed" };
  }
  if (typeof paymentLink?.url !== "string") {
    return { ready: false, reason: "checkout_proof_malformed" };
  }
  if (paymentLink?.url !== checkoutUrl) {
    return { ready: false, reason: "checkout_url_mismatch" };
  }
  if (
    typeof paymentLink.active !== "boolean" ||
    typeof paymentLink.livemode !== "boolean"
  ) {
    return { ready: false, reason: "checkout_proof_malformed" };
  }
  if (paymentLink.active !== true) {
    return { ready: false, reason: "checkout_not_active" };
  }
  if (paymentLink.livemode !== true) {
    return { ready: false, reason: "checkout_not_live_mode" };
  }

  const lineItems = checkoutProof.line_items;
  if (
    lineItems !== undefined &&
    (!lineItems || typeof lineItems !== "object" || Array.isArray(lineItems))
  ) {
    return { ready: false, reason: "checkout_proof_malformed" };
  }

  const items = lineItems?.data ?? [];
  const expectedCents = expectedPriceUsd * 100;
  if (
    lineItems?.has_more !== undefined &&
    typeof lineItems.has_more !== "boolean"
  ) {
    return { ready: false, reason: "checkout_proof_malformed" };
  }
  if (lineItems?.has_more === true) {
    return { ready: false, reason: "checkout_line_items_incomplete" };
  }
  if (!Array.isArray(items)) {
    return { ready: false, reason: "checkout_line_items_invalid" };
  }

  if (items.length > 1) {
    return { ready: false, reason: "checkout_extra_line_items" };
  }

  if (items.length === 0) {
    return { ready: false, reason: "checkout_line_items_invalid" };
  }

  if (items.some((item) => !item || typeof item !== "object")) {
    return { ready: false, reason: "checkout_line_items_invalid" };
  }
  if (
    items.some(
      (item) =>
        typeof item.quantity !== "number" ||
        !Number.isInteger(item.quantity) ||
        !("price" in item) ||
        !item.price ||
        typeof item.price !== "object" ||
        Array.isArray(item.price) ||
        typeof item.price.unit_amount !== "number" ||
        !Number.isInteger(item.price.unit_amount) ||
        typeof item.price.currency !== "string" ||
        (item.price.recurring !== null &&
          item.price.recurring !== undefined &&
          typeof item.price.recurring !== "object"),
    )
  ) {
    return { ready: false, reason: "checkout_line_items_invalid" };
  }

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
  if (
    typeof paymentLink.id !== "string" ||
    !isStripePaymentLinkId(paymentLink.id)
  ) {
    return { ready: false, reason: "checkout_proof_malformed" };
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

interface InstallerDownloadProof {
  download?: {
    url?: unknown;
    sha256?: unknown;
  };
  signature?: {
    status?: unknown;
    signer?: unknown;
    subject?: unknown;
    timestamped?: unknown;
  };
}

export function getInstallerProofState({
  url,
  sha256,
  proof,
  expectedSigner = "Passive Print Labs LLC",
}: {
  url: string;
  sha256: string;
  proof: unknown;
  expectedSigner?: string;
}): ExternalLinkState {
  if (!proof || typeof proof !== "object") {
    return { ready: false, reason: "installer_proof_missing" };
  }
  if (containsSensitiveProofData(proof)) {
    return {
      ready: false,
      reason: "installer_proof_contains_sensitive_data",
    };
  }

  const installerProof = proof as InstallerDownloadProof;
  const proofSigner =
    installerProof.signature?.signer ?? installerProof.signature?.subject;
  if (
    typeof installerProof.download?.url !== "string" ||
    typeof installerProof.download.sha256 !== "string" ||
    !isSha256(installerProof.download.sha256) ||
    typeof installerProof.signature?.status !== "string" ||
    typeof proofSigner !== "string" ||
    typeof installerProof.signature.timestamped !== "boolean"
  ) {
    return { ready: false, reason: "installer_proof_malformed" };
  }
  if (installerProof.download?.url !== url) {
    return { ready: false, reason: "installer_url_mismatch" };
  }
  if (installerProof.download.sha256 !== sha256) {
    return { ready: false, reason: "installer_checksum_mismatch" };
  }
  if (installerProof.signature?.status !== "Valid") {
    return { ready: false, reason: "installer_signature_not_valid" };
  }
  if (installerProof.signature.timestamped !== true) {
    return { ready: false, reason: "installer_signature_not_valid" };
  }

  const expectedSignerSubject = expectedSigner.trim();
  if (!expectedSignerSubject || !proofSigner.includes(expectedSignerSubject)) {
    return { ready: false, reason: "installer_signer_mismatch" };
  }

  return { ready: true, reason: "ready" };
}

export function getVerifiedInstallerLinkState({
  url,
  sha256,
  proof,
}: {
  url: string;
  sha256: string;
  proof: unknown;
}): ExternalLinkState {
  const linkState = getInstallerLinkState({ url, sha256 });
  if (!linkState.ready) return linkState;

  return getInstallerProofState({ url, sha256, proof });
}
