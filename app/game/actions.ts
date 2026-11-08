import { BUILDINGS, GRID_COLUMNS, GRID_ROWS } from "./catalog.ts";
import {
  addManualAchievement,
  calculateMetrics,
  nextId,
  resolveIncident,
  rollbackCanaryDeployment,
  startCanaryDeployment,
} from "./engine.ts";
import type { Building, GameState, ReplayAction } from "./types.ts";

export const CONNECTION_COST = 250;
export const MAX_REPLAY_ACTIONS = 600;

function money(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function upgradeCost(building: Building): number {
  return Math.round(BUILDINGS[building.kind].cost * (0.55 + building.level * 0.32));
}

function applyBuild(state: GameState, action: Extract<ReplayAction, { type: "build" }>): GameState {
  const definition = BUILDINGS[action.kind];
  if (action.x < 0 || action.x >= GRID_COLUMNS || action.y < 0 || action.y >= GRID_ROWS) return state;
  if (state.rank < definition.unlockRank || state.money < definition.cost) return state;
  if (state.buildings.length >= (state.workshop?.maxBuildings ?? GRID_COLUMNS * GRID_ROWS)) return state;
  if (state.buildings.some((building) => building.x === action.x && building.y === action.y)) return state;
  const building: Building = {
    id: nextId(action.kind, state),
    kind: action.kind,
    x: action.x,
    y: action.y,
    level: 1,
    health: 100,
  };
  return addManualAchievement({
    ...state,
    money: state.money - definition.cost,
    buildings: [...state.buildings, building],
    events: [{
      id: `build-${building.id}`,
      tick: state.tick,
      tone: "info" as const,
      message: `${definition.name} commissioned for ${money(definition.cost)}.`,
    }, ...state.events].slice(0, 18),
  }, "first-build");
}

function applyConnect(state: GameState, action: Extract<ReplayAction, { type: "connect" }>): GameState {
  if (action.from === action.to || state.money < CONNECTION_COST) return state;
  const exists = state.connections.some((connection) =>
    (connection.from === action.from && connection.to === action.to)
      || (connection.from === action.to && connection.to === action.from),
  );
  if (exists) return state;
  const from = state.buildings.find((building) => building.id === action.from);
  const to = state.buildings.find((building) => building.id === action.to);
  if (!from || !to) return state;
  return addManualAchievement({
    ...state,
    money: state.money - CONNECTION_COST,
    connections: [...state.connections, {
      id: nextId("link", state),
      from: action.from,
      to: action.to,
    }],
    events: [{
      id: `connect-${action.from}-${action.to}-${state.tick}`,
      tick: state.tick,
      tone: "good" as const,
      message: `${BUILDINGS[from.kind].shortName} now routes to ${BUILDINGS[to.kind].shortName}.`,
    }, ...state.events].slice(0, 18),
  }, "first-link");
}

function applyUpgrade(state: GameState, action: Extract<ReplayAction, { type: "upgrade" }>): GameState {
  const building = state.buildings.find((candidate) => candidate.id === action.buildingId);
  const maximumLevel = state.workshop?.maxLevel ?? 4;
  if (!building || building.level >= maximumLevel) return state;
  const cost = upgradeCost(building);
  if (state.money < cost) return state;
  return {
    ...state,
    money: state.money - cost,
    buildings: state.buildings.map((candidate) => candidate.id === building.id
      ? { ...candidate, level: candidate.level + 1, health: Math.min(100, candidate.health + 18) }
      : candidate),
    events: [{
      id: `upgrade-${building.id}-${state.tick}`,
      tick: state.tick,
      tone: "good" as const,
      message: `${BUILDINGS[building.kind].name} upgraded to level ${building.level + 1}.`,
    }, ...state.events].slice(0, 18),
  };
}

function applyDecommission(
  state: GameState,
  action: Extract<ReplayAction, { type: "decommission" }>,
): GameState {
  const building = state.buildings.find((candidate) => candidate.id === action.buildingId);
  if (!building) return state;
  const refund = Math.round(BUILDINGS[building.kind].cost * 0.55 * (1 + (building.level - 1) * 0.42));
  const removedIncidents = state.incidents.filter((incident) => incident.buildingId === building.id);
  const removesCanary = state.release.status === "canary"
    && state.release.targetBuildingId === building.id;
  return {
    ...state,
    money: state.money + refund,
    buildings: state.buildings.filter((candidate) => candidate.id !== building.id),
    connections: state.connections.filter(
      (connection) => connection.from !== building.id && connection.to !== building.id,
    ),
    incidents: state.incidents.filter((incident) => incident.buildingId !== building.id),
    telemetry: {
      ...state.telemetry,
      incidentsResolved: state.telemetry.incidentsResolved + removedIncidents.length,
      canariesRolledBack: state.telemetry.canariesRolledBack + Number(removesCanary),
      totalResolutionTicks: state.telemetry.totalResolutionTicks
        + removedIncidents.reduce(
          (total, incident) => total + Math.max(0, state.tick - incident.startedAt),
          0,
        ),
    },
    release: removesCanary
      ? { ...state.release, status: "idle", targetBuildingId: null, progress: 0 }
      : state.release,
    events: [{
      id: `sell-${building.id}-${state.tick}`,
      tick: state.tick,
      tone: "info" as const,
      message: `${BUILDINGS[building.kind].name} decommissioned. ${money(refund)} recovered.`,
    }, ...state.events].slice(0, 18),
  };
}

function applyActionTransition(state: GameState, action: ReplayAction): GameState {
  switch (action.type) {
    case "build": return applyBuild(state, action);
    case "connect": return applyConnect(state, action);
    case "upgrade": return applyUpgrade(state, action);
    case "decommission": return applyDecommission(state, action);
    case "resolve": return resolveIncident(state, action.incidentId);
    case "retry":
      return state.operations.retryPolicy === action.policy ? state : {
        ...state,
        operations: { ...state.operations, retryPolicy: action.policy },
      };
    case "breaker":
      return state.operations.circuitBreaker === action.enabled ? state : {
        ...state,
        operations: { ...state.operations, circuitBreaker: action.enabled },
      };
    case "autoscaling": {
      const enabled = state.workshop?.autoscalingAllowed === false ? false : action.enabled;
      return state.operations.autoscaling === enabled ? state : {
        ...state,
        operations: { ...state.operations, autoscaling: enabled },
      };
    }
    case "canary-start": return startCanaryDeployment(state, action.buildingId);
    case "canary-rollback": return rollbackCanaryDeployment(state);
  }
}

export function applyPlayerAction(
  state: GameState,
  action: ReplayAction,
  record = true,
): GameState {
  if (action.tick !== state.tick) return state;
  const transitioned = applyActionTransition(state, action);
  if (transitioned === state) return state;
  const replayActions = record && state.replayActions.length < MAX_REPLAY_ACTIONS
    ? [...state.replayActions, action]
    : transitioned.replayActions;
  const next = { ...transitioned, replayActions };
  return { ...next, metrics: calculateMetrics(next) };
}
