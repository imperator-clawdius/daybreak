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

Keep API keys, authorization headers, cookies, customer data, session data,
request/response logs, and order data out of this file.

## `installer-download.json`

Required before the public download CTA can go live and before the installer
gate can pass. Generate it only after hosting the real signed Windows installer
and verifying the hosted bytes. The verifier expects:

- `download.url` equals `DOWNLOAD_URL` in `site/app/config.ts`
- `download.sha256` equals `DOWNLOAD_SHA256` in `site/app/config.ts`
- `signature.status` is `Valid`
- `signature.signer` or `signature.subject` contains `Passive Print Labs LLC`

Keep certificate private keys, signing credentials, authorization headers,
cookies, request logs, and customer data out of this file.

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
- `refunds.has_more` is `false`

Keep customer email, customer name, payment method details, receipts,
authorization headers, cookies, and API keys out of this file.

The verifier rejects any proof artifact that includes sensitive fields such as
`customer`, `customer_email`, `customer_details`, `payment_intent`,
`payment_method`, `payment_method_details`, `receipt_email`, `client_secret`,
`api_key`, `request`, `response`, `request_headers`, `response_headers`,
`private_key`, `certificate_private_key`, `signing_key`, `stripe_secret_key`,
`secret_key`, `apiKey`, `x-api-key`, `authorization`, `cookie`, `set-cookie`,
`pfx`, `p12`, or `password`. Key matching is normalized for common case,
hyphen, whitespace, and camel-case variants.
