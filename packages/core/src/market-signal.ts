export type PaidOrderProofReason =
  | "ready"
  | "paid_order_proof_missing"
  | "paid_order_checkout_mismatch"
  | "paid_order_not_live_mode"
  | "paid_order_not_one_time"
  | "paid_order_not_complete"
  | "paid_order_not_paid"
  | "paid_order_amount_mismatch"
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
  };
  payment_link?: {
    id?: unknown;
    url?: unknown;
  };
  refunds?: {
    data?: unknown[];
  };
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
