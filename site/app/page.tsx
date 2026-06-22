import { CHECKOUT_URL, DOWNLOAD_URL, PRICE_USD, isConfigured } from "./config";

const checkoutReady = isConfigured(CHECKOUT_URL);
const downloadReady = isConfigured(DOWNLOAD_URL);

function Cta() {
  if (checkoutReady) {
    return (
      <a className="btn btn-primary" href={CHECKOUT_URL}>
        Get Daybreak - ${PRICE_USD} once
      </a>
    );
  }

  return (
    <span className="btn btn-primary is-pending" aria-disabled="true">
      Checkout opening soon - ${PRICE_USD} once
    </span>
  );
}

export default function Home() {
  return (
    <main>
      <header className="nav">
        <span className="wordmark">Daybreak</span>
        <span className="byline">a Passive Print Labs product</span>
      </header>

      <section className="hero">
        <p className="kicker">Windows - one-time $19 - no subscription</p>
        <h1>
          Wipe the morning
          <br />
          before it owns you.
        </h1>
        <p className="lede">
          Daybreak takes over your screen the moment you log in. It shows
          yesterday&apos;s unfinished business and asks for today&apos;s three
          commitments, and it will not get out of your way until you&apos;ve{" "}
          <strong>physically wiped every item</strong>: commit, defer, or kill.
        </p>
        <div className="cta-row">
          <Cta />
          {downloadReady ? (
            <a className="btn btn-ghost" href={DOWNLOAD_URL}>
              Download for Windows
            </a>
          ) : (
            <span className="btn btn-ghost is-pending" aria-disabled="true">
              Installer in final packaging
            </span>
          )}
        </div>
        <p className="fine">
          No account. No cloud. Your commitments stay in a local file on your
          machine.
        </p>
      </section>

      <section className="how">
        <h2>The whole app is one honest gesture</h2>
        <ol className="steps">
          <li>
            <span className="step-n">1</span>
            <h3>It opens itself</h3>
            <p>
              First login of the day, full-screen. No tray icon to ignore, no
              notification to swat away.
            </p>
          </li>
          <li>
            <span className="step-n">2</span>
            <h3>You wipe each item</h3>
            <p>
              Swipe every carried-over task and every new commitment into{" "}
              <em>commit</em>, <em>defer</em>, or <em>kill</em>. Nothing is left
              ambiguous.
            </p>
          </li>
          <li>
            <span className="step-n">3</span>
            <h3>Then it lets go</h3>
            <p>
              Only once the board is clear does Daybreak close. Evening, it
              comes back once for a 20-second done/missed review.
            </p>
          </li>
        </ol>
      </section>

      <section className="why">
        <h2>Built for people who keep a streak honest</h2>
        <ul className="bullets">
          <li>
            <strong>Three commitments, max.</strong> The cap is the point. More
            than three isn&apos;t a plan, it&apos;s a wish list.
          </li>
          <li>
            <strong>Carry-over that stings a little.</strong> Skipped items come
            back on top, counting the days you&apos;ve dodged them.
          </li>
          <li>
            <strong>A weekly streak you actually earned.</strong> A day only
            counts when you finished the ritual and kept at least one thing.
          </li>
          <li>
            <strong>Local-only.</strong> No login, no sync, no telemetry. The
            data file is yours.
          </li>
        </ul>
      </section>

      <section className="pricing" id="buy">
        <div className="price-card">
          <p className="kicker">One-time purchase</p>
          <p className="price">
            <span className="amount">${PRICE_USD}</span>
            <span className="per">once - lifetime updates</span>
          </p>
          <ul className="price-points">
            <li>Windows 10 &amp; 11</li>
            <li>Morning ritual + evening review</li>
            <li>Weekly streak tracking</li>
            <li>No subscription, ever</li>
          </ul>
          <Cta />
        </div>
      </section>

      <section className="status" id="status">
        <h2>Launch status</h2>
        <ul className="status-list" aria-label="Current launch status">
          <li className="status-pass">
            <strong>Live preview</strong>
            <span>GitHub Pages preview is online and checked by script.</span>
          </li>
          <li>
            <strong>Checkout</strong>
            <span>
              Pending a real Stripe Payment Link. No placeholder payment URLs.
            </span>
          </li>
          <li>
            <strong>Installer</strong>
            <span>
              Pending signed Windows build, hosted download URL, and published
              SHA-256 checksum.
            </span>
          </li>
          <li>
            <strong>Domain</strong>
            <span>
              daybreak.rest is attached; GitHub Pages HTTPS is pending.
            </span>
          </li>
          <li>
            <strong>Market signal</strong>
            <span>Pending the first genuine paid order. No fabricated proof.</span>
          </li>
        </ul>
      </section>

      <section className="faq">
        <h2>Straight answers</h2>
        <dl>
          <dt>Is this really un-closable?</dt>
          <dd>
            The morning window stays until every surfaced item is wiped. You can
            always <em>kill</em> an item in one gesture; Daybreak forces a
            decision, not busywork.
          </dd>
          <dt>Does it phone home?</dt>
          <dd>
            No. There is no account and no server. Your commitments live in a
            local file on your PC.
          </dd>
          <dt>What&apos;s the refund policy?</dt>
          <dd>
            14-day no-questions refund. Email founder@daybreak.rest.
          </dd>
          <dt>Is it shipping yet?</dt>
          <dd>
            Daybreak is in active build-in-public as ship-or-die cycle 2. This
            page reflects real status: where you see &ldquo;opening soon,&rdquo;
            that step is genuinely not live yet; we don&apos;t fake buttons.
          </dd>
        </dl>
      </section>

      <footer className="foot">
        <p>Daybreak - Passive Print Labs LLC - founder@daybreak.rest</p>
        <p>
          <a href="privacy/">Privacy</a> - <a href="terms/">Terms</a>
        </p>
        <p className="fine">
          Built in public. No fabricated reviews on this page; when there are
          real users, their words will appear here with attribution.
        </p>
      </footer>
    </main>
  );
}
