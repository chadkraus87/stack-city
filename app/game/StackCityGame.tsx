"use client";

import Link from "next/link";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BUILDING_LIST,
  BUILDINGS,
  GRID_COLUMNS,
  GRID_ROWS,
  OBJECTIVES,
  RANKS,
  SCENARIOS,
  SCENARIO_LIST,
} from "./catalog.ts";
import {
  addManualAchievement,
  buildingCapacity,
  calculateMetrics,
  connectedBuildingIds,
  createChallengeCode,
  createInitialState,
  createOperationsReport,
  createRunSummary,
  incidentRepairCost,
  nextId,
  parseChallengeCode,
  rollbackCanaryDeployment,
  resolveIncident,
  restoreGameState,
  restoreRunHistory,
  simulateTick,
  startCanaryDeployment,
} from "./engine.ts";
import type {
  Building,
  BuildingCategory,
  BuildingKind,
  GameSpeed,
  GameState,
  RunEndReason,
  RunSummary,
  RetryPolicy,
  ScenarioId,
  ServiceSignal,
} from "./types.ts";

const SAVE_KEY = "stack-city-save-v4";
const LEGACY_SAVE_KEYS = ["stack-city-save-v3", "stack-city-save-v2", "stack-city-save-v1"] as const;
const HISTORY_KEY = "stack-city-run-history-v1";
const MAX_SAVE_BYTES = 250_000;
const MAX_HISTORY_BYTES = 100_000;
const DEFAULT_CHALLENGE_SEED = 82491;
const CONNECTION_COST = 250;
const CATEGORIES: Array<BuildingCategory | "All"> = ["All", "Edge", "Compute", "Data", "Platform"];
const GRID_CELLS = Array.from({ length: GRID_COLUMNS * GRID_ROWS }, (_, index) => ({
  x: index % GRID_COLUMNS,
  y: Math.floor(index / GRID_COLUMNS),
}));

const TOUR_STEPS = [
  {
    eyebrow: "01 / Mission control",
    title: "Know what good looks like",
    body: "The mission card gives you one concrete systems goal at a time. Finish it to earn budget, XP, new ranks, and more infrastructure choices.",
    hint: "Start with the highlighted objective in the right-hand operations rail.",
    signal: "MISSION",
    position: "right",
  },
  {
    eyebrow: "02 / Live telemetry",
    title: "Read the city’s pulse",
    body: "Traffic, latency, errors, availability, and budget update as the simulation runs. Healthy systems serve demand with headroom and protect the user experience.",
    hint: "Aim for under 250 ms p95 latency, under 1% errors, and at least 99% availability.",
    signal: "SIGNALS",
    position: "top",
  },
  {
    eyebrow: "03 / Build catalog",
    title: "Place the next service",
    body: "Choose an unlocked service from the catalog, then select an empty city tile. Every building has a purchase price, operating cost, capacity, and architectural role.",
    hint: "Your first guided hint will recommend a Cache Depot to protect the database.",
    signal: "BUILD",
    position: "left",
  },
  {
    eyebrow: "04 / Request routing",
    title: "Connect the stack",
    body: "Links are directional. Select the upstream service, choose Connect, then choose the downstream service that should receive its requests.",
    hint: "A complete core route runs DNS → WEB → API → DATA. Arrowed links cost $250.",
    signal: "ROUTE",
    position: "bottom",
  },
  {
    eyebrow: "05 / Operations",
    title: "Scale the bottleneck",
    body: "Capacity is constrained by the narrowest layer. Upgrade busy services, add replicas, and introduce caches, load balancers, queues, and workers as traffic grows.",
    hint: "Watch saturation and the event stream. Yellow means headroom is low; red needs action.",
    signal: "OPERATE",
    position: "right",
  },
  {
    eyebrow: "06 / Guided play",
    title: "You’re on call now",
    body: "The tour will get out of your way, but the live hint card will stay active and adapt to your progress. You can disable hints or replay this walkthrough in Settings anytime.",
    hint: "Pause with Space or P. Escape cancels the current tool. Your city autosaves only on this device.",
    signal: "GO LIVE",
    position: "center",
  },
] as const;

function money(value: number): string {
  const sign = value < 0 ? "−" : "";
  return `${sign}$${Math.abs(Math.round(value)).toLocaleString()}`;
}

function compact(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return Math.round(value).toString();
}

function percent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function elapsed(tick: number): string {
  const seconds = Math.floor(tick / 2);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function calculateUpgradeCost(building: Building): number {
  return Math.round(BUILDINGS[building.kind].cost * (0.55 + building.level * 0.32));
}

function connectionGeometry(from: Building, to: Building): CSSProperties {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return {
    left: `${((from.x + 0.5) / GRID_COLUMNS) * 100}%`,
    top: `${((from.y + 0.5) / GRID_ROWS) * 100}%`,
    width: `${Math.hypot(dx, dy) * (100 / GRID_COLUMNS)}%`,
    transform: `rotate(${Math.atan2(dy, dx) * (180 / Math.PI)}deg)`,
  };
}

const SIGNAL_PRIORITY: Record<ServiceSignal["status"], number> = {
  incident: 5,
  overloaded: 4,
  stressed: 3,
  healthy: 2,
  offline: 1,
};

function FlowObservatory({
  signals,
  onSelect,
}: {
  signals: ServiceSignal[];
  onSelect: (buildingId: string) => void;
}) {
  const visibleSignals = [...signals]
    .sort((left, right) =>
      Number(right.onCriticalPath) - Number(left.onCriticalPath)
        || SIGNAL_PRIORITY[right.status] - SIGNAL_PRIORITY[left.status]
        || right.utilization - left.utilization,
    )
    .slice(0, 6);
  return (
    <section className="flow-observatory" aria-labelledby="flow-observatory-title">
      <div className="panel-heading tight">
        <div><span className="eyebrow">Distributed trace</span><h2 id="flow-observatory-title">Service flow</h2></div>
        <span className="flow-direction">UPSTREAM → DOWNSTREAM</span>
      </div>
      <ol>
        {visibleSignals.map((signal) => (
          <li key={signal.buildingId}>
            <button type="button" onClick={() => onSelect(signal.buildingId)}>
              <span className={`signal-status ${signal.status}`} />
              <span className="signal-service">
                <strong>{BUILDINGS[signal.kind].name}</strong>
                <small>{signal.onCriticalPath ? "CRITICAL PATH" : signal.reachable ? "CONNECTED BRANCH" : "NO INGRESS"}</small>
              </span>
              <span className="signal-throughput"><strong>{compact(signal.served)}</strong><small>/ {compact(signal.incoming)} RPS</small></span>
              <span className="signal-utilization"><strong>{percent(signal.utilization, 0)}</strong><small>{signal.status}</small></span>
              <span className="signal-meter" aria-hidden="true"><i className={signal.status} style={{ width: `${Math.min(100, signal.utilization * 100)}%` }} /></span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ReliabilityConsole({
  retryPolicy,
  circuitBreaker,
  autoscaling,
  release,
  canaryTargets,
  canAffordCanary,
  onRetryPolicy,
  onToggleCircuitBreaker,
  onToggleAutoscaling,
  onStartCanary,
  onRollback,
}: {
  retryPolicy: RetryPolicy;
  circuitBreaker: boolean;
  autoscaling: boolean;
  release: GameState["release"];
  canaryTargets: ServiceSignal[];
  canAffordCanary: boolean;
  onRetryPolicy: (policy: RetryPolicy) => void;
  onToggleCircuitBreaker: () => void;
  onToggleAutoscaling: () => void;
  onStartCanary: (buildingId: string) => void;
  onRollback: () => void;
}) {
  const target = canaryTargets.find((signal) => signal.buildingId === release.targetBuildingId);
  return (
    <section className="reliability-console" aria-labelledby="reliability-title">
      <div className="panel-heading tight">
        <div><span className="eyebrow">Traffic policy</span><h2 id="reliability-title">Reliability controls</h2></div>
      </div>
      <div className="policy-row">
        <span><strong>Retries</strong><small>Recovery versus load amplification</small></span>
        <div className="segmented-control" aria-label="Retry policy">
          {(["off", "bounded", "aggressive"] as const).map((policy) => (
            <button type="button" key={policy} aria-pressed={retryPolicy === policy} className={retryPolicy === policy ? "active" : ""} onClick={() => onRetryPolicy(policy)}>{policy}</button>
          ))}
        </div>
      </div>
      <button type="button" className={`policy-toggle ${circuitBreaker ? "active" : ""}`} aria-pressed={circuitBreaker} onClick={onToggleCircuitBreaker}>
        <span><strong>Circuit breaker</strong><small>Shed overload before failures cascade</small></span><b>{circuitBreaker ? "ARMED" : "OFF"}</b>
      </button>
      <button type="button" className={`policy-toggle ${autoscaling ? "active" : ""}`} aria-pressed={autoscaling} onClick={onToggleAutoscaling}>
        <span><strong>Compute autoscaler</strong><small>Rent burst capacity above 70% load</small></span><b>{autoscaling ? "READY" : "OFF"}</b>
      </button>
      {release.status === "canary" ? (
        <div className="canary-progress">
          <div><span>Canary · {target ? BUILDINGS[target.kind].shortName : "service"}</span><strong>{release.progress}%</strong></div>
          <div className="mini-meter"><i style={{ width: `${release.progress}%` }} /></div>
          <button type="button" onClick={onRollback}>Roll back safely</button>
        </div>
      ) : (
        <div className="canary-launch">
          <span><strong>Canary release</strong><small>Route 10% traffic to a new compute revision · $1,200</small></span>
          <div>
            {canaryTargets.slice(0, 3).map((signal) => (
              <button type="button" key={signal.buildingId} aria-label={`Start canary on ${BUILDINGS[signal.kind].name}`} disabled={!canAffordCanary} onClick={() => onStartCanary(signal.buildingId)}>{BUILDINGS[signal.kind].code}</button>
            ))}
            {canaryTargets.length === 0 && <small>Connect a Web, API, or Worker service first.</small>}
          </div>
        </div>
      )}
    </section>
  );
}

function withFreshMetrics(state: GameState): GameState {
  return { ...state, metrics: calculateMetrics(state) };
}

export function StackCityGame() {
  const [game, setGame] = useState<GameState>(() => createInitialState());
  const [hydrated, setHydrated] = useState(false);
  const [buildMode, setBuildMode] = useState<BuildingKind | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>("web-1");
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [category, setCategory] = useState<BuildingCategory | "All">("All");
  const [showIntro, setShowIntro] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [showClearHistory, setShowClearHistory] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [lastSavedTick, setLastSavedTick] = useState<number | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioId>("growth");
  const [selectedSeed, setSelectedSeed] = useState(DEFAULT_CHALLENGE_SEED);
  const [challengeInput, setChallengeInput] = useState(
    () => createChallengeCode("growth", DEFAULT_CHALLENGE_SEED),
  );
  const [challengeError, setChallengeError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [runHistory, setRunHistory] = useState<RunSummary[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const resumeAfterTourRef = useRef(true);
  const resumeAfterReportRef = useRef(false);

  const playTone = useCallback((frequency: number, duration = 0.055) => {
    if (!game.settings.sound || typeof window === "undefined") return;
    try {
      const AudioContextClass = window.AudioContext;
      const context = audioContextRef.current ?? new AudioContextClass();
      audioContextRef.current = context;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.035, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    } catch {
      // Sound is optional; browsers may decline audio before user interaction.
    }
  }, [game.settings.sound]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(SAVE_KEY)
          ?? LEGACY_SAVE_KEYS.map((key) => window.localStorage.getItem(key)).find(Boolean);
        if (raw) {
          if (raw.length > MAX_SAVE_BYTES) throw new Error("Saved game exceeds the safety limit.");
          const restoredState = restoreGameState(JSON.parse(raw));
          if (restoredState) {
            const restored = withFreshMetrics({ ...restoredState, paused: true });
            setGame(restored);
            setSelectedScenario(restored.scenario);
            setSelectedSeed(restored.challengeSeed);
            setChallengeInput(createChallengeCode(restored.scenario, restored.challengeSeed));
            setLastSavedTick(restored.tick);
            for (const key of LEGACY_SAVE_KEYS) window.localStorage.removeItem(key);
          } else {
            window.localStorage.removeItem(SAVE_KEY);
            for (const key of LEGACY_SAVE_KEYS) window.localStorage.removeItem(key);
          }
        }
      } catch {
        window.localStorage.removeItem(SAVE_KEY);
        for (const key of LEGACY_SAVE_KEYS) window.localStorage.removeItem(key);
      }
      try {
        const rawHistory = window.localStorage.getItem(HISTORY_KEY);
        if (rawHistory) {
          if (rawHistory.length > MAX_HISTORY_BYTES) throw new Error("Run history exceeds the safety limit.");
          const restoredHistory = restoreRunHistory(JSON.parse(rawHistory));
          if (restoredHistory.length > 0) setRunHistory(restoredHistory);
          else window.localStorage.removeItem(HISTORY_KEY);
        }
      } catch {
        window.localStorage.removeItem(HISTORY_KEY);
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(SAVE_KEY, JSON.stringify(game));
        for (const key of LEGACY_SAVE_KEYS) window.localStorage.removeItem(key);
        setLastSavedTick(game.tick);
      } catch {
        // Storage can be unavailable in private or restricted browsing modes.
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [game, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify({ version: 1, runs: runHistory }));
      } catch {
        // History is optional when browser storage is unavailable.
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [hydrated, runHistory]);

  useEffect(() => {
    if (game.paused || game.gameOver || showIntro || tourStep !== null) return;
    const timer = window.setInterval(() => {
      setGame((current) => {
        let next = current;
        const steps = Math.max(1, current.speed);
        for (let index = 0; index < steps; index += 1) next = simulateTick(next);
        return next;
      });
    }, 500);
    return () => window.clearInterval(timer);
  }, [game.paused, game.gameOver, game.speed, showIntro, tourStep]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select")) return;
      if (event.key === "Escape") {
        setBuildMode(null);
        setConnectFrom(null);
        setShowGuide(false);
        setShowSettings(false);
        if (showReport && !game.gameOver) {
          setShowReport(false);
          setGame((current) => ({ ...current, paused: !resumeAfterReportRef.current }));
        }
        if (tourStep !== null) {
          setTourStep(null);
          setGame((current) => ({ ...current, paused: !resumeAfterTourRef.current }));
        }
      }
      if (event.key.toLowerCase() === "p" && !showIntro && tourStep === null) {
        setGame((current) => ({ ...current, paused: !current.paused }));
      }
      if (event.key === " " && !showIntro && tourStep === null) {
        event.preventDefault();
        setGame((current) => ({ ...current, paused: !current.paused }));
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [game.gameOver, showIntro, showReport, tourStep]);

  const connected = useMemo(
    () => connectedBuildingIds(game.buildings, game.connections),
    [game.buildings, game.connections],
  );
  const selected = game.buildings.find((building) => building.id === selectedId) ?? null;
  const selectedDefinition = selected ? BUILDINGS[selected.kind] : null;
  const selectedSignal = game.metrics.serviceSignals.find((signal) => signal.buildingId === selectedId) ?? null;
  const currentObjective = OBJECTIVES[game.objectiveIndex];
  const nextRank = RANKS[game.rank];
  const rankFloor = RANKS[game.rank - 1]?.xp ?? 0;
  const rankProgress = nextRank
    ? Math.max(0, Math.min(1, (game.xp - rankFloor) / (nextRank.xp - rankFloor)))
    : 1;
  const visibleBuildings = BUILDING_LIST.filter(
    (definition) => category === "All" || definition.category === category,
  );
  const incidentBuildingIds = new Set(game.incidents.map((incident) => incident.buildingId));
  const unlockedAchievements = game.achievements.filter((achievement) => achievement.unlockedAt !== undefined);
  const saveStatus = lastSavedTick === game.tick ? "saved" : "saving";
  const scenarioDefinition = SCENARIOS[game.scenario];
  const challengeCode = createChallengeCode(game.scenario, game.challengeSeed);
  const operationsReport = useMemo(() => createOperationsReport(game), [game]);
  const canaryTargets = useMemo(
    () => game.metrics.serviceSignals.filter((signal) =>
      signal.reachable
        && (signal.kind === "frontend" || signal.kind === "api" || signal.kind === "worker"),
    ),
    [game.metrics.serviceSignals],
  );
  const reportSamples = useMemo(() => {
    if (game.telemetry.architectureHistory.length > 0) {
      return game.telemetry.architectureHistory.slice(-18);
    }
    return [{
      tick: game.tick,
      architectureScore: game.metrics.architectureScore,
      availability: game.metrics.availability,
      latency: game.metrics.latency,
      errorRate: game.metrics.errorRate,
    }];
  }, [game.metrics, game.telemetry.architectureHistory, game.tick]);

  const archiveRun = useCallback((state: GameState, reason: Exclude<RunEndReason, "live">) => {
    const summary = createRunSummary(state, reason, Date.now());
    setRunHistory((current) => [summary, ...current].slice(0, 12));
  }, []);

  useEffect(() => {
    const campaignComplete = game.objectiveIndex >= OBJECTIVES.length;
    if (!hydrated || game.reportRecorded || (!game.gameOver && !campaignComplete)) return;
    const timer = window.setTimeout(() => {
      resumeAfterReportRef.current = !game.paused && !game.gameOver;
      archiveRun(game, game.gameOver ? "failure" : "campaign");
      setShowReport(true);
      setGame((current) => ({ ...current, paused: true, reportRecorded: true }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [archiveRun, game, hydrated]);

  const commit = useCallback((transition: (current: GameState) => GameState) => {
    setGame((current) => withFreshMetrics(transition(current)));
  }, []);

  const placeBuilding = useCallback((kind: BuildingKind, x: number, y: number) => {
    const definition = BUILDINGS[kind];
    commit((current) => {
      if (current.rank < definition.unlockRank || current.money < definition.cost) return current;
      if (current.buildings.some((building) => building.x === x && building.y === y)) return current;
      const building: Building = {
        id: nextId(kind, current),
        kind,
        x,
        y,
        level: 1,
        health: 100,
      };
      let next: GameState = {
        ...current,
        money: current.money - definition.cost,
        buildings: [...current.buildings, building],
        events: [
          {
            id: `build-${building.id}`,
            tick: current.tick,
            tone: "info" as const,
            message: `${definition.name} commissioned for ${money(definition.cost)}.`,
          },
          ...current.events,
        ].slice(0, 18),
      };
      next = addManualAchievement(next, "first-build");
      setSelectedId(building.id);
      playTone(520);
      return next;
    });
  }, [commit, playTone]);

  const connectBuildings = useCallback((fromId: string, toId: string) => {
    commit((current) => {
      if (fromId === toId || current.money < CONNECTION_COST) return current;
      const exists = current.connections.some(
        (connection) =>
          (connection.from === fromId && connection.to === toId)
          || (connection.from === toId && connection.to === fromId),
      );
      if (exists) return current;
      const from = current.buildings.find((building) => building.id === fromId);
      const to = current.buildings.find((building) => building.id === toId);
      if (!from || !to) return current;
      let next: GameState = {
        ...current,
        money: current.money - CONNECTION_COST,
        connections: [
          ...current.connections,
          { id: nextId("link", current), from: fromId, to: toId },
        ],
        events: [
          {
            id: `connect-${fromId}-${toId}-${current.tick}`,
            tick: current.tick,
            tone: "good" as const,
            message: `${BUILDINGS[from.kind].shortName} now routes to ${BUILDINGS[to.kind].shortName}.`,
          },
          ...current.events,
        ].slice(0, 18),
      };
      next = addManualAchievement(next, "first-link");
      playTone(680);
      return next;
    });
  }, [commit, playTone]);

  const handleCell = (x: number, y: number, building: Building | undefined) => {
    if (buildMode && !building) {
      placeBuilding(buildMode, x, y);
      return;
    }
    if (!building) {
      setSelectedId(null);
      setConnectFrom(null);
      return;
    }
    if (connectFrom && connectFrom !== building.id) {
      connectBuildings(connectFrom, building.id);
      setConnectFrom(null);
      setSelectedId(building.id);
      return;
    }
    setSelectedId(building.id);
  };

  const upgradeSelected = () => {
    if (!selected || selected.level >= 4) return;
    const cost = calculateUpgradeCost(selected);
    commit((current) => {
      if (current.money < cost) return current;
      return {
        ...current,
        money: current.money - cost,
        buildings: current.buildings.map((building) =>
          building.id === selected.id
            ? { ...building, level: building.level + 1, health: Math.min(100, building.health + 18) }
            : building,
        ),
        events: [
          {
            id: `upgrade-${selected.id}-${current.tick}`,
            tick: current.tick,
            tone: "good" as const,
            message: `${BUILDINGS[selected.kind].name} upgraded to level ${selected.level + 1}.`,
          },
          ...current.events,
        ].slice(0, 18),
      };
    });
    playTone(760);
  };

  const repairIncident = (incidentId: string) => {
    commit((current) => resolveIncident(current, incidentId));
    playTone(620, 0.08);
  };

  const sellSelected = () => {
    if (!selected) return;
    const refund = Math.round(BUILDINGS[selected.kind].cost * 0.55 * (1 + (selected.level - 1) * 0.42));
    commit((current) => {
      const removedIncidents = current.incidents.filter(
        (incident) => incident.buildingId === selected.id,
      );
      const removesCanary = current.release.status === "canary"
        && current.release.targetBuildingId === selected.id;
      return {
        ...current,
        money: current.money + refund,
        buildings: current.buildings.filter((building) => building.id !== selected.id),
        connections: current.connections.filter(
          (connection) => connection.from !== selected.id && connection.to !== selected.id,
        ),
        incidents: current.incidents.filter((incident) => incident.buildingId !== selected.id),
        telemetry: {
          ...current.telemetry,
          incidentsResolved: current.telemetry.incidentsResolved + removedIncidents.length,
          canariesRolledBack: current.telemetry.canariesRolledBack + Number(removesCanary),
          totalResolutionTicks: current.telemetry.totalResolutionTicks
            + removedIncidents.reduce(
              (total, incident) => total + Math.max(0, current.tick - incident.startedAt),
              0,
            ),
        },
        release: removesCanary
          ? { ...current.release, status: "idle" as const, targetBuildingId: null, progress: 0 }
          : current.release,
        events: [
          {
            id: `sell-${selected.id}-${current.tick}`,
            tick: current.tick,
            tone: "info" as const,
            message: `${BUILDINGS[selected.kind].name} decommissioned. ${money(refund)} recovered.`,
          },
          ...current.events,
        ].slice(0, 18),
      };
    });
    setSelectedId(null);
    setConnectFrom(null);
    playTone(260);
  };

  const setRetryPolicy = (retryPolicy: RetryPolicy) => {
    commit((current) => ({
      ...current,
      operations: { ...current.operations, retryPolicy },
    }));
    playTone(retryPolicy === "off" ? 260 : retryPolicy === "bounded" ? 520 : 390);
  };

  const toggleCircuitBreaker = () => {
    commit((current) => ({
      ...current,
      operations: { ...current.operations, circuitBreaker: !current.operations.circuitBreaker },
    }));
    playTone(610, 0.08);
  };

  const toggleAutoscaling = () => {
    commit((current) => ({
      ...current,
      operations: { ...current.operations, autoscaling: !current.operations.autoscaling },
    }));
    playTone(680, 0.08);
  };

  const launchCanary = (buildingId: string) => {
    commit((current) => startCanaryDeployment(current, buildingId));
    playTone(740, 0.1);
  };

  const rollbackCanary = () => {
    commit(rollbackCanaryDeployment);
    playTone(310, 0.08);
  };

  const chooseScenario = (scenario: ScenarioId) => {
    setSelectedScenario(scenario);
    setChallengeInput(createChallengeCode(scenario, selectedSeed));
    setChallengeError("");
  };

  const generateChallenge = () => {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    const seed = values[0];
    setSelectedSeed(seed);
    setChallengeInput(createChallengeCode(selectedScenario, seed));
    setChallengeError("");
    setCopyStatus("");
  };

  const applyChallenge = () => {
    const parsed = parseChallengeCode(challengeInput);
    if (!parsed) {
      setChallengeError("That challenge code is invalid or incomplete.");
      return;
    }
    setSelectedScenario(parsed.scenario);
    setSelectedSeed(parsed.seed);
    setChallengeInput(createChallengeCode(parsed.scenario, parsed.seed));
    setChallengeError("");
    playTone(560, 0.08);
  };

  const copyChallenge = async (code: string) => {
    try {
      await window.navigator.clipboard.writeText(code);
      setCopyStatus("Challenge code copied");
      playTone(700, 0.06);
    } catch {
      setCopyStatus("Copy unavailable — select the code instead");
    }
  };

  const openOperationsReport = () => {
    resumeAfterReportRef.current = !game.paused;
    setGame((current) => ({ ...current, paused: true }));
    setShowSettings(false);
    setShowReport(true);
  };

  const closeOperationsReport = () => {
    setShowReport(false);
    if (!game.gameOver) {
      setGame((current) => ({ ...current, paused: !resumeAfterReportRef.current }));
    }
  };

  const clearRunHistory = () => {
    window.localStorage.removeItem(HISTORY_KEY);
    setRunHistory([]);
    setShowClearHistory(false);
  };

  const startGuidedRun = () => {
    const fresh = createInitialState(selectedScenario, selectedSeed);
    resumeAfterTourRef.current = true;
    setShowIntro(false);
    setShowGuide(false);
    setShowSettings(false);
    setShowReport(false);
    setTourStep(0);
    setGame({ ...fresh, paused: true, tutorialComplete: false });
    setSelectedId("web-1");
    playTone(640, 0.1);
  };

  const continueRun = () => {
    setShowIntro(false);
    setGame((current) => ({ ...current, paused: false }));
    playTone(640, 0.1);
  };

  const startUnguidedRun = () => {
    const fresh = createInitialState(selectedScenario, selectedSeed);
    setShowIntro(false);
    setShowReport(false);
    setGame({ ...fresh, paused: false, tutorialComplete: true });
    setSelectedId("web-1");
    playTone(540, 0.08);
  };

  const replayTour = () => {
    resumeAfterTourRef.current = !game.paused;
    setShowIntro(false);
    setShowGuide(false);
    setShowSettings(false);
    setTourStep(0);
    setGame((current) => ({ ...current, paused: true, tutorialComplete: false }));
  };

  const finishTour = () => {
    setTourStep(null);
    setGame((current) => ({
      ...current,
      paused: !resumeAfterTourRef.current,
      tutorialComplete: false,
    }));
    playTone(720, 0.1);
  };

  const resetGame = () => {
    if (game.tick > 0 && !game.reportRecorded) archiveRun(game, "manual");
    const fresh = createInitialState("growth", DEFAULT_CHALLENGE_SEED);
    window.localStorage.removeItem(SAVE_KEY);
    for (const key of LEGACY_SAVE_KEYS) window.localStorage.removeItem(key);
    setGame(fresh);
    setSelectedScenario("growth");
    setSelectedSeed(DEFAULT_CHALLENGE_SEED);
    setChallengeInput(createChallengeCode("growth", DEFAULT_CHALLENGE_SEED));
    setChallengeError("");
    setCopyStatus("");
    setSelectedId("web-1");
    setBuildMode(null);
    setConnectFrom(null);
    setShowReset(false);
    setShowSettings(false);
    setShowReport(false);
    setShowIntro(true);
    setTourStep(null);
    setLastSavedTick(null);
  };

  const updateSpeed = (speed: GameSpeed) => {
    setGame((current) => ({ ...current, speed: speed === 0 ? current.speed : speed, paused: speed === 0 }));
    playTone(speed === 0 ? 240 : 420 + speed * 70);
  };

  const completeTutorial = () => {
    setGame((current) => ({ ...current, tutorialComplete: true }));
  };

  const boardTone = !game.metrics.routeComplete
    ? "offline"
    : game.metrics.errorRate > 0.08 || game.incidents.some((incident) => incident.severity === "critical")
      ? "critical"
      : game.metrics.saturation > 0.86 || game.incidents.length > 0
        ? "warning"
        : "healthy";

  return (
    <main
      className={`game-shell ${game.settings.reducedMotion ? "reduce-motion" : ""} ${game.settings.highContrast ? "high-contrast" : ""}`}
    >
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span>SC</span></div>
          <div>
            <h1>Stack City</h1>
            <p>Build the infrastructure. Survive the traffic.</p>
          </div>
        </div>

        <div className="top-metrics" aria-label="Live city metrics">
          <div className="metric-block primary">
            <span>Traffic served</span>
            <strong>{compact(game.metrics.served)} <small>/ {compact(game.metrics.traffic)} RPS</small></strong>
          </div>
          <div className="metric-block">
            <span>p95 latency</span>
            <strong className={game.metrics.latency > 250 ? "metric-bad" : ""}>
              {game.metrics.latency ? `${Math.round(game.metrics.latency)} ms` : "—"}
            </strong>
          </div>
          <div className="metric-block">
            <span>Error rate</span>
            <strong className={game.metrics.errorRate > 0.03 ? "metric-bad" : ""}>{percent(game.metrics.errorRate)}</strong>
          </div>
          <div className="metric-block">
            <span>Availability</span>
            <strong>{percent(game.metrics.availability, 2)}</strong>
          </div>
          <div className="metric-block budget">
            <span>Budget</span>
            <strong className={game.money < 3000 ? "metric-bad" : ""}>{money(game.money)}</strong>
          </div>
        </div>

        <div className="top-actions">
          <button className="icon-button" type="button" onClick={() => setShowGuide(true)} aria-label="Open architecture field guide">?</button>
          <button className="icon-button" type="button" onClick={() => setShowSettings((value) => !value)} aria-label="Open settings">⚙</button>
        </div>
      </header>

      <section className="rank-strip" aria-label="Player rank and progress">
        <div className="rank-copy">
          <span className="eyebrow">Rank {game.rank}</span>
          <strong>{RANKS[game.rank - 1].name}</strong>
        </div>
        <div className="rank-progress" aria-label={`${Math.round(rankProgress * 100)} percent to next rank`}>
          <span style={{ width: `${rankProgress * 100}%` }} />
        </div>
        <div className="rank-next">{nextRank ? `${Math.round(game.xp)} / ${nextRank.xp} XP` : "MAX RANK"}</div>
        <div className={`save-state ${saveStatus}`}><span /> {saveStatus === "saving" ? "Saving" : "Saved locally"}</div>
      </section>

      <div className="game-layout">
        <aside className="build-rail" aria-label="Build catalog">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Infrastructure</span>
              <h2>Build catalog</h2>
            </div>
            {buildMode && (
              <button className="text-button" type="button" onClick={() => setBuildMode(null)}>Cancel</button>
            )}
          </div>

          <div className="category-tabs" aria-label="Building categories">
            {CATEGORIES.map((item) => (
              <button
                type="button"
                key={item}
                className={category === item ? "active" : ""}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="building-list">
            {visibleBuildings.map((definition) => {
              const locked = game.rank < definition.unlockRank;
              const unaffordable = game.money < definition.cost;
              return (
                <button
                  className={`building-card ${buildMode === definition.kind ? "selected" : ""}`}
                  type="button"
                  key={definition.kind}
                  onClick={() => {
                    if (locked) return;
                    setBuildMode((current) => current === definition.kind ? null : definition.kind);
                    setConnectFrom(null);
                    playTone(430);
                  }}
                  disabled={locked}
                  aria-pressed={buildMode === definition.kind}
                >
                  <span className="catalog-icon" style={{ "--building-color": definition.color } as CSSProperties}>{definition.code}</span>
                  <span className="catalog-copy">
                    <strong>{definition.name}</strong>
                    <small>{locked ? `Unlocks at rank ${definition.unlockRank}` : definition.role}</small>
                  </span>
                  <span className={`catalog-price ${unaffordable && !locked ? "unaffordable" : ""}`}>{locked ? "LOCKED" : money(definition.cost)}</span>
                </button>
              );
            })}
          </div>

          <div className="build-hint">
            <span className="hint-key">1</span>
            <p><strong>Select a service</strong><br />Then choose an empty city tile.</p>
          </div>
        </aside>

        <section className="city-column">
          <div className="command-bar">
            <div className={`live-state ${boardTone}`}>
              <span className="status-light" />
              <div><small>System status</small><strong>{boardTone === "healthy" ? "All systems nominal" : boardTone === "warning" ? "Capacity at risk" : boardTone === "critical" ? "Incident active" : "Route incomplete"}</strong></div>
            </div>
            <div className="wave-clock">
              <span>Scenario <strong>{scenarioDefinition.name}</strong></span>
              <span>Wave <strong>{game.wave}</strong></span>
              <span>Uptime <strong>{elapsed(game.tick)}</strong></span>
            </div>
            <button className="run-review-button" type="button" onClick={openOperationsReport}>
              <span>AAR</span><strong>Run review</strong>
            </button>
            <div className="speed-control" aria-label="Simulation speed">
              <button type="button" className={game.paused ? "active" : ""} onClick={() => updateSpeed(0)} aria-label="Pause simulation">Ⅱ</button>
              {([1, 2, 4] as const).map((speed) => (
                <button type="button" key={speed} className={!game.paused && game.speed === speed ? "active" : ""} onClick={() => updateSpeed(speed)}>{speed}×</button>
              ))}
            </div>
          </div>

          {buildMode && (
            <div className="mode-banner build-mode" role="status">
              <span className="mode-dot" /> Place {BUILDINGS[buildMode].name} on an empty tile
              <span>{money(BUILDINGS[buildMode].cost)}</span>
            </div>
          )}
          {connectFrom && (
            <div className="mode-banner connect-mode" role="status">
              <span className="mode-dot" /> Choose the downstream service · traffic flows source → target
              <span>{money(CONNECTION_COST)}</span>
            </div>
          )}

          <div className={`city-frame ${boardTone}`}>
            <div className="traffic-source" aria-hidden="true">
              <span className="traffic-label">USERS</span>
              <i /><i /><i />
            </div>
            <div className="city-grid" role="grid" aria-label="Stack City infrastructure map">
              <div className="connection-layer" aria-hidden="true">
                {game.connections.map((connection) => {
                  const from = game.buildings.find((building) => building.id === connection.from);
                  const to = game.buildings.find((building) => building.id === connection.to);
                  if (!from || !to) return null;
                  const isFlowing = connected.has(from.id) && connected.has(to.id) && from.health > 0 && to.health > 0;
                  return (
                    <div className={`connection-line ${isFlowing ? "flowing" : ""}`} key={connection.id} style={connectionGeometry(from, to)}>
                      <span className="flow-pulse one" /><span className="flow-pulse two" /><i className="flow-arrow" />
                    </div>
                  );
                })}
              </div>
              {GRID_CELLS.map(({ x, y }) => {
                const building = game.buildings.find((item) => item.x === x && item.y === y);
                const definition = building ? BUILDINGS[building.kind] : null;
                const isSelected = building?.id === selectedId;
                const isSource = building?.id === connectFrom;
                const hasIncident = building ? incidentBuildingIds.has(building.id) : false;
                const isConnected = building ? connected.has(building.id) : false;
                return (
                  <button
                    type="button"
                    role="gridcell"
                    key={`${x}-${y}`}
                    className={`city-cell ${building ? "occupied" : "empty"} ${buildMode && !building ? "buildable" : ""} ${isSelected ? "selected" : ""} ${isSource ? "connect-source" : ""}`}
                    onClick={() => handleCell(x, y, building)}
                    aria-label={building ? `${definition?.name}, level ${building.level}, ${Math.round(building.health)} percent health${isConnected ? ", reachable from ingress" : ", no directed ingress"}` : buildMode ? `Place ${BUILDINGS[buildMode].name} at column ${x + 1}, row ${y + 1}` : `Empty tile at column ${x + 1}, row ${y + 1}`}
                    style={definition ? { "--building-color": definition.color } as CSSProperties : undefined}
                  >
                    <span className="tile-surface" />
                    {building && definition && (
                      <span className={`city-building level-${building.level} ${hasIncident ? "has-incident" : ""} ${!isConnected ? "isolated" : ""}`}>
                        <span className="building-roof"><b>{definition.code}</b><i /></span>
                        <span className="building-body"><i /><i /><i /></span>
                        <span className="building-name">{definition.shortName}</span>
                        <span className="health-bar"><i style={{ width: `${building.health}%` }} /></span>
                        {hasIncident && <span className="incident-badge" aria-hidden="true">!</span>}
                        {!isConnected && <span className="isolation-badge" aria-hidden="true">×</span>}
                      </span>
                    )}
                    {buildMode && !building && <span className="placement-plus">+</span>}
                  </button>
                );
              })}
            </div>
            <div className="map-legend" aria-hidden="true">
              <span><i className="legend-flow" /> directed requests</span>
              <span><i className="legend-tile" /> buildable zone</span>
            </div>
          </div>

          <div className="observability-strip">
            <div>
              <span>Capacity</span>
              <strong>{Math.round(game.metrics.capacity)} RPS</strong>
              <div className="mini-meter"><i className={game.metrics.saturation > 1 ? "danger" : game.metrics.saturation > 0.82 ? "warn" : ""} style={{ width: `${Math.min(100, game.metrics.saturation * 100)}%` }} /></div>
              {game.metrics.elasticCapacity > 0 && <small>+{Math.round(game.metrics.elasticCapacity)} elastic</small>}
            </div>
            <div><span>Saturation</span><strong>{percent(game.metrics.saturation, 0)}</strong><small>{game.metrics.saturation > 1 ? "OVERLOADED" : game.metrics.saturation > 0.82 ? "HEADROOM LOW" : "HEALTHY"}</small></div>
            <div><span>Recovery</span><strong>{compact(game.metrics.retryRecovery)} RPS</strong><small>{game.metrics.loadShedding > 0 ? `${compact(game.metrics.loadShedding)} SHED` : game.operations.retryPolicy === "off" ? "RETRIES OFF" : "RETRIES ACTIVE"}</small></div>
            <div><span>Net / tick</span><strong className={game.metrics.revenue - game.metrics.operatingCost / 12 < 0 ? "metric-bad" : "metric-good"}>{money(game.metrics.revenue - game.metrics.operatingCost / 12)}</strong><small>{money(game.metrics.operatingCost)} / MIN OPS</small></div>
            <div><span>User satisfaction</span><strong>{Math.round(game.satisfaction)}%</strong><small>{game.satisfaction >= 88 ? "DELIGHTED" : game.satisfaction >= 65 ? "STABLE" : "AT RISK"}</small></div>
          </div>
        </section>

        <aside className="ops-rail" aria-label="Operations and inspector">
          <section className="objective-card">
            <div className="objective-topline"><span className="eyebrow">Mission {Math.min(game.objectiveIndex + 1, OBJECTIVES.length)} / {OBJECTIVES.length}</span><span>+{currentObjective?.xp ?? 0} XP</span></div>
            {currentObjective ? (
              <>
                <h2>{currentObjective.title}</h2>
                <p>{currentObjective.description}</p>
                <div className="objective-reward"><span>Reward</span><strong>{money(currentObjective.reward)}</strong></div>
              </>
            ) : (
              <>
                <h2>Campaign complete</h2>
                <p>Your stack is thriving. Keep scaling in endless mode.</p>
                <div className="objective-reward"><span>Status</span><strong>ARCHITECT</strong></div>
              </>
            )}
          </section>

          {!game.tutorialComplete && (
            <section className="tutorial-card">
              <div className="tutorial-number">01</div>
              <div>
                <span className="eyebrow">Live tutorial</span>
                {!game.buildings.some((building) => building.kind === "cache") ? (
                  <>
                    <h3>Add a Cache Depot</h3>
                    <p>Your database is the first bottleneck. A cache will serve frequent reads faster.</p>
                    <button type="button" className="primary-button compact" onClick={() => { setBuildMode("cache"); setCategory("Data"); }}>Select Cache · {money(BUILDINGS.cache.cost)}</button>
                  </>
                ) : !connected.has(game.buildings.find((building) => building.kind === "cache")?.id ?? "") ? (
                  <>
                    <h3>Connect the cache</h3>
                    <p>Select the upstream API, choose Connect, then choose the Cache Depot.</p>
                  </>
                ) : (
                  <>
                    <h3>Traffic optimized</h3>
                    <p>Watch latency and database pressure fall as the cache hit rate warms up.</p>
                    <button type="button" className="secondary-button compact" onClick={completeTutorial}>Got it</button>
                  </>
                )}
              </div>
            </section>
          )}

          {game.incidents.length > 0 && (
            <section className="incident-stack" aria-label="Active incidents">
              <div className="panel-heading tight"><div><span className="eyebrow alert">On call</span><h2>{game.incidents.length} active incident{game.incidents.length > 1 ? "s" : ""}</h2></div></div>
              {game.incidents.map((incident) => {
                const building = game.buildings.find((item) => item.id === incident.buildingId);
                const repairCost = incidentRepairCost(incident);
                return (
                  <article className={`incident-card ${incident.severity}`} key={incident.id}>
                    <div className="incident-title"><span>!</span><div><strong>{incident.title}</strong><small>{building ? BUILDINGS[building.kind].name : "Unknown service"} · {Math.ceil(incident.remaining / 2)}s</small></div></div>
                    <p>{incident.message}</p>
                    <button type="button" onClick={() => repairIncident(incident.id)} disabled={game.money < repairCost}>Resolve · {money(repairCost)}</button>
                  </article>
                );
              })}
            </section>
          )}

          <ReliabilityConsole
            retryPolicy={game.operations.retryPolicy}
            circuitBreaker={game.operations.circuitBreaker}
            autoscaling={game.operations.autoscaling}
            release={game.release}
            canaryTargets={canaryTargets}
            canAffordCanary={game.money >= 1_200}
            onRetryPolicy={setRetryPolicy}
            onToggleCircuitBreaker={toggleCircuitBreaker}
            onToggleAutoscaling={toggleAutoscaling}
            onStartCanary={launchCanary}
            onRollback={rollbackCanary}
          />

          <FlowObservatory signals={game.metrics.serviceSignals} onSelect={setSelectedId} />

          <section className="inspector-card">
            <div className="panel-heading tight">
              <div><span className="eyebrow">Inspector</span><h2>{selectedDefinition?.name ?? "Select a service"}</h2></div>
              {selectedDefinition && <span className="inspector-code" style={{ "--building-color": selectedDefinition.color } as CSSProperties}>{selectedDefinition.code}</span>}
            </div>
            {selected && selectedDefinition ? (
              <>
                <p className="inspector-role">{selectedDefinition.description}</p>
                <div className="inspector-stats">
                  <div><span>Level</span><strong>{selected.level} / 4</strong></div>
                  <div><span>Health</span><strong>{Math.round(selected.health)}%</strong></div>
                  <div><span>Capacity</span><strong>{Math.round(buildingCapacity(selected))}</strong></div>
                  <div><span>Network</span><strong className={connected.has(selected.id) ? "metric-good" : "metric-bad"}>{connected.has(selected.id) ? "Reachable" : "No ingress"}</strong></div>
                  <div><span>Inbound</span><strong>{selectedSignal ? `${compact(selectedSignal.incoming)} RPS` : "—"}</strong></div>
                  <div><span>Utilization</span><strong className={selectedSignal && selectedSignal.utilization > 0.82 ? "metric-bad" : ""}>{selectedSignal ? percent(selectedSignal.utilization, 0) : "—"}</strong></div>
                </div>
                <div className="inspector-actions">
                  <button type="button" className={connectFrom === selected.id ? "active" : ""} onClick={() => { setConnectFrom((current) => current === selected.id ? null : selected.id); setBuildMode(null); }}>
                    {connectFrom === selected.id ? "Cancel link" : "Connect"} · {money(CONNECTION_COST)}
                  </button>
                  <button type="button" onClick={upgradeSelected} disabled={selected.level >= 4 || game.money < calculateUpgradeCost(selected)}>
                    {selected.level >= 4 ? "Max level" : `Upgrade · ${money(calculateUpgradeCost(selected))}`}
                  </button>
                </div>
                <details className="concept-note">
                  <summary>Why this matters</summary>
                  <p>{selectedDefinition.concept}</p>
                </details>
                <button type="button" className="danger-text-button" onClick={sellSelected}>Decommission · recover 55%</button>
              </>
            ) : (
              <div className="empty-inspector"><span>↖</span><p>Choose a building to inspect health, capacity, upgrades, and architecture guidance.</p></div>
            )}
          </section>

          <section className="architecture-card">
            <div className="score-ring" style={{ "--score": `${game.metrics.architectureScore * 3.6}deg` } as CSSProperties}><strong>{game.metrics.architectureScore}</strong><span>/100</span></div>
            <div><span className="eyebrow">Architecture score</span><h3>{game.metrics.architectureScore >= 80 ? "Resilient system" : game.metrics.architectureScore >= 60 ? "Production ready" : "Growing foundation"}</h3><p>Performance, capabilities, and redundancy.</p></div>
          </section>

          <details className="event-log">
            <summary><span>Event stream</span><small>{game.events.length} records</small></summary>
            <ol>
              {game.events.slice(0, 8).map((event) => <li className={event.tone} key={event.id}><time>{elapsed(event.tick)}</time><span>{event.message}</span></li>)}
            </ol>
          </details>

          <section className="achievement-peek">
            <div><span className="eyebrow">Achievements</span><strong>{unlockedAchievements.length} / {game.achievements.length}</strong></div>
            <div className="achievement-dots" aria-label={`${unlockedAchievements.length} achievements unlocked`}>
              {game.achievements.map((achievement) => <i key={achievement.id} className={achievement.unlockedAt !== undefined ? "unlocked" : ""} title={`${achievement.name}: ${achievement.description}`} />)}
            </div>
          </section>
        </aside>
      </div>

      <footer className="game-footer">
        <span>STACK CITY // LOCAL SIMULATION</span>
        <span>SLO: <b className={game.metrics.availability >= 0.99 ? "metric-good" : "metric-bad"}>{game.metrics.availability >= 0.99 ? "PASSING" : "AT RISK"}</b></span>
        <span>{game.buildings.length} services · {game.connections.length} links</span>
        <span>{lastSavedTick === null ? "New city" : `Last save ${elapsed(lastSavedTick)}`}</span>
        <Link href="/legal">Privacy · Terms · Accessibility</Link>
      </footer>

      {showSettings && (
        <div className="settings-popover" role="dialog" aria-label="Game settings">
          <div className="panel-heading tight"><div><span className="eyebrow">Preferences</span><h2>Game settings</h2></div><button className="close-button" type="button" onClick={() => setShowSettings(false)} aria-label="Close settings">×</button></div>
          <div className="setting-row"><span><strong id="setting-hints-label">Guided hints</strong><small>Contextual next-step coaching</small></span><input id="setting-hints" aria-labelledby="setting-hints-label" type="checkbox" checked={!game.tutorialComplete} onChange={(event) => setGame((current) => ({ ...current, tutorialComplete: !event.target.checked }))} /></div>
          <div className="setting-row"><span><strong id="setting-sound-label">Interface sound</strong><small>Subtle action feedback</small></span><input id="setting-sound" aria-labelledby="setting-sound-label" type="checkbox" checked={game.settings.sound} onChange={(event) => setGame((current) => ({ ...current, settings: { ...current.settings, sound: event.target.checked } }))} /></div>
          <div className="setting-row"><span><strong id="setting-motion-label">Reduced motion</strong><small>Stops request animations</small></span><input id="setting-motion" aria-labelledby="setting-motion-label" type="checkbox" checked={game.settings.reducedMotion} onChange={(event) => setGame((current) => ({ ...current, settings: { ...current.settings, reducedMotion: event.target.checked } }))} /></div>
          <div className="setting-row"><span><strong id="setting-contrast-label">High contrast</strong><small>Strengthens borders and labels</small></span><input id="setting-contrast" aria-labelledby="setting-contrast-label" type="checkbox" checked={game.settings.highContrast} onChange={(event) => setGame((current) => ({ ...current, settings: { ...current.settings, highContrast: event.target.checked } }))} /></div>
          <div className="shortcut-list"><span><kbd>Space</kbd> pause</span><span><kbd>Esc</kbd> cancel tool</span></div>
          <button type="button" className="settings-tour-button" onClick={replayTour}>Replay guided walkthrough</button>
          <button type="button" className="settings-tour-button" onClick={openOperationsReport}>Open operations review</button>
          <Link className="settings-legal-link" href="/legal">Legal &amp; privacy center</Link>
          <button type="button" className="danger-outline-button" onClick={() => setShowReset(true)}>Start a new city</button>
        </div>
      )}

      {showIntro && !game.gameOver && (
        <div className="modal-backdrop">
          <section className="intro-modal" role="dialog" aria-modal="true" aria-labelledby="intro-title">
            <div className="intro-visual" aria-hidden="true">
              <div className="intro-grid">
                <i /><i /><i /><i /><i /><i /><i /><i /><i />
              </div>
              <div className="intro-stack">
                <span className="intro-node dns">DNS</span><b />
                <span className="intro-node web">WEB</span><b />
                <span className="intro-node api">API</span><b />
                <span className="intro-node db">DB</span>
              </div>
              <div className="intro-traffic"><i /><i /><i /></div>
            </div>
            <div className="intro-content">
              <span className="eyebrow">Infrastructure strategy / Season 01</span>
              <h2 id="intro-title">Build the infrastructure.<br /><em>Survive the traffic.</em></h2>
              <p>You’re the mayor of a digital city. Place services, connect the request path, scale bottlenecks, and keep users happy when production gets messy.</p>
              <div className="intro-features">
                <span><b>13</b> service types</span><span><b>3</b> operations drills</span><span><b>Local</b> autosave</span>
              </div>
              {game.tick > 0 ? (
                <div className="intro-actions">
                  <button className="primary-button start-button" type="button" onClick={continueRun}>Continue city<span>→</span></button>
                  <button className="secondary-button" type="button" onClick={replayTour}>Replay walkthrough</button>
                </div>
              ) : (
                <>
                  <div className="scenario-picker" role="radiogroup" aria-labelledby="scenario-picker-title">
                    <div className="scenario-picker-heading">
                      <span className="eyebrow" id="scenario-picker-title">Choose an operations drill</span>
                      <small>{SCENARIOS[selectedScenario].difficulty}</small>
                    </div>
                    {SCENARIO_LIST.map((scenario) => (
                      <button
                        className={selectedScenario === scenario.id ? "selected" : ""}
                        type="button"
                        role="radio"
                        aria-checked={selectedScenario === scenario.id}
                        key={scenario.id}
                        onClick={() => chooseScenario(scenario.id)}
                      >
                        <span><strong>{scenario.name}</strong></span>
                        <b>{scenario.difficulty}</b>
                      </button>
                    ))}
                  </div>
                  <div className="scenario-brief" aria-live="polite">
                    <span>{SCENARIOS[selectedScenario].description}</span>
                    <small>{money(SCENARIOS[selectedScenario].startingMoney)} starting budget</small>
                  </div>
                  <form className="challenge-builder" onSubmit={(event) => { event.preventDefault(); applyChallenge(); }}>
                    <div>
                      <label htmlFor="challenge-code">Deterministic challenge code</label>
                      <span>Same scenario and seed, same production pressure. Stored and shared without player data.</span>
                    </div>
                    <div className="challenge-input-row">
                      <input
                        id="challenge-code"
                        value={challengeInput}
                        onChange={(event) => { setChallengeInput(event.target.value.toUpperCase()); setChallengeError(""); }}
                        aria-invalid={challengeError ? "true" : "false"}
                        aria-describedby="challenge-help"
                        autoComplete="off"
                        maxLength={32}
                        spellCheck={false}
                      />
                      <button type="submit">Load code</button>
                      <button type="button" onClick={generateChallenge}>New seed</button>
                    </div>
                    <div className="challenge-helper" id="challenge-help" aria-live="polite">
                      <span className={challengeError ? "challenge-error" : ""}>{challengeError || createChallengeCode(selectedScenario, selectedSeed)}</span>
                      <button type="button" onClick={() => void copyChallenge(createChallengeCode(selectedScenario, selectedSeed))}>Copy</button>
                    </div>
                  </form>
                  <div className="intro-actions">
                    <button className="primary-button start-button" type="button" onClick={startGuidedRun}>Start guided run<span>→</span></button>
                    <button className="secondary-button" type="button" onClick={startUnguidedRun}>Play without hints</button>
                  </div>
                </>
              )}
              <button className="intro-guide-button" type="button" onClick={() => setShowGuide(true)}>Read the architect’s field guide</button>
              <Link className="intro-legal-link" href="/legal">Privacy · Terms · Accessibility</Link>
            </div>
          </section>
        </div>
      )}

      {tourStep !== null && (
        <div className="tour-backdrop">
          <section
            className={`tour-popover tour-${TOUR_STEPS[tourStep].position}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tour-title"
            aria-describedby="tour-description"
          >
            <div className="tour-signal" aria-hidden="true">
              <span>{TOUR_STEPS[tourStep].signal}</span>
              <i>{String(tourStep + 1).padStart(2, "0")}</i>
            </div>
            <div className="tour-copy">
              <span className="eyebrow">{TOUR_STEPS[tourStep].eyebrow}</span>
              <h2 id="tour-title">{TOUR_STEPS[tourStep].title}</h2>
              <p id="tour-description">{TOUR_STEPS[tourStep].body}</p>
              <div className="tour-hint"><span>Operator note</span><p>{TOUR_STEPS[tourStep].hint}</p></div>
            </div>
            <div className="tour-progress" aria-label={`Walkthrough step ${tourStep + 1} of ${TOUR_STEPS.length}`}>
              {TOUR_STEPS.map((step, index) => (
                <i key={step.signal} className={index <= tourStep ? "active" : ""} />
              ))}
            </div>
            <div className="tour-actions">
              <button className="tour-skip" type="button" onClick={finishTour}>Skip walkthrough</button>
              <div>
                <button className="secondary-button" type="button" onClick={() => setTourStep((current) => current === null ? null : Math.max(0, current - 1))} disabled={tourStep === 0}>Back</button>
                {tourStep === TOUR_STEPS.length - 1 ? (
                  <button className="primary-button" type="button" onClick={finishTour}>Enter the city</button>
                ) : (
                  <button className="primary-button" type="button" onClick={() => setTourStep((current) => current === null ? null : Math.min(TOUR_STEPS.length - 1, current + 1))}>Next <span aria-hidden="true">→</span></button>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {showGuide && (
        <div className="modal-backdrop guide-backdrop">
          <section className="guide-modal" role="dialog" aria-modal="true" aria-labelledby="guide-title">
            <div className="guide-header"><div><span className="eyebrow">Learning mode</span><h2 id="guide-title">Architect’s field guide</h2></div><button className="close-button" type="button" onClick={() => setShowGuide(false)} aria-label="Close field guide">×</button></div>
            <div className="guide-intro"><h3>Every glowing packet tells a story.</h3><p>A healthy request crosses the edge, compute, and data layers. Optional services change how much work reaches each layer and how the system behaves under stress.</p></div>
            <div className="guide-flow" aria-label="Typical request path"><span>USER</span><i>→</i><span>DNS</span><i>→</i><span>WEB</span><i>→</i><span>API</span><i>→</i><span>DATA</span></div>
            <div className="guide-grid">
              <article><span>01 / Capacity</span><h3>Watch the narrowest layer</h3><p>Total throughput is limited by the bottleneck, not the sum of every server. Upgrade or replicate the layer that saturates first.</p></article>
              <article><span>02 / Caching</span><h3>Do less repeated work</h3><p>Caches and CDNs answer frequent requests early. They lower latency and protect stateful origin services.</p></article>
              <article><span>03 / Resilience</span><h3>Remove single points</h3><p>Replicas improve capacity and availability. A load balancer is required to make multiple API servers fully effective.</p></article>
              <article><span>04 / Async</span><h3>Buffer the burst</h3><p>Queues preserve background work during spikes. Workers drain that work without keeping users waiting.</p></article>
              <article><span>05 / Observability</span><h3>See before you repair</h3><p>Monitoring reduces incident impact. The Watchtower represents metrics, logs, traces, and actionable alerts.</p></article>
              <article><span>06 / SLOs</span><h3>Define good service</h3><p>Stack City’s SLO targets 99% availability, under 250 ms p95 latency, and less than 1% errors.</p></article>
              <article><span>07 / Traffic safety</span><h3>Control failure amplification</h3><p>Bounded retries can recover transient failures. Circuit breakers protect unhealthy dependencies by shedding excess work before it cascades.</p></article>
              <article><span>08 / Delivery</span><h3>Release through a canary</h3><p>Send a small traffic slice to a new compute revision, watch its service trace, then let it promote or roll it back safely.</p></article>
            </div>
            <button className="primary-button" type="button" onClick={() => setShowGuide(false)}>Return to the city</button>
          </section>
        </div>
      )}

      {showReport && (
        <div className="modal-backdrop report-backdrop">
          <section className="operations-report" role="dialog" aria-modal="true" aria-labelledby="report-title">
            <header className="report-header">
              <div>
                <span className="eyebrow">After-action operations review</span>
                <h2 id="report-title">{game.gameOver ? "Outage postmortem" : game.objectiveIndex >= OBJECTIVES.length ? "Campaign debrief" : "Live run analysis"}</h2>
                <p>{scenarioDefinition.name} · wave {game.wave} · {elapsed(game.tick)}</p>
              </div>
              {!game.gameOver && <button className="close-button" type="button" onClick={closeOperationsReport} aria-label="Close operations review">×</button>}
            </header>

            <div className="report-hero">
              <div className={`report-grade grade-${operationsReport.grade.toLowerCase()}`}>
                <span>Operator grade</span>
                <strong>{operationsReport.grade}</strong>
                <small>{operationsReport.score} / 100</small>
              </div>
              <div className="report-brief">
                <span className="eyebrow">Primary constraint</span>
                <h3>{operationsReport.bottleneck.label}</h3>
                <p>{operationsReport.bottleneck.explanation}</p>
                <div><span>{Math.round(operationsReport.bottleneck.capacity)} RPS capacity</span><span>{percent(operationsReport.bottleneck.utilization, 0)} utilized</span></div>
              </div>
              <div className="report-code">
                <span className="eyebrow">Replay this pressure profile</span>
                <code>{challengeCode}</code>
                <button type="button" onClick={() => void copyChallenge(challengeCode)}>Copy challenge code</button>
                <small aria-live="polite">{copyStatus || "Code contains only scenario and seed."}</small>
              </div>
            </div>

            <div className="report-kpis" aria-label="Run performance summary">
              <article><span>Avg availability</span><strong className={operationsReport.averageAvailability >= 0.99 ? "metric-good" : "metric-bad"}>{percent(operationsReport.averageAvailability, 2)}</strong><small>Target 99.00%</small></article>
              <article><span>SLO compliance</span><strong>{percent(operationsReport.sloCompliance, 0)}</strong><small>Availability · latency · errors</small></article>
              <article><span>Error-budget burn</span><strong className={operationsReport.errorBudgetBurn <= 1 ? "metric-good" : "metric-bad"}>{operationsReport.errorBudgetBurn.toFixed(1)}×</strong><small>{operationsReport.errorBudgetBurn <= 1 ? "Within budget" : "Budget overspent"}</small></article>
              <article><span>Incidents</span><strong>{game.telemetry.incidentsStarted}</strong><small>{game.telemetry.incidentsAutoRecovered} auto-recovered</small></article>
              <article><span>Mean recovery</span><strong>{operationsReport.meanTimeToRecoverySeconds ? `${operationsReport.meanTimeToRecoverySeconds.toFixed(1)}s` : "—"}</strong><small>{game.telemetry.incidentsResolved} resolved</small></article>
              <article><span>Cost / 1k requests</span><strong>{operationsReport.costPerThousandRequests ? money(operationsReport.costPerThousandRequests) : "—"}</strong><small>{money(game.lifetimeRevenue)} revenue</small></article>
            </div>

            <div className="report-grid">
              <section className="architecture-trace" aria-labelledby="architecture-trace-title">
                <div className="report-section-heading">
                  <div><span className="eyebrow">Architecture trace</span><h3 id="architecture-trace-title">Score over time</h3></div>
                  <strong className={operationsReport.architectureTrend >= 0 ? "metric-good" : "metric-bad"}>{operationsReport.architectureTrend >= 0 ? "+" : ""}{operationsReport.architectureTrend}</strong>
                </div>
                <ol aria-label="Recent architecture score samples">
                  {reportSamples.map((sample) => (
                    <li key={sample.tick} title={`${elapsed(sample.tick)} · score ${sample.architectureScore}`}>
                      <i style={{ height: `${Math.max(5, sample.architectureScore)}%` }} />
                      <span>{sample.architectureScore}</span>
                    </li>
                  ))}
                </ol>
                <small>Sampled every six simulated seconds · current score {game.metrics.architectureScore}</small>
              </section>

              <section className="report-recommendations" aria-labelledby="recommendations-title">
                <span className="eyebrow">Next deployment plan</span>
                <h3 id="recommendations-title">Operator recommendations</h3>
                <ol>
                  {operationsReport.recommendations.map((recommendation, index) => (
                    <li key={recommendation}><span>{String(index + 1).padStart(2, "0")}</span><p>{recommendation}</p></li>
                  ))}
                </ol>
              </section>
            </div>

            <section className="run-history" aria-labelledby="run-history-title">
              <div className="report-section-heading">
                <div><span className="eyebrow">Private runbook</span><h3 id="run-history-title">Local run history</h3></div>
                <div className="run-history-meta">
                  <small>{runHistory.length} / 12 saved on this device</small>
                  <button type="button" onClick={() => setShowClearHistory(true)} disabled={runHistory.length === 0}>Clear history</button>
                </div>
              </div>
              {runHistory.length > 0 ? (
                <ol>
                  {runHistory.slice(0, 5).map((summary) => (
                    <li key={summary.id}>
                      <span className={`history-grade grade-${summary.grade.toLowerCase()}`}>{summary.grade}</span>
                      <span><strong>{SCENARIOS[summary.scenario].name}</strong><small>{summary.reason === "campaign" ? "Campaign complete" : summary.reason === "failure" ? "Outage" : "Run retired"} · {elapsed(summary.durationTicks)}</small></span>
                      <span><strong>{summary.score}</strong><small>score</small></span>
                      <span><strong>{summary.incidentCount}</strong><small>incidents</small></span>
                      <code>{summary.challengeCode}</code>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="empty-history">Complete the campaign, lose the city, or start over to archive the first summary.</p>
              )}
              <p className="privacy-note">Run summaries never leave this browser. Challenge codes contain only the scenario and deterministic simulation seed.</p>
            </section>

            <footer className="report-actions">
              {!game.gameOver && <button className="secondary-button" type="button" onClick={closeOperationsReport}>{game.objectiveIndex >= OBJECTIVES.length ? "Continue in endless mode" : "Return to city"}</button>}
              <button className="primary-button" type="button" onClick={resetGame}>{game.gameOver ? "Rebuild the city" : "Start a new challenge"}</button>
            </footer>
          </section>
        </div>
      )}

      {showReset && (
        <div className="modal-backdrop confirm-backdrop">
          <section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="reset-title">
            <span className="warning-mark">!</span>
            <h2 id="reset-title">Start a new city?</h2>
            <p>This replaces the current local save. Your existing city cannot be recovered.</p>
            <div><button className="secondary-button" type="button" onClick={() => setShowReset(false)}>Keep city</button><button className="danger-button" type="button" onClick={resetGame}>Start over</button></div>
          </section>
        </div>
      )}

      {showClearHistory && (
        <div className="modal-backdrop confirm-backdrop">
          <section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="clear-history-title">
            <span className="warning-mark">!</span>
            <h2 id="clear-history-title">Clear local run history?</h2>
            <p>This permanently removes all saved after-action summaries from this browser. Your active city will stay intact.</p>
            <div><button className="secondary-button" type="button" onClick={() => setShowClearHistory(false)}>Keep history</button><button className="danger-button" type="button" onClick={clearRunHistory}>Clear history</button></div>
          </section>
        </div>
      )}

      <div className="sr-live" aria-live="polite">{game.events[0]?.message}</div>
    </main>
  );
}
