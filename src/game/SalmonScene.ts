import Phaser from 'phaser'
import { gameBus } from './EventBus'
import type { LevelId } from '../types'
import type { SoundEffect } from '../audio/Soundscape'
import waterTextureUrl from '../assets/water-depth-v2.png'
import salmonParrUrl from '../assets/salmon-stage-1-parr-v3.png'
import salmonSmoltUrl from '../assets/salmon-stage-2-smolt-v3.png'
import salmonOceanUrl from '../assets/salmon-stage-3-ocean-v3.png'
import salmonSpawningUrl from '../assets/salmon-stage-4-spawning-v3.png'
import troutUrl from '../assets/trout-topdown-v4.png'
import rockClusterSmallUrl from '../assets/river-rock-cluster-small-v3.png'
import rockClusterLargeUrl from '../assets/river-rock-cluster-large-v3.png'
import riverStoneLongUrl from '../assets/river-stone-long-v4.png'
import riverStoneDarkUrl from '../assets/river-stone-dark-v4.png'
import riverStonePaleUrl from '../assets/river-stone-pale-v4.png'
import seagrassClusterUrl from '../assets/river-seagrass-cluster-v3.png'
import shorePatchUrl from '../assets/river-shore-patch-v3.png'
import riverFoodUrl from '../assets/food-river-larva-v2.png'
import oceanFoodUrl from '../assets/food-ocean-krill-v2.png'
import riverEndLightUrl from '../assets/river-end-light-photoreal-v1.png'
import powerPlantIntakeUrl from '../assets/power-plant-intake-photoreal-v1.png'
import deepOceanKelpUrl from '../assets/deep-ocean-kelp-v1.png'
import atlanticCodUrl from '../assets/atlantic-cod-topdown-v3.png'
import harborSealUrl from '../assets/harbor-seal-topdown-v1.png'
import spawnStillSiltUrl from '../assets/spawn-still-silt-v1.png'
import spawnCleanGravelUrl from '../assets/spawn-clean-gravel-v1.png'
import spawnSoftMudUrl from '../assets/spawn-soft-mud-v1.png'
import fishingHookPhotorealUrl from '../assets/fishing-hook-photoreal-v1.png'
import waterfallRockUpperUrl from '../assets/waterfall-rock-wall-upper-v1.png'
import waterfallRockLowerUrl from '../assets/waterfall-rock-wall-lower-v1.png'

type CurrentZone = { area: Phaser.Geom.Rectangle; x: number; y: number; strength: number; dangerous?: boolean }
type IntakeHazard = { x: number; y: number; range: number; dangerArea: Phaser.Geom.Rectangle }
type FishArt = Phaser.GameObjects.Image | Phaser.GameObjects.Rope
type FoodArt = Phaser.GameObjects.Image | Phaser.GameObjects.Rope
type PredatorKind = 'fish' | 'seal'
type PredatorOptions = { texture?: string; kind?: PredatorKind; width?: number; height?: number }
type Predator = { fish: Phaser.GameObjects.Container; art: FishArt; kind: PredatorKind; homeX: number; homeY: number; phase: number; swimPhase: number; swimAmplitude: number; turnBend: number; forwardSpeed: number; state: 'patrol' | 'chase'; path: Phaser.Math.Vector2[]; pathIndex: number; avoidedRock?: RockObstacle; avoidanceSide: number; lastX: number; lastY: number; stuckTimer: number; escapeTimer: number; recoveryAttempts: number; burstTimer: number; burstCooldown: number }
type RockObstacle = { x: number; y: number; radius: number }
type TerrainStone = { x: number; y: number; radius: number }
type ExitZone = { area: Phaser.Geom.Rectangle; canFinish: () => boolean; blockedHint: string }
type FishingHookHazard = {
  hook: Phaser.GameObjects.Container
  line: Phaser.GameObjects.Graphics
  anchorX: number
  anchorY: number
  radius: number
  active: boolean
  rotationOffset: number
}

const WORLD_W = 2600
const WORLD_H = 1200
const OCEAN_W = 3900
const OCEAN_H = 1900
const LEVEL_FOUR_W = 4800
const SHORE_BOUNDARY = 220
const WATERFALL_X = 2820
const WATERFALL_GAP_TOP = 490
const WATERFALL_GAP_BOTTOM = 710
const FOOD_TARGET = 8
const FISH_SIZES: Record<LevelId, { width: number; height: number }> = {
  1: { width: 128 * 0.85, height: 72 * 0.85 },
  2: { width: 154, height: 86 },
  3: { width: 194, height: 108 },
  4: { width: 206, height: 114 },
}

const palettes: Record<LevelId, { water: number; deep: number; bank: number; sand: number; glow: number }> = {
  1: { water: 0x168c92, deep: 0x0d6874, bank: 0x527b49, sand: 0xc6ad77, glow: 0x8de5b2 },
  2: { water: 0x117a8e, deep: 0x075469, bank: 0x426a45, sand: 0xb99d6a, glow: 0xb6efb0 },
  3: { water: 0x0a5f7d, deep: 0x073d60, bank: 0x214f55, sand: 0x758f82, glow: 0x78e2ef },
  4: { water: 0x176d75, deep: 0x0a4f5a, bank: 0x4f7145, sand: 0xb19d75, glow: 0xe2d79d },
}

export class SalmonScene extends Phaser.Scene {
  private level: LevelId
  private reducedMotion: boolean
  private soundEnabled: boolean
  private terrainSeed = ''
  private player!: Phaser.GameObjects.Container
  private playerBody!: Phaser.Physics.Arcade.Body
  private playerArt!: FishArt
  private playerShadow!: Phaser.GameObjects.Ellipse
  private playerSwimPhase = 0
  private playerSwimAmplitude = 0
  private playerTurnBend = 0
  private playerForwardSpeed = 0
  private collisionSlowdown = 0
  private rockObstacles: RockObstacle[] = []
  private avoidedRock?: RockObstacle
  private avoidanceSide = 1
  private target = new Phaser.Math.Vector2(270, 600)
  private marker!: Phaser.GameObjects.Arc
  private rocks!: Phaser.Physics.Arcade.StaticGroup
  private food!: Phaser.Physics.Arcade.StaticGroup
  private foodItems: FoodArt[] = []
  private goals: { x: number; y: number; radius: number; canFinish: () => boolean; blockedHint: string }[] = []
  private exitZones: ExitZone[] = []
  private spawnAreas: { x: number; y: number; radius: number; label: string; correct: boolean }[] = []
  private dangerZones: { area: Phaser.Geom.Rectangle; hint: string }[] = []
  private fishingHooks: FishingHookHazard[] = []
  private predators: Predator[] = []
  private currents: CurrentZone[] = []
  private currentParticles: { dot: Phaser.GameObjects.Arc; zone: CurrentZone; offset: number }[] = []
  private intakeHazard?: IntakeHazard
  private hidingZones: Phaser.Geom.Ellipse[] = []
  private cleanups: (() => void)[] = []
  private lives = 3
  private stamina = 100
  private foodCount = 0
  private invulnerable = 0
  private elapsed = 0
  private finished = false
  private hint = 'Trykk i vannet for å svømme'
  private hintTimer = 5
  private hudTimer = 0
  private hidden = false
  private wasHidden = false
  private swimmingSoundTimer = 0
  private gamePaused = false
  private evolving = false
  private evolved = false
  private waterfallJumping = false
  private waterfallSide: -1 | 1 = -1
  private waterfallFlow?: Phaser.GameObjects.Graphics
  private waterfallPhase = 0
  private trailTimer = 0
  private wake: Phaser.GameObjects.Arc[] = []

  constructor(level: LevelId, reducedMotion: boolean, sound: boolean) {
    super(`level-${level}`)
    this.level = level
    this.reducedMotion = reducedMotion
    this.soundEnabled = sound
  }

  preload() {
    if (!this.textures.exists('water-depth-v2')) this.load.image('water-depth-v2', waterTextureUrl)
    if (!this.textures.exists('salmon-stage-1')) this.load.image('salmon-stage-1', salmonParrUrl)
    if (!this.textures.exists('salmon-stage-2')) this.load.image('salmon-stage-2', salmonSmoltUrl)
    if (!this.textures.exists('salmon-stage-3')) this.load.image('salmon-stage-3', salmonOceanUrl)
    if (!this.textures.exists('salmon-stage-4')) this.load.image('salmon-stage-4', salmonSpawningUrl)
    if (!this.textures.exists('trout-v2')) this.load.image('trout-v2', troutUrl)
    if (!this.textures.exists('rock-cluster-small-v3')) this.load.image('rock-cluster-small-v3', rockClusterSmallUrl)
    if (!this.textures.exists('rock-cluster-large-v3')) this.load.image('rock-cluster-large-v3', rockClusterLargeUrl)
    if (!this.textures.exists('river-stone-long-v4')) this.load.image('river-stone-long-v4', riverStoneLongUrl)
    if (!this.textures.exists('river-stone-dark-v4')) this.load.image('river-stone-dark-v4', riverStoneDarkUrl)
    if (!this.textures.exists('river-stone-pale-v4')) this.load.image('river-stone-pale-v4', riverStonePaleUrl)
    if (!this.textures.exists('seagrass-cluster-v3')) this.load.image('seagrass-cluster-v3', seagrassClusterUrl)
    if (!this.textures.exists('shore-patch-v3')) this.load.image('shore-patch-v3', shorePatchUrl)
    if (!this.textures.exists('river-food-v2')) this.load.image('river-food-v2', riverFoodUrl)
    if (!this.textures.exists('ocean-food-v2')) this.load.image('ocean-food-v2', oceanFoodUrl)
    if (!this.textures.exists('river-end-light-photo')) this.load.image('river-end-light-photo', riverEndLightUrl)
    if (!this.textures.exists('power-plant-intake-photo')) this.load.image('power-plant-intake-photo', powerPlantIntakeUrl)
    if (!this.textures.exists('deep-ocean-kelp')) this.load.image('deep-ocean-kelp', deepOceanKelpUrl)
    if (!this.textures.exists('atlantic-cod')) this.load.image('atlantic-cod', atlanticCodUrl)
    if (!this.textures.exists('harbor-seal')) this.load.image('harbor-seal', harborSealUrl)
    if (!this.textures.exists('spawn-still-silt')) this.load.image('spawn-still-silt', spawnStillSiltUrl)
    if (!this.textures.exists('spawn-clean-gravel')) this.load.image('spawn-clean-gravel', spawnCleanGravelUrl)
    if (!this.textures.exists('spawn-soft-mud')) this.load.image('spawn-soft-mud', spawnSoftMudUrl)
    if (!this.textures.exists('fishing-hook-photo')) this.load.image('fishing-hook-photo', fishingHookPhotorealUrl)
    if (!this.textures.exists('waterfall-rock-upper')) this.load.image('waterfall-rock-upper', waterfallRockUpperUrl)
    if (!this.textures.exists('waterfall-rock-lower')) this.load.image('waterfall-rock-lower', waterfallRockLowerUrl)
  }

  create() {
    this.gamePaused = false
    this.time.paused = false
    this.input.enabled = true
    this.physics.world.resume()
    this.terrainSeed = `${Date.now()}-${Math.random()}`
    this.goals = []
    this.exitZones = []
    this.spawnAreas = []
    this.dangerZones = []
    this.fishingHooks = []
    this.predators = []
    this.currents = []
    this.currentParticles = []
    this.foodItems = []
    this.wasHidden = false
    this.waterfallJumping = false
    this.waterfallSide = -1
    this.waterfallFlow = undefined
    this.waterfallPhase = 0
    this.swimmingSoundTimer = 0
    const p = palettes[this.level]
    const boundary = this.worldBoundary()
    const worldWidth = this.worldWidth()
    const worldHeight = this.worldHeight()
    this.physics.world.setBounds(0, boundary, worldWidth, worldHeight - boundary * 2)
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight)
    this.cameras.main.setBackgroundColor(p.deep)
    this.drawEnvironment()
    this.rocks = this.physics.add.staticGroup()
    this.food = this.physics.add.staticGroup()
    this.createPlayer()
    this.rockObstacles = []
    this.hidingZones = []
    this.avoidedRock = undefined
    this.createMap()
    this.addUnderwaterFilter()
    this.createPointerControls()

    this.physics.add.collider(this.player, this.rocks, () => {
      if (this.collisionSlowdown <= 0) {
        this.playerForwardSpeed *= 0.9
        this.collisionSlowdown = 0.28
      }
    })

    this.cameras.main.startFollow(this.player, true, 0.075, 0.075)
    this.cameras.main.setFollowOffset(-60, 0)
    this.cameras.main.fadeIn(this.reducedMotion ? 0 : 650, 4, 45, 55)

    this.cleanups.push(gameBus.on('pause', () => {
      if (!this.physics?.world) return
      this.gamePaused = true
      this.physics.world.pause()
      this.tweens.pauseAll()
      this.time.paused = true
      this.input.enabled = false
    }))
    this.cleanups.push(gameBus.on('resume', () => {
      if (!this.physics?.world) return
      this.gamePaused = false
      this.time.paused = false
      this.input.enabled = true
      if (!this.evolving && !this.waterfallJumping && !this.finished) this.physics.world.resume()
      this.tweens.resumeAll()
    }))
    this.cleanups.push(gameBus.on('soundEnabled', (enabled) => { this.soundEnabled = enabled }))
    this.cleanups.push(gameBus.on('restart', () => { if (this.scene?.manager) this.scene.restart() }))
    const removeBusListeners = () => this.cleanups.splice(0).forEach((clean) => clean())
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, removeBusListeners)
    this.events.once(Phaser.Scenes.Events.DESTROY, removeBusListeners)
    this.emitHud()
  }

  private drawEnvironment() {
    const p = palettes[this.level]
    const worldWidth = this.worldWidth()
    const worldHeight = this.worldHeight()
    const g = this.add.graphics()
    g.fillStyle(p.water, 1).fillRect(0, 0, worldWidth, worldHeight)
    const water = this.add.tileSprite(worldWidth / 2, worldHeight / 2, worldWidth, worldHeight, 'water-depth-v2').setDepth(1.5).setAlpha(this.level === 3 ? 0.76 : 0.62)
    water.setTint(this.level === 3 ? 0x9ab7d4 : this.level === 4 ? 0xa2c0a1 : 0xa9d8cc)
    water.setBlendMode(Phaser.BlendModes.NORMAL)
    g.setDepth(1)
    g.fillGradientStyle(p.deep, p.deep, 0x041f34, 0x041f34, 0.26, 0.26, 0.62, 0.62)
    g.fillRect(0, 0, worldWidth, worldHeight)
    g.fillStyle(p.deep, 0.22)
    for (let x = 0; x < worldWidth; x += 360) g.fillEllipse(x + 180, worldHeight * 0.42 + Math.sin(x * 0.015) * 160, 520, 860)
    g.lineStyle(2, 0xd2fff7, 0.16)
    for (let y = 180; y < worldHeight - 120; y += 125) {
      g.beginPath().moveTo(0, y)
      for (let x = 0; x <= worldWidth; x += 80) g.lineTo(x, y + Math.sin(x / 90 + y) * 10)
      g.strokePath()
    }
    const caustics = this.add.graphics().setDepth(2).setBlendMode(Phaser.BlendModes.ADD)
    caustics.lineStyle(4, 0xa9fff1, 0.08)
    const causticCount = Math.ceil(worldWidth / 175) + 2
    for (let i = 0; i < causticCount; i++) {
      const x = 120 + i * 175
      const y = 200 + (i * 137) % 760
      caustics.strokeEllipse(x, y, 150 + (i % 3) * 60, 45 + (i % 4) * 14)
    }
    if (!this.reducedMotion) this.tweens.add({ targets: caustics, x: 55, alpha: 0.72, yoyo: true, repeat: -1, duration: 5200, ease: 'Sine.inOut' })
    const bubbleCount = Math.ceil((this.reducedMotion ? 24 : 58) * worldWidth / WORLD_W)
    for (let i = 0; i < bubbleCount; i++) {
      const bubble = this.add.circle((i * 193) % worldWidth, 135 + (i * 97) % (worldHeight - 270), 1.5 + (i % 4), 0xd8fff8, 0.12 + (i % 3) * 0.07).setDepth(3)
      if (!this.reducedMotion) this.tweens.add({ targets: bubble, y: bubble.y - 90 - (i % 5) * 20, x: bubble.x + Math.sin(i) * 24, alpha: 0, yoyo: true, repeat: -1, duration: 2800 + (i % 8) * 380, delay: i * 80 })
    }
    if (this.level === 3) this.drawOceanDepthEdges()
    else this.drawShoreEdges()
    this.add.text(150, 38, this.level === 3 ? 'NORDØST-ATLANTEREN' : 'MANDALSELVA', { fontFamily: 'system-ui', fontSize: '18px', fontStyle: '700', color: '#f4f0dc', letterSpacing: 3 }).setAlpha(0.72).setDepth(12)
  }

  private worldBoundary() {
    return this.level === 3 ? 42 : SHORE_BOUNDARY
  }

  private worldWidth() {
    if (this.level === 3) return OCEAN_W
    if (this.level === 4) return LEVEL_FOUR_W
    return WORLD_W
  }

  private worldHeight() {
    return this.level === 3 ? OCEAN_H : WORLD_H
  }

  private drawOceanDepthEdges() {
    const worldWidth = this.worldWidth()
    const worldHeight = this.worldHeight()
    const edge = this.add.graphics().setDepth(7)
    for (let band = 0; band < 7; band++) {
      const bandHeight = 18
      const alpha = 0.62 - band * 0.075
      edge.fillStyle(0x010b1c, alpha)
      edge.fillRect(0, band * bandHeight, worldWidth, bandHeight)
      edge.fillRect(0, worldHeight - (band + 1) * bandHeight, worldWidth, bandHeight)
    }
    edge.lineStyle(3, 0x5aa7bb, 0.12)
    edge.beginPath().moveTo(0, 45)
    for (let x = 0; x <= worldWidth; x += 90) edge.lineTo(x, 45 + Math.sin(x / 170) * 8)
    edge.strokePath().beginPath().moveTo(0, worldHeight - 45)
    for (let x = 0; x <= worldWidth; x += 90) edge.lineTo(x, worldHeight - 45 + Math.sin(x / 190 + 1.4) * 8)
    edge.strokePath()

    const depthLabelStyle = { fontFamily: 'system-ui', fontSize: '15px', fontStyle: '700', color: '#7fb3c1', letterSpacing: 4 }
    this.add.text(230, 92, 'ÅPENT HAV · DYPT VANN', depthLabelStyle).setAlpha(0.28).setDepth(8)
    this.add.text(worldWidth - 500, worldHeight - 106, 'ÅPENT HAV · DYPT VANN', depthLabelStyle).setAlpha(0.24).setDepth(8)
  }

  private addUnderwaterFilter() {
    const isOcean = this.level === 3
    const washColor = isOcean ? 0x0a6680 : this.level === 4 ? 0x147c78 : 0x11858a
    const worldWidth = this.worldWidth()
    const worldHeight = this.worldHeight()

    // A shared HSL-style grade makes every world asset sit in the same body of water.
    const colorWash = this.add.rectangle(worldWidth / 2, worldHeight / 2, worldWidth, worldHeight, washColor, isOcean ? 0.15 : 0.12)
      .setDepth(90)

    const slowCurrent = this.add.tileSprite(worldWidth / 2, worldHeight / 2, worldWidth * 1.18, worldHeight * 1.28, 'water-depth-v2')
      .setDepth(91)
      .setAlpha(isOcean ? 0.13 : 0.105)
      .setTint(isOcean ? 0x87c5d3 : 0x8bd2ca)
      .setTileScale(1.18, 1.08)
      .setBlendMode(Phaser.BlendModes.SCREEN)

    const surfaceDrift = this.add.tileSprite(worldWidth / 2, worldHeight / 2, worldWidth * 1.2, worldHeight * 1.32, 'water-depth-v2')
      .setDepth(92)
      .setAlpha(isOcean ? 0.085 : 0.07)
      .setTint(0xa4ebe1)
      .setFlipX(true)
      .setRotation(-0.025)
      .setTileScale(0.72, 0.82)
      .setBlendMode(Phaser.BlendModes.ADD)

    const broadWaves = this.add.graphics()
      .setDepth(93)
      .setAlpha(isOcean ? 0.68 : 0.58)
      .setBlendMode(Phaser.BlendModes.SCREEN)
    for (let row = 0; row < 9; row++) {
      const baseY = 145 + row * 122
      broadWaves.lineStyle(3 + (row % 3), 0xb8fff2, 0.085 + (row % 2) * 0.025)
      broadWaves.beginPath().moveTo(-180, baseY)
      for (let x = -120; x <= worldWidth + 180; x += 55) {
        const y = baseY + Math.sin(x * 0.012 + row * 1.55) * 18 + Math.sin(x * 0.031 - row) * 7
        broadWaves.lineTo(x, y)
      }
      broadWaves.strokePath()
    }

    const lightPools = this.add.graphics()
      .setDepth(94)
      .setAlpha(isOcean ? 0.68 : 0.56)
      .setBlendMode(Phaser.BlendModes.ADD)
    const lightPoolCount = Math.ceil(worldWidth / 260) + 2
    for (let i = 0; i < lightPoolCount; i++) {
      const x = 80 + (i * 263) % worldWidth
      const y = 120 + (i * 179) % (worldHeight - 240)
      lightPools.fillStyle(i % 2 ? 0xa6fff1 : 0x68deda, 0.028 + (i % 3) * 0.012)
      lightPools.fillEllipse(x, y, 240 + (i % 4) * 65, 48 + (i % 3) * 22)
    }

    if (!this.reducedMotion) {
      this.tweens.add({
        targets: slowCurrent,
        tilePositionX: 260,
        tilePositionY: -90,
        alpha: isOcean ? 0.18 : 0.145,
        duration: 7200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      })
      this.tweens.add({
        targets: surfaceDrift,
        tilePositionX: -340,
        tilePositionY: 155,
        rotation: 0.025,
        alpha: isOcean ? 0.115 : 0.1,
        duration: 4700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      })
      this.tweens.add({
        targets: broadWaves,
        x: 145,
        y: -28,
        scaleX: 1.035,
        alpha: isOcean ? 0.9 : 0.82,
        duration: 3900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      })
      this.tweens.add({
        targets: lightPools,
        x: -120,
        y: 38,
        scaleX: 1.08,
        scaleY: 0.9,
        alpha: isOcean ? 0.92 : 0.8,
        duration: 5600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      })
      this.tweens.add({
        targets: colorWash,
        alpha: isOcean ? 0.1 : 0.075,
        duration: 6400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      })
    }
  }

  private riverTopEdge(x: number) {
    return 200 + Math.sin(x * 0.011) * 13 + Math.sin(x * 0.029 + 1.2) * 7
  }

  private riverBottomEdge(x: number) {
    return this.worldHeight() - 200 + Math.sin(x * 0.009 + 0.8) * 14 + Math.sin(x * 0.025) * 7
  }

  private drawShoreEdges() {
    const p = palettes[this.level]
    const worldWidth = this.worldWidth()
    const worldHeight = this.worldHeight()
    const overscan = Math.max(1200, this.scale.height)
    const topEdge = (x: number) => this.riverTopEdge(x)
    const bottomEdge = (x: number) => this.riverBottomEdge(x)
    const samples = Array.from({ length: Math.ceil(worldWidth / 50) + 1 }, (_, index) => Math.min(index * 50, worldWidth))
    const shore = this.add.graphics().setDepth(7)

    const topLand = [{ x: 0, y: -overscan }, { x: worldWidth, y: -overscan }, ...samples.slice().reverse().map((x) => ({ x, y: topEdge(x) }))]
    const bottomLand = [{ x: 0, y: worldHeight + overscan }, { x: worldWidth, y: worldHeight + overscan }, ...samples.slice().reverse().map((x) => ({ x, y: bottomEdge(x) }))]
    shore.fillStyle(0x24382f, 1).fillPoints(topLand, true).fillPoints(bottomLand, true)

    const topGravel = [{ x: 0, y: -overscan }, { x: worldWidth, y: -overscan }, ...samples.slice().reverse().map((x) => ({ x, y: topEdge(x) }))]
    const bottomGravel = [{ x: 0, y: worldHeight + overscan }, { x: worldWidth, y: worldHeight + overscan }, ...samples.slice().reverse().map((x) => ({ x, y: bottomEdge(x) }))]
    shore.fillStyle(p.sand, 0.92).fillPoints(topGravel, true).fillPoints(bottomGravel, true)

    const topWet = [...samples.map((x) => ({ x, y: topEdge(x) - 22 })), ...samples.slice().reverse().map((x) => ({ x, y: topEdge(x) + 5 }))]
    const bottomWet = [...samples.map((x) => ({ x, y: bottomEdge(x) + 22 })), ...samples.slice().reverse().map((x) => ({ x, y: bottomEdge(x) - 5 }))]
    shore.fillStyle(0x4e665f, 0.54).fillPoints(topWet, true).fillPoints(bottomWet, true)

    shore.lineStyle(4, 0xd7d1aa, 0.48).beginPath().moveTo(0, topEdge(0))
    for (const x of samples.slice(1)) shore.lineTo(x, topEdge(x))
    shore.strokePath().beginPath().moveTo(0, bottomEdge(0))
    for (const x of samples.slice(1)) shore.lineTo(x, bottomEdge(x))
    shore.strokePath()

    const shorePatchCount = Math.ceil(worldWidth / 390) + 1
    for (let index = 0; index < shorePatchCount; index++) {
      const x = 170 + index * 390
      const width = 500 + (index % 2) * 45
      this.add.image(x, 120 + (index % 3) * 9, 'shore-patch-v3')
        .setDisplaySize(width, 178)
        .setFlipX(index % 2 === 0)
        .setRotation(-0.025 + (index % 3) * 0.018)
        .setAlpha(0.9)
        .setDepth(7.5)
      this.add.image(x + 70, worldHeight - 120 - (index % 3) * 9, 'shore-patch-v3')
        .setDisplaySize(width, 178)
        .setFlipX(index % 2 !== 0)
        .setRotation(0.025 - (index % 3) * 0.018)
        .setAlpha(0.9)
        .setDepth(7.5)
      for (let row = 0; row < 4; row++) {
        const extraX = x + (row % 2 ? 140 : -65)
        const extraY = -45 - row * 170
        this.add.image(extraX, extraY, 'shore-patch-v3')
          .setDisplaySize(width, 190)
          .setRotation(row % 2 ? 0.06 : -0.04)
          .setFlipX((row + index) % 2 === 0)
          .setAlpha(0.74)
          .setDepth(7.5)
        this.add.image(extraX + 75, worldHeight - extraY, 'shore-patch-v3')
          .setDisplaySize(width, 190)
          .setRotation(row % 2 ? -0.06 : 0.04)
          .setFlipX((row + index) % 2 !== 0)
          .setAlpha(0.74)
          .setDepth(7.5)
      }
    }

    const pebbles = this.add.graphics().setDepth(8)
    const pebbleColors = [0x3c4741, 0x687066, 0x8d8773, 0xb4a789]
    const pebbleCount = Math.ceil(116 * worldWidth / WORLD_W)
    for (let index = 0; index < pebbleCount; index++) {
      const x = (37 + index * 83) % worldWidth
      const radius = 2.5 + (index % 5) * 1.15
      const color = pebbleColors[index % pebbleColors.length]
      const topY = 60 + ((index * 29) % Math.max(24, Math.floor(topEdge(x) - 72)))
      const bottomY = worldHeight - 60 - ((index * 31) % Math.max(24, Math.floor(worldHeight - bottomEdge(x) - 72)))
      pebbles.fillStyle(color, 0.78).fillEllipse(x, topY, radius * 2.4, radius * 1.45)
      pebbles.fillStyle(pebbleColors[(index + 2) % pebbleColors.length], 0.76).fillEllipse((x + 41) % worldWidth, bottomY, radius * 2.2, radius * 1.4)
    }

    if (this.level === 1 || this.level === 4) {
      const random = new Phaser.Math.RandomDataGenerator([`villaks-shore-stones-v4-level-${this.level}-${this.terrainSeed}`])
      const textures = ['river-stone-long-v4', 'river-stone-dark-v4', 'river-stone-pale-v4']
      const shoreStoneCount = Math.ceil(worldWidth / 63) + 2
      for (let index = 0; index < shoreStoneCount; index++) {
        const topX = 24 + index * 63 + random.realInRange(-22, 22)
        const bottomX = 55 + index * 62 + random.realInRange(-24, 24)
        const topWidth = random.realInRange(30, index % 7 === 0 ? 86 : 62)
        const bottomWidth = random.realInRange(30, index % 8 === 0 ? 90 : 64)
        const topTexture = textures[random.integerInRange(0, textures.length - 1)]
        const bottomTexture = textures[random.integerInRange(0, textures.length - 1)]
        const topY = topEdge(topX) - random.realInRange(13, 54)
        const bottomY = bottomEdge(bottomX) + random.realInRange(13, 54)
        const topHeight = topWidth * (topTexture === 'river-stone-long-v4' ? 0.5 : 0.67)
        const bottomHeight = bottomWidth * (bottomTexture === 'river-stone-long-v4' ? 0.5 : 0.67)
        const topRotation = random.realInRange(-Math.PI, Math.PI)
        const bottomRotation = random.realInRange(-Math.PI, Math.PI)
        const topFlip = random.frac() > 0.5
        const bottomFlip = random.frac() > 0.5
        this.addSilhouetteShadow(topTexture, topX, topY, topWidth, topHeight, topRotation, topFlip, 8.5, 0.23)
        this.addSilhouetteShadow(bottomTexture, bottomX, bottomY, bottomWidth, bottomHeight, bottomRotation, bottomFlip, 8.5, 0.23)
        this.add.image(topX, topY, topTexture)
          .setDisplaySize(topWidth, topHeight)
          .setRotation(topRotation)
          .setFlipX(topFlip)
          .setDepth(9)
        this.add.image(bottomX, bottomY, bottomTexture)
          .setDisplaySize(bottomWidth, bottomHeight)
          .setRotation(bottomRotation)
          .setFlipX(bottomFlip)
          .setDepth(9)
      }
    } else {
      for (let index = 0; index < 14; index++) {
        const x = 42 + index * 194
        const large = index % 4 === 0
        const texture = large ? 'rock-cluster-large-v3' : 'rock-cluster-small-v3'
        const width = large ? 112 : 84 + (index % 3) * 8
        const height = width * 0.66
        const topY = topEdge(x) - 12 - (index % 3) * 7
        const topRotation = -0.16 + (index % 5) * 0.07
        const bottomX = x + 91
        const bottomY = bottomEdge(bottomX) + 15 + (index % 4) * 6
        const bottomRotation = 0.16 - (index % 5) * 0.07
        this.addSilhouetteShadow(texture, x, topY, width, height, topRotation, index % 2 === 0, 8.5, 0.23)
        this.addSilhouetteShadow(texture, bottomX, bottomY, width * 0.94, height * 0.94, bottomRotation, index % 2 !== 0, 8.5, 0.23)
        this.add.image(x, topY, texture)
          .setDisplaySize(width, height)
          .setRotation(topRotation)
          .setFlipX(index % 2 === 0)
          .setTint(this.level === 3 ? 0x9aa9aa : 0xffffff)
          .setDepth(9)
        this.add.image(bottomX, bottomY, texture)
          .setDisplaySize(width * 0.94, height * 0.94)
          .setRotation(bottomRotation)
          .setFlipX(index % 2 !== 0)
          .setTint(this.level === 3 ? 0x95a5a6 : 0xffffff)
          .setDepth(9)
      }
    }
  }

  private createMap() {
    this.generateTerrain()
    if (this.level === 1) this.createLevelOne()
    if (this.level === 2) this.createLevelTwo()
    if (this.level === 3) this.createLevelThree()
    if (this.level === 4) this.createLevelFour()
  }

  private generateTerrain() {
    if (this.level === 1 || this.level === 2 || this.level === 4) this.generateRiverTerrain()
    else this.generateOpenWaterTerrain()
  }

  private generateOpenWaterTerrain() {
    const random = new Phaser.Math.RandomDataGenerator([`villaks-open-ocean-v1-${this.terrainSeed}`])
    const exclusions = [
      { x: 240, y: 950, radius: 250 },
      { x: 1250, y: 390, radius: 190 },
      { x: 2200, y: 1180, radius: 190 },
      { x: 3020, y: 520, radius: 190 },
      { x: 1400, y: 950, radius: 310 },
      { x: 2600, y: 1450, radius: 310 },
      { x: 3340, y: 850, radius: 310 },
      { x: 3700, y: 950, radius: 210 },
    ]
    const placed: { x: number; y: number; radius: number }[] = []

    for (let index = 0; index < 15; index++) {
      for (let attempt = 0; attempt < 45; attempt++) {
        const width = random.realInRange(220, 380)
        const radius = width * 0.38
        const x = random.realInRange(330, OCEAN_W - 310)
        const y = random.realInRange(130, OCEAN_H - 130)
        const blocked = exclusions.some((zone) => Phaser.Math.Distance.Between(x, y, zone.x, zone.y) < radius + zone.radius)
          || placed.some((kelp) => Phaser.Math.Distance.Between(x, y, kelp.x, kelp.y) < radius + kelp.radius + 90)
        if (blocked) continue
        this.addDeepOceanKelp(x, y, width, width * random.realInRange(0.62, 0.82), random.realInRange(-0.5, 0.5), random.frac() > 0.5)
        placed.push({ x, y, radius })
        break
      }
    }
  }

  private generateRiverTerrain() {
    const random = new Phaser.Math.RandomDataGenerator([`villaks-river-terrain-v4-level-${this.level}-${this.terrainSeed}`])
    const terrainMaxX = this.level === 4 ? LEVEL_FOUR_W - 300 : 2300
    const exclusions = this.level === 1
      ? [
          { x: 240, y: 600, radius: 230 }, { x: 1260, y: 600, radius: 155 },
          { x: 1680, y: 600, radius: 155 }, { x: 2390, y: 600, radius: 200 },
        ]
      : this.level === 2
        ? [
            { x: 240, y: 600, radius: 230 }, { x: 980, y: 410, radius: 180 },
            { x: 1580, y: 760, radius: 180 }, { x: 2170, y: 300, radius: 260 },
            { x: 2440, y: 820, radius: 190 },
          ]
        : [
          { x: 240, y: 600, radius: 240 }, { x: 1360, y: 580, radius: 170 },
          { x: WATERFALL_X, y: 600, radius: 390 },
          { x: 3560, y: 300, radius: 190 }, { x: 4100, y: 860, radius: 190 },
          { x: 4620, y: 570, radius: 205 },
        ]
    const placed: TerrainStone[] = []
    const clusterCount = this.level === 4 ? 18 : 8

    // Stone anchors are biased toward the banks. Most following stones are
    // sampled around those anchors, so clusters emerge from individual rocks.
    for (let clusterIndex = 0; clusterIndex < clusterCount; clusterIndex++) {
      for (let anchorAttempt = 0; anchorAttempt < 45; anchorAttempt++) {
        const nearShore = random.frac() < 0.78
        const topShore = random.frac() < 0.5
        const anchorX = random.realInRange(390, terrainMaxX - 80)
        const anchorY = nearShore
          ? (topShore ? random.realInRange(270, 370) : random.realInRange(830, 930))
          : random.realInRange(430, 770)
        if (exclusions.some((zone) => Phaser.Math.Distance.Between(anchorX, anchorY, zone.x, zone.y) < zone.radius + 85)
          || placed.some((rock) => Phaser.Math.Distance.Between(anchorX, anchorY, rock.x, rock.y) < rock.radius + 165)) continue

        const memberCount = random.integerInRange(5, 8)
        const clusterMembers: TerrainStone[] = []
        let membersPlaced = 0
        for (let memberIndex = 0; memberIndex < memberCount; memberIndex++) {
          for (let memberAttempt = 0; memberAttempt < 24; memberAttempt++) {
            const angle = random.realInRange(0, Math.PI * 2)
            const radius = memberIndex === 0 ? random.realInRange(39, 61) : random.realInRange(22, 52)
            const parent = clusterMembers.length > 0
              ? clusterMembers[random.integerInRange(0, clusterMembers.length - 1)]
              : undefined
            const distance = parent ? (parent.radius + radius) * random.realInRange(0.55, 0.7) : 0
            const x = Phaser.Math.Clamp((parent?.x ?? anchorX) + Math.cos(angle) * distance, 300, terrainMaxX)
            const y = Phaser.Math.Clamp((parent?.y ?? anchorY) + Math.sin(angle) * distance, 255, 945)
            const blocked = exclusions.some((zone) => Phaser.Math.Distance.Between(x, y, zone.x, zone.y) < zone.radius + radius)
              || placed.some((rock) => {
                const sameCluster = clusterMembers.includes(rock)
                const minimumDistance = sameCluster
                  ? (radius + rock.radius) * 0.4
                  : radius + rock.radius + 72
                return Phaser.Math.Distance.Between(x, y, rock.x, rock.y) < minimumDistance
              })
            if (blocked) continue
            const stone = this.addRiverStone(
              x,
              y,
              radius,
              random.integerInRange(0, 2),
              random.realInRange(-Math.PI, Math.PI),
              random.frac() > 0.5,
            )
            placed.push(stone)
            clusterMembers.push(stone)
            membersPlaced++
            break
          }
        }
        if (membersPlaced > 0) break
      }
    }

    // Vegetation is generated only after all stones. A few large areas replace
    // many isolated colonies, and almost every area grows out from bank-side
    // rocks as in the terrain sketch.
    const grassAreaCount = this.level === 4 ? 9 : 4
    const shoreRocks = placed.filter((rock) => rock.y < 430 || rock.y > 770)
    const grassAreas: { x: number; y: number; radius: number }[] = []
    for (let areaIndex = 0; areaIndex < grassAreaCount; areaIndex++) {
      for (let attempt = 0; attempt < 50; attempt++) {
        const preferShore = random.frac() < 0.84 && shoreRocks.length > 0
        const candidates = preferShore ? shoreRocks : placed
        const rock = candidates[random.integerInRange(0, candidates.length - 1)]
        const angle = random.realInRange(0, Math.PI * 2)
        const areaWidth = random.realInRange(520, 760)
        const areaRadius = areaWidth * 0.38
        const distance = rock.radius + random.realInRange(45, 90)
        const x = Phaser.Math.Clamp(rock.x + Math.cos(angle) * distance, 350, terrainMaxX - 50)
        const y = Phaser.Math.Clamp(rock.y + Math.sin(angle) * distance * 0.7, 300, 900)
        const blocked = (this.level === 4 && Math.abs(x - WATERFALL_X) < 410)
          || this.rockObstacles.some((other) => Phaser.Math.Distance.Between(x, y, other.x, other.y) < other.radius + 40)
          || Phaser.Math.Distance.Between(x, y, 240, 600) < 145
          || grassAreas.some((area) => Phaser.Math.Distance.Between(x, y, area.x, area.y) < (area.radius + areaRadius) * 0.82)
        if (blocked) continue
        this.addSeagrassArea(x, y, areaWidth, random)
        grassAreas.push({ x, y, radius: areaRadius })
        break
      }
    }
  }

  private createLevelOne() {
    this.addCurrent(220, 120, 950, 960, 1, 0, 32)
    this.addCurrent(1110, 100, 620, 1000, 1, 0.05, 44)
    this.addCurrent(1730, 120, 650, 960, 1, -0.04, 36)
    this.spawnFood(9)
    this.addPredator(1680, 600, 0xc6a767, 'Ørret')
    this.addEndLightGoal(2550, 600, () => this.foodCount >= FOOD_TARGET, 'Du trenger mer næring før du kan forlate elva')
  }

  private createLevelTwo() {
    this.spawnFood(9)
    this.addCurrent(280, 140, 820, 920, 1, 0, 34)
    this.addCurrent(1100, 100, 760, 1000, 1, 0.06, 52)
    this.addCurrent(1820, 100, 600, 420, 1, -0.1, 80, true)
    this.createPowerPlantIntake(2170, 300)
    for (let x = 1650; x < 2300; x += 120) {
      const y = 760 + Math.sin(x / 120) * 100
      this.add.circle(x, y, 20, 0xb7ef9e, 0.36).setStrokeStyle(4, 0xcaf6b5, 0.8)
    }
    this.addPredator(980, 410, 0xc6a767, 'Ørret')
    this.addPredator(1580, 760, 0xa88a58, 'Stor ørret')
    this.addEndLightGoal(2550, 820, () => this.foodCount >= FOOD_TARGET, 'Du trenger mer næring før du kan forlate elva')
    this.hint = 'Bruk steiner og sjøgress som ly mot rovfiskene og sugestrømmen'
  }

  private createPowerPlantIntake(x: number, y: number) {
    this.intakeHazard = {
      x,
      y,
      range: 690,
      dangerArea: new Phaser.Geom.Rectangle(x - 172, y - 92, 344, 184),
    }

    this.add.ellipse(x, y + 50, 500, 175, 0x02151c, 0.26).setDepth(27)
    this.add.image(x, y - 34, 'power-plant-intake-photo')
      .setDisplaySize(620, 308)
      .setDepth(29)

    this.add.text(x, y + 142, 'KRAFTVERKSINNTAK', {
      fontFamily: 'system-ui', fontSize: '27px', fontStyle: '800', color: '#fff0cf',
      backgroundColor: '#142d36e8', padding: { x: 18, y: 10 },
    }).setOrigin(0.5).setDepth(34)

    const beaconLeft = this.add.circle(x - 252, y - 169, 14, 0xff4f38, 0.84)
      .setStrokeStyle(5, 0xffb49f, 0.82).setDepth(35)
    const beaconRight = this.add.circle(x + 252, y - 169, 14, 0xff4f38, 0.84)
      .setStrokeStyle(5, 0xffb49f, 0.82).setDepth(35)
    if (!this.reducedMotion) {
      this.tweens.add({ targets: [beaconLeft, beaconRight], alpha: 0.22, scale: 1.45, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    }

    // Converging rings and foam make the direction and pulse of the suction
    // legible without adding another abstract UI marker.
    for (let index = 0; index < 5; index++) {
      const ring = this.add.ellipse(x - 510 + index * 72, y, 210 - index * 18, 118 - index * 8, 0x7ee8ec, 0.025)
        .setStrokeStyle(5, index % 2 === 0 ? 0x8ceff0 : 0xffa27f, 0.28).setDepth(18)
      if (!this.reducedMotion) {
        this.tweens.add({
          targets: ring, x: x - 150, scaleX: 0.36, scaleY: 0.62, alpha: 0.08,
          duration: 1500, delay: index * 250, repeat: -1, ease: 'Sine.in',
        })
      }
    }
    for (let index = 0; index < 18; index++) {
      const foam = this.add.circle(x - 186 + (index * 43) % 370, y - 72 + (index * 61) % 150, 3 + (index % 3) * 2, 0xd9ffff, 0.58).setDepth(30)
      if (!this.reducedMotion) this.tweens.add({ targets: foam, x: x + (index % 2 ? 36 : -36), alpha: 0.16, duration: 700 + index * 45, yoyo: true, repeat: -1 })
    }

  }

  private createLevelThree() {
    this.spawnFood(12)
    this.addCurrent(620, 120, 1180, 620, 0.65, 0.28, 22)
    this.addCurrent(1550, 930, 1050, 730, 0.72, -0.22, 25)
    this.addCurrent(2700, 250, 930, 720, 0.58, 0.32, 20)
    this.addPredator(1250, 390, 0x8f8265, 'Torsk', { texture: 'atlantic-cod', width: 242, height: 86 })
    this.addPredator(2200, 1180, 0x8f8265, 'Torsk', { texture: 'atlantic-cod', width: 248, height: 88 })
    this.addPredator(3020, 520, 0x8f8265, 'Torsk', { texture: 'atlantic-cod', width: 236, height: 84 })
    this.addPredator(1400, 950, 0x71808a, 'Sel', { texture: 'harbor-seal', kind: 'seal', width: 470, height: 202 })
    this.addPredator(3340, 850, 0x71808a, 'Sel', { texture: 'harbor-seal', kind: 'seal', width: 470, height: 202 })
    this.createFishSchool(720, 430, 7)
    this.createFishSchool(1880, 280, 9)
    this.createFishSchool(3200, 1320, 8)
    this.addEndLightGoal(3850, 950, () => this.foodCount >= FOOD_TARGET, 'Du trenger mer næring før hjemreisen')
    this.hint = 'Det åpne havet er enormt – samle krill og hold øye med tre torsker og to seler'
  }

  private createLevelFour() {
    this.addCurrent(220, 120, 1300, 960, -1, 0, 38)
    this.addCurrent(1450, 100, 1050, 1000, -1, 0.08, 70)
    this.addCurrent(2450, 120, 1100, 960, -1, -0.05, 48)
    this.addCurrent(3500, 100, 1080, 1000, -1, 0.04, 60)
    this.addWaterfallBarrier()
    this.addFishingHooks()
    const spawnSites = [
      { x: 3560, y: 300, label: 'For stille vann', correct: false, texture: 'spawn-still-silt' },
      { x: 4100, y: 860, label: 'Bløt mudderbunn', correct: false, texture: 'spawn-soft-mud' },
      { x: 4620, y: 570, label: 'Grus og friskt vann', correct: true, texture: 'spawn-clean-gravel' },
    ]
    this.addDirectionSigns('Undersøk gyteområdene', Math.min(...spawnSites.map((site) => site.x)) - 340, 590)
    for (const site of spawnSites) this.addSpawnArea(site.x, site.y, site.label, site.correct, site.texture)
    this.hint = 'Svøm mot strømmen, unngå fiskekrokene og finn veien opp fossen'
  }

  private addWaterfallBarrier() {
    const gapHeight = WATERFALL_GAP_BOTTOM - WATERFALL_GAP_TOP
    const top = this.riverTopEdge(WATERFALL_X) + 18
    const bottom = this.riverBottomEdge(WATERFALL_X) - 18
    const wall = this.add.graphics().setDepth(18)
    const wallSections = [
      { start: top, end: WATERFALL_GAP_TOP },
      { start: WATERFALL_GAP_BOTTOM, end: bottom },
    ]
    for (const section of wallSections) {
      const height = section.end - section.start
      wall.fillStyle(0x092b35, 0.56).fillRoundedRect(WATERFALL_X - 137, section.start + 6, 274, height - 4, 18)
      wall.fillStyle(0x3b514c, 0.92).fillRoundedRect(WATERFALL_X - 112, section.start + 10, 224, height - 10, 14)
      wall.fillStyle(0x728078, 0.3).fillRoundedRect(WATERFALL_X + 66, section.start + 12, 24, height - 20, 8)
    }

    // Each wall has its own cutout asset, clipped precisely to the river waterline.
    wallSections.forEach((section, index) => {
      const clip = this.add.graphics().setVisible(false)
      clip.fillStyle(0xffffff, 1).fillRect(WATERFALL_X - 140, section.start, 280, section.end - section.start)
      const texture = index === 0 ? 'waterfall-rock-upper' : 'waterfall-rock-lower'
      const centerY = (section.start + section.end) / 2
      const imageHeight = section.end - section.start + 84
      const mask = clip.createGeometryMask()
      this.addSilhouetteShadow(texture, WATERFALL_X, centerY, 340, imageHeight, 0, false, 18.5, 0.23).setMask(mask)
      this.add.image(WATERFALL_X, centerY, texture)
        .setDisplaySize(340, imageHeight)
        .setMask(mask)
        .setDepth(19)
    })

    const flowMask = this.add.graphics().setVisible(false)
    flowMask.fillStyle(0xffffff, 1).fillRoundedRect(WATERFALL_X - 125, WATERFALL_GAP_TOP + 2, 250, gapHeight - 4, 18)
    this.waterfallFlow = this.add.graphics().setDepth(20).setMask(flowMask.createGeometryMask())
    this.drawWaterfallFlow()
    this.addCurrent(WATERFALL_X - 190, WATERFALL_GAP_TOP + 12, 285, gapHeight - 24, -1, 0, 74)
  }

  private drawWaterfallFlow() {
    const flow = this.waterfallFlow
    if (!flow) return
    const left = WATERFALL_X - 125
    const right = WATERFALL_X + 125
    const top = WATERFALL_GAP_TOP
    const height = WATERFALL_GAP_BOTTOM - top
    const phase = this.waterfallPhase
    flow.clear()
    flow.fillStyle(0x176d75, 0.94).fillRoundedRect(left, top + 2, right - left, height - 4, 18)
    flow.fillStyle(0x318c88, 0.6).fillRoundedRect(left + 20, top + 6, 198, height - 12, 14)
    flow.fillStyle(0xd0f2e4, 0.46).fillRoundedRect(right - 42, top + 6, 18, height - 12, 7)
    flow.fillStyle(0xe1f6e9, 0.18).fillRoundedRect(right - 65, top + 6, 9, height - 12, 5)

    // Water veins undulate and bright foam travels downstream through the chute.
    for (let row = 0; row < 12; row++) {
      const y = top + 13 + row * 18
      flow.lineStyle(row % 3 === 0 ? 6 : 3, row % 3 === 0 ? 0xd9f5e8 : 0x8bcfc3, row % 3 === 0 ? 0.4 : 0.28)
      flow.beginPath().moveTo(left, y)
      for (let step = 1; step <= 10; step++) {
        const x = left + step * 25
        flow.lineTo(x, y + Math.sin(step * 1.8 + phase * 5.5 + row * 1.35) * 5)
      }
      flow.strokePath()
    }
    for (let index = 0; index < 31; index++) {
      const travel = (phase * (142 + index % 5 * 23) + index * 67) % 300
      const x = right + 14 - travel
      const y = top + 8 + (index * 53) % (height - 16)
      flow.fillStyle(index % 4 === 0 ? 0xf0fff3 : 0xb5e5d4, index % 4 === 0 ? 0.54 : 0.28)
      flow.fillEllipse(x, y + Math.sin(phase * 4 + index) * 4, 18 + index % 3 * 11, 3 + index % 2 * 2)
    }
    for (let index = 0; index < 11; index++) {
      const y = top + 12 + index * 20
      const drift = Math.sin(phase * 7 + index * 1.7) * 11
      flow.fillStyle(0xe0f7e8, 0.2 + (index % 3) * 0.05).fillEllipse(left + 18 + drift, y, 65, 11)
    }
  }

  private updateWaterfallGate() {
    if (this.level !== 4 || this.waterfallJumping) return false
    const direction = this.waterfallSide === -1 ? 1 : -1
    const wallFace = WATERFALL_X - direction * 140
    if ((this.player.x - wallFace) * direction < -20) return false
    const inChute = this.player.y > WATERFALL_GAP_TOP + 33 && this.player.y < WATERFALL_GAP_BOTTOM - 33
    const aimingAcross = direction === 1 ? this.target.x > WATERFALL_X + 85 : this.target.x < WATERFALL_X - 85
    const facingAcross = Math.cos(this.player.rotation) * direction > 0.75
    const enoughSpeed = this.playerForwardSpeed >= (direction === 1 ? 170 : 110)
      && this.playerBody.velocity.x * direction > (direction === 1 ? 50 : 45)
    if (inChute && aimingAcross && facingAcross && enoughSpeed) {
      this.beginWaterfallJump(direction)
      return true
    }
    if ((this.player.x - wallFace) * direction > 0) this.playerBody.reset(wallFace, this.player.y)
    if (this.hintTimer <= 0 && aimingAcross) {
      this.hint = inChute
        ? direction === 1 ? 'Ta fart og sikt forbi fossen for å hoppe opp' : 'Svøm inn i fossen for å hoppe ned igjen'
        : 'Steinveggen sperrer elva – finn fossen i midten'
      this.hintTimer = 2.3
      this.emitHud()
    }
    return false
  }

  private beginWaterfallJump(direction: -1 | 1) {
    this.waterfallJumping = true
    this.playerForwardSpeed = 0
    this.playerBody.setVelocity(0, 0)
    this.physics.world.pause()
    this.hint = direction === 1 ? 'Laksen hopper opp fossen!' : 'Laksen hopper ned fossen!'
    this.hintTimer = 1.6
    this.emitHud()
    const departure = this.add.ellipse(this.player.x, this.player.y, 64, 25, 0xe7fffa, 0.12)
      .setStrokeStyle(3, 0xe7fffa, 0.62).setDepth(48)
    this.tweens.add({ targets: departure, scaleX: 2.4, scaleY: 2.1, alpha: 0, duration: this.reducedMotion ? 180 : 570, onComplete: () => departure.destroy() })
    const landingY = 600 + (this.player.y - 600) * 0.25
    this.player.setDepth(62)
    this.tweens.add({
      targets: this.player,
      x: WATERFALL_X + direction * 205,
      y: landingY,
      duration: this.reducedMotion ? 220 : 820,
      ease: 'Sine.InOut',
      onUpdate: (tween) => {
        const lift = Math.sin(Math.PI * tween.progress)
        this.player.setScale(1 + lift * 0.24)
        this.playerShadow.setAlpha(0.36 - lift * 0.27)
      },
      onComplete: () => {
        this.player.setScale(1).setDepth(50)
        this.playerShadow.setAlpha(0.36)
        this.playerBody.reset(this.player.x, this.player.y)
        this.waterfallJumping = false
        this.waterfallSide = direction
        this.playerForwardSpeed = direction === 1 ? 155 : 135
        if (!this.gamePaused && !this.finished) this.physics.world.resume()
        this.hint = direction === 1 ? 'Du kom deg opp fossen – finn gyteområdene' : 'Du er tilbake nedenfor fossen'
        this.hintTimer = 2.8
        this.emitHud()
        const landing = this.add.ellipse(this.player.x, this.player.y, 74, 31, 0xe7fffa, 0.16)
          .setStrokeStyle(3, 0xe7fffa, 0.66).setDepth(48)
        this.tweens.add({ targets: landing, scaleX: 2.2, scaleY: 2, alpha: 0, duration: this.reducedMotion ? 180 : 540, onComplete: () => landing.destroy() })
      },
    })
  }

  private createPlayer() {
    const size = FISH_SIZES[this.level]
    const spawnY = this.level === 3 ? OCEAN_H / 2 : 600
    this.playerSwimPhase = 0
    this.playerSwimAmplitude = 0
    this.playerTurnBend = 0
    this.playerForwardSpeed = 0
    this.collisionSlowdown = 0
    this.evolving = false
    this.evolved = false
    this.target.set(270, spawnY)
    this.player = this.add.container(240, spawnY).setDepth(50)
    this.playerShadow = this.add.ellipse(4, size.height * 0.16, size.width * 0.78, size.height * 0.42, 0x001722, 0.36)
    this.playerArt = this.createRiggedFish(`salmon-stage-${this.level}`, size.width, size.height)
    this.playerArt.setData('baseHeight', size.height)
    this.playerArt.setData('baseWidth', size.width)
    this.playerArt.setData('baseScaleX', this.playerArt.scaleX)
    this.playerArt.setData('baseScaleY', this.playerArt.scaleY)
    this.player.add([this.playerShadow, this.playerArt])
    this.physics.add.existing(this.player)
    this.playerBody = this.player.body as Phaser.Physics.Arcade.Body
    // A compact circle follows the solid torso while ignoring transparent fins
    // and the long nose/tail. This lets the fish use gaps that look open.
    const collisionRadius = this.fishCollisionRadius(size.width, size.height)
    this.playerBody.setCircle(collisionRadius, -collisionRadius, -collisionRadius).setCollideWorldBounds(true).setMaxVelocity(390)
    this.marker = this.add.circle(this.target.x, this.target.y, 20, 0xb9fff0, 0.07).setStrokeStyle(2, 0xc8fff4, 0.62).setDepth(30)
  }

  private createRiggedFish(texture: string, width: number, height: number): FishArt {
    if (this.game.renderer.type !== Phaser.WEBGL) {
      return this.add.image(0, 0, texture).setDisplaySize(width, height)
    }

    // The rope is a lightweight mesh armature. Every point participates in the
    // travelling body wave, with a restrained head motion and progressively
    // larger movement through the body toward the tail.
    const frame = this.textures.getFrame(texture)
    const points = Array.from({ length: 9 }, (_, index) => ({
      x: -frame.halfWidth + index * (frame.width / 8),
      y: 0,
    }))
    return this.add.rope(0, 0, texture, undefined, points, true).setDisplaySize(width, height)
  }

  private createRiggedSeal(texture: string, width: number, height: number): FishArt {
    if (this.game.renderer.type !== Phaser.WEBGL) {
      return this.add.image(0, 0, texture).setDisplaySize(width, height)
    }

    // More, smaller segments keep the broad torso smooth while allowing the
    // hind flippers to articulate independently at the rear of the animal.
    const frame = this.textures.getFrame(texture)
    const segmentCount = 17
    const points = Array.from({ length: segmentCount }, (_, index) => ({
      x: -frame.halfWidth + index * (frame.width / (segmentCount - 1)),
      y: 0,
    }))
    return this.add.rope(0, 0, texture, undefined, points, true).setDisplaySize(width, height)
  }

  private fishCollisionRadius(width: number, height: number) {
    return Math.min(width * 0.2, height * 0.31)
  }

  private animateFishRig(art: FishArt, phase: number, amplitudePx: number, turnBendPx = 0) {
    if (!(art instanceof Phaser.GameObjects.Rope)) {
      art.rotation = Math.sin(phase) * Math.min(0.035, amplitudePx / 320) + turnBendPx / 420
      return
    }

    const bodyWaveWeights = [1, 0.88, 0.74, 0.6, 0.47, 0.35, 0.25, 0.17, 0.11]
    const frontBendWeights = [0, 0, 0.02, 0.06, 0.14, 0.28, 0.5, 0.76, 1]
    const sourceAmplitude = amplitudePx / Math.max(0.001, Math.abs(art.scaleY))
    const sourceTurnBend = turnBendPx / Math.max(0.001, Math.abs(art.scaleY))
    for (let index = 0; index < art.points.length; index++) {
      const swimmingWave = Math.sin(phase - index * 0.48) * sourceAmplitude * bodyWaveWeights[index]
      art.points[index].y = swimmingWave + sourceTurnBend * frontBendWeights[index]
    }
    art.setDirty()
  }

  private animateSealRig(art: FishArt, phase: number, amplitudePx: number, turnBendPx = 0) {
    if (!(art instanceof Phaser.GameObjects.Rope)) {
      art.rotation = Math.sin(phase) * Math.min(0.025, amplitudePx / 520) + turnBendPx / 620
      return
    }

    // Harbour seals generate thrust with their paired hind flippers. The rear
    // third sweeps from side to side in distinct power strokes while the broad
    // torso mostly glides; the front flippers act as rudders instead of wings.
    const sourceAmplitude = amplitudePx / Math.max(0.001, Math.abs(art.scaleY))
    const sourceTurnBend = turnBendPx / Math.max(0.001, Math.abs(art.scaleY))
    const stroke = Math.sin(phase)
    const powerPulse = 0.2 + Math.pow(Math.abs(stroke), 1.45) * 0.8
    const rearSweep = stroke * sourceAmplitude * powerPulse
    const torsoFlex = Math.sin(phase - 0.6) * sourceAmplitude * 0.08

    for (let index = 0; index < art.points.length; index++) {
      const alongBody = index / Math.max(1, art.points.length - 1)
      const rearStrokeWeight = Math.pow(Phaser.Math.Clamp((0.42 - alongBody) / 0.42, 0, 1), 1.65)
      const torsoFlexWeight = Math.pow(Phaser.Math.Clamp((0.58 - alongBody) / 0.58, 0, 1), 2.1)
      const steeringWeight = Math.pow(Phaser.Math.Clamp((alongBody - 0.3) / 0.7, 0, 1), 1.55)
      art.points[index].y = rearSweep * rearStrokeWeight
        + torsoFlex * torsoFlexWeight
        + sourceTurnBend * steeringWeight
    }
    art.setDirty()
  }

  private createRiggedFood(texture: string, width: number, height: number): FoodArt {
    if (this.game.renderer.type !== Phaser.WEBGL) {
      return this.add.image(0, 0, texture).setDisplaySize(width, height)
    }

    const frame = this.textures.getFrame(texture)
    const points = Array.from({ length: 7 }, (_, index) => ({
      x: -frame.halfWidth + index * (frame.width / 6),
      y: 0,
    }))
    return this.add.rope(0, 0, texture, undefined, points, true).setDisplaySize(width, height)
  }

  private animateFoodRig(art: FoodArt, phase: number, amplitudePx: number) {
    if (!(art instanceof Phaser.GameObjects.Rope)) {
      art.rotation = Math.sin(phase) * 0.025
      return
    }

    const jointWeights = [0.35, 0.7, 1, 0.65, 0.35, 0.7, 1]
    const sourceAmplitude = amplitudePx / Math.max(0.001, Math.abs(art.scaleY))
    for (let index = 0; index < art.points.length; index++) {
      art.points[index].y = Math.sin(phase - index * 0.82) * sourceAmplitude * jointWeights[index]
    }
    art.setDirty()
  }

  private turnBendFromRadius(turnDelta: number, speed: number, angularSpeed: number, maxBendPx: number) {
    if (Math.abs(turnDelta) < 0.005 || speed < 4 || angularSpeed < 0.001) return 0

    const turnRadius = speed / angularSpeed
    const tightRadius = 55
    const wideRadius = 270
    const radiusSharpness = 1 - Phaser.Math.Clamp((turnRadius - tightRadius) / (wideRadius - tightRadius), 0, 1)
    const turnDemand = Phaser.Math.Clamp(Math.abs(turnDelta) / 0.52, 0, 1)
    const movementStrength = Phaser.Math.Clamp(speed / 65, 0.2, 1)
    return Math.sign(turnDelta) * radiusSharpness * turnDemand * movementStrength * maxBendPx
  }

  private createPointerControls() {
    const setTarget = (pointer: Phaser.Input.Pointer) => {
      this.target.set(pointer.worldX, pointer.worldY)
      this.marker.setPosition(pointer.worldX, pointer.worldY).setAlpha(1).setScale(0.7)
      this.tweens.add({ targets: this.marker, scale: 1.15, alpha: 0.35, duration: this.reducedMotion ? 1 : 420 })
      if (this.hint.includes('Trykk')) { this.hint = 'Bra! Dra for å endre retning'; this.hintTimer = 3.5 }
    }
    this.input.on('pointerdown', setTarget)
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => { if (pointer.isDown) setTarget(pointer) })
  }

  private addSilhouetteShadow(texture: string, x: number, y: number, width: number, height: number, rotation: number, flipX: boolean, depth: number, alpha: number) {
    return this.add.image(x + width * 0.025, y + height * 0.075, texture)
      .setDisplaySize(width, height)
      .setRotation(rotation)
      .setFlipX(flipX)
      .setTintFill(0x06232a)
      .setAlpha(alpha)
      .setDepth(depth)
  }

  private addRiverStone(x: number, y: number, radius: number, variant: number, rotation: number, flipX: boolean): TerrainStone {
    const textures = ['river-stone-long-v4', 'river-stone-dark-v4', 'river-stone-pale-v4']
    const texture = textures[Phaser.Math.Clamp(variant, 0, textures.length - 1)]
    const width = radius * 2.28
    const height = width * (texture === 'river-stone-long-v4' ? 0.5 : 0.67)
    this.addSilhouetteShadow(texture, x, y, width, height, rotation, flipX, 8, 0.26)
    this.add.image(x, y, texture)
      .setDisplaySize(width, height)
      .setRotation(rotation)
      .setFlipX(flipX)
      .setTint(this.level === 4 ? 0xe2e4d8 : 0xffffff)
      .setDepth(10)

    // Rotated sprites cannot use a rotated Arcade rectangle. A short chain of
    // circles follows the visible silhouette much more closely, particularly
    // for the long quartz stone.
    const longStone = texture === 'river-stone-long-v4'
    const collisionRadius = radius * (longStone ? 0.46 : 0.64)
    const offsets = longStone ? [-0.58, 0, 0.58] : [-0.36, 0.36]
    for (const offset of offsets) {
      const distance = radius * offset
      const hitX = x + Math.cos(rotation) * distance
      const hitY = y + Math.sin(rotation) * distance
      const hitbox = this.add.circle(hitX, hitY, collisionRadius, 0xffffff, 0).setVisible(false)
      this.rocks.add(hitbox)
      const body = hitbox.body as Phaser.Physics.Arcade.StaticBody
      body.updateFromGameObject()
      body.setCircle(collisionRadius)
      this.rockObstacles.push({ x: hitX, y: hitY, radius: collisionRadius })
    }
    return { x, y, radius }
  }

  private addRockCluster(x: number, y: number, width: number, large: boolean, rotation: number, flipX: boolean) {
    const height = width * 0.66
    const texture = large ? 'rock-cluster-large-v3' : 'rock-cluster-small-v3'
    this.addSilhouetteShadow(texture, x, y, width, height, rotation, flipX, 8, 0.26)
    this.add.image(x, y, texture)
      .setDisplaySize(width, height)
      .setRotation(rotation)
      .setFlipX(flipX)
      .setTint(this.level === 3 ? 0x9aaeb2 : 0xffffff)
      .setDepth(10)

    const stones = large
      ? [
          { x: -0.34, y: -0.1, r: 0.14 }, { x: -0.08, y: -0.2, r: 0.17 },
          { x: 0.24, y: -0.15, r: 0.16 }, { x: 0.35, y: 0.13, r: 0.13 },
          { x: 0.06, y: 0.17, r: 0.16 }, { x: -0.25, y: 0.18, r: 0.14 },
        ]
      : [
          { x: -0.24, y: -0.12, r: 0.16 }, { x: 0.23, y: -0.13, r: 0.15 },
          { x: -0.17, y: 0.18, r: 0.15 }, { x: 0.2, y: 0.18, r: 0.15 },
        ]

    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    for (const stone of stones) {
      const localX = stone.x * width * (flipX ? -1 : 1)
      const localY = stone.y * height
      const stoneX = x + localX * cos - localY * sin
      const stoneY = y + localX * sin + localY * cos
      const radius = stone.r * width
      const hitbox = this.add.circle(stoneX, stoneY, radius, 0xffffff, 0).setVisible(false)
      this.rocks.add(hitbox)
      const body = hitbox.body as Phaser.Physics.Arcade.StaticBody
      body.updateFromGameObject()
      body.setCircle(radius)
      this.rockObstacles.push({ x: stoneX, y: stoneY, radius })
    }
  }

  private clearPointFromRocks(x: number, y: number, clearance = 58) {
    const point = new Phaser.Math.Vector2(x, y)
    for (let pass = 0; pass < 5; pass++) {
      for (const rock of this.rockObstacles) {
        const minimumDistance = rock.radius + clearance
        const offset = point.clone().subtract(new Phaser.Math.Vector2(rock.x, rock.y))
        if (offset.lengthSq() >= minimumDistance * minimumDistance) continue
        if (offset.lengthSq() < 0.001) offset.set(0, 1)
        point.copy(offset.normalize().scale(minimumDistance).add(new Phaser.Math.Vector2(rock.x, rock.y)))
      }
      point.x = Phaser.Math.Clamp(point.x, 90, this.worldWidth() - 90)
      const boundary = this.worldBoundary()
      point.y = Phaser.Math.Clamp(point.y, boundary + clearance, this.worldHeight() - boundary - clearance)
    }
    return point
  }

  private predatorObstacles() {
    if (!this.intakeHazard) return this.rockObstacles
    return [...this.rockObstacles, { x: this.intakeHazard.x, y: this.intakeHazard.y, radius: 320 }]
  }

  private clearPredatorPoint(x: number, y: number, clearance = 78) {
    const point = this.clearPointFromRocks(x, y, clearance)
    if (!this.intakeHazard) return point
    const minimumDistance = 320 + clearance
    const offset = point.clone().subtract(new Phaser.Math.Vector2(this.intakeHazard.x, this.intakeHazard.y))
    if (offset.lengthSq() >= minimumDistance * minimumDistance) return point
    if (offset.lengthSq() < 0.001) offset.set(-1, 1)
    point.copy(offset.normalize().scale(minimumDistance).add(new Phaser.Math.Vector2(this.intakeHazard.x, this.intakeHazard.y)))
    point.x = Phaser.Math.Clamp(point.x, 90, this.worldWidth() - 90)
    const boundary = this.worldBoundary()
    point.y = Phaser.Math.Clamp(point.y, boundary + clearance, this.worldHeight() - boundary - clearance)
    return point
  }

  private spawnFood(count: number) {
    const random = new Phaser.Math.RandomDataGenerator([`villaks-food-level-${this.level}-${this.terrainSeed}`])
    const placed: Phaser.Math.Vector2[] = []

    for (let index = 0; index < count; index++) {
      let spawnPoint: Phaser.Math.Vector2 | undefined
      for (let attempt = 0; attempt < 70; attempt++) {
        const preferGrass = this.hidingZones.length > 0 && random.frac() < 0.76
        let candidateX: number
        let candidateY: number

        if (preferGrass) {
          const zone = this.hidingZones[random.integerInRange(0, this.hidingZones.length - 1)]
          const angle = random.realInRange(0, Math.PI * 2)
          const distance = Math.sqrt(random.frac()) * 0.58
          candidateX = zone.x + Math.cos(angle) * zone.width * 0.5 * distance
          candidateY = zone.y + Math.sin(angle) * zone.height * 0.5 * distance
        } else {
          candidateX = this.level === 3 ? random.realInRange(360, OCEAN_W - 340) : random.realInRange(360, 2260)
          candidateY = this.level === 3 ? random.realInRange(110, OCEAN_H - 110) : random.realInRange(290, 910)
        }

        const safePoint = this.clearPointFromRocks(candidateX, candidateY, 34)
        const tooCloseToStart = Phaser.Math.Distance.Between(safePoint.x, safePoint.y, 240, this.level === 3 ? OCEAN_H / 2 : 600) < 190
        const tooCloseToFood = placed.some((point) => Phaser.Math.Distance.Between(safePoint.x, safePoint.y, point.x, point.y) < 145)
        if (tooCloseToStart || tooCloseToFood) continue
        spawnPoint = safePoint
        break
      }

      if (!spawnPoint) {
        spawnPoint = this.clearPointFromRocks(430 + index * 210, this.level === 3 ? 390 + (index % 4) * 360 : 360 + (index % 3) * 220, 34)
      }
      placed.push(spawnPoint)
      this.addFood(spawnPoint.x, spawnPoint.y, index, random)
    }
  }

  private addFood(x: number, y: number, index: number, random: Phaser.Math.RandomDataGenerator) {
    const safePoint = this.clearPointFromRocks(x, y)
    x = safePoint.x
    y = safePoint.y
    const isOcean = this.level === 3
    const texture = isOcean ? 'ocean-food-v2' : 'river-food-v2'
    const itemWidth = isOcean ? 64 : 58
    const itemHeight = isOcean ? 42 : 38
    const item = this.createRiggedFood(texture, itemWidth, itemHeight).setPosition(x, y).setDepth(22)
    const redOutline = this.add.graphics({ x, y })
      .setDepth(23)
      .setBlendMode(Phaser.BlendModes.NORMAL)
    const outlineScaleX = 0.78
    const outlineScaleY = 0.68
    const figureShape = [[-0.48, -0.1], [-0.42, -0.28], [-0.32, -0.2], [-0.25, -0.38], [-0.15, -0.23], [-0.07, -0.31], [0.03, -0.22], [0.14, -0.27], [0.25, -0.18], [0.37, -0.15], [0.49, 0], [0.37, 0.15], [0.25, 0.18], [0.14, 0.27], [0.03, 0.22], [-0.07, 0.31], [-0.15, 0.23], [-0.25, 0.38], [-0.32, 0.2], [-0.42, 0.28], [-0.48, 0.1]]
      .map(([pointX, pointY]) => new Phaser.Geom.Point(pointX * itemWidth * outlineScaleX, pointY * itemHeight * outlineScaleY))
    if (isOcean) {
      redOutline.setVisible(false)
      if (this.game.renderer.type === Phaser.WEBGL) item.postFX.addGlow(0xff1738, 3.2, 0.35, false, 0.12, 4)
    } else {
      redOutline.lineStyle(5, 0xf0192d, 0.26).strokePoints(figureShape, true, true)
      redOutline.lineStyle(2, 0xff3040, 0.96).strokePoints(figureShape, true, true)
    }

    const drawAppendage = (points: [number, number][]) => {
      redOutline.beginPath()
      points.forEach(([pointX, pointY], pointIndex) => {
        const scaledX = pointX * itemWidth * outlineScaleX
        const scaledY = pointY * itemHeight * outlineScaleY
        if (pointIndex === 0) redOutline.moveTo(scaledX, scaledY)
        else redOutline.lineTo(scaledX, scaledY)
      })
      redOutline.strokePath()
    }
    redOutline.lineStyle(2, 0xff3040, 0.82)
    if (!isOcean) {
      drawAppendage([[-0.3, -0.17], [-0.42, -0.43]])
      drawAppendage([[-0.14, -0.2], [-0.2, -0.45]])
      drawAppendage([[-0.3, 0.17], [-0.42, 0.43]])
      drawAppendage([[-0.14, 0.2], [-0.2, 0.45]])
    }
    item.setData('index', index)
    item.setData('foodHighlights', isOcean ? [] : [redOutline])
    this.food.add(item)
    this.foodItems.push(item)
    if (!this.reducedMotion) {
      const centerX = item.x
      const centerY = item.y
      const orbitX = random.realInRange(2.5, 5)
      const orbitY = random.realInRange(1.5, 3.5)
      const startPhase = random.realInRange(0, Math.PI * 2)
      const motion = { phase: startPhase }
      const motionTween = this.tweens.add({
        targets: motion,
        phase: startPhase + Math.PI * 2,
        repeat: -1,
        duration: random.integerInRange(4800, 6800),
        ease: 'Linear',
        onUpdate: () => {
          const nextX = centerX + Math.cos(motion.phase) * orbitX
          const nextY = centerY + Math.sin(motion.phase * 2) * orbitY
          const rotation = Math.sin(motion.phase + index * 0.4) * 0.025
          item.setPosition(nextX, nextY).setRotation(rotation)
          redOutline.setPosition(nextX, nextY).setRotation(rotation)
          this.animateFoodRig(item, motion.phase * (isOcean ? 3 : 2), isOcean ? 3.6 : 3)
        },
      })
      item.setData('motionTween', motionTween)
      this.tweens.add({
        targets: redOutline,
        scaleX: 1.008,
        scaleY: 1.01,
        alpha: 0.8,
        yoyo: true,
        repeat: -1,
        duration: 720 + index * 42,
        ease: 'Sine.inOut',
      })
    }
  }

  private collectFood(item: FoodArt) {
    if (!item.active) return
    item.setActive(false).setVisible(false)
    const highlights = (item.getData('foodHighlights') as Phaser.GameObjects.Graphics[] | undefined) ?? []
    const motionTween = item.getData('motionTween') as Phaser.Tweens.Tween | undefined
    motionTween?.stop()
    this.tweens.killTweensOf([item, ...highlights])
    highlights.forEach((highlight) => highlight.setVisible(false))
    const body = item.body as Phaser.Physics.Arcade.StaticBody
    body.enable = false
    this.foodCount++
    this.playSound('eat')
    const burst = this.add.circle(item.x, item.y, 12, 0xfff3ad, 0.8).setDepth(60)
    this.tweens.add({ targets: burst, scale: 3.2, alpha: 0, duration: this.reducedMotion ? 120 : 420, onComplete: () => burst.destroy() })
    this.playEatingPop()
    if (this.foodCount === FOOD_TARGET && this.level < 4 && !this.evolved) {
      this.time.delayedCall(this.reducedMotion ? 100 : 220, () => this.playEvolutionAnimation())
    }
    this.hint = this.foodCount >= FOOD_TARGET ? 'Flott! Nå kan du svømme til målet' : `Mat samlet: ${this.foodCount} av ${FOOD_TARGET}`
    this.hintTimer = 2.4
    this.emitHud()
  }

  private playEatingPop() {
    const baseScaleX = this.playerArt.getData('baseScaleX') as number
    const baseScaleY = this.playerArt.getData('baseScaleY') as number
    this.tweens.killTweensOf(this.playerArt)
    const popScale = this.reducedMotion ? 1.045 : 1.16
    this.tweens.add({
      targets: this.playerArt,
      scaleX: baseScaleX * popScale,
      scaleY: baseScaleY * popScale,
      duration: this.reducedMotion ? 55 : 82,
      yoyo: true,
      ease: 'Back.Out',
      onComplete: () => this.playerArt.setScale(baseScaleX, baseScaleY),
    })
  }

  private playEvolutionAnimation() {
    if (this.evolving || this.evolved || this.level >= 4 || !this.playerArt.active) return
    this.evolving = true
    this.evolved = true
    this.playSound('evolve')
    this.playerForwardSpeed = 0
    this.playerBody.setVelocity(0, 0)
    this.physics.world.pause()
    gameBus.emit('swimming', { playerSpeed: 0, playerPhase: 0, predatorPresence: 0, predatorPhase: 0 })
    this.hint = 'Nok næring – laksen utvikler seg!'
    this.hintTimer = 3.2
    this.emitHud()

    const nextLevel = (this.level + 1) as LevelId
    const nextSize = FISH_SIZES[nextLevel]
    const nextArt = this.createRiggedFish(`salmon-stage-${nextLevel}`, nextSize.width, nextSize.height)
    nextArt.setData('baseHeight', nextSize.height)
    nextArt.setData('baseWidth', nextSize.width)
    nextArt.setData('baseScaleX', nextArt.scaleX)
    nextArt.setData('baseScaleY', nextArt.scaleY)
    const nextBaseScaleX = nextArt.scaleX
    const nextBaseScaleY = nextArt.scaleY
    nextArt.setAlpha(0).setScale(nextBaseScaleX * 0.24, nextBaseScaleY * 0.24)
    this.player.add(nextArt)

    const ring = this.add.circle(this.player.x, this.player.y, 42, 0xd9fff0, 0.16)
      .setStrokeStyle(5, 0xffef9d, 0.9)
      .setDepth(61)
    const label = this.add.text(this.player.x, this.player.y - nextSize.height * 0.85, 'NYTT LIVSSTADIUM', {
      fontFamily: 'system-ui', fontSize: '17px', fontStyle: '800', color: '#fff7c4',
      backgroundColor: '#083d49cc', padding: { x: 12, y: 7 },
    }).setOrigin(0.5).setDepth(62)

    if (!this.reducedMotion) {
      for (let index = 0; index < 12; index++) {
        const angle = (index / 12) * Math.PI * 2
        const spark = this.add.circle(this.player.x, this.player.y, 3 + index % 3, index % 2 ? 0xffed91 : 0xb7fff0, 0.9).setDepth(60)
        this.tweens.add({
          targets: spark,
          x: this.player.x + Math.cos(angle) * (92 + index * 3),
          y: this.player.y + Math.sin(angle) * (70 + index * 2),
          alpha: 0,
          scale: 0.3,
          duration: 520,
          ease: 'Cubic.Out',
          onComplete: () => spark.destroy(),
        })
      }
    }
    this.tweens.add({ targets: ring, scale: 2.35, alpha: 0, duration: this.reducedMotion ? 180 : 620, ease: 'Cubic.Out', onComplete: () => ring.destroy() })
    this.tweens.add({ targets: label, y: label.y - 24, alpha: 0, delay: this.reducedMotion ? 120 : 430, duration: 360, onComplete: () => label.destroy() })

    const currentArt = this.playerArt
    const currentBaseScaleX = currentArt.getData('baseScaleX') as number
    const currentBaseScaleY = currentArt.getData('baseScaleY') as number
    this.tweens.killTweensOf(currentArt)
    currentArt.setScale(currentBaseScaleX, currentBaseScaleY)
    this.tweens.add({
      targets: currentArt,
      scaleX: currentBaseScaleX * 1.2,
      scaleY: currentBaseScaleY * 1.2,
      alpha: 0,
      duration: this.reducedMotion ? 90 : 230,
      ease: 'Back.In',
      onComplete: () => {
        currentArt.destroy()
        this.playerArt = nextArt
        this.playerShadow.setPosition(4, nextSize.height * 0.16).setDisplaySize(nextSize.width * 0.78, nextSize.height * 0.42)
        const collisionRadius = this.fishCollisionRadius(nextSize.width, nextSize.height)
        this.playerBody.setCircle(collisionRadius, -collisionRadius, -collisionRadius)
        this.tweens.add({
          targets: nextArt,
          scaleX: nextBaseScaleX,
          scaleY: nextBaseScaleY,
          alpha: 1,
          duration: this.reducedMotion ? 130 : 480,
          ease: 'Back.Out',
          onComplete: () => {
            nextArt.setScale(nextBaseScaleX, nextBaseScaleY).setAlpha(1)
            this.evolving = false
            this.target.set(this.player.x + Math.cos(this.player.rotation) * 80, this.player.y + Math.sin(this.player.rotation) * 80)
            if (!this.gamePaused) this.physics.world.resume()
          },
        })
      },
    })
  }

  private addSeagrassCluster(x: number, y: number, width: number, height: number, rotation: number, flipX: boolean, registerHidingZone = true) {
    const shadow = this.addSilhouetteShadow('seagrass-cluster-v3', x, y, width, height, rotation, flipX, 13, 0.16)
    if (registerHidingZone) {
      const coverWidth = width * 0.7
      const coverHeight = height * 0.72
      const hidingWidth = Math.abs(Math.cos(rotation)) * coverWidth + Math.abs(Math.sin(rotation)) * coverHeight
      const hidingHeight = Math.abs(Math.sin(rotation)) * coverWidth + Math.abs(Math.cos(rotation)) * coverHeight
      this.hidingZones.push(new Phaser.Geom.Ellipse(x, y, hidingWidth, hidingHeight))
    }
    const grass = this.add.image(x, y, 'seagrass-cluster-v3')
      .setDisplaySize(width, height)
      .setRotation(rotation)
      .setFlipX(flipX)
      .setTint(this.level === 3 ? 0x8eaaa3 : 0xffffff)
      .setDepth(19)
    if (!this.reducedMotion) {
      this.tweens.add({
        targets: [grass, shadow],
        rotation: rotation + (flipX ? -0.035 : 0.035),
        scaleX: grass.scaleX * 1.018,
        scaleY: grass.scaleY * 0.99,
        yoyo: true,
        repeat: -1,
        duration: 1800 + Math.round(width) * 3,
        ease: 'Sine.inOut',
      })
    }
  }

  private addDeepOceanKelp(x: number, y: number, width: number, height: number, rotation: number, flipX: boolean) {
    const shadow = this.addSilhouetteShadow('deep-ocean-kelp', x, y, width, height, rotation, flipX, 13, 0.2)
    const coverWidth = width * 0.7
    const coverHeight = height * 0.72
    const hidingWidth = Math.abs(Math.cos(rotation)) * coverWidth + Math.abs(Math.sin(rotation)) * coverHeight
    const hidingHeight = Math.abs(Math.sin(rotation)) * coverWidth + Math.abs(Math.cos(rotation)) * coverHeight
    this.hidingZones.push(new Phaser.Geom.Ellipse(x, y, hidingWidth, hidingHeight))
    const kelp = this.add.image(x, y, 'deep-ocean-kelp')
      .setDisplaySize(width, height)
      .setRotation(rotation)
      .setFlipX(flipX)
      .setTint(0x86a7a4)
      .setDepth(19)
    if (!this.reducedMotion) {
      this.tweens.add({
        targets: [kelp, shadow],
        rotation: rotation + (flipX ? -0.055 : 0.055),
        scaleX: kelp.scaleX * 1.025,
        scaleY: kelp.scaleY * 0.985,
        yoyo: true,
        repeat: -1,
        duration: 2600 + Math.round(width) * 3,
        ease: 'Sine.inOut',
      })
    }
  }

  private addSeagrassArea(x: number, y: number, areaWidth: number, random: Phaser.Math.RandomDataGenerator) {
    const areaHeight = areaWidth * random.realInRange(0.38, 0.5)
    const tuftCount = random.integerInRange(14, 20)
    for (let tuftIndex = 0; tuftIndex < tuftCount; tuftIndex++) {
      const angle = random.realInRange(0, Math.PI * 2)
      const spread = tuftIndex === 0 ? 0 : Math.sqrt(random.frac())
      const tuftX = x + Math.cos(angle) * areaWidth * 0.42 * spread
      const tuftY = y + Math.sin(angle) * areaHeight * 0.42 * spread
      const width = random.realInRange(112, 178)
      const height = width * random.realInRange(0.58, 0.76)
      const rotation = random.realInRange(-0.42, 0.42)
      this.addSeagrassCluster(
        tuftX,
        tuftY,
        width,
        height,
        rotation,
        random.frac() > 0.5,
        false,
      )
    }
    this.hidingZones.push(new Phaser.Geom.Ellipse(x, y, areaWidth * 0.88, areaHeight * 0.92))
  }

  private addHiding(x: number, y: number, width: number, height: number) {
    const rotation = ((Math.round(x + y) % 9) - 4) * 0.035
    this.addSeagrassCluster(x, y, width, height, rotation, Math.round(x / 100) % 2 === 0)
  }

  private addPredator(x: number, y: number, _color: number, name: string, options: PredatorOptions = {}) {
    const kind = options.kind ?? 'fish'
    const texture = options.texture ?? 'trout-v2'
    const fish = this.add.container(x, y).setDepth(35)
    const predatorHeight = options.height ?? (this.level === 3 ? 101 : 93)
    const predatorWidth = options.width ?? (this.level === 3 ? 180 : 166)
    const predatorShadow = this.add.ellipse(7, predatorHeight * 0.16, predatorWidth * 0.82, predatorHeight * 0.54, 0x00101e, kind === 'seal' ? 0.48 : 0.4)
    const predatorArt = kind === 'seal'
      ? this.createRiggedSeal(texture, predatorWidth, predatorHeight)
      : this.createRiggedFish(texture, predatorWidth, predatorHeight)
    predatorArt.setData('baseWidth', predatorWidth)
    predatorArt.setData('baseHeight', predatorHeight)
    predatorArt.setData('baseScaleX', predatorArt.scaleX)
    predatorArt.setData('baseScaleY', predatorArt.scaleY)
    fish.add([predatorShadow, predatorArt])
    this.physics.add.existing(fish)
    const body = fish.body as Phaser.Physics.Arcade.Body
    body.setSize(predatorWidth * (kind === 'seal' ? 0.68 : 0.62), predatorHeight * 0.48)
      .setOffset(-predatorWidth * (kind === 'seal' ? 0.34 : 0.31), -predatorHeight * 0.24)
    this.physics.add.collider(fish, this.rocks)
    fish.setData('damageHint', `${name} traff deg – finn skjul i vegetasjonen`)
    const path = this.generatePredatorPath(x, y)
    this.predators.push({ fish, art: predatorArt, kind, homeX: x, homeY: y, phase: Math.random() * Math.PI * 2, swimPhase: Math.random() * Math.PI * 2, swimAmplitude: 0, turnBend: 0, forwardSpeed: 0, state: 'patrol', path, pathIndex: path.length > 1 ? 1 : 0, avoidanceSide: 1, lastX: x, lastY: y, stuckTimer: 0, escapeTimer: 0, recoveryAttempts: 0, burstTimer: 0, burstCooldown: kind === 'seal' ? 1.8 : 0 })
  }

  private generatePredatorPath(homeX: number, homeY: number) {
    if (this.level !== 1 && this.level !== 2 && this.level !== 4) return []
    const random = new Phaser.Math.RandomDataGenerator([`villaks-predator-path-v4-level-${this.level}-${this.terrainSeed}`])
    const anchors = [
      new Phaser.Math.Vector2(homeX, homeY),
      new Phaser.Math.Vector2(homeX + 440, homeY - 190),
      new Phaser.Math.Vector2(homeX + 560, homeY + 80),
      new Phaser.Math.Vector2(homeX + 260, homeY + 235),
      new Phaser.Math.Vector2(homeX - 420, homeY + 205),
      new Phaser.Math.Vector2(homeX - 620, homeY - 70),
      new Phaser.Math.Vector2(homeX - 280, homeY - 225),
    ].map((point, index) => {
      if (index > 0) point.add(new Phaser.Math.Vector2(random.realInRange(-38, 38), random.realInRange(-28, 28)))
      point.x = Phaser.Math.Clamp(point.x, 430, 2240)
      point.y = Phaser.Math.Clamp(point.y, 330, 870)
      return this.clearPredatorPoint(point.x, point.y, 78)
    })

    const route: Phaser.Math.Vector2[] = [anchors[0].clone()]
    for (let index = 0; index < anchors.length; index++) {
      this.appendPredatorRoute(route, anchors[index], anchors[(index + 1) % anchors.length])
    }
    return route
  }

  private appendPredatorRoute(route: Phaser.Math.Vector2[], start: Phaser.Math.Vector2, destination: Phaser.Math.Vector2) {
    let segmentStart = start.clone()
    for (let detourIndex = 0; detourIndex < 10; detourIndex++) {
      const segment = destination.clone().subtract(segmentStart)
      const lengthSquared = Math.max(1, segment.lengthSq())
      let blockingRock: RockObstacle | undefined
      let blockingProgress = Number.POSITIVE_INFINITY
      for (const rock of this.predatorObstacles()) {
        const relative = new Phaser.Math.Vector2(rock.x - segmentStart.x, rock.y - segmentStart.y)
        const progress = Phaser.Math.Clamp(relative.dot(segment) / lengthSquared, 0, 1)
        if (progress < 0.04 || progress > 0.96) continue
        const closest = segmentStart.clone().add(segment.clone().scale(progress))
        const clearance = rock.radius + 74
        if (Phaser.Math.Distance.Between(closest.x, closest.y, rock.x, rock.y) >= clearance) continue
        if (progress < blockingProgress) {
          blockingProgress = progress
          blockingRock = rock
        }
      }
      if (!blockingRock) break

      const direction = segment.normalize()
      const perpendicular = new Phaser.Math.Vector2(-direction.y, direction.x)
      const clearance = blockingRock.radius + 82
      const candidates = [1, -1].map((side) => this.clearPredatorPoint(
        blockingRock.x + perpendicular.x * clearance * side,
        blockingRock.y + perpendicular.y * clearance * side,
        72,
      ))
      const score = (point: Phaser.Math.Vector2) => {
        const boundary = this.worldBoundary()
        const edgeRoom = Math.min(point.y - boundary, this.worldHeight() - boundary - point.y)
        return Phaser.Math.Distance.Between(point.x, point.y, destination.x, destination.y) - Math.min(120, edgeRoom) * 0.35
      }
      const detour = score(candidates[0]) <= score(candidates[1]) ? candidates[0] : candidates[1]
      route.push(detour)
      segmentStart = detour
    }
    route.push(destination.clone())
  }

  private steerPredatorAroundRocks(predator: Predator, targetX: number, targetY: number) {
    const direct = new Phaser.Math.Vector2(targetX - predator.fish.x, targetY - predator.fish.y)
    const obstacles = this.predatorObstacles()
    if (direct.lengthSq() < 1 || obstacles.length === 0) return direct.normalize()
    direct.normalize()

    if (predator.escapeTimer > 0 && predator.avoidedRock) {
      const outward = new Phaser.Math.Vector2(predator.fish.x - predator.avoidedRock.x, predator.fish.y - predator.avoidedRock.y).normalize()
      const tangent = new Phaser.Math.Vector2(-outward.y, outward.x).scale(predator.avoidanceSide)
      return tangent.scale(0.7).add(outward.scale(0.85)).normalize()
    }

    const predatorWidth = predator.art.getData('baseWidth') as number
    const fishRadius = predatorWidth * 0.2
    const lookAhead = Math.max(predatorWidth * 1.7, predator.forwardSpeed * 1.35)
    let blockingRock: RockObstacle | undefined
    let blockingScore = Number.POSITIVE_INFINITY

    for (const rock of obstacles) {
      const toRock = new Phaser.Math.Vector2(rock.x - predator.fish.x, rock.y - predator.fish.y)
      const forwardDistance = toRock.dot(direct)
      if (forwardDistance < -fishRadius || forwardDistance > lookAhead) continue
      const closest = new Phaser.Math.Vector2(predator.fish.x, predator.fish.y)
        .add(direct.clone().scale(Math.max(0, forwardDistance)))
      const clearance = rock.radius + fishRadius + 8
      const lateralDistance = Phaser.Math.Distance.Between(closest.x, closest.y, rock.x, rock.y)
      if (lateralDistance >= clearance) continue
      const score = Math.max(0, forwardDistance) + lateralDistance * 0.18
      if (score < blockingScore) {
        blockingScore = score
        blockingRock = rock
      }
    }

    if (predator.avoidedRock) {
      const previousClearance = predator.avoidedRock.radius + fishRadius + 18
      const previousDistance = Phaser.Math.Distance.Between(predator.fish.x, predator.fish.y, predator.avoidedRock.x, predator.avoidedRock.y)
      const previousDirection = new Phaser.Math.Vector2(predator.avoidedRock.x - predator.fish.x, predator.avoidedRock.y - predator.fish.y)
      if (previousDistance < previousClearance * 1.22 && previousDirection.dot(direct) > -fishRadius) blockingRock = predator.avoidedRock
    }
    if (!blockingRock) {
      predator.avoidedRock = undefined
      return direct
    }

    const radial = new Phaser.Math.Vector2(predator.fish.x - blockingRock.x, predator.fish.y - blockingRock.y)
    const centerDistance = Math.max(1, radial.length())
    radial.scale(1 / centerDistance)
    const tangent = new Phaser.Math.Vector2(-radial.y, radial.x)
    if (!predator.avoidedRock) {
      const clearance = blockingRock.radius + fishRadius + 12
      const scoreSide = (side: number) => {
        const preview = new Phaser.Math.Vector2(predator.fish.x, predator.fish.y)
          .add(tangent.clone().scale(side * clearance * 0.9))
        const boundary = this.worldBoundary()
        const edgeRoom = Math.min(preview.y - boundary, this.worldHeight() - boundary - preview.y)
        return Phaser.Math.Distance.Between(preview.x, preview.y, targetX, targetY) + Math.max(0, 95 - edgeRoom) * 2.5
      }
      predator.avoidanceSide = scoreSide(1) <= scoreSide(-1) ? 1 : -1
    }
    predator.avoidedRock = blockingRock

    const desiredClearance = blockingRock.radius + fishRadius + 10
    const radialError = (centerDistance - desiredClearance) / desiredClearance
    const radialCorrection = Phaser.Math.Clamp(-radialError * 2.8, -0.55, 1.2)
    return tangent.scale(predator.avoidanceSide)
      .add(radial.scale(radialCorrection))
      .add(direct.scale(0.22))
      .normalize()
  }

  private addCurrent(x: number, y: number, width: number, height: number, dx: number, dy: number, strength: number, dangerous = false) {
    const zone = { area: new Phaser.Geom.Rectangle(x, y, width, height), x: dx, y: dy, strength, dangerous }
    this.currents.push(zone)
    const color = dangerous ? 0xff8a72 : 0xc4f7f2
    this.add.rectangle(x + width / 2, y + height / 2, width, height, color, dangerous ? 0.055 : 0.025).setStrokeStyle(2, color, 0.08).setDepth(3)
    const count = this.reducedMotion ? 5 : Math.min(18, Math.floor(width / 80))
    for (let i = 0; i < count; i++) {
      const dot = this.add.circle(x + (i * 113) % width, y + 35 + (i * 79) % Math.max(60, height - 70), 3, color, dangerous ? 0.55 : 0.3).setDepth(4)
      this.currentParticles.push({ dot, zone, offset: i * 33 })
    }
  }

  private addGoal(x: number, y: number, canFinish: () => boolean, blockedHint: string) {
    const glow = this.add.circle(x, y, 78, palettes[this.level].glow, 0.13).setStrokeStyle(5, palettes[this.level].glow, 0.65).setDepth(12)
    this.add.circle(x, y, 42, palettes[this.level].glow, 0.16).setStrokeStyle(2, 0xffffff, 0.42).setDepth(13)
    if (!this.reducedMotion) this.tweens.add({ targets: glow, scale: 1.2, alpha: 0.25, yoyo: true, repeat: -1, duration: 1000 })
    this.physics.add.existing(glow, true)
    this.goals.push({ x, y, radius: 88, canFinish, blockedHint })
  }

  private addSpawnArea(x: number, y: number, label: string, correct: boolean, texture: string) {
    const area = this.add.image(x, y, texture)
      .setDisplaySize(340, 215)
      .setTint(0xb8d3cc)
      .setAlpha(0.7)
      .setDepth(8)
    const maskSource = this.add.image(x, y, texture)
      .setDisplaySize(340, 215)
      .setVisible(false)
    const waterMask = maskSource.createBitmapMask()
    const waterVeil = this.add.image(x, y, 'water-depth-v2')
      .setDisplaySize(430, 270)
      .setAlpha(0.28)
      .setBlendMode(Phaser.BlendModes.SCREEN)
      .setMask(waterMask)
      .setDepth(9)
    if (!this.reducedMotion) {
      this.tweens.add({
        targets: waterVeil,
        x: x + 18,
        y: y - 8,
        duration: 3200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      })
    }
    this.add.text(x, y + 118, label, { fontFamily: 'system-ui', fontSize: '22px', fontStyle: '700', color: '#f4fbeb', backgroundColor: '#123f45cc', padding: { x: 14, y: 8 } }).setOrigin(0.5).setDepth(20)
    this.physics.add.existing(area, true)
    this.spawnAreas.push({ x, y, radius: 152, label, correct })
  }

  private addFishingHooks() {
    const random = new Phaser.Math.RandomDataGenerator([`villaks-fishing-hooks-${this.terrainSeed}`])
    const anchors = [
      { x: 620, y: 202 },
      { x: 1160, y: 998 },
      { x: 1700, y: 202 },
      { x: 2250, y: 998 },
      { x: 2500, y: 202 },
      { x: 3350, y: 998 },
      { x: 3900, y: 202 },
      { x: 4380, y: 998 },
    ]

    anchors.forEach((anchor, index) => {
      const line = this.add.graphics().setDepth(35).setVisible(false)
      const hookPhoto = this.add.image(0, 0, 'fishing-hook-photo')
        .setDisplaySize(58, 104)
        .setTint(index % 2 === 1 ? 0xd2e4df : 0xe2ece8)
      const hook = this.add.container(anchor.x, anchor.y, [hookPhoto])
        .setDepth(39)
        .setVisible(false)
      const hazard: FishingHookHazard = {
        hook,
        line,
        anchorX: anchor.x,
        anchorY: anchor.y,
        radius: 42,
        active: false,
        rotationOffset: 0,
      }
      this.fishingHooks.push(hazard)
      this.time.delayedCall(700 + index * 1050, () => this.castFishingHook(hazard, random))
    })
  }

  private castFishingHook(hazard: FishingHookHazard, random: Phaser.Math.RandomDataGenerator) {
    if (!this.scene.isActive()) return
    const targetX = Phaser.Math.Clamp(hazard.anchorX + random.realInRange(-430, 430), 360, this.worldWidth() - 340)
    const targetY = random.realInRange(330, 870)
    const castDuration = this.reducedMotion ? 360 : random.integerInRange(520, 720)
    hazard.active = false
    hazard.rotationOffset = Phaser.Math.DegToRad(random.realInRange(-10, 10))
    hazard.hook
      .setPosition(hazard.anchorX, hazard.anchorY)
      .setRotation(0)
      .setAlpha(0.96)
      .setVisible(true)
    hazard.line.setVisible(true)

    this.tweens.add({
      targets: hazard.hook,
      x: targetX,
      y: targetY,
      duration: castDuration,
      ease: 'Cubic.out',
      onComplete: () => {
        if (!hazard.hook.active) return
        hazard.active = true
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, hazard.hook.x, hazard.hook.y) < 550) this.playSound('splash')
        const ripple = this.add.ellipse(hazard.hook.x, hazard.hook.y, 42, 18, 0xe4ffff, 0.04)
          .setStrokeStyle(3, 0xd5ffff, 0.62)
          .setDepth(36)
        this.tweens.add({
          targets: ripple,
          scaleX: 2.2,
          scaleY: 2.2,
          alpha: 0,
          duration: this.reducedMotion ? 250 : 620,
          onComplete: () => ripple.destroy(),
        })
        const driftDuration = this.reducedMotion ? 720 : random.integerInRange(1300, 2200)
        this.tweens.add({
          targets: hazard.hook,
          x: Phaser.Math.Clamp(targetX + random.realInRange(-90, 120), 320, this.worldWidth() - 300),
          y: Phaser.Math.Clamp(targetY + random.realInRange(-65, 65), 300, 900),
          duration: driftDuration,
          ease: 'Sine.inOut',
          onComplete: () => this.reelFishingHook(hazard, random),
        })
      },
    })
  }

  private reelFishingHook(hazard: FishingHookHazard, random: Phaser.Math.RandomDataGenerator) {
    if (!hazard.hook.active) return
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, hazard.hook.x, hazard.hook.y) < 480) this.playSound('hook')
    this.tweens.add({
      targets: hazard.hook,
      x: hazard.anchorX,
      y: hazard.anchorY,
      duration: this.reducedMotion ? 520 : random.integerInRange(760, 980),
      ease: 'Sine.in',
      onComplete: () => {
        hazard.active = false
        hazard.hook.setVisible(false)
        hazard.line.clear().setVisible(false)
        const pause = random.integerInRange(1500, 2800)
        this.time.delayedCall(pause, () => this.castFishingHook(hazard, random))
      },
    })
  }

  private updateFishingHooks() {
    for (const hazard of this.fishingHooks) {
      hazard.line.clear()
      if (!hazard.hook.visible) continue
      const toAnchorX = hazard.anchorX - hazard.hook.x
      const toAnchorY = hazard.anchorY - hazard.hook.y
      if (Math.hypot(toAnchorX, toAnchorY) > 2) {
        hazard.hook.rotation = Math.atan2(toAnchorY, toAnchorX) + Math.PI / 2 + hazard.rotationOffset
      }
      hazard.line.lineStyle(2, 0xe8f2ef, 0.62)
      hazard.line.beginPath()
      hazard.line.moveTo(hazard.anchorX, hazard.anchorY)
      const topRingOffset = 49
      const lineEndX = hazard.hook.x + Math.sin(hazard.hook.rotation) * topRingOffset
      const lineEndY = hazard.hook.y - Math.cos(hazard.hook.rotation) * topRingOffset
      hazard.line.lineTo(lineEndX, lineEndY)
      hazard.line.strokePath()
      if (hazard.active && Phaser.Math.Distance.Between(this.player.x, this.player.y, hazard.hook.x, hazard.hook.y) < hazard.radius) {
        this.takeDamage('En fiskekrok traff laksen – hold avstand til krok og snøre')
      }
    }
  }

  private createFishSchool(x: number, y: number, count: number) {
    for (let i = 0; i < count; i++) {
      const fish = this.add.triangle(x + (i % 4) * 45, y + Math.floor(i / 4) * 55, 0, 0, 25, -8, 25, 8, 0x9ed6d4, 0.48).setDepth(18)
      if (!this.reducedMotion) this.tweens.add({ targets: fish, x: fish.x + 180, y: fish.y + Math.sin(i) * 35, yoyo: true, repeat: -1, duration: 2200 + i * 140, ease: 'Sine.inOut' })
    }
  }

  private addDirectionSigns(label: string, x: number, y: number) {
    this.add.text(x, y - 120, `${label}  →`, { fontFamily: 'system-ui', fontSize: '24px', fontStyle: '700', color: '#eafbf0', backgroundColor: '#0b4658bb', padding: { x: 15, y: 10 } }).setOrigin(0.5).setDepth(25)
  }

  private addEndLightGoal(x: number, y: number, canFinish: () => boolean, blockedHint: string) {
    const light = this.add.container(x, y).setDepth(42)
    const atmosphericBloom = this.add.image(54, 0, 'river-end-light-photo')
      .setOrigin(0.92, 0.5)
      .setDisplaySize(790, 940)
      .setAlpha(0.2)
      .setBlendMode(Phaser.BlendModes.ADD)
    const naturalLight = this.add.image(54, 0, 'river-end-light-photo')
      .setOrigin(0.92, 0.5)
      .setDisplaySize(720, 860)
      .setAlpha(0.86)
      .setBlendMode(Phaser.BlendModes.SCREEN)
    light.add([atmosphericBloom, naturalLight])

    if (!this.reducedMotion) {
      this.tweens.add({ targets: atmosphericBloom, scaleX: 1.035, scaleY: 1.015, alpha: 0.28, duration: 3400, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
      this.tweens.add({ targets: naturalLight, alpha: 0.96, duration: 2100, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
    }

    const boundary = this.worldBoundary()
    const triggerWidth = 190
    this.exitZones.push({
      area: new Phaser.Geom.Rectangle(
        this.worldWidth() - triggerWidth,
        boundary,
        triggerWidth,
        this.worldHeight() - boundary * 2,
      ),
      canFinish,
      blockedHint,
    })
  }

  private takeDamage(message: string) {
    if (this.invulnerable > 0 || this.finished || this.evolving) return
    this.lives--
    this.playSound('damage')
    this.invulnerable = 2.2
    this.hint = message
    this.hintTimer = 3.2
    this.cameras.main.flash(this.reducedMotion ? 40 : 170, 235, 92, 70)
    this.player.setAlpha(0.55)
    if (this.lives <= 0) {
      this.killPlayer('Alle liv er tapt – reisen starter på nytt')
      return
    }
    this.emitHud()
  }

  private killPlayer(message: string) {
    if (this.finished) return
    this.lives = 0
    this.finished = true
    this.playerForwardSpeed = 0
    this.playerBody.setVelocity(0, 0)
    this.physics.world.pause()
    gameBus.emit('swimming', { playerSpeed: 0, playerPhase: 0, predatorPresence: 0, predatorPhase: 0 })
    this.hint = message
    this.hintTimer = 4
    this.cameras.main.flash(this.reducedMotion ? 40 : 180, 255, 74, 48)
    this.cameras.main.shake(this.reducedMotion ? 40 : 260, 0.012)
    this.cameras.main.fadeOut(this.reducedMotion ? 140 : 760, 20, 38, 48)
    this.emitHud()
    this.time.delayedCall(this.reducedMotion ? 180 : 820, () => gameBus.emit('gameOver'))
  }

  private finishLevel() {
    if (this.finished) return
    this.finished = true
    this.playerForwardSpeed = 0
    this.playerBody.setVelocity(0, 0)
    this.physics.world.pause()
    gameBus.emit('swimming', { playerSpeed: 0, playerPhase: 0, predatorPresence: 0, predatorPhase: 0 })
    this.cameras.main.fadeOut(this.reducedMotion ? 100 : 720, 15, 58, 65)
    const stars = this.lives === 3 && (this.level === 2 || this.level === 4 || this.foodCount >= FOOD_TARGET) ? 3 : this.lives >= 2 ? 2 : 1
    this.time.delayedCall(this.reducedMotion ? 120 : 760, () => gameBus.emit('complete', { level: this.level, stars, food: this.foodCount, lives: this.lives, elapsed: this.elapsed }))
  }

  private steerAroundRocks(direct: Phaser.Math.Vector2, targetDistance: number) {
    if (direct.lengthSq() === 0 || this.rockObstacles.length === 0) {
      this.avoidedRock = undefined
      return direct
    }

    const baseWidth = this.playerArt.getData('baseWidth') as number
    const baseHeight = this.playerArt.getData('baseHeight') as number
    const fishRadius = this.fishCollisionRadius(baseWidth, baseHeight)
    const lookAhead = Math.max(baseWidth * 2, this.playerForwardSpeed * 1.15)
    const clearanceFor = (rock: RockObstacle) => rock.radius + fishRadius + 3
    const targetInside = (rock: RockObstacle, clearance: number) => (
      Phaser.Math.Distance.Between(this.target.x, this.target.y, rock.x, rock.y) < clearance * 0.9
    )
    const blocksTargetLine = (rock: RockObstacle, clearance: number, limit = targetDistance) => {
      if (targetInside(rock, clearance)) return false
      const offsetX = rock.x - this.player.x
      const offsetY = rock.y - this.player.y
      const projection = offsetX * direct.x + offsetY * direct.y
      if (projection <= 0 || projection >= Math.min(targetDistance, limit)) return false
      const lateralDistance = Math.abs(direct.x * offsetY - direct.y * offsetX)
      return lateralDistance < clearance
    }

    let nearestRock: RockObstacle | undefined
    let nearestProjection = Number.POSITIVE_INFINITY

    // Keep following the same rock only while it still blocks the straight
    // route. The moment that route is clear, the detour is finished.
    if (this.avoidedRock) {
      const activeClearance = clearanceFor(this.avoidedRock)
      if (blocksTargetLine(this.avoidedRock, activeClearance)) nearestRock = this.avoidedRock
    }

    // When no detour is active, select the first rock on the direct route.
    if (!nearestRock) {
      for (const rock of this.rockObstacles) {
        const clearance = clearanceFor(rock)
        if (!blocksTargetLine(rock, clearance, lookAhead)) continue
        const offsetX = rock.x - this.player.x
        const offsetY = rock.y - this.player.y
        const projection = offsetX * direct.x + offsetY * direct.y
        if (projection < nearestProjection) {
          nearestRock = rock
          nearestProjection = projection
        }
      }
    }

    if (!nearestRock) {
      this.avoidedRock = undefined
      return direct
    }

    const clearance = clearanceFor(nearestRock)
    const radial = new Phaser.Math.Vector2(this.player.x - nearestRock.x, this.player.y - nearestRock.y)
    const centerDistance = Math.max(0.001, radial.length())
    radial.scale(1 / centerDistance)
    const leftTangent = new Phaser.Math.Vector2(-radial.y, radial.x)

    if (this.avoidedRock !== nearestRock) {
      const scoreSide = (side: number) => {
        const tangent = leftTangent.clone().scale(side)
        const preview = new Phaser.Math.Vector2(this.player.x, this.player.y).add(tangent.clone().scale(clearance * 0.65))
        const turnCost = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(tangent.y, tangent.x) - this.player.rotation)) * baseWidth * 0.28
        const edgeRoom = Math.min(preview.x, this.worldWidth() - preview.x, preview.y, this.worldHeight() - preview.y)
        const edgePenalty = Math.max(0, 80 - edgeRoom) * 3
        return Phaser.Math.Distance.Between(preview.x, preview.y, this.target.x, this.target.y) + turnCost + edgePenalty
      }
      this.avoidanceSide = scoreSide(1) <= scoreSide(-1) ? 1 : -1
      this.avoidedRock = nearestRock
    }

    // Follow the tangent of the inflated hitbox. Radial correction pulls the
    // fish toward the edge when it is too far away and pushes it out when it
    // gets too close, preventing both wide circles and repeated collisions.
    const radialError = (centerDistance - clearance) / clearance
    const radialCorrection = Phaser.Math.Clamp(-radialError * 2.6, -0.9, 0.9)
    return leftTangent
      .scale(this.avoidanceSide)
      .add(radial.scale(radialCorrection))
      .add(direct.clone().scale(0.1))
      .normalize()
  }

  private emitHud() {
    gameBus.emit('hud', {
      level: this.level,
      lives: this.lives,
      stamina: Math.round(this.stamina),
      food: this.foodCount,
      foodTarget: this.level === 1 || this.level === 2 || this.level === 3 ? FOOD_TARGET : 0,
      hint: this.hint,
      hidden: this.hidden,
    })
  }

  private playSound(effect: SoundEffect) {
    if (this.soundEnabled) gameBus.emit('sound', effect)
  }

  update(_time: number, deltaMs: number) {
    if (!this.player || this.finished || this.gamePaused) return
    const dt = Math.min(deltaMs / 1000, 0.05)
    if (this.waterfallFlow && !this.reducedMotion) {
      this.waterfallPhase += dt
      this.drawWaterfallFlow()
    }
    if (this.evolving || this.waterfallJumping) {
      this.playerBody.setVelocity(0, 0)
      return
    }
    this.elapsed += dt
    this.invulnerable = Math.max(0, this.invulnerable - dt)
    this.collisionSlowdown = Math.max(0, this.collisionSlowdown - dt)
    this.hintTimer -= dt
    if (this.hintTimer <= 0) this.hint = ''
    if (this.updateWaterfallGate()) return
    const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.target.x, this.target.y)
    const desired = new Phaser.Math.Vector2(this.target.x - this.player.x, this.target.y - this.player.y)
    if (distance > 34) desired.normalize()
    else desired.set(0, 0)
    const steeringDirection = this.steerAroundRocks(desired, distance)

    let currentX = 0
    let currentY = 0
    let inStrongCurrent = false
    for (const current of this.currents) {
      if (current.area.contains(this.player.x, this.player.y)) {
        currentX += current.x * current.strength
        currentY += current.y * current.strength
        if (current.strength > 55) inStrongCurrent = true
      }
    }

    this.hidden = this.hidingZones.some((zone) => {
      const margin = this.wasHidden ? 6 : 0
      const dx = (this.player.x - zone.x) / (zone.width * 0.5 + margin)
      const dy = (this.player.y - zone.y) / (zone.height * 0.5 + margin)
      return dx * dx + dy * dy <= 1
    })
    if (this.hidden && !this.wasHidden) this.playSound('hide')
    this.wasHidden = this.hidden
    if (this.intakeHazard) {
      const intake = this.intakeHazard
      const toIntake = new Phaser.Math.Vector2(intake.x - this.player.x, intake.y - this.player.y)
      const intakeDistance = Math.max(1, toIntake.length())
      if (intakeDistance < intake.range) {
        const pulse = 0.5 + Math.sin(this.elapsed * 3.1) * 0.5
        const nearCover = this.rockObstacles.some((rock) =>
          Phaser.Math.Distance.Between(this.player.x, this.player.y, rock.x, rock.y) < rock.radius + 92)
        const shelterFactor = this.hidden ? 0.2 : nearCover ? 0.48 : 1
        const exposure = Math.pow(1 - intakeDistance / intake.range, 1.35)
        const suctionStrength = (62 + pulse * 245) * exposure * shelterFactor
        toIntake.scale(1 / intakeDistance)
        currentX += toIntake.x * suctionStrength
        currentY += toIntake.y * suctionStrength
        inStrongCurrent = true
        this.stamina = Math.max(0, this.stamina - (4 + pulse * 10) * exposure * dt)
        if (pulse > 0.82 && this.hintTimer <= 0 && intakeDistance < 520) {
          this.hint = nearCover || this.hidden
            ? 'Suget er sterkest nå – bli i ly til pulsen avtar'
            : 'Kraftig sugepuls! Søk ly bak steiner eller i sjøgress'
          this.hintTimer = 2.2
        }
      }
    }
    const visibilityTarget = this.hidden ? 0.4 : this.invulnerable > 0 ? 0.55 : 1
    const visibilitySmooth = 1 - Math.pow(0.0004, dt)
    this.player.setAlpha(Phaser.Math.Linear(this.player.alpha, visibilityTarget, visibilitySmooth))
    const isSwimming = desired.lengthSq() > 0
    const currentResistance = isSwimming ? Math.max(0, -(desired.x * currentX + desired.y * currentY)) : 0
    if (this.hidden) {
      this.stamina = Math.min(100, this.stamina + 26 * dt)
      if (!this.hint && this.level !== 4) { this.hint = 'Skjulested – rovfisken ser deg dårligere her'; this.hintTimer = 1.4 }
    } else if (isSwimming) {
      const effort = 2.5 + currentResistance * (inStrongCurrent ? 0.08 : 0.04)
      this.stamina = Math.max(0, this.stamina - effort * dt)
    } else {
      this.stamina = Math.min(100, this.stamina + 18 * dt)
    }

    const baseSpeed = this.level === 1 ? 185 : 205
    const tiredFactor = Phaser.Math.Linear(0.58, 1, Phaser.Math.Clamp(this.stamina / 35, 0, 1))
    const arrivalFactor = desired.lengthSq() > 0 ? Phaser.Math.Clamp((distance - 34) / 120, 0.28, 1) : 0
    const forwardSpeedTarget = baseSpeed * tiredFactor * arrivalFactor
    const accelerationSmooth = 1 - Math.pow(0.0025, dt)
    this.playerForwardSpeed = Phaser.Math.Linear(this.playerForwardSpeed, forwardSpeedTarget, accelerationSmooth)

    let turnDelta = 0
    let angularSpeed = 0
    if (steeringDirection.lengthSq() > 0 && this.playerForwardSpeed > 3) {
      const targetRotation = Math.atan2(steeringDirection.y, steeringDirection.x)
      turnDelta = Phaser.Math.Angle.Wrap(targetRotation - this.player.rotation)
      const previousRotation = this.player.rotation
      const baseWidth = this.playerArt.getData('baseWidth') as number
      const minimumTurnRadius = baseWidth * 0.62
      const maximumTurnStep = (this.playerForwardSpeed / minimumTurnRadius) * dt
      const nextRotation = Phaser.Math.Angle.RotateTo(previousRotation, targetRotation, maximumTurnStep)
      angularSpeed = Math.abs(Phaser.Math.Angle.Wrap(nextRotation - previousRotation)) / Math.max(dt, 0.001)
      this.player.rotation = nextRotation
    }
    const forwardX = Math.cos(this.player.rotation)
    const forwardY = Math.sin(this.player.rotation)
    this.playerBody.setVelocity(
      forwardX * this.playerForwardSpeed + currentX,
      forwardY * this.playerForwardSpeed + currentY,
    )

    const speed = this.playerBody.velocity.length()
    const playerHeightScale = (this.playerArt.getData('baseHeight') as number) / 72
    this.playerSwimPhase += dt * (4.2 + speed / 32)
    const amplitudeTarget = this.reducedMotion ? 0 : Math.min(13, 1.6 + speed * 0.05) * playerHeightScale
    const animationSmooth = 1 - Math.pow(0.018, dt)
    this.playerSwimAmplitude = Phaser.Math.Linear(this.playerSwimAmplitude, amplitudeTarget, animationSmooth)
    const maxFrontBend = 15 * playerHeightScale
    const turnBendTarget = this.reducedMotion ? 0 : this.turnBendFromRadius(turnDelta, speed, angularSpeed, maxFrontBend)
    const turnSmooth = 1 - Math.pow(0.0008, dt)
    this.playerTurnBend = Phaser.Math.Linear(this.playerTurnBend, turnBendTarget, turnSmooth)
    this.animateFishRig(this.playerArt, this.playerSwimPhase, this.playerSwimAmplitude, this.playerTurnBend)

    this.updatePredators(dt)
    this.swimmingSoundTimer -= dt
    if (this.swimmingSoundTimer <= 0) {
      this.swimmingSoundTimer = 0.085
      this.emitSwimmingSound()
    }
    this.updateCurrentParticles(dt)
    this.updateFishingHooks()
    this.updateWake(dt, speed)
    this.updateInteractions()

    this.hudTimer -= dt
    if (this.hudTimer <= 0) { this.hudTimer = 0.12; this.emitHud() }
  }

  private emitSwimmingSound() {
    if (!this.soundEnabled) return
    let predatorPresence = 0
    let predatorPhase = 0
    for (const predator of this.predators) {
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, predator.fish.x, predator.fish.y)
      const audibleRange = predator.kind === 'seal' ? 1180 : 650
      const proximity = Math.max(0, 1 - distance / audibleRange)
      const movement = Math.min(1, predator.forwardSpeed / (predator.kind === 'seal' ? 220 : 160))
      const presence = proximity * proximity * movement * (predator.kind === 'seal' ? 1.2 : 1)
      if (presence > predatorPresence) {
        predatorPresence = presence
        predatorPhase = predator.swimPhase
      }
    }
    gameBus.emit('swimming', {
      playerSpeed: this.playerForwardSpeed,
      playerPhase: this.playerSwimPhase,
      predatorPresence,
      predatorPhase,
    })
  }

  private updatePredators(dt: number) {
    for (const predator of this.predators) {
      const body = predator.fish.body as Phaser.Physics.Arcade.Body
      const movedDistance = Phaser.Math.Distance.Between(predator.fish.x, predator.fish.y, predator.lastX, predator.lastY)
      const minimumExpectedMovement = Math.max(0.18, predator.forwardSpeed * dt * 0.12)
      if (predator.forwardSpeed > 34 && movedDistance < minimumExpectedMovement) predator.stuckTimer += dt
      else {
        predator.stuckTimer = Math.max(0, predator.stuckTimer - dt * 2.5)
        if (movedDistance > minimumExpectedMovement * 4) predator.recoveryAttempts = 0
      }
      predator.lastX = predator.fish.x
      predator.lastY = predator.fish.y
      predator.escapeTimer = Math.max(0, predator.escapeTimer - dt)
      predator.burstTimer = Math.max(0, predator.burstTimer - dt)
      predator.burstCooldown = Math.max(0, predator.burstCooldown - dt)
      if (predator.stuckTimer > 0.42) {
        let nearestRock: RockObstacle | undefined
        let nearestDistance = Number.POSITIVE_INFINITY
        for (const rock of this.predatorObstacles()) {
          const rockDistance = Phaser.Math.Distance.Between(predator.fish.x, predator.fish.y, rock.x, rock.y) - rock.radius
          if (rockDistance < nearestDistance) { nearestDistance = rockDistance; nearestRock = rock }
        }
        predator.avoidedRock = nearestRock
        predator.avoidanceSide *= -1
        predator.escapeTimer = 1.05
        predator.stuckTimer = 0
        predator.recoveryAttempts++
        if (predator.recoveryAttempts >= 2) {
          const escapeDirection = nearestRock
            ? new Phaser.Math.Vector2(predator.fish.x - nearestRock.x, predator.fish.y - nearestRock.y)
            : new Phaser.Math.Vector2(Math.cos(predator.fish.rotation), Math.sin(predator.fish.rotation))
          if (escapeDirection.lengthSq() < 0.001) escapeDirection.set(0, 1)
          escapeDirection.normalize()
          const tangent = new Phaser.Math.Vector2(-escapeDirection.y, escapeDirection.x).scale(predator.avoidanceSide * 76)
          const recoveryPoint = this.clearPredatorPoint(
            predator.fish.x + escapeDirection.x * 118 + tangent.x,
            predator.fish.y + escapeDirection.y * 118 + tangent.y,
            82,
          )
          body.reset(recoveryPoint.x, recoveryPoint.y)
          predator.lastX = recoveryPoint.x
          predator.lastY = recoveryPoint.y
          if (predator.path.length > 1) predator.pathIndex = (predator.pathIndex + 1) % predator.path.length
          predator.recoveryAttempts = 0
        }
      }

      const distance = Phaser.Math.Distance.Between(predator.fish.x, predator.fish.y, this.player.x, this.player.y)
      const previousState = predator.state
      const chaseRadius = predator.kind === 'seal' ? 1050 : this.level === 2 ? 340 : this.level === 3 ? 360 : 250
      const disengageRadius = predator.kind === 'seal' ? 1280 : 480
      predator.state = !this.hidden && distance < chaseRadius ? 'chase' : distance > disengageRadius || this.hidden ? 'patrol' : predator.state
      if (previousState === 'chase' && predator.state === 'patrol' && predator.path.length > 0) {
        let nearestIndex = 0
        let nearestDistance = Number.POSITIVE_INFINITY
        predator.path.forEach((point, index) => {
          const pointDistance = Phaser.Math.Distance.Between(predator.fish.x, predator.fish.y, point.x, point.y)
          if (pointDistance < nearestDistance) { nearestDistance = pointDistance; nearestIndex = index }
        })
        predator.pathIndex = nearestIndex
      }
      let targetX: number
      let targetY: number
      let speed: number
      if (predator.state === 'chase') {
        targetX = this.player.x
        targetY = this.player.y
        if (predator.kind === 'seal') {
          if (predator.burstTimer <= 0 && predator.burstCooldown <= 0 && distance < 520) {
            predator.burstTimer = 0.92
            predator.burstCooldown = 2.55
          }
          speed = predator.burstTimer > 0 ? 355 : 178
        } else {
          speed = this.level === 2 ? 168 : this.level === 3 ? 152 : 135
        }
      } else if (predator.path.length > 0) {
        let waypoint = predator.path[predator.pathIndex]
        if (Phaser.Math.Distance.Between(predator.fish.x, predator.fish.y, waypoint.x, waypoint.y) < 90) {
          predator.pathIndex = (predator.pathIndex + 1) % predator.path.length
          waypoint = predator.path[predator.pathIndex]
        }
        targetX = waypoint.x
        targetY = waypoint.y
        speed = this.level === 2 ? 84 : 72
      } else {
        predator.phase += dt * (predator.kind === 'seal' ? 0.46 : 0.65)
        targetX = predator.homeX + Math.cos(predator.phase) * (predator.kind === 'seal' ? 470 : 180)
        targetY = predator.homeY + Math.sin(predator.phase * (predator.kind === 'seal' ? 0.9 : 1.4)) * (predator.kind === 'seal' ? 350 : 130)
        speed = predator.kind === 'seal' ? 112 : 65
      }
      const steeringDirection = this.steerPredatorAroundRocks(predator, targetX, targetY)
      const angle = Math.atan2(steeringDirection.y, steeringDirection.x)
      const turnDelta = Phaser.Math.Angle.Wrap(angle - predator.fish.rotation)
      const previousRotation = predator.fish.rotation
      const speedSmooth = 1 - Math.pow(0.018, dt)
      predator.forwardSpeed = Phaser.Math.Linear(predator.forwardSpeed, speed, speedSmooth)
      const predatorWidth = predator.art.getData('baseWidth') as number
      const minimumTurnRadius = predatorWidth * (predator.escapeTimer > 0 ? 0.34 : predator.kind === 'seal' ? 0.62 : 0.72)
      const maximumTurnStep = (predator.forwardSpeed / minimumTurnRadius) * dt
      const nextRotation = Phaser.Math.Angle.RotateTo(previousRotation, angle, maximumTurnStep)
      const angularSpeed = Math.abs(Phaser.Math.Angle.Wrap(nextRotation - previousRotation)) / Math.max(dt, 0.001)
      predator.fish.rotation = nextRotation
      const velocityDirection = new Phaser.Math.Vector2(Math.cos(nextRotation), Math.sin(nextRotation))
      if (predator.escapeTimer > 0 && predator.avoidedRock) {
        velocityDirection.add(new Phaser.Math.Vector2(
          predator.fish.x - predator.avoidedRock.x,
          predator.fish.y - predator.avoidedRock.y,
        ).normalize().scale(0.62)).normalize()
      }
      body.setVelocity(velocityDirection.x * predator.forwardSpeed, velocityDirection.y * predator.forwardSpeed)
      predator.swimPhase += dt * (predator.kind === 'seal'
        ? 3.1 + predator.forwardSpeed / 115
        : 4.8 + predator.forwardSpeed / 35)
      if (predator.kind === 'seal') {
        const baseScaleX = predator.art.getData('baseScaleX') as number
        const baseScaleY = predator.art.getData('baseScaleY') as number
        const kick = Math.sin(predator.swimPhase)
        const sealHeightScale = (predator.art.getData('baseHeight') as number) / 202
        const gliding = Math.abs(kick) < 0.3
        const amplitudeTarget = this.reducedMotion ? 0 : Math.min(25, 8 + predator.forwardSpeed * 0.038) * sealHeightScale
        const animationSmooth = 1 - Math.pow(0.025, dt)
        predator.swimAmplitude = Phaser.Math.Linear(predator.swimAmplitude, amplitudeTarget, animationSmooth)
        const turnBendTarget = this.reducedMotion ? 0 : this.turnBendFromRadius(turnDelta, predator.forwardSpeed, angularSpeed, 26 * sealHeightScale)
        predator.turnBend = Phaser.Math.Linear(predator.turnBend, turnBendTarget, animationSmooth)
        this.animateSealRig(predator.art, predator.swimPhase, predator.swimAmplitude, predator.turnBend)
        predator.art.setScale(
          baseScaleX * (gliding ? 1.006 : 0.997 + Math.abs(kick) * 0.006),
          baseScaleY * (gliding ? 0.995 : 1.004 - Math.abs(kick) * 0.006),
        )
        predator.art.rotation = this.reducedMotion ? 0 : kick * 0.006
      } else {
        const predatorHeightScale = (predator.art.getData('baseHeight') as number) / 93
        const amplitudeTarget = this.reducedMotion ? 0 : Math.min(13, 3 + predator.forwardSpeed * 0.05) * predatorHeightScale
        const animationSmooth = 1 - Math.pow(0.018, dt)
        predator.swimAmplitude = Phaser.Math.Linear(predator.swimAmplitude, amplitudeTarget, animationSmooth)
        const turnBendTarget = this.reducedMotion ? 0 : this.turnBendFromRadius(turnDelta, predator.forwardSpeed, angularSpeed, 14 * predatorHeightScale)
        const turnSmooth = 1 - Math.pow(0.0008, dt)
        predator.turnBend = Phaser.Math.Linear(predator.turnBend, turnBendTarget, turnSmooth)
        this.animateFishRig(predator.art, predator.swimPhase, predator.swimAmplitude, predator.turnBend)
      }
      if (distance < (predator.kind === 'seal' ? 128 : 62)) this.takeDamage(predator.fish.getData('damageHint') as string)
    }
  }

  private updateInteractions() {
    if (this.intakeHazard?.dangerArea.contains(this.player.x, this.player.y)) {
      this.killPlayer('Laksen ble sugd inn i kraftverksinntaket – reisen starter på nytt')
      return
    }
    for (const item of this.foodItems) {
      if (item.active && Phaser.Math.Distance.Between(this.player.x, this.player.y, item.x, item.y) < 55) this.collectFood(item)
    }
    for (const danger of this.dangerZones) {
      if (danger.area.contains(this.player.x, this.player.y)) this.takeDamage(danger.hint)
    }
    for (const goal of this.goals) {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, goal.x, goal.y) < goal.radius) {
        if (goal.canFinish()) this.finishLevel()
        else if (this.hintTimer <= 0) { this.hint = goal.blockedHint; this.hintTimer = 3 }
      }
    }
    for (const exit of this.exitZones) {
      if (!exit.area.contains(this.player.x, this.player.y)) continue
      if (exit.canFinish()) this.finishLevel()
      else if (this.hintTimer <= 0) { this.hint = exit.blockedHint; this.hintTimer = 3 }
    }
    for (const area of this.spawnAreas) {
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, area.x, area.y) < area.radius) {
        if (area.correct) this.finishLevel()
        else if (this.hintTimer <= 0) {
          this.hint = area.label === 'Bløt mudderbunn' ? 'Her kan rognen synke ned – se etter ren grus' : 'Her er vannet for stille – prøv området med frisk strøm'
          this.hintTimer = 3.5
        }
      }
    }
  }

  private updateCurrentParticles(dt: number) {
    for (const particle of this.currentParticles) {
      particle.dot.x += particle.zone.x * particle.zone.strength * dt * 1.6
      particle.dot.y += particle.zone.y * particle.zone.strength * dt * 1.6
      const rect = particle.zone.area
      if (particle.dot.x < rect.left) particle.dot.x = rect.right
      if (particle.dot.x > rect.right) particle.dot.x = rect.left
      if (particle.dot.y < rect.top) particle.dot.y = rect.bottom
      if (particle.dot.y > rect.bottom) particle.dot.y = rect.top
    }
  }

  private updateWake(dt: number, speed: number) {
    if (this.reducedMotion || speed < 100) return
    this.trailTimer -= dt
    if (this.trailTimer > 0) return
    this.trailTimer = 0.12
    const dot = this.add.circle(this.player.x - Math.cos(this.player.rotation) * 48, this.player.y - Math.sin(this.player.rotation) * 48, 4, 0xd6fffb, 0.42).setDepth(28)
    this.wake.push(dot)
    this.tweens.add({ targets: dot, scale: 2.4, alpha: 0, duration: 480, onComplete: () => { dot.destroy(); this.wake = this.wake.filter((item) => item !== dot) } })
  }
}
