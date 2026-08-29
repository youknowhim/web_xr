import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useHitTest, useXR } from '@react-three/xr';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import {
  CORNER_COUNT,
  SURFACE_LIFT,
  liftedPosition,
  midpoint,
  outlineEdges,
  surfaceNormal,
  toUnits,
} from './measure';
import type { Corner, RectangleMetrics } from './measure';

const UP = new THREE.Vector3(0, 1, 0);
const LABEL_LIFT = 0.07;

// Reused every frame so the hit-test callback allocates nothing.
const scratchCursor = new THREE.Vector3();
const scratchDraw = new THREE.Vector3();
const scratchNormal = new THREE.Vector3();
const scratchDirection = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();

type ARRulerProps = {
  corners: Corner[];
  metrics: RectangleMetrics | null;
  onAddCorner: (corner: Corner) => void;
  onLiveEdge: (meters: number | null) => void;
  onDebug?: (message: string) => void;
};

/** A cylinder stretched so it spans exactly from `a` to `b`. */
function Segment({
  a,
  b,
  color,
  radius = 0.004,
  opacity = 1,
  renderOrder = 0,
}: {
  a: THREE.Vector3;
  b: THREE.Vector3;
  color: string;
  radius?: number;
  opacity?: number;
  renderOrder?: number;
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
      renderOrder={renderOrder}
    >
      <cylinderGeometry args={[radius, radius, 1, 8]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} />
    </mesh>
  );
}

/** World-space text that always turns to face the camera. */
function Label({
  position,
  children,
  color = '#ffffff',
  fontSize = 0.045,
}: {
  position: THREE.Vector3;
  children: string;
  color?: string;
  fontSize?: number;
}) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ camera }) => {
    ref.current?.quaternion.copy(camera.quaternion);
  });

  return (
    <Text
      ref={ref}
      position={position}
      fontSize={fontSize}
      color={color}
      outlineWidth={fontSize * 0.09}
      outlineColor="#000000"
      anchorX="center"
      anchorY="middle"
      textAlign="center"
      lineHeight={1.2}
      renderOrder={4}
    >
      {children}
    </Text>
  );
}

export default function ARRuler({
  corners,
  metrics,
  onAddCorner,
  onLiveEdge,
  onDebug,
}: ARRulerProps) {
  const reticleRef = useRef<THREE.Group>(null);
  const spinnerRef = useRef<THREE.Mesh>(null);
  const liveEdgeRef = useRef<THREE.Mesh>(null);

  const session = useXR((state) => state.session);

  // Only push a live length upward when the displayed value would actually
  // change, so the HUD is not re-rendering 60 times a second.
  const lastLiveRef = useRef<string | null>(null);
  const sawHitRef = useRef(false);

  // Graphics float just off the surface; measurements use the true points.
  const drawPoints = useMemo(() => corners.map(liftedPosition), [corners]);
  const edges = useMemo(() => outlineEdges(drawPoints), [drawPoints]);

  const planeNormal = useMemo(() => {
    const normal = new THREE.Vector3();
    for (const corner of corners) normal.add(surfaceNormal(corner));
    return normal.lengthSq() < 1e-9 ? new THREE.Vector3(0, 1, 0) : normal.normalize();
  }, [corners]);

  useEffect(() => {
    if (!session) return;
    sawHitRef.current = false;
    lastLiveRef.current = null;
    if (liveEdgeRef.current) liveEdgeRef.current.visible = false;
    if (reticleRef.current) reticleRef.current.visible = false;
    onDebug?.(
      `hit-test API: ${typeof session.requestHitTestSource === 'function' ? 'available' : 'MISSING'}`,
    );
  }, [session, onDebug]);

  useHitTest((hitMatrix) => {
    if (!sawHitRef.current) {
      sawHitRef.current = true;
      onDebug?.('surface found - reticle is live');
    }

    const reticle = reticleRef.current;
    if (reticle) {
      reticle.visible = true;
      reticle.matrix.copy(hitMatrix);
    }

    const liveEdge = liveEdgeRef.current;
    const drawingOutline = corners.length > 0 && corners.length < CORNER_COUNT;

    if (!drawingOutline) {
      if (liveEdge) liveEdge.visible = false;
      if (lastLiveRef.current !== null) {
        lastLiveRef.current = null;
        onLiveEdge(null);
      }
      return;
    }

    const last = corners[corners.length - 1];
    scratchCursor.setFromMatrixPosition(hitMatrix);
    const distance = last.position.distanceTo(scratchCursor);

    if (liveEdge) {
      if (distance < 1e-4) {
        liveEdge.visible = false;
      } else {
        scratchNormal.set(0, 1, 0).applyQuaternion(scratchQuaternion.setFromRotationMatrix(hitMatrix));
        scratchDraw.copy(scratchCursor).addScaledVector(scratchNormal, SURFACE_LIFT);

        const from = drawPoints[drawPoints.length - 1];
        liveEdge.visible = true;
        liveEdge.position.copy(from).add(scratchDraw).multiplyScalar(0.5);
        liveEdge.quaternion.setFromUnitVectors(
          UP,
          scratchDirection.subVectors(scratchDraw, from).normalize(),
        );
        liveEdge.scale.set(1, from.distanceTo(scratchDraw), 1);
      }
    }

    const rounded = toUnits(distance).cm;
    if (rounded !== lastLiveRef.current) {
      lastLiveRef.current = rounded;
      onLiveEdge(distance);
    }
  });

  const handleSelect = useCallback(() => {
    const reticle = reticleRef.current;
    if (!reticle || !reticle.visible) {
      onDebug?.('tap ignored - aim at a surface first');
      return;
    }
    onAddCorner({
      position: new THREE.Vector3().setFromMatrixPosition(reticle.matrix),
      quaternion: new THREE.Quaternion().setFromRotationMatrix(reticle.matrix),
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

  useFrame((_, delta) => {
    if (spinnerRef.current) spinnerRef.current.rotation.z += delta * 1.5;
  });

  const outlineColor = metrics ? (metrics.isRectangular ? '#10b981' : '#f59e0b') : '#38bdf8';

  const labels = useMemo(() => {
    if (!metrics) return null;
    const length = toUnits(metrics.length);
    const breadth = toUnits(metrics.breadth);
    return {
      length: {
        position: metrics.lengthAnchor.clone().addScaledVector(planeNormal, LABEL_LIFT),
        text: `L  ${length.cm} cm\n${length.inches} in`,
      },
      breadth: {
        position: metrics.breadthAnchor.clone().addScaledVector(planeNormal, LABEL_LIFT),
        text: `B  ${breadth.cm} cm\n${breadth.inches} in`,
      },
    };
  }, [metrics, planeNormal]);

  return (
    <>
      <ambientLight intensity={2} />
      <directionalLight position={[1, 4, 2]} intensity={3} />

      {/* Surface reticle. Hidden once the shape is closed so it stops
          overlapping the finished outline. */}
      <group ref={reticleRef} matrixAutoUpdate={false} visible={false}>
        {corners.length < CORNER_COUNT && (
          <group position={[0, SURFACE_LIFT, 0]}>
            <mesh ref={spinnerRef} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
              <ringGeometry args={[0.03, 0.035, 32]} />
              <meshBasicMaterial
                color="#38bdf8"
                transparent
                opacity={0.9}
                side={THREE.DoubleSide}
              />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
              <circleGeometry args={[0.005, 32]} />
              <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
            </mesh>
          </group>
        )}
      </group>

      {/* Placed corners, oriented to the surface they landed on */}
      {corners.map((corner, index) => (
        <group key={index} position={drawPoints[index]} quaternion={corner.quaternion}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
            <ringGeometry args={[0.014, 0.019, 32]} />
            <meshBasicMaterial
              color={index === 0 ? '#10b981' : '#ffffff'}
              transparent
              opacity={0.6}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh position={[0, 0.008, 0]} renderOrder={2}>
            <sphereGeometry args={[0.008, 16, 16]} />
            <meshStandardMaterial
              color={index === 0 ? '#10b981' : '#ffffff'}
              roughness={0.1}
              metalness={0.5}
            />
          </mesh>
        </group>
      ))}

      {/* Outline edges */}
      {edges.map(([a, b], index) => (
        <Segment key={index} a={a} b={b} color={outlineColor} opacity={0.9} renderOrder={1} />
      ))}

      {/* Live edge from the last corner to the reticle */}
      <mesh ref={liveEdgeRef} visible={false} renderOrder={1}>
        <cylinderGeometry args={[0.003, 0.003, 1, 8]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.6} />
      </mesh>

      {/* Diagonals, drawn once the shape closes so the match score is visible */}
      {metrics && (
        <>
          <Segment
            a={drawPoints[0]}
            b={drawPoints[2]}
            color={outlineColor}
            radius={0.0015}
            opacity={0.4}
            renderOrder={1}
          />
          <Segment
            a={drawPoints[1]}
            b={drawPoints[3]}
            color={outlineColor}
            radius={0.0015}
            opacity={0.4}
            renderOrder={1}
          />
        </>
      )}

      {/* Result labels */}
      {labels && (
        <>
          <Label position={labels.length.position}>{labels.length.text}</Label>
          <Label position={labels.breadth.position} color="#7dd3fc">
            {labels.breadth.text}
          </Label>
        </>
      )}
    </>
  );
}
