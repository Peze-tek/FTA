'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import { playerState } from '@/lib/playerState';
import { ATMO, type AtmoDef, type AtmoId } from '@/lib/atmo';
import { QUALITY_INFO, type Quality } from '@/lib/quality';

const _f = new THREE.Vector3();
let active: AtmoId = 'night';
export const getAtmo = () => active;

/* -------------------------------------------------------------------- sky */
const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHor; uniform vec3 uSun; uniform vec3 uSunDir;
uniform vec3 uCloudLit; uniform vec3 uCloudShade; uniform float uClouds; uniform float uTime;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHor, uMid, smoothstep(0.0, 0.28, h));
  col = mix(col, uTop, smoothstep(0.22, 0.95, h));
  if (d.y < 0.0) col = mix(uHor, uHor * 0.85, clamp(-d.y * 4.0, 0.0, 1.0));
  vec3 sd3 = normalize(uSunDir);
  float sd = max(dot(d, sd3), 0.0);
  col += uSun * (pow(sd, 700.0) * 2.4 + pow(sd, 28.0) * 0.32 + pow(sd, 5.0) * 0.12);
  if (uClouds > 0.0 && d.y > 0.015) {
    vec2 uv = d.xz / (d.y + 0.28) * 1.35 + vec2(uTime * 0.006, uTime * 0.002);
    float n = fbm(uv);
    float c = smoothstep(0.52 - uClouds * 0.22, 0.86, n);
    float lit = fbm(uv + sd3.xz * 0.22);
    vec3 cc = mix(uCloudLit, uCloudShade, clamp((n - lit) * 3.2 + 0.35, 0.0, 1.0));
    col = mix(col, cc, c * smoothstep(0.015, 0.22, d.y) * 0.92);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

function makeSkyMaterial(def: AtmoDef, quality: Quality) {
  const col = (c: string) => new THREE.Color(c);
  const d = new THREE.Vector3(...def.sunDir).normalize();
  return new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTop: { value: col(def.top) }, uMid: { value: col(def.mid) }, uHor: { value: col(def.horizon) },
      uSun: { value: col(def.sunColor) }, uSunDir: { value: d },
      uCloudLit: { value: col(def.cloudLit) }, uCloudShade: { value: col(def.cloudShade) },
      uClouds: { value: QUALITY_INFO[quality].clouds ? def.clouds : 0 }, uTime: { value: 0 },
    },
  });
}

/** Gradient sky + sun glow + drifting clouds. Drawn last in the opaque pass so it only shades uncovered pixels. */
function SkyDome({ def, quality }: { def: AtmoDef; quality: Quality }) {
  const mat = useMemo(() => makeSkyMaterial(def, quality), [def, quality]);
  const mesh = useRef<THREE.Mesh>(null!);
  useFrame(({ camera, clock }) => {
    mesh.current.position.copy(camera.position);
    mat.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <mesh ref={mesh} material={mat} renderOrder={1000} frustumCulled={false}>
      <sphereGeometry args={[330, 32, 20]} />
    </mesh>
  );
}

/** Bakes the sky into an environment map: gives cars/glass real sky reflections and soft ambient light. */
function SkyEnvironment({ def, intensity }: { def: AtmoDef; intensity: number }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    let rt: THREE.WebGLRenderTarget | null = null;
    let pm: THREE.PMREMGenerator | null = null;
    try {
      const s = new THREE.Scene();
      const mat = makeSkyMaterial(def, 'med');
      const m = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 16), mat);
      s.add(m);
      pm = new THREE.PMREMGenerator(gl);
      rt = pm.fromScene(s, 0, 0.1, 100);
      scene.environment = rt.texture;
      scene.environmentIntensity = intensity;
      m.geometry.dispose(); mat.dispose();
    } catch { /* WebGL without float RT: skip reflections */ }
    return () => { if (scene.environment === rt?.texture) scene.environment = null; rt?.dispose(); pm?.dispose(); };
  }, [gl, scene, def, intensity]);
  return null;
}

/* ---------------------------------------------------------------- sun + shadows */
function Sun({ def, quality }: { def: AtmoDef; quality: Quality }) {
  const light = useRef<THREE.DirectionalLight>(null!);
  const target = useRef<THREE.Object3D>(null!);
  const q = QUALITY_INFO[quality];
  const dir = useMemo(() => new THREE.Vector3(...def.sunDir).normalize(), [def]);
  useEffect(() => { if (light.current && target.current) light.current.target = target.current; }, []);
  useFrame(({ camera }) => {
    // shadow box follows the camera's look-at area so the sharp shadows always sit where the action is
    const f = _f; camera.getWorldDirection(f); f.y = 0; f.normalize();
    const reach = Math.min(18, q.shadowExt * 0.5);
    const tx = camera.position.x + f.x * reach, tz = camera.position.z + f.z * reach;
    const step = q.shadowExt > 0 ? (q.shadowExt * 2) / q.shadow : 0.1;
    const sx = Math.round(tx / step) * step, sz = Math.round(tz / step) * step;   // texel snapping reduces shimmer
    target.current.position.set(sx, 0, sz);
    light.current.position.set(sx + dir.x * 70, dir.y * 70, sz + dir.z * 70);
    target.current.updateMatrixWorld();
  });
  const e = q.shadowExt || 30;
  return (<>
    <object3D ref={target} />
    <directionalLight
      ref={light} color={def.sunLight} intensity={def.sun} castShadow={q.shadow > 0}
      shadow-mapSize={[q.shadow || 512, q.shadow || 512]} shadow-camera-left={-e} shadow-camera-right={e}
      shadow-camera-top={e} shadow-camera-bottom={-e} shadow-camera-near={1} shadow-camera-far={170}
      shadow-bias={-0.0006} shadow-normalBias={0.05}
    />
  </>);
}

/** Opts meshes into the shadow pass as they appear (casts for props/characters/vehicles, receives for ground). */
function ShadowFlagger({ on }: { on: boolean }) {
  const { scene } = useThree();
  const t = useRef(0);
  useFrame((_, dt) => {
    if (!on) return;
    t.current -= dt;
    if (t.current > 0) return;
    t.current = 0.7;
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData._sh) return;
      m.userData._sh = 1;
      if ((m as THREE.InstancedMesh).isInstancedMesh) return;          // instanced sets opt in themselves
      const mat = m.material as THREE.Material;
      if (!(mat as THREE.MeshStandardMaterial).isMeshStandardMaterial || mat.transparent) return;
      const g = m.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const b = g.boundingBox!;
      const big = Math.max((b.max.x - b.min.x) * Math.abs(m.scale.x), (b.max.z - b.min.z) * Math.abs(m.scale.z)) > 40;
      m.receiveShadow = true;
      m.castShadow = !big;
    });
  });
  return null;
}

/* ------------------------------------------------------------------ atmosphere */
export default function Atmosphere({ id, quality }: { id: AtmoId; quality: Quality }) {
  const def = ATMO[id];
  const { gl } = useThree();
  active = id;
  useEffect(() => {
    gl.toneMappingExposure = def.exposure;
    gl.setClearColor(def.horizon);
  }, [gl, def]);
  return (
    <>
      <fogExp2 attach="fog" args={[def.fog, def.fogDensity * (quality === 'low' ? 1.25 : 1)]} />
      <hemisphereLight args={[def.hemiSky, def.hemiGround, def.hemi]} />
      <Sun def={def} quality={quality} />
      <SkyEnvironment def={def} intensity={def.env} />
      <SkyDome def={def} quality={quality} />
      {def.stars && <NightExtras />}
      <ShadowFlagger on={QUALITY_INFO[quality].shadow > 0} />
    </>
  );
}

/** Stars + moon, glued to the camera so they never parallax. */
function NightExtras() {
  const g = useRef<THREE.Group>(null!);
  useFrame(({ camera }) => g.current.position.copy(camera.position));
  return (
    <group ref={g}>
      <Stars radius={180} depth={40} count={900} factor={6} saturation={0} fade speed={0.4} />
      <mesh position={[-90, 80, -150]}>
        <sphereGeometry args={[9, 12, 10]} />
        <meshBasicMaterial color="#fff6d6" toneMapped={false} fog={false} />
      </mesh>
    </group>
  );
}

/** Fake volumetric fog (night only): stacked soft ground-fog sheets that follow the player. */
export function FogLayers() {
  const g = useRef<THREE.Group>(null!);
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    const gr = x.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(160,140,255,0.55)');
    gr.addColorStop(1, 'rgba(160,140,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
  useFrame(({ clock }) => {
    g.current.position.set(playerState.pos.x, 0, playerState.pos.z);
    g.current.rotation.y = clock.elapsedTime * 0.02;
  });
  return (
    <group ref={g} visible={active === 'night'}>
      {[0.5, 1.4, 2.4].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[70 + i * 12, 70 + i * 12]} />
          <meshBasicMaterial map={tex} transparent opacity={0.2 - i * 0.04} depthWrite={false} fog={false} />
        </mesh>
      ))}
    </group>
  );
}

/** One warm point light that follows Jack (strong at night, a soft fill in daylight). */
export function PlayerLight() {
  const l = useRef<THREE.PointLight>(null!);
  useFrame(() => {
    l.current.position.set(playerState.pos.x, 3.2, playerState.pos.z + 1);
    l.current.intensity = active === 'night' ? 14 : 2.5;
  });
  return <pointLight ref={l} color="#ffcf9a" intensity={14} distance={16} decay={1.6} />;
}
