export const BUILDING_KINDS = [
  "dns",
  "cdn",
  "frontend",
  "loadBalancer",
  "api",
  "auth",
  "cache",
  "database",
  "queue",
  "worker",
  "storage",
  "search",
  "monitoring",
] as const;

export type BuildingKind = (typeof BUILDING_KINDS)[number];
export type BuildingCategory = "Edge" | "Compute" | "Data" | "Platform";
export type Severity = "warning" | "critical";
export type GameSpeed = 0 | 1 | 2 | 4;
export type ScenarioId = "growth" | "launch-day" | "chaos-lab";

export interface ScenarioDefinition {
  id: ScenarioId;
  name: string;
  difficulty: "Standard" | "Advanced" | "Expert";
  description: string;
  startingMoney: number;
  baseTraffic: number;
  trafficGrowth: number;
  waveTraffic: number;
  incidentRisk: number;
  revenueMultiplier: number;
}

export interface BuildingDefinition {
  kind: BuildingKind;
  name: string;
  shortName: string;
  code: string;
  category: BuildingCategory;
  role: string;
  description: string;
  concept: string;
  color: string;
  cost: number;
  upkeep: number;
  capacity: number;
  latency: number;
  reliability: number;
  unlockRank: number;
}

export interface Building {
  id: string;
  kind: BuildingKind;
  x: number;
  y: number;
  level: number;
  health: number;
}

export interface Connection {
  id: string;
  from: string;
  to: string;
}

export interface Incident {
  id: string;
  buildingId: string;
  title: string;
  message: string;
  severity: Severity;
  remaining: number;
  startedAt: number;
}

export interface GameEvent {
  id: string;
  tick: number;
  tone: "info" | "good" | "bad";
  message: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlockedAt?: number;
}

export interface Metrics {
  traffic: number;
  served: number;
  capacity: number;
  saturation: number;
  latency: number;
  errorRate: number;
  availability: number;
  cacheHitRate: number;
  routeComplete: boolean;
  operatingCost: number;
  revenue: number;
  architectureScore: number;
}

export interface TelemetrySample {
  tick: number;
  architectureScore: number;
  availability: number;
  latency: number;
  errorRate: number;
}

export interface RunTelemetry {
  sampleCount: number;
  totalDemand: number;
  totalServed: number;
  totalOperatingCost: number;
  availabilityTotal: number;
  availabilitySloTicks: number;
  latencySloTicks: number;
  errorSloTicks: number;
  incidentsStarted: number;
  incidentsResolved: number;
  incidentsAutoRecovered: number;
  totalResolutionTicks: number;
  peakTraffic: number;
  peakLatency: number;
  peakSaturation: number;
  minimumAvailability: number;
  architectureHistory: TelemetrySample[];
}

export type BottleneckKind = "route" | "frontend" | "api" | "database";

export interface BottleneckAnalysis {
  kind: BottleneckKind;
  label: string;
  capacity: number;
  utilization: number;
  explanation: string;
}

export type RunEndReason = "live" | "campaign" | "failure" | "manual";

export interface OperationsReport {
  grade: "S" | "A" | "B" | "C" | "D";
  score: number;
  averageAvailability: number;
  sloCompliance: number;
  errorBudgetBurn: number;
  meanTimeToRecoverySeconds: number;
  costPerThousandRequests: number;
  architectureTrend: number;
  bottleneck: BottleneckAnalysis;
  recommendations: string[];
}

export interface RunSummary {
  id: string;
  endedAt: number;
  reason: Exclude<RunEndReason, "live">;
  scenario: ScenarioId;
  challengeSeed: number;
  challengeCode: string;
  durationTicks: number;
  peakWave: number;
  missionsCompleted: number;
  grade: OperationsReport["grade"];
  score: number;
  averageAvailability: number;
  errorBudgetBurn: number;
  incidentCount: number;
  meanTimeToRecoverySeconds: number;
  costPerThousandRequests: number;
  architectureScore: number;
  lifetimeRevenue: number;
}

export interface ObjectiveDefinition {
  id: string;
  title: string;
  description: string;
  reward: number;
  xp: number;
}

export interface GameSettings {
  sound: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
}

export interface GameState {
  version: 3;
  scenario: ScenarioId;
  challengeSeed: number;
  seed: number;
  tick: number;
  money: number;
  lifetimeRevenue: number;
  satisfaction: number;
  xp: number;
  rank: number;
  wave: number;
  paused: boolean;
  speed: GameSpeed;
  buildings: Building[];
  connections: Connection[];
  incidents: Incident[];
  events: GameEvent[];
  achievements: Achievement[];
  objectiveIndex: number;
  tutorialComplete: boolean;
  gameOver: boolean;
  reportRecorded: boolean;
  metrics: Metrics;
  telemetry: RunTelemetry;
  settings: GameSettings;
}
