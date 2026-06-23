import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  EXPECTED_SIGNER_SUBJECT,
  readAuthenticodeSignature,
} from "./release-core.mjs";
import {
  SUPPORT_MAILTO,
  liveSurfaceIssue,
  publicCopyIssue,
} from "./live-site-policy.mjs";

export const PRODUCTION_HOST = "daybreak.rest";
export const PRODUCTION_URL = `https://${PRODUCTION_HOST}/`;
export const WWW_HOST = `www.${PRODUCTION_HOST}`;
export const WWW_URL = `https://${WWW_HOST}/`;
export const GITHUB_PAGES_IPV4 = [
  "185.199.108.153",
  "185.199.109.153",
  "185.199.110.153",
  "185.199.111.153",
];
export const GITHUB_PAGES_IPV6 = [
  "2606:50c0:8000::153",
  "2606:50c0:8001::153",
  "2606:50c0:8002::153",
  "2606:50c0:8003::153",
];
const GITHUB_PAGES_ADDRESSES = [...GITHUB_PAGES_IPV4, ...GITHUB_PAGES_IPV6];
const DISALLOWED_PAID_ORDER_PROOF_KEYS = new Set([
  "api_key",
  "apikey",
  "address",
  "allow_promotion_codes",
  "authorization",
  "billing_details",
  "card",
  "certificate_private_key",
  "client_reference_id",
  "client_secret",
  "cookie",
  "coupon",
  "customer",
  "customer_details",
  "customer_email",
  "discounts",
  "email",
  "fingerprint",
  "ip_address",
  "invoice",
  "last4",
  "metadata",
  "name",
  "order",
  "order_count",
  "orders",
  "password",
  "p12",
  "pfx",
  "payment_intent",
  "payment_method",
  "payment_method_details",
  "phone",
  "private_key",
  "promotion_code",
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
  "subscription",
  "total_details",
  "x_api_key",
]);
const DISALLOWED_EXTERNAL_PROOF_KEYS = new Set([
  ...DISALLOWED_PAID_ORDER_PROOF_KEYS,
]);

function normalizeProofKey(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

function containsDisallowedPaidOrderProofData(value) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, nested]) =>
      DISALLOWED_PAID_ORDER_PROOF_KEYS.has(normalizeProofKey(key)) ||
      containsDisallowedPaidOrderProofData(nested),
  );
}

function containsDisallowedExternalProofData(value) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, nested]) =>
      DISALLOWED_EXTERNAL_PROOF_KEYS.has(normalizeProofKey(key)) ||
      containsDisallowedExternalProofData(nested),
  );
}

export function readText(root, relativePath) {
  try {
    return readFileSync(join(root, relativePath), "utf8");
  } catch {
    return "";
  }
}

export function extractConfigUrl(configSrc, exportName) {
  const pattern = new RegExp(
    `export\\s+const\\s+${exportName}\\s*=\\s*["']([^"']+)["']`,
  );
  return pattern.exec(configSrc)?.[1] ?? "";
}

export function extractConfigNumber(configSrc, exportName) {
  const pattern = new RegExp(
    `export\\s+const\\s+${exportName}\\s*=\\s*([0-9]+)`,
  );
  const value = pattern.exec(configSrc)?.[1];
  return value ? Number(value) : 0;
}

export function readJsonProof(root, relativePath) {
  try {
    return JSON.parse(readText(root, relativePath));
  } catch {
    return null;
  }
}

function isHttpsUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

function isPublicUrl(parsed) {
  return (
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.search === "" &&
    parsed.hash === ""
  );
}

function isPublicHttpsUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.length > 0 &&
      isPublicUrl(parsed)
    );
  } catch {
    return false;
  }
}

function isStripePaymentLink(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "buy.stripe.com" &&
      parsed.pathname.length > 1 &&
      isPublicUrl(parsed)
    );
  } catch {
    return false;
  }
}

function isStripePaymentLinkId(value) {
  return /^plink_[A-Za-z0-9_]+$/.test(value);
}

function isLiveStripeCheckoutSessionId(value) {
  return /^cs_live_[A-Za-z0-9_]+$/.test(value);
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/i.test(value);
}

function formatFetchError(error) {
  const message = String(error?.message || error);
  const cause = error?.cause;
  if (!cause || typeof cause !== "object") {
    return message;
  }

  const causeCode = typeof cause.code === "string" ? cause.code : "";
  const causeMessage =
    typeof cause.message === "string" && cause.message !== message
      ? cause.message
      : "";
  const detail = [causeCode, causeMessage].filter(Boolean).join(": ");
  return detail ? `${message} cause=${detail}` : message;
}

function evaluateCheckoutProof({ checkoutUrl, expectedPriceUsd, proof }) {
  if (!proof || typeof proof !== "object") {
    return {
      pass: false,
      reason: "checkout_proof_missing",
      detail: "Stripe proof file is missing or invalid",
    };
  }
  if (containsDisallowedExternalProofData(proof)) {
    return {
      pass: false,
      reason: "checkout_proof_contains_sensitive_data",
      detail: "Stripe proof file contains keys, customer data, or request logs",
    };
  }

  const paymentLink = proof.payment_link || {};
  if (
    proof.payment_link !== undefined &&
    (!proof.payment_link ||
      typeof proof.payment_link !== "object" ||
      Array.isArray(proof.payment_link))
  ) {
    return {
      pass: false,
      reason: "checkout_proof_malformed",
      detail: "Stripe Payment Link proof payment_link must be an object",
    };
  }
  if (typeof paymentLink.url !== "string") {
    return {
      pass: false,
      reason: "checkout_proof_malformed",
      detail: "Stripe Payment Link proof payment_link.url must be a string",
    };
  }
  if (paymentLink.url !== checkoutUrl) {
    return {
      pass: false,
      reason: "checkout_url_mismatch",
      detail: "proof payment_link.url does not match CHECKOUT_URL",
    };
  }
  if (
    typeof paymentLink.active !== "boolean" ||
    typeof paymentLink.livemode !== "boolean"
  ) {
    return {
      pass: false,
      reason: "checkout_proof_malformed",
      detail: "Stripe Payment Link proof has malformed active or livemode fields",
    };
  }
  if (paymentLink.active !== true) {
    return {
      pass: false,
      reason: "checkout_not_active",
      detail: "Stripe Payment Link is not active",
    };
  }
  if (paymentLink.livemode !== true) {
    return {
      pass: false,
      reason: "checkout_not_live_mode",
      detail: "Stripe Payment Link proof is not livemode=true",
    };
  }

  const expectedCents = expectedPriceUsd * 100;
  const lineItems = proof.line_items;
  if (
    lineItems !== undefined &&
    (!lineItems || typeof lineItems !== "object" || Array.isArray(lineItems))
  ) {
    return {
      pass: false,
      reason: "checkout_proof_malformed",
      detail: "proof line_items must be an object when present",
    };
  }
  const items = lineItems?.data ?? [];
  if (
    lineItems?.has_more !== undefined &&
    typeof lineItems.has_more !== "boolean"
  ) {
    return {
      pass: false,
      reason: "checkout_proof_malformed",
      detail: "proof line_items.has_more must be a boolean when present",
    };
  }
  if (lineItems?.has_more === true) {
    return {
      pass: false,
      reason: "checkout_line_items_incomplete",
      detail: "proof line_items list is paginated and incomplete",
    };
  }
  if (!Array.isArray(items)) {
    return {
      pass: false,
      reason: "checkout_line_items_invalid",
      detail: "proof line_items.data must be an array",
    };
  }

  if (items.length > 1) {
    return {
      pass: false,
      reason: "checkout_extra_line_items",
      detail: "proof must contain exactly one line item",
    };
  }

  if (items.length === 0) {
    return {
      pass: false,
      reason: "checkout_line_items_invalid",
      detail: "proof must contain one line item",
    };
  }

  if (items.some((item) => !item || typeof item !== "object")) {
    return {
      pass: false,
      reason: "checkout_line_items_invalid",
      detail: "proof line_items.data entries must be objects",
    };
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
    return {
      pass: false,
      reason: "checkout_line_items_invalid",
      detail: "proof line item price must be an object",
    };
  }

  const matchingOneTimeItem = items.find((item) => {
    const price = item.price || {};
    return (
      item.quantity === 1 &&
      price.unit_amount === expectedCents &&
      price.currency === "usd" &&
      (price.recurring === null || price.recurring === undefined)
    );
  });

  if (!matchingOneTimeItem) {
    const hasRecurring = items.some((item) => item.price?.recurring);
    return {
      pass: false,
      reason: hasRecurring ? "checkout_not_one_time" : "checkout_price_mismatch",
      detail: `proof must contain one non-recurring USD ${expectedCents} cent line item`,
    };
  }
  if (
    typeof paymentLink.id !== "string" ||
    !isStripePaymentLinkId(paymentLink.id)
  ) {
    return {
      pass: false,
      reason: "checkout_proof_malformed",
      detail: "Stripe Payment Link proof payment_link.id must start with plink_ and include an id suffix",
    };
  }

  return {
    pass: true,
    reason: "checkout_proven",
    detail: `Stripe proof active livemode one-time USD ${expectedCents}`,
  };
}

function evaluateInstallerProof({ downloadUrl, expectedSha256, signer, proof }) {
  if (!proof || typeof proof !== "object") {
    return {
      pass: false,
      reason: "installer_proof_missing",
      detail: "installer proof file is missing or invalid",
    };
  }
  if (containsDisallowedExternalProofData(proof)) {
    return {
      pass: false,
      reason: "installer_proof_contains_sensitive_data",
      detail:
        "installer proof file contains signing secrets, customer data, or request logs",
    };
  }

  const signatureSigner = proof.signature?.signer;
  const signatureSubject = proof.signature?.subject;
  const proofSigner = signatureSigner ?? signatureSubject;
  const hasConflictingSignerFields =
    typeof signatureSigner === "string" &&
    typeof signatureSubject === "string" &&
    signatureSigner !== signatureSubject;
  if (
    typeof proof.download?.url !== "string" ||
    typeof proof.download.sha256 !== "string" ||
    !isSha256(proof.download.sha256) ||
    typeof proof.signature?.status !== "string" ||
    (signatureSigner !== undefined && typeof signatureSigner !== "string") ||
    (signatureSubject !== undefined && typeof signatureSubject !== "string") ||
    typeof proofSigner !== "string" ||
    hasConflictingSignerFields ||
    typeof proof.signature.timestamped !== "boolean"
  ) {
    return {
      pass: false,
      reason: "installer_proof_malformed",
      detail: "installer proof has malformed download or signature fields",
    };
  }
  if (proof.download?.url !== downloadUrl) {
    return {
      pass: false,
      reason: "installer_url_mismatch",
      detail: "installer proof URL does not match DOWNLOAD_URL",
    };
  }
  if (proof.download.sha256 !== expectedSha256) {
    return {
      pass: false,
      reason: "installer_checksum_mismatch",
      detail: "installer proof SHA-256 does not match DOWNLOAD_SHA256",
    };
  }
  if (proof.signature?.status !== "Valid") {
    return {
      pass: false,
      reason: "installer_signature_not_valid",
      detail: "installer proof does not show a valid signature",
    };
  }
  if (proof.signature.timestamped !== true) {
    return {
      pass: false,
      reason: "installer_signature_not_valid",
      detail: "installer proof does not show a timestamped signature",
    };
  }

  if (
    !proofSigner.includes(EXPECTED_SIGNER_SUBJECT) ||
    proofSigner !== signer
  ) {
    return {
      pass: false,
      reason: "installer_signer_mismatch",
      detail: "installer proof signer does not match the hosted installer",
    };
  }

  return {
    pass: true,
    reason: "installer_proven",
    detail: "installer proof matches hosted signed bytes",
  };
}

async function fetchProof(url, fetchImpl) {
  try {
    const res = await fetchImpl(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { connection: "close" },
    });
    if (res.status === 405 || res.status === 403) {
      const fallback = await fetchImpl(url, {
        method: "GET",
        redirect: "follow",
        headers: { connection: "close", range: "bytes=0-0" },
      });
      return { ok: fallback.ok, status: fallback.status };
    }
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: formatFetchError(e) };
  }
}

async function fetchAndHash(url, fetchImpl) {
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      headers: { connection: "close" },
    });
    if (!res.ok) {
      return { ok: false, status: res.status };
    }

    const bytes = Buffer.from(await res.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    return { ok: true, status: res.status, sha256, bytes };
  } catch (e) {
    return { ok: false, status: 0, error: formatFetchError(e) };
  }
}

export async function readInstallerSignatureFromBytes(
  bytes,
  signatureReader = readAuthenticodeSignature,
) {
  const dir = mkdtempSync(join(tmpdir(), "daybreak-installer-proof-"));
  const installerPath = join(dir, "Daybreak Setup.exe");
  try {
    writeFileSync(installerPath, bytes);
    return signatureReader(installerPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function defaultLookup(host) {
  const results = await lookup(host, { all: true, family: 4 });
  return results.map((result) => result.address);
}

function normalizeAddresses(addresses) {
  return addresses
    .map((address) =>
      typeof address === "string" ? address : String(address.address || ""),
    )
    .filter(Boolean);
}

async function fetchSite(url, fetchImpl) {
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      headers: { connection: "close" },
    });
    const body = await res.text();
    const allowedHosts = new Set([PRODUCTION_HOST, WWW_HOST]);
    return {
      ok: res.ok,
      status: res.status,
      hasApp: /Daybreak/.test(body),
      hasSupportContact: body.includes(`href="${SUPPORT_MAILTO}"`),
      surfaceIssue: liveSurfaceIssue(body, allowedHosts),
      publicCopyIssue: publicCopyIssue(body),
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      hasApp: false,
      hasSupportContact: false,
      surfaceIssue: null,
      publicCopyIssue: null,
      error: formatFetchError(e),
    };
  }
}

export async function evaluateProductionDomain({
  host = PRODUCTION_HOST,
  url = PRODUCTION_URL,
  lookupImpl = defaultLookup,
  fetchImpl = fetch,
}) {
  let addresses = [];
  try {
    addresses = normalizeAddresses(await lookupImpl(host));
  } catch (e) {
    return {
      pass: false,
      reason: "dns_unresolved",
      detail: `${host} unresolved (${String(e.message || e)})`,
    };
  }

  if (addresses.length === 0) {
    return {
      pass: false,
      reason: "dns_unresolved",
      detail: `${host} unresolved`,
    };
  }

  const missing = GITHUB_PAGES_IPV4.filter(
    (address) => !addresses.includes(address),
  );
  const extra = addresses.filter(
    (address) => !GITHUB_PAGES_ADDRESSES.includes(address),
  );
  if (missing.length || extra.length) {
    return {
      pass: false,
      reason: "dns_missing_github_pages_records",
      detail: `${host} resolves to ${addresses.join(",")}; expected ${GITHUB_PAGES_IPV4.join(",")}`,
    };
  }

  const site = await fetchSite(url, fetchImpl);
  if (
    !site.ok ||
    !site.hasApp ||
    !site.hasSupportContact ||
    site.surfaceIssue ||
    site.publicCopyIssue
  ) {
    const issue = [
      site.ok && !site.hasSupportContact ? "missing_support_contact" : "",
      site.surfaceIssue || "",
      site.publicCopyIssue || "",
    ].find(Boolean);
    return {
      pass: false,
      reason: "apex_https_not_ready",
      status: site.status,
      detail: `HTTPS ${site.status || "error"} contains_daybreak=${site.hasApp} support_contact=${site.hasSupportContact} surface_clean=${!site.surfaceIssue} copy_clean=${!site.publicCopyIssue}${
        issue ? ` issue=${issue}` : ""
      }${
        site.error ? ` error=${site.error}` : ""
      }`,
      error: site.error,
    };
  }

  return {
    pass: true,
    status: site.status,
    detail: `DNS A records resolved to GitHub Pages and apex returned HTTP ${site.status} with Daybreak, support contact, clean surface, and clean public copy`,
  };
}

export async function evaluateProductionDomains({
  fetchImpl = fetch,
  lookupImpl = defaultLookup,
} = {}) {
  const apex = await evaluateProductionDomain({
    host: PRODUCTION_HOST,
    url: PRODUCTION_URL,
    fetchImpl,
    lookupImpl,
  });
  const www = await evaluateProductionDomain({
    host: WWW_HOST,
    url: WWW_URL,
    fetchImpl,
    lookupImpl,
  });

  return {
    pass: apex.pass && www.pass,
    reason: apex.pass && www.pass ? "ready" : "production_domain_not_ready",
    detail: `${PRODUCTION_HOST}: ${apex.detail}; ${WWW_HOST}: ${www.detail}`,
    apex,
    www,
  };
}

export async function evaluateExternalLink({
  kind,
  url,
  expectedSha256 = "",
  expectedPriceUsd = 0,
  checkoutProof = null,
  installerProof = null,
  fetchImpl = fetch,
  signatureImpl = readInstallerSignatureFromBytes,
}) {
  if (!isHttpsUrl(url)) {
    return { pass: false, reason: "not_configured", detail: "not configured" };
  }

  if (kind === "checkout" && !isStripePaymentLink(url)) {
    return {
      pass: false,
      reason: "not_stripe_payment_link",
      detail: "configured URL is not a buy.stripe.com Payment Link",
    };
  }

  if (kind === "checkout") {
    const proofState = evaluateCheckoutProof({
      checkoutUrl: url,
      expectedPriceUsd,
      proof: checkoutProof,
    });
    if (!proofState.pass) {
      return proofState;
    }
  }

  if (kind === "download") {
    if (!isPublicHttpsUrl(url)) {
      return {
        pass: false,
        reason: "not_configured",
        detail: "download URL is not a public HTTPS URL",
      };
    }

    if (!isSha256(expectedSha256)) {
      return {
        pass: false,
        reason: "checksum_not_configured",
        detail: "installer checksum not configured",
      };
    }

    const proof = await fetchAndHash(url, fetchImpl);
    if (!proof.ok) {
      return {
        pass: false,
        reason: "http_not_ok",
        status: proof.status,
        detail: `HTTP ${proof.status || "error"}`,
        error: proof.error,
      };
    }

    if (proof.sha256.toLowerCase() !== expectedSha256.toLowerCase()) {
      return {
        pass: false,
        reason: "checksum_mismatch",
        status: proof.status,
        sha256: proof.sha256,
        detail: `SHA-256 mismatch (${proof.sha256})`,
      };
    }

    const signature = await signatureImpl(proof.bytes);
    const signatureStatus = signature.status || "Unknown";
    const signer = signature.subject || "";
    const signatureTimestamped = signature.timestamped === true;
    if (signatureStatus !== "Valid") {
      return {
        pass: false,
        reason: "signature_not_valid",
        status: proof.status,
        sha256: proof.sha256,
        signatureStatus,
        signatureTimestamped,
        detail: `signature_status=${signatureStatus}${
          signature.statusMessage ? ` ${signature.statusMessage}` : ""
        }`,
      };
    }
    if (!signer.includes(EXPECTED_SIGNER_SUBJECT)) {
      return {
        pass: false,
        reason: "signer_mismatch",
        status: proof.status,
        sha256: proof.sha256,
        signatureStatus,
        signatureTimestamped,
        signer,
        detail: `signer=${signer || "missing"} expected=${EXPECTED_SIGNER_SUBJECT}`,
      };
    }
    if (!signatureTimestamped) {
      return {
        pass: false,
        reason: "signature_not_valid",
        status: proof.status,
        sha256: proof.sha256,
        signatureStatus,
        signatureTimestamped,
        signer,
        detail: "signature_status=Valid timestamped=false",
      };
    }

    const installerProofState = evaluateInstallerProof({
      downloadUrl: url,
      expectedSha256,
      signer,
      proof: installerProof,
    });
    if (!installerProofState.pass) {
      return {
        ...installerProofState,
        status: proof.status,
        sha256: proof.sha256,
        signatureStatus,
        signatureTimestamped,
        signer,
      };
    }

    return {
      pass: true,
      status: proof.status,
      sha256: proof.sha256,
      signatureStatus,
      signatureTimestamped,
      signer,
      detail: `HTTP ${proof.status} sha256=${proof.sha256} signature_status=${signatureStatus} timestamped=${signatureTimestamped} timestamped_signer=${signer}`,
    };
  }

  const proof = await fetchProof(url, fetchImpl);
  if (!proof.ok) {
    return {
      pass: false,
      reason: "http_not_ok",
      status: proof.status,
      detail: `HTTP ${proof.status || "error"}`,
      error: proof.error,
    };
  }

  return { pass: true, status: proof.status, detail: `HTTP ${proof.status}` };
}

export function evaluateMarketSignal({
  checkoutUrl,
  expectedPriceUsd,
  expectedPaymentLinkId,
  proof,
}) {
  if (!proof || typeof proof !== "object") {
    return {
      pass: false,
      reason: "paid_order_proof_missing",
      paidOrders: 0,
      refunds: 0,
      detail: "paid_orders=0 refunds=0 reason=paid_order_proof_missing",
    };
  }
  if (Array.isArray(proof)) {
    return {
      pass: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
      detail: "paid_orders=0 refunds=0 reason=paid_order_proof_malformed",
    };
  }
  if (!isStripePaymentLink(checkoutUrl)) {
    return {
      pass: false,
      reason: "paid_order_checkout_not_payment_link",
      paidOrders: 0,
      refunds: 0,
      detail:
        "paid_orders=0 refunds=0 reason=paid_order_checkout_not_payment_link",
    };
  }

  if (containsDisallowedPaidOrderProofData(proof)) {
    return {
      pass: false,
      reason: "paid_order_proof_contains_customer_data",
      paidOrders: 0,
      refunds: 0,
      detail: "paid_orders=0 refunds=0 reason=paid_order_proof_contains_customer_data",
    };
  }

  const session = proof.checkout_session;
  const paymentLink = proof.payment_link;
  const refundProof = proof.refunds;
  const refundData = proof.refunds?.data;
  const refundHasMore = proof.refunds?.has_more;
  const refunds = Array.isArray(refundData) ? refundData.length : 0;

  if (
    paymentLink !== undefined &&
    (!paymentLink || typeof paymentLink !== "object" || Array.isArray(paymentLink))
  ) {
    return {
      pass: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
      detail: "paid_orders=0 refunds=0 reason=paid_order_proof_malformed",
    };
  }
  if (
    refundProof !== undefined &&
    (!refundProof || typeof refundProof !== "object" || Array.isArray(refundProof))
  ) {
    return {
      pass: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
      detail: "paid_orders=0 refunds=0 reason=paid_order_proof_malformed",
    };
  }
  if (
    Array.isArray(refundData) &&
    refundData.some(
      (refund) => !refund || typeof refund !== "object" || Array.isArray(refund),
    )
  ) {
    return {
      pass: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
      detail: "paid_orders=0 refunds=0 reason=paid_order_proof_malformed",
    };
  }
  function pending(reason, paidOrders = 0) {
    return {
      pass: false,
      reason,
      paidOrders,
      refunds,
      detail: `paid_orders=${paidOrders} refunds=${refunds} reason=${reason}`,
    };
  }

  if (paymentLink && typeof paymentLink.url !== "string") {
    return {
      pass: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
      detail: "paid_orders=0 refunds=0 reason=paid_order_proof_malformed",
    };
  }
  if (!session || !paymentLink || paymentLink.url !== checkoutUrl) {
    return pending("paid_order_checkout_mismatch");
  }
  if (
    typeof paymentLink.id !== "string" ||
    !isStripePaymentLinkId(paymentLink.id) ||
    typeof session.id !== "string" ||
    !isLiveStripeCheckoutSessionId(session.id) ||
    typeof session.payment_link !== "string" ||
    !isStripePaymentLinkId(session.payment_link)
  ) {
    return {
      pass: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
      detail: "paid_orders=0 refunds=0 reason=paid_order_proof_malformed",
    };
  }
  if (session.payment_link !== paymentLink.id) {
    return pending("paid_order_checkout_mismatch");
  }
  if (
    expectedPaymentLinkId !== undefined &&
    session.payment_link !== expectedPaymentLinkId
  ) {
    return pending("paid_order_checkout_mismatch");
  }
  if (
    typeof session.livemode !== "boolean" ||
    typeof session.mode !== "string" ||
    typeof session.status !== "string" ||
    typeof session.payment_status !== "string"
  ) {
    return {
      pass: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
      detail: "paid_orders=0 refunds=0 reason=paid_order_proof_malformed",
    };
  }
  if (session.livemode !== true) {
    return pending("paid_order_not_live_mode");
  }
  if (session.mode !== "payment") {
    return pending("paid_order_not_one_time");
  }
  if (session.status !== "complete") {
    return pending("paid_order_not_complete");
  }
  if (session.payment_status !== "paid") {
    return pending("paid_order_not_paid");
  }
  if (
    typeof session.amount_total !== "number" ||
    !Number.isInteger(session.amount_total) ||
    typeof session.currency !== "string"
  ) {
    return {
      pass: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
      detail: "paid_orders=0 refunds=0 reason=paid_order_proof_malformed",
    };
  }
  if (
    session.amount_total !== expectedPriceUsd * 100 ||
    session.currency !== "usd"
  ) {
    return pending("paid_order_amount_mismatch");
  }
  if (!Array.isArray(refundData)) {
    return pending("paid_order_refund_proof_missing");
  }
  if (refundHasMore !== undefined && typeof refundHasMore !== "boolean") {
    return {
      pass: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
      detail: "paid_orders=0 refunds=0 reason=paid_order_proof_malformed",
    };
  }
  if (refundHasMore !== false) {
    return pending("paid_order_refund_proof_incomplete");
  }
  if (refunds > 0) {
    return pending("paid_order_refunded", 1);
  }

  return {
    pass: true,
    reason: "ready",
    paidOrders: 1,
    refunds: 0,
    detail: "paid_orders=1 refunds=0 reason=ready",
  };
}

export async function buildReadinessGates({
  root,
  fetchImpl = fetch,
  lookupImpl = defaultLookup,
}) {
  const configSrc = readText(root, "site/app/config.ts");
  const checkoutUrl = extractConfigUrl(configSrc, "CHECKOUT_URL");
  const downloadUrl = extractConfigUrl(configSrc, "DOWNLOAD_URL");
  const downloadSha256 = extractConfigUrl(configSrc, "DOWNLOAD_SHA256");
  const priceUsd = extractConfigNumber(configSrc, "PRICE_USD");
  const checkoutProof = readJsonProof(root, "proof/stripe-payment-link.json");
  const installerProof = readJsonProof(root, "proof/installer-download.json");
  const paidOrderProof = readJsonProof(root, "proof/first-paid-order.json");

  const checkout = await evaluateExternalLink({
    kind: "checkout",
    url: checkoutUrl,
    expectedPriceUsd: priceUsd,
    checkoutProof,
    fetchImpl,
  });
  const download = await evaluateExternalLink({
    kind: "download",
    url: downloadUrl,
    expectedSha256: downloadSha256,
    installerProof,
    fetchImpl,
  });
  const domain = await evaluateProductionDomains({ fetchImpl, lookupImpl });
  const marketSignal = evaluateMarketSignal({
    checkoutUrl,
    expectedPriceUsd: priceUsd,
    expectedPaymentLinkId: checkoutProof?.payment_link?.id,
    proof: paidOrderProof,
  });

  return [
    {
      name: "Core domain logic built",
      pass: existsSync(join(root, "packages/core/dist/index.js")),
      detail: "packages/core/dist/index.js",
      blocker: "run npm run build:core",
    },
    {
      name: "Desktop app bundled",
      pass:
        existsSync(join(root, "desktop/dist/main.js")) &&
        existsSync(join(root, "desktop/dist/renderer.js")),
      detail: "desktop/dist/{main,renderer}.js",
      blocker: "run npm run build:desktop",
    },
    {
      name: "Site static export present",
      pass: existsSync(join(root, "site/out/index.html")),
      detail: "site/out/index.html",
      blocker: "run npm run build:site",
    },
    {
      name: "Stripe $19 checkout link wired",
      pass: checkout.pass,
      detail: checkout.pass
        ? `${checkoutUrl} (${checkout.detail})`
        : `site/app/config.ts -> CHECKOUT_URL (${checkout.detail})`,
      blocker:
        "create a real Stripe Payment Link ($19 one-time), set CHECKOUT_URL, add proof/stripe-payment-link.json from Stripe, and verify it returns HTTP 2xx",
    },
    {
      name: "Windows installer download wired",
      pass: download.pass,
      detail: download.pass
        ? `${downloadUrl} (${download.detail})`
        : `site/app/config.ts -> DOWNLOAD_URL/DOWNLOAD_SHA256 (${download.detail})`,
      blocker:
        "produce a signed and timestamped Windows installer, publish its SHA-256, host it, set DOWNLOAD_URL and DOWNLOAD_SHA256, add proof/installer-download.json, and verify the bytes and timestamped Passive Print Labs Authenticode signer match",
    },
    {
      name: "Production domain owned + attached",
      pass: domain.pass,
      detail: domain.detail,
      blocker:
        "point daybreak.rest apex A records and www CNAME at GitHub Pages, attach as custom domain, and wait for HTTPS to serve the app on both hosts",
    },
    {
      name: "Real market signal (>=1 paid order)",
      pass: marketSignal.pass,
      detail: marketSignal.pass
        ? marketSignal.detail
        : `${marketSignal.detail} - no fabricated proof permitted`,
      blocker:
        "ship checkout, earn the first real $19 order, and add redacted proof/first-paid-order.json from Stripe",
    },
  ];
}

export function renderReadinessReport(gates) {
  const passed = gates.filter((g) => g.pass).length;
  const total = gates.length;
  const allPass = passed === total;
  const lines = [];

  lines.push(`# Daybreak readiness - ${passed}/${total} gates pass`, "");
  lines.push("| Gate | State | Detail |");
  lines.push("| --- | --- | --- |");
  for (const g of gates) {
    lines.push(`| ${g.name} | ${g.pass ? "pass" : "PENDING"} | ${g.detail} |`);
  }

  const pending = gates.filter((g) => !g.pass);
  if (pending.length) {
    lines.push("", "## Remaining real blockers (honest)", "");
    for (const g of pending) {
      lines.push(`- **${g.name}** -> ${g.blocker}`);
    }
  }

  lines.push(
    "",
    `DAYBREAK_READINESS=${allPass ? "ready" : "pending"} passed=${passed} total=${total}`,
  );

  return { allPass, text: lines.join("\n") };
}
