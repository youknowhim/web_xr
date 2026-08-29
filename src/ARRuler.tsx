import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useXR } from '@react-three/xr';
import { useFrame } from '@react-three/fiber';
import { CORNER_COUNT, SURFACE_LIFT, liftedPosition, midpoint, outlineEdges } from './measure';
import type { Corner, RectangleMetrics } from './measure';
import type { RuntimeStats } from './stats';

const UP = new THREE.Vector3(0, 1, 0);

const DOT_COLOR = '#2563eb';
const LINE_COLOR = '#3b82f6';
const WARN_COLOR = '#f59e0b';

/**
 * How long the last surface reading stays usable.
 *
 * Hit-testing does not return a result on every single frame - a plain wall or
 * a moving phone drops results for a few frames at a time. Judging a tap by
 * whether *this* frame had a hit rejects taps constantly, so a recent reading
 * counts, and the reticle stops flickering with it.
 */
const HIT_GRACE_MS = 700;

/** Hit-test setup can lose the race with session startup, so it gets retries. */
const HIT_SOURCE_TRIES = 6;
const HIT_SOURCE_BACKOFF = 400;

/** Anchor poses are re-read on this cadence, and applied past this movement. */
const ANCHOR_SYNC_FRAMES = 10;
const ANCHOR_MOVE_EPSILON = 0.001;

/** How often the status strip is refreshed. */
const STATS_INTERVAL_MS = 500;

// Reused every frame so the render loop allocates nothing.
const scratchMatrix = new THREE.Matrix4();
const scratchCursor = new THREE.Vector3();
const scratchDraw = new THREE.Vector3();
const scratchNormal = new THREE.Vector3();
const scratchDirection = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();

let nextCornerId = 1;

type PendingAnchor = {
  id: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
};

type ARRulerProps = {
  corners: Corner[];
  metrics: RectangleMetrics | null;
  onAddCorner: (corner: Corner) => void;
  onAttachAnchor: (id: number, anchor: XRAnchor) => void;
  onCornersUpdate: (corners: Corner[]) => void;
  onStats: (stats: RuntimeStats) => void;
  onDebug: (message: string) => void;
};

/** A thin cylinder stretched so it spans exactly from `a` to `b`. */
function Segment({
  a,
  b,
  color,
  radius = 0.0022,
}: {
  a: THREE.Vector3;
  b: THREE.Vector3;
  color: string;
  radius?: number;
}) {
  const transform = useMemo(() => {
    const direction = new THREE.Vector3().subVectors(b, a);
    const length = direction.length();
    return {
      length,
      position: midpoint(a, b),
      quaternion: new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize()),
    };
  }, [a, b]);

  if (transform.length < 1e-4) return null;

  return (
    <mesh
      position={transform.position}
      quaternion={transform.quaternion}
      scale={[1, transform.length, 1]}
      renderOrder={1}
    >
      <cylinderGeometry args={[radius, radius, 1, 8]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

/** A placed corner: a blue dot inside a white ring, always facing the camera. */
function CornerDot({ position, color }: { position: THREE.Vector3; color: string }) {
  const ref = useRef<THREE.Group>(null);

  useFrame(({ camera }) => {
    ref.current?.quaternion.copy(camera.quaternion);
  });

  return (
    <group ref={ref} position={position}>
      <mesh renderOrder={2}>
        <circleGeometry args={[0.011, 24]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 0, 0.0004]} renderOrder={3}>
        <circleGeometry args={[0.0075, 24]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

export default function ARRuler({
  corners,
  metrics,
  onAddCorner,
  onAttachAnchor,
  onCornersUpdate,
  onStats,
  onDebug,
}: ARRulerProps) {
  const reticleRef = useRef<THREE.Group>(null);
  const liveEdgeRef = useRef<THREE.Mesh>(null);

  const session = useXR((state) => state.session);

  const hitSourceRef = useRef<XRHitTestSource | null>(null);
  const lastHitAtRef = useRef(0);
  const lastHitMatrixRef = useRef(new THREE.Matrix4());
  const pendingAnchorsRef = useRef<PendingAnchor[]>([]);
  const sawHitRef = useRef(false);
  const frameCountRef = useRef(0);

  // Status-strip accounting.
  const statsFramesRef = useRef(0);
  const statsSinceRef = useRef(0);
  const statsHitsRef = useRef(0);

  // Graphics float just off the surface; measurements use the true points.
  const drawPoints = useMemo(() => corners.map(liftedPosition), [corners]);
  const edges = useMemo(() => outlineEdges(drawPoints), [drawPoints]);

  const anchorCount = useMemo(() => corners.filter((corner) => corner.anchor).length, [corners]);

  /**
   * Acquire the hit-test source, with retries.
   *
   * requestHitTestSource() can reject if called before the session has finished
   * coming up. A single rejection used to leave the reticle dead for the whole
   * session - the "sometimes the ring never appears" case.
   */
  useEffect(() => {
    if (!session) return;

    sawHitRef.current = false;
    lastHitAtRef.current = 0;
    pendingAnchorsRef.current = [];
    if (liveEdgeRef.current) liveEdgeRef.current.visible = false;
    if (reticleRef.current) reticleRef.current.visible = false;

    const request = session.requestHitTestSource?.bind(session);
    if (!request) {
      onDebug('hit-test API MISSING on this session');
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const acquire = (attempt: number) => {
      session
        .requestReferenceSpace('viewer')
        .then((viewer) => request({ space: viewer }))
        .then((source) => {
          if (!source) throw new Error('no hit-test source returned');
          if (cancelled) {
            source.cancel();
            return;
          }
          hitSourceRef.current = source;
          onDebug(`hit-test source ready (try ${attempt})`);
        })
        .catch((error: Error) => {
          if (cancelled) return;
          onDebug(`hit-test source failed (try ${attempt}): ${error.name}: ${error.message}`);
          if (attempt < HIT_SOURCE_TRIES) {
            timer = setTimeout(() => acquire(attempt + 1), HIT_SOURCE_BACKOFF * attempt);
          } else {
            onDebug('hit-test unavailable - surfaces cannot be detected');
          }
        });
    };

    acquire(1);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      hitSourceRef.current?.cancel();
      hitSourceRef.current = null;
    };
  }, [session, onDebug]);

  /** Re-read anchored corners so they stay put as the device corrects itself. */
  const syncAnchors = useCallback(
    (frame: XRFrame, referenceSpace: XRReferenceSpace) => {
      let changed = false;

      const next = corners.map((corner) => {
        if (!corner.anchor) return corner;

        const pose = frame.getPose(corner.anchor.anchorSpace, referenceSpace);
        if (!pose) return corner;

        scratchMatrix.fromArray(pose.transform.matrix);
        scratchCursor.setFromMatrixPosition(scratchMatrix);
        if (scratchCursor.distanceTo(corner.position) < ANCHOR_MOVE_EPSILON) return corner;

        changed = true;
        return {
          ...corner,
          position: scratchCursor.clone(),
          quaternion: new THREE.Quaternion().setFromRotationMatrix(scratchMatrix),
        };
      });

      if (changed) onCornersUpdate(next);
    },
    [corners, onCornersUpdate],
  );

  /**
   * Anchor the taps queued since the last frame.
   *
   * Anchors have to be created from a live XRFrame, and a tap arrives between
   * frames - so the exact tapped pose is queued and anchored here.
   */
  const drainPendingAnchors = useCallback(
    (frame: XRFrame, referenceSpace: XRReferenceSpace) => {
      const pending = pendingAnchorsRef.current;
      if (pending.length === 0) return;
      pendingAnchorsRef.current = [];

      const createAnchor = frame.createAnchor?.bind(frame);
      if (!createAnchor) {
        onDebug('anchors unavailable - points may drift');
        return;
      }

      for (const item of pending) {
        const transform = new XRRigidTransform(
          { x: item.position.x, y: item.position.y, z: item.position.z },
          {
            x: item.quaternion.x,
            y: item.quaternion.y,
            z: item.quaternion.z,
            w: item.quaternion.w,
          },
        );
        createAnchor(transform, referenceSpace)
          .then((anchor) => onAttachAnchor(item.id, anchor))
          .catch((error: Error) => onDebug(`anchor failed: ${error.name}: ${error.message}`));
      }
    },
    [onAttachAnchor, onDebug],
  );

  useFrame((state, _, frame) => {
    if (!frame) return;

    const now = performance.now();
    const referenceSpace = state.gl.xr.getReferenceSpace();
    const source = hitSourceRef.current;

    const [hit] = source && referenceSpace ? frame.getHitTestResults(source) : [];
    const pose = referenceSpace ? hit?.getPose(referenceSpace) : undefined;

    if (pose) {
      if (!sawHitRef.current) {
        sawHitRef.current = true;
        onDebug('surface found - reticle is live');
      }
      lastHitAtRef.current = now;
      lastHitMatrixRef.current.fromArray(pose.transform.matrix);
    }

    // A reading from the last fraction of a second still counts, so neither the
    // reticle nor a tap is thrown away by one empty frame.
    const surfaceFresh = now - lastHitAtRef.current < HIT_GRACE_MS;
    const reticle = reticleRef.current;
    if (reticle) {
      reticle.visible = surfaceFresh;
      if (surfaceFresh) reticle.matrix.copy(lastHitMatrixRef.current);
    }

    // Live edge from the last placed corner out to the reticle.
    const liveEdge = liveEdgeRef.current;
    if (!surfaceFresh || corners.length === 0 || corners.length >= CORNER_COUNT) {
      if (liveEdge) liveEdge.visible = false;
    } else if (liveEdge) {
      scratchMatrix.copy(lastHitMatrixRef.current);
      scratchCursor.setFromMatrixPosition(scratchMatrix);
      scratchNormal
        .set(0, 1, 0)
        .applyQuaternion(scratchQuaternion.setFromRotationMatrix(scratchMatrix));
      scratchDraw.copy(scratchCursor).addScaledVector(scratchNormal, SURFACE_LIFT);

      const from = drawPoints[drawPoints.length - 1];
      const span = from.distanceTo(scratchDraw);
      if (span < 1e-4) {
        liveEdge.visible = false;
      } else {
        liveEdge.visible = true;
        liveEdge.position.copy(from).add(scratchDraw).multiplyScalar(0.5);
        liveEdge.quaternion.setFromUnitVectors(
          UP,
          scratchDirection.subVectors(scratchDraw, from).normalize(),
        );
        liveEdge.scale.set(1, span, 1);
      }
    }

    if (referenceSpace) {
      drainPendingAnchors(frame, referenceSpace);

      frameCountRef.current += 1;
      if (frameCountRef.current % ANCHOR_SYNC_FRAMES === 0) {
        syncAnchors(frame, referenceSpace);
      }
    }

    // Status strip, refreshed twice a second.
    statsFramesRef.current += 1;
    if (pose) statsHitsRef.current += 1;
    if (statsSinceRef.current === 0) statsSinceRef.current = now;
    const elapsed = now - statsSinceRef.current;
    if (elapsed >= STATS_INTERVAL_MS) {
      onStats({
        hitSource: Boolean(source),
        refSpace: Boolean(referenceSpace),
        fps: Math.round((statsFramesRef.current * 1000) / elapsed),
        hits: statsHitsRef.current,
        anchors: anchorCount,
      });
      statsFramesRef.current = 0;
      statsHitsRef.current = 0;
      statsSinceRef.current = now;
    }
  });

  const handleSelect = useCallback(() => {
    const age = performance.now() - lastHitAtRef.current;
    if (lastHitAtRef.current === 0 || age > HIT_GRACE_MS) {
      onDebug(`tap ignored - no surface (last seen ${Math.round(age)}ms ago)`);
      return;
    }

    const matrix = lastHitMatrixRef.current;
    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);

    const id = nextCornerId++;
    onAddCorner({ id, position, quaternion });

    // Anchoring needs a live frame, so hand the exact pose to the next one.
    pendingAnchorsRef.current.push({
      id,
      position: position.clone(),
      quaternion: quaternion.clone(),
    });
  }, [onAddCorner, onDebug]);

  // Listen on the session itself. A phone tap arrives as a transient input
  // source, and a controller-level listener can be attached a beat too late to
  // catch the very tap that created it.
  useEffect(() => {
    if (!session) return;
    const listener = () => handleSelect();
    session.addEventListener('select', listener);
    return () => session.removeEventListener('select', listener);
  }, [session, handleSelect]);

  const outlineColor = metrics ? (metrics.isRectangular ? DOT_COLOR : WARN_COLOR) : LINE_COLOR;

  return (
    <>
      <ambientLight intensity={2} />

      {/* Surface reticle, hidden once the fourth corner lands */}
      <group ref={reticleRef} matrixAutoUpdate={false} visible={false}>
        {corners.length < CORNER_COUNT && (
          <group position={[0, SURFACE_LIFT, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
              <ringGeometry args={[0.019, 0.022, 40]} />
              <meshBasicMaterial color={DOT_COLOR} side={THREE.DoubleSide} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
              <circleGeometry args={[0.004, 20]} />
              <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
            </mesh>
          </group>
        )}
      </group>

      {/* Placed corners */}
      {corners.map((corner, index) => (
        <CornerDot key={corner.id} position={drawPoints[index]} color={outlineColor} />
      ))}

      {/* Outline */}
      {edges.map(([a, b], index) => (
        <Segment key={index} a={a} b={b} color={outlineColor} />
      ))}

      {/* Live edge from the last corner to the reticle */}
      <mesh ref={liveEdgeRef} visible={false} renderOrder={1}>
        <cylinderGeometry args={[0.0018, 0.0018, 1, 8]} />
        <meshBasicMaterial color={LINE_COLOR} transparent opacity={0.7} />
      </mesh>
    </>
  );
}
