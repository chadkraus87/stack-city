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

Each run also has an immutable `challengeSeed` alongside the evolving random
generator state. A challenge code encodes only the scenario and seed with a
checksum. Parsing is strict and bounded, so loading a code creates a fresh
deterministic run without importing another player's saved state.

The engine accumulates bounded `RunTelemetry`: request demand and service,
operating cost, per-signal SLO compliance, incident starts and recoveries,
recovery duration, peaks, and architecture samples. Architecture history is
sampled every 12 ticks and capped at 240 records. Pure report helpers turn this
state into an operator grade, error-budget burn, MTTR, cost efficiency,
bottleneck analysis, and catalog-aware recommendations.

## State and persistence

The UI stores a single immutable `GameState`. Mutations are small transition
functions. Save data uses a versioned envelope in `localStorage`; the parser
caps payload and collection sizes, validates every consumed scalar and nested
record, requires unique building positions and connections, and rebuilds
catalog-owned achievement copy. Version 1 and version 2 saves migrate to version
3 with safe defaults for challenge and telemetry fields. Malformed or
incompatible payloads are discarded. Settings are device-local and contain no
sensitive data.

Run history uses a separate versioned payload capped at 12 summaries. Its parser
validates every scalar, scenario, grade, and challenge checksum. Summaries keep
only aggregate operational results and remain when the active city is reset;
they never contain the map, event text, settings, or player-identifying data.

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
