# Daybreak proof artifacts

This directory is for launch evidence that backs a readiness gate. Do not add
fabricated proof.

## `stripe-payment-link.json`

Required before the checkout gate can pass. Generate it from the real Stripe
account after creating the live $19 one-time Payment Link. The verifier expects:

- `payment_link.url` equals `CHECKOUT_URL` in `site/app/config.ts`
- `payment_link.active` is `true`
- `payment_link.livemode` is `true`
- `line_items.data` contains exactly the one-time USD 1900-cent price with
  `quantity: 1`

Keep API keys, customer data, session data, and order data out of this file.

## `first-paid-order.json`

Required before the market-signal gate can pass. Generate it from Stripe after
the first real paid checkout. The verifier expects:

- `checkout_session.livemode` is `true`
- `checkout_session.mode` is `payment`
- `checkout_session.status` is `complete`
- `checkout_session.payment_status` is `paid`
- `checkout_session.amount_total` is `1900`
- `checkout_session.currency` is `usd`
- `checkout_session.payment_link` equals `payment_link.id`
- `payment_link.url` equals `CHECKOUT_URL` in `site/app/config.ts`
- `refunds.data` is empty

Keep customer email, customer name, payment method details, receipts, and API
keys out of this file.
