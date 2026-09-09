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
  rollbackCanaryDeployment,
  restoreGameState,
  restoreRunHistory,
  simulateTick,
  startCanaryDeployment,
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

test("request routing is directional and rejects a reversed core path", () => {
  const initial = createInitialState();
  const reversed: GameState = {
    ...initial,
    connections: initial.connections.map((connection) => ({
      ...connection,
      from: connection.to,
      to: connection.from,
    })),
  };
  const metrics = calculateMetrics(reversed);

  assert.equal(metrics.routeComplete, false);
  assert.equal(metrics.served, 0);
  assert.deepEqual(metrics.criticalPath, []);
  assert.equal(metrics.serviceSignals.find((signal) => signal.buildingId === "web-1")?.reachable, false);
  assert.equal(analyzeBottleneck({ ...reversed, metrics }).kind, "route");
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

test("service observability identifies the directed critical path and bottleneck", () => {
  const initial = { ...createInitialState(), tick: 1000 };
  const metrics = calculateMetrics(initial);
  const criticalSignals = metrics.serviceSignals.filter((signal) => signal.onCriticalPath);
  const database = metrics.serviceSignals.find((signal) => signal.buildingId === "db-1");

  assert.deepEqual(metrics.criticalPath, ["dns-1", "web-1", "api-1", "db-1"]);
  assert.equal(criticalSignals.length, 4);
  assert.ok(database);
  assert.ok(database.utilization > 1);
  assert.equal(database.status, "overloaded");
  assert.equal(analyzeBottleneck({ ...initial, metrics }).kind, "database");
});

test("reliability controls make explicit recovery, shedding, and scaling tradeoffs", () => {
  const degradedBuildings = createInitialState().buildings.map((building) => ({ ...building, health: 82 }));
  const base = { ...createInitialState(), tick: 1000, buildings: degradedBuildings };
  const baseline = calculateMetrics(base);
  const bounded = calculateMetrics({
    ...base,
    operations: { ...base.operations, retryPolicy: "bounded" },
  });
  const breaker = calculateMetrics({
    ...base,
    operations: { ...base.operations, circuitBreaker: true },
  });
  const scalableBase: GameState = {
    ...base,
    buildings: base.buildings.map((building) =>
      building.kind === "database" ? { ...building, level: 4 } : building,
    ),
  };
  const scalableBaseline = calculateMetrics(scalableBase);
  const autoscaled = calculateMetrics({
    ...scalableBase,
    operations: { ...scalableBase.operations, autoscaling: true },
  });

  assert.ok(bounded.retryRecovery > 0);
  assert.ok(bounded.served > baseline.served);
  assert.ok(bounded.latency > baseline.latency);
  assert.ok(breaker.loadShedding > 0);
  assert.ok(breaker.operatingCost > baseline.operatingCost);
  assert.ok(autoscaled.elasticCapacity > 0);
  assert.ok(autoscaled.capacity > scalableBaseline.capacity);
  assert.ok(autoscaled.operatingCost > scalableBaseline.operatingCost);
});

test("circuit breaking reduces cascading health damage under overload", () => {
  const base = { ...createInitialState("launch-day", 100), paused: false, tick: 1400 };
  const unprotected = simulateTick(base);
  const protectedState = {
    ...base,
    operations: { ...base.operations, circuitBreaker: true },
  };
  const protectedTick = simulateTick(protectedState);
  const unprotectedDatabase = unprotected.buildings.find((building) => building.id === "db-1");
  const protectedDatabase = protectedTick.buildings.find((building) => building.id === "db-1");

  assert.ok(unprotectedDatabase && protectedDatabase);
  assert.ok(protectedDatabase.health > unprotectedDatabase.health);
  assert.ok(protectedTick.telemetry.requestsShed > 0);
});

test("canary deployments can be promoted, rolled back, or automatically stopped", () => {
  const initial = { ...createInitialState(), paused: false };
  const started = startCanaryDeployment(initial, "web-1");

  assert.equal(started.release.status, "canary");
  assert.equal(started.money, initial.money - 1_200);
  assert.equal(started.telemetry.canariesStarted, 1);

  let promoted = started;
  for (let index = 0; index < 25; index += 1) promoted = simulateTick(promoted);
  assert.equal(promoted.release.status, "idle");
  assert.equal(promoted.release.revision, 1);
  assert.equal(promoted.telemetry.canariesCompleted, 1);

  const restarted = startCanaryDeployment(promoted, "api-1");
  const rolledBack = rollbackCanaryDeployment(restarted);
  assert.equal(rolledBack.release.status, "idle");
  assert.equal(rolledBack.telemetry.canariesRolledBack, 1);

  const unhealthyBase = createInitialState();
  const unhealthyBuildings = unhealthyBase.buildings.map((building) =>
    building.id === "web-1" ? { ...building, health: 0.1 } : building,
  );
  const unhealthyState: GameState = {
    ...unhealthyBase,
    paused: false,
    buildings: unhealthyBuildings,
    incidents: [{
      id: "canary-failure",
      buildingId: "web-1",
      title: "Synthetic canary fault",
      message: "Forces the canary health check to fail.",
      severity: "critical",
      remaining: 4,
      startedAt: 0,
    }],
  };
  unhealthyState.metrics = calculateMetrics(unhealthyState);
  const autoStarted = startCanaryDeployment(unhealthyState, "web-1");
  const autoRolledBack = simulateTick(autoStarted);
  assert.equal(autoRolledBack.release.status, "idle");
  assert.equal(autoRolledBack.release.revision, 0);
  assert.equal(autoRolledBack.telemetry.canariesRolledBack, 1);
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
  assert.equal(isValidGameState({
    ...createInitialState(),
    operations: { retryPolicy: "infinite", circuitBreaker: true, autoscaling: true },
  }), false);
  assert.equal(isValidGameState({
    ...createInitialState(),
    release: { status: "canary", targetBuildingId: "db-1", progress: 150, revision: -1 },
  }), false);
});

test("version 1 saves migrate safely to the current growth scenario", () => {
  const current = createInitialState();
  const legacy: Record<string, unknown> = { ...current, version: 1 };
  delete legacy.scenario;

  const restored = restoreGameState(legacy);

  assert.ok(restored);
  assert.equal(restored.version, 4);
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
  assert.equal(restored.version, 4);
  assert.equal(restored.scenario, "launch-day");
  assert.equal(restored.challengeSeed, 82491);
  assert.equal(restored.telemetry.sampleCount, 0);
});

test("version 3 saves gain safe operations defaults and directed links", () => {
  const current = createInitialState();
  const legacy: Record<string, unknown> = {
    ...current,
    version: 3,
    connections: current.connections.map((connection) => ({
      ...connection,
      from: connection.to,
      to: connection.from,
    })),
  };
  delete legacy.operations;
  delete legacy.release;

  const restored = restoreGameState(legacy);

  assert.ok(restored);
  assert.equal(restored.version, 4);
  assert.deepEqual(restored.operations, {
    retryPolicy: "off",
    circuitBreaker: false,
    autoscaling: false,
  });
  assert.equal(restored.release.status, "idle");
  assert.equal(restored.metrics.routeComplete, true);
  assert.deepEqual(restored.connections.map(({ from, to }) => [from, to]), [
    ["dns-1", "web-1"],
    ["web-1", "api-1"],
    ["api-1", "db-1"],
  ]);
});
