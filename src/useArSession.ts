import { useCallback, useEffect, useState } from 'react';
import { startSession, stopSession } from '@react-three/xr';

type ArConfig = {
  label: string;
  init: XRSessionInit;
};

/** Depth sensing has to be configured up front or the request is rejected. */
const DEPTH_INIT: XRDepthStateInit = {
  usagePreference: ['cpu-optimized'],
  dataFormatPreference: ['luminance-alpha'],
};

/**
 * Session configurations from richest to barest.
 *
 * `NotSupportedError` from requestSession() means the browser rejected the
 * *feature set*, not AR itself, and it never says which feature was at fault.
 * Each attempt steps one rung down this ladder, so a device that cannot do
 * hit-test says so plainly instead of failing silently.
 *
 * The retry cannot be automatic: requestSession() consumes the transient user
 * activation, so the next attempt has to come from a fresh tap.
 */
const AR_CONFIGS: ArConfig[] = [
  {
    label: 'hit-test required + DOM overlay',
    init: {
      requiredFeatures: ['hit-test'],
      optionalFeatures: [
        'dom-overlay',
        'local-floor',
        'anchors',
        'plane-detection',
        'depth-sensing',
      ],
      domOverlay: { root: document.body },
      depthSensing: DEPTH_INIT,
    },
  },
  {
    label: 'hit-test + DOM overlay, both optional',
    init: {
      optionalFeatures: ['hit-test', 'dom-overlay', 'local-floor', 'anchors', 'plane-detection'],
      domOverlay: { root: document.body },
    },
  },
  {
    label: 'hit-test optional, no overlay',
    init: { optionalFeatures: ['hit-test', 'anchors', 'plane-detection'] },
  },
  {
    label: 'bare immersive-ar',
    init: {},
  },
];

export type ArSessionControls = {
  /** null while the support probe is still running. */
  supported: boolean | null;
  busy: boolean;
  /** 0 on a first try; higher once a configuration has been rejected. */
  attempt: number;
  enter: () => Promise<void>;
  exit: () => Promise<void>;
};

export function useArSession(
  log: (message: string) => void,
  onTrouble: () => void,
): ArSessionControls {
  const [supported, setSupported] = useState<boolean | null>(() =>
    navigator.xr ? null : false,
  );
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

  const enter = useCallback(async () => {
    if (busy) return;

    const index = attempt;
    const config = AR_CONFIGS[index];

    setBusy(true);
    log(`trying: ${config.label}`);

    try {
      const session = await startSession('immersive-ar', config.init);
      setAttempt(0);

      const granted = session?.enabledFeatures;
      log(`granted: ${granted?.length ? granted.join(', ') : 'not reported'}`);

      if (granted && !granted.includes('hit-test')) {
        log('WARNING: hit-test not granted - surfaces cannot be detected');
        onTrouble();
      }
    } catch (error) {
      const { name, message } = error as Error;
      log(`FAILED (${config.label}): ${name}: ${message}`);

      const next = index + 1;
      if (next < AR_CONFIGS.length) {
        setAttempt(next);
        log(`tap again to retry with: ${AR_CONFIGS[next].label}`);
      } else {
        setAttempt(0);
        log('NO configuration worked - update "Google Play Services for AR"');
      }
      onTrouble();
    } finally {
      setBusy(false);
    }
  }, [attempt, busy, log, onTrouble]);

  const exit = useCallback(async () => {
    await stopSession();
  }, []);

  return { supported, busy, attempt, enter, exit };
}
