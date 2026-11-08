"use client";

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { SCENARIOS } from "./catalog.ts";
import { parseReplayCode } from "./replay.ts";
import type {
  GameState,
  OperationsReport,
  ReplayRecording,
} from "./types.ts";

function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function copyText(value: string): Promise<boolean> {
  try {
    await window.navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function ReplayLab({
  currentCode,
  currentActionCount,
  currentEndTick,
  onClose,
  onPlay,
}: {
  currentCode: string;
  currentActionCount: number;
  currentEndTick: number;
  onClose: () => void;
  onPlay: (recording: ReplayRecording) => void;
}) {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [importCode, setImportCode] = useState("");
  const [message, setMessage] = useState("");
  const deferredImportCode = useDeferredValue(importCode);
  const parsed = useMemo(
    () => deferredImportCode ? parseReplayCode(deferredImportCode) : null,
    [deferredImportCode],
  );
  const validationPending = deferredImportCode !== importCode;

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const copyReplay = async () => {
    setMessage(await copyText(currentCode)
      ? "Replay code copied. It contains game actions and bounded simulation data only."
      : "Clipboard access is unavailable. Download the replay file instead.");
  };

  return (
    <div className="modal-backdrop replay-backdrop">
      <section className="replay-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="replay-header">
          <div>
            <span className="eyebrow">Deterministic operator tape</span>
            <h2 id={titleId} ref={titleRef} tabIndex={-1}>Run replay lab</h2>
            <p>Export the decisions behind a run or reconstruct another player&apos;s strategy tick by tick.</p>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label="Close replay lab">×</button>
        </header>
        <div className="replay-layout">
          <section className="replay-export" aria-labelledby="replay-export-title">
            <span className="eyebrow">Current run</span>
            <h3 id="replay-export-title">Share this operator tape</h3>
            <div className="replay-stats">
              <span><strong>{currentActionCount}</strong><small>decisions</small></span>
              <span><strong>{currentEndTick}</strong><small>simulation ticks</small></span>
              <span><strong>R1</strong><small>validated format</small></span>
            </div>
            <textarea rows={8} readOnly value={currentCode} aria-label="Current replay code" />
            <div className="replay-actions">
              <button className="primary-button" type="button" onClick={() => void copyReplay()}>Copy replay code</button>
              <button className="secondary-button" type="button" onClick={() => downloadText("stack-city-replay.r1.txt", currentCode, "text/plain;charset=utf-8")}>Download replay</button>
            </div>
          </section>
          <section className="replay-import" aria-labelledby="replay-import-title">
            <span className="eyebrow">Shared strategy</span>
            <h3 id="replay-import-title">Validate and play a replay</h3>
            <p>Replay codes are checksum-validated, size-capped, and parsed as data. They cannot execute scripts or open links.</p>
            <label htmlFor="replay-code">Replay code</label>
            <textarea
              id="replay-code"
              rows={9}
              maxLength={80_000}
              spellCheck={false}
              autoComplete="off"
              value={importCode}
              onChange={(event) => {
                setImportCode(event.target.value.trim());
                setMessage("");
              }}
            />
            {validationPending ? (
              <p className="replay-validation" aria-live="polite">Validating this replay locally…</p>
            ) : parsed ? (
              <div className="replay-validation good">
                <strong>Validated</strong>
                <span>{parsed.workshop?.name ?? SCENARIOS[parsed.scenario].name}</span>
                <small>{parsed.actions.length} decisions · {parsed.endTick} ticks · seed {parsed.challengeSeed}</small>
              </div>
            ) : importCode ? (
              <p className="replay-validation bad">That replay is invalid, incomplete, altered, or outside the safe limits.</p>
            ) : (
              <p className="replay-validation">Paste an R1 replay code. No account or upload is required.</p>
            )}
            <button className="primary-button" type="button" disabled={!parsed || validationPending} onClick={() => parsed && !validationPending && onPlay(parsed)}>Play strategy replay</button>
          </section>
        </div>
        <footer className="replay-footer">
          <small aria-live="polite">{message || "Workshop names, player names, browser data, and timestamps are excluded from replay codes."}</small>
        </footer>
      </section>
    </div>
  );
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&apos;",
  })[character] ?? character);
}

function percent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function createScorecardSvg(
  state: GameState,
  report: OperationsReport,
  scenarioName: string,
  challengeCode: string,
): string {
  const scenario = escapeXml(scenarioName);
  const code = escapeXml(challengeCode);
  const bottleneck = escapeXml(report.bottleneck.label);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title desc">
  <title id="title">Stack City operator scorecard</title>
  <desc id="desc">${scenario} run, grade ${report.grade}, score ${report.score}.</desc>
  <rect width="1200" height="630" fill="#05080c"/>
  <path d="M0 510 L1200 330 V630 H0Z" fill="#09161b"/>
  <path d="M0 550 L1200 390" stroke="#17323a" stroke-width="2"/>
  <rect x="56" y="48" width="1088" height="534" rx="18" fill="#091016" stroke="#29414a" stroke-width="2"/>
  <text x="92" y="104" fill="#b8f752" font-family="monospace" font-size="20" font-weight="700" letter-spacing="4">STACK CITY // FREE BETA</text>
  <text x="92" y="166" fill="#edf7f4" font-family="Arial, sans-serif" font-size="44" font-weight="800">${scenario}</text>
  <text x="92" y="203" fill="#81928f" font-family="monospace" font-size="17">DETERMINISTIC OPERATIONS REVIEW · WAVE ${state.wave}</text>
  <rect x="858" y="86" width="220" height="220" rx="14" fill="#0d1a1f" stroke="#b8f752"/>
  <text x="968" y="142" text-anchor="middle" fill="#81928f" font-family="monospace" font-size="15">OPERATOR GRADE</text>
  <text x="968" y="248" text-anchor="middle" fill="#b8f752" font-family="Arial, sans-serif" font-size="112" font-weight="900">${report.grade}</text>
  <text x="968" y="280" text-anchor="middle" fill="#edf7f4" font-family="monospace" font-size="19">${report.score} / 100</text>
  <g font-family="monospace">
    <text x="92" y="294" fill="#81928f" font-size="14">AVG AVAILABILITY</text><text x="92" y="335" fill="#45f0bd" font-size="31" font-weight="700">${percent(report.averageAvailability, 2)}</text>
    <text x="330" y="294" fill="#81928f" font-size="14">ARCHITECTURE</text><text x="330" y="335" fill="#66e5ff" font-size="31" font-weight="700">${state.metrics.architectureScore}</text>
    <text x="530" y="294" fill="#81928f" font-size="14">INCIDENTS</text><text x="530" y="335" fill="#ffd166" font-size="31" font-weight="700">${state.telemetry.incidentsStarted}</text>
    <text x="700" y="294" fill="#81928f" font-size="14">CHAINS</text><text x="700" y="335" fill="#ff9f43" font-size="31" font-weight="700">${state.telemetry.incidentEscalations}</text>
  </g>
  <text x="92" y="416" fill="#81928f" font-family="monospace" font-size="14">PRIMARY CONSTRAINT</text>
  <text x="92" y="454" fill="#edf7f4" font-family="Arial, sans-serif" font-size="28" font-weight="700">${bottleneck}</text>
  <text x="92" y="514" fill="#81928f" font-family="monospace" font-size="13">CHALLENGE</text>
  <text x="92" y="543" fill="#66e5ff" font-family="monospace" font-size="17">${code}</text>
  <text x="1078" y="543" text-anchor="end" fill="#b8f752" font-family="monospace" font-size="17">stack-city-eight.vercel.app</text>
</svg>`;
}

export function createLinkedInCaption(
  state: GameState,
  report: OperationsReport,
  scenarioName: string,
): string {
  return `I ran ${scenarioName} in Stack City and earned an operator grade ${report.grade} (${report.score}/100).\n\n${percent(report.averageAvailability, 2)} average availability · architecture score ${state.metrics.architectureScore} · ${state.telemetry.incidentsStarted} incidents · ${state.telemetry.incidentEscalations} chain escalations.\n\nStack City is a free, local-first infrastructure strategy game. Try the beta: https://stack-city-eight.vercel.app\n\n#SoftwareEngineering #SRE #DevOps #SystemsDesign #WebDevelopment`;
}

export function ShareScorecard({
  state,
  report,
  scenarioName,
  challengeCode,
}: {
  state: GameState;
  report: OperationsReport;
  scenarioName: string;
  challengeCode: string;
}) {
  const [status, setStatus] = useState("");
  const download = () => {
    downloadText(
      `stack-city-${state.scenario}-scorecard.svg`,
      createScorecardSvg(state, report, scenarioName, challengeCode),
      "image/svg+xml;charset=utf-8",
    );
    setStatus("Scorecard downloaded as an SVG image.");
  };
  const copyCaption = async () => {
    setStatus(await copyText(createLinkedInCaption(state, report, scenarioName))
      ? "LinkedIn-ready caption copied."
      : "Clipboard access is unavailable. Select the caption from the project README instead.");
  };
  return (
    <section className="share-scorecard" aria-labelledby="share-scorecard-title">
      <div className="scorecard-preview">
        <span>Stack City // Operator card</span>
        <div><strong>{report.grade}</strong><small>{report.score}/100</small></div>
        <h3 id="share-scorecard-title">{scenarioName}</h3>
        <ul>
          <li><span>Availability</span><strong>{percent(report.averageAvailability, 2)}</strong></li>
          <li><span>Architecture</span><strong>{state.metrics.architectureScore}</strong></li>
          <li><span>Incidents</span><strong>{state.telemetry.incidentsStarted}</strong></li>
          <li><span>Chains</span><strong>{state.telemetry.incidentEscalations}</strong></li>
        </ul>
      </div>
      <div className="scorecard-copy">
        <span className="eyebrow">Portfolio-ready artifact</span>
        <h3>Share a privacy-safe run result</h3>
        <p>Download a 1200 × 630 SVG or copy a LinkedIn caption. The card contains performance metrics and a challenge code—never browser history or personal data.</p>
        <div><button type="button" onClick={download}>Download scorecard</button><button type="button" onClick={() => void copyCaption()}>Copy LinkedIn caption</button></div>
        <small aria-live="polite">{status || "Attach the downloaded card to a post for a visual proof of play."}</small>
      </div>
    </section>
  );
}
