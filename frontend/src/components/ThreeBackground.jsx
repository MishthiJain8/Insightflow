import React, { useRef, useMemo, useEffect, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Points, PointMaterial } from '@react-three/drei'
import * as THREE from 'three'

// ─── Particle Nebula ──────────────────────────────────────────────────────────
function ParticleNebula({ count = 6000, sentiment = 0.8, performance = 0 }) {
    const pointsRef = useRef()
    const targetRotation = useRef({ x: 0, y: 0 })

    // sentiment + profit/loss both influence behaviour
    const isBullish = sentiment > 0.5
    const hasProfit = performance > 0
    const targetColor = useMemo(() => {
        if (hasProfit) return new THREE.Color("#00F2FF")
        return new THREE.Color(isBullish ? "#00F2FF" : "#FF4500")
    }, [isBullish, hasProfit])
    const speedMultiplier = hasProfit ? 0.12 : (isBullish ? 0.05 : 0.015)

    const { positions, randomFactors } = useMemo(() => {
        const pos = new Float32Array(count * 3)
        const factors = new Float32Array(count)
        for (let i = 0; i < count; i++) {
            // Spherical distribution
            const r = 10 + Math.random() * 20
            const theta = 2 * Math.PI * Math.random()
            const phi = Math.acos(2 * Math.random() - 1)
            pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
            pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
            pos[i * 3 + 2] = r * Math.cos(phi) - 10
            factors[i] = Math.random()
        }
        return { positions: pos, randomFactors: factors }
    }, [count])

    // Mouse parallax effect
    useEffect(() => {
        const handleMouseMove = (e) => {
            targetRotation.current.x = (e.clientY / window.innerHeight - 0.5) * 0.3
            targetRotation.current.y = (e.clientX / window.innerWidth - 0.5) * 0.3
        }
        window.addEventListener('mousemove', handleMouseMove)
        return () => window.removeEventListener('mousemove', handleMouseMove)
    }, [])

    const elapsedTime = useRef(0)

    useFrame(({ camera }, delta) => {
        if (pointsRef.current) {
            elapsedTime.current += delta
            const t = elapsedTime.current

            // Base rotation
            pointsRef.current.rotation.y += speedMultiplier * 0.1
            pointsRef.current.rotation.z = Math.sin(t * 0.05) * 0.1

            if (hasProfit) {
                // fast vortex swirl when portfolio is up
                pointsRef.current.material.opacity = 0.6 + Math.sin(t * 5) * 0.3
                // keep particles zippy
                pointsRef.current.position.y += (0 - pointsRef.current.position.y) * 0.02
            } else if (isBullish) {
                // Neon Cyan Pulse
                pointsRef.current.material.opacity = 0.4 + Math.sin(t * 3) * 0.2
                pointsRef.current.position.y += (0 - pointsRef.current.position.y) * 0.01
            } else {
                // Bearish / loss: red snow falling slowly
                pointsRef.current.material.opacity = 0.5
                pointsRef.current.position.y -= 0.02
                if (pointsRef.current.position.y < -30) pointsRef.current.position.y = 30
            }

            // Smoothly interpolate color
            pointsRef.current.material.color.lerp(targetColor, 0.05)

            // Mouse parallax interpolation
            camera.position.x += (targetRotation.current.y * 10 - camera.position.x) * 0.05
            camera.position.y += (-targetRotation.current.x * 10 - camera.position.y) * 0.05
            camera.lookAt(0, 0, 0)
        }
    })

    return (
        <Points ref={pointsRef} positions={positions} stride={3} frustumCulled={false}>
            <PointMaterial
                transparent
                color="#00F2FF"
                size={0.06}
                sizeAttenuation={true}
                depthWrite={false}
                opacity={0.6}
                blending={THREE.AdditiveBlending}
            />
        </Points>
    )
}

function Scene({ sentiment }) {
    return (
        <>
            <ambientLight intensity={0.1} />
            <ParticleNebula count={6000} sentiment={sentiment} />
        </>
    )
}

// ─── Exported Component ───────────────────────────────────────────────────────
export default function ThreeBackground({ initialSentiment = 0.8 }) {
    const [sentiment, setSentiment] = useState(initialSentiment)
    const [performance, setPerformance] = useState(0)

    useEffect(() => {
        const handleUpdate = (e) => {
            const score = e.detail?.score ?? 50
            setSentiment(score / 100)
        }
        const handlePerf = (e) => {
            const p = e.detail?.profit ?? 0
            setPerformance(p)
        }
        window.addEventListener('update_conviction', handleUpdate)
        window.addEventListener('portfolio_update', handlePerf)
        return () => {
            window.removeEventListener('update_conviction', handleUpdate)
            window.removeEventListener('portfolio_update', handlePerf)
        }
    }, [])

    return (
        <div className="three-bg" style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: 'transparent' }}>
            <Canvas
                camera={{ position: [0, 0, 15], fov: 60 }}
                gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
                dpr={[1, 1.5]}
            >
                <Scene sentiment={sentiment} performance={performance} />
            </Canvas>
        </div>
    )
}
