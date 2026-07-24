import React, { useRef } from 'react'
import { useGLTF, Center } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ESP32Model(props: any) {
  const gltf = useGLTF('/ESP32-S3-WROOM-1.glb')
  const group = useRef<THREE.Group>(null)

  useFrame((state) => {
    if (group.current) {
      group.current.rotation.y += 0.005 // Slower spin
      group.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.5) * 0.1 // Slight wobble
      group.current.position.y = Math.sin(state.clock.elapsedTime * 2) * 0.1
    }
  })

  return (
    <group ref={group} {...props} dispose={null}>
      <Center>
        <primitive object={gltf.scene} scale={75} rotation={[0, 0, 0]} />
      </Center>
    </group>
  )
}

useGLTF.preload('/ESP32-S3-WROOM-1.glb')
