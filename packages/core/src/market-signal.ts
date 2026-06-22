export type PaidOrderProofReason =
  | "ready"
  | "paid_order_proof_missing"
  | "paid_order_checkout_mismatch"
  | "paid_order_not_live_mode"
  | "paid_order_not_one_time"
  | "paid_order_not_complete"
  | "paid_order_not_paid"
  | "paid_order_amount_mismatch"
  | "paid_order_proof_contains_customer_data"
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
  };
}

const DISALLOWED_PROOF_KEYS = new Set([
  "api_key",
  "client_secret",
  "customer",
  "customer_details",
  "customer_email",
  "payment_intent",
  "payment_method",
  "payment_method_details",
  "receipt_email",
]);

function containsDisallowedCustomerData(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  for (const [key, nested] of Object.entries(value)) {
    if (DISALLOWED_PROOF_KEYS.has(key)) return true;
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
  const session = orderProof.checkout_session;
  const paymentLink = orderProof.payment_link;
  const refunds = orderProof.refunds?.data?.length ?? 0;

  if (!session || !paymentLink || paymentLink.url !== checkoutUrl) {
    return {
      ready: false,
      reason: "paid_order_checkout_mismatch",
      paidOrders: 0,
      refunds,
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

  if (containsDisallowedCustomerData(orderProof)) {
    return {
      ready: false,
      reason: "paid_order_proof_contains_customer_data",
      paidOrders: 0,
      refunds,
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
