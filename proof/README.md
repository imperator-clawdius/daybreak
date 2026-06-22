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
