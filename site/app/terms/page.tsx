import { PRICE_USD } from "../config";
import { getPublicCheckoutState } from "../checkout-state";
import { SITE_IMAGE, SITE_URL } from "../site";

const title = "Terms - Daybreak";
const description =
  "Daybreak terms for the Windows commitment app, one-time purchase, refunds, local-only app scope, and launch status.";

export const metadata = {
  title,
  description,
  alternates: {
    canonical: `${SITE_URL}/terms/`,
  },
  openGraph: {
    title,
    description,
    url: `${SITE_URL}/terms/`,
    siteName: "Daybreak",
    type: "website",
    images: [
      {
        url: SITE_IMAGE,
        width: 1002,
        height: 753,
        alt: "Daybreak Windows app showing a morning commitment ready to be wiped",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [SITE_IMAGE],
  },
};

export default function TermsPage() {
  const checkoutReady = getPublicCheckoutState().ready;

  return (
    <main className="legal">
      <a className="back-link" href="../">
        Daybreak
      </a>
      <h1>Terms</h1>
      <p className="lede">
        These terms describe the intended Daybreak purchase and support policy.
        {checkoutReady
          ? " Checkout is live only through the verified Stripe Payment Link on the Daybreak homepage."
          : " Checkout remains closed until a real Stripe Payment Link is connected and verified."}
      </p>

      <section>
        <h2>Product</h2>
        <p>
          Daybreak is a Windows desktop app for a morning commitment ritual,
          evening review, local carry-over, and weekly streak tracking. It is
          local-only: no account, no cloud sync, and no telemetry.
        </p>
      </section>

      <section>
        <h2>Purchase</h2>
        <p>
          The planned launch price is ${PRICE_USD} as a one-time purchase for
          the Windows app and included updates. No subscription is planned for
          this v1 release.
        </p>
      </section>

      <section>
        <h2>Refunds</h2>
        <p>
          The stated refund policy is 14 days, no questions asked. Refund
          requests should be sent to founder@daybreak.rest from the purchase
          email once checkout is live.
        </p>
      </section>

      <section>
        <h2>Limitations</h2>
        <p>
          Daybreak is an accountability tool, not a guarantee of productivity,
          revenue, health, or any specific outcome. You are responsible for the
          commitments you enter and for keeping a backup of any local data you
          care about.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>Email founder@daybreak.rest for support or terms questions.</p>
      </section>
    </main>
  );
}
