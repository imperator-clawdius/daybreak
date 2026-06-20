// Single source of truth for the two external links the landing page needs.
// Both default to honest placeholders. The launch verifier (scripts/
// verify-launch.mjs) treats a placeholder as "pending" and refuses to call
// the site sale-ready until real URLs are filled in here.
//
// When the real Stripe Payment Link and the real installer download exist,
// replace these constants and redeploy.

/** Stripe Payment Link for the $19 one-time purchase. */
export const CHECKOUT_URL = "PENDING_STRIPE_PAYMENT_LINK";

/** Direct download for the signed Windows installer. */
export const DOWNLOAD_URL = "PENDING_INSTALLER_DOWNLOAD";

export const PRICE_USD = 19;

export function isConfigured(url: string): boolean {
  return /^https:\/\//.test(url);
}
