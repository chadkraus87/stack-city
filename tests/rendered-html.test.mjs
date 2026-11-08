import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function renderedHtml() {
  return readFile(resolve(projectRoot, ".next/server/app/index.html"), "utf8");
}

async function legalHtml() {
  return readFile(resolve(projectRoot, ".next/server/app/legal.html"), "utf8");
}

test("build prerenders the complete Stack City game shell", async () => {
  const html = await renderedHtml();
  assert.match(html, /<title>Stack City — Infrastructure Strategy Game<\/title>/i);
  assert.match(html, /Build the infrastructure/);
  assert.match(html, /Build catalog/);
  assert.match(html, /architect’s field guide/i);
  assert.match(html, /Start guided run/);
  assert.match(html, /Play without hints/);
  assert.match(html, /Free public beta/);
  assert.match(html, /Beta feedback/);
  assert.match(html, /Steady Growth/);
  assert.match(html, /Launch Day/);
  assert.match(html, /Edge Surge/);
  assert.match(html, /Data Storm/);
  assert.match(html, /Chaos Lab/);
  assert.match(html, /Resilience Sprint/);
  assert.match(html, /Scale &amp; Delivery/);
  assert.match(html, /Daily incident/);
  assert.match(html, /Scenario Workshop/);
  assert.match(html, /Choose the next pressure profile/);
  assert.match(html, /Deterministic challenge code/);
  assert.match(html, /Load code/);
  assert.match(html, /New seed/);
  assert.match(html, /Open a shared run replay/);
  assert.match(html, /Reliability controls/);
  assert.match(html, /Service flow/);
  assert.match(html, /Privacy · Terms · Accessibility/);
  assert.match(html, /aria-label="Stack City infrastructure map"/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/);
});

test("ships useful content and configures hardened response headers", async () => {
  const [html, nextConfig] = await Promise.all([
    renderedHtml(),
    readFile(resolve(projectRoot, "next.config.ts"), "utf8"),
  ]);

  for (const label of ["Web Tower", "API Factory", "Data Vault", "Cache Depot", "Watchtower"]) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /Traffic served/);
  assert.match(html, /Availability/);
  assert.match(html, /User satisfaction/);
  assert.match(html, /class="save-state (?:saving|saved)"/);
  assert.match(nextConfig, /frame-ancestors 'none'/);
  assert.match(nextConfig, /script-src-attr 'none'/);
  assert.match(nextConfig, /Cross-Origin-Resource-Policy/);
  assert.match(nextConfig, /X-Content-Type-Options/);
  assert.match(nextConfig, /X-Frame-Options/);
  assert.match(nextConfig, /X-Permitted-Cross-Domain-Policies/);
  assert.match(nextConfig, /poweredByHeader:\s*false/);
});

test("prerenders transparent privacy, terms, and accessibility disclosures", async () => {
  const html = await legalHtml();

  assert.match(html, /Legal &amp; Trust Center/);
  assert.match(html, /No accounts or profiles/);
  assert.match(html, /does not intentionally set cookies/);
  assert.match(html, /not directed to children under/);
  assert.match(html, /WCAG 2\.2 Level AA/);
  assert.match(html, /Workshop codes may also contain bounded game settings/);
  assert.match(html, /November 8, 2026/);
  assert.match(html, /up to 600 timestamped game decisions/);
  assert.match(html, /not autosaved over your active city/);
  assert.match(html, /Scorecard images and LinkedIn captions are generated entirely in the browser/);
  assert.match(html, /security\/advisories\/new/);
});

test("ships deterministic replay, campaign-pack, incident-chain, and scorecard safeguards", async () => {
  const [actions, replay, scorecard, catalog, engine] = await Promise.all([
    readFile(resolve(projectRoot, "app/game/actions.ts"), "utf8"),
    readFile(resolve(projectRoot, "app/game/replay.ts"), "utf8"),
    readFile(resolve(projectRoot, "app/game/ReplayAndScorecard.tsx"), "utf8"),
    readFile(resolve(projectRoot, "app/game/catalog.ts"), "utf8"),
    readFile(resolve(projectRoot, "app/game/engine.ts"), "utf8"),
  ]);

  assert.match(actions, /MAX_REPLAY_ACTIONS = 600/);
  assert.match(actions, /applyPlayerAction/);
  assert.match(replay, /MAX_REPLAY_CODE_LENGTH = 80_000/);
  assert.match(replay, /TextDecoder\("utf-8", \{ fatal: true \}\)/);
  assert.match(replay, /checksum\(parts\[1\]\)/);
  assert.match(scorecard, /escapeXml/);
  assert.match(scorecard, /1200/);
  assert.match(scorecard, /Copy LinkedIn caption/);
  assert.match(catalog, /Scale &amp; Delivery|Scale & Delivery/);
  assert.match(catalog, /Resilience Sprint/);
  assert.match(engine, /Incident chain escalated/);
  assert.match(engine, /restoreReplayActions/);
});

test("ships beta recovery, feedback, persistence, and automation safeguards", async () => {
  const [layout, manifest, game, errorPage, notFound, feedbackForm, workflow] = await Promise.all([
    readFile(resolve(projectRoot, "app/layout.tsx"), "utf8"),
    readFile(resolve(projectRoot, "app/manifest.ts"), "utf8"),
    readFile(resolve(projectRoot, "app/game/StackCityGame.tsx"), "utf8"),
    readFile(resolve(projectRoot, "app/error.tsx"), "utf8"),
    readFile(resolve(projectRoot, "app/not-found.tsx"), "utf8"),
    readFile(resolve(projectRoot, ".github/ISSUE_TEMPLATE/beta-feedback.yml"), "utf8"),
    readFile(resolve(projectRoot, ".github/workflows/quality.yml"), "utf8"),
  ]);

  assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.match(manifest, /display:\s*"standalone"/);
  assert.match(game, /storageAvailable\(\)/);
  assert.match(game, /Local save unavailable/);
  assert.match(game, /pagehide/);
  assert.match(game, /replayStatus !== "idle"/);
  assert.match(game, /replayReturnRef/);
  assert.match(game, /Return to saved city/);
  assert.match(game, /restoredExistingCity \|\| game\.tick > 0/);
  assert.match(errorPage, /Retry Stack City/);
  assert.match(notFound, /Return to Stack City/);
  assert.match(feedbackForm, /Do not include names, email addresses/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /npm audit --audit-level=high/);
});
