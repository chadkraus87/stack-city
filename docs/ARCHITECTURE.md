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
Scenario definitions remain centralized in the catalog and change only input
pressure—starting budget, base demand, growth, wave size, incident risk, and
revenue—so the simulation stays deterministic and directly testable.

## State and persistence

The UI stores a single immutable `GameState`. Mutations are small transition
functions. Save data uses a versioned envelope in `localStorage`; the parser
caps payload and collection sizes, validates every consumed scalar and nested
record, requires unique building positions and connections, and rebuilds
catalog-owned achievement copy. Version 1 saves migrate to version 2 with the
balanced scenario. Malformed or incompatible payloads are discarded. Settings
are device-local and contain no sensitive data.

The optional walkthrough is transient interface state. It pauses simulation
while open, restores the player's previous pause state when replayed, and does
not change the save schema. Contextual hints reuse the existing validated
`tutorialComplete` state.

## Security

The game has no authentication, remote input, HTML injection, or secret-bearing
configuration. Save data is parsed defensively and rendered only as typed UI
values. Production code does not use `dangerouslySetInnerHTML` or dynamic code
execution. Vercel responses add CSP, clickjacking, cross-origin isolation,
MIME-sniffing, referrer, permissions, legacy plug-in, and transport-security
headers through `next.config.ts`.
