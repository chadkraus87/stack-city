# Security policy

## Supported version

The latest production release on `main` is supported.

## Reporting a vulnerability

Please use **Security → Report a vulnerability** in this repository to send a
private report. Do not open a public issue for a suspected vulnerability and do
not include real credentials, access tokens, personal data, or exploit data
belonging to other people.

Include the affected version or URL, reproduction steps, expected impact, and
any safe remediation idea you have. Reports will be reviewed before details are
made public.

## Data and trust boundaries

Stack City has no accounts, analytics, database, uploads, or third-party API
keys. Active game state, one optional Workshop draft, and the compact 12-run
history are stored only in the current browser's `localStorage`. The payloads are independently size-limited
and structurally validated before restoration. Invalid saves or histories are
discarded instead of partially trusted.

Storage access is capability-checked before restoration. If storage is blocked,
full, or unavailable, the game remains playable for the current tab and shows a
visible warning instead of claiming that progress was saved. A `pagehide` handler
makes one final best-effort write without transmitting data.

Standard challenge codes contain only a public scenario identifier, a 32-bit
simulation seed, and a checksum. Workshop codes additionally contain bounded
numeric rules and enum choices. Free-form local titles are excluded. Codes
contain no save data, browser identifier, timestamp, account information, or
personal data. Copying a code uses the browser
clipboard and does not make a network request.

**Start a new city** replaces the active save but deliberately retains the
local run summaries. **Clear history** performs a confirmed erase of those
summaries without touching the active city. Browser site-data controls erase
all Stack City data.

Repository secrets and local deployment state must stay in ignored `.env*` and
`.vercel/` paths. Never commit credentials or real user data.

The version 5 save schema also validates Workshop constraints and incident
decks, retry controls, release progress, revision counters, per-run operations
telemetry, and canary target eligibility. Legacy version 1–4 data migrates with
safe defaults; version 1–3 links are migrated into directed request flow.
Malformed current-version rules, links, or release state are discarded.

## Security controls

- Production responses use a Content Security Policy, deny framing and object
  embedding, disable unneeded device and payment permissions, prevent MIME
  sniffing, and enable HSTS.
- The simulation renders typed React values and does not use raw HTML injection,
  dynamic code evaluation, uploads, remote content, or browser credentials.
- Public challenge codes are length-bounded, checksummed, and contain no player
  state, local title, or identity.
- Dependencies are pinned in `package-lock.json`; the release gate includes
  lint, a production build, deterministic tests, rendered-output checks, and
  dependency audits.
- GitHub Actions use commit-pinned checkout and Node setup actions. Dependabot
  monitors npm and workflow dependencies on bounded schedules.
- GitHub secret scanning, push protection, Dependabot alerts, and private
  vulnerability reporting should remain enabled for the public repository.

## Scope and safe testing

Good-faith testing is welcome against code you run locally. Do not degrade the
public service, access data that is not yours, use social engineering, or test
Vercel infrastructure outside Stack City's application scope. Stop and report
the issue if testing could affect another visitor. There is currently no paid
bug-bounty program or promise of payment.
