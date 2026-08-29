import { useCallback, useEffect, useState } from 'react';
import { startSession, stopSession } from '@react-three/xr';

type ArConfig = {
  label: string;
  init: XRSessionInit;
};

/**
 * Session configurations from richest to barest.
 *
 * `NotSupportedError` from requestSession() means the browser rejected the
 * *feature set*, not AR itself, and it never says which feature was the
 * problem. Each tap steps one rung down this ladder and reports what it
 * learned, so a device that cannot do hit-test still tells us so plainly
 * instead of failing silently.
 *
 * A retry cannot be automatic: requestSession() consumes the transient user
 * activation, so the next attempt has to come from a fresh tap.
 */
const AR_CONFIGS: ArConfig[] = [
  {
    label: 'hit-test required + DOM overlay',
    init: {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'local-floor', 'anchors'],
      domOverlay: { root: document.body },
    },
  },
  {
    label: 'hit-test + DOM overlay, both optional',
    init: {
      optionalFeatures: ['hit-test', 'dom-overlay', 'local-floor', 'anchors'],
      domOverlay: { root: document.body },
    },
  },
  {
    label: 'hit-test optional, no overlay',
    init: { optionalFeatures: ['hit-test', 'anchors'] },
  },
  {
    label: 'bare immersive-ar',
    init: {},
  },
];

type EnterArButtonProps = {
  presenting: boolean;
  className?: string;
  onLog: (message: string) => void;
  onTrouble: () => void;
};

export default function EnterArButton({
  presenting,
  className,
  onLog,
  onTrouble,
}: EnterArButtonProps) {
  const [supported, setSupported] = useState<boolean | null>(() => (navigator.xr ? null : false));
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!navigator.xr) return;
    let cancelled = false;
    navigator.xr
      .isSessionSupported('immersive-ar')
      .then((ok) => {
        if (!cancelled) setSupported(ok);
      })
      .catch(() => {
        if (!cancelled) setSupported(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClick = useCallback(async () => {
    if (busy) return;

    if (presenting) {
      await stopSession();
      return;
    }

    const index = attempt;
    const config = AR_CONFIGS[index];

    setBusy(true);
    onLog(`trying: ${config.label}`);

    try {
      const session = await startSession('immersive-ar', config.init);
      setAttempt(0);

      const granted = session?.enabledFeatures;
      onLog(`granted: ${granted?.length ? granted.join(', ') : 'not reported'}`);

      if (granted && !granted.includes('hit-test')) {
        onLog('WARNING: hit-test not granted - surfaces cannot be detected');
        onTrouble();
      }
    } catch (error) {
      const { name, message } = error as Error;
      onLog(`FAILED (${config.label}): ${name}: ${message}`);

      const next = index + 1;
      if (next < AR_CONFIGS.length) {
        setAttempt(next);
        onLog(`tap again to retry with: ${AR_CONFIGS[next].label}`);
      } else {
        setAttempt(0);
        onLog('NO configuration worked - update "Google Play Services for AR" in the Play Store');
      }
      onTrouble();
    } finally {
      setBusy(false);
    }
  }, [attempt, busy, presenting, onLog, onTrouble]);

  const label = (() => {
    if (supported === false) return 'AR unsupported';
    if (busy) return 'Starting...';
    if (presenting) return 'Exit AR';
    return attempt === 0 ? 'Enter AR' : 'Retry AR';
  })();

  return (
    <button type="button" onClick={handleClick} disabled={supported === false || busy} className={className}>
      {label}
    </button>
  );
}
