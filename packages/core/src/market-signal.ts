export type PaidOrderProofReason =
  | "ready"
  | "paid_order_proof_missing"
  | "paid_order_checkout_mismatch"
  | "paid_order_not_live_mode"
  | "paid_order_not_one_time"
  | "paid_order_not_complete"
  | "paid_order_not_paid"
  | "paid_order_proof_malformed"
  | "paid_order_amount_mismatch"
  | "paid_order_proof_contains_customer_data"
  | "paid_order_refund_proof_missing"
  | "paid_order_refund_proof_incomplete"
  | "paid_order_refunded";

export interface PaidOrderProofState {
  ready: boolean;
  reason: PaidOrderProofReason;
  paidOrders: number;
  refunds: number;
}

interface PaidOrderProof {
  checkout_session?: {
    livemode?: unknown;
    mode?: unknown;
    status?: unknown;
    payment_status?: unknown;
    amount_total?: unknown;
    currency?: unknown;
    payment_link?: unknown;
    customer?: unknown;
    customer_email?: unknown;
    customer_details?: unknown;
    payment_intent?: unknown;
    payment_method?: unknown;
    payment_method_details?: unknown;
    receipt_email?: unknown;
  };
  payment_link?: {
    id?: unknown;
    url?: unknown;
  };
  refunds?: {
    data?: unknown[];
    has_more?: unknown;
  };
}

const DISALLOWED_PROOF_KEYS = new Set([
  "api_key",
  "apikey",
  "authorization",
  "certificate_private_key",
  "client_secret",
  "cookie",
  "customer",
  "customer_details",
  "customer_email",
  "password",
  "p12",
  "pfx",
  "payment_intent",
  "payment_method",
  "payment_method_details",
  "private_key",
  "receipt_email",
  "request",
  "request_headers",
  "response",
  "response_headers",
  "secret_key",
  "set_cookie",
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

function containsDisallowedCustomerData(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  for (const [key, nested] of Object.entries(value)) {
    if (DISALLOWED_PROOF_KEYS.has(normalizeProofKey(key))) return true;
    if (containsDisallowedCustomerData(nested)) return true;
  }
  return false;
}

export function getPaidOrderProofState({
  checkoutUrl,
  expectedPriceUsd,
  proof,
}: {
  checkoutUrl: string;
  expectedPriceUsd: number;
  proof: unknown;
}): PaidOrderProofState {
  if (!proof || typeof proof !== "object") {
    return {
      ready: false,
      reason: "paid_order_proof_missing",
      paidOrders: 0,
      refunds: 0,
    };
  }

  const orderProof = proof as PaidOrderProof;
  if (containsDisallowedCustomerData(orderProof)) {
    return {
      ready: false,
      reason: "paid_order_proof_contains_customer_data",
      paidOrders: 0,
      refunds: 0,
    };
  }

  const session = orderProof.checkout_session;
  const paymentLink = orderProof.payment_link;
  const refundProof = orderProof.refunds;
  const refundData = orderProof.refunds?.data;
  const refundHasMore = orderProof.refunds?.has_more;
  const refunds = Array.isArray(refundData) ? refundData.length : 0;

  if (
    paymentLink !== undefined &&
    (!paymentLink || typeof paymentLink !== "object" || Array.isArray(paymentLink))
  ) {
    return {
      ready: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
    };
  }
  if (
    refundProof !== undefined &&
    (!refundProof || typeof refundProof !== "object" || Array.isArray(refundProof))
  ) {
    return {
      ready: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
    };
  }
  if (
    Array.isArray(refundData) &&
    refundData.some(
      (refund) => !refund || typeof refund !== "object" || Array.isArray(refund),
    )
  ) {
    return {
      ready: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
    };
  }
  if (paymentLink && typeof paymentLink.url !== "string") {
    return {
      ready: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
    };
  }
  if (!session || !paymentLink || paymentLink.url !== checkoutUrl) {
    return {
      ready: false,
      reason: "paid_order_checkout_mismatch",
      paidOrders: 0,
      refunds,
    };
  }
  if (
    typeof paymentLink.id !== "string" ||
    typeof session.payment_link !== "string"
  ) {
    return {
      ready: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
    };
  }
  if (session.payment_link !== paymentLink.id) {
    return {
      ready: false,
      reason: "paid_order_checkout_mismatch",
      paidOrders: 0,
      refunds,
    };
  }
  if (
    typeof session.livemode !== "boolean" ||
    typeof session.mode !== "string" ||
    typeof session.status !== "string" ||
    typeof session.payment_status !== "string"
  ) {
    return {
      ready: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
    };
  }
  if (session.livemode !== true) {
    return {
      ready: false,
      reason: "paid_order_not_live_mode",
      paidOrders: 0,
      refunds,
    };
  }
  if (session.mode !== "payment") {
    return {
      ready: false,
      reason: "paid_order_not_one_time",
      paidOrders: 0,
      refunds,
    };
  }
  if (session.status !== "complete") {
    return {
      ready: false,
      reason: "paid_order_not_complete",
      paidOrders: 0,
      refunds,
    };
  }
  if (session.payment_status !== "paid") {
    return {
      ready: false,
      reason: "paid_order_not_paid",
      paidOrders: 0,
      refunds,
    };
  }
  if (
    typeof session.amount_total !== "number" ||
    !Number.isInteger(session.amount_total) ||
    typeof session.currency !== "string"
  ) {
    return {
      ready: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
    };
  }
  if (
    session.amount_total !== expectedPriceUsd * 100 ||
    session.currency !== "usd"
  ) {
    return {
      ready: false,
      reason: "paid_order_amount_mismatch",
      paidOrders: 0,
      refunds,
    };
  }

  if (!Array.isArray(refundData)) {
    return {
      ready: false,
      reason: "paid_order_refund_proof_missing",
      paidOrders: 0,
      refunds: 0,
    };
  }

  if (refundHasMore !== undefined && typeof refundHasMore !== "boolean") {
    return {
      ready: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
    };
  }

  if (refundHasMore !== false) {
    return {
      ready: false,
      reason: "paid_order_refund_proof_incomplete",
      paidOrders: 0,
      refunds: 0,
    };
  }

  if (refunds > 0) {
    return {
      ready: false,
      reason: "paid_order_refunded",
      paidOrders: 1,
      refunds,
    };
  }

  return {
    ready: true,
    reason: "ready",
    paidOrders: 1,
    refunds: 0,
  };
}
