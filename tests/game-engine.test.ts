import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeBottleneck,
  calculateMetrics,
  createChallengeCode,
  createInitialState,
  createOperationsReport,
  createRunSummary,
  isValidGameState,
  parseChallengeCode,
  resolveIncident,
  restoreGameState,
  restoreRunHistory,
  simulateTick,
} from "../app/game/engine.ts";
import type { Building, Connection, GameState, Incident } from "../app/game/types.ts";

function connectedState(extraBuildings: Building[], extraConnections: Connection[]): GameState {
  const state = createInitialState();
  return {
    ...state,
    paused: false,
    buildings: [...state.buildings, ...extraBuildings],
    connections: [...state.connections, ...extraConnections],
  };
}

test("starter city has a complete but capacity-limited request route", () => {
  const state = createInitialState();
  const metrics = calculateMetrics(state);

  assert.equal(metrics.routeComplete, true);
  assert.ok(metrics.capacity >= 69 && metrics.capacity <= 71);
  assert.ok(metrics.served > 35);
  assert.ok(metrics.served < metrics.traffic);
  assert.ok(metrics.latency > 150);
});

test("only connected caches offload the database and lower latency", () => {
  const cache: Building = { id: "cache-test", kind: "cache", x: 2, y: 3, level: 1, health: 100 };
  const disconnected = connectedState([cache], []);
  const linked = connectedState([cache], [{ id: "cache-link", from: "api-1", to: cache.id }]);
  const withoutCache = calculateMetrics(disconnected);
  const withCache = calculateMetrics(linked);

  assert.equal(withoutCache.cacheHitRate, 0);
  assert.ok(withCache.cacheHitRate > 0.3);
  assert.ok(withCache.capacity > withoutCache.capacity);
  assert.ok(withCache.latency < withoutCache.latency);
});

test("a load balancer makes replicated API capacity fully effective", () => {
  const extras: Building[] = [
    { id: "web-2", kind: "frontend", x: 1, y: 1, level: 2, health: 100 },
    { id: "api-2", kind: "api", x: 2, y: 1, level: 2, health: 100 },
    { id: "db-2", kind: "database", x: 3, y: 1, level: 4, health: 100 },
    { id: "db-3", kind: "database", x: 4, y: 1, level: 4, health: 100 },
  ];
  const links: Connection[] = extras.map((building, index) => ({
    id: `extra-link-${index}`,
    from: "api-1",
    to: building.id,
  }));
  const noBalancer = connectedState(extras, links);
  const balancer: Building = { id: "lb-test", kind: "loadBalancer", x: 1, y: 3, level: 1, health: 100 };
  const withBalancer = connectedState(
    [...extras, balancer],
    [...links, { id: "lb-link", from: "dns-1", to: balancer.id }],
  );

  assert.ok(calculateMetrics(withBalancer).capacity > calculateMetrics(noBalancer).capacity);
});

test("simulation is deterministic for the same seed and state", () => {
  let left = { ...createInitialState(), paused: false };
  let right = { ...createInitialState(), paused: false };

  for (let index = 0; index < 80; index += 1) {
    left = simulateTick(left);
    right = simulateTick(right);
  }

  assert.deepEqual(left, right);
});

test("simulation advances economy, objectives, traffic, and waves", () => {
  let state = { ...createInitialState(), paused: false };
  for (let index = 0; index < 85; index += 1) state = simulateTick(state);

  assert.ok(state.tick >= 85);
  assert.ok(state.lifetimeRevenue > 0);
  assert.ok(state.objectiveIndex >= 1);
  assert.ok(state.wave >= 2);
  assert.ok(state.metrics.traffic > 42);
});

test("operations scenarios create distinct, deterministic pressure profiles", () => {
  const growth = { ...createInitialState("growth"), tick: 100, wave: 2 };
  const launchDay = { ...createInitialState("launch-day"), tick: 100, wave: 2 };
  const chaosLab = createInitialState("chaos-lab");

  assert.equal(growth.money, 28500);
  assert.equal(launchDay.money, 34000);
  assert.equal(chaosLab.money, 32000);
  assert.ok(calculateMetrics(launchDay).traffic > calculateMetrics(growth).traffic);
  assert.deepEqual(calculateMetrics(launchDay), calculateMetrics(launchDay));
});

test("challenge codes round-trip a scenario and deterministic 32-bit seed", () => {
  const code = createChallengeCode("chaos-lab", 0xdeadbeef);

  assert.match(code, /^SC1-C-[0-9A-Z]+-[0-9A-Z]{6}$/);
  assert.deepEqual(parseChallengeCode(code.toLowerCase()), {
    scenario: "chaos-lab",
    seed: 0xdeadbeef,
  });
  assert.equal(parseChallengeCode(`${code.slice(0, -1)}X`), null);
  assert.equal(parseChallengeCode("SC1-G-NOT-A-CODE"), null);

  const seeded = createInitialState("launch-day", 123456789);
  assert.equal(seeded.challengeSeed, 123456789);
  assert.equal(seeded.seed, 123456789);
});

test("telemetry records SLOs, costs, peaks, and bounded architecture samples", () => {
  let state = { ...createInitialState("launch-day", 9173), paused: false };
  for (let index = 0; index < 3000; index += 1) state = simulateTick(state);

  assert.equal(state.telemetry.sampleCount, state.tick);
  assert.ok(state.telemetry.totalDemand > state.telemetry.totalServed);
  assert.ok(state.telemetry.totalOperatingCost > 0);
  assert.ok(state.telemetry.peakTraffic >= state.metrics.traffic);
  assert.ok(state.telemetry.architectureHistory.length <= 240);
  assert.ok(state.telemetry.architectureHistory.length > 1);
  assert.ok(state.telemetry.availabilitySloTicks <= state.telemetry.sampleCount);
});

test("manual incident resolution contributes to MTTR and the after-action report", () => {
  const incident: Incident = {
    id: "incident-test",
    buildingId: "api-1",
    title: "Synthetic fault",
    message: "A deterministic test incident.",
    severity: "critical",
    remaining: 20,
    startedAt: 30,
  };
  const initial = createInitialState();
  const state: GameState = {
    ...initial,
    tick: 42,
    money: 10_000,
    incidents: [incident],
    telemetry: { ...initial.telemetry, incidentsStarted: 1 },
  };
  const resolved = resolveIncident(state, incident.id);
  const report = createOperationsReport(resolved);

  assert.equal(resolved.incidents.length, 0);
  assert.equal(resolved.money, 9100);
  assert.equal(resolved.telemetry.incidentsResolved, 1);
  assert.equal(resolved.telemetry.totalResolutionTicks, 12);
  assert.equal(report.meanTimeToRecoverySeconds, 6);
  assert.ok(report.recommendations.length > 0);
  assert.equal(analyzeBottleneck(resolved).kind, "database");
});

test("run history accepts catalog-derived summaries and rejects tampering", () => {
  let state = { ...createInitialState("chaos-lab", 4444), paused: false };
  for (let index = 0; index < 90; index += 1) state = simulateTick(state);
  const summary = createRunSummary(state, "manual", 1_788_918_000_000);
  const restored = restoreRunHistory({ version: 1, runs: [summary] });

  assert.deepEqual(restored, [summary]);
  assert.equal(restored[0].challengeCode, createChallengeCode("chaos-lab", 4444));
  assert.equal(restoreRunHistory({
    version: 1,
    runs: [{ ...summary, challengeCode: "SC1-C-TAMPERED-AAAAAA" }],
  }).length, 0);
  assert.equal(restoreRunHistory({ version: 1, runs: Array(13).fill(summary) }).length, 0);
});

test("save validation accepts current state and rejects malformed input", () => {
  assert.equal(isValidGameState(createInitialState()), true);
  assert.equal(isValidGameState(null), false);
  assert.equal(isValidGameState({ version: 1, tick: "bad" }), false);
  assert.equal(isValidGameState({ ...createInitialState(), buildings: "nope" }), false);
  assert.equal(isValidGameState({
    ...createInitialState(),
    buildings: [{ id: "hostile", kind: "script", x: 0, y: 0, level: 99, health: Infinity }],
  }), false);
  assert.equal(isValidGameState({ ...createInitialState(), objectiveIndex: 999 }), false);
  assert.equal(isValidGameState({
    ...createInitialState(),
    events: Array.from({ length: 19 }, (_, index) => ({
      id: `event-${index}`,
      tick: 0,
      tone: "info",
      message: "oversized",
    })),
  }), false);
  assert.equal(isValidGameState({
    ...createInitialState(),
    buildings: [
      ...createInitialState().buildings,
      { id: "overlap", kind: "cache", x: 0, y: 2, level: 1, health: 100 },
    ],
  }), false);
  assert.equal(isValidGameState({
    ...createInitialState(),
    telemetry: { ...createInitialState().telemetry, sampleCount: 1, availabilityTotal: 9 },
  }), false);
});

test("version 1 saves migrate safely to the current growth scenario", () => {
  const current = createInitialState();
  const legacy: Record<string, unknown> = { ...current, version: 1 };
  delete legacy.scenario;

  const restored = restoreGameState(legacy);

  assert.ok(restored);
  assert.equal(restored.version, 3);
  assert.equal(restored.scenario, "growth");
  assert.equal(restored.challengeSeed, 82491);
  assert.equal(restored.telemetry.sampleCount, 0);
  assert.equal(restored.metrics.traffic, current.metrics.traffic);
});

test("version 2 saves migrate without trusting missing telemetry", () => {
  const current = createInitialState("launch-day", 7123);
  const legacy: Record<string, unknown> = { ...current, version: 2 };
  delete legacy.challengeSeed;
  delete legacy.telemetry;
  delete legacy.reportRecorded;

  const restored = restoreGameState(legacy);

  assert.ok(restored);
  assert.equal(restored.version, 3);
  assert.equal(restored.scenario, "launch-day");
  assert.equal(restored.challengeSeed, 82491);
  assert.equal(restored.telemetry.sampleCount, 0);
});
