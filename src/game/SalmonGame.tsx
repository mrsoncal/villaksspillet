import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { SalmonScene } from './SalmonScene'
import { gameBus } from './EventBus'
import type { LevelId } from '../types'

export function SalmonGame({ level, reducedMotion, sound }: { level: LevelId; reducedMotion: boolean; sound: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hostRef.current) return
    const scene = new SalmonScene(level, reducedMotion, sound)
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      backgroundColor: '#0d7182',
      scene: [scene],
      physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 0 }, debug: false },
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: '100%',
        height: '100%',
      },
      render: { antialias: true, pixelArt: false, roundPixels: false },
      input: { activePointers: 2 },
      disableContextMenu: true,
      transparent: false,
    })

    return () => game.destroy(true)
  }, [level, reducedMotion])

  useEffect(() => {
    gameBus.emit('soundEnabled', sound)
  }, [sound])

  return <div ref={hostRef} className="phaser-host" aria-label={`Spillområde, nivå ${level}`} />
}
