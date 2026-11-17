import { AudioEngine } from './audio'
import { renderScene, type AudioBands, type SceneId } from './scenes'

export type DeckName = 'A' | 'B'
type Deck = { scene: SceneId; previous: SceneId | null; transitionStart: number; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }

function surface() {
  const canvas = document.createElement('canvas')
  canvas.width = 1280; canvas.height = 720
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('Canvas 2D is unavailable.')
  return { canvas, ctx }
}

export class VisualEngine {
  readonly stream: MediaStream
  private ctx: CanvasRenderingContext2D
  private base = surface()
  private decks: Record<DeckName, Deck>
  private frame = 0
  private lastFrame = 0
  private lastReport = 0
  private framesSinceReport = 0
  private clockStart = performance.now()
  private crossfader = .5
  private transitionMs = 600
  private blackout = false
  private freeze = false
  private flash = false
  private reactive = true
  private sensitivity: AudioBands = { bass: 1, mid: 1, treble: 1 }
  onMeter?: (audio: AudioBands, fps: number) => void

  constructor(readonly canvas: HTMLCanvasElement, readonly audio: AudioEngine, initial: { A: SceneId; B: SceneId }) {
    canvas.width = 1280; canvas.height = 720
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D is unavailable.')
    this.ctx = ctx
    this.decks = {
      A: { ...surface(), scene: initial.A, previous: null, transitionStart: 0 },
      B: { ...surface(), scene: initial.B, previous: null, transitionStart: 0 },
    }
    this.stream = canvas.captureStream(30)
    this.render(performance.now())
    this.start()
  }

  setScene(deck: DeckName, scene: SceneId) {
    const item = this.decks[deck]
    if (item.scene === scene) return
    item.previous = this.transitionMs > 0 ? item.scene : null
    item.scene = scene
    item.transitionStart = performance.now()
  }

  setControls(controls: {
    crossfader: number; transitionMs: number; blackout: boolean; freeze: boolean;
    flash: boolean; reactive: boolean; sensitivity: AudioBands
  }) {
    this.crossfader = controls.crossfader
    this.transitionMs = controls.transitionMs
    this.blackout = controls.blackout
    this.freeze = controls.freeze
    this.flash = controls.flash
    this.reactive = controls.reactive
    this.sensitivity = controls.sensitivity
  }

  private start() {
    const tick = (now: number) => {
      this.render(now)
      this.frame = requestAnimationFrame(tick)
    }
    this.frame = requestAnimationFrame(tick)
  }

  private renderDeck(deck: Deck, t: number, now: number, audio: AudioBands) {
    deck.ctx.clearRect(0, 0, 1280, 720)
    if (deck.previous) {
      const progress = Math.min(1, (now - deck.transitionStart) / this.transitionMs)
      renderScene(deck.ctx, deck.previous, t, 1280, 720, audio)
      deck.ctx.globalAlpha = progress
      renderScene(deck.ctx, deck.scene, t, 1280, 720, audio)
      deck.ctx.globalAlpha = 1
      if (progress === 1) deck.previous = null
    } else renderScene(deck.ctx, deck.scene, t, 1280, 720, audio)
  }

  private render(now: number) {
    const t = (now - this.clockStart) / 1000
    const audio = this.audio.sample(this.reactive, this.sensitivity)
    if (!this.freeze) {
      this.renderDeck(this.decks.A, t, now, audio)
      this.renderDeck(this.decks.B, t, now, audio)
      this.base.ctx.drawImage(this.decks.A.canvas, 0, 0)
      if (this.crossfader > 0) {
        this.base.ctx.globalAlpha = this.crossfader
        this.base.ctx.drawImage(this.decks.B.canvas, 0, 0)
        this.base.ctx.globalAlpha = 1
      }
    }
    this.ctx.drawImage(this.base.canvas, 0, 0)
    if (this.blackout) {
      this.ctx.fillStyle = '#000'; this.ctx.fillRect(0, 0, 1280, 720)
    }
    if (this.flash) {
      this.ctx.fillStyle = '#fff'; this.ctx.fillRect(0, 0, 1280, 720)
    }
    this.framesSinceReport++
    if (now - this.lastReport > 500) {
      const fps = this.lastFrame ? Math.round(this.framesSinceReport * 1000 / (now - this.lastReport)) : 0
      this.onMeter?.({ ...audio }, fps)
      this.framesSinceReport = 0
      this.lastReport = now
    }
    this.lastFrame = now
  }

  dispose() {
    cancelAnimationFrame(this.frame)
    this.stream.getTracks().forEach(track => track.stop())
  }
}
