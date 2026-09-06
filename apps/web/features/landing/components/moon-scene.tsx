"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sphere, Stars } from "@react-three/drei";
import * as THREE from "three";

/**
 * Warm-lit moon: a bronze key light from the upper right (like a lamp in a
 * dim interview room) instead of the previous indigo fill.
 */
const MOON_COLORS = {
  deep: "#221607", // shadow craters — warm near-black
  mid: "#5c4322", // mid-tone regolith
  high: "#b08a4d", // lit highlands
  rim: "#e8c98a", // fresnel rim light
  glow: "#cba25f", // atmospheric halo
  particle: "#dcbd7e", // ambient dust
} as const;

/* Shared simplex noise — identical implementation for vertex + fragment stages. */
const SIMPLEX_GLSL = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.zzww*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
`;

function Moon() {
  const meshRef = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor1: { value: new THREE.Color(MOON_COLORS.deep) },
      uColor2: { value: new THREE.Color(MOON_COLORS.mid) },
      uColor3: { value: new THREE.Color(MOON_COLORS.high) },
      uGlowColor: { value: new THREE.Color(MOON_COLORS.rim) },
    }),
    [],
  );

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    uniforms.uTime.value = t;
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.05;
      meshRef.current.rotation.x = Math.sin(t * 0.03) * 0.1;
    }
  });

  return (
    <Sphere ref={meshRef} args={[2, 64, 64]}>
      <shaderMaterial
        vertexShader={/* glsl */ `
          varying vec2 vUv;
          varying vec3 vNormal;
          varying vec3 vPosition;
          ${SIMPLEX_GLSL}
          void main() {
            vUv = uv;
            vNormal = normalize(normalMatrix * normal);
            vPosition = position;
            // Displace vertices for crater-like surface
            float noise = snoise(position * 2.0) * 0.08;
            float craters = snoise(position * 5.0) * 0.03;
            vec3 displaced = position + normal * (noise + craters);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          uniform float uTime;
          uniform vec3 uColor1;
          uniform vec3 uColor2;
          uniform vec3 uColor3;
          uniform vec3 uGlowColor;
          varying vec2 vUv;
          varying vec3 vNormal;
          varying vec3 vPosition;
          ${SIMPLEX_GLSL}
          void main() {
            // Multi-octave procedural surface
            float n1 = snoise(vPosition * 1.5) * 0.5 + 0.5;
            float n2 = snoise(vPosition * 3.0) * 0.5 + 0.5;
            float n3 = snoise(vPosition * 6.0) * 0.5 + 0.5;
            float n4 = snoise(vPosition * 12.0 + uTime * 0.02) * 0.5 + 0.5;
            float surface = n1 * 0.5 + n2 * 0.25 + n3 * 0.15 + n4 * 0.1;

            vec3 color = mix(uColor1, uColor2, smoothstep(0.3, 0.6, surface));
            color = mix(color, uColor3, smoothstep(0.6, 0.9, surface));

            // Fresnel rim glow
            vec3 viewDir = normalize(cameraPosition - vPosition);
            float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 3.0);
            vec3 rimColor = mix(uGlowColor, uColor3, 0.3) * fresnel * 1.5;

            float pulse = sin(uTime * 0.5) * 0.1 + 0.9;
            gl_FragColor = vec4(color + rimColor * pulse, 1.0);
          }
        `}
        uniforms={uniforms}
      />
    </Sphere>
  );
}

function AtmosphericGlow() {
  const uniforms = useMemo(
    () => ({
      uGlowColor: { value: new THREE.Color(MOON_COLORS.glow) },
      uTime: { value: 0 },
    }),
    [],
  );

  useFrame((state) => {
    uniforms.uTime.value = state.clock.getElapsedTime();
  });

  return (
    <Sphere args={[2.6, 32, 32]}>
      <shaderMaterial
        transparent
        depthWrite={false}
        side={THREE.BackSide}
        uniforms={uniforms}
        vertexShader={/* glsl */ `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          uniform vec3 uGlowColor;
          uniform float uTime;
          varying vec3 vNormal;
          void main() {
            float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.5);
            float pulse = sin(uTime * 0.4) * 0.15 + 0.85;
            vec3 glow = uGlowColor * intensity * pulse * 1.2;
            float alpha = intensity * pulse * 0.55;
            gl_FragColor = vec4(glow, alpha);
          }
        `}
      />
    </Sphere>
  );
}

function Particles() {
  const particlesRef = useRef<THREE.Points>(null);
  const count = 800;

  const [positions, sizes] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 4 + Math.random() * 12;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      sz[i] = Math.random() * 2 + 0.5;
    }
    return [pos, sz];
  }, []);

  useFrame((state) => {
    if (particlesRef.current) {
      particlesRef.current.rotation.y = state.clock.getElapsedTime() * 0.01;
      particlesRef.current.rotation.x = Math.sin(state.clock.getElapsedTime() * 0.005) * 0.05;
    }
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={count}
          itemSize={3}
        />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} count={count} itemSize={1} />
      </bufferGeometry>
      <pointsMaterial
        size={0.04}
        color={MOON_COLORS.particle}
        transparent
        opacity={0.5}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

/** Offsets the moon so the hero copy owns the center; adds gentle pointer parallax. */
function MoonGroup() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const group = groupRef.current;
    if (!group) return;
    const { x, y } = state.pointer;
    group.position.x = THREE.MathUtils.lerp(group.position.x, 2.4 + x * 0.25, 0.03);
    group.position.y = THREE.MathUtils.lerp(group.position.y, 1.1 + y * 0.15, 0.03);
  });

  return (
    <group ref={groupRef} position={[2.4, 1.1, 0]}>
      <Moon />
      <AtmosphericGlow />
    </group>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.1} />
      {/* Warm key light + faint teal counter-light for depth */}
      <pointLight position={[5, 3, 5]} intensity={0.8} color="#e8c98a" />
      <pointLight position={[-5, -2, 3]} intensity={0.25} color="#2dd4bf" />

      <MoonGroup />
      <Particles />

      <Stars radius={50} depth={50} count={2000} factor={3} saturation={0} fade speed={0.5} />
    </>
  );
}

export function MoonScene() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 45 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
