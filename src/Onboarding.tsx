import { CameraIcon, FrameIcon, LockClosedIcon, MobileIcon, WidthIcon } from '@radix-ui/react-icons';
import { CORNER_COUNT } from './measure';

type OnboardingProps = {
  supported: boolean | null;
  busy: boolean;
  /** Above zero once a session configuration has been rejected. */
  attempt: number;
  onStart: () => void;
  onShowDiagnostics: () => void;
};

function Tip({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 rounded-2xl bg-zinc-100 p-3.5">
      <div className="mt-0.5 shrink-0 text-blue-600">{icon}</div>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-zinc-900">{title}</div>
        <p className="mt-0.5 text-[12px] leading-snug text-zinc-500">{body}</p>
      </div>
    </div>
  );
}

/**
 * Corner dots of the how-it-works diagram, as percentages of the box.
 *
 * Anchoring with `right-0`/`bottom-0` and then translating by -50% pulls the
 * dot inwards instead of centring it, so every dot is placed from the same
 * left/top origin and shifted by half its own size.
 */
const DIAGRAM_DOTS = [
  { left: '0%', top: '0%' },
  { left: '100%', top: '0%' },
  { left: '0%', top: '100%' },
  { left: '100%', top: '100%' },
];

export default function Onboarding({
  supported,
  busy,
  attempt,
  onStart,
  onShowDiagnostics,
}: OnboardingProps) {
  const label = (() => {
    if (supported === false) return 'AR not supported on this device';
    if (busy) return 'Starting...';
    return attempt === 0 ? 'Start measuring' : 'Retry with simpler settings';
  })();

  return (
    <div
      className="absolute inset-0 z-40 overflow-y-auto overscroll-contain bg-white"
      style={{
        paddingTop: 'calc(var(--safe-top) + 1.5rem)',
        paddingBottom: 'calc(var(--safe-bottom) + 1.25rem)',
      }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-sm flex-col px-5">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
          <FrameIcon className="h-6 w-6 text-blue-600" />
        </div>

        <h1 className="mt-4 text-center text-[26px] font-bold tracking-tight text-zinc-900">
          Measure a fixture
        </h1>
        <p className="mx-auto mt-2 max-w-[19rem] text-center text-[13px] leading-snug text-zinc-500">
          Tap the four corners of a fixture to get its length and breadth in meters.
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <Tip
            icon={<WidthIcon className="h-4 w-4" />}
            title="Stand 1 - 3 metres back"
            body="All four corners should fit inside the camera view without moving."
          />
          <Tip
            icon={<MobileIcon className="h-4 w-4" />}
            title="Keep the phone straight"
            body="Hold it upright - avoid tilting or rotating while placing corners."
          />
        </div>

        <div className="mt-7">
          <div className="text-center text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
            How it works
          </div>
          <div className="mt-3 rounded-2xl bg-zinc-100 px-8 py-7">
            <div className="relative mx-auto h-24 w-full max-w-[13rem] rounded-lg bg-white/70 ring-1 ring-blue-200">
              {DIAGRAM_DOTS.map((corner) => (
                <span
                  key={`${corner.left}-${corner.top}`}
                  className="absolute h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-600 shadow"
                  style={{
                    left: corner.left,
                    top: corner.top,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              ))}
            </div>
          </div>
          <p className="mt-3 text-center text-[12px] leading-snug text-zinc-500">
            Corners are placed one by one. When the {CORNER_COUNT}th lands, the length and breadth
            appear.
          </p>
        </div>

        <div className="mt-auto pt-7">
          <button
            type="button"
            onClick={onStart}
            disabled={supported === false || busy}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 text-[15px] font-semibold text-white shadow-lg shadow-blue-600/20 transition active:scale-[0.99] disabled:bg-zinc-300 disabled:text-zinc-500 disabled:shadow-none"
          >
            <CameraIcon className="h-4 w-4" />
            {label}
          </button>

          <button
            type="button"
            onClick={onShowDiagnostics}
            className="mt-3 flex w-full items-center justify-center gap-1.5 text-[11px] text-zinc-400 transition active:text-zinc-600"
          >
            <LockClosedIcon className="h-3 w-3" />
            Camera runs locally on your device
          </button>
        </div>
      </div>
    </div>
  );
}
