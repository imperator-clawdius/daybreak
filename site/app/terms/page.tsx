import { PRICE_USD } from "../config";

export const metadata = {
  title: "Terms - Daybreak",
  description:
    "Daybreak terms for the Windows commitment app, one-time purchase, refunds, local-only app scope, and launch status.",
};

export default function TermsPage() {
  return (
    <main className="legal">
      <a className="back-link" href="../">
        Daybreak
      </a>
      <h1>Terms</h1>
      <p className="lede">
        These terms describe the intended Daybreak purchase and support policy.
        Checkout is not live yet; the page will not accept payment until a real
        Stripe Payment Link is connected.
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
          The stated refund policy is 14 days, no questions asked. When checkout
          is live, refund requests should be sent to founder@daybreakdesk.com
          from the purchase email.
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
        <p>Email founder@daybreakdesk.com for support or terms questions.</p>
      </section>
    </main>
  );
}
