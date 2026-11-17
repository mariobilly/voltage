import type { AudioBands } from './scenes'

export type AudioMode = 'off' | 'file' | 'microphone'

export class AudioEngine {
  readonly player = new Audio()
  mode: AudioMode = 'off'
  fileName = ''
  private context: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private recordingDestination: MediaStreamAudioDestinationNode | null = null
  private fileSource: MediaElementAudioSourceNode | null = null
  private micSource: MediaStreamAudioSourceNode | null = null
  private micStream: MediaStream | null = null
  private fileUrl: string | null = null
  private data: Uint8Array<ArrayBuffer> | null = null
  private smoothed: AudioBands = { bass: 0, mid: 0, treble: 0 }

  constructor() {
    this.player.preload = 'auto'
  }

  private async ready() {
    if (!this.context) {
      this.context = new AudioContext()
      this.analyser = this.context.createAnalyser()
      this.analyser.fftSize = 2048
      this.analyser.smoothingTimeConstant = .72
      this.recordingDestination = this.context.createMediaStreamDestination()
      this.data = new Uint8Array(this.analyser.frequencyBinCount)
    }
    if (this.context.state === 'suspended') await this.context.resume()
  }

  private stopMic() {
    this.micSource?.disconnect()
    this.micSource = null
    this.micStream?.getTracks().forEach(track => track.stop())
    this.micStream = null
  }

  async loadFile(file: File) {
    await this.ready()
    this.stopMic()
    this.player.pause()
    this.fileSource?.disconnect()
    if (this.fileUrl) URL.revokeObjectURL(this.fileUrl)
    this.fileUrl = URL.createObjectURL(file)
    this.player.src = this.fileUrl
    this.player.load()
    this.fileName = file.name
    if (!this.fileSource) this.fileSource = this.context!.createMediaElementSource(this.player)
    this.fileSource.connect(this.analyser!)
    this.fileSource.connect(this.context!.destination)
    this.fileSource.connect(this.recordingDestination!)
    this.mode = 'file'
    await this.player.play()
  }

  async selectMicrophone(deviceId?: string) {
    await this.ready()
    const stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true, video: false })
    this.player.pause()
    this.fileSource?.disconnect()
    this.stopMic()
    this.micStream = stream
    this.micSource = this.context!.createMediaStreamSource(stream)
    this.micSource.connect(this.analyser!)
    this.mode = 'microphone'
    stream.getAudioTracks()[0]?.addEventListener('ended', () => {
      if (this.micStream === stream) { this.stopMic(); this.mode = 'off' }
    })
  }

  async togglePlayback() {
    if (this.mode !== 'file') return
    await this.ready()
    if (this.player.paused) await this.player.play()
    else this.player.pause()
  }

  disable() {
    this.player.pause()
    this.fileSource?.disconnect()
    this.stopMic()
    this.mode = 'off'
  }

  getRecordingTrack() {
    return this.mode === 'file' ? this.recordingDestination?.stream.getAudioTracks()[0] ?? null : null
  }

  sample(enabled: boolean, sensitivity: AudioBands): AudioBands {
    if (!enabled || this.mode === 'off' || !this.analyser || !this.data || !this.context) {
      this.smoothed = { bass: 0, mid: 0, treble: 0 }
      return this.smoothed
    }
    this.analyser.getByteFrequencyData(this.data)
    const hzPerBin = this.context.sampleRate / this.analyser.fftSize
    const band = (low: number, high: number) => {
      const start = Math.max(0, Math.floor(low / hzPerBin))
      const end = Math.min(this.data!.length, Math.ceil(high / hzPerBin))
      let sum = 0
      for (let i = start; i < end; i++) sum += this.data![i]
      return end > start ? sum / (end - start) / 255 : 0
    }
    const raw = {
      bass: Math.min(1, band(30, 180) * 2.4 * sensitivity.bass),
      mid: Math.min(1, band(180, 2200) * 2.1 * sensitivity.mid),
      treble: Math.min(1, band(2200, 12000) * 3.2 * sensitivity.treble),
    }
    this.smoothed.bass += (raw.bass - this.smoothed.bass) * .24
    this.smoothed.mid += (raw.mid - this.smoothed.mid) * .2
    this.smoothed.treble += (raw.treble - this.smoothed.treble) * .3
    return this.smoothed
  }

  dispose() {
    this.disable()
    if (this.fileUrl) URL.revokeObjectURL(this.fileUrl)
    void this.context?.close()
  }
}
