import Link from "next/link";

import { SupportEmail } from "./contact";

export default function NotFound() {
  return (
    <main className="legal">
      <Link className="back-link" href="/">
        Daybreak
      </Link>
      <h1>Page not found</h1>
      <p className="lede">
        This Daybreak page does not exist. The Windows app, privacy policy, and
        terms are still available from the production site.
      </p>
      <section>
        <h2>What to do next</h2>
        <p>
          Return to <Link href="/">Daybreak</Link>, review the{" "}
          <Link href="/privacy/">privacy policy</Link> or{" "}
          <Link href="/terms/">terms</Link>, or email <SupportEmail /> if a
          launch link led here.
        </p>
      </section>
    </main>
  );
}
