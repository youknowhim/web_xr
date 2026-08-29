import type * as React from 'react';
import {
  Cross2Icon,
  FrameIcon,
  InfoCircledIcon,
  ResetIcon,
  TargetIcon,
  UpdateIcon,
} from '@radix-ui/react-icons';
import type { RuntimeStats } from './stats';
import { CORNER_COUNT, RECTANGLE_TOLERANCE, toMeters } from './measure';
import type { RectangleMetrics } from './measure';

type MeasureOverlayProps = {
  placed: number;
  /** True until the device has actually locked on to a surface. */
  scanning: boolean;
  metrics: RectangleMetrics | null;
  stats: RuntimeStats;
  log: string[];
  showLog: boolean;
  onToggleLog: () => void;
  onReset: () => void;
  onEnd: () => void;
  /** Attaches the guard that stops UI taps from also dropping a corner. */
  chromeRef: React.RefCallback<HTMLDivElement>;
};

const tick = (ok: boolean) => (ok ? 'ok' : 'x');

export default function MeasureOverlay({
  placed,
  scanning,
  metrics,
  stats,
  log,
  showLog,
  onToggleLog,
  onReset,
  onEnd,
  chromeRef,
}: MeasureOverlayProps) {
  return (
    <>
      {/* Top chips */}
      <div
        ref={chromeRef}
        className="absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 px-4"
        style={{ paddingTop: 'calc(var(--safe-top) + 0.75rem)' }}
      >
        <div className="flex items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-2 text-[13px] font-semibold text-zinc-900 shadow-md">
          <FrameIcon className="h-3.5 w-3.5 text-blue-600" />
          Fixture
        </div>

        <button
          type="button"
          onClick={onToggleLog}
          aria-label="Toggle diagnostics"
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold shadow-md transition active:scale-95 ${
            showLog ? 'bg-zinc-900 text-white' : 'bg-white/95 text-zinc-900'
          }`}
        >
          <InfoCircledIcon className="h-3.5 w-3.5" />
          {placed}/{CORNER_COUNT}
        </button>
      </div>

      {/* Corner prompt, or the scanning hint while the room is still unmapped */}
      {placed < CORNER_COUNT && (
        <div
          className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-4"
          style={{ top: 'calc(var(--safe-top) + 3.9rem)' }}
        >
          {scanning ? (
            <div className="flex max-w-[19rem] items-center gap-2 rounded-2xl bg-amber-500/95 px-4 py-2.5 text-[12px] font-medium leading-snug text-white shadow-md">
              <UpdateIcon className="h-4 w-4 shrink-0 animate-spin" />
              Move the phone slowly side to side, and aim at a textured, well-lit
              surface.
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-full bg-white/95 px-4 py-2 text-[13px] font-semibold text-zinc-900 shadow-md">
              <TargetIcon className="h-3.5 w-3.5 text-blue-600" />
              Tap corner {placed + 1} of {CORNER_COUNT}
            </div>
          )}
        </div>
      )}

      {/* Diagnostics log */}
      {showLog && (
        <div
          ref={chromeRef}
          className="absolute inset-x-0 z-30 flex justify-center px-4"
          style={{ bottom: 'calc(var(--safe-bottom) + 11rem)' }}
        >
          <div className="max-h-48 w-full max-w-sm overflow-y-auto overscroll-contain rounded-2xl bg-zinc-900/95 p-3 font-mono text-[10px] leading-relaxed text-zinc-300 shadow-lg">
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

      {/* Result + controls */}
      <div
        ref={chromeRef}
        className="absolute inset-x-0 bottom-0 z-30 px-4"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 1rem)' }}
      >
        <div className="mx-auto w-full max-w-sm">
          {metrics && (
            <>
              <div className="flex items-stretch rounded-2xl bg-white/95 shadow-lg">
                <div className="flex-1 px-5 py-3.5 text-center">
                  <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400">
                    Length
                  </div>
                  <div className="mt-0.5 text-[26px] font-bold leading-none tracking-tight text-zinc-900 tabular-nums">
                    {toMeters(metrics.length)}
                    <span className="ml-1 text-[13px] font-semibold text-zinc-400">m</span>
                  </div>
                </div>
                <div className="my-3 w-px bg-zinc-200" />
                <div className="flex-1 px-5 py-3.5 text-center">
                  <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400">
                    Breadth
                  </div>
                  <div className="mt-0.5 text-[26px] font-bold leading-none tracking-tight text-zinc-900 tabular-nums">
                    {toMeters(metrics.breadth)}
                    <span className="ml-1 text-[13px] font-semibold text-zinc-400">m</span>
                  </div>
                </div>
              </div>

              {!metrics.isRectangular && (
                <div className="mt-2 rounded-xl bg-amber-500/95 px-3.5 py-2 text-[11px] font-medium leading-snug text-white shadow-md">
                  Corners are only {metrics.diagonalMatch.toFixed(1)}% square (needs{' '}
                  {RECTANGLE_TOLERANCE}%). Length and breadth are approximate.
                </div>
              )}
            </>
          )}

          {/* Status strip */}
          <div className="mt-2 flex justify-center">
            <div className="rounded-full bg-zinc-900/80 px-3 py-1 font-mono text-[10px] text-zinc-300">
              hs:{tick(stats.hitSource)} rs:{tick(stats.refSpace)} fps:{stats.fps} hits:{stats.hits}{' '}
              pl:{stats.planes} anc:{stats.anchors}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={onReset}
              disabled={placed === 0}
              className="flex items-center gap-1.5 rounded-full bg-white/95 px-5 py-2.5 text-[13px] font-semibold text-zinc-900 shadow-md transition active:scale-95 disabled:opacity-40"
            >
              <ResetIcon className="h-3.5 w-3.5" />
              Reset
            </button>
            <button
              type="button"
              onClick={onEnd}
              className="flex items-center gap-1.5 rounded-full bg-white/95 px-5 py-2.5 text-[13px] font-semibold text-zinc-900 shadow-md transition active:scale-95"
            >
              <Cross2Icon className="h-3.5 w-3.5" />
              End
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
