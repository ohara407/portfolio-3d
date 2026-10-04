import { useRef, useState, useMemo, useCallback, Suspense } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Html } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { motion, AnimatePresence } from 'framer-motion';
import * as THREE from 'three';

// ─── Planet data ──────────────────────────────────────────────────────────────
type PlanetData = {
  id: string;
  label: string;
  emoji: string;
  orbitR: number;
  speed: number;
  planetR: number;
  phase: number;
  ring: boolean;
  colors: [string, string, string]; // dark, mid, bright
  accent: string;
};

const PLANETS: PlanetData[] = [
  { id: 'about',     label: 'About Me',      emoji: '🪪', orbitR: 5.0,  speed: 0.25, planetR: 1.2, phase: 0.0, ring: true,  colors: ['#2e1065', '#4c1d95', '#a78bfa'], accent: '#a78bfa' },
  { id: 'projects',  label: 'Projects',      emoji: '🚀', orbitR: 7.5,  speed: 0.18, planetR: 1.6, phase: 1.1, ring: false, colors: ['#172554', '#1e3a8a', '#60a5fa'], accent: '#60a5fa' },
  { id: 'stack',     label: 'Tech Stack',    emoji: '⚙️', orbitR: 10.0, speed: 0.13, planetR: 1.0, phase: 2.3, ring: true,  colors: ['#022c22', '#064e3b', '#34d399'], accent: '#34d399' },
  { id: 'contact',   label: 'Contact',       emoji: '📡', orbitR: 3.5,  speed: 0.40, planetR: 0.7, phase: 3.4, ring: false, colors: ['#450a0a', '#7f1d1d', '#f87171'], accent: '#f87171' },
  { id: 'exp',       label: 'Experience',    emoji: '🏅', orbitR: 12.5, speed: 0.09, planetR: 1.4, phase: 4.2, ring: true,  colors: ['#431407', '#78350f', '#fbbf24'], accent: '#fbbf24' },
  { id: 'tutorials', label: 'Tutorials',     emoji: '📚', orbitR: 8.5,  speed: 0.15, planetR: 0.9, phase: 5.0, ring: false, colors: ['#042f2e', '#134e4a', '#2dd4bf'], accent: '#2dd4bf' },
  { id: 'presents',  label: 'Presentations', emoji: '🎤', orbitR: 6.0,  speed: 0.20, planetR: 1.1, phase: 5.8, ring: true,  colors: ['#3b0764', '#6b21a8', '#e879f9'], accent: '#e879f9' },
];

const HOME_POS = new THREE.Vector3(0, 3, 18);
const ORIGIN = new THREE.Vector3(0, 0, 0);
const AMPLITUDE = 0.35;

const orbitPos = (p: PlanetData, t: number) =>
  new THREE.Vector3(
    p.orbitR * Math.cos(t * p.speed + p.phase),
    AMPLITUDE * Math.sin(t * p.speed * 2 + p.phase),
    p.orbitR * Math.sin(t * p.speed + p.phase)
  );

// ─── GLSL: planet surface ─────────────────────────────────────────────────────
const PLANET_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec2 vUv;
  varying vec3 vPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vUv = uv;
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PLANET_FRAG = /* glsl */ `
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform float uTime;
  uniform vec3 uLightDir;
  varying vec3 vNormal;
  varying vec2 vUv;
  varying vec3 vPosition;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + .1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x),
          mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
          mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 6; i++) {
      v += a * noise(p);
      p = p * 2.0 + vec3(5.7, 4.3, 1.2);
      a *= 0.5;
    }
    return v;
  }
  void main() {
    vec3 p = vPosition * 2.5 + vec3(uTime * 0.02, 0.0, 0.0);
    float n = fbm(p);
    float bands = sin(vPosition.y * 8.0 + n * 3.0) * 0.5 + 0.5;
    vec3 col = mix(uColor1, uColor2, n);
    col = mix(col, uColor3, bands * 0.4);
    float diff = max(dot(vNormal, normalize(uLightDir)), 0.05);
    col *= (diff * 0.9 + 0.1);
    vec3 viewDir = normalize(-vPosition);
    vec3 halfDir = normalize(normalize(uLightDir) + viewDir);
    float spec = pow(max(dot(vNormal, halfDir), 0.0), 32.0) * 0.3;
    col += spec;
    float rim = 1.0 - max(dot(vNormal, viewDir), 0.0);
    col *= (1.0 - rim * rim * 0.5);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ─── GLSL: rings ────────────────────────────────────────────────────────────────
const RING_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const RING_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vUv;
  float hash1(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    if (r < 0.3 || r > 1.0) discard;
    float rings = sin(r * 80.0) * 0.5 + 0.5;
    float noise = hash1(floor(r * 200.0)) * 0.4 + 0.2;
    float alpha = rings * noise * smoothstep(0.3, 0.4, r) * smoothstep(1.0, 0.85, r);
    gl_FragColor = vec4(uColor, alpha * 0.7);
  }
`;

// ─── Planet ───────────────────────────────────────────────────────────────────
function Planet({
  data, selected, hovered, onSelect, onHover, registerPos,
}: {
  data: PlanetData;
  selected: boolean;
  hovered: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  registerPos: (id: string, v: THREE.Vector3) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.ShaderMaterial>(null);
  const pulse = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(
    () => ({
      uColor1: { value: new THREE.Color(data.colors[0]) },
      uColor2: { value: new THREE.Color(data.colors[1]) },
      uColor3: { value: new THREE.Color(data.colors[2]) },
      uTime: { value: 0 },
      uLightDir: { value: new THREE.Vector3(0, 0, 0) },
    }),
    [data]
  );
  const ringUniforms = useMemo(
    () => ({ uColor: { value: new THREE.Color(data.accent) } }),
    [data]
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pos = orbitPos(data, t);
    if (group.current) group.current.position.copy(pos);
    registerPos(data.id, pos);
    if (mat.current) {
      mat.current.uniforms.uTime.value = t;
      mat.current.uniforms.uLightDir.value.copy(pos).multiplyScalar(-1).normalize();
    }
    if (mesh.current) {
      mesh.current.rotation.y += 0.0015;
      const target = hovered || selected ? 1.15 : 1.0;
      mesh.current.scale.lerp(new THREE.Vector3(target, target, target), 0.1);
    }
    if (pulse.current) {
      const s = 1 + Math.sin(t * 3) * 0.08;
      pulse.current.scale.setScalar(s);
    }
  });

  return (
    <group ref={group}>
      <mesh
        ref={mesh}
        onClick={(e) => { e.stopPropagation(); onSelect(data.id); }}
        onPointerOver={(e) => { e.stopPropagation(); onHover(data.id); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { onHover(null); document.body.style.cursor = 'auto'; }}
      >
        <sphereGeometry args={[data.planetR, 64, 64]} />
        <shaderMaterial ref={mat} vertexShader={PLANET_VERT} fragmentShader={PLANET_FRAG} uniforms={uniforms} />
      </mesh>

      {/* Atmospheric glow */}
      <mesh scale={1.08}>
        <sphereGeometry args={[data.planetR, 32, 32]} />
        <meshBasicMaterial color={data.accent} transparent opacity={0.12} side={THREE.BackSide} depthWrite={false} />
      </mesh>
      <mesh scale={1.2}>
        <sphereGeometry args={[data.planetR, 32, 32]} />
        <meshBasicMaterial color={data.accent} transparent opacity={0.04} side={THREE.BackSide} depthWrite={false} />
      </mesh>

      {/* Rings */}
      {data.ring && (
        <mesh rotation={[Math.PI / 2.2, 0, 0.3]}>
          <planeGeometry args={[data.planetR * 5, data.planetR * 5]} />
          <shaderMaterial vertexShader={RING_VERT} fragmentShader={RING_FRAG} uniforms={ringUniforms} transparent side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}

      {/* Selection pulse ring */}
      {selected && (
        <mesh ref={pulse} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[data.planetR * 1.4, data.planetR * 1.55, 64]} />
          <meshBasicMaterial color={data.accent} transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}

      {/* Floating label */}
      <Html center distanceFactor={14} position={[0, data.planetR + 0.9, 0]} style={{ pointerEvents: 'none' }}>
        <div style={{
          whiteSpace: 'nowrap', fontSize: '12px', fontWeight: 700, color: '#e2e8f0',
          padding: '3px 10px', borderRadius: '999px',
          background: 'rgba(2,6,23,0.6)', border: `1px solid ${data.accent}55`,
          opacity: hovered || selected ? 1 : 0.55, transition: 'opacity 0.3s',
          backdropFilter: 'blur(6px)',
        }}>
          {data.emoji} {data.label}
        </div>
      </Html>
    </group>
  );
}

// ─── Orbit path ───────────────────────────────────────────────────────────────
function OrbitPath({ radius, bright }: { radius: number; bright: boolean }) {
  const lineObj = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 256; i++) {
      const a = (i / 256) * Math.PI * 2;
      pts.push(new THREE.Vector3(radius * Math.cos(a), 0, radius * Math.sin(a)));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.06 });
    return new THREE.LineLoop(geo, mat);
  }, [radius]);
  (lineObj.material as THREE.LineBasicMaterial).opacity = bright ? 0.15 : 0.06;
  return <primitive object={lineObj} />;
}

// ─── Sun ──────────────────────────────────────────────────────────────────────
function Sun() {
  const core = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (core.current) core.current.rotation.y = t * 0.05;
    if (matRef.current) matRef.current.emissiveIntensity = 1.6 + Math.sin(t * 1.5) * 0.4;
  });
  return (
    <group>
      <mesh ref={core}>
        <sphereGeometry args={[1.5, 64, 64]} />
        <meshStandardMaterial ref={matRef} color="#fde68a" emissive="#fbbf24" emissiveIntensity={1.8} toneMapped={false} />
      </mesh>
      {[[1.8, 0.14], [2.2, 0.08], [2.8, 0.035]].map(([r, o], i) => (
        <mesh key={i}>
          <sphereGeometry args={[r, 48, 48]} />
          <meshBasicMaterial color={i === 0 ? '#fde68a' : '#fcd34d'} transparent opacity={o} side={THREE.BackSide} depthWrite={false} />
        </mesh>
      ))}
      <pointLight color="#fff3c4" intensity={140} distance={140} decay={1.4} />
    </group>
  );
}

// ─── Asteroid belt ──────────────────────────────────────────────────────────────
function AsteroidBelt() {
  const g = useRef<THREE.Group>(null);
  const rocks = useMemo(
    () => Array.from({ length: 300 }).map(() => {
      const r = 9 + Math.random() * 2;
      const a = Math.random() * Math.PI * 2;
      return {
        pos: [r * Math.cos(a), (Math.random() - 0.5) * 0.3, r * Math.sin(a)] as [number, number, number],
        rot: [Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI] as [number, number, number],
      };
    }),
    []
  );
  useFrame(({ clock }) => { if (g.current) g.current.rotation.y = clock.getElapsedTime() * 0.02; });
  return (
    <group ref={g}>
      {rocks.map((rk, i) => (
        <mesh key={i} position={rk.pos} rotation={rk.rot}>
          <dodecahedronGeometry args={[0.03]} />
          <meshStandardMaterial color="#6b7280" roughness={0.95} metalness={0.1} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Camera rig (click-to-zoom) ───────────────────────────────────────────────
function Rig({
  selected, positions, controlsRef,
}: {
  selected: string | null;
  positions: { current: Record<string, THREE.Vector3> };
  controlsRef: { current: any };
}) {
  const { camera } = useThree();
  const desired = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (selected && positions.current[selected]) {
      const p = positions.current[selected];
      const pr = PLANETS.find((pl) => pl.id === selected)?.planetR ?? 1;
      dir.copy(camera.position).sub(controls.target).normalize();
      desired.copy(p).add(dir.multiplyScalar(pr * 2 + 4));
      camera.position.lerp(desired, 0.06);
      controls.target.lerp(p, 0.1);
    } else {
      camera.position.lerp(HOME_POS, 0.05);
      controls.target.lerp(ORIGIN, 0.08);
    }
    controls.update();
  });
  return null;
}

// ─── Scene ──────────────────────────────────────────────────────────────────────
function Scene({
  selected, hovered, onSelect, onHover, controlsRef,
}: {
  selected: string | null;
  hovered: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  controlsRef: { current: any };
}) {
  const positions = useRef<Record<string, THREE.Vector3>>({});
  const registerPos = useCallback((id: string, v: THREE.Vector3) => {
    positions.current[id] = v.clone();
  }, []);
  return (
    <>
      <ambientLight intensity={0.25} />
      <Stars radius={200} depth={100} count={9000} factor={3} saturation={0} speed={0.1} />
      <Sun />
      <AsteroidBelt />
      {PLANETS.map((p) => (
        <OrbitPath key={`orbit-${p.id}`} radius={p.orbitR} bright={hovered === p.id} />
      ))}
      {PLANETS.map((p) => (
        <Planet
          key={p.id}
          data={p}
          selected={selected === p.id}
          hovered={hovered === p.id}
          onSelect={onSelect}
          onHover={onHover}
          registerPos={registerPos}
        />
      ))}
      <Rig selected={selected} positions={positions} controlsRef={controlsRef} />
      <EffectComposer>
        <Bloom intensity={1.1} luminanceThreshold={0.2} luminanceSmoothing={0.9} mipmapBlur />
      </EffectComposer>
    </>
  );
}

// ─── UI helpers ──────────────────────────────────────────────────────────────────
function Tag({ label, color = '#7dd3fc', bg = 'rgba(96,165,250,0.1)', border = 'rgba(96,165,250,0.2)' }:
  { label: string; color?: string; bg?: string; border?: string }) {
  return <span style={{ padding: '2px 9px', borderRadius: '999px', background: bg, border: `1px solid ${border}`, color, fontSize: '10px', fontWeight: 700 }}>{label}</span>;
}

function Card({ children, accent = 'rgba(255,255,255,0.05)' }: { children: ReactNode; accent?: string }) {
  return <div style={{ background: accent, borderRadius: '10px', padding: '12px 14px', marginBottom: '10px', border: '1px solid rgba(255,255,255,0.07)' }}>{children}</div>;
}

function SectionTitle({ children, color }: { children: ReactNode; color: string }) {
  return <h3 style={{ margin: '0 0 14px', color, fontSize: '15px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>{children}</h3>;
}

function LinkBtn({ href, label, icon, bg }: { href: string; label: string; icon: string; bg: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 13px', borderRadius: '10px', background: `${bg}18`, border: `1px solid ${bg}40`, textDecoration: 'none', color: 'white', marginBottom: '8px', transition: 'all 0.2s', fontSize: '12px' }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.background = `${bg}28`; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = `${bg}18`; }}>
      <span style={{ fontSize: '18px' }}>{icon}</span>
      <span style={{ fontWeight: 600, flex: 1 }}>{label}</span>
      <span style={{ color: '#475569' }}>↗</span>
    </a>
  );
}

// ─── Panel content ───────────────────────────────────────────────────────────────
const PANELS: Record<string, ReactNode> = {

  about: (
    <div>
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '18px' }}>
        <img src="https://avatars.githubusercontent.com/ohara407" alt="Yago" style={{ width: '72px', height: '72px', borderRadius: '50%', border: '2px solid #7c3aed', objectFit: 'cover', boxShadow: '0 0 20px #7c3aed55' }} />
        <div>
          <div style={{ fontSize: '19px', fontWeight: 900, background: 'linear-gradient(135deg,#a78bfa,#38bdf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Yago Santos Silva</div>
          <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '2px' }}>AI Developer · Automation Engineer · Data &amp; Cloud</div>
          <div style={{ color: '#475569', fontSize: '10px', marginTop: '2px' }}>📍 São Paulo, SP — Brazil</div>
        </div>
      </div>
      <p style={{ color: '#94a3b8', fontSize: '12px', lineHeight: 1.8, marginBottom: '16px' }}>
        Building scalable autonomous systems, orchestrating complex workflows with <strong style={{ color: '#a78bfa' }}>n8n &amp; Gemini AI</strong>, and engineering hybrid LLM solutions from idea to production. <em style={{ color: '#c4b5fd' }}>"I don't sell hours. I sell solutions."</em>
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {[['🎓', 'ADS @ Senac SP', '2024 – 2027'], ['🔬', 'PICTA Researcher', 'Smart Home AI'], ['📜', '40+ Certifications', 'Google AI · DIO · Alura'], ['💼', 'LATAM · Nike · Rappi', 'Operations Background']].map(([ic, t, s]) => (
          <Card key={t}>
            <span style={{ fontSize: '18px' }}>{ic}</span>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0', marginTop: '4px' }}>{t}</div>
            <div style={{ fontSize: '10px', color: '#64748b' }}>{s}</div>
          </Card>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
        <a href="https://github.com/ohara407" target="_blank" rel="noreferrer" style={{ padding: '7px 16px', borderRadius: '999px', background: '#1f2937', color: 'white', fontSize: '11px', fontWeight: 700, textDecoration: 'none', border: '1px solid #374151' }}>⯐ GitHub</a>
        <a href="https://linkedin.com/in/yago-santos-silva-aa3233245" target="_blank" rel="noreferrer" style={{ padding: '7px 16px', borderRadius: '999px', background: '#1d4ed8', color: 'white', fontSize: '11px', fontWeight: 700, textDecoration: 'none' }}>in LinkedIn</a>
        <a href="https://portfolio-opal-omega-7kjyjot4r6.vercel.app" target="_blank" rel="noreferrer" style={{ padding: '7px 16px', borderRadius: '999px', background: '#7c3aed', color: 'white', fontSize: '11px', fontWeight: 700, textDecoration: 'none' }}>🌐 Portfolio</a>
      </div>
    </div>
  ),

  projects: (
    <div>
      <SectionTitle color="#60a5fa">🚀 Projects in Production</SectionTitle>
      {[
        { e: '🎯', n: 'Job Hunter', d: 'Hybrid AI bot (Gemini/Ollama) for automated job search, scoring & applications across LinkedIn, Indeed, Catho and more.', t: ['Python', 'React', 'Playwright', 'Gemini'], link: 'https://github.com/ohara407/yago-silva-ads' },
        { e: '🗳️', n: 'Political Brain 4090', d: 'Fully autonomous political campaign infrastructure. n8n + WhatsApp Meta API managing 5800+ voters with AI-generated personalized messages.', t: ['n8n', 'Groq AI', 'Sheets API', 'Flask'], link: 'https://lucianodados4090.z13.web.core.windows.net/qg/' },
        { e: '🏥', n: 'OIC App', d: 'Healthcare product traceability system with predictive AI for intelligent stock management and alerts.', t: ['Flutter', 'Supabase', 'Python'], link: '#' },
        { e: '💰', n: 'Million System', d: 'Financial SaaS platform with interactive analytics dashboard, automated reporting and KPI tracking.', t: ['Spring Boot', 'Angular', 'PostgreSQL'], link: '#' },
        { e: '🤖', n: 'AutoLead CIC', d: 'Automated commercial scraping and lead generation system for B2B sales pipelines.', t: ['TypeScript', 'Playwright', 'n8n'], link: 'https://github.com/ohara407' },
      ].map((p) => (
        <div key={p.n} style={{ background: 'rgba(96,165,250,0.05)', borderRadius: '10px', padding: '12px', marginBottom: '10px', border: '1px solid rgba(96,165,250,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
            <div style={{ fontWeight: 800, fontSize: '13px', color: '#e2e8f0' }}>{p.e} {p.n}</div>
            {p.link !== '#' && <a href={p.link} target="_blank" rel="noreferrer" style={{ fontSize: '10px', color: '#60a5fa', textDecoration: 'none' }}>View ↗</a>}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', lineHeight: 1.7 }}>{p.d}</div>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {p.t.map((t) => <Tag key={t} label={t} />)}
          </div>
        </div>
      ))}
    </div>
  ),

  stack: (
    <div>
      <SectionTitle color="#34d399">⚙️ Full Tech Stack</SectionTitle>
      {[
        { cat: '🐍 AI & Automation', color: '#34d399', items: ['Python', 'Gemini API', 'Ollama (LLaMA 3)', 'Groq', 'LangChain', 'n8n', 'Playwright', 'Selenium', 'FastAPI'] },
        { cat: '🌐 Frontend', color: '#60a5fa', items: ['React', 'TypeScript', 'Vite', 'Tailwind CSS', 'Framer Motion', 'Three.js', 'Next.js'] },
        { cat: '📱 Mobile', color: '#a78bfa', items: ['Flutter', 'Dart', 'Supabase', 'Firebase'] },
        { cat: '☁️ Cloud & DevOps', color: '#38bdf8', items: ['Azure Blob Storage', 'GitHub Actions', 'Docker', 'GitHub Pages', 'Vercel'] },
        { cat: '⚙️ Backend & DB', color: '#fbbf24', items: ['Java', 'Spring Boot', 'Angular', 'PostgreSQL', 'MySQL', 'SQLite'] },
        { cat: '🔧 Tools', color: '#f87171', items: ['Git', 'VS Code', 'Obsidian', 'n8n', 'Postman', 'Figma'] },
      ].map((g) => (
        <div key={g.cat} style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: g.color, marginBottom: '6px' }}>{g.cat}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {g.items.map((i) => <Tag key={i} label={i} color={g.color} bg={`${g.color}12`} border={`${g.color}30`} />)}
          </div>
        </div>
      ))}
    </div>
  ),

  tutorials: (
    <div>
      <SectionTitle color="#2dd4bf">📚 Learning & Tutorials</SectionTitle>
      <p style={{ color: '#64748b', fontSize: '12px', lineHeight: 1.8, marginBottom: '16px' }}>
        Continuous learner with 40+ certifications across AI, backend, cloud and mobile development. Always building, always learning.
      </p>

      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#2dd4bf', marginBottom: '8px' }}>🎓 Completed Certifications</div>
        {[
          { icon: '🤖', name: 'Google AI Essentials', org: 'Google', year: '2025' },
          { icon: '☕', name: 'Spring Boot & REST APIs', org: 'DIO', year: '2024' },
          { icon: '📐', name: 'SOLID & Design Patterns', org: 'DIO', year: '2024' },
          { icon: '☁️', name: 'Cloud Computing Foundations', org: 'DIO / AWS', year: '2024' },
          { icon: '🐍', name: 'Python Automation & Bots', org: 'Alura', year: '2024' },
          { icon: '📱', name: 'Flutter & Dart Fundamentals', org: 'DIO', year: '2025' },
        ].map((cert) => (
          <div key={cert.name} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '8px 10px', borderRadius: '8px', marginBottom: '6px', background: 'rgba(45,212,191,0.04)', border: '1px solid rgba(45,212,191,0.1)' }}>
            <span style={{ fontSize: '16px' }}>{cert.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#e2e8f0' }}>{cert.name}</div>
              <div style={{ fontSize: '10px', color: '#64748b' }}>{cert.org} · {cert.year}</div>
            </div>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#2dd4bf' }}>✓</span>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#2dd4bf', marginBottom: '8px' }}>📖 Currently Studying</div>
        {['Advanced LangChain & AI Agents', 'LLM Fine-tuning with QLoRA', 'Kubernetes & Container Orchestration', 'System Design at Scale'].map((item) => (
          <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', marginBottom: '4px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2dd4bf', flexShrink: 0 }} />
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>{item}</span>
          </div>
        ))}
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#2dd4bf', marginBottom: '8px' }}>🔗 Resources & Platforms</div>
        <LinkBtn href="https://github.com/ohara407" label="My GitHub Repositories" icon="⯐" bg="#6e7681" />
        <LinkBtn href="https://www.dio.me/" label="DIO Platform (40+ Certs)" icon="🏆" bg="#0d6efd" />
        <LinkBtn href="https://www.alura.com.br/" label="Alura Learning Platform" icon="🧠" bg="#1565c0" />
      </div>
    </div>
  ),

  presents: (
    <div>
      <SectionTitle color="#e879f9">🎤 Presentations & Demos</SectionTitle>
      <p style={{ color: '#64748b', fontSize: '12px', lineHeight: 1.8, marginBottom: '16px' }}>
        Interactive presentations, live demos and dashboards built with React, Azure Static Web Apps and n8n workflows.
      </p>

      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#e879f9', marginBottom: '8px' }}>🌐 Live Presentations</div>
        <div style={{ background: 'linear-gradient(135deg,rgba(217,70,239,0.08),rgba(139,92,246,0.08))', borderRadius: '12px', padding: '14px', marginBottom: '10px', border: '1px solid rgba(217,70,239,0.2)' }}>
          <div style={{ fontWeight: 800, fontSize: '13px', color: '#e2e8f0', marginBottom: '6px' }}>🗳️ Campanha Luciano da Luz 4090</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px', lineHeight: 1.7 }}>
            Political campaign presentation hosted on Azure Static Web Apps. Interactive dashboard with real-time voter management system overview.
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {['Azure', 'React', 'n8n', 'WhatsApp API'].map((t) => <Tag key={t} label={t} color="#e879f9" bg="rgba(217,70,239,0.1)" border="rgba(217,70,239,0.25)" />)}
          </div>
          <a href="https://lucianodados4090.z13.web.core.windows.net/qg/" target="_blank" rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 16px', borderRadius: '999px', background: '#9333ea', color: 'white', fontSize: '11px', fontWeight: 700, textDecoration: 'none' }}>
            🔗 Open Live Demo ↗
          </a>
        </div>

        <div style={{ background: 'linear-gradient(135deg,rgba(96,165,250,0.08),rgba(52,211,153,0.08))', borderRadius: '12px', padding: '14px', marginBottom: '10px', border: '1px solid rgba(96,165,250,0.15)' }}>
          <div style={{ fontWeight: 800, fontSize: '13px', color: '#e2e8f0', marginBottom: '6px' }}>🎯 Job Hunter Dashboard</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px', lineHeight: 1.7 }}>
            Real-time automation dashboard for the Job Hunter bot. Shows candidature logs, success rates, and AI scoring metrics.
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {['React', 'Python', 'Gemini AI', 'FastAPI'].map((t) => <Tag key={t} label={t} />)}
          </div>
          <a href="https://github.com/ohara407/yago-silva-ads" target="_blank" rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 16px', borderRadius: '999px', background: '#1d4ed8', color: 'white', fontSize: '11px', fontWeight: 700, textDecoration: 'none' }}>
            ⯐ View Repository ↗
          </a>
        </div>

        <div style={{ background: 'linear-gradient(135deg,rgba(251,191,36,0.08),rgba(239,68,68,0.08))', borderRadius: '12px', padding: '14px', border: '1px solid rgba(251,191,36,0.15)' }}>
          <div style={{ fontWeight: 800, fontSize: '13px', color: '#e2e8f0', marginBottom: '6px' }}>🏥 OIC App — PICTA Research</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px', lineHeight: 1.7 }}>
            Research presentation for the PICTA program at Senac SP. Smart Home accessibility system powered by AI for people with motor disabilities.
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['Flutter', 'Supabase', 'Gemini AI', 'Research'].map((t) => <Tag key={t} label={t} color="#fbbf24" bg="rgba(251,191,36,0.1)" border="rgba(251,191,36,0.25)" />)}
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#e879f9', marginBottom: '8px' }}>🛠️ Tools Used for Presentations</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {['React', 'Azure Static Web Apps', 'Vite', 'Three.js', 'Framer Motion', 'n8n', 'Reveal.js'].map((t) => <Tag key={t} label={t} color="#e879f9" bg="rgba(217,70,239,0.08)" border="rgba(217,70,239,0.2)" />)}
        </div>
      </div>
    </div>
  ),

  contact: (
    <div>
      <SectionTitle color="#f87171">📡 Contact</SectionTitle>
      <p style={{ color: '#64748b', fontSize: '12px', lineHeight: 1.8, marginBottom: '16px' }}>
        Available for <strong style={{ color: '#f87171' }}>freelance projects</strong>, collaborations and full-time opportunities. Response within 24h.
      </p>
      {[
        { icon: 'in', label: 'LinkedIn', sub: 'yago-santos-silva-aa3233245', href: 'https://linkedin.com/in/yago-santos-silva-aa3233245', c: '#1d4ed8' },
        { icon: '⯐', label: 'GitHub', sub: '@ohara407', href: 'https://github.com/ohara407', c: '#374151' },
        { icon: '✉', label: 'Email', sub: 'yagosantossilva0@gmail.com', href: 'mailto:yagosantossilva0@gmail.com', c: '#9f1239' },
        { icon: '🌐', label: 'Portfolio', sub: 'portfolio-opal-omega-7kjyjot4r6.vercel.app', href: 'https://portfolio-opal-omega-7kjyjot4r6.vercel.app', c: '#7c3aed' },
      ].map((ct) => (
        <a key={ct.label} href={ct.href} target="_blank" rel="noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 14px', borderRadius: '12px', background: `${ct.c}18`, border: `1px solid ${ct.c}44`, textDecoration: 'none', color: 'white', marginBottom: '10px', transition: 'all 0.2s' }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = `0 4px 20px ${ct.c}44`; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: ct.c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 900, flexShrink: 0 }}>{ct.icon}</div>
          <div><div style={{ fontWeight: 700, fontSize: '13px' }}>{ct.label}</div><div style={{ color: '#64748b', fontSize: '10px' }}>{ct.sub}</div></div>
          <div style={{ marginLeft: 'auto', color: '#475569' }}>→</div>
        </a>
      ))}
    </div>
  ),

  exp: (
    <div>
      <SectionTitle color="#fbbf24">🏅 Experience & Education</SectionTitle>
      {[
        { y: '2026–now', r: 'PICTA AI Researcher', c: 'Senac SP', d: 'Smart Home accessibility with Gemini AI for people with motor disabilities' },
        { y: '2024–2027', r: "ADS — Bachelor's Degree", c: 'Senac SP', d: 'Systems Analysis & Development · 7th semester' },
        { y: '2023–2024', r: 'Ground Ops Agent', c: 'LATAM Airlines', d: 'Airport operations · process automation · customer service excellence' },
        { y: '2022–2023', r: 'Logistics Analyst', c: 'Nike (3rd party)', d: 'Stock management · efficiency metrics · KPI tracking' },
        { y: '2021–2022', r: 'Delivery Ops Coordinator', c: 'Rappi', d: 'Logistics coordination · team management · routing optimization' },
      ].map((e) => (
        <div key={e.r} style={{ display: 'flex', gap: '12px', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: '10px', color: '#fbbf24', fontWeight: 700, minWidth: '65px', paddingTop: '2px', lineHeight: 1.5 }}>{e.y}</div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#e2e8f0' }}>{e.r}</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>{e.c}</div>
            <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px', lineHeight: 1.5 }}>{e.d}</div>
          </div>
        </div>
      ))}
      <div style={{ marginTop: '4px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#fbbf24', marginBottom: '8px' }}>🏆 Key Achievements</div>
        {['Built fully autonomous political campaign system serving 5800+ voters', 'PICTA Researcher developing AI accessibility at Senac', 'Deployed production-grade hybrid AI bot for automated job hunting', 'Created 10+ full-stack applications across web, mobile and cloud'].map((a) => (
          <div key={a} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '6px' }}>
            <span style={{ color: '#fbbf24', flexShrink: 0, marginTop: '1px' }}>⚡</span>
            <span style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.6 }}>{a}</span>
          </div>
        ))}
      </div>
    </div>
  ),
};

const ACCENT: Record<string, string> = {
  about: '#a78bfa', projects: '#60a5fa', stack: '#34d399',
  contact: '#f87171', exp: '#fbbf24', tutorials: '#2dd4bf', presents: '#e879f9',
};

// ─── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const controlsRef = useRef<any>(null);

  const handleSelect = useCallback((id: string) => {
    setSelected((cur) => (cur === id ? null : id));
  }, []);

  const onKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setSelected(null);
  }, []);

  return (
    <div
      tabIndex={0}
      onKeyDown={onKey}
      style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse at center, #0b1120 0%, #020617 70%, #000 100%)', outline: 'none', overflow: 'hidden' }}
    >
      <Canvas
        camera={{ position: [0, 3, 18], fov: 55 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        onPointerMissed={() => setSelected(null)}
      >
        <Suspense fallback={null}>
          <Scene
            selected={selected}
            hovered={hovered}
            onSelect={handleSelect}
            onHover={setHovered}
            controlsRef={controlsRef}
          />
          <OrbitControls
            ref={controlsRef}
            enableZoom={false}
            enablePan={false}
            autoRotate={!selected}
            autoRotateSpeed={0.08}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI - Math.PI / 6}
          />
        </Suspense>
      </Canvas>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 20px', background: 'rgba(2,6,23,0.4)',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(148,163,184,0.08)',
        }}
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <img src="https://avatars.githubusercontent.com/ohara407" alt="Yago"
            style={{ width: '38px', height: '38px', borderRadius: '50%', border: '2px solid #7c3aed', boxShadow: '0 0 14px #7c3aed66' }} />
          <div>
            <div style={{ fontSize: '15px', fontWeight: 900, background: 'linear-gradient(135deg,#a78bfa,#38bdf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Yago Santos Silva
            </div>
            <div style={{ fontSize: '10px', color: '#64748b' }}>AI Developer · Automation · Solar Portfolio</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {PLANETS.map((p) => (
            <button
              key={p.id}
              onClick={() => handleSelect(p.id)}
              title={p.label}
              style={{
                background: selected === p.id ? `${p.accent}33` : 'rgba(255,255,255,0.05)',
                border: `1px solid ${selected === p.id ? p.accent : 'rgba(255,255,255,0.07)'}`,
                color: 'white', borderRadius: '999px', padding: '5px 11px',
                fontSize: '13px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s',
              }}
            >
              {p.emoji}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Side panel */}
      <AnimatePresence>
        {selected && (
          <motion.div
            key={selected}
            initial={{ opacity: 0, x: 80, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 80, scale: 0.95 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: 'absolute', top: '50%', right: '16px', transform: 'translateY(-50%)',
              zIndex: 10, width: '340px', maxHeight: '80vh', overflowY: 'auto',
              background: 'rgba(2,6,23,0.9)',
              backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)',
              border: `1px solid ${ACCENT[selected]}22`, borderRadius: '20px', padding: '22px',
              boxShadow: `0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px ${ACCENT[selected]}11`,
            }}
          >
            <button
              onClick={() => setSelected(null)}
              style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(255,255,255,0.06)', border: 'none', color: '#94a3b8', borderRadius: '50%', width: '26px', height: '26px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ✕
            </button>
            {PANELS[selected]}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.p
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3 }}
        style={{ position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, color: '#334155', fontSize: '10px', pointerEvents: 'none', whiteSpace: 'nowrap' }}
      >
        Drag to rotate · Click a planet to zoom in · Esc to zoom out
      </motion.p>
    </div>
  );
}
