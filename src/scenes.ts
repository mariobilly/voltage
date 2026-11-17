export type AudioBands = { bass: number; mid: number; treble: number }
export type SceneId = 'tunnel' | 'liquid' | 'orbit' | 'glitch' | 'particles' | 'kaleidoscope' | 'typography' | 'blackout'
export type Scene = {
  id: SceneId
  name: string
  label: string
  color: string
  render: (ctx: CanvasRenderingContext2D, time: number, width: number, height: number, audio: AudioBands, params: { intensity: number }) => void
}

const TAU = Math.PI * 2
const seed = (n: number) => {
  const x = Math.sin(n * 127.1 + 78.233) * 43758.5453
  return x - Math.floor(x)
}
const bg = (ctx: CanvasRenderingContext2D, color: string | CanvasGradient) => {
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1280, 720)
}

export const scenes: Scene[] = [
  {
    id: 'tunnel', name: 'Tunnel', label: 'INFINITE DEPTH', color: '#a4ff5c',
    render(ctx, t, _w, _h, a) {
      bg(ctx, '#09100e')
      const pulse = 1 + a.bass * .45
      const cx = 640 + Math.sin(t * .27) * 65 + a.mid * 55
      const cy = 360 + Math.cos(t * .21) * 36
      for (let i = 21; i >= 0; i--) {
        const phase = ((i / 22 + t * .12) % 1)
        const radius = Math.pow(phase, 2.1) * 770 * pulse + 6
        ctx.beginPath()
        for (let j = 0; j <= 6; j++) {
          const ang = j * TAU / 6 + t * .09 + a.mid * .3
          const x = cx + Math.cos(ang) * radius
          const y = cy + Math.sin(ang) * radius * .67
          if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.strokeStyle = `rgba(164,255,92,${.13 + (1 - phase) * .74})`
        ctx.lineWidth = 1 + (1 - phase) * 3 + a.treble * 2
        ctx.stroke()
      }
      ctx.fillStyle = '#e8ffda'
      ctx.beginPath(); ctx.arc(cx, cy, 6 + a.bass * 10, 0, TAU); ctx.fill()
    },
  },
  {
    id: 'liquid', name: 'Liquid', label: 'FLUID FREQUENCY', color: '#6ae4ff',
    render(ctx, t, _w, _h, a) {
      const grad = ctx.createLinearGradient(0, 0, 1280, 720)
      grad.addColorStop(0, '#041520'); grad.addColorStop(.6, '#122746'); grad.addColorStop(1, '#06131b')
      bg(ctx, grad)
      for (let band = 0; band < 10; band++) {
        const base = 120 + band * 64
        const amp = 21 + a.bass * 85 + band * 3
        ctx.beginPath()
        for (let x = 0; x <= 1280; x += 12) {
          const y = base + Math.sin(x * .008 + t * (1.1 + band * .05) + band * .7) * amp
            + Math.sin(x * .019 - t * .6 + band * 2) * (13 + a.mid * 34)
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.lineTo(1280, 720); ctx.lineTo(0, 720); ctx.closePath()
        ctx.fillStyle = `hsla(${191 + band * 7 + a.treble * 25},90%,${30 + band * 3}%,.32)`
        ctx.fill()
        ctx.strokeStyle = `hsla(${185 + band * 5},100%,78%,${.17 + a.treble * .24})`
        ctx.lineWidth = 2; ctx.stroke()
      }
    },
  },
  {
    id: 'orbit', name: 'Orbit', label: 'CELESTIAL MOTION', color: '#ff9c6a',
    render(ctx, t, _w, _h, a) {
      bg(ctx, '#170e18')
      ctx.save(); ctx.translate(640, 360); ctx.rotate(t * .11 + a.mid * .4)
      for (let i = 0; i < 8; i++) {
        const r = 76 + i * 50 + a.bass * 19
        ctx.save(); ctx.rotate(i * .33)
        ctx.beginPath(); ctx.ellipse(0, 0, r * 1.42, r * .53, 0, 0, TAU)
        ctx.strokeStyle = `rgba(255,${118 + i * 9},${95 + i * 12},${.22 + a.treble * .2})`
        ctx.lineWidth = i % 3 === 0 ? 3 : 1.5; ctx.stroke()
        const ang = t * (.46 + i * .045) + i * 2.2
        ctx.beginPath(); ctx.arc(Math.cos(ang) * r * 1.42, Math.sin(ang) * r * .53, 3 + i * .7 + a.treble * 6, 0, TAU)
        ctx.fillStyle = i % 2 ? '#ffd5a5' : '#ff866a'; ctx.fill()
        ctx.restore()
      }
      const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 130 + a.bass * 80)
      glow.addColorStop(0, '#fff0c8'); glow.addColorStop(.15, '#ffad66'); glow.addColorStop(1, 'transparent')
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 160 + a.bass * 80, 0, TAU); ctx.fill()
      ctx.restore()
    },
  },
  {
    id: 'glitch', name: 'Glitch Grid', label: 'DIGITAL FRACTURE', color: '#ff5bba',
    render(ctx, t, _w, _h, a) {
      bg(ctx, '#120b19')
      const step = 64
      ctx.strokeStyle = 'rgba(255,91,186,.18)'; ctx.lineWidth = 1
      for (let x = 0; x <= 1280; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 720); ctx.stroke() }
      for (let y = 0; y <= 720; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1280, y); ctx.stroke() }
      const tick = Math.floor(t * (7 + a.treble * 22))
      for (let i = 0; i < 38; i++) {
        const active = seed(i * 17 + tick * 31)
        if (active < .37) continue
        const x = Math.floor(seed(i * 9 + tick * 5) * 20) * step
        const y = Math.floor(seed(i * 13 + tick * 11) * 12) * step
        const length = step * (1 + Math.floor(seed(i * 29 + tick) * 5))
        ctx.fillStyle = i % 4 === 0 ? 'rgba(107,238,255,.75)' : i % 3 === 0 ? 'rgba(255,242,114,.8)' : 'rgba(255,80,173,.68)'
        ctx.fillRect(x, y + (i % 3) * 8, length, 4 + active * (10 + a.bass * 28))
      }
      ctx.save(); ctx.translate(640 + a.mid * 50, 360); ctx.rotate(-.08)
      ctx.font = '900 156px Arial Black, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillStyle = '#34dfff'; ctx.fillText('ERROR', 9, -4)
      ctx.fillStyle = '#ff55af'; ctx.fillText('ERROR', -8, 7)
      ctx.fillStyle = '#fff4dc'; ctx.fillText('ERROR', 0, 0)
      ctx.restore()
    },
  },
  {
    id: 'particles', name: 'Particles', label: 'ENERGY FIELD', color: '#ceb0ff',
    render(ctx, t, _w, _h, a) {
      bg(ctx, '#090c20')
      const cx = 640, cy = 360
      for (let i = 0; i < 200; i++) {
        const angle = seed(i * 17) * TAU + t * (seed(i * 2) > .5 ? .13 : -.1)
        const distance = ((seed(i * 8) + t * (.035 + seed(i * 3) * .035)) % 1) * 760
        const spread = 1 + a.bass * .5
        const x = cx + Math.cos(angle) * distance * spread
        const y = cy + Math.sin(angle) * distance * .65 * spread
        const r = 1 + seed(i * 22) * 3 + a.treble * 3
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU)
        ctx.fillStyle = `hsla(${250 + seed(i) * 75},95%,${68 + seed(i * 11) * 25}%,${.25 + (1 - distance / 760) * .7})`
        ctx.fill()
      }
      const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 220 + a.bass * 150)
      glow.addColorStop(0, 'rgba(203,170,255,.7)'); glow.addColorStop(1, 'transparent')
      ctx.fillStyle = glow; ctx.fillRect(0, 0, 1280, 720)
    },
  },
  {
    id: 'kaleidoscope', name: 'Kaleidoscope', label: 'PRISM ENGINE', color: '#ffde73',
    render(ctx, t, _w, _h, a) {
      bg(ctx, '#16100a')
      ctx.save(); ctx.translate(640, 360); ctx.rotate(t * .1 + a.mid * .4)
      for (let ring = 8; ring >= 0; ring--) {
        const outer = 60 + ring * 70 + a.bass * 35
        const inner = outer * .35
        for (let i = 0; i < 12; i++) {
          const angle = i * TAU / 12 + (ring % 2) * .22
          ctx.beginPath()
          ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner)
          ctx.lineTo(Math.cos(angle - .2) * outer, Math.sin(angle - .2) * outer)
          ctx.lineTo(Math.cos(angle + .2) * outer, Math.sin(angle + .2) * outer)
          ctx.closePath()
          ctx.fillStyle = `hsla(${(ring * 32 + i * 29 + t * 14) % 360},93%,${42 + a.treble * 20}%,.38)`
          ctx.fill(); ctx.strokeStyle = 'rgba(255,233,170,.17)'; ctx.stroke()
        }
      }
      ctx.restore()
    },
  },
  {
    id: 'typography', name: 'Typography', label: 'TYPE IN MOTION', color: '#ffffff',
    render(ctx, t, _w, _h, a) {
      bg(ctx, '#e8e7df')
      const words = ['MOVE', 'FEEL', 'LIVE', 'NOW']
      const index = Math.floor(t * .48) % words.length
      const progress = (t * .48) % 1
      ctx.save(); ctx.translate(640, 360); ctx.rotate(Math.sin(t * .55) * .045 + a.mid * .1)
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 250px Arial Black, sans-serif'
      ctx.fillStyle = '#ff4d27'; ctx.fillText(words[index], -14 - a.bass * 30, 13)
      ctx.fillStyle = '#11131a'; ctx.fillText(words[index], progress * 18, -progress * 12)
      ctx.restore()
      ctx.fillStyle = '#11131a'; ctx.font = '700 27px monospace'
      ctx.fillText('VOLTAGE // LIVE TRANSMISSION', 48, 52)
      ctx.fillText('NO. 0' + (index + 1), 1080, 670)
      ctx.fillRect(48, 668, 850 * (.2 + a.treble * .8), 9)
    },
  },
  {
    id: 'blackout', name: 'Blackout', label: 'TOTAL DARKNESS', color: '#75808c',
    render(ctx) { bg(ctx, '#000000') },
  },
]

export const sceneById = Object.fromEntries(scenes.map(scene => [scene.id, scene])) as Record<SceneId, Scene>

export function renderScene(ctx: CanvasRenderingContext2D, id: SceneId, time: number, width: number, height: number, audio: AudioBands) {
  ctx.save()
  ctx.setTransform(width / 1280, 0, 0, height / 720, 0, 0)
  sceneById[id].render(ctx, time, width, height, audio, { intensity: 1 })
  ctx.restore()
}
