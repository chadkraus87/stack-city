# Public launch and monetization checklist

This checklist separates controls that ship with Stack City from decisions that
only the owner and qualified advisers can make. It is practical planning
material, not legal, tax, accounting, or insurance advice. Requirements depend
on where the operator and players are located, how the game is marketed, and
which business model is selected.

## Current no-account release

The current build is intentionally low-data:

- no account, profile, email, upload, chat, leaderboard, advertising, analytics,
  payment, or application database;
- game saves and 12 compact run summaries remain in browser local storage;
- public challenge codes carry only a scenario, deterministic seed, and checksum;
- a statically rendered Legal & Trust Center explains the current data flow,
  terms, children's privacy posture, accessibility target, and report channels;
- Vercel receives ordinary hosting request data under its own privacy notice;
- original project code and assets use a proprietary source-available license;
- dependencies are pinned and their license families are documented; and
- production security headers, defensive save parsing, private vulnerability
  reporting, automated checks, and browser QA are part of the release gate.

These controls reduce exposure. They do not create a legal certification or
guarantee compliance in every jurisdiction.

## Owner actions before broad promotion

- [ ] Register a custom domain and use it consistently for the canonical URL,
  Vercel project, legal documents, screenshots, social profiles, and press kit.
- [ ] Create monitored addresses such as `support@your-domain` and
  `privacy@your-domain`. Replace the GitHub-profile contact before accepting
  payments or running large campaigns.
- [ ] Decide whether the operator is Chad Kraus personally or a business entity.
  Update the legal page with the exact legal name, business address where
  required, contact details, governing law, and dispute terms after counsel
  reviews them.
- [ ] Ask a licensed attorney familiar with games, consumer protection, privacy,
  and the intended launch regions to review the Terms, Privacy Notice,
  accessibility statement, age positioning, license, refund policy, and
  marketing claims. Do this before monetization.
- [ ] Run a trademark clearance search for “Stack City” and relevant logos in
  every planned product category and launch region. Consider registration only
  after professional advice; a domain or repository name does not establish
  clearance.
- [ ] Keep a dated inventory of every data field, storage location, recipient,
  purpose, retention period, deletion path, and vendor. Update it before adding
  any telemetry or third-party script.
- [ ] Perform manual accessibility testing at 200% and 400% zoom, keyboard-only,
  a narrow touch viewport, high contrast, reduced motion, and at least one
  screen reader. Record issues and remediation dates.
- [ ] Create a tested incident-response procedure with owners for vulnerability
  reports, compromised GitHub/Vercel accounts, domain takeover, dependency
  incidents, and public communication.
- [ ] Enable strong unique passwords, passkeys or MFA, recovery codes, and the
  minimum required collaborators on GitHub, Vercel, the registrar, and any
  payment account.
- [ ] Verify automated deployment previews cannot expose environment variables,
  unpublished content, or private logs before introducing backend services.

## Additional gate before collecting data

- [ ] Update the privacy notice before shipping accounts, email capture,
  analytics, crash reporting, advertising, social embeds, user-generated
  content, cloud saves, or a remote leaderboard.
- [ ] Select vendors only after reviewing their data-processing terms,
  subprocessors, security controls, international transfer mechanism, retention,
  and deletion support. Sign required data-processing agreements.
- [ ] Collect only what the feature needs, state the purpose before collection,
  set a retention period, and provide access, correction, deletion, and appeal
  workflows where applicable.
- [ ] Add consent controls before non-essential tracking technologies are placed
  on a user's device in regions that require prior consent. Rejecting must be as
  easy as accepting; strictly necessary game storage should remain separately
  described.
- [ ] Decide and document the audience. If the service becomes directed to
  children under 13, or the operator knowingly collects their personal
  information, complete a COPPA-specific design and legal review before launch.
  Do not rely on a sentence in the Terms as an age-assurance system.
- [ ] Complete a privacy-impact assessment for profiling, behavioral ads,
  precise location, large-scale monitoring, or other higher-risk processing.

Useful primary guidance:

- [FTC COPPA six-step compliance plan](https://www.ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-step-compliance-plan-your-business)
- [California Consumer Privacy Act overview](https://oag.ca.gov/privacy/ccpa)
- [European Commission GDPR principles](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/principles-gdpr_en)
- [EU cookie and tracking guidance](https://europa.eu/youreurope/business/growing/digitalising/online-privacy/index_en.htm)

## Additional gate before monetization

- [ ] Choose the product being sold: one-time game, downloadable build,
  subscription, expansion, cosmetic item, supporter license, or sponsorship.
  Do not build checkout until the refund, cancellation, entitlement, and support
  model is clear.
- [ ] Form the appropriate business and bookkeeping structure with legal and tax
  advisers. Obtain required registrations and keep business funds, receipts,
  platform fees, refunds, and taxes separately recorded.
- [ ] Determine sales-tax, VAT/GST, marketplace-facilitator, invoicing, and income
  reporting obligations for each launch channel and jurisdiction. A payment
  processor does not automatically assume every operator obligation.
- [ ] Prefer a reputable hosted checkout so Stack City never handles raw payment
  card data. Verify webhook signatures server-side, make fulfillment idempotent,
  store the minimum billing metadata, and keep all secrets outside the repository.
- [ ] Show the total price and unavoidable fees clearly before the player agrees
  to pay. State subscription interval, renewal, cancellation, refund, regional
  tax treatment, supported platforms, and material product limitations near the
  purchase action.
- [ ] Make every marketing statement accurate and supportable, including claims
  about privacy, education, accessibility, availability, scarcity, discounts,
  reviews, and endorsements. Clearly disclose paid relationships.
- [ ] Add a paid-product Terms section and a plain-language refund/cancellation
  policy, then test receipts, failed payments, duplicate events, refunds,
  chargebacks, account recovery, and customer support before enabling live mode.
- [ ] Review platform rules, content ratings, export/sanctions controls, regional
  consumer rights, and required tax interviews for each storefront.
- [ ] Ask an insurance professional whether cyber, media, errors-and-omissions,
  or general liability coverage fits the launch.

Useful primary guidance:

- [FTC online advertising and marketing guidance](https://www.ftc.gov/business-guidance/advertising-marketing/online-advertising-marketing)
- [FTC unfair or deceptive fees FAQ](https://www.ftc.gov/business-guidance/resources/rule-unfair-or-deceptive-fees-frequently-asked-questions)
- [IRS taxable income overview](https://www.irs.gov/filing/taxable-income)

## Final release rehearsal

- [ ] Run `npm ci`, `npm run check`, `npm audit --audit-level=moderate`, and
  `npm audit --omit=dev --audit-level=moderate` from a clean checkout.
- [ ] Play the guided and unguided starts on desktop and phone widths; verify
  directed connections, all reliability controls, canary promotion and rollback,
  save/restore, clear history, legal navigation, and browser back navigation.
- [ ] Verify the production response headers, `/robots.txt`, `/sitemap.xml`,
  canonical URLs, social preview, 404 page, and custom-domain HTTPS.
- [ ] Confirm the production build contains no `.env`, token, private key,
  personal save, local Vercel metadata, or unexpected source map.
- [ ] Make a release tag, record the deployed commit, test rollback, and retain a
  copy of the legal text that applied to that release.

The U.S. Department of Justice recommends combining automated and manual
accessibility testing and providing a way to report barriers. Vercel also
publishes a production checklist covering security, performance, reliability,
and observability:

- [DOJ guidance on web accessibility and the ADA](https://www.ada.gov/resources/web-guidance/)
- [Vercel production checklist](https://vercel.com/docs/production-checklist)
