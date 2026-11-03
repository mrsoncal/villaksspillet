export type LevelId = 1 | 2 | 3 | 4

export type HudState = {
  level: LevelId
  lives: number
  stamina: number
  food: number
  foodTarget: number
  hint: string
  hidden: boolean
}

export type GameResult = {
  level: LevelId
  stars: number
  food: number
  lives: number
  elapsed: number
}

export type Preferences = {
  sound: boolean
  reducedMotion: boolean
}
