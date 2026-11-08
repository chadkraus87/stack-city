# Stack City build plan

## Product slice

The initial release is a complete single-player infrastructure strategy loop:
build, connect, serve traffic, observe bottlenecks, upgrade, handle incidents,
and grow. It includes a guided first run, an endless campaign, local saves,
architecture explanations, and portfolio-friendly polish.

## Delivery phases

1. Establish the deterministic simulation model and balance catalog.
2. Build the responsive command-center interface and interactive city grid.
3. Add incidents, objectives, ranks, achievements, tutorial, sound, and saves.
4. Validate simulation rules, server rendering, accessibility, and production
   output.
5. Browser-playtest the complete loop and publish the verified build.
6. Model directed service flow, per-service telemetry, reliability controls,
   and safe canary releases.
7. Publish transparent privacy, terms, and accessibility disclosures,
   proprietary source-available licensing, third-party notices, and a
   monetization gate.
8. Add a campaign map, local daily challenge, and validated Scenario Workshop
   with shareable rules, architectural caps, and custom incident decks.
9. Expand to three campaign packs, model bounded incident chains, add
   deterministic operator-tape playback, and generate privacy-safe portfolio
   scorecards entirely in the browser.

## Definition of done for this release

- A new player can begin immediately and understand the first objective.
- Buildings can be placed, selected, connected, upgraded, repaired, and sold.
- Traffic, capacity, latency, errors, availability, money, and satisfaction
  respond to the player's architecture.
- Saturation and incidents can cause failures and recovery is meaningful.
- At least 13 infrastructure building types, 8 objectives, 5 ranks, and 10
  achievements are implemented.
- The game saves locally with a versioned, validated payload.
- Keyboard, touch, reduced-motion, and narrow-screen usage are supported.
- Automated tests and a production build pass.
- Reliability controls have measurable tradeoffs and deterministic tests.
- Every service exposes reachability, utilization, latency, error, and path status.
- Releases can canary, promote, manually roll back, and auto-rollback on failure.
- Legal, licensing, privacy, accessibility, security-reporting, robots, sitemap,
  and public-launch documentation ship with the same version as the game.
- Custom scenarios stay local, respect hard simulation limits, and share only
  checksummed rules rather than free-form titles or saved player state.
- Public beta hardening adds honest persistence status, graceful error and 404
  recovery, install metadata, privacy-safe feedback intake, and a pinned CI
  quality gate without adding accounts, analytics, or a backend.
- Six campaign drills cover foundation, delivery, data, and reliability
  pressure; unresolved incidents can escalate through at most three stages.
- Replays are bounded, checksummed, strict-data imports that reuse live game
  transitions, and scorecard exports contain only selected aggregate results.
