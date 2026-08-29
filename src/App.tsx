import { useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { XR } from '@react-three/xr';
import ARRuler from './ARRuler';
import { IDLE_STATS } from './stats';
import type { RuntimeStats } from './stats';
import MeasureOverlay from './MeasureOverlay';
import Onboarding from './Onboarding';
import { useArSession } from './useArSession';
import { CORNER_COUNT, rectangleMetrics, ringOrder } from './measure';
import type { Corner } from './measure';

/** Everything we can learn about WebXR support without awaiting anything. */
function initialDiagnostics(): string[] {
  return [
    `secure: ${window.isSecureContext} (${location.protocol})`,
    navigator.xr ? 'navigator.xr: present' : 'navigator.xr: MISSING - no WebXR in this browser',
  ];
}

/** Anchors are a device resource; hand them back when a point goes away. */
function releaseAnchor(corner: Corner) {
  try {
    corner.anchor?.delete();
  } catch {
    // Already gone with the session - nothing to release.
  }
}

function App() {
  const [corners, setCorners] = useState<Corner[]>([]);
  const [presenting, setPresenting] = useState(false);
  const [stats, setStats] = useState<RuntimeStats>(IDLE_STATS);
  const [log, setLog] = useState<string[]>(initialDiagnostics);
  const [showLog, setShowLog] = useState(false);

  // Corners are measured in ring order, not tap order, so tapping them out of
  // sequence still describes the same shape.
  const ring = useMemo(() => {
    const order = ringOrder(corners.map((corner) => corner.position));
    return order.map((index) => corners[index]);
  }, [corners]);

  const metrics = useMemo(() => rectangleMetrics(ring.map((corner) => corner.position)), [ring]);

  const logLine = useCallback((message: string) => {
    setLog((prev) => [...prev.slice(-19), message]);
  }, []);

  const showTrouble = useCallback(() => setShowLog(true), []);

  const session = useArSession(logLine, showTrouble);

  const addCorner = useCallback((corner: Corner) => {
    setCorners((prev) => (prev.length >= CORNER_COUNT ? [corner] : [...prev, corner]));
    navigator.vibrate?.(25);
  }, []);

  /** A resolved anchor arrives after the corner it belongs to is already drawn. */
  const attachAnchor = useCallback((id: number, anchor: XRAnchor) => {
    setCorners((prev) => prev.map((corner) => (corner.id === id ? { ...corner, anchor } : corner)));
  }, []);

  /** Anchored corners are re-posed every few frames; match them back by id. */
  const updateCorners = useCallback((updated: Corner[]) => {
    setCorners((prev) =>
      prev.map((corner) => updated.find((entry) => entry.id === corner.id) ?? corner),
    );
  }, []);

  const reset = useCallback(() => {
    setCorners((prev) => {
      for (const corner of prev) releaseAnchor(corner);
      return [];
    });
  }, []);

  /**
   * Stop taps on the UI from also placing a corner.
   *
   * With `dom-overlay`, tapping the overlay still fires the session's `select`
   * event unless the page cancels `beforexrselect` first.
   */
  const chromeRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const block = (event: Event) => event.preventDefault();
    node.addEventListener('beforexrselect', block);
    return () => node.removeEventListener('beforexrselect', block);
  }, []);

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

  // requestSession() is fired without an await inside the library, so a
  // rejection would otherwise vanish as an unhandled rejection.
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

  return (
    <div
      className={`fixed inset-0 overflow-hidden ${presenting ? 'bg-transparent' : 'bg-white'}`}
    >
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
            reset();
            logLine('session started');
          }}
          onSessionEnd={() => {
            setPresenting(false);
            setStats(IDLE_STATS);
            reset();
            logLine('session ended');
          }}
        >
          <ARRuler
            corners={ring}
            metrics={metrics}
            onAddCorner={addCorner}
            onAttachAnchor={attachAnchor}
            onCornersUpdate={updateCorners}
            onStats={setStats}
            onDebug={logLine}
          />
        </XR>
      </Canvas>

      {presenting ? (
        <MeasureOverlay
          placed={corners.length}
          scanning={stats.hits === 0}
          metrics={metrics}
          stats={stats}
          log={log}
          showLog={showLog}
          onToggleLog={() => setShowLog((visible) => !visible)}
          onReset={reset}
          onEnd={session.exit}
          chromeRef={chromeRef}
        />
      ) : (
        <Onboarding
          supported={session.supported}
          busy={session.busy}
          attempt={session.attempt}
          onStart={session.enter}
          onShowDiagnostics={showTrouble}
        />
      )}

      {/* Diagnostics are reachable before entering AR too */}
      {!presenting && showLog && (
        <div className="absolute inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-6">
          <div className="max-h-56 w-full max-w-sm overflow-y-auto overscroll-contain rounded-2xl bg-zinc-900/95 p-3 font-mono text-[10px] leading-relaxed text-zinc-300 shadow-xl">
            <button
              type="button"
              onClick={() => setShowLog(false)}
              className="mb-2 w-full text-left text-[10px] font-bold uppercase tracking-widest text-zinc-500"
            >
              Diagnostics - tap to close
            </button>
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
    </div>
  );
}

export default App;
