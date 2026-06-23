# Daybreak proof artifacts

This directory is for launch evidence that backs a readiness gate. Do not add
fabricated proof.

## `stripe-payment-link.json`

Required before the checkout gate can pass. Generate it from the real Stripe
account after creating the live $19 one-time Payment Link. The verifier expects:

- `payment_link.id` starts with `plink_` and includes an ID suffix
- `payment_link.url` equals `CHECKOUT_URL` in `site/app/config.ts`
- `payment_link.active` is `true`
- `payment_link.livemode` is `true`
- `line_items.data` contains exactly the one-time USD 1900-cent price with
  `quantity: 1`
- `line_items.has_more` is absent or boolean `false`

The configured Payment Link URL must be the canonical public
`https://buy.stripe.com/...` URL with no query string or fragment.
Keep API keys, authorization headers, cookies, customer data, Stripe metadata,
client reference IDs, invoices, subscriptions, card or network metadata, session
data, request/response logs, and order data out of this file.

## `installer-download.json`

Required before the public download CTA can go live and before the installer
gate can pass. Generate it only after hosting the real signed and timestamped
Windows installer and verifying the hosted bytes. The verifier expects:

- `download.url` equals `DOWNLOAD_URL` in `site/app/config.ts`
- `download.sha256` is a SHA-256 checksum and equals `DOWNLOAD_SHA256` in
  `site/app/config.ts`
- `signature.status` is `Valid`
- `signature.signer` or `signature.subject` contains `Passive Print Labs LLC`
- `signature.timestamped` is `true`

The configured download URL must be public HTTPS with no embedded credentials,
query string, or fragment. Do not use signed, expiring, or tokenized URLs for
the public installer CTA.
Keep certificate private keys, signing credentials, authorization headers,
cookies, request logs, customer data, Stripe metadata, client reference IDs,
invoices, subscriptions, and card or network metadata out of this file.

## `first-paid-order.json`

Required before the market-signal gate can pass. Generate it from Stripe after
the first real paid checkout. The verifier expects:

- `checkout_session.livemode` is `true`
- `checkout_session.mode` is `payment`
- `checkout_session.status` is `complete`
- `checkout_session.payment_status` is `paid`
- `checkout_session.amount_total` is `1900`
- `checkout_session.currency` is `usd`
- `checkout_session.id` starts with `cs_live_`
- `checkout_session.payment_link` equals `payment_link.id`
- `payment_link.url` equals `CHECKOUT_URL` in `site/app/config.ts`
- `refunds.data` is empty
- `refunds.has_more` is `false`

Keep customer email, customer name, payment method details, Stripe metadata,
client reference IDs, invoices, subscriptions, card metadata, network metadata,
receipts, authorization headers, cookies, and API keys out of this file.

The verifier rejects any proof artifact that includes sensitive fields such as
`customer`, `customer_email`, `customer_details`, `payment_intent`,
`payment_method`, `payment_method_details`, `receipt_email`, `client_secret`,
`billing_details`, `shipping_details`, `email`, `name`, `phone`, `address`,
`card`, `last4`, `fingerprint`, `ip_address`, `metadata`,
`client_reference_id`, `invoice`, `subscription`,
`api_key`, `request`, `response`, `request_headers`, `response_headers`,
`order`, `order_count`, `orders`, `session`, `session_data`, `sessions`,
`private_key`, `certificate_private_key`, `signing_key`, `stripe_secret_key`,
`secret_key`, `apiKey`, `x-api-key`, `authorization`, `cookie`, `set-cookie`,
`pfx`, `p12`, or `password`. Key matching is normalized for common case,
hyphen, whitespace, underscore, and camel-case variants.

`first-paid-order.json` intentionally requires `checkout_session`, but extra
generic session or order snapshots still fail closed. Keep that file to the
minimal redacted fields listed above.
