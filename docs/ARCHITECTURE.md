# Architecture

Stack City is intentionally local-first. React owns the interface and game
session, while pure TypeScript functions own the simulation. Next.js prerenders
the application as static content for Vercel; no player data leaves the browser.

## Simulation

The simulation advances in fixed ticks. Every tick calculates connected
services, route completeness, effective capacity, saturation, latency,
availability, errors, revenue, operating costs, satisfaction, and architecture
score. A seeded pseudo-random generator makes incidents reproducible.

Core capacity is the lowest supported layer among frontend, API, and database.
Optional services modify that model: a CDN offloads frontend traffic, caches
reduce database demand, load balancers make replicated APIs useful, queues and
workers absorb asynchronous bursts, and monitoring reduces incident impact.

## State and persistence

The UI stores a single immutable `GameState`. Mutations are small transition
functions. Save data uses a versioned envelope in `localStorage`; malformed or
incompatible payloads are ignored. Settings are device-local and contain no
sensitive data.

The optional walkthrough is transient interface state. It pauses simulation
while open, restores the player's previous pause state when replayed, and does
not change the save schema. Contextual hints reuse the existing validated
`tutorialComplete` state.

## Security

The game has no authentication, remote input, HTML injection, or secret-bearing
configuration. Save data is parsed defensively and rendered only as typed UI
values. Production code does not use `dangerouslySetInnerHTML` or dynamic code
execution. Vercel responses add CSP, clickjacking, MIME-sniffing, referrer,
permissions, and transport-security headers through `next.config.ts`.
