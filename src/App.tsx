import { useCallback, useEffect, useMemo, useState } from 'react';
import type * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { XR } from '@react-three/xr';
import {
  ArrowLeftIcon,
  CheckCircledIcon,
  ExclamationTriangleIcon,
  InfoCircledIcon,
  TargetIcon,
  TrashIcon,
} from '@radix-ui/react-icons';
import ARRuler from './ARRuler';
import EnterArButton from './EnterArButton';
import {
  CORNER_COUNT,
  RECTANGLE_TOLERANCE,
  orderCorners,
  rectangleMetrics,
  toUnits,
} from './measure';

/** Everything we can learn about WebXR support without awaiting anything. */
function initialDiagnostics(): string[] {
  return [
    `secure: ${window.isSecureContext} (${location.protocol})`,
    navigator.xr ? 'navigator.xr: present' : 'navigator.xr: MISSING - no WebXR in this browser',
  ];
}

const SAFE_TOP = 'calc(var(--safe-top) + 0.75rem)';
const SAFE_BOTTOM = 'calc(var(--safe-bottom) + 1rem)';

function App() {
  const [corners, setCorners] = useState<THREE.Vector3[]>([]);
  const [liveEdge, setLiveEdge] = useState<number | null>(null);
  const [log, setLog] = useState<string[]>(initialDiagnostics);
  const [showLog, setShowLog] = useState(false);
  const [presenting, setPresenting] = useState(false);

  // Corners are measured in ring order, not tap order, so tapping them out of
  // sequence still describes the same shape.
  const ring = useMemo(() => orderCorners(corners), [corners]);
  const metrics = useMemo(() => rectangleMetrics(ring), [ring]);
  const isComplete = corners.length === CORNER_COUNT;

  const logLine = useCallback((message: string) => {
    setLog((prev) => [...prev.slice(-19), message]);
  }, []);

  const addCorner = useCallback((corner: THREE.Vector3) => {
    setCorners((prev) => (prev.length >= CORNER_COUNT ? [corner] : [...prev, corner]));
  }, []);

  const showTrouble = useCallback(() => setShowLog(true), []);

  const undo = useCallback(() => setCorners((prev) => prev.slice(0, -1)), []);
  const reset = useCallback(() => setCorners([]), []);

  useEffect(() => {
    if (!navigator.xr) return;
    let cancelled = false;
    const report = (message: string) => {
      if (!cancelled) logLine(message);
    };
    navigator.xr
      .isSessionSupported('immersive-ar')
      .then((ok) => report(`immersive-ar: ${ok ? 'supported' : 'NOT supported - ARCore missing?'}`))
      .catch((error: Error) => report(`isSessionSupported: ${error.name}: ${error.message}`));
    return () => {
      cancelled = true;
    };
  }, [logLine]);

  // The XR button fires startSession() without awaiting it, so a rejected
  // requestSession() (camera denied, ARCore install cancelled, feature
  // unavailable) would otherwise vanish as an unhandled rejection.
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      logLine(`FAILED: ${reason?.name ?? 'Error'}: ${reason?.message ?? String(reason)}`);
      setShowLog(true);
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, [logLine]);

  // The DOM overlay sits on top of the camera feed, so the page has to go
  // transparent for the duration of the session or it just shows black.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('xr-presenting', presenting);
    return () => root.classList.remove('xr-presenting');
  }, [presenting]);

  const instruction = isComplete
    ? 'Tap anywhere to measure again'
    : `Aim at a corner and tap - ${corners.length + 1} of ${CORNER_COUNT}`;

  const liveUnits = liveEdge === null ? null : toUnits(liveEdge);
  const lengthUnits = metrics ? toUnits(metrics.length) : null;
  const breadthUnits = metrics ? toUnits(metrics.breadth) : null;

  return (
    <div
      className={`fixed inset-0 overflow-hidden text-white ${
        presenting ? 'bg-transparent' : 'bg-neutral-950'
      }`}
    >
      {/* Camera + 3D scene */}
      <Canvas
        className="absolute inset-0"
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => gl.setClearAlpha(0)}
      >
        {/* 'local' is the reference space guaranteed for handheld AR;
            'local-floor' is not granted by default and makes setSession reject. */}
        <XR
          referenceSpace="local"
          onSessionStart={() => {
            setPresenting(true);
            logLine('session started');
          }}
          onSessionEnd={() => {
            setPresenting(false);
            logLine('session ended');
          }}
        >
          <ARRuler
            corners={ring}
            metrics={metrics}
            onAddCorner={addCorner}
            onLiveEdge={setLiveEdge}
            onDebug={logLine}
          />
        </XR>
      </Canvas>

      {/* Aiming crosshair */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center opacity-60">
        <div className="h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,1)]" />
        <div className="absolute h-px w-9 bg-white/40" />
        <div className="absolute h-9 w-px bg-white/40" />
      </div>

      {/* Readout */}
      <header
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center px-3"
        style={{ paddingTop: SAFE_TOP }}
      >
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900/70 p-4 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <TargetIcon className="h-4 w-4 shrink-0 text-sky-400" />
            <h1 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
              Spatial Ruler
            </h1>
            <div className="ml-auto flex gap-1.5">
              {Array.from({ length: CORNER_COUNT }, (_, index) => (
                <span
                  key={index}
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    index < corners.length ? 'bg-sky-400' : 'bg-white/20'
                  }`}
                />
              ))}
            </div>
          </div>

          {metrics && lengthUnits && breadthUnits ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                  Length
                </div>
                <div className="truncate text-3xl font-black tracking-tight tabular-nums">
                  {lengthUnits.cm}
                  <span className="ml-1 text-sm font-bold text-neutral-500">cm</span>
                </div>
                <div className="truncate text-xs font-medium tabular-nums text-sky-400/90">
                  {lengthUnits.inches} in
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                  Breadth
                </div>
                <div className="truncate text-3xl font-black tracking-tight tabular-nums">
                  {breadthUnits.cm}
                  <span className="ml-1 text-sm font-bold text-neutral-500">cm</span>
                </div>
                <div className="truncate text-xs font-medium tabular-nums text-sky-400/90">
                  {breadthUnits.inches} in
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                {corners.length === 0 ? 'Ready' : `Edge ${corners.length}`}
              </div>
              <div className="truncate text-4xl font-black tracking-tight tabular-nums">
                {liveUnits ? liveUnits.cm : '0.0'}
                <span className="ml-1 text-lg font-bold text-neutral-500">cm</span>
              </div>
              <div className="truncate text-xs font-medium tabular-nums text-sky-400/90">
                {liveUnits ? liveUnits.inches : '0.0'} in
              </div>
            </div>
          )}

          <div
            className={`mt-3 rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-wider ${
              metrics
                ? metrics.isRectangular
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-amber-500/15 text-amber-300'
                : 'bg-white/10 text-neutral-300'
            }`}
          >
            {metrics ? (
              <span className="flex items-center gap-1.5">
                {metrics.isRectangular ? (
                  <CheckCircledIcon className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>Diagonals match {metrics.diagonalMatch.toFixed(1)}%</span>
              </span>
            ) : (
              instruction
            )}
          </div>

          {metrics && !metrics.isRectangular && (
            <p className="mt-2 text-[11px] leading-snug text-amber-200/80">
              Not a true rectangle - the diagonals differ, so this shape is only{' '}
              {metrics.diagonalMatch.toFixed(1)}% square (needs {RECTANGLE_TOLERANCE}%). Length and
              breadth are approximate; re-tap the corners more precisely for an exact result.
            </p>
          )}

          {metrics && metrics.isRectangular && (
            <p className="mt-2 text-[11px] leading-snug text-neutral-400">
              Area {(metrics.area * 10000).toFixed(0)} cm2 - {instruction}
            </p>
          )}
        </div>
      </header>

      {/* Diagnostics */}
      {showLog && (
        <div
          className="absolute inset-x-0 z-30 flex justify-center px-3"
          style={{ bottom: `calc(${SAFE_BOTTOM} + 4.5rem)` }}
        >
          <div className="max-h-56 w-full max-w-sm overflow-y-auto overscroll-contain rounded-2xl border border-white/15 bg-black/85 p-3 font-mono text-[10px] leading-relaxed text-neutral-300 backdrop-blur-xl">
            {log.map((line, index) => (
              <div
                key={index}
                className={
                  line.startsWith('FAILED') || line.includes('MISSING') || line.includes('NOT ')
                    ? 'text-rose-400'
                    : ''
                }
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <footer
        className="absolute inset-x-0 bottom-0 z-30 px-3"
        style={{ paddingBottom: SAFE_BOTTOM }}
      >
        <div className="mx-auto flex w-full max-w-sm items-stretch gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={corners.length === 0}
            aria-label="Undo last corner"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-neutral-900/70 text-neutral-300 shadow-2xl backdrop-blur-xl transition active:scale-95 disabled:opacity-30"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>

          <EnterArButton
            presenting={presenting}
            onLog={logLine}
            onTrouble={showTrouble}
            className="h-14 flex-1 rounded-2xl border border-sky-400/50 bg-sky-600/90 px-4 text-sm font-bold uppercase tracking-wider text-white shadow-[0_0_30px_rgba(14,165,233,0.3)] backdrop-blur-xl transition active:scale-95 disabled:border-white/10 disabled:bg-neutral-800/80 disabled:text-neutral-500 disabled:shadow-none"
          />

          <button
            type="button"
            onClick={reset}
            disabled={corners.length === 0}
            aria-label="Clear measurement"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-neutral-900/70 text-neutral-300 shadow-2xl backdrop-blur-xl transition active:scale-95 disabled:opacity-30"
          >
            <TrashIcon className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => setShowLog((visible) => !visible)}
            aria-label="Toggle diagnostics"
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 shadow-2xl backdrop-blur-xl transition active:scale-95 ${
              showLog ? 'bg-white/20 text-white' : 'bg-neutral-900/70 text-neutral-300'
            }`}
          >
            <InfoCircledIcon className="h-5 w-5" />
          </button>
        </div>
      </footer>
    </div>
  );
}

export default App;
