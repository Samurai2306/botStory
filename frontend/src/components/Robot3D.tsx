import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Environment, Float, Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import { useAuthStore } from '../store/authStore'
import { mergeProfilePreferences } from '../types/profile'

function RobotModel({ lowPower }: { lowPower: boolean }) {
  const groupRef = useRef<THREE.Group>(null)
  const headRef = useRef<THREE.Mesh>(null)
  const eyeLeftRef = useRef<THREE.Mesh>(null)
  const eyeRightRef = useRef<THREE.Mesh>(null)
  const antennaRef = useRef<THREE.Group>(null)

  // Animation
  useFrame((state) => {
    if (lowPower) return
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.2
    }
    
    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(state.clock.elapsedTime) * 0.1
    }

    // Blinking eyes
    if (eyeLeftRef.current && eyeRightRef.current) {
      const blink = Math.sin(state.clock.elapsedTime * 5) > 0.95 ? 0.2 : 1
      eyeLeftRef.current.scale.y = blink
      eyeRightRef.current.scale.y = blink
    }

    // Antenna wobble
    if (antennaRef.current) {
      antennaRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 2) * 0.15
    }
  })

  // Materials
  const bodyMaterial = useMemo(() => (
    <meshStandardMaterial
      color="#8B7ED8"
      metalness={0.8}
      roughness={0.2}
      emissive="#8B7ED8"
      emissiveIntensity={0.5}
    />
  ), [])

  const headMaterial = useMemo(() => (
    <meshStandardMaterial
      color="#c084fc"
      metalness={0.9}
      roughness={0.1}
      emissive="#c084fc"
      emissiveIntensity={0.6}
    />
  ), [])

  const eyeMaterial = useMemo(() => (
    <meshStandardMaterial
      color="#B8A9E8"
      emissive="#B8A9E8"
      emissiveIntensity={1.5}
      toneMapped={false}
    />
  ), [])

  return (
    <Float speed={lowPower ? 0.8 : 2} rotationIntensity={lowPower ? 0.05 : 0.2} floatIntensity={lowPower ? 0.1 : 0.5}>
      <group ref={groupRef}>
        {/* Sparkles effect */}
        <Sparkles
          count={lowPower ? 12 : 50}
          scale={3}
          size={lowPower ? 1 : 2}
          speed={lowPower ? 0.2 : 0.5}
          color="#8B7ED8"
        />

        {/* Head */}
        <mesh ref={headRef} position={[0, 1.5, 0]} castShadow>
          <boxGeometry args={[0.8, 0.8, 0.8]} />
          {headMaterial}
        </mesh>

        {/* Antenna */}
        <group ref={antennaRef} position={[0, 2.1, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.4]} />
            <meshStandardMaterial color="#ffff00" emissive="#ffff00" emissiveIntensity={1} />
          </mesh>
          <mesh position={[0, 0.25, 0]}>
            <sphereGeometry args={[0.1, 16, 16]} />
            <meshStandardMaterial color="#ffff00" emissive="#ffff00" emissiveIntensity={2} />
          </mesh>
        </group>

        {/* Eyes */}
        <mesh ref={eyeLeftRef} position={[-0.2, 1.6, 0.4]} castShadow>
          <boxGeometry args={[0.15, 0.2, 0.05]} />
          {eyeMaterial}
        </mesh>
        <mesh ref={eyeRightRef} position={[0.2, 1.6, 0.4]} castShadow>
          <boxGeometry args={[0.15, 0.2, 0.05]} />
          {eyeMaterial}
        </mesh>

        {/* Mouth indicator */}
        <mesh position={[0, 1.3, 0.4]}>
          <boxGeometry args={[0.4, 0.08, 0.05]} />
          <meshStandardMaterial color="#00ff9f" emissive="#00ff9f" emissiveIntensity={0.5} />
        </mesh>

        {/* Body (torso) */}
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[1, 1.2, 0.8]} />
          {bodyMaterial}
        </mesh>

        {/* Chest core */}
        <mesh position={[0, 0.6, 0.41]}>
          <sphereGeometry args={[0.15, 16, 16]} />
          <meshStandardMaterial
            color="#B8A9E8"
            emissive="#B8A9E8"
            emissiveIntensity={2}
            toneMapped={false}
          />
        </mesh>

        {/* Arms */}
        <group>
          {/* Left arm */}
          <mesh position={[-0.7, 0.5, 0]} castShadow>
            <boxGeometry args={[0.25, 0.8, 0.25]} />
            {bodyMaterial}
          </mesh>
          <mesh position={[-0.7, -0.1, 0]} castShadow>
            <boxGeometry args={[0.2, 0.4, 0.2]} />
            {headMaterial}
          </mesh>

          {/* Right arm */}
          <mesh position={[0.7, 0.5, 0]} castShadow>
            <boxGeometry args={[0.25, 0.8, 0.25]} />
            {bodyMaterial}
          </mesh>
          <mesh position={[0.7, -0.1, 0]} castShadow>
            <boxGeometry args={[0.2, 0.4, 0.2]} />
            {headMaterial}
          </mesh>
        </group>

        {/* Legs */}
        <group>
          {/* Left leg */}
          <mesh position={[-0.25, -0.5, 0]} castShadow>
            <boxGeometry args={[0.3, 0.8, 0.3]} />
            {headMaterial}
          </mesh>
          <mesh position={[-0.25, -1.1, 0]} castShadow>
            <boxGeometry args={[0.35, 0.3, 0.4]} />
            <meshStandardMaterial color="#8B7ED8" metalness={0.9} roughness={0.1} />
          </mesh>

          {/* Right leg */}
          <mesh position={[0.25, -0.5, 0]} castShadow>
            <boxGeometry args={[0.3, 0.8, 0.3]} />
            {headMaterial}
          </mesh>
          <mesh position={[0.25, -1.1, 0]} castShadow>
            <boxGeometry args={[0.35, 0.3, 0.4]} />
            <meshStandardMaterial color="#8B7ED8" metalness={0.9} roughness={0.1} />
          </mesh>
        </group>

        {/* Energy field rings */}
        <mesh position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.2, 0.02, 16, 100]} />
          <meshStandardMaterial
            color="#8B7ED8"
            emissive="#8B7ED8"
            emissiveIntensity={1}
            transparent
            opacity={0.6}
          />
        </mesh>
        <mesh position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, Math.PI / 4]}>
          <torusGeometry args={[1.3, 0.02, 16, 100]} />
          <meshStandardMaterial
            color="#c084fc"
            emissive="#c084fc"
            emissiveIntensity={1}
            transparent
            opacity={0.4}
          />
        </mesh>
      </group>
    </Float>
  )
}

export default function Robot3D() {
  const { user } = useAuthStore()
  const performanceMode = user
    ? !!mergeProfilePreferences(user.profile_preferences).ui.performance_mode
    : false
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const onVisibilityChange = () => {
      setIsVisible(document.visibilityState !== 'hidden')
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  const lowPower = performanceMode || !isVisible

  return (
    <div style={{ width: '100%', height: '500px', position: 'relative' }}>
      <Canvas
        camera={{ position: [0, 1, 5], fov: 50 }}
        shadows={!lowPower}
        dpr={lowPower ? [1, 1.2] : [1, 2]}
        frameloop={lowPower ? 'demand' : 'always'}
        gl={{ antialias: !lowPower, alpha: true }}
      >
        <color attach="background" args={['#0a0a0f']} />
        
        {/* Lighting */}
        <ambientLight intensity={lowPower ? 0.4 : 0.5} />
        <spotLight
          position={[5, 5, 5]}
          angle={0.3}
          penumbra={1}
          intensity={lowPower ? 1.2 : 2}
          castShadow={!lowPower}
          color="#8B7ED8"
        />
        <spotLight
          position={[-5, 5, -5]}
          angle={0.3}
          penumbra={1}
          intensity={lowPower ? 1 : 1.5}
          castShadow={!lowPower}
          color="#c084fc"
        />
        <pointLight position={[0, 1, 3]} intensity={lowPower ? 0.6 : 1} color="#B8A9E8" />
        
        {/* Robot */}
        <RobotModel lowPower={lowPower} />
        
        {/* Ground with reflection */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]} receiveShadow>
          <planeGeometry args={[10, 10]} />
          <meshStandardMaterial
            color="#0a0a0f"
            metalness={1}
            roughness={0.2}
            envMapIntensity={1}
          />
        </mesh>
        
        {/* Environment for reflections */}
        {!lowPower && <Environment preset="city" />}
        
        {/* Controls */}
        <OrbitControls
          enableZoom={true}
          enablePan={false}
          minDistance={3}
          maxDistance={8}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 2}
        />
      </Canvas>
      
      {/* Instructions overlay */}
      <div style={{
        position: 'absolute',
        bottom: '10px',
        left: '50%',
        transform: 'translateX(-50%)',
        color: '#8B7ED8',
        fontFamily: 'Minecraft, Orbitron, monospace',
        fontSize: '0.9rem',
        textShadow: '0 0 10px rgba(139, 126, 216, 0.8)',
        pointerEvents: 'none',
        textAlign: 'center',
        letterSpacing: '2px'
      }}>
        ВРАЩАЙТЕ МЫШЬЮ • ZOOM КОЛЁСИКОМ
      </div>
    </div>
  )
}
