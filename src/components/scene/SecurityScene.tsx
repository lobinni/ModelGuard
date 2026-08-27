"use client";

import { Suspense } from "react";

import { Canvas } from "@react-three/fiber";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { AuditPhase } from "@/types/model";

import { HolographicShield } from "./HolographicShield";
import { ParticleField } from "./ParticleField";
import { ValidatorLattice } from "./ValidatorLattice";

const PHASE_COLORS: Record<AuditPhase, string> = {
  idle: "#22d3ee",
  preparing: "#38bdf8",
  "leader-analysis": "#fbbf24",
  "validator-replay": "#fbbf24",
  "vote-reveal": "#a78bfa",
  finalized: "#34d399",
  failed: "#fb7185",
};

interface SecuritySceneProps {
  phase: AuditPhase;
}

export function SecurityScene({ phase }: SecuritySceneProps) {
  const reducedMotion = useReducedMotion();
  const color = PHASE_COLORS[phase];
  const energized =
    phase === "leader-analysis" ||
    phase === "validator-replay" ||
    phase === "vote-reveal";

  return (
    <div className="security-scene" aria-hidden="true">
      <Canvas
        camera={{ position: [0, 1.1, 7.4], fov: 46 }}
        dpr={[1, 1.8]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        frameloop={reducedMotion ? "demand" : "always"}
      >
        <fog attach="fog" args={["#030812", 9, 22]} />
        <ambientLight intensity={0.45} />
        <pointLight position={[6, 6, 6]} intensity={60} distance={20} color={color} />
        <pointLight position={[-6, -4, -4]} intensity={24} distance={18} color="#8b5cf6" />
        <Suspense fallback={null}>
          <HolographicShield color={color} phase={phase} />
          <ValidatorLattice
            color={color}
            energized={energized || phase === "finalized"}
          />
          <ParticleField color={color} />
        </Suspense>
      </Canvas>
    </div>
  );
}
