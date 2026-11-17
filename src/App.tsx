import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioEngine, type AudioMode } from './audio'
import { VisualEngine, type DeckName } from './engine'
import { renderScene, scenes, sceneById, type AudioBands, type SceneId } from './scenes'

type Device = { id: string; label: string }
type RecordingState = 'idle' | 'recording' | 'stopping'

function saved<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem('voltage.' + key)
    return value ? JSON.parse(value) as T : fallback
  } catch { return fallback }
}
function timeLabel(seconds: number) {
  const s = Math.floor(seconds)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
function Thumbnail({ id }: { id: SceneId }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (ctx) renderScene(ctx, id, 2.4, 160, 90, { bass: .34, mid: .28, treble: .3 })
  }, [id])
  return <canvas ref={ref} width="160" height="90" aria-hidden="true" />
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const outputRef = useRef<Window | null>(null)
  const engineRef = useRef<VisualEngine | null>(null)
  const audioRef = useRef(new AudioEngine())
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordStartRef = useRef(0)
  const [decks, setDecks] = useState<{ A: SceneId; B: SceneId }>(() => saved('decks', { A: 'tunnel', B: 'orbit' }))
  const [selected, setSelected] = useState<DeckName>('A')
  const [crossfader, setCrossfader] = useState(() => saved('crossfader', .5))
  const [transitionMs, setTransitionMs] = useState(() => saved('transitionMs', 600))
  const [blackout, setBlackout] = useState(false)
  const [freeze, setFreeze] = useState(false)
  const [flash, setFlash] = useState(false)
  const [reactive, setReactive] = useState(() => saved('reactive', true))
  const [sensitivity, setSensitivity] = useState<AudioBands>(() => saved('sensitivity', { bass: 1, mid: 1, treble: 1 }))
  const [meter, setMeter] = useState<AudioBands>({ bass: 0, mid: 0, treble: 0 })
  const [fps, setFps] = useState(0)
  const [status, setStatus] = useState('Ready to perform')
  const [audioMode, setAudioMode] = useState<AudioMode>('off')
  const [fileName, setFileName] = useState('')
  const [playing, setPlaying] = useState(false)
  const [playhead, setPlayhead] = useState(0)
  const [duration, setDuration] = useState(0)
  const [devices, setDevices] = useState<Device[]>([])
  const [recording, setRecording] = useState<RecordingState>('idle')
  const [recordTime, setRecordTime] = useState(0)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [outputOpen, setOutputOpen] = useState(false)

  useEffect(() => {
    if (!canvasRef.current) return
    const engine = new VisualEngine(canvasRef.current, audioRef.current, decks)
    engineRef.current = engine
    engine.onMeter = (bands, frameRate) => { setMeter(bands); setFps(frameRate) }
    return () => { engine.dispose(); engineRef.current = null; audioRef.current.dispose() }
    // Initial deck state belongs to the engine for its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    engineRef.current?.setControls({ crossfader, transitionMs, blackout, freeze, flash, reactive, sensitivity })
  }, [crossfader, transitionMs, blackout, freeze, flash, reactive, sensitivity])

  useEffect(() => {
    localStorage.setItem('voltage.decks', JSON.stringify(decks))
    localStorage.setItem('voltage.crossfader', JSON.stringify(crossfader))
    localStorage.setItem('voltage.transitionMs', JSON.stringify(transitionMs))
    localStorage.setItem('voltage.reactive', JSON.stringify(reactive))
    localStorage.setItem('voltage.sensitivity', JSON.stringify(sensitivity))
  }, [decks, crossfader, transitionMs, reactive, sensitivity])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const player = audioRef.current.player
      setPlaying(!player.paused)
      setPlayhead(player.currentTime || 0)
      setDuration(Number.isFinite(player.duration) ? player.duration : 0)
      if (recorderRef.current?.state === 'recording') setRecordTime((performance.now() - recordStartRef.current) / 1000)
      if (outputRef.current?.closed) { outputRef.current = null; setOutputOpen(false) }
    }, 250)
    return () => window.clearInterval(interval)
  }, [])

  const trigger = useCallback((id: SceneId) => {
    setDecks(previous => ({ ...previous, [selected]: id }))
    engineRef.current?.setScene(selected, id)
    setStatus(`Loaded ${sceneById[id].name} into Deck ${selected}`)
  }, [selected])

  const openOutput = useCallback(() => {
    const engine = engineRef.current
    if (!engine) { setStatus('Output is still initializing'); return }
    const popup = window.open('', 'voltage-output', 'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no')
    if (!popup) { setStatus('Pop-up blocked. Allow pop-ups for this page, then try again.'); return }
    outputRef.current = popup
    popup.document.open()
    popup.document.write(`<!doctype html><html><head><title>VOLTAGE — Output</title><style>
      *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#000;overflow:hidden;font-family:Arial,sans-serif}
      video{width:100vw;height:100vh;object-fit:contain;background:#000;display:block}
      button{position:fixed;right:16px;top:16px;padding:12px 18px;background:#d7ff67;color:#0b0e14;border:0;border-radius:7px;font-weight:800;cursor:pointer;opacity:.9}
      body:fullscreen button{opacity:0}body:fullscreen:hover button{opacity:.9}
    </style></head><body><video autoplay muted playsinline></video><button id="full">ENTER FULLSCREEN</button><script>
      document.getElementById('full').addEventListener('click',()=>document.body.requestFullscreen());
    <\/script></body></html>`)
    popup.document.close()
    const video = popup.document.querySelector('video')!
    video.srcObject = engine.stream
    void video.play().catch(() => setStatus('Output opened. Click the output window to start playback.'))
    popup.focus()
    setOutputOpen(true)
    setStatus('Output window open. Drag it to the projector and click Enter Fullscreen there.')
  }, [])

  const startRecording = useCallback(() => {
    const engine = engineRef.current
    if (!engine || recorderRef.current?.state === 'recording') return
    if (!window.MediaRecorder) { setStatus('MediaRecorder is unavailable in this browser.'); return }
    const candidates = [
      'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9',
      'video/webm;codecs=vp8', 'video/webm',
    ]
    const mimeType = candidates.find(type => MediaRecorder.isTypeSupported(type))
    if (!mimeType) { setStatus('This browser cannot record WebM. Try current Chrome or Edge.'); return }
    const audioTrack = audioRef.current.getRecordingTrack()
    const stream = new MediaStream([...engine.stream.getVideoTracks(), ...(audioTrack ? [audioTrack] : [])])
    const chunks: BlobPart[] = []
    try {
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 })
      recorderRef.current = recorder
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      recorder.onerror = () => { setStatus('Recording failed. Check browser media permissions and retry.'); setRecording('idle') }
      recorder.onstop = () => {
        setRecording('idle')
        recorderRef.current = null
        if (!chunks.length) { setStatus('Recording stopped without video data.'); return }
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType })
        const url = URL.createObjectURL(blob)
        setDownloadUrl(previous => { if (previous) URL.revokeObjectURL(previous); return url })
        setStatus(`Recording ready: ${(blob.size / 1048576).toFixed(1)} MB WebM${audioTrack ? ' with song audio' : ''}`)
      }
      recorder.start(1000)
      recordStartRef.current = performance.now()
      setRecordTime(0)
      setRecording('recording')
      setStatus(audioTrack ? 'Recording output + imported song audio' : 'Recording visual output')
    } catch (error) { setStatus(`Could not start recording: ${error instanceof Error ? error.message : String(error)}`) }
  }, [])

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
      setRecording('stopping')
      setStatus('Finalizing WebM recording…')
    }
  }, [])

  const toggleRecording = useCallback(() => {
    if (recording === 'recording') stopRecording()
    else if (recording === 'idle') startRecording()
  }, [recording, startRecording, stopRecording])

  useEffect(() => {
    const editable = (target: EventTarget | null) => {
      const element = target as HTMLElement | null
      return !!element?.closest('input, textarea, select, [contenteditable="true"]')
    }
    const down = (event: KeyboardEvent) => {
      if (editable(event.target) || event.altKey || event.ctrlKey || event.metaKey) return
      const key = event.key.toLowerCase()
      if (/^[1-8]$/.test(key)) { event.preventDefault(); if (!event.repeat) trigger(scenes[Number(key) - 1].id) }
      else if (key === 'a' || key === 'b') { event.preventDefault(); setSelected(key.toUpperCase() as DeckName) }
      else if (key === 'arrowleft' || key === 'arrowright') {
        event.preventDefault(); setCrossfader(value => Math.max(0, Math.min(1, value + (key === 'arrowright' ? .05 : -.05))))
      } else if (key === ' ') { event.preventDefault(); setFlash(true) }
      else if (key === 'x' && !event.repeat) { event.preventDefault(); setBlackout(value => !value) }
      else if (key === 'f' && !event.repeat) { event.preventDefault(); setFreeze(value => !value) }
      else if (key === 'r' && !event.repeat) { event.preventDefault(); toggleRecording() }
    }
    const up = (event: KeyboardEvent) => { if (event.key === ' ') setFlash(false) }
    const blur = () => setFlash(false)
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur) }
  }, [trigger, toggleRecording])

  const loadFile = async (file?: File) => {
    if (!file) return
    try {
      await audioRef.current.loadFile(file)
      setAudioMode('file'); setFileName(file.name); setPlaying(true)
      setStatus(`Playing ${file.name}. Song audio is included when recording starts.`)
    } catch (error) { setStatus(`Could not play file: ${error instanceof Error ? error.message : String(error)}`) }
  }
  const selectMic = async (deviceId?: string) => {
    try {
      await audioRef.current.selectMicrophone(deviceId)
      setAudioMode('microphone'); setPlaying(false)
      const inputs = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput')
      setDevices(inputs.map((device, i) => ({ id: device.deviceId, label: device.label || `Audio input ${i + 1}` })))
      setStatus('Audio input drives visuals. It is muted in the output and recording.')
    } catch (error) { setStatus(`Audio input unavailable: ${error instanceof Error ? error.message : String(error)}`) }
  }
  const changeSensitivity = (band: keyof AudioBands, value: number) => setSensitivity(previous => ({ ...previous, [band]: value }))

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">V<span>///</span></span><div><strong>VOLTAGE</strong><small>LIVE VISUAL INSTRUMENT</small></div></div>
      <div className="top-status"><span className="live-dot" /> LIVE ENGINE <span className="top-divider" /> 1280 × 720 <span className="top-divider" /> {fps} FPS</div>
      <button className={`button projector-button ${outputOpen ? 'active' : ''}`} onClick={openOutput}><span className="icon">▣</span> {outputOpen ? 'OUTPUT OPEN' : 'OPEN OUTPUT'} <span className="button-arrow">↗</span></button>
    </header>

    <div className="workspace">
      <aside className="pad-panel panel">
        <div className="panel-heading"><div><span className="eyebrow">01 / SCENE BANK</span><h2>Scenes</h2></div><span className="panel-count">08 LOADED</span></div>
        <div className="deck-picker"><button className={selected === 'A' ? 'selected' : ''} onClick={() => setSelected('A')}><kbd>A</kbd> DECK A <span style={{ color: sceneById[decks.A].color }}>●</span></button><button className={selected === 'B' ? 'selected' : ''} onClick={() => setSelected('B')}><kbd>B</kbd> DECK B <span style={{ color: sceneById[decks.B].color }}>●</span></button></div>
        <p className="panel-help">Select a deck, then fire a scene.</p>
        <div className="pad-grid">{scenes.map((scene, index) => <button key={scene.id} className={`scene-pad ${decks[selected] === scene.id ? 'loaded' : ''}`} style={{ '--accent': scene.color } as React.CSSProperties} onClick={() => trigger(scene.id)} aria-label={`Load ${scene.name} into Deck ${selected}`}>
          <span className="pad-thumb"><Thumbnail id={scene.id} /><span className="pad-number">{index + 1}</span></span>
          <span className="pad-meta"><strong>{scene.name}</strong><small>{scene.label}</small></span>
        </button>)}</div>
        <div className="shortcut-note"><span>KEYBOARD</span><span>1—8 pads · A/B decks</span></div>
      </aside>

      <main className="main-panel">
        <div className="preview-heading"><div><span className="eyebrow">02 / MASTER OUTPUT</span><h1>Performance preview</h1></div><div className="preview-status"><span className="signal-dot" /> SIGNAL LIVE</div></div>
        <div className="preview-frame"><canvas ref={canvasRef} aria-label="Live visual output preview" /><span className="preview-corner tl"/><span className="preview-corner tr"/><span className="preview-corner bl"/><span className="preview-corner br"/></div>
        <div className="preview-footer"><span>PROGRAM OUT <b>01</b></span><span>{blackout ? 'BLACKOUT ACTIVE' : freeze ? 'FRAME FROZEN' : flash ? 'FLASH ACTIVE' : 'LIVE COMPOSITE'}</span><span>16:9 · WEBM READY</span></div>

        <section className="mixer panel"><div className="section-title"><span className="eyebrow">03 / LIVE MIXER</span><h2>Deck control</h2></div>
          <div className="deck-strip"><div className="deck-label" style={{ '--deck-color': sceneById[decks.A].color } as React.CSSProperties}><span className="deck-letter">A</span><div><strong>{sceneById[decks.A].name}</strong><small>DECK A</small></div></div>
            <div className="crossfader"><div className="fader-label"><span>A</span><span>CROSSFADER</span><span>B</span></div><input aria-label="Crossfader" type="range" min="0" max="100" value={Math.round(crossfader * 100)} onChange={e => setCrossfader(Number(e.target.value) / 100)} style={{ '--fader-percent': `${crossfader * 100}%` } as React.CSSProperties}/><div className="fader-values"><span>{Math.round((1 - crossfader) * 100)}%</span><span>← → to nudge</span><span>{Math.round(crossfader * 100)}%</span></div></div>
            <div className="deck-label deck-b" style={{ '--deck-color': sceneById[decks.B].color } as React.CSSProperties}><span className="deck-letter">B</span><div><strong>{sceneById[decks.B].name}</strong><small>DECK B</small></div></div></div>
          <div className="action-row"><div className="transition-control"><span>SCENE TRANSITION</span><div className="segmented"><button className={transitionMs === 0 ? 'on' : ''} onClick={() => setTransitionMs(0)}>CUT</button><button className={transitionMs === 600 ? 'on' : ''} onClick={() => setTransitionMs(600)}>0.6S</button><button className={transitionMs === 1500 ? 'on' : ''} onClick={() => setTransitionMs(1500)}>1.5S</button></div></div>
            <div className="live-actions"><button className={`action-button ${blackout ? 'engaged danger' : ''}`} onClick={() => setBlackout(value => !value)}><kbd>X</kbd> BLACKOUT</button><button className={`action-button ${freeze ? 'engaged' : ''}`} onClick={() => setFreeze(value => !value)}><kbd>F</kbd> FREEZE</button><button className={`action-button flash ${flash ? 'engaged' : ''}`} onPointerDown={() => setFlash(true)} onPointerUp={() => setFlash(false)} onPointerCancel={() => setFlash(false)} onPointerLeave={() => setFlash(false)}><kbd>SPACE</kbd> FLASH</button></div></div>
        </section>
        <div className="bottom-status"><span className="status-indicator"/><span role="status">{status}</span></div>
      </main>

      <aside className="side-panel">
        <section className="panel audio-panel"><div className="panel-heading"><div><span className="eyebrow">04 / AUDIO REACTIVITY</span><h2>Sound input</h2></div><span className={`audio-led ${audioMode !== 'off' ? 'on' : ''}`} /></div>
          <div className="source-buttons"><button className={audioMode === 'file' ? 'active' : ''} onClick={() => fileRef.current?.click()}><span>♫</span> MUSIC FILE</button><button className={audioMode === 'microphone' ? 'active' : ''} onClick={() => void selectMic()}><span>◉</span> MIC / LINE IN</button></div>
          <input ref={fileRef} className="visually-hidden" type="file" accept="audio/*" onChange={e => { void loadFile(e.target.files?.[0]); e.target.value = '' }} />
          {audioMode === 'file' && <div className="source-detail"><div className="track-name" title={fileName}>♫ &nbsp;{fileName}</div><div className="player-row"><button onClick={() => void audioRef.current.togglePlayback().catch(error => setStatus(String(error)))}>{playing ? 'Ⅱ PAUSE' : '▶ PLAY'}</button><span>{timeLabel(playhead)} / {timeLabel(duration)}</span></div><input aria-label="Song position" type="range" min="0" max={duration || 1} step="0.1" value={Math.min(playhead, duration || 1)} onChange={e => { audioRef.current.player.currentTime = Number(e.target.value) }} /></div>}
          {audioMode === 'microphone' && devices.length > 0 && <select aria-label="Audio input device" className="device-select" onChange={e => void selectMic(e.target.value)}><option value="">Default audio input</option>{devices.map(device => <option key={device.id} value={device.id}>{device.label}</option>)}</select>}
          {audioMode !== 'off' && <button className="disconnect" onClick={() => { audioRef.current.disable(); setAudioMode('off'); setStatus('Audio input disconnected') }}>DISCONNECT AUDIO ×</button>}
          <div className="reactive-switch"><div><strong>AUDIO REACTIVE</strong><small>Frequency drives scene motion</small></div><button role="switch" aria-checked={reactive} className={reactive ? 'on' : ''} onClick={() => setReactive(value => !value)}><span /></button></div>
          <div className="meters">{(['bass', 'mid', 'treble'] as const).map(band => <div className="meter-row" key={band}><div><strong>{band.toUpperCase()}</strong><span>{Math.round(sensitivity[band] * 100)}%</span></div><div className="meter-track"><span style={{ width: `${Math.round(meter[band] * 100)}%` }} /></div><input aria-label={`${band} sensitivity`} type="range" min="0" max="2" step="0.05" value={sensitivity[band]} onChange={e => changeSensitivity(band, Number(e.target.value))}/></div>)}</div>
          <p className="audio-hint">Bass pulses · mids bend · treble sharpens</p>
        </section>
        <section className="panel capture-panel"><div className="panel-heading"><div><span className="eyebrow">05 / CAPTURE</span><h2>Record set</h2></div><span className={`record-led ${recording === 'recording' ? 'on' : ''}`} /></div>
          <div className="record-display"><span>{recording === 'recording' ? '● REC' : recording === 'stopping' ? 'SAVING' : 'STANDBY'}</span><strong>{timeLabel(recordTime)}</strong></div>
          <button className={`record-button ${recording === 'recording' ? 'recording' : ''}`} disabled={recording === 'stopping'} onClick={toggleRecording}>{recording === 'recording' ? '■ STOP RECORDING' : recording === 'stopping' ? 'FINALIZING…' : '● START RECORDING'} <kbd>R</kbd></button>
          {downloadUrl && <a className="download-button" href={downloadUrl} download={`voltage-set-${new Date().toISOString().slice(0, 10)}.webm`}>↓ DOWNLOAD WEBM</a>}
          <p className="capture-hint">Captures the exact master output. Imported music is included when recording starts with a song loaded.</p>
        </section>
        <div className="key-guide"><span>PERFORMANCE KEYS</span><div><kbd>1–8</kbd> Scenes <kbd>← →</kbd> Mix</div><div><kbd>X</kbd> Blackout <kbd>F</kbd> Freeze</div><div><kbd>SPACE</kbd> Flash <kbd>R</kbd> Record</div></div>
      </aside>
    </div>
  </div>
}
