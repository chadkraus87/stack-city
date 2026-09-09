import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Legal & Trust Center",
  description: "Stack City privacy, terms of use, accessibility, and data-handling information.",
  alternates: { canonical: "/legal" },
};

const EFFECTIVE_DATE = "September 9, 2026";

export default function LegalPage() {
  return (
    <main className="legal-shell">
      <header className="legal-hero">
        <Link className="legal-back" href="/">← Return to Stack City</Link>
        <span>LEGAL / PRIVACY / ACCESSIBILITY</span>
        <h1>Trust should be part of the architecture.</h1>
        <p>
          Stack City is a local-first educational strategy game operated by Chad Kraus.
          This page explains what the game stores, the terms that apply, and how to report a problem.
        </p>
        <small>Effective and last updated: {EFFECTIVE_DATE}</small>
      </header>

      <nav className="legal-nav" aria-label="Legal page sections">
        <a href="#privacy">Privacy</a>
        <a href="#terms">Terms</a>
        <a href="#children">Children</a>
        <a href="#accessibility">Accessibility</a>
        <a href="#contact">Contact</a>
      </nav>

      <div className="legal-layout">
        <aside>
          <strong>Current release</strong>
          <ul>
            <li>No accounts or profiles</li>
            <li>No advertising or analytics SDK</li>
            <li>No sale or sharing of personal data</li>
            <li>No payment collection</li>
            <li>No gameplay data sent to Stack City</li>
          </ul>
          <p>If those facts change, this notice must be updated before the new feature launches.</p>
        </aside>

        <article className="legal-content">
          <section id="privacy">
            <span className="legal-kicker">01 / Privacy notice</span>
            <h2>Data stays minimal by design</h2>
            <h3>Information Stack City stores</h3>
            <p>
              The game stores an active save, preferences, and up to 12 after-action summaries in
              your browser&apos;s local storage. This information remains on that device and is not
              transmitted to the operator. Challenge codes contain only a scenario identifier,
              deterministic simulation seed, and integrity checksum.
            </p>
            <h3>Hosting information</h3>
            <p>
              Vercel hosts the public site and may process ordinary request information needed to
              deliver and protect it, such as IP address, approximate location derived from IP,
              browser or device information, timestamps, and request diagnostics. Stack City does
              not add client-side analytics, advertising pixels, social trackers, or marketing cookies.
              Vercel&apos;s processing is described in its <a href="https://vercel.com/legal/privacy-notice">privacy notice</a>.
            </p>
            <h3>Cookies and similar technologies</h3>
            <p>
              Stack City does not intentionally set cookies. Browser local storage is used only for
              the game functions described above, not for cross-site identification, advertising,
              or analytics. A consent banner is therefore not presented in the current release.
            </p>
            <h3>Your choices</h3>
            <p>
              Use <strong>Clear history</strong> in Run Review to remove archived summaries. Clear
              this site&apos;s browser storage to remove both the active save and summaries. Because
              Stack City does not receive those records, the operator cannot access, export, or
              delete them remotely.
            </p>
            <h3>Retention and disclosure</h3>
            <p>
              Local game records remain until you erase them or the browser removes them. The
              operator does not sell personal information and does not disclose gameplay records.
              Hosting request data is handled under Vercel&apos;s policies and retention controls.
            </p>
          </section>

          <section id="terms">
            <span className="legal-kicker">02 / Terms of use</span>
            <h2>Play fairly and use the project responsibly</h2>
            <p>
              By using Stack City, you agree to use it lawfully and not attempt to disrupt the site,
              bypass security controls, introduce malicious code, or interfere with other visitors.
              If you do not agree, do not use the site.
            </p>
            <h3>Educational simulation</h3>
            <p>
              Stack City simplifies real infrastructure concepts for entertainment and learning.
              Its scores, incidents, costs, recommendations, and architectural outcomes are
              fictional and are not professional engineering, security, financial, or legal advice.
            </p>
            <h3>Ownership and permitted use</h3>
            <p>
              The game, original artwork, interface, writing, and source code are protected by
              copyright. You may play the hosted game and inspect the public repository for personal
              evaluation. No right to reproduce, redistribute, sell, sublicense, or create a
              commercial derivative is granted except where a third-party license expressly applies.
            </p>
            <h3>Availability and warranties</h3>
            <p>
              The service is provided “as is” and “as available.” To the fullest extent permitted by
              applicable law, the operator disclaims implied warranties and is not liable for
              indirect, incidental, special, consequential, or punitive damages arising from use of
              the service. These terms do not limit rights or remedies that cannot legally be limited.
            </p>
            <h3>Changes</h3>
            <p>
              Material changes will be reflected by a new effective date. Continued use after a
              change means the revised terms apply from that date. Paid products will require
              separate price, refund, billing, and cancellation disclosures before launch.
            </p>
          </section>

          <section id="children">
            <span className="legal-kicker">03 / Children</span>
            <h2>General-audience educational game</h2>
            <p>
              Stack City is designed for a general audience and is not directed to children under
              13. The current game does not request names, email addresses, ages, precise locations,
              account identifiers, user-generated content, or payment information. A parent or
              guardian should supervise a minor&apos;s use. Do not submit personal information through
              public repository discussions.
            </p>
          </section>

          <section id="accessibility">
            <span className="legal-kicker">04 / Accessibility statement</span>
            <h2>Built for different ways of playing</h2>
            <p>
              Stack City targets WCAG 2.2 Level AA practices. It supports keyboard navigation,
              visible focus, descriptive control labels, live status announcements, touch input,
              responsive layouts, high contrast, reduced motion, and browser zoom. Accessibility is
              an ongoing commitment, not a one-time certification.
            </p>
            <p>
              If a barrier prevents you from playing, report it through the project&apos;s
              <a href="https://github.com/chadkraus87/stack-city/issues/new"> GitHub issue form</a>
              and include the page, device, browser, assistive technology, and expected result.
            </p>
          </section>

          <section id="contact">
            <span className="legal-kicker">05 / Contact and reports</span>
            <h2>Reach the operator</h2>
            <p>
              General, privacy, copyright, or accessibility questions can be sent through the
              <a href="https://github.com/chadkraus87"> operator&apos;s GitHub profile</a>. Security
              vulnerabilities should be submitted privately through
              <a href="https://github.com/chadkraus87/stack-city/security/advisories/new"> GitHub&apos;s security advisory form</a>,
              never as a public issue.
            </p>
            <p>
              For a copyright complaint, identify the protected work, the material at issue, your
              contact information, a good-faith statement, and confirmation that the report is accurate.
            </p>
          </section>
        </article>
      </div>

      <footer className="legal-footer">
        <span>© 2026 Chad Kraus. All rights reserved.</span>
        <Link href="/">Play Stack City</Link>
      </footer>
    </main>
  );
}
