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
keys. Active game state and the compact 12-run history are stored only in the
current browser's `localStorage`. Both payloads are independently size-limited
and structurally validated before restoration. Invalid saves or histories are
discarded instead of partially trusted.

Challenge codes contain only a public scenario identifier, a 32-bit simulation
seed, and a checksum. They contain no save data, browser identifier, timestamp,
account information, or personal data. Copying a code uses the browser
clipboard and does not make a network request.

**Start a new city** replaces the active save but deliberately retains the
local run summaries. **Clear history** performs a confirmed erase of those
summaries without touching the active city. Browser site-data controls erase
all Stack City data.

Repository secrets and local deployment state must stay in ignored `.env*` and
`.vercel/` paths. Never commit credentials or real user data.
