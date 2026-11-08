import { SCENARIOS } from "./catalog.ts";
import { applyPlayerAction, MAX_REPLAY_ACTIONS } from "./actions.ts";
import {
  createInitialState,
  restoreWorkshopScenario,
  simulateTick,
} from "./engine.ts";
import { BUILDING_KINDS } from "./types.ts";
import type {
  BuildingKind,
  GameState,
  ReplayAction,
  ReplayRecording,
  RetryPolicy,
  ScenarioId,
  WorkshopScenario,
} from "./types.ts";

const REPLAY_PREFIX = "R1";
const MAX_REPLAY_CODE_LENGTH = 80_000;
const MAX_REPLAY_TICK = 100_000;
const SAFE_ID = /^[a-zA-Z0-9._:-]{1,96}$/;
const BUILDING_KIND_SET = new Set<string>(BUILDING_KINDS);
const SCENARIO_SET = new Set<string>(Object.keys(SCENARIOS));
const RETRY_SET = new Set<string>(["off", "bounded", "aggressive"]);
const BASE64_URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

type CompactWorkshop = [
  ScenarioId,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  0 | 1,
  WorkshopScenario["incidentDeck"],
];

type CompactAction = [number, string, ...Array<string | number>];

interface ReplayPayload {
  v: 1;
  s: ScenarioId;
  n: number;
  e: number;
  w?: CompactWorkshop;
  a: CompactAction[];
}

function checksum(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const combined = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    result += BASE64_URL_ALPHABET[(combined >>> 18) & 63];
    result += BASE64_URL_ALPHABET[(combined >>> 12) & 63];
    if (second !== undefined) result += BASE64_URL_ALPHABET[(combined >>> 6) & 63];
    if (third !== undefined) result += BASE64_URL_ALPHABET[combined & 63];
  }
  return result;
}

function decodeBase64Url(value: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return null;
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 4) {
    const first = BASE64_URL_ALPHABET.indexOf(value[index]);
    const second = BASE64_URL_ALPHABET.indexOf(value[index + 1]);
    const third = index + 2 < value.length ? BASE64_URL_ALPHABET.indexOf(value[index + 2]) : 0;
    const fourth = index + 3 < value.length ? BASE64_URL_ALPHABET.indexOf(value[index + 3]) : 0;
    if (first < 0 || second < 0 || third < 0 || fourth < 0) return null;
    const combined = (first << 18) | (second << 12) | (third << 6) | fourth;
    bytes.push((combined >>> 16) & 255);
    if (index + 2 < value.length) bytes.push((combined >>> 8) & 255);
    if (index + 3 < value.length) bytes.push(combined & 255);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

function compactWorkshop(workshop: WorkshopScenario): CompactWorkshop {
  return [
    workshop.template,
    workshop.startingMoney,
    workshop.baseTraffic,
    workshop.trafficGrowth,
    workshop.waveTraffic,
    workshop.incidentRisk,
    workshop.revenueMultiplier,
    workshop.maxBuildings,
    workshop.maxLevel,
    workshop.autoscalingAllowed ? 1 : 0,
    workshop.incidentDeck,
  ];
}

function restoreCompactWorkshop(value: unknown): WorkshopScenario | null {
  if (!Array.isArray(value) || value.length !== 11 || (value[9] !== 0 && value[9] !== 1)) return null;
  return restoreWorkshopScenario({
    version: 1,
    name: "Shared replay drill",
    template: value[0],
    startingMoney: value[1],
    baseTraffic: value[2],
    trafficGrowth: value[3],
    waveTraffic: value[4],
    incidentRisk: value[5],
    revenueMultiplier: value[6],
    maxBuildings: value[7],
    maxLevel: value[8],
    autoscalingAllowed: value[9] === 1,
    incidentDeck: value[10],
  });
}

function compactAction(action: ReplayAction): CompactAction {
  switch (action.type) {
    case "build": return [action.tick, "B", action.kind, action.x, action.y];
    case "connect": return [action.tick, "C", action.from, action.to];
    case "upgrade": return [action.tick, "U", action.buildingId];
    case "decommission": return [action.tick, "D", action.buildingId];
    case "resolve": return [action.tick, "X", action.incidentId];
    case "retry": return [action.tick, "R", action.policy];
    case "breaker": return [action.tick, "K", Number(action.enabled)];
    case "autoscaling": return [action.tick, "A", Number(action.enabled)];
    case "canary-start": return [action.tick, "S", action.buildingId];
    case "canary-rollback": return [action.tick, "O"];
  }
}

function integerBetween(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= minimum
    && value <= maximum;
}

function restoreCompactAction(value: unknown, endTick: number): ReplayAction | null {
  if (!Array.isArray(value) || !integerBetween(value[0], 0, endTick) || typeof value[1] !== "string") {
    return null;
  }
  const tick = value[0];
  const id = (candidate: unknown) => typeof candidate === "string" && SAFE_ID.test(candidate)
    ? candidate
    : null;
  switch (value[1]) {
    case "B":
      if (value.length !== 5 || typeof value[2] !== "string" || !BUILDING_KIND_SET.has(value[2])
        || !integerBetween(value[3], 0, 7) || !integerBetween(value[4], 0, 5)) return null;
      return { tick, type: "build", kind: value[2] as BuildingKind, x: value[3], y: value[4] };
    case "C": {
      const from = id(value[2]);
      const to = id(value[3]);
      return value.length === 4 && from && to ? { tick, type: "connect", from, to } : null;
    }
    case "U": {
      const buildingId = id(value[2]);
      return value.length === 3 && buildingId ? { tick, type: "upgrade", buildingId } : null;
    }
    case "D": {
      const buildingId = id(value[2]);
      return value.length === 3 && buildingId ? { tick, type: "decommission", buildingId } : null;
    }
    case "X": {
      const incidentId = id(value[2]);
      return value.length === 3 && incidentId ? { tick, type: "resolve", incidentId } : null;
    }
    case "R":
      return value.length === 3 && typeof value[2] === "string" && RETRY_SET.has(value[2])
        ? { tick, type: "retry", policy: value[2] as RetryPolicy }
        : null;
    case "K":
      return value.length === 3 && (value[2] === 0 || value[2] === 1)
        ? { tick, type: "breaker", enabled: value[2] === 1 }
        : null;
    case "A":
      return value.length === 3 && (value[2] === 0 || value[2] === 1)
        ? { tick, type: "autoscaling", enabled: value[2] === 1 }
        : null;
    case "S": {
      const buildingId = id(value[2]);
      return value.length === 3 && buildingId ? { tick, type: "canary-start", buildingId } : null;
    }
    case "O": return value.length === 2 ? { tick, type: "canary-rollback" } : null;
    default: return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function createReplayRecording(state: GameState): ReplayRecording {
  return {
    version: 1,
    scenario: state.scenario,
    workshop: state.workshop ? { ...state.workshop, name: "Shared replay drill" } : null,
    challengeSeed: state.challengeSeed,
    endTick: state.tick,
    actions: state.replayActions.slice(0, MAX_REPLAY_ACTIONS),
  };
}

export function createReplayCode(state: GameState): string {
  const recording = createReplayRecording(state);
  const payload: ReplayPayload = {
    v: 1,
    s: recording.scenario,
    n: recording.challengeSeed,
    e: recording.endTick,
    ...(recording.workshop ? { w: compactWorkshop(recording.workshop) } : {}),
    a: recording.actions.map(compactAction),
  };
  const encoded = encodeBase64Url(JSON.stringify(payload));
  return `${REPLAY_PREFIX}.${encoded}.${checksum(encoded)}`;
}

export function parseReplayCode(code: string): ReplayRecording | null {
  const normalized = code.trim();
  if (normalized.length > MAX_REPLAY_CODE_LENGTH) return null;
  const parts = normalized.split(".");
  if (parts.length !== 3 || parts[0] !== REPLAY_PREFIX || checksum(parts[1]) !== parts[2].toUpperCase()) {
    return null;
  }
  const decoded = decodeBase64Url(parts[1]);
  if (!decoded) return null;
  let value: unknown;
  try {
    value = JSON.parse(decoded);
  } catch {
    return null;
  }
  if (!isRecord(value)
    || value.v !== 1
    || typeof value.s !== "string"
    || !SCENARIO_SET.has(value.s)
    || !integerBetween(value.n, 0, 0xffffffff)
    || !integerBetween(value.e, 0, MAX_REPLAY_TICK)
    || !Array.isArray(value.a)
    || value.a.length > MAX_REPLAY_ACTIONS) return null;

  const scenario = value.s as ScenarioId;
  const workshop = value.w === undefined ? null : restoreCompactWorkshop(value.w);
  if ((value.w !== undefined && !workshop) || (workshop && workshop.template !== scenario)) return null;
  const actions: ReplayAction[] = [];
  let previousTick = -1;
  for (const candidate of value.a) {
    const action = restoreCompactAction(candidate, value.e);
    if (!action || action.tick < previousTick) return null;
    previousTick = action.tick;
    actions.push(action);
  }
  return {
    version: 1,
    scenario,
    workshop,
    challengeSeed: value.n,
    endTick: value.e,
    actions,
  };
}

export function createReplayPlaybackState(recording: ReplayRecording): GameState {
  return {
    ...createInitialState(recording.scenario, recording.challengeSeed, recording.workshop),
    paused: false,
    speed: 4,
    tutorialComplete: true,
    reportRecorded: true,
  };
}

export function advanceReplay(
  state: GameState,
  recording: ReplayRecording,
  nextActionIndex: number,
  ticks = 1,
): { state: GameState; nextActionIndex: number; complete: boolean } {
  let next = { ...state, paused: false };
  let actionIndex = nextActionIndex;
  for (let step = 0; step < ticks; step += 1) {
    while (actionIndex < recording.actions.length
      && recording.actions[actionIndex].tick === next.tick) {
      next = applyPlayerAction(next, recording.actions[actionIndex]);
      actionIndex += 1;
    }
    if (next.tick >= recording.endTick || next.gameOver) break;
    next = simulateTick(next);
  }
  const complete = next.tick >= recording.endTick || next.gameOver;
  return {
    state: complete ? { ...next, paused: true } : next,
    nextActionIndex: actionIndex,
    complete,
  };
}

export function replayToEnd(recording: ReplayRecording): GameState {
  let state = createReplayPlaybackState(recording);
  let nextActionIndex = 0;
  while (!state.gameOver && state.tick < recording.endTick) {
    const advanced = advanceReplay(state, recording, nextActionIndex, 64);
    state = advanced.state;
    nextActionIndex = advanced.nextActionIndex;
    if (advanced.complete) break;
  }
  if (state.tick === recording.endTick && nextActionIndex < recording.actions.length) {
    const advanced = advanceReplay(state, recording, nextActionIndex, 1);
    state = advanced.state;
  }
  return { ...state, paused: true };
}
