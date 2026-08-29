import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useHitTest, useXR } from '@react-three/xr';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { CORNER_COUNT, midpoint, outlineEdges, toUnits } from './measure';
import type { RectangleMetrics } from './measure';

const UP = new THREE.Vector3(0, 1, 0);
const LABEL_LIFT = 0.06;

type ARRulerProps = {
  corners: THREE.Vector3[];
  metrics: RectangleMetrics | null;
  onAddCorner: (corner: THREE.Vector3) => void;
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
}: {
  a: THREE.Vector3;
  b: THREE.Vector3;
  color: string;
  radius?: number;
  opacity?: number;
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

  useEffect(() => {
    if (!session) return;
    sawHitRef.current = false;
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

    const placed = corners;
    const liveEdge = liveEdgeRef.current;
    const drawingOutline = placed.length > 0 && placed.length < CORNER_COUNT;

    if (!drawingOutline) {
      if (liveEdge) liveEdge.visible = false;
      if (lastLiveRef.current !== null) {
        lastLiveRef.current = null;
        onLiveEdge(null);
      }
      return;
    }

    const cursor = new THREE.Vector3().setFromMatrixPosition(hitMatrix);
    const from = placed[placed.length - 1];
    const distance = from.distanceTo(cursor);

    if (liveEdge) {
      if (distance < 1e-4) {
        liveEdge.visible = false;
      } else {
        liveEdge.visible = true;
        liveEdge.position.copy(midpoint(from, cursor));
        liveEdge.quaternion.setFromUnitVectors(
          UP,
          new THREE.Vector3().subVectors(cursor, from).normalize(),
        );
        liveEdge.scale.set(1, distance, 1);
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
    onAddCorner(new THREE.Vector3().setFromMatrixPosition(reticle.matrix));
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

  const edges = useMemo(() => outlineEdges(corners), [corners]);
  const outlineColor = metrics ? (metrics.isRectangular ? '#10b981' : '#f59e0b') : '#38bdf8';

  const lengthLabel = useMemo(() => {
    if (!metrics) return null;
    const units = toUnits(metrics.length);
    return {
      position: metrics.lengthAnchor.clone().setY(metrics.lengthAnchor.y + LABEL_LIFT),
      text: `L  ${units.cm} cm\n${units.inches} in`,
    };
  }, [metrics]);

  const breadthLabel = useMemo(() => {
    if (!metrics) return null;
    const units = toUnits(metrics.breadth);
    return {
      position: metrics.breadthAnchor.clone().setY(metrics.breadthAnchor.y + LABEL_LIFT),
      text: `B  ${units.cm} cm\n${units.inches} in`,
    };
  }, [metrics]);

  return (
    <>
      <ambientLight intensity={2} />
      <directionalLight position={[1, 4, 2]} intensity={3} />

      {/* Surface reticle */}
      <group ref={reticleRef} matrixAutoUpdate={false} visible={false}>
        <mesh ref={spinnerRef} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.03, 0.035, 32]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.9} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.005, 32]} />
          <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* Placed corners */}
      {corners.map((corner, index) => (
        <group key={index} position={corner}>
          <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.015, 0.02, 32]} />
            <meshBasicMaterial
              color={index === 0 ? '#10b981' : '#ffffff'}
              transparent
              opacity={0.5}
            />
          </mesh>
          <mesh>
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
        <Segment key={index} a={a} b={b} color={outlineColor} opacity={0.9} />
      ))}

      {/* Live edge from the last corner to the reticle */}
      <mesh ref={liveEdgeRef} visible={false}>
        <cylinderGeometry args={[0.003, 0.003, 1, 8]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.6} />
      </mesh>

      {/* Diagonals, drawn once the shape closes so the match score is visible */}
      {metrics && (
        <>
          <Segment
            a={corners[0]}
            b={corners[2]}
            color={outlineColor}
            radius={0.0015}
            opacity={0.45}
          />
          <Segment
            a={corners[1]}
            b={corners[3]}
            color={outlineColor}
            radius={0.0015}
            opacity={0.45}
          />
        </>
      )}

      {/* Result labels */}
      {lengthLabel && <Label position={lengthLabel.position}>{lengthLabel.text}</Label>}
      {breadthLabel && (
        <Label position={breadthLabel.position} color="#7dd3fc">
          {breadthLabel.text}
        </Label>
      )}
    </>
  );
}
