import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { ScrollControls, Scroll, Environment, Stars } from '@react-three/drei';
import Scene from './Scene.jsx';

// Fully-3D immersive landing: a single WebGL canvas with a scroll-driven scene
// and HTML content layered over it via drei's <Scroll html>. This is the JARVIS
// default — replace the copy + swap the hero mesh per brand; keep it 3D.
export default function App() {
  return (
    <>
      <Canvas camera={{ position: [0, 0, 6], fov: 45 }} dpr={[1, 2]} gl={{ antialias: true }}>
        <color attach="background" args={['#05070d']} />
        <fog attach="fog" args={['#05070d', 9, 24]} />
        <ambientLight intensity={0.45} />
        <directionalLight position={[5, 6, 5]} intensity={1.3} color="#bfe9ff" />
        <pointLight position={[-6, -4, -2]} intensity={0.6} color="#2f6cff" />
        <Suspense fallback={null}>
          <Environment preset="night" />
          <Stars radius={70} depth={45} count={3800} factor={4} saturation={0} fade speed={1} />
          <ScrollControls pages={3} damping={0.22}>
            <Scene />
            <Scroll html>
              <div className="overlay">
                <section className="section">
                  <div className="eyebrow">Immersive · Interactive · 3D</div>
                  <h1 className="headline">Build something the web hasn't seen.</h1>
                  <p className="sub">
                    A fully three-dimensional experience — depth, motion, and light from the first
                    frame. This is the default, not the upgrade.
                  </p>
                  <button className="cta">Enter →</button>
                </section>

                <section className="section right">
                  <div className="eyebrow">Crafted in real-time</div>
                  <h1 className="headline">Every pixel rendered live.</h1>
                  <p className="sub">
                    Real geometry, real lighting, real reaction to your scroll and your cursor — not a
                    video, not a mockup. Sixty frames a second of presence.
                  </p>
                </section>

                <section className="section">
                  <div className="eyebrow">Your brand, in dimension</div>
                  <h1 className="headline">Make them remember you.</h1>
                  <p className="sub">
                    Swap the hero, the palette, the copy — the immersion stays. This starter is where
                    every JARVIS site begins.
                  </p>
                  <button className="cta">Start the build →</button>
                </section>
              </div>
            </Scroll>
          </ScrollControls>
        </Suspense>
      </Canvas>
      <div className="scroll-hint">scroll to explore</div>
    </>
  );
}
