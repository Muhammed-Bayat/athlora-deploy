import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { AdditiveBlending, CatmullRomCurve3, ExtrudeGeometry, MathUtils, Shape, TubeGeometry, Vector3, type Group, type ShaderMaterial } from 'three';
import styles from './StadiumIntro.module.css';

interface StadiumIntroProps {
  introProgressRef: MutableRefObject<number>;
  compact: boolean;
}

function smoothstep(start: number, end: number, value: number) {
  const t = MathUtils.clamp((value - start) / Math.max(end - start, .0001), 0, 1);
  return t * t * (3 - 2 * t);
}

function TunnelWordmark({ compact }: { compact: boolean }) {
  if (compact) return null;
  return <>
    <Html transform scale={.5} position={[-2.04, 1.23, 14.35]} rotation={[0, Math.PI / 2, 0]} distanceFactor={7} style={{ pointerEvents: 'none' }}>
      <div style={{ width: 250, color: '#e8feff', fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '.18em', textShadow: '0 0 12px rgba(138, 233, 242, .25)' }}>
        <strong style={{ display: 'block', fontSize: 34, fontWeight: 800 }}>ATHLORA</strong>
        <span style={{ display: 'block', marginTop: 16, color: '#8ae9f2', fontSize: 14, fontWeight: 700, lineHeight: 1.65 }}>PERFORMANCE<br />INTELLIGENCE</span>
      </div>
    </Html>
    <Html transform scale={.5} position={[-2.04, 1.16, 11.7]} rotation={[0, Math.PI / 2, 0]} distanceFactor={7} style={{ pointerEvents: 'none' }}>
      <div style={{ width: 244, color: '#8ae9f2', fontFamily: 'Space Grotesk, sans-serif', fontSize: 14, fontWeight: 700, letterSpacing: '.08em', lineHeight: 1.9, textTransform: 'uppercase', textShadow: '0 0 6px rgba(138, 233, 242, .22)' }}>
        Be the athlete<br />no one wants to<br />compete against
      </div>
    </Html>
    <Html transform scale={.5} position={[2.04, 1.16, 11.7]} rotation={[0, -Math.PI / 2, 0]} distanceFactor={7} style={{ pointerEvents: 'none' }}>
      <div style={{ width: 244, color: '#bdeff3', fontFamily: 'Space Grotesk, sans-serif', fontSize: 16, fontWeight: 700, letterSpacing: '.16em', lineHeight: 1.9, textAlign: 'right' }}>
        BETTER ATHLETES<br />BRIGHTER TOMORROWS
      </div>
    </Html>
  </>;
}

function ArchedTunnel({ compact }: { compact: boolean }) {
  const geometry = useMemo(() => {
    const section = new Shape();
    section.moveTo(-2.34, 0);
    section.lineTo(-2.34, 1.1);
    section.absarc(0, 1.1, 2.34, Math.PI, 0, true);
    section.lineTo(2.34, 0);
    section.lineTo(2.16, 0);
    section.lineTo(2.16, 1.1);
    section.absarc(0, 1.1, 2.16, 0, Math.PI, false);
    section.lineTo(-2.16, 0);
    section.closePath();
    const panels = new ExtrudeGeometry(section, { depth: 1.27, bevelEnabled: false, curveSegments: compact ? 20 : 40 });
    const points = [new Vector3(-2.12, .16, 0), new Vector3(-2.12, .6, 0)];
    for (let index = 0; index <= 40; index += 1) {
      const angle = Math.PI - index / 40 * Math.PI;
      points.push(new Vector3(Math.cos(angle) * 2.12, 1.1 + Math.sin(angle) * 2.12, 0));
    }
    points.push(new Vector3(2.12, .6, 0), new Vector3(2.12, .16, 0));
    const curve = new CatmullRomCurve3(points);
    const segments = compact ? 64 : 112;
    return {
      panels,
      core: new TubeGeometry(curve, segments, .013, 6, false),
      halo: new TubeGeometry(curve, segments, .038, 8, false),
      outerHalo: new TubeGeometry(curve, segments, .075, 8, false),
    };
  }, [compact]);
  useEffect(() => () => Object.values(geometry).forEach((item) => item.dispose()), [geometry]);

  return <>
    {Array.from({ length: 8 }, (_, index) => <mesh key={index} geometry={geometry.panels} position={[0, 0, 5.94 + index * 1.3]}>
      <meshStandardMaterial color={index % 2 ? '#03080b' : '#040a0e'} roughness={.62} metalness={.24} />
    </mesh>)}
    {[6.08, 8.68, 11.28, 13.88, 16.08].map((z) => <group key={z} position={[0, 0, z]}>
      <mesh geometry={geometry.outerHalo}><meshBasicMaterial color="#8ae9f2" transparent opacity={.025} blending={AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
      <mesh geometry={geometry.halo}><meshBasicMaterial color="#8ae9f2" transparent opacity={.12} blending={AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
      <mesh geometry={geometry.core}><meshBasicMaterial color="#8ae9f2" toneMapped={false} /></mesh>
    </group>)}
    {[-1, 1].map((side) => <group key={side}>
      {[.35, .72, 1.08].map((y) => <mesh key={y} position={[side * 2.153, y, 11.1]}>
        <boxGeometry args={[.008, .012, 10.3]} /><meshBasicMaterial color="#102029" />
      </mesh>)}
      <mesh position={[side * 2.1, .07, 11.1]}><boxGeometry args={[.1, .14, 10.3]} /><meshStandardMaterial color="#05090c" roughness={.38} metalness={.6} /></mesh>
      <pointLight position={[side * 1.85, 1.35, 11.28]} color="#8ae9f2" intensity={compact ? 1.8 : 2.6} distance={5} decay={2} />
    </group>)}
    <pointLight position={[0, 2.8, 8.68]} color="#d9fdff" intensity={2} distance={4.5} decay={2} />
  </>;
}

function TunnelFloor({ introProgressRef }: Pick<StadiumIntroProps, 'introProgressRef'>) {
  const materialRef = useRef<ShaderMaterial>(null);

  useFrame(() => {
    const material = materialRef.current;
    if (!material) return;
    material.uniforms.uPortal.value = smoothstep(.05, .34, introProgressRef.current);
  });

  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .012, 11.1]}>
    <planeGeometry args={[4.16, 10]} />
    <shaderMaterial
      ref={materialRef}
      uniforms={{ uPortal: { value: 0 } }}
      vertexShader={`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
      fragmentShader={`
        uniform float uPortal;
        varying vec2 vUv;
        void main() {
          float edge = exp(-pow((abs(vUv.x - .5) - .43) * 13.0, 2.0));
          float bands = pow(.5 + .5 * cos(vUv.y * 24.16), 12.0);
          float grain = fract(sin(dot(vUv * 900.0, vec2(12.9898, 78.233))) * 43758.5453);
          float portalGlow = pow(1.0 - vUv.y, 2.4) * uPortal;
          vec3 base = vec3(.004, .008, .012) * (.8 + grain * .4);
          vec3 cyan = vec3(.255, .815, .888);
          vec3 color = base + cyan * (edge * (.025 + bands * .12) + bands * .012) + vec3(.7, .9, .95) * portalGlow * .025;
          gl_FragColor = vec4(color, 1.0);
        }
      `}
    />
  </mesh>;
}

/** A low-poly, camera-path-specific tunnel with no infield or exterior set pieces to cross the view. */
export function StadiumIntro({ introProgressRef, compact }: StadiumIntroProps) {
  const tunnelRef = useRef<Group>(null);
  const [wordmarkVisible, setWordmarkVisible] = useState(true);
  const visibilityRef = useRef(true);
  const greetingRef = useRef<HTMLDivElement>(null);
  const [greetingVisible, setGreetingVisible] = useState(true);
  const greetingVisibilityRef = useRef(true);
  const [hasScrolled, setHasScrolled] = useState(() => typeof window !== 'undefined' && window.scrollY > 0);
  useEffect(() => {
    const updateCue = () => setHasScrolled(window.scrollY > 0);
    window.addEventListener('scroll', updateCue, { passive: true });
    updateCue();
    return () => window.removeEventListener('scroll', updateCue);
  }, []);
  useFrame(({ camera }) => {
    const visible = introProgressRef.current < .6;
    if (tunnelRef.current) tunnelRef.current.visible = visible;
    // Drei Html lives outside the WebGL scene; group visibility cannot hide its DOM.
    if (visibilityRef.current !== visible) {
      visibilityRef.current = visible;
      setWordmarkVisible(visible);
    }
    // Fade by actual camera distance, finishing before the greeting plane at z=6.15.
    const greetingOpacity = visible ? smoothstep(6.65, 9.5, camera.position.z) : 0;
    if (greetingRef.current) greetingRef.current.style.opacity = greetingOpacity.toFixed(3);
    const showGreeting = greetingOpacity > .001;
    if (greetingVisibilityRef.current !== showGreeting) {
      greetingVisibilityRef.current = showGreeting;
      setGreetingVisible(showGreeting);
    }
  });

  return <group ref={tunnelRef}>
    <group position={[-5.75, 0, 0]}>
      <mesh position={[0, -.07, 11.1]}><boxGeometry args={[4.45, .14, 10.4]} /><meshStandardMaterial color="#061117" roughness={.3} metalness={.66} /></mesh>
      <TunnelFloor introProgressRef={introProgressRef} />
      <ArchedTunnel compact={compact} />
      {wordmarkVisible && <TunnelWordmark compact={compact} />}
      {greetingVisible && <Html transform scale={.5} center position={[0, 1.55, 6.15]} distanceFactor={4} style={{ pointerEvents: 'none' }}>
        <div ref={greetingRef} data-testid="tunnel-greeting" aria-hidden="true" style={{
          width: 600, textAlign: 'center', opacity: 0, pointerEvents: 'none',
          color: '#8ae9f2', fontFamily: 'Space Grotesk, sans-serif',
          textShadow: '0 0 6px rgba(138, 233, 242, .3), 0 0 18px rgba(138, 233, 242, .15)',
        }}>
          <span style={{ display: 'block', fontSize: 24, fontWeight: 500, letterSpacing: '.28em', textTransform: 'uppercase', marginBottom: 20 }}>Welcome to</span>
          <strong style={{ display: 'block', fontSize: 84, fontWeight: 700, letterSpacing: '.08em' }}>ATHLORA</strong>
          <div className={styles.scrollCue} style={{ visibility: hasScrolled ? 'hidden' : 'visible' }}><span>Scroll up to begin the lap</span><span className={styles.arrow} aria-hidden="true">↑</span></div>
        </div>
      </Html>}
    </group>
  </group>;
}
