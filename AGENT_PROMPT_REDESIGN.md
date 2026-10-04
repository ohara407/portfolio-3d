# ============================================================
# AGENT PROMPT — 3D Solar Portfolio Redesign
# Use this with: Amazon Q Developer, Claude Code, Codex, etc.
# Project path: C:\CacadorDeVagas\portfolio-3d
# ============================================================

You are an expert React + Three.js developer. Completely rebuild the file
`C:\CacadorDeVagas\portfolio-3d\src\App.tsx` with the following requirements:

## 🎯 GOAL
Create a stunning, realistic 3D solar system portfolio for Yago Santos Silva
(GitHub: ohara407) with real-time planet orbits, click-to-zoom interactions,
GLSL shaders for planet surfaces, and animated info panels.

---

## 🪐 PLANET SYSTEM

Each planet must ORBIT around a central sun using `useFrame` with elapsed time.
Orbit formula:
  x = orbitRadius * Math.cos(time * speed + phase)
  z = orbitRadius * Math.sin(time * speed + phase)
  y = amplitude * Math.sin(time * speed * 2 + phase) // slight vertical wave

Planets (7 total):
| ID         | Label          | Orbit R | Speed   | Planet R | Color Base | Has Rings |
|------------|----------------|---------|---------|----------|------------|-----------|
| about      | About Me       | 5.0     | 0.25    | 1.2      | #4c1d95    | true      |
| projects   | Projects       | 7.5     | 0.18    | 1.6      | #1e3a8a    | false     |
| stack      | Tech Stack     | 10.0    | 0.13    | 1.0      | #064e3b    | true      |
| contact    | Contact        | 3.5     | 0.40    | 0.7      | #7f1d1d    | false     |
| exp        | Experience     | 12.5    | 0.09    | 1.4      | #78350f    | true      |
| tutorials  | Tutorials      | 8.5     | 0.15    | 0.9      | #134e4a    | false     |
| presents   | Presentations  | 6.0     | 0.20    | 1.1      | #6b21a8    | true      |

---

## 🎨 VISUAL REQUIREMENTS

### 1. Planet Surface (GLSL ShaderMaterial)
Each planet must use a custom ShaderMaterial with these vertex/fragment shaders:

```glsl
// Vertex
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vPosition;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vUv = uv;
  vPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

// Fragment  
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform float uTime;
uniform vec3 uLightDir;

varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vPosition;

// 3D Simplex-like noise
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
  // Animated surface noise (bands + continents)
  vec3 p = vPosition * 2.5 + vec3(uTime * 0.02, 0.0, 0.0);
  float n = fbm(p);
  float bands = sin(vPosition.y * 8.0 + n * 3.0) * 0.5 + 0.5;
  
  vec3 col = mix(uColor1, uColor2, n);
  col = mix(col, uColor3, bands * 0.4);
  
  // Diffuse lighting from sun
  float diff = max(dot(vNormal, normalize(uLightDir)), 0.05);
  col *= (diff * 0.9 + 0.1);
  
  // Specular highlight
  vec3 viewDir = normalize(-vPosition);
  vec3 halfDir = normalize(normalize(uLightDir) + viewDir);
  float spec = pow(max(dot(vNormal, halfDir), 0.0), 32.0) * 0.3;
  col += spec;
  
  // Limb darkening (edges are darker, like real planets)
  float rim = 1.0 - max(dot(vNormal, viewDir), 0.0);
  col *= (1.0 - rim * rim * 0.5);
  
  gl_FragColor = vec4(col, 1.0);
}
```

Each planet gets 3 color uniforms based on its palette (dark, mid, bright).

### 2. Planet Rings (custom ShaderMaterial)
Ring shader with radial fade and particle gaps:
```glsl
// Fragment
uniform vec3 uColor;
varying vec2 vUv;

float hash1(float n) { return fract(sin(n) * 43758.5453); }

void main() {
  float r = length(vUv - 0.5) * 2.0;
  if (r < 0.3 || r > 1.0) discard;
  
  // Concentric ring gaps
  float rings = sin(r * 80.0) * 0.5 + 0.5;
  float noise = hash1(floor(r * 200.0)) * 0.4;
  float alpha = rings * noise * smoothstep(0.3, 0.4, r) * smoothstep(1.0, 0.85, r);
  
  gl_FragColor = vec4(uColor, alpha * 0.7);
}
```

### 3. Atmospheric Glow
Around each planet, add a BackSide sphere 8% larger with:
- Color = planet's accent color
- Opacity 0.12
- Also a second sphere at 20% larger, opacity 0.04 (outer glow)

### 4. Orbit Path Lines
For each planet, draw its orbit path as a `<line>` using `THREE.RingGeometry`
or a custom `BufferGeometry` with 256 points in a circle.
Use `lineBasicMaterial` with opacity 0.06, color white. Only visible when NOT hovered.

### 5. Sun
- Emissive sphere radius 1.5 at position [0,0,0]
- Three corona shells at 1.8, 2.2, 2.8 with BackSide + decreasing opacity
- Animated: slowly rotate + pulse emissiveIntensity with sine wave
- PointLight from sun position (not hardcoded far away)
- Use `<EffectComposer><Bloom>` from @react-three/postprocessing

### 6. Asteroid Belt
Add 300 tiny rocks between orbit radii 9 and 11:
```js
Array.from({length:300}).map(() => {
  const r = 9 + Math.random() * 2;
  const angle = Math.random() * Math.PI * 2;
  return { x: r*cos(angle), z: r*sin(angle), y: (random-0.5)*0.3 }
})
```
Each rock = `<mesh>` with `<dodecahedronGeometry args={[0.03]}/>` and gray material.
Slowly rotate the whole asteroid group.

---

## 🖱️ INTERACTIONS

### Click to Zoom (Camera Focus)
When a planet is clicked:
1. Animate the camera to position: planet.position + direction*4 using `lerp` in `useFrame`
2. Set `OrbitControls` target to the planet's current world position
3. Show the info panel on the right side
4. Add a pulsing ring around the selected planet

### Hover Effects
- Planet scale lerps to 1.15 on hover
- Show floating HTML label (already implemented, keep it)
- Cursor changes to pointer
- Orbit path becomes slightly brighter (opacity 0.15)

### Planet Click → Camera Zoom Back
If clicking the same planet again or pressing Escape → camera lerps back to
default position [0, 3, 18] looking at [0, 0, 0]

### Drag to Rotate
Keep `<OrbitControls>` but:
- `enableZoom={false}`
- `autoRotate={true}` with speed 0.08 (very slow)
- `autoRotateSpeed={0}` when a planet is selected (pause auto-rotation)

---

## 📋 INFO PANELS (right side slide-in)

Use `framer-motion` AnimatePresence with slide from right.
Panel width: 340px, max-height: 80vh, scrollable.
Glass effect: `background: rgba(2,6,23,0.9)`, `backdropFilter: blur(28px)`

Panel data (keep existing content but improve layout):

### about panel (purple accent #a78bfa):
- Avatar (github.com/ohara407 pic), name gradient, bio
- 4 stat cards: ADS, PICTA, Certs, Background
- 3 buttons: GitHub, LinkedIn, Portfolio

### projects panel (blue accent #60a5fa):
- 5 project cards with emoji, name, description, tech tags
- Link buttons where applicable

### stack panel (green accent #34d399):
- Grouped by category with colored tags
- 6 categories: AI, Frontend, Mobile, Cloud, Backend, Tools

### tutorials panel (teal accent #2dd4bf):
- Certification list with ✓ and year
- "Currently Studying" section
- Platform links

### presents panel (magenta accent #e879f9):
- 3 presentation cards with live demo links:
  1. Campanha 4090: https://lucianodados4090.z13.web.core.windows.net/qg/
  2. Job Hunter Dashboard
  3. PICTA Research

### contact panel (red accent #f87171):
- 4 contact cards: LinkedIn, GitHub, Email, Portfolio with hover animation

### exp panel (gold accent #fbbf24):
- Timeline of 5 experiences
- 4 key achievements with ⚡

---

## 🎭 HEADER

- Left: Avatar + Name gradient + subtitle
- Right: 7 emoji pill buttons (one per planet), highlight when selected
- Glassmorphism bar: `background: rgba(2,6,23,0.4)`, `backdropFilter: blur(12px)`

---

## 📦 PACKAGES ALREADY INSTALLED
- three, @react-three/fiber, @react-three/drei
- @react-three/postprocessing
- framer-motion

DO NOT add new npm packages. Use only what is installed.

---

## ⚙️ TECHNICAL CONSTRAINTS

- TypeScript strict mode (no `any` without ref)
- All `useRef` must pass `null` as initial value: `useRef<T>(null)`
- No `import React` (use named imports only)
- Wrap Canvas in `<Suspense fallback={null}>`
- `gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}`
- Use `useShaderMaterial` pattern or inline ShaderMaterial via `shaderMaterial` from drei
- The `Stars` component from drei does NOT accept a `fade` boolean prop — omit it

---

## 📁 FILES TO MODIFY
- `C:\CacadorDeVagas\portfolio-3d\src\App.tsx` → full rewrite
- `C:\CacadorDeVagas\portfolio-3d\src\index.css` → keep minimal reset

DO NOT modify package.json, vite.config.ts, or tsconfig files.

---

## ✅ DONE CRITERIA
The page at http://localhost:5175/portfolio-3d/ should show:
1. A glowing sun at center with visible bloom corona
2. 7 colored planets orbiting with visible orbit paths
3. Asteroid belt between outer orbits
4. Clicking any planet zooms camera toward it and opens side panel
5. All panel links are clickable and open correct URLs
6. Emoji header buttons work as shortcuts to open panels
7. No TypeScript errors (run `npx tsc --noEmit` to verify)
