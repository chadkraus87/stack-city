import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function renderedHtml() {
  return readFile(resolve(projectRoot, ".next/server/app/index.html"), "utf8");
}

test("build prerenders the complete Stack City game shell", async () => {
  const html = await renderedHtml();
  assert.match(html, /<title>Stack City — Infrastructure Strategy Game<\/title>/i);
  assert.match(html, /Build the infrastructure/);
  assert.match(html, /Build catalog/);
  assert.match(html, /architect’s field guide/i);
  assert.match(html, /Start guided run/);
  assert.match(html, /Play without hints/);
  assert.match(html, /Steady Growth/);
  assert.match(html, /Launch Day/);
  assert.match(html, /Chaos Lab/);
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
