"use client";

import { useMemo, useRef } from "react";

import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AuditPhase } from "@/types/model";

interface HolographicShieldProps {
  color: string;
  phase: AuditPhase;
}

export function HolographicShield({ color, phase }: HolographicShieldProps) {
  const groupRef = useRef<THREE.Group>(null);
  const wireRef = useRef<THREE.MeshBasicMaterial>(null);
  const coreRef = useRef<THREE.MeshStandardMaterial>(null);
  const ringARef = useRef<THREE.Mesh>(null);
  const ringBRef = useRef<THREE.Mesh>(null);

  const targetColor = useMemo(() => new THREE.Color(color), [color]);
  const targetRef = useRef(targetColor);
  targetRef.current = targetColor;

  const energized =
    phase === "leader-analysis" ||
    phase === "validator-replay" ||
    phase === "vote-reveal";

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * (energized ? 0.55 : 0.22);
      groupRef.current.rotation.x =
        Math.sin(time * 0.35) * 0.16 + (phase === "failed" ? 0.35 : 0);
      groupRef.current.position.y = Math.sin(time * 0.8) * 0.12 + 0.35;
    }
    if (wireRef.current) {
      wireRef.current.color.lerp(targetRef.current, 0.06);
      wireRef.current.opacity = phase === "finalized" ? 0.75 : 0.45;
    }
    if (coreRef.current) {
      coreRef.current.emissive.lerp(targetRef.current, 0.06);
      coreRef.current.emissiveIntensity =
        0.7 + Math.sin(time * (energized ? 5 : 1.7)) * 0.3;
    }
    if (ringARef.current) {
      ringARef.current.rotation.z += delta * (energized ? 1.1 : 0.35);
    }
    if (ringBRef.current) {
      ringBRef.current.rotation.z -= delta * (energized ? 0.8 : 0.25);
    }
  });

  return (
    <group ref={groupRef} position={[0, 0.35, 0]}>
      <mesh>
        <icosahedronGeometry args={[1.45, 1]} />
        <meshBasicMaterial
          ref={wireRef}
          wireframe
          transparent
          opacity={0.45}
          color={color}
        />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[1.1, 0]} />
        <meshStandardMaterial
          ref={coreRef}
          color="#0a1322"
          emissive={color}
          emissiveIntensity={0.8}
          transparent
          opacity={0.32}
          flatShading
        />
      </mesh>
      <mesh ref={ringARef} rotation={[Math.PI / 2.15, 0, 0]}>
        <torusGeometry args={[2.05, 0.012, 12, 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} />
      </mesh>
      <mesh ref={ringBRef} rotation={[Math.PI / 1.75, 0.4, 0]}>
        <torusGeometry args={[2.4, 0.008, 12, 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} />
      </mesh>
    </group>
  );
}
