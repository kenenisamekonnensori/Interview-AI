"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sphere } from "@react-three/drei";
import * as THREE from "three";

/**
 * Acoustic Voice Orb Palette:
 * Calibrated specifically for the warm travertine/limestone architectural canvas (#e6e0d5).
 * Translucent frosted alabaster glass, glowing internal champagne/gold core,
 * and a delicate specular fresnel rim with subtle live acoustic resonance.
 */
const ORB_COLORS = {
  core: "#dfc185", // glowing internal voice core (warm champagne amber)
  subsurface: "#ded2be", // frosted translucent alabaster mid-tone
  highlight: "#fdfbf7", // lit crest / pristine ivory silk
  rim: "#fff5de", // specular fresnel grazing radiance
  halo: "#f0dcb2", // soft ambient acoustic halo
  beacon: "#ffffff", // active audio sampling pulse
  beaconGlow: "#e8c98a",
  ring: "#cba25f", // precision acoustic frequency ribbon
} as const;

/**
 * 3D procedural acoustic standing wave shader.
 * Displaces surface vertices in rhythmic vocal harmonics (speech resonances)
 * rather than dark astronomical craters.
 */
const ACOUSTIC_SHADER = {
  vertexShader: /* glsl */ `
    uniform float uTime;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;

      // Harmonic standing sound waves (simulating vocal resonance)
      float wave1 = sin(position.y * 3.8 + uTime * 1.3) * 0.026;
      float wave2 = cos(position.x * 3.2 - uTime * 0.9) * 0.022;
      float wave3 = sin(position.z * 4.2 + uTime * 1.1) * 0.018;
      float voiceRipple = sin(length(position.xy) * 5.5 - uTime * 2.2) * 0.015;

      vec3 displaced = position + normal * (wave1 + wave2 + wave3 + voiceRipple);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uCoreColor;
    uniform vec3 uSubsurfaceColor;
    uniform vec3 uHighlightColor;
    uniform vec3 uRimColor;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
      // Fluid acoustic surface modulation
      float ripple = sin(vPosition.y * 3.5 + uTime * 1.2) * 0.5 + 0.5;
      float ripple2 = cos(vPosition.x * 3.0 - uTime * 0.8) * 0.5 + 0.5;
      float acousticTexture = mix(ripple, ripple2, 0.5);

      // Translucent frosted alabaster to warm champagne core gradient
      vec3 surfaceColor = mix(uSubsurfaceColor, uHighlightColor, smoothstep(0.2, 0.85, acousticTexture));
      vec3 innerCoreGlow = mix(uCoreColor, surfaceColor, 0.55);

      // Specular Fresnel rim lighting (translucent glass effect)
      vec3 viewDir = normalize(cameraPosition - vPosition);
      float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 2.4);
      vec3 rimGlow = uRimColor * fresnel * 1.45;

      // Gentle vocal breath pulse
      float breath = sin(uTime * 0.75) * 0.06 + 0.94;

      // Delicate acoustic horizon rim
      vec3 finalColor = innerCoreGlow + rimGlow * breath;
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `,
};

function AcousticOrb() {
  const meshRef = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uCoreColor: { value: new THREE.Color(ORB_COLORS.core) },
      uSubsurfaceColor: { value: new THREE.Color(ORB_COLORS.subsurface) },
      uHighlightColor: { value: new THREE.Color(ORB_COLORS.highlight) },
      uRimColor: { value: new THREE.Color(ORB_COLORS.rim) },
    }),
    [],
  );

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    uniforms.uTime.value = t;
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.04;
      meshRef.current.rotation.x = Math.sin(t * 0.02) * 0.05;
    }
  });

  return (
    // Sized to a refined, balanced 1.22 radius (instead of the previous bulky 2.0)
    <Sphere ref={meshRef} args={[1.22, 64, 64]}>
      <shaderMaterial
        vertexShader={ACOUSTIC_SHADER.vertexShader}
        fragmentShader={ACOUSTIC_SHADER.fragmentShader}
        uniforms={uniforms}
      />
    </Sphere>
  );
}

/**
 * Atmospheric Acoustic Halo:
 * Casts a warm, gentle ambient glow into the surrounding blueprint grid,
 * creating depth without visual weight.
 */
function AcousticHalo() {
  const uniforms = useMemo(
    () => ({
      uGlowColor: { value: new THREE.Color(ORB_COLORS.halo) },
      uTime: { value: 0 },
    }),
    [],
  );

  useFrame((state) => {
    uniforms.uTime.value = state.clock.getElapsedTime();
  });

  return (
    <Sphere args={[1.55, 32, 32]}>
      <shaderMaterial
        transparent
        depthWrite={false}
        side={THREE.BackSide}
        uniforms={uniforms}
        vertexShader={
          /* glsl */ `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `
        }
        fragmentShader={
          /* glsl */ `
          uniform vec3 uGlowColor;
          uniform float uTime;
          varying vec3 vNormal;
          void main() {
            float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.8);
            float pulse = sin(uTime * 0.5) * 0.08 + 0.92;
            vec3 glow = uGlowColor * intensity * pulse * 1.1;
            float alpha = intensity * pulse * 0.35;
            gl_FragColor = vec4(glow, alpha);
          }
        `
        }
      />
    </Sphere>
  );
}

/**
 * Acoustic Soundwave Rings:
 * Expanding planar soundwaves that pulse outwards rhythmically,
 * visually demonstrating voice turn-taking and auditory processing.
 */
function AcousticPulseRipples() {
  const ripple1 = useRef<THREE.Mesh>(null);
  const ripple2 = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (ripple1.current) {
      const p1 = (t * 0.35) % 1;
      const s1 = 1.25 + p1 * 0.9;
      ripple1.current.scale.set(s1, s1, s1);
      const mat = ripple1.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.22 * (1 - p1));
    }
    if (ripple2.current) {
      const p2 = (t * 0.35 + 0.5) % 1;
      const s2 = 1.25 + p2 * 0.9;
      ripple2.current.scale.set(s2, s2, s2);
      const mat = ripple2.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.22 * (1 - p2));
    }
  });

  return (
    <>
      <mesh ref={ripple1}>
        <ringGeometry args={[1.0, 1.012, 64]} />
        <meshBasicMaterial color="#dfc185" transparent opacity={0.2} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ripple2} rotation={[0.3, 0.2, 0]}>
        <ringGeometry args={[1.0, 1.012, 64]} />
        <meshBasicMaterial color="#cba25f" transparent opacity={0.2} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

/**
 * Slender Harmonic Resonance Ribbons:
 * Precision wire loops representing voice frequencies and real-time turn-taking.
 */
function HarmonicRibbons() {
  const ring1Ref = useRef<THREE.Group>(null);
  const ring2Ref = useRef<THREE.Group>(null);
  const beaconRef = useRef<THREE.Mesh>(null);
  const beaconPulseRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (ring1Ref.current) {
      ring1Ref.current.rotation.z = t * 0.08;
      ring1Ref.current.rotation.x = 0.45 + Math.sin(t * 0.05) * 0.06;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.z = -t * 0.06;
      ring2Ref.current.rotation.y = 0.3 + Math.cos(t * 0.04) * 0.08;
    }

    if (beaconRef.current) {
      const angle = t * 0.5;
      beaconRef.current.position.x = Math.cos(angle) * 1.72;
      beaconRef.current.position.y = Math.sin(angle) * 1.72;
    }
    if (beaconPulseRef.current) {
      const scale = 1 + Math.sin(t * 3.5) * 0.28;
      beaconPulseRef.current.scale.set(scale, scale, scale);
    }
  });

  return (
    <>
      <AcousticPulseRipples />

      {/* Ring 1 — Slender harmonic carrier ring */}
      <group ref={ring1Ref} rotation={[0.4, 0.2, 0]}>
        <mesh>
          <torusGeometry args={[1.48, 0.007, 16, 100]} />
          <meshBasicMaterial color={ORB_COLORS.ring} transparent opacity={0.4} />
        </mesh>
      </group>

      {/* Ring 2 — Audio sampling orbit with glowing micro-beacon */}
      <group ref={ring2Ref} rotation={[-0.25, 0.3, 0]}>
        <mesh>
          <torusGeometry args={[1.72, 0.009, 16, 120]} />
          <meshBasicMaterial color="#b78a44" transparent opacity={0.5} />
        </mesh>
        {/* Audio sampling needle beacon */}
        <mesh ref={beaconRef}>
          <sphereGeometry args={[0.045, 16, 16]} />
          <meshBasicMaterial color={ORB_COLORS.beacon} />
          <mesh ref={beaconPulseRef}>
            <sphereGeometry args={[0.09, 16, 16]} />
            <meshBasicMaterial color={ORB_COLORS.beaconGlow} transparent opacity={0.45} />
          </mesh>
        </mesh>
      </group>
    </>
  );
}

/**
 * Staging Group:
 * Positions the Acoustic Voice Orb in the upper-right ambient quadrant,
 * hovering behind and slightly above the Mock Interview Console.
 * Gracefully recedes with scroll and gently responds to pointer parallax.
 */
function AcousticOrbGroup() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const group = groupRef.current;
    if (!group) return;
    const { x, y } = state.pointer;
    const scrollY = typeof window !== "undefined" ? window.scrollY : 0;
    const scrollFactor = Math.min(scrollY / 1200, 1.2);

    // Elegant positioning:
    // Floating at x=2.35, y=0.9, z=-0.3. Refined scale that frames the console.
    const targetX = 2.35 + x * 0.25 + scrollFactor * 0.3;
    const targetY = 0.9 + y * 0.18 - scrollFactor * 1.5;
    const targetZ = -0.3 - scrollFactor * 2.0;

    group.position.x = THREE.MathUtils.lerp(group.position.x, targetX, 0.035);
    group.position.y = THREE.MathUtils.lerp(group.position.y, targetY, 0.035);
    group.position.z = THREE.MathUtils.lerp(group.position.z, targetZ, 0.035);

    group.rotation.x = THREE.MathUtils.lerp(
      group.rotation.x,
      -y * 0.15 + scrollFactor * 0.3,
      0.035,
    );
    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, x * 0.2 + scrollFactor * 0.6, 0.035);
  });

  return (
    <group ref={groupRef} position={[2.35, 0.9, -0.3]}>
      <AcousticOrb />
      <AcousticHalo />
      <HarmonicRibbons />
    </group>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.45} />
      {/* Warm key light matching the travertine studio atmosphere */}
      <pointLight position={[4.5, 3.0, 4.0]} intensity={1.2} color="#fff6e5" />
      <pointLight position={[-3.0, -1.5, 2.5]} intensity={0.3} color="#dfc185" />

      <AcousticOrbGroup />
    </>
  );
}

/**
 * Reimagined 3D Acoustic Voice Centerpiece:
 * Clean, luminous, and purposeful. Visualizes conversational voice intelligence
 * without overwhelming the hero or cluttering the interface.
 */
export function MoonScene() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <Canvas
        camera={{ position: [0, 0, 6.0], fov: 42 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
