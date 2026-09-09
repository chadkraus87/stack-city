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
keys. Game state is stored only in the current browser's `localStorage`, is
size-limited and structurally validated before restoration, and can be erased
through **Start a new city** or the browser's site-data controls. Invalid saves
are discarded instead of partially trusted.

Repository secrets and local deployment state must stay in ignored `.env*` and
`.vercel/` paths. Never commit credentials or real user data.
