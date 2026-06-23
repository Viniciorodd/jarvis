import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useScroll, Float, MeshDistortMaterial, Sparkles } from '@react-three/drei';

// The 3D content. Everything reacts to scroll (useScroll) so the page is one
// continuous immersive shot rather than stacked flat sections.
export default function Scene() {
  const scroll = useScroll();
  const group = useRef();
  const core = useRef();
  const knot = useRef();

  useFrame((state, delta) => {
    const o = scroll.offset; // 0 → 1 across all pages
    // the whole rig rotates + pushes back as you scroll
    group.current.rotation.y = o * Math.PI * 2;
    group.current.position.z = o * 3.5;
    // hero core breathes + spins
    core.current.rotation.y += delta * 0.25;
    // secondary knot tumbles
    knot.current.rotation.x += delta * 0.4;
    knot.current.rotation.z += delta * 0.15;
    // gentle parallax camera sweep driven by scroll
    state.camera.position.x = Math.sin(o * Math.PI) * 2.2;
    state.camera.position.y = o * 0.6;
    state.camera.lookAt(0, 0, 0);
  });

  return (
    <group ref={group}>
      <Float speed={2} rotationIntensity={1.1} floatIntensity={1.6}>
        <mesh ref={core}>
          <icosahedronGeometry args={[1.6, 12]} />
          <MeshDistortMaterial
            color="#4cc2ff"
            emissive="#0a3a55"
            emissiveIntensity={0.6}
            roughness={0.12}
            metalness={0.65}
            distort={0.38}
            speed={1.8}
          />
        </mesh>
      </Float>

      <mesh ref={knot} position={[3.2, -1.1, -2]} scale={0.55}>
        <torusKnotGeometry args={[1, 0.3, 160, 32]} />
        <meshStandardMaterial color="#7fe7ff" roughness={0.18} metalness={0.85} />
      </mesh>

      <Sparkles count={90} scale={[14, 10, 14]} size={2.2} speed={0.4} color="#9fd8ff" />
    </group>
  );
}
