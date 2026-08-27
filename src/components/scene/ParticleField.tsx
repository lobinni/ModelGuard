"use client";

import { useMemo, useRef } from "react";

import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface ParticleFieldProps {
  color: string;
  count?: number;
}

export function ParticleField({ color, count = 1300 }: ParticleFieldProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);

  const positions = useMemo(() => {
    const array = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const radius = 5 + Math.random() * 9.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      array[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      array[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.62;
      array[index * 3 + 2] = radius * Math.cos(phi);
    }
    return array;
  }, [count]);

  const targetColor = useMemo(() => new THREE.Color(color), [color]);

  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.014;
      pointsRef.current.rotation.x += delta * 0.004;
    }
    if (materialRef.current) {
      materialRef.current.color.lerp(targetColor, 0.03);
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={materialRef}
        size={0.045}
        transparent
        opacity={0.6}
        sizeAttenuation
        depthWrite={false}
        color={color}
      />
    </points>
  );
}
