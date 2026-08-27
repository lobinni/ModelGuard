"use client";

import { useMemo, useRef } from "react";

import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface ValidatorLatticeProps {
  color: string;
  energized: boolean;
}

const NODE_POSITIONS: [number, number, number][] = Array.from(
  { length: 5 },
  (_, index) => {
    const angle = (index / 5) * Math.PI * 2 - Math.PI / 2;
    return [Math.cos(angle) * 2.9, Math.sin(angle) * 0.55, Math.sin(angle) * 2.9];
  },
);

export function ValidatorLattice({ color, energized }: ValidatorLatticeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const ringMaterialRef = useRef<THREE.LineBasicMaterial>(null);

  const ringGeometry = useMemo(() => {
    const points = NODE_POSITIONS.map(
      (position) => new THREE.Vector3(...position),
    );
    return new THREE.BufferGeometry().setFromPoints(points);
  }, []);

  const spokesGeometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    for (const position of NODE_POSITIONS) {
      points.push(new THREE.Vector3(0, 0, 0));
      points.push(new THREE.Vector3(...position));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, []);

  const targetColor = useMemo(() => new THREE.Color(color), [color]);
  const targetRef = useRef(targetColor);
  targetRef.current = targetColor;

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * (energized ? 0.45 : 0.16);
    }
    materialRefs.current.forEach((material, index) => {
      if (!material) {
        return;
      }
      const pulse =
        0.85 + Math.sin(time * (energized ? 4.4 : 1.6) + index * 1.3) * 0.45;
      material.emissiveIntensity = energized ? pulse * 1.6 : pulse;
      material.emissive.lerp(targetRef.current, 0.05);
    });
    if (ringMaterialRef.current) {
      ringMaterialRef.current.color.lerp(targetRef.current, 0.05);
      ringMaterialRef.current.opacity = energized ? 0.55 : 0.3;
    }
  });

  return (
    <group ref={groupRef} rotation={[-0.35, 0, 0]} position={[0, 1.15, 0]}>
      <lineLoop geometry={ringGeometry}>
        <lineBasicMaterial
          ref={ringMaterialRef}
          color={color}
          transparent
          opacity={0.3}
        />
      </lineLoop>
      <lineSegments geometry={spokesGeometry}>
        <lineBasicMaterial color={color} transparent opacity={0.14} />
      </lineSegments>
      {NODE_POSITIONS.map((position, index) => (
        <mesh key={position.join(",")} position={position}>
          <octahedronGeometry args={[0.16, 0]} />
          <meshStandardMaterial
            ref={(material) => {
              materialRefs.current[index] = material;
            }}
            color="#0b1526"
            emissive={color}
            emissiveIntensity={1}
            flatShading
          />
        </mesh>
      ))}
    </group>
  );
}
