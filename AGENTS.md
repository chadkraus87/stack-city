# Stack City contributor guide

## Product

Stack City is a browser-based infrastructure strategy game. The player builds a
digital city, connects services, serves visible traffic, and responds to
capacity and reliability problems.

## Working rules

- Keep the game playable without accounts, credentials, or paid services.
- Prefer deterministic, pure simulation helpers in `app/game/engine.ts`.
- Keep catalog balance data centralized in `app/game/catalog.ts`.
- Treat saved games as untrusted input and migrate or discard invalid data.
- Preserve keyboard, touch, reduced-motion, and high-contrast affordances.
- Add or update tests when simulation rules change.
- Do not add external dependencies when platform APIs or existing packages are
  sufficient.
- Do not store secrets in the repository.

## Verification

Before handoff, run:

```bash
npm run check
```

For visual or interaction changes, also play the current build in a browser at
desktop and narrow viewport widths.

## Architecture map

- `app/game/types.ts` — shared model types
- `app/game/catalog.ts` — buildings, objectives, incidents, and balance data
- `app/game/engine.ts` — deterministic simulation and state transitions
- `app/game/StackCityGame.tsx` — interaction and presentation controller
- `app/globals.css` — responsive visual system
- `tests/` — simulation and server-rendering checks
- `docs/` — product, architecture, and test notes


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
