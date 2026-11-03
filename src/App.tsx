import { useEffect, useRef, useState } from 'react'
import { gameBus } from './game/EventBus'
import { SalmonGame } from './game/SalmonGame'
import type { GameResult, HudState, LevelId, Preferences } from './types'
import { Soundscape, type AmbienceMode, type SoundEffect } from './audio/Soundscape'
import salmonParrArt from './assets/salmon-stage-1-parr-v3.png'
import salmonSmoltArt from './assets/salmon-stage-2-smolt-v3.png'
import salmonOceanArt from './assets/salmon-stage-3-ocean-v3.png'
import salmonSpawningArt from './assets/salmon-stage-4-spawning-v3.png'

type Screen = 'menu' | 'intro' | 'playing' | 'death' | 'result' | 'victory'
type HighScores = { bestTime: number | null; bestStars: number | null }
const HIGH_SCORES_KEY = 'villaks-high-scores-v1'

const LEVELS = {
  1: {
    eyebrow: 'Nivå 1 · Livet i elva',
    title: 'En liten laks i en stor elv',
    body: 'Du er en liten lakseunge i Mandalselva. Finn mat, oppdag skjul og unngå ørreten.',
    goal: 'Samle 8 næringsdyr og svøm til det lysende målet.',
    fact: 'Ung laks lever i ferskvann i flere år før den blir smolt og vandrer mot havet.',
  },
  2: {
    eyebrow: 'Nivå 2 · Veien mot havet',
    title: 'Følg elva mot sjøen',
    body: 'Som sølvblank smolt må du finne mat og passere to aggressive rovfiskterritorier mens et kraftverksinntak trekker deg inn med pulserende sugestøt.',
    goal: 'Samle 8 næringsdyr, bruk terrenget som ly og svøm inn i lyset.',
    fact: 'Kalking og miljøtiltak for fiskevandring har vært viktige for å hjelpe laksen tilbake i Mandalselva.',
  },
  3: {
    eyebrow: 'Nivå 3 · Det store blå',
    title: 'Voks deg sterk i havet',
    body: 'I det enorme Nordøst-Atlanteren kan du utforske fritt i alle retninger. Samle krill, men pass på de tre torskene og de to jaktende selene.',
    goal: 'Samle 8 næringsdyr og finn signalet som kaller deg hjem.',
    fact: 'Villaksen tilbringer vanligvis ett eller flere år i havet og vokser raskt.',
  },
  4: {
    eyebrow: 'Nivå 4 · Reisen hjem',
    title: 'Tilbake til Mandalselva',
    body: 'Den lange hjemvandringen går mot sterk strøm, gjennom stein og sjøgress og forbi mange fiskekroker. En steinvegg og en liten foss sperrer veien til gyteområdene.',
    goal: 'Ta fart og hopp opp fossen. Undersøk så gyteområdene og finn ren grus med friskt vann. Du spiser ikke under denne vandringen.',
    fact: 'Villaksen finner vanligvis tilbake til elva den kom fra. Noen kan overleve gytingen og komme tilbake igjen.',
  },
} satisfies Record<LevelId, { eyebrow: string; title: string; body: string; goal: string; fact: string }>

const SALMON_STAGE_ART: Record<LevelId, string> = {
  1: salmonParrArt,
  2: salmonSmoltArt,
  3: salmonOceanArt,
  4: salmonSpawningArt,
}

const defaultPreferences: Preferences = {
  sound: true,
  reducedMotion: false,
}

function loadPreferences(): Preferences {
  try {
    const stored = localStorage.getItem('villaks-preferences-v1') || localStorage.getItem('villaks-save-v1') || ''
    const parsed = JSON.parse(stored) as Partial<Preferences>
    return {
      sound: typeof parsed.sound === 'boolean' ? parsed.sound : true,
      reducedMotion: typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : false,
    }
  } catch {
    return defaultPreferences
  }
}

function savePreferences(preferences: Preferences) {
  localStorage.setItem('villaks-preferences-v1', JSON.stringify(preferences))
}

function loadHighScores(): HighScores {
  try {
    const stored = JSON.parse(localStorage.getItem(HIGH_SCORES_KEY) || '{}') as Partial<HighScores>
    return {
      bestTime: typeof stored.bestTime === 'number' && Number.isFinite(stored.bestTime) && stored.bestTime > 0 ? stored.bestTime : null,
      bestStars: typeof stored.bestStars === 'number' && Number.isInteger(stored.bestStars) && stored.bestStars >= 0 && stored.bestStars <= 12 ? stored.bestStars : null,
    }
  } catch {
    return { bestTime: null, bestStars: null }
  }
}

function secondsLabel(seconds: number) {
  const min = Math.floor(seconds / 60)
  return `${min}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

function App() {
  const [preferences, setPreferences] = useState<Preferences>(() => loadPreferences())
  const qaLevelValue = import.meta.env.DEV ? Number(new URLSearchParams(window.location.search).get('qaLevel')) : 0
  const qaLevel = ([1, 2, 3, 4] as number[]).includes(qaLevelValue) ? qaLevelValue as LevelId : undefined
  const [screen, setScreen] = useState<Screen>(qaLevel ? 'playing' : 'menu')
  const [level, setLevel] = useState<LevelId>(qaLevel ?? 1)
  const [paused, setPaused] = useState(false)
  const [result, setResult] = useState<GameResult | null>(null)
  const [runResults, setRunResults] = useState<GameResult[]>([])
  const [highScores, setHighScores] = useState<HighScores>(loadHighScores)
  const [hud, setHud] = useState<HudState>({ level: qaLevel ?? 1, lives: 3, stamina: 100, food: 0, foodTarget: qaLevel === 4 ? 0 : 8, hint: 'Trykk i vannet for å svømme', hidden: false })
  const soundscapeRef = useRef<Soundscape | null>(null)
  const totalTime = runResults.reduce((sum, levelResult) => sum + levelResult.elapsed, 0)
  const totalStars = runResults.reduce((sum, levelResult) => sum + levelResult.stars, 0)

  const updatePreferences = (patch: Partial<Preferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch }
      savePreferences(next)
      return next
    })
  }

  const sound = (effect: SoundEffect) => {
    if (!soundscapeRef.current) soundscapeRef.current = new Soundscape()
    soundscapeRef.current.setEnabled(preferences.sound)
    soundscapeRef.current.unlock()
    soundscapeRef.current.play(effect)
  }

  useEffect(() => gameBus.on('hud', setHud), [])
  useEffect(() => gameBus.on('sound', (effect) => sound(effect)), [preferences.sound])
  useEffect(() => gameBus.on('swimming', (movement) => soundscapeRef.current?.setSwimming(movement)), [])
  useEffect(() => gameBus.on('complete', (nextResult) => {
    setResult(nextResult)
    setRunResults((current) => [...current.filter((levelResult) => levelResult.level < nextResult.level), nextResult])
    setPaused(false)
    setScreen('result')
    sound('complete')
  }), [preferences.sound])

  useEffect(() => gameBus.on('gameOver', () => {
    setLevel(1)
    setResult(null)
    setPaused(false)
    setRunResults([])
    setScreen('death')
    sound('death')
  }), [preferences.sound])

  useEffect(() => {
    if (!soundscapeRef.current) soundscapeRef.current = new Soundscape()
    const soundscape = soundscapeRef.current
    soundscape.setEnabled(preferences.sound)
    const ambience: AmbienceMode = screen === 'death'
      ? 'danger'
      : screen === 'result' || screen === 'victory'
        ? 'quiet'
        : level === 3
          ? 'ocean'
          : screen === 'menu'
            ? 'menu'
            : 'river'
    soundscape.setAmbience(ambience)
  }, [screen, level, preferences.sound])

  useEffect(() => () => soundscapeRef.current?.dispose(), [])

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && screen === 'playing' && !paused) {
        setPaused(true)
        gameBus.emit('pause')
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [screen, paused])

  useEffect(() => {
    if (screen === 'playing') gameBus.emit(paused ? 'pause' : 'resume')
  }, [paused, screen])

  useEffect(() => {
    if (screen !== 'playing' || paused) soundscapeRef.current?.stopSwimming()
  }, [screen, paused])

  const startLevel = (id: LevelId) => {
    if (id === 1) setRunResults([])
    setLevel(id)
    setResult(null)
    setPaused(false)
    setScreen('intro')
    sound('start')
  }

  const launchLevel = () => {
    setScreen('playing')
    sound('tap')
  }

  const continueAfterResult = () => {
    if (!result) return
    if (result.level !== 4) {
      startLevel((result.level + 1) as LevelId)
      return
    }
    if ([1, 2, 3, 4].every((id, index) => runResults[index]?.level === id)) {
      const nextHighScores: HighScores = {
        bestTime: highScores.bestTime === null ? totalTime : Math.min(highScores.bestTime, totalTime),
        bestStars: highScores.bestStars === null ? totalStars : Math.max(highScores.bestStars, totalStars),
      }
      setHighScores(nextHighScores)
      try { localStorage.setItem(HIGH_SCORES_KEY, JSON.stringify(nextHighScores)) } catch { /* private browsing can block storage */ }
    }
    setScreen('victory')
  }

  const pauseGame = () => {
    setPaused(true)
    sound('tap')
  }

  const resumeGame = () => {
    setPaused(false)
    sound('tap')
  }

  const levelData = LEVELS[level]

  return (
    <main className={`app ${preferences.reducedMotion ? 'reduced-motion' : ''}`}>
      <div className="screen-transition-veil" key={`${screen}-${level}`} aria-hidden="true" />
      {screen === 'menu' && (
        <section className="menu-screen water-bg">
          <RiverBackdrop />
          <div className="menu-card glass-panel">
            <p className="kicker">Et lite eventyr fra Mandalselva</p>
            <h1>Villaks<br /><em>Reisen hjem</em></h1>
            <p className="subtitle">Fra elva til havet – og tilbake</p>
            <div className="menu-actions">
              <button className="primary-button" onClick={() => startLevel(1)}><span>Start spillet</span><b aria-hidden="true">→</b></button>
            </div>
          </div>
        </section>
      )}

      {screen === 'intro' && (
        <section className={`intro-screen level-theme-${level}`}>
          <div className="level-art"><img className="stage-fish" src={SALMON_STAGE_ART[level]} alt="" /><i /><i /><i /></div>
          <div className="intro-card glass-panel">
            <p className="kicker">{levelData.eyebrow}</p>
            <h2>{levelData.title}</h2>
            <p>{levelData.body}</p>
            <div className="goal-box"><span aria-hidden="true">◎</span><div><small>Målet ditt</small><strong>{levelData.goal}</strong></div></div>
            <button className="primary-button" onClick={launchLevel}><span>Start nivået</span><b>→</b></button>
            <button className="quiet-button" onClick={() => setScreen('menu')}>Til hovedmenyen</button>
          </div>
        </section>
      )}

      {screen === 'playing' && (
        <section className="game-screen">
          <SalmonGame level={level} reducedMotion={preferences.reducedMotion} sound={preferences.sound} />
          <GameHud hud={hud} paused={paused} onPause={paused ? resumeGame : pauseGame} />
          {paused && (
            <div className="pause-shade">
              <div className="pause-card glass-panel">
                <p className="kicker">Eventyret venter</p>
                <h2>Pause</h2>
                <button className="primary-button" onClick={resumeGame}>Fortsett</button>
                <button className="secondary-button" onClick={() => updatePreferences({ sound: !preferences.sound })}>Lyd: {preferences.sound ? 'på' : 'av'}</button>
                <button className="quiet-button" onClick={() => { setPaused(false); setScreen('menu') }}>Til hovedmenyen</button>
              </div>
            </div>
          )}
        </section>
      )}

      {screen === 'death' && <GameOverScreen onRestart={() => startLevel(1)} onMenu={() => setScreen('menu')} />}

      {screen === 'result' && result && (
        <ModalPage title="Nivå fullført!" eyebrow={LEVELS[result.level].eyebrow} className="result-page">
          <div className="stars" role="img" aria-label={`${result.stars} av 3 stjerner`}>{[1, 2, 3].map((star) => <span className={star <= result.stars ? 'earned' : ''} style={{ '--star-index': star } as React.CSSProperties} key={star} aria-hidden="true">★</span>)}</div>
          <p className="celebrate">{result.stars === 3 ? 'For en svømmetur!' : 'Godt jobbet – reisen fortsetter!'}</p>
          <div className="result-stats"><span><small>Liv igjen</small><b>{result.lives}/3</b></span><span><small>Tid</small><b>{secondsLabel(result.elapsed)}</b></span></div>
          <div className="fact-card"><span aria-hidden="true">✦</span><div><small>Visste du at?</small><p>{LEVELS[result.level].fact}</p></div></div>
          <button className="primary-button compact" onClick={continueAfterResult}>{result.level === 4 ? 'Se avslutningen' : 'Neste nivå'} <b>→</b></button>
        </ModalPage>
      )}

      {screen === 'victory' && (
        <section className="victory-screen water-bg">
          <RiverBackdrop />
          <div className="victory-card glass-panel">
            <div className="roe" aria-hidden="true">● · ● · ●<br />· ● · ● ·</div>
            <p className="kicker">Reisen er fullført</p>
            <h2>Du fant veien hjem!</h2>
            <p>Etter en lang reise har villaksen kommet tilbake til Mandalselva. En ny generasjon kan nå vokse opp mellom grussteinene.</p>
            <div className="victory-stats" aria-label="Resultater for reisen">
              <span><b>{secondsLabel(totalTime)}</b><small>Tid denne reisen</small></span>
              <span><b>{totalStars}<em>/12</em></b><small>Stjerner totalt</small></span>
            </div>
            <div className="victory-records">
              <p className="kicker">Personlige rekorder</p>
              <div><span><small>Beste tid</small><strong>{highScores.bestTime === null ? '–' : secondsLabel(highScores.bestTime)}</strong></span><span><small>Flest stjerner</small><strong>{highScores.bestStars === null ? '–' : `${highScores.bestStars}/12`}</strong></span></div>
            </div>
            <button className="primary-button" onClick={() => startLevel(1)}><span>Spill igjen</span><b aria-hidden="true">↻</b></button>
            <button className="quiet-button" onClick={() => setScreen('menu')}>Til hovedmenyen</button>
          </div>
        </section>
      )}
    </main>
  )
}

function RiverBackdrop() {
  return <div className="river-backdrop" aria-hidden="true">
    <div className="river-garden">
      <div className="river-root" />
      {Array.from({ length: 11 }, (_, i) => <span className="river-reed" key={i} style={{ '--reed': i } as React.CSSProperties} />)}
      {Array.from({ length: 7 }, (_, i) => <b className="river-stone" key={i} style={{ '--stone': i } as React.CSSProperties} />)}
    </div>
    <div className="sun-channel"><div className="sun-disc" />{Array.from({ length: 5 }, (_, i) => <span key={i} />)}</div>
    <div className="depth-orb depth-orb-a" /><div className="depth-orb depth-orb-b" />
    <div className="menu-fish"><img src={salmonOceanArt} alt="" /></div>
    {Array.from({ length: 24 }, (_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}
    {Array.from({ length: 12 }, (_, i) => <b className="menu-bubble" key={i} style={{ '--bubble': i } as React.CSSProperties} />)}
  </div>
}

function GameOverScreen({ onRestart, onMenu }: { onRestart: () => void; onMenu: () => void }) {
  return <section className="transition-screen death-transition" aria-live="assertive">
    <div className="death-current" aria-hidden="true"><i /><i /><i /><i /></div>
    <div className="transition-fish sinking-fish" aria-hidden="true"><img src={salmonParrArt} alt="" /></div>
    <div className="game-over-card glass-panel">
      <p className="kicker">Reisen tok slutt</p>
    <div className="game-over-hearts" aria-label="Ingen liv igjen" role="img">
      {[1, 2, 3].map((heart) => <svg key={heart} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.2 10.6 20C5.3 15.2 2 12.2 2 8.5A5.5 5.5 0 0 1 7.5 3c1.8 0 3.4.8 4.5 2.1A5.9 5.9 0 0 1 16.5 3 5.5 5.5 0 0 1 22 8.5c0 3.7-3.3 6.7-8.6 11.5L12 21.2Z" /></svg>)}
    </div>
      <h2>Spillet er over</h2>
      <p>Villaksen fikk ikke fullført reisen denne gangen. Prøv igjen fra starten.</p>
      <button className="primary-button" onClick={onRestart}><span>Start en ny reise</span><b aria-hidden="true">↻</b></button>
      <button className="quiet-button" onClick={onMenu}>Til hovedmenyen</button>
    </div>
  </section>
}

function ModalPage({ title, eyebrow, onBack, className, children }: { title: string; eyebrow?: string; onBack?: () => void; className?: string; children: React.ReactNode }) {
  return <section className={`modal-page water-bg ${className ?? ''}`}><div className="modal-card glass-panel">{onBack && <button className="back-button" aria-label="Tilbake" onClick={onBack}>←</button>}{eyebrow && <p className="kicker">{eyebrow}</p>}<h2>{title}</h2>{children}</div></section>
}

function GameHud({ hud, paused, onPause }: { hud: HudState; paused: boolean; onPause: () => void }) {
  const foodRemaining = Math.max(0, hud.foodTarget - hud.food)
  return <div className="hud" aria-live="polite">
    <div className={`hiding-vignette ${hud.hidden ? 'active' : ''}`} aria-hidden="true" />
    <div className="hud-top">
      <div className="meter-card life-meter"><div><small>Liv</small><div className="hearts" role="img" aria-label={`${hud.lives} av 3 liv igjen`}>{[1, 2, 3].map((heart) => <span className={heart <= hud.lives ? 'full' : ''} key={heart} aria-hidden="true">{heart <= hud.lives ? '♥' : '♡'}</span>)}</div></div></div>
      <div className="meter-card stamina-meter"><span className="meter-icon" aria-hidden="true">◒</span><div><small>Utholdenhet</small><div className="stamina-status"><div className="bar" role="progressbar" aria-label="Utholdenhet" aria-valuemin={0} aria-valuemax={100} aria-valuenow={hud.stamina}><i style={{ width: `${hud.stamina}%` }} /></div><b>{hud.stamina}%</b></div></div></div>
      <div className="meter-card food-meter"><span className="meter-icon" aria-hidden="true">✦</span><div><small>Mat igjen</small><b>{foodRemaining}</b></div></div>
      <button className="pause-button" type="button" aria-label={paused ? 'Fortsett' : 'Pause'} onClick={onPause}>
        <svg viewBox="0 0 24 24" aria-hidden="true">{paused ? <path d="M7 4.5v15l12-7.5L7 4.5Z" /> : <><rect x="5" y="4" width="5" height="16" /><rect x="14" y="4" width="5" height="16" /></>}</svg>
      </button>
    </div>
    {hud.hint && <div className="game-hint">{hud.hint}</div>}
  </div>
}

export default App
