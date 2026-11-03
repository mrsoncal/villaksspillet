import swimmingSampleUrl from '../assets/swim-water-eaglaxle.mp3'

export type AmbienceMode = 'menu' | 'river' | 'ocean' | 'danger' | 'quiet'

export type SoundEffect =
  | 'tap'
  | 'start'
  | 'eat'
  | 'evolve'
  | 'damage'
  | 'death'
  | 'complete'
  | 'hide'
  | 'splash'
  | 'hook'

export type SwimmingSound = {
  playerSpeed: number
  playerPhase: number
  predatorPresence: number
  predatorPhase: number
}

type BrowserAudioWindow = typeof window & { webkitAudioContext?: typeof AudioContext }

export class Soundscape {
  private context?: AudioContext
  private master?: GainNode
  private ambienceSources: AudioScheduledSourceNode[] = []
  private ambienceNodes: AudioNode[] = []
  private swimSample?: AudioBuffer
  private swimSampleLoading = false
  private swimSampleFailed = false
  private swimmingSources?: { player: AudioBufferSourceNode; predator: AudioBufferSourceNode }
  private swimmingGains?: { player: GainNode; predator: GainNode }
  private enabled = true
  private mode: AmbienceMode = 'menu'

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    if (!this.context || !this.master) return
    const now = this.context.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setTargetAtTime(enabled ? 0.72 : 0.0001, now, 0.05)
    if (enabled && this.ambienceSources.length === 0) this.restartAmbience()
  }

  setAmbience(mode: AmbienceMode) {
    if (this.mode === mode) return
    this.mode = mode
    if (this.context) this.restartAmbience()
  }

  unlock() {
    const context = this.ensureContext()
    if (!context) return
    if (context.state === 'suspended') void context.resume()
    if (this.ambienceSources.length === 0) this.restartAmbience()
    this.loadSwimmingSample(context)
  }

  setSwimming({ playerSpeed, playerPhase, predatorPresence, predatorPhase }: SwimmingSound) {
    if (!this.context || !this.enabled) return
    this.ensureSwimming()
    if (!this.swimmingGains || !this.swimmingSources) return
    const now = this.context.currentTime
    const swimStrength = Math.min(1, Math.max(0, playerSpeed) / 210)
    const predatorStrength = Math.min(1, Math.max(0, predatorPresence))
    const playerSwell = 0.86 + Math.max(0, Math.sin(playerPhase)) * 0.14
    const predatorSwell = 0.82 + Math.max(0, Math.sin(predatorPhase)) * 0.18
    this.swimmingGains.player.gain.setTargetAtTime(swimStrength * playerSwell * 0.13, now, 0.12)
    this.swimmingGains.predator.gain.setTargetAtTime(predatorStrength * predatorSwell * 0.085, now, 0.18)
    this.swimmingSources.player.playbackRate.setTargetAtTime(0.88 + swimStrength * 0.14, now, 0.3)
    this.swimmingSources.predator.playbackRate.setTargetAtTime(0.76 + predatorStrength * 0.1, now, 0.4)
  }

  stopSwimming() {
    if (!this.context || !this.swimmingGains) return
    const now = this.context.currentTime
    this.swimmingGains.player.gain.setTargetAtTime(0.0001, now, 0.07)
    this.swimmingGains.predator.gain.setTargetAtTime(0.0001, now, 0.07)
  }

  play(effect: SoundEffect) {
    if (!this.enabled) return
    const context = this.ensureContext()
    if (!context || !this.master) return
    if (context.state === 'suspended') void context.resume()
    const now = context.currentTime

    switch (effect) {
      case 'tap':
        this.tone(260, 330, 0.1, 0.025, 'sine', now)
        break
      case 'start':
        this.tone(220, 360, 0.32, 0.07, 'sine', now)
        this.tone(330, 520, 0.28, 0.045, 'triangle', now + 0.08)
        break
      case 'eat':
        this.noiseBurst(520, 0.052, 0.075, now, 'lowpass')
        this.tone(235, 88, 0.15, 0.048, 'sine', now + 0.012)
        this.noiseBurst(280, 0.085, 0.035, now + 0.052, 'lowpass')
        break
      case 'evolve':
        [262, 392, 523, 784].forEach((frequency, index) => this.tone(frequency, frequency * 1.08, 0.5, 0.045, 'sine', now + index * 0.09))
        this.noiseBurst(900, 0.52, 0.025, now, 'highpass')
        break
      case 'damage':
        this.tone(170, 82, 0.24, 0.11, 'sawtooth', now)
        this.noiseBurst(340, 0.18, 0.08, now, 'bandpass')
        break
      case 'death':
        this.tone(185, 48, 0.9, 0.1, 'sine', now)
        this.tone(123, 39, 1.1, 0.07, 'triangle', now + 0.1)
        this.noiseBurst(210, 0.8, 0.04, now, 'lowpass')
        break
      case 'complete':
        [392, 523, 659, 784].forEach((frequency, index) => this.tone(frequency, frequency * 1.03, 0.55, 0.052, 'sine', now + index * 0.1))
        this.noiseBurst(1200, 0.58, 0.018, now + 0.08, 'highpass')
        break
      case 'hide':
        this.grassRustle(now)
        break
      case 'splash':
        this.noiseBurst(240, 0.09, 0.022, now, 'lowpass')
        this.tone(225, 76, 0.24, 0.058, 'sine', now)
        this.tone(330, 155, 0.13, 0.023, 'sine', now + 0.065)
        this.tone(270, 118, 0.12, 0.014, 'sine', now + 0.14)
        break
      case 'hook':
        this.noiseBurst(940, 0.28, 0.046, now, 'bandpass')
        this.noiseBurst(500, 0.18, 0.026, now + 0.11, 'bandpass')
        break
    }
  }

  dispose() {
    this.stopAmbience()
    if (this.swimmingSources) {
      for (const source of Object.values(this.swimmingSources)) {
        try { source.stop() } catch { /* source may already have stopped */ }
        source.disconnect()
      }
    }
    this.swimmingSources = undefined
    this.swimmingGains?.player.disconnect()
    this.swimmingGains?.predator.disconnect()
    this.swimmingGains = undefined
    this.swimSample = undefined
    this.swimSampleLoading = false
    this.swimSampleFailed = false
    if (this.context) void this.context.close()
    this.context = undefined
    this.master = undefined
  }

  private ensureContext() {
    if (this.context) return this.context
    const AudioContextConstructor = window.AudioContext || (window as BrowserAudioWindow).webkitAudioContext
    if (!AudioContextConstructor) return undefined
    const context = new AudioContextConstructor()
    const master = context.createGain()
    master.gain.value = this.enabled ? 0.72 : 0.0001
    master.connect(context.destination)
    this.context = context
    this.master = master
    return context
  }

  private tone(startFrequency: number, endFrequency: number, duration: number, volume: number, type: OscillatorType, startTime: number) {
    if (!this.context || !this.master) return
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(startFrequency, startTime)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), startTime + duration)
    gain.gain.setValueAtTime(0.0001, startTime)
    gain.gain.exponentialRampToValueAtTime(volume, startTime + Math.min(0.025, duration * 0.2))
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
    oscillator.connect(gain).connect(this.master)
    oscillator.start(startTime)
    oscillator.stop(startTime + duration + 0.03)
  }

  private noiseBurst(frequency: number, duration: number, volume: number, startTime: number, filterType: BiquadFilterType) {
    if (!this.context || !this.master) return
    const frameCount = Math.max(1, Math.floor(this.context.sampleRate * duration))
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let index = 0; index < frameCount; index++) data[index] = (Math.random() * 2 - 1) * (1 - index / frameCount)
    const source = this.context.createBufferSource()
    const filter = this.context.createBiquadFilter()
    const gain = this.context.createGain()
    source.buffer = buffer
    filter.type = filterType
    filter.frequency.value = frequency
    filter.Q.value = 0.9
    gain.gain.setValueAtTime(0.0001, startTime)
    gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.018)
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
    source.connect(filter).connect(gain).connect(this.master)
    source.start(startTime)
    source.stop(startTime + duration + 0.03)
  }

  private ensureSwimming() {
    if (this.swimmingSources || !this.context || !this.master) return
    if (!this.swimSample) {
      this.loadSwimmingSample(this.context)
      return
    }
    const context = this.context
    const createLoop = (playbackRate: number, cutoff: number, startOffset: number) => {
      const source = context.createBufferSource()
      const filter = context.createBiquadFilter()
      const gain = context.createGain()
      source.buffer = this.swimSample!
      source.loop = true
      source.playbackRate.value = playbackRate
      filter.type = 'lowpass'
      filter.frequency.value = cutoff
      filter.Q.value = 0.6
      gain.gain.value = 0.0001
      source.connect(filter).connect(gain).connect(this.master!)
      source.start(context.currentTime, startOffset)
      return { source, gain }
    }
    const player = createLoop(0.88, 2400, 0)
    const predator = createLoop(0.76, 1200, this.swimSample.duration * 0.43)
    this.swimmingSources = { player: player.source, predator: predator.source }
    this.swimmingGains = { player: player.gain, predator: predator.gain }
  }

  private loadSwimmingSample(context: AudioContext) {
    if (this.swimSample || this.swimSampleLoading || this.swimSampleFailed) return
    this.swimSampleLoading = true
    void fetch(swimmingSampleUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`Swimming sample returned ${response.status}`)
        return response.arrayBuffer()
      })
      .then((bytes) => context.decodeAudioData(bytes))
      .then((decoded) => {
        if (this.context !== context) return
        this.swimSample = this.makeSeamlessLoop(decoded)
        this.ensureSwimming()
      })
      .catch((error) => {
        if (this.context !== context) return
        this.swimSampleFailed = true
        console.warn('Swimming audio could not be loaded', error)
      })
      .finally(() => {
        if (this.context === context) this.swimSampleLoading = false
      })
  }

  private makeSeamlessLoop(original: AudioBuffer) {
    const overlap = Math.min(Math.floor(original.sampleRate * 0.14), Math.floor(original.length / 9))
    if (overlap < 128) return original
    const length = original.length - overlap
    const loop = this.context!.createBuffer(original.numberOfChannels, length, original.sampleRate)
    for (let channel = 0; channel < original.numberOfChannels; channel++) {
      const input = original.getChannelData(channel)
      const output = loop.getChannelData(channel)
      output.set(input.subarray(overlap))
      for (let index = 0; index < overlap; index++) {
        const position = length - overlap + index
        const blend = index / (overlap - 1)
        output[position] = output[position] * (1 - blend) + input[index] * blend
      }
    }
    return loop
  }

  private grassRustle(startTime: number) {
    if (!this.context || !this.master) return
    const duration = 0.62
    const count = Math.floor(this.context.sampleRate * duration)
    const buffer = this.context.createBuffer(1, count, this.context.sampleRate)
    const samples = buffer.getChannelData(0)
    let previous = 0
    for (let index = 0; index < count; index++) {
      previous = previous * 0.38 + (Math.random() * 2 - 1) * 0.62
      samples[index] = previous
    }
    const source = this.context.createBufferSource()
    const filter = this.context.createBiquadFilter()
    const gain = this.context.createGain()
    source.buffer = buffer
    filter.type = 'bandpass'
    filter.frequency.value = 1850
    filter.Q.value = 0.48
    gain.gain.setValueAtTime(0.0001, startTime)
    for (let index = 1; index <= 14; index++) {
      const progress = index / 14
      const envelope = Math.sin(Math.PI * progress)
      const flutter = 0.55 + Math.random() * 0.45
      gain.gain.linearRampToValueAtTime(0.0001 + envelope * flutter * 0.048, startTime + progress * duration)
    }
    gain.gain.linearRampToValueAtTime(0.0001, startTime + duration)
    source.connect(filter).connect(gain).connect(this.master)
    source.start(startTime)
    source.stop(startTime + duration + 0.02)
  }

  private restartAmbience() {
    this.stopAmbience()
    if (!this.enabled || !this.context || !this.master) return
    const context = this.context
    const ocean = this.mode === 'ocean'
    const danger = this.mode === 'danger'
    const quiet = this.mode === 'quiet'
    const ambienceGain = context.createGain()
    ambienceGain.gain.value = quiet ? 0.018 : danger ? 0.045 : ocean ? 0.04 : 0.032
    ambienceGain.connect(this.master)

    const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate)
    const channel = buffer.getChannelData(0)
    let previous = 0
    for (let index = 0; index < channel.length; index++) {
      previous = previous * 0.985 + (Math.random() * 2 - 1) * 0.015
      channel[index] = previous
    }
    const water = context.createBufferSource()
    const waterFilter = context.createBiquadFilter()
    water.buffer = buffer
    water.loop = true
    waterFilter.type = 'lowpass'
    waterFilter.frequency.value = ocean ? 420 : danger ? 760 : 620
    waterFilter.Q.value = 0.6
    water.connect(waterFilter).connect(ambienceGain)

    const drone = context.createOscillator()
    const droneGain = context.createGain()
    drone.type = 'sine'
    drone.frequency.value = danger ? 47 : ocean ? 38 : 55
    droneGain.gain.value = quiet ? 0.008 : 0.018
    drone.connect(droneGain).connect(ambienceGain)

    const movement = context.createOscillator()
    const movementGain = context.createGain()
    movement.frequency.value = ocean ? 0.08 : 0.14
    movementGain.gain.value = ocean ? 0.018 : 0.012
    movement.connect(movementGain).connect(ambienceGain.gain)

    water.start()
    drone.start()
    movement.start()
    this.ambienceSources = [water, drone, movement]
    this.ambienceNodes = [waterFilter, droneGain, movementGain, ambienceGain]
  }

  private stopAmbience() {
    this.ambienceSources.forEach((source) => {
      try { source.stop() } catch { /* source may already have stopped */ }
      source.disconnect()
    })
    this.ambienceNodes.forEach((node) => node.disconnect())
    this.ambienceSources = []
    this.ambienceNodes = []
  }
}
