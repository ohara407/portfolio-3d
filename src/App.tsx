import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Float, MeshDistortMaterial, Sphere } from '@react-three/drei';
import { motion } from 'framer-motion';

function FloatingSphere({ position, color, distort }: { position: [number, number, number], color: string, distort: number }) {
  const sphereRef = useRef<any>(null);
  useFrame((state) => {
    if (sphereRef.current) {
      sphereRef.current.rotation.x = state.clock.getElapsedTime() * 0.2;
      sphereRef.current.rotation.y = state.clock.getElapsedTime() * 0.3;
    }
  });
  return (
    <Float speed={2} rotationIntensity={1} floatIntensity={2} position={position}>
      <Sphere ref={sphereRef} args={[1, 64, 64]} scale={1.2}>
        <MeshDistortMaterial color={color} attach="material" distort={distort} speed={2} roughness={0.2} metalness={0.8} />
      </Sphere>
    </Float>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1.5} />
      <pointLight position={[-10, -10, -10]} intensity={1} color="#6366f1" />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} speed={1} />
      <FloatingSphere position={[-4, 1, -2]} color="#8b5cf6" distort={0.4} />
      <FloatingSphere position={[4, -1, -3]} color="#3b82f6" distort={0.5} />
      <FloatingSphere position={[0, -3, -5]} color="#10b981" distort={0.3} />
      <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.5} />
    </>
  );
}

const stacks = [
  { label: "React & TS", color: "text-blue-400", emoji: "⚛️" },
  { label: "Python & Bots", color: "text-green-400", emoji: "🤖" },
  { label: "AI & LLMs", color: "text-purple-400", emoji: "🧠" },
  { label: "Azure & DevOps", color: "text-cyan-400", emoji: "☁️" },
];

export default function App() {
  return (
    <div className="relative w-full h-screen bg-[#050505] overflow-hidden text-white font-sans">
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 8], fov: 45 }}>
          <Scene />
        </Canvas>
      </div>

      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none p-4 md:p-6">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="p-8 md:p-12 rounded-3xl bg-white/5 backdrop-blur-md border border-white/10 shadow-2xl max-w-4xl w-full flex flex-col items-center text-center pointer-events-auto"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.8, delay: 1, type: "spring" }}
            className="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden border-4 border-indigo-500/50 mb-6 shadow-[0_0_30px_rgba(99,102,241,0.5)]"
          >
            <img src="https://avatars.githubusercontent.com/ohara407" alt="Yago Silva" className="w-full h-full object-cover" />
          </motion.div>

          <h1 className="text-4xl md:text-6xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 mb-2">
            Yago Santos Silva
          </h1>
          <h2 className="text-xl md:text-2xl text-slate-300 mb-6 font-light">
            AI-Assisted Developer & Automation Engineer
          </h2>

          <p className="text-slate-400 max-w-2xl text-sm md:text-base leading-relaxed mb-8">
            Building scalable autonomous systems, orchestrating complex workflows with n8n,
            and engineering hybrid AI solutions (Gemini & LLaMA). I don't sell hours. I sell solutions.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mb-10">
            {stacks.map((item, i) => (
              <div key={i} className="flex flex-col items-center p-4 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
                <span className="text-3xl mb-2">{item.emoji}</span>
                <span className={`font-semibold text-sm ${item.color}`}>{item.label}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-6 justify-center">
            <a href="https://github.com/ohara407" target="_blank" rel="noreferrer"
              className="flex items-center gap-2 px-5 py-3 bg-white/10 rounded-full hover:bg-white/20 transition-all hover:scale-110 font-semibold text-sm">
              ⬡ GitHub
            </a>
            <a href="https://linkedin.com/in/yago-santos-silva-aa3233245" target="_blank" rel="noreferrer"
              className="flex items-center gap-2 px-5 py-3 bg-indigo-600/80 rounded-full hover:bg-indigo-500 transition-all hover:scale-110 font-semibold text-sm">
              in LinkedIn
            </a>
            <a href="mailto:yagosantossilva0@gmail.com"
              className="flex items-center gap-2 px-5 py-3 bg-rose-600/80 rounded-full hover:bg-rose-500 transition-all hover:scale-110 font-semibold text-sm">
              ✉ Email
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
