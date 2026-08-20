"use client";

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
} from "./catalog.ts";
import {
  addManualAchievement,
  buildingCapacity,
  calculateMetrics,
  connectedBuildingIds,
  createInitialState,
  isValidGameState,
  nextId,
  simulateTick,
} from "./engine.ts";
import type {
  Building,
  BuildingCategory,
  BuildingKind,
  GameSpeed,
  GameState,
} from "./types.ts";

const SAVE_KEY = "stack-city-save-v1";
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
    body: "A building does nothing while isolated. Select it, choose Connect in the inspector, then choose its neighbor to create a live request path.",
    hint: "A complete core route runs WEB → API → DATA. Links cost $250.",
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
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [lastSavedTick, setLastSavedTick] = useState<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const resumeAfterTourRef = useRef(true);

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
        const raw = window.localStorage.getItem(SAVE_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (isValidGameState(parsed)) {
            const restored = withFreshMetrics({ ...parsed, paused: true });
            setGame(restored);
            setLastSavedTick(restored.tick);
          }
        }
      } catch {
        window.localStorage.removeItem(SAVE_KEY);
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
        setLastSavedTick(game.tick);
      } catch {
        // Storage can be unavailable in private or restricted browsing modes.
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [game, hydrated]);

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
  }, [showIntro, tourStep]);

  const connected = useMemo(
    () => connectedBuildingIds(game.buildings, game.connections),
    [game.buildings, game.connections],
  );
  const selected = game.buildings.find((building) => building.id === selectedId) ?? null;
  const selectedDefinition = selected ? BUILDINGS[selected.kind] : null;
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
            message: `${BUILDINGS[from.kind].shortName} linked to ${BUILDINGS[to.kind].shortName}.`,
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
    commit((current) => {
      const incident = current.incidents.find((item) => item.id === incidentId);
      if (!incident) return current;
      const cost = incident.severity === "critical" ? 900 : 450;
      if (current.money < cost) return current;
      let next: GameState = {
        ...current,
        money: current.money - cost,
        incidents: current.incidents.filter((item) => item.id !== incidentId),
        buildings: current.buildings.map((building) =>
          building.id === incident.buildingId
            ? { ...building, health: Math.min(100, building.health + 26) }
            : building,
        ),
        events: [
          {
            id: `resolved-${incident.id}`,
            tick: current.tick,
            tone: "good" as const,
            message: `${incident.title} resolved by the on-call team.`,
          },
          ...current.events,
        ].slice(0, 18),
      };
      next = addManualAchievement(next, "incident");
      return next;
    });
    playTone(620, 0.08);
  };

  const sellSelected = () => {
    if (!selected) return;
    const refund = Math.round(BUILDINGS[selected.kind].cost * 0.55 * (1 + (selected.level - 1) * 0.42));
    commit((current) => ({
      ...current,
      money: current.money + refund,
      buildings: current.buildings.filter((building) => building.id !== selected.id),
      connections: current.connections.filter(
        (connection) => connection.from !== selected.id && connection.to !== selected.id,
      ),
      incidents: current.incidents.filter((incident) => incident.buildingId !== selected.id),
      events: [
        {
          id: `sell-${selected.id}-${current.tick}`,
          tick: current.tick,
          tone: "info" as const,
          message: `${BUILDINGS[selected.kind].name} decommissioned. ${money(refund)} recovered.`,
        },
        ...current.events,
      ].slice(0, 18),
    }));
    setSelectedId(null);
    setConnectFrom(null);
    playTone(260);
  };

  const startGuidedRun = () => {
    resumeAfterTourRef.current = true;
    setShowIntro(false);
    setShowGuide(false);
    setShowSettings(false);
    setTourStep(0);
    setGame((current) => ({ ...current, paused: true, tutorialComplete: false }));
    playTone(640, 0.1);
  };

  const continueRun = () => {
    setShowIntro(false);
    setGame((current) => ({ ...current, paused: false }));
    playTone(640, 0.1);
  };

  const startUnguidedRun = () => {
    setShowIntro(false);
    setGame((current) => ({ ...current, paused: false, tutorialComplete: true }));
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
    const fresh = createInitialState();
    window.localStorage.removeItem(SAVE_KEY);
    setGame(fresh);
    setSelectedId("web-1");
    setBuildMode(null);
    setConnectFrom(null);
    setShowReset(false);
    setShowSettings(false);
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
              <span>Wave <strong>{game.wave}</strong></span>
              <span>Uptime <strong>{elapsed(game.tick)}</strong></span>
            </div>
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
              <span className="mode-dot" /> Choose another service to connect
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
                      <span className="flow-pulse one" /><span className="flow-pulse two" />
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
                    aria-label={building ? `${definition?.name}, level ${building.level}, ${Math.round(building.health)} percent health${isConnected ? ", connected" : ", isolated"}` : buildMode ? `Place ${BUILDINGS[buildMode].name} at column ${x + 1}, row ${y + 1}` : `Empty tile at column ${x + 1}, row ${y + 1}`}
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
              <span><i className="legend-flow" /> live requests</span>
              <span><i className="legend-tile" /> buildable zone</span>
            </div>
          </div>

          <div className="observability-strip">
            <div>
              <span>Capacity</span>
              <strong>{Math.round(game.metrics.capacity)} RPS</strong>
              <div className="mini-meter"><i className={game.metrics.saturation > 1 ? "danger" : game.metrics.saturation > 0.82 ? "warn" : ""} style={{ width: `${Math.min(100, game.metrics.saturation * 100)}%` }} /></div>
            </div>
            <div><span>Saturation</span><strong>{percent(game.metrics.saturation, 0)}</strong><small>{game.metrics.saturation > 1 ? "OVERLOADED" : game.metrics.saturation > 0.82 ? "HEADROOM LOW" : "HEALTHY"}</small></div>
            <div><span>Cache hit</span><strong>{percent(game.metrics.cacheHitRate, 0)}</strong><small>{game.metrics.cacheHitRate > 0 ? "DB OFFLOAD" : "NO CACHE"}</small></div>
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
                    <p>Select the Cache Depot, choose Connect, then choose the API or Database.</p>
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
                const repairCost = incident.severity === "critical" ? 900 : 450;
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
                  <div><span>Network</span><strong className={connected.has(selected.id) ? "metric-good" : "metric-bad"}>{connected.has(selected.id) ? "Linked" : "Isolated"}</strong></div>
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
          <button type="button" className="danger-outline-button" onClick={() => setShowReset(true)}>Start a new city</button>
        </div>
      )}

      {showIntro && (
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
                <span><b>13</b> service types</span><span><b>Guided</b> first run</span><span><b>Local</b> autosave</span>
              </div>
              {game.tick > 0 ? (
                <div className="intro-actions">
                  <button className="primary-button start-button" type="button" onClick={continueRun}>Continue city<span>→</span></button>
                  <button className="secondary-button" type="button" onClick={replayTour}>Replay walkthrough</button>
                </div>
              ) : (
                <div className="intro-actions">
                  <button className="primary-button start-button" type="button" onClick={startGuidedRun}>Start guided run<span>→</span></button>
                  <button className="secondary-button" type="button" onClick={startUnguidedRun}>Play without hints</button>
                </div>
              )}
              <button className="intro-guide-button" type="button" onClick={() => setShowGuide(true)}>Read the architect’s field guide</button>
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
            </div>
            <button className="primary-button" type="button" onClick={() => setShowGuide(false)}>Return to the city</button>
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

      {game.gameOver && (
        <div className="modal-backdrop">
          <section className="confirm-modal game-over-modal" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
            <span className="eyebrow alert">Service unavailable</span>
            <h2 id="game-over-title">The city went dark.</h2>
            <p>{game.money < -4500 ? "Operating costs exhausted the emergency budget." : "User satisfaction collapsed after sustained outages."} Review the bottleneck and try a safer architecture.</p>
            <div className="game-over-stats"><span><small>Peak wave</small><strong>{game.wave}</strong></span><span><small>Revenue</small><strong>{money(game.lifetimeRevenue)}</strong></span><span><small>Score</small><strong>{game.metrics.architectureScore}</strong></span></div>
            <button className="primary-button" type="button" onClick={resetGame}>Rebuild the city</button>
          </section>
        </div>
      )}

      <div className="sr-live" aria-live="polite">{game.events[0]?.message}</div>
    </main>
  );
}
