import {
  ACHIEVEMENT_CATALOG,
  BUILDINGS,
  INCIDENTS,
  OBJECTIVES,
  RANKS,
  SCENARIOS,
} from "./catalog.ts";
import type {
  Achievement,
  Building,
  BuildingKind,
  Connection,
  GameEvent,
  GameState,
  Incident,
  Metrics,
  ScenarioId,
} from "./types.ts";
import { BUILDING_KINDS } from "./types.ts";

const EMPTY_METRICS: Metrics = {
  traffic: 42,
  served: 0,
  capacity: 0,
  saturation: 0,
  latency: 0,
  errorRate: 1,
  availability: 0,
  cacheHitRate: 0,
  routeComplete: false,
  operatingCost: 0,
  revenue: 0,
  architectureScore: 0,
};

const starterBuildings: Building[] = [
  { id: "dns-1", kind: "dns", x: 0, y: 2, level: 1, health: 100 },
  { id: "web-1", kind: "frontend", x: 1, y: 2, level: 1, health: 100 },
  { id: "api-1", kind: "api", x: 2, y: 2, level: 1, health: 100 },
  { id: "db-1", kind: "database", x: 3, y: 2, level: 1, health: 100 },
];

const starterConnections: Connection[] = [
  { id: "link-dns-web", from: "dns-1", to: "web-1" },
  { id: "link-web-api", from: "web-1", to: "api-1" },
  { id: "link-api-db", from: "api-1", to: "db-1" },
];

export function createInitialState(scenario: ScenarioId = "growth"): GameState {
  const scenarioDefinition = SCENARIOS[scenario];
  const base: GameState = {
    version: 2,
    scenario,
    seed: 82491,
    tick: 0,
    money: scenarioDefinition.startingMoney,
    lifetimeRevenue: 0,
    satisfaction: 78,
    xp: 0,
    rank: 1,
    wave: 1,
    paused: true,
    speed: 1,
    buildings: starterBuildings.map((building) => ({ ...building })),
    connections: starterConnections.map((connection) => ({ ...connection })),
    incidents: [],
    events: [
      {
        id: "welcome",
        tick: 0,
        tone: "info",
        message: `${scenarioDefinition.name} scenario provisioned. City is ready for traffic.`,
      },
    ],
    achievements: ACHIEVEMENT_CATALOG.map((achievement) => ({ ...achievement })),
    objectiveIndex: 0,
    tutorialComplete: false,
    gameOver: false,
    metrics: { ...EMPTY_METRICS },
    settings: { sound: true, reducedMotion: false, highContrast: false },
  };
  return { ...base, metrics: calculateMetrics(base) };
}

export function nextRandom(seed: number): [number, number] {
  const nextSeed = (seed * 1664525 + 1013904223) >>> 0;
  return [nextSeed, nextSeed / 4294967296];
}

export function buildingCapacity(building: Building): number {
  const definition = BUILDINGS[building.kind];
  const levelMultiplier = 1 + (building.level - 1) * 0.68;
  return definition.capacity * levelMultiplier * (building.health / 100);
}

export function connectedBuildingIds(
  buildings: Building[],
  connections: Connection[],
): Set<string> {
  if (buildings.length === 0) return new Set();
  const ingress = buildings.filter((building) => building.kind === "dns");
  const starts = ingress.length > 0
    ? ingress.map((building) => building.id)
    : buildings.filter((building) => building.kind === "frontend").map((building) => building.id);
  const adjacency = new Map<string, string[]>();
  for (const building of buildings) adjacency.set(building.id, []);
  for (const connection of connections) {
    adjacency.get(connection.from)?.push(connection.to);
    adjacency.get(connection.to)?.push(connection.from);
  }
  const visited = new Set<string>();
  const queue = [...starts];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    for (const neighbor of adjacency.get(id) ?? []) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }
  return visited;
}

function hasKind(buildings: Building[], kind: BuildingKind): boolean {
  return buildings.some((building) => building.kind === kind && building.health > 0);
}

function sumCapacity(buildings: Building[], kind: BuildingKind): number {
  return buildings
    .filter((building) => building.kind === kind && building.health > 0)
    .reduce((total, building) => total + buildingCapacity(building), 0);
}

export function calculateMetrics(state: GameState): Metrics {
  const scenario = SCENARIOS[state.scenario];
  const connectedIds = connectedBuildingIds(state.buildings, state.connections);
  const active = state.buildings.filter(
    (building) => connectedIds.has(building.id) && building.health > 0,
  );
  const waveFloor = (state.wave - 1) * scenario.waveTraffic;
  const traffic = Math.max(
    scenario.baseTraffic,
    scenario.baseTraffic + state.tick * scenario.trafficGrowth + waveFloor,
  );
  const frontends = active.filter((building) => building.kind === "frontend");
  const apis = active.filter((building) => building.kind === "api");
  const databases = active.filter((building) => building.kind === "database");
  const routeComplete = frontends.length > 0 && apis.length > 0 && databases.length > 0;

  const cacheCount = active.filter((building) => building.kind === "cache").length;
  const cdnCount = active.filter((building) => building.kind === "cdn").length;
  const loadBalancerCount = active.filter((building) => building.kind === "loadBalancer").length;
  const queueCount = active.filter((building) => building.kind === "queue").length;
  const workerCapacity = sumCapacity(active, "worker");
  const monitorCount = active.filter((building) => building.kind === "monitoring").length;
  const storageCount = active.filter((building) => building.kind === "storage").length;
  const searchCount = active.filter((building) => building.kind === "search").length;
  const authCount = active.filter((building) => building.kind === "auth").length;

  const cacheHitRate = Math.min(0.72, cacheCount * 0.32 + Math.max(0, cacheCount - 1) * 0.08);
  const cdnOffload = Math.min(0.52, cdnCount * 0.27);
  const frontendCapacity = sumCapacity(active, "frontend") / Math.max(0.48, 1 - cdnOffload);
  const rawApiCapacity = sumCapacity(active, "api");
  const apiScaling = apis.length > 1 && loadBalancerCount === 0 ? 0.68 : 1;
  const apiCapacity = rawApiCapacity * apiScaling;
  const specializedDataOffload = Math.min(0.2, storageCount * 0.06 + searchCount * 0.05);
  const databaseCapacity = sumCapacity(active, "database")
    / Math.max(0.3, 1 - cacheHitRate * 0.78 - specializedDataOffload);
  const asyncCapacity = queueCount > 0 && workerCapacity > 0 ? workerCapacity * 0.35 : 0;
  const capacity = routeComplete
    ? Math.max(0, Math.min(frontendCapacity, apiCapacity + asyncCapacity, databaseCapacity))
    : 0;

  const saturation = capacity > 0 ? traffic / capacity : 2;
  const incidentPenalty = state.incidents.reduce(
    (total, incident) => total + (incident.severity === "critical" ? 0.16 : 0.07),
    0,
  );
  const averageHealth = active.length > 0
    ? active.reduce((total, building) => total + building.health, 0) / active.length / 100
    : 0;
  const averageReliability = active.length > 0
    ? active.reduce((total, building) => total + BUILDINGS[building.kind].reliability, 0) / active.length
    : 0;
  const monitoringProtection = Math.min(0.09, monitorCount * 0.045);
  const availability = routeComplete
    ? Math.max(0, Math.min(0.9999, averageReliability * averageHealth - incidentPenalty + monitoringProtection))
    : 0;
  const served = Math.min(traffic, capacity) * availability;
  const errorRate = traffic > 0 ? Math.max(0, 1 - served / traffic) : 0;

  const baseLatency = 174
    + (loadBalancerCount > 0 ? 8 : 0)
    - cdnCount * 24
    - cacheHitRate * 66
    - searchCount * 10;
  const saturationPenalty = saturation > 0.78 ? Math.pow(saturation - 0.78, 2) * 420 : 0;
  const incidentLatency = state.incidents.reduce(
    (total, incident) => total + (incident.severity === "critical" ? 145 : 55),
    0,
  );
  const latency = routeComplete
    ? Math.max(42, baseLatency + saturationPenalty + incidentLatency)
    : 0;

  const operatingCost = state.buildings.reduce(
    (total, building) => total + BUILDINGS[building.kind].upkeep * (1 + (building.level - 1) * 0.48),
    0,
  );
  const trustMultiplier = 1 + Math.min(0.09, authCount * 0.045);
  const revenue = served
    * 2.15
    * Math.max(0.35, state.satisfaction / 100)
    * trustMultiplier
    * scenario.revenueMultiplier;

  const redundancy = Math.min(18, Math.max(0, apis.length - 1) * 6 + Math.max(0, databases.length - 1) * 8);
  const capabilityKinds: BuildingKind[] = ["cache", "cdn", "loadBalancer", "queue", "worker", "monitoring", "auth", "storage"];
  const capabilities = capabilityKinds.filter((kind) => hasKind(active, kind)).length * 4;
  const performance = Math.max(0, 25 - errorRate * 120 - Math.max(0, latency - 180) / 18);
  const architectureScore = Math.round(Math.min(100, 24 + redundancy + capabilities + performance));

  return {
    traffic,
    served,
    capacity,
    saturation,
    latency,
    errorRate,
    availability,
    cacheHitRate,
    routeComplete,
    operatingCost,
    revenue,
    architectureScore,
  };
}

function objectiveComplete(state: GameState, metrics: Metrics): boolean {
  const objective = OBJECTIVES[state.objectiveIndex];
  if (!objective) return false;
  const connected = connectedBuildingIds(state.buildings, state.connections);
  const connectedKinds = new Set(
    state.buildings.filter((building) => connected.has(building.id)).map((building) => building.kind),
  );
  switch (objective.id) {
    case "route": return metrics.routeComplete && metrics.served >= 45;
    case "cache": return connectedKinds.has("cache");
    case "satisfaction": return state.satisfaction >= 88;
    case "observability": return connectedKinds.has("monitoring");
    case "scale": return metrics.served >= 115 && metrics.errorRate < 0.03;
    case "async": return connectedKinds.has("queue") && connectedKinds.has("worker");
    case "availability": return metrics.availability >= 0.99 && metrics.served >= 150;
    case "city": return metrics.served >= 210 && metrics.architectureScore >= 80;
    default: return false;
  }
}

function unlockAchievement(
  achievements: Achievement[],
  id: string,
  tick: number,
): [Achievement[], boolean] {
  let didUnlock = false;
  const next = achievements.map((achievement) => {
    if (achievement.id !== id || achievement.unlockedAt !== undefined) return achievement;
    didUnlock = true;
    return { ...achievement, unlockedAt: tick };
  });
  return [next, didUnlock];
}

function evaluateAchievements(state: GameState, metrics: Metrics): [Achievement[], GameEvent[]] {
  let achievements = state.achievements;
  const events: GameEvent[] = [];
  const candidates: Array<[string, boolean]> = [
    ["speedy", metrics.latency > 0 && metrics.latency < 140],
    ["cache-hero", metrics.cacheHitRate >= 0.5],
    ["six-figures", metrics.served >= 100],
    ["reliable", metrics.availability >= 0.99],
    ["redundant", state.buildings.filter((b) => b.kind === "api").length >= 2 && state.buildings.filter((b) => b.kind === "database").length >= 2],
    ["architect", metrics.architectureScore >= 80],
    ["campaign", state.objectiveIndex >= OBJECTIVES.length],
  ];
  for (const [id, condition] of candidates) {
    if (!condition) continue;
    let unlocked = false;
    [achievements, unlocked] = unlockAchievement(achievements, id, state.tick);
    if (unlocked) {
      const achievement = achievements.find((item) => item.id === id);
      if (achievement) {
        events.push({
          id: `achievement-${id}-${state.tick}`,
          tick: state.tick,
          tone: "good",
          message: `Achievement unlocked: ${achievement.name}`,
        });
      }
    }
  }
  return [achievements, events];
}

function createIncident(state: GameState, random: number): Incident | null {
  const candidates = state.buildings.filter(
    (building) => building.health > 20 && !state.incidents.some((incident) => incident.buildingId === building.id),
  );
  if (candidates.length === 0) return null;
  const building = candidates[Math.floor(random * candidates.length) % candidates.length];
  const definition = INCIDENTS[(state.tick + Math.floor(random * 100)) % INCIDENTS.length];
  return {
    id: `incident-${state.tick}-${building.id}`,
    buildingId: building.id,
    title: definition.title,
    message: definition.message,
    severity: definition.severity,
    remaining: definition.severity === "critical" ? 26 : 18,
    startedAt: state.tick,
  };
}

export function simulateTick(state: GameState): GameState {
  if (state.paused || state.gameOver) return state;
  const tick = state.tick + 1;
  const [seed, random] = nextRandom(state.seed);
  let incidents = state.incidents
    .map((incident) => ({ ...incident, remaining: incident.remaining - 1 }))
    .filter((incident) => incident.remaining > 0);
  const expiredIds = new Set(
    state.incidents.filter((incident) => incident.remaining <= 1).map((incident) => incident.id),
  );
  const events = [...state.events];
  if (expiredIds.size > 0) {
    events.unshift({
      id: `auto-recover-${tick}`,
      tick,
      tone: "info",
      message: "An incident auto-recovered after its retry window.",
    });
  }

  const metricsBefore = calculateMetrics({ ...state, tick, incidents });
  const scenario = SCENARIOS[state.scenario];
  const incidentInterval = Math.max(
    8,
    Math.round((24 - Math.min(6, state.wave) * 2) / scenario.incidentRisk),
  );
  const incidentChance = Math.min(
    0.78,
    (0.2 + state.wave * 0.055) * scenario.incidentRisk,
  );
  if (tick > 18 && tick % incidentInterval === 0 && random < incidentChance) {
    const incident = createIncident({ ...state, tick, incidents }, random);
    if (incident) {
      incidents = [...incidents, incident];
      events.unshift({
        id: `event-${incident.id}`,
        tick,
        tone: "bad",
        message: `${incident.title} at ${BUILDINGS[state.buildings.find((b) => b.id === incident.buildingId)?.kind ?? "api"].name}.`,
      });
    }
  }

  const stressed = metricsBefore.saturation > 1.05;
  const incidentBuildingIds = new Set(incidents.map((incident) => incident.buildingId));
  const buildings = state.buildings.map((building) => {
    let damage = 0;
    if (incidentBuildingIds.has(building.id)) damage += 0.85;
    if (stressed && (building.kind === "api" || building.kind === "database")) damage += Math.min(0.7, (metricsBefore.saturation - 1) * 0.5);
    if (!stressed && !incidentBuildingIds.has(building.id) && building.health < 100) damage -= 0.08;
    return { ...building, health: Math.max(0, Math.min(100, building.health - damage)) };
  });

  let next: GameState = { ...state, seed, tick, buildings, incidents, events };
  const metrics = calculateMetrics(next);
  const net = metrics.revenue - metrics.operatingCost / 12;
  const quality = metrics.routeComplete
    ? 100 - metrics.errorRate * 120 - Math.max(0, metrics.latency - 180) / 10
    : 8;
  const satisfaction = Math.max(0, Math.min(100, state.satisfaction * 0.94 + quality * 0.06));
  let money = state.money + net;
  const lifetimeRevenue = state.lifetimeRevenue + metrics.revenue;
  let xp = state.xp + metrics.served * 0.025;
  let objectiveIndex = state.objectiveIndex;

  next = { ...next, money, lifetimeRevenue, satisfaction, xp, metrics };
  if (objectiveComplete(next, metrics)) {
    const objective = OBJECTIVES[objectiveIndex];
    money += objective.reward;
    xp += objective.xp;
    objectiveIndex += 1;
    events.unshift({
      id: `objective-${objective.id}-${tick}`,
      tick,
      tone: "good",
      message: `Objective complete: ${objective.title} +$${objective.reward.toLocaleString()}`,
    });
  }
  const rank = Math.min(
    RANKS.length,
    RANKS.reduce((value, candidate, index) => xp >= candidate.xp ? index + 1 : value, 1),
  );
  if (rank > state.rank) {
    events.unshift({
      id: `rank-${rank}-${tick}`,
      tick,
      tone: "good",
      message: `Promoted to ${RANKS[rank - 1].name}. New infrastructure unlocked.`,
    });
  }
  const wave = Math.max(1, Math.floor(tick / 72) + 1);
  if (wave > state.wave) {
    events.unshift({
      id: `wave-${wave}-${tick}`,
      tick,
      tone: "info",
      message: `Traffic wave ${wave} incoming. Demand has increased.`,
    });
  }

  next = {
    ...next,
    money,
    lifetimeRevenue,
    satisfaction,
    xp,
    rank,
    wave,
    objectiveIndex,
    events: events.slice(0, 18),
    gameOver: money < -4500 || satisfaction <= 1,
  };
  const [achievements, achievementEvents] = evaluateAchievements(next, metrics);
  return {
    ...next,
    achievements,
    events: [...achievementEvents, ...next.events].slice(0, 18),
  };
}

const VALID_BUILDING_KINDS = new Set<string>(BUILDING_KINDS);
const VALID_SCENARIOS = new Set<string>(Object.keys(SCENARIOS));
const VALID_SPEEDS = new Set<number>([0, 1, 2, 4]);
const MAX_TICK = 10_000_000;
const MAX_CONNECTIONS = 512;
const SAFE_ID = /^[a-zA-Z0-9._:-]{1,96}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteBetween(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum;
}

function isIntegerBetween(value: unknown, minimum: number, maximum: number): value is number {
  return isFiniteBetween(value, minimum, maximum) && Number.isInteger(value);
}

function isSafeText(value: unknown, maximumLength: number): value is string {
  return typeof value === "string"
    && value.length <= maximumLength
    && Array.from(value).every((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 32 && codePoint !== 127;
    });
}

/**
 * Treat browser storage as an untrusted boundary. This parser validates every
 * field the simulation consumes, caps collection sizes, and reconstructs
 * catalog-owned copy instead of trusting it from localStorage.
 */
export function restoreGameState(value: unknown): GameState | null {
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2)) return null;

  const scenario = value.version === 1
    ? "growth"
    : typeof value.scenario === "string" && VALID_SCENARIOS.has(value.scenario)
      ? value.scenario as ScenarioId
      : null;
  if (!scenario) return null;

  if (!isIntegerBetween(value.seed, 0, 0xffffffff)
    || !isIntegerBetween(value.tick, 0, MAX_TICK)
    || !isFiniteBetween(value.money, -1_000_000_000, 1_000_000_000_000)
    || !isFiniteBetween(value.lifetimeRevenue, 0, 1_000_000_000_000_000)
    || !isFiniteBetween(value.satisfaction, 0, 100)
    || !isFiniteBetween(value.xp, 0, 1_000_000_000)
    || !isIntegerBetween(value.rank, 1, RANKS.length)
    || !isIntegerBetween(value.wave, 1, 1_000_000)
    || typeof value.paused !== "boolean"
    || !isIntegerBetween(value.speed, 0, 4)
    || !VALID_SPEEDS.has(value.speed)
    || !isIntegerBetween(value.objectiveIndex, 0, OBJECTIVES.length)
    || typeof value.tutorialComplete !== "boolean"
    || typeof value.gameOver !== "boolean") {
    return null;
  }

  if (!Array.isArray(value.buildings) || value.buildings.length > 48) return null;
  const buildings: Building[] = [];
  const buildingIds = new Set<string>();
  const occupiedCells = new Set<string>();
  for (const candidate of value.buildings) {
    if (!isRecord(candidate)
      || typeof candidate.id !== "string"
      || !SAFE_ID.test(candidate.id)
      || buildingIds.has(candidate.id)
      || typeof candidate.kind !== "string"
      || !VALID_BUILDING_KINDS.has(candidate.kind)
      || !isIntegerBetween(candidate.x, 0, 7)
      || !isIntegerBetween(candidate.y, 0, 5)
      || !isIntegerBetween(candidate.level, 1, 4)
      || !isFiniteBetween(candidate.health, 0, 100)) {
      return null;
    }
    const cell = `${candidate.x}:${candidate.y}`;
    if (occupiedCells.has(cell)) return null;
    occupiedCells.add(cell);
    buildingIds.add(candidate.id);
    buildings.push({
      id: candidate.id,
      kind: candidate.kind as BuildingKind,
      x: candidate.x,
      y: candidate.y,
      level: candidate.level,
      health: candidate.health,
    });
  }

  if (!Array.isArray(value.connections) || value.connections.length > MAX_CONNECTIONS) return null;
  const connections: Connection[] = [];
  const connectionIds = new Set<string>();
  const connectionPairs = new Set<string>();
  for (const candidate of value.connections) {
    if (!isRecord(candidate)
      || typeof candidate.id !== "string"
      || !SAFE_ID.test(candidate.id)
      || connectionIds.has(candidate.id)
      || typeof candidate.from !== "string"
      || typeof candidate.to !== "string"
      || candidate.from === candidate.to
      || !buildingIds.has(candidate.from)
      || !buildingIds.has(candidate.to)) {
      return null;
    }
    const pair = [candidate.from, candidate.to].sort().join(":");
    if (connectionPairs.has(pair)) return null;
    connectionIds.add(candidate.id);
    connectionPairs.add(pair);
    connections.push({ id: candidate.id, from: candidate.from, to: candidate.to });
  }

  if (!Array.isArray(value.incidents) || value.incidents.length > 48) return null;
  const incidents: Incident[] = [];
  const incidentIds = new Set<string>();
  for (const candidate of value.incidents) {
    if (!isRecord(candidate)
      || typeof candidate.id !== "string"
      || !SAFE_ID.test(candidate.id)
      || incidentIds.has(candidate.id)
      || typeof candidate.buildingId !== "string"
      || !buildingIds.has(candidate.buildingId)
      || !isSafeText(candidate.title, 120)
      || !isSafeText(candidate.message, 300)
      || (candidate.severity !== "warning" && candidate.severity !== "critical")
      || !isIntegerBetween(candidate.remaining, 1, 10_000)
      || !isIntegerBetween(candidate.startedAt, 0, MAX_TICK)) {
      return null;
    }
    incidentIds.add(candidate.id);
    incidents.push({
      id: candidate.id,
      buildingId: candidate.buildingId,
      title: candidate.title,
      message: candidate.message,
      severity: candidate.severity,
      remaining: candidate.remaining,
      startedAt: candidate.startedAt,
    });
  }

  if (!Array.isArray(value.events) || value.events.length > 18) return null;
  const events: GameEvent[] = [];
  const eventIds = new Set<string>();
  for (const candidate of value.events) {
    if (!isRecord(candidate)
      || typeof candidate.id !== "string"
      || !SAFE_ID.test(candidate.id)
      || eventIds.has(candidate.id)
      || !isIntegerBetween(candidate.tick, 0, MAX_TICK)
      || (candidate.tone !== "info" && candidate.tone !== "good" && candidate.tone !== "bad")
      || !isSafeText(candidate.message, 300)) {
      return null;
    }
    eventIds.add(candidate.id);
    events.push({
      id: candidate.id,
      tick: candidate.tick,
      tone: candidate.tone,
      message: candidate.message,
    });
  }

  if (!Array.isArray(value.achievements)
    || value.achievements.length > ACHIEVEMENT_CATALOG.length) return null;
  const unlockedAchievements = new Map<string, number>();
  const validAchievementIds = new Set(ACHIEVEMENT_CATALOG.map((achievement) => achievement.id));
  for (const candidate of value.achievements) {
    if (!isRecord(candidate)
      || typeof candidate.id !== "string"
      || !validAchievementIds.has(candidate.id)
      || unlockedAchievements.has(candidate.id)
      || (candidate.unlockedAt !== undefined
        && !isIntegerBetween(candidate.unlockedAt, 0, MAX_TICK))) {
      return null;
    }
    unlockedAchievements.set(candidate.id, candidate.unlockedAt as number);
  }
  const achievements = ACHIEVEMENT_CATALOG.map((achievement) => {
    const unlockedAt = unlockedAchievements.get(achievement.id);
    return unlockedAt === undefined ? { ...achievement } : { ...achievement, unlockedAt };
  });

  if (!isRecord(value.settings)
    || typeof value.settings.sound !== "boolean"
    || typeof value.settings.reducedMotion !== "boolean"
    || typeof value.settings.highContrast !== "boolean") {
    return null;
  }

  const restored: GameState = {
    version: 2,
    scenario,
    seed: value.seed,
    tick: value.tick,
    money: value.money,
    lifetimeRevenue: value.lifetimeRevenue,
    satisfaction: value.satisfaction,
    xp: value.xp,
    rank: value.rank,
    wave: value.wave,
    paused: value.paused,
    speed: value.speed as GameState["speed"],
    buildings,
    connections,
    incidents,
    events,
    achievements,
    objectiveIndex: value.objectiveIndex,
    tutorialComplete: value.tutorialComplete,
    gameOver: value.gameOver,
    metrics: { ...EMPTY_METRICS },
    settings: {
      sound: value.settings.sound,
      reducedMotion: value.settings.reducedMotion,
      highContrast: value.settings.highContrast,
    },
  };
  return { ...restored, metrics: calculateMetrics(restored) };
}

export function isValidGameState(value: unknown): value is GameState {
  return isRecord(value) && value.version === 2 && restoreGameState(value) !== null;
}

export function nextId(prefix: string, state: GameState): string {
  return `${prefix}-${state.tick}-${state.seed}-${state.buildings.length + state.connections.length}`;
}

export function addManualAchievement(
  state: GameState,
  id: string,
): GameState {
  let unlocked = false;
  const [achievements, didUnlock] = unlockAchievement(state.achievements, id, state.tick);
  unlocked = didUnlock;
  if (!unlocked) return state;
  const achievement = achievements.find((item) => item.id === id);
  return {
    ...state,
    achievements,
    events: [
      {
        id: `achievement-${id}-${state.tick}`,
        tick: state.tick,
        tone: "good" as const,
        message: `Achievement unlocked: ${achievement?.name ?? id}`,
      },
      ...state.events,
    ].slice(0, 18),
  };
}
