import { useState, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useHitTest, useXREvent } from '@react-three/xr';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';

export default function ARRuler({ onUpdate }: { onUpdate: (cm: string, inches: string, step: number) => void }) {
  const [points, setPoints] = useState<THREE.Vector3[]>([]);
  
  const reticleRef = useRef<THREE.Group>(null);
  const innerCursorRef = useRef<THREE.Mesh>(null);
  const textRef = useRef<any>(null);

  const pointsRef = useRef<THREE.Vector3[]>([]);
  pointsRef.current = points;

  // Helper to calculate exact units
  const calculateUnits = (distanceInMeters: number) => {
    const cm = (distanceInMeters * 100).toFixed(1);
    const inches = (distanceInMeters * 39.3701).toFixed(1);
    return { cm, inches };
  };

  useHitTest((hitMatrix) => {
    if (reticleRef.current) {
      reticleRef.current.visible = true;
      reticleRef.current.matrix.copy(hitMatrix);
    }

    const currentPoints = pointsRef.current;

    // LIVE PREVIEW STATE
    if (currentPoints.length === 1) {
      const currentPosition = new THREE.Vector3().setFromMatrixPosition(hitMatrix);
      const distance = currentPoints[0].distanceTo(currentPosition);
      const { cm, inches } = calculateUnits(distance);
      
      onUpdate(cm, inches, 1);

      if (textRef.current) {
        textRef.current.text = `${cm} cm\n(${inches}")`;
        const midPoint = new THREE.Vector3().addVectors(currentPoints[0], currentPosition).multiplyScalar(0.5);
        midPoint.y += 0.08; // Float slightly higher for readability
        textRef.current.position.copy(midPoint);
        textRef.current.visible = true;
      }
    }
  });

  useXREvent('select', () => {
    if (reticleRef.current && reticleRef.current.visible) {
      const position = new THREE.Vector3();
      position.setFromMatrixPosition(reticleRef.current.matrix);
      
      setPoints((prev) => {
        if (prev.length === 0) {
          onUpdate("0.0", "0.0", 1);
          return [position];
        } else if (prev.length === 1) {
          const distance = prev[0].distanceTo(position);
          const { cm, inches } = calculateUnits(distance);
          onUpdate(cm, inches, 2);
          
          if (textRef.current) {
            textRef.current.text = `${cm} cm\n(${inches}")`;
            const midPoint = new THREE.Vector3().addVectors(prev[0], position).multiplyScalar(0.5);
            midPoint.y += 0.08;
            textRef.current.position.copy(midPoint);
            textRef.current.visible = true;
          }
          return [prev[0], position];
        } else {
          onUpdate("0.0", "0.0", 0);
          if (textRef.current) textRef.current.visible = false;
          return [position]; 
        }
      });
    }
  });

  useFrame(({ camera }, delta) => {
    if (innerCursorRef.current) {
      innerCursorRef.current.rotation.z += delta * 1.5; // Faster, sleeker spin
    }
    if (textRef.current && textRef.current.visible) {
      textRef.current.quaternion.copy(camera.quaternion); // Always face the user
    }
  });

  // PROFESSIONAL UPGRADE: A physical 3D tube instead of a flat 1px line
  const activeTubeGeometry = useMemo(() => {
    if (points.length === 1 && reticleRef.current) {
      const currentPos = new THREE.Vector3().setFromMatrixPosition(reticleRef.current.matrix);
      const path = new THREE.LineCurve3(points[0], currentPos);
      return new THREE.TubeGeometry(path, 20, 0.003, 8, false);
    }
    return null;
  }, [points, reticleRef.current?.matrix]); // Re-calculate as phone moves

  const lockedTubeGeometry = useMemo(() => {
    if (points.length === 2) {
      const path = new THREE.LineCurve3(points[0], points[1]);
      return new THREE.TubeGeometry(path, 20, 0.003, 8, false);
    }
    return null;
  }, [points]);

  return (
    <>
      <ambientLight intensity={2} />
      <directionalLight position={[1, 4, 2]} intensity={3} />
      
      {/* Precision Reticle */}
      <group ref={reticleRef} matrixAutoUpdate={false} visible={false}>
        <mesh ref={innerCursorRef} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.03, 0.035, 32]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.9} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.005, 32]} />
          <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* Sleek Topographic Anchors */}
      {points.map((p, i) => (
        <group key={i} position={p}>
          <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.015, 0.02, 32]} />
            <meshBasicMaterial color={i === 0 ? "#10b981" : "#ffffff"} transparent opacity={0.5} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.008, 32, 32]} />
            <meshStandardMaterial color={i === 0 ? "#10b981" : "#ffffff"} roughness={0.1} metalness={0.5} />
          </mesh>
        </group>
      ))}

      {/* Live Glowing Tube */}
      {points.length === 1 && activeTubeGeometry && (
        <mesh geometry={activeTubeGeometry}>
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.6} />
        </mesh>
      )}

      {/* Locked Solid Tube */}
      {points.length === 2 && lockedTubeGeometry && (
        <mesh geometry={lockedTubeGeometry}>
          <meshStandardMaterial color="#ffffff" emissive="#444444" roughness={0.2} metalness={0.8} />
        </mesh>
      )}

      {/* High-Contrast Dual-Unit 3D Text */}
      <Text
        ref={textRef}
        visible={false}
        fontSize={0.05}
        color="#ffffff"
        outlineWidth={0.004}
        outlineColor="#000000"
        anchorX="center"
        anchorY="middle"
        textAlign="center"
        lineHeight={1.2}
      >
        0.0 cm
      </Text>
    </>
  );
}