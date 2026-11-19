import type { GameResult, HudState } from '../types'
import type { SoundEffect, SwimmingSound } from '../audio/Soundscape'

type GameEvents = {
  hud: HudState
  loading: { level: HudState['level']; progress: number }
  ready: HudState['level']
  complete: GameResult
  gameOver: undefined
  pause: undefined
  resume: undefined
  restart: undefined
  sound: SoundEffect
  soundEnabled: boolean
  swimming: SwimmingSound
}

type Handler<T> = (payload: T) => void

class TypedBus {
  private target = new EventTarget()

  on<K extends keyof GameEvents>(name: K, handler: Handler<GameEvents[K]>) {
    const listener = (event: Event) => handler((event as CustomEvent<GameEvents[K]>).detail)
    this.target.addEventListener(name, listener)
    return () => this.target.removeEventListener(name, listener)
  }

  emit<K extends keyof GameEvents>(name: K, payload?: GameEvents[K]) {
    this.target.dispatchEvent(new CustomEvent(name, { detail: payload }))
  }
}

export const gameBus = new TypedBus()
