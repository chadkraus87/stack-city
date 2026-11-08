"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CAMPAIGN_PACKS, SCENARIOS, SCENARIO_LIST } from "./catalog.ts";
import {
  createWorkshopCode,
  parseWorkshopCode,
  restoreWorkshopScenario,
} from "./engine.ts";
import type {
  RunSummary,
  ScenarioId,
  WorkshopScenario,
} from "./types.ts";

export type CampaignSelection = `scenario:${ScenarioId}` | "daily" | "workshop";

export function CampaignMap({
  selection,
  daily,
  workshop,
  history,
  onScenario,
  onDaily,
  onWorkshop,
}: {
  selection: CampaignSelection;
  daily: { date: string; scenario: ScenarioId; code: string } | null;
  workshop: WorkshopScenario | null;
  history: RunSummary[];
  onScenario: (scenario: ScenarioId) => void;
  onDaily: () => void;
  onWorkshop: () => void;
}) {
  const completedScenarios = new Set(
    history.filter((run) => run.reason === "campaign").map((run) => run.scenario),
  );
  const dailyComplete = daily
    ? history.some((run) => run.reason === "campaign" && run.challengeCode === daily.code)
    : false;
  const workshopComplete = history.some(
    (run) => run.reason === "campaign" && run.challengeCode.startsWith("SW1-"),
  );

  return (
    <section className="campaign-map" aria-labelledby="campaign-map-title">
      <div className="campaign-map-heading">
        <div>
          <span className="eyebrow">Operations campaign</span>
          <h3 id="campaign-map-title">Choose the next pressure profile</h3>
        </div>
        <small>{completedScenarios.size} / {SCENARIO_LIST.length} core drills completed</small>
      </div>
      <div className="campaign-packs">
        {CAMPAIGN_PACKS.map((pack, packIndex) => {
          const completedInPack = pack.scenarioIds.filter((id) => completedScenarios.has(id)).length;
          return (
            <section className="campaign-pack" aria-labelledby={`campaign-pack-${pack.id}`} key={pack.id}>
              <div className="campaign-pack-heading">
                <span>Pack {String(packIndex + 1).padStart(2, "0")}</span>
                <div><strong id={`campaign-pack-${pack.id}`}>{pack.name}</strong><small>{pack.description}</small></div>
                <b>{completedInPack}/{pack.scenarioIds.length}</b>
              </div>
              <div className="campaign-route" role="group" aria-label={`${pack.name} scenarios`}>
                {pack.scenarioIds.map((scenarioId, scenarioIndex) => {
                  const scenario = SCENARIOS[scenarioId];
                  const selected = selection === `scenario:${scenario.id}`;
                  const complete = completedScenarios.has(scenario.id);
                  return (
                    <button
                      className={`campaign-node ${selected ? "selected" : ""}`}
                      type="button"
                      aria-pressed={selected}
                      key={scenario.id}
                      onClick={() => onScenario(scenario.id)}
                    >
                      <span className="campaign-node-index">{packIndex + 1}.{scenarioIndex + 1}</span>
                      <span><strong>{scenario.name}</strong><small>{scenario.difficulty}</small></span>
                      <b>{complete ? "✓ Complete" : "Open"}</b>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <div className="campaign-utilities" role="group" aria-label="Daily and custom scenarios">
        <button
          className={`campaign-node daily ${selection === "daily" ? "selected" : ""}`}
          type="button"
          aria-pressed={selection === "daily"}
          disabled={!daily}
          onClick={onDaily}
        >
          <span className="campaign-node-index">D</span>
          <span><strong>Daily incident</strong><small>{daily ? SCENARIOS[daily.scenario].name : "Loading local date"}</small></span>
          <b>{dailyComplete ? "✓ Complete" : "Today"}</b>
        </button>
        <button
          className={`campaign-node workshop ${selection === "workshop" ? "selected" : ""}`}
          type="button"
          aria-pressed={selection === "workshop"}
          onClick={onWorkshop}
        >
          <span className="campaign-node-index">+</span>
          <span><strong>{workshop?.name ?? "Scenario Workshop"}</strong><small>{workshop ? "Custom drill ready" : "Build or import a drill"}</small></span>
          <b>{workshopComplete ? "✓ Complete" : workshop ? "Edit" : "Create"}</b>
        </button>
      </div>
    </section>
  );
}

function numberValue(value: string): number {
  return value === "" ? Number.NaN : Number(value);
}

export function ScenarioWorkshop({
  initialDraft,
  seed,
  onDraftChange,
  onSelect,
  onClose,
}: {
  initialDraft: WorkshopScenario;
  seed: number;
  onDraftChange: (draft: WorkshopScenario) => void;
  onSelect: (workshop: WorkshopScenario, seed: number) => void;
  onClose: () => void;
}) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [draft, setDraft] = useState(initialDraft);
  const [importCode, setImportCode] = useState("");
  const [message, setMessage] = useState("");
  const validDraft = restoreWorkshopScenario(draft);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const update = <Key extends keyof WorkshopScenario>(
    key: Key,
    value: WorkshopScenario[Key],
  ) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    const safe = restoreWorkshopScenario(next);
    if (safe) onDraftChange(safe);
    setMessage("");
  };

  const importScenario = () => {
    const parsed = parseWorkshopCode(importCode);
    if (!parsed) {
      setMessage("That Workshop code is invalid, incomplete, or outside safe limits.");
      return;
    }
    setDraft(parsed.workshop);
    onDraftChange(parsed.workshop);
    onSelect(parsed.workshop, parsed.seed);
    setMessage("Workshop code validated and selected.");
  };

  return (
    <div className="modal-backdrop workshop-backdrop">
      <section className="workshop-modal" role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <header className="workshop-header">
          <div>
            <span className="eyebrow">Local scenario tools</span>
            <h2 id={headingId} ref={headingRef} tabIndex={-1}>Scenario Workshop</h2>
            <p>Build a bounded, deterministic drill without an account or server.</p>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label="Close Scenario Workshop">×</button>
        </header>

        <div className="workshop-layout">
          <form className="workshop-form" onSubmit={(event) => {
            event.preventDefault();
            if (validDraft) onSelect(validDraft, seed);
          }}>
            <div className="workshop-field wide">
              <label htmlFor="workshop-name">Local title</label>
              <input id="workshop-name" value={draft.name} maxLength={32} required onChange={(event) => update("name", event.target.value)} />
              <small>This title stays on this device and is never included in share codes.</small>
            </div>
            <div className="workshop-field">
              <label htmlFor="workshop-template">Campaign template</label>
              <select id="workshop-template" value={draft.template} onChange={(event) => update("template", event.target.value as ScenarioId)}>
                {SCENARIO_LIST.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
              </select>
            </div>
            <div className="workshop-field">
              <label htmlFor="workshop-deck">Incident deck</label>
              <select id="workshop-deck" value={draft.incidentDeck} onChange={(event) => update("incidentDeck", event.target.value as WorkshopScenario["incidentDeck"])}>
                <option value="mixed">Mixed systems</option>
                <option value="compute">Compute failures</option>
                <option value="data">Data failures</option>
                <option value="network">Network &amp; platform</option>
              </select>
            </div>
            <div className="workshop-field">
              <label htmlFor="workshop-budget">Starting budget</label>
              <input id="workshop-budget" type="number" min="12000" max="80000" step="500" value={draft.startingMoney} onChange={(event) => update("startingMoney", numberValue(event.target.value))} />
            </div>
            <div className="workshop-field">
              <label htmlFor="workshop-traffic">Base traffic · RPS</label>
              <input id="workshop-traffic" type="number" min="20" max="120" step="1" value={draft.baseTraffic} onChange={(event) => update("baseTraffic", numberValue(event.target.value))} />
            </div>
            <div className="workshop-field">
              <label htmlFor="workshop-growth">Traffic growth / tick</label>
              <input id="workshop-growth" type="number" min="0.05" max="0.6" step="0.01" value={draft.trafficGrowth} onChange={(event) => update("trafficGrowth", numberValue(event.target.value))} />
            </div>
            <div className="workshop-field">
              <label htmlFor="workshop-wave">Wave traffic</label>
              <input id="workshop-wave" type="number" min="8" max="60" step="1" value={draft.waveTraffic} onChange={(event) => update("waveTraffic", numberValue(event.target.value))} />
            </div>
            <div className="workshop-field">
              <label htmlFor="workshop-risk">Incident pressure</label>
              <input id="workshop-risk" type="number" min="0.5" max="3" step="0.1" value={draft.incidentRisk} onChange={(event) => update("incidentRisk", numberValue(event.target.value))} />
            </div>
            <div className="workshop-field">
              <label htmlFor="workshop-revenue">Revenue multiplier</label>
              <input id="workshop-revenue" type="number" min="0.6" max="1.8" step="0.01" value={draft.revenueMultiplier} onChange={(event) => update("revenueMultiplier", numberValue(event.target.value))} />
            </div>
            <div className="workshop-field">
              <label htmlFor="workshop-buildings">Building limit</label>
              <input id="workshop-buildings" type="number" min="4" max="48" step="1" value={draft.maxBuildings} onChange={(event) => update("maxBuildings", numberValue(event.target.value))} />
            </div>
            <div className="workshop-field">
              <label htmlFor="workshop-level">Maximum service level</label>
              <input id="workshop-level" type="number" min="1" max="4" step="1" value={draft.maxLevel} onChange={(event) => update("maxLevel", numberValue(event.target.value))} />
            </div>
            <div className="workshop-check wide">
              <input id="workshop-autoscaling" type="checkbox" aria-describedby="workshop-autoscaling-help" checked={draft.autoscalingAllowed} onChange={(event) => update("autoscalingAllowed", event.target.checked)} />
              <span><label htmlFor="workshop-autoscaling">Allow compute autoscaling</label><small id="workshop-autoscaling-help">When disabled, players must provision all capacity manually.</small></span>
            </div>
            <div className="workshop-summary wide">
              <span>Privacy-safe share code</span>
              <code>{validDraft ? createWorkshopCode(validDraft, seed) : "Fix the highlighted browser validation errors to create a code."}</code>
            </div>
            <div className="workshop-actions wide">
              <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
              <button className="primary-button" type="submit" disabled={!validDraft}>Save &amp; select drill</button>
            </div>
          </form>

          <aside className="workshop-import" aria-labelledby="workshop-import-title">
            <span className="eyebrow">Shared drill</span>
            <h3 id="workshop-import-title">Import a Workshop code</h3>
            <p>Codes are checksum-validated and cannot carry scripts, URLs, names, or player data.</p>
            <label htmlFor="workshop-code">Workshop code</label>
            <textarea id="workshop-code" rows={5} maxLength={128} spellCheck={false} autoComplete="off" value={importCode} onChange={(event) => { setImportCode(event.target.value.toUpperCase()); setMessage(""); }} />
            <button type="button" onClick={importScenario}>Validate &amp; select</button>
            <small className={message.startsWith("That") ? "challenge-error" : ""} aria-live="polite">{message || "Only SW1 codes are accepted here."}</small>
          </aside>
        </div>
      </section>
    </div>
  );
}
