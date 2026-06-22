import { getPublicCheckoutState } from "../checkout-state";
import { SITE_IMAGE, SITE_URL } from "../site";

const title = "Privacy - Daybreak";
const description =
  "Daybreak privacy policy: local-only Windows commitment data, no account, no cloud sync, no telemetry.";

export const metadata = {
  title,
  description,
  alternates: {
    canonical: `${SITE_URL}/privacy/`,
  },
  openGraph: {
    title,
    description,
    url: `${SITE_URL}/privacy/`,
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
};

export default function PrivacyPage() {
  const checkoutReady = getPublicCheckoutState().ready;

  return (
    <main className="legal">
      <a className="back-link" href="../">
        Daybreak
      </a>
      <h1>Privacy</h1>
      <p className="lede">
        Daybreak is built to stay local. The Windows app does not require an
        account, does not sync commitments to a server, and does not include
        telemetry.
      </p>

      <section>
        <h2>What the app stores</h2>
        <p>
          The desktop app stores your daily commitments, wipe decisions, day
          logs, and last-seen timestamp in a local file on your PC. That file is
          used only to restore your board, carry unresolved items forward, and
          calculate streaks.
        </p>
      </section>

      <section>
        <h2>What the app does not collect</h2>
        <p>
          Daybreak does not collect analytics events, usage recordings, contact
          lists, calendar data, screenshots, or the text of your commitments.
          There is no cloud account for the app.
        </p>
      </section>

      <section>
        <h2>Checkout and support</h2>
        <p>
          {checkoutReady
            ? "Checkout is handled by Stripe, and Stripe may process payment details under its own privacy terms."
            : "Checkout remains closed until a verified Stripe Payment Link is connected."}{" "}
          If you email support, your email and message are used to answer that
          request.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>Email founder@daybreak.rest with privacy questions.</p>
      </section>
    </main>
  );
}
