import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'

// Chrome or Edge in their usual places. Set VOLTAGE_BROWSER to a chrome.exe / msedge.exe path to pick one yourself.
const chrome = [process.env.VOLTAGE_BROWSER, ...[process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA]
  .filter(Boolean).flatMap(base => [path.join(base, 'Google/Chrome/Application/chrome.exe'), path.join(base, 'Microsoft/Edge/Application/msedge.exe')])]
  .find(file => file && existsSync(file))
if (!chrome) throw new Error('No Chrome or Edge found. Set VOLTAGE_BROWSER to the browser .exe path.')
const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream'] })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true })
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
const results = {}

try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
  await page.locator('.preview-frame canvas').waitFor()
  results.title = await page.title()
  results.scenePads = await page.locator('.scene-pad').count()
  if (results.scenePads !== 8) throw new Error(`Expected 8 scene pads, found ${results.scenePads}`)

  await page.keyboard.press('a')
  await page.keyboard.press('1')
  await page.keyboard.press('b')
  await page.keyboard.press('4')
  results.deckA = await page.locator('.deck-label').first().locator('strong').innerText()
  results.deckB = await page.locator('.deck-label').last().locator('strong').innerText()
  if (results.deckA !== 'TUNNEL' || results.deckB !== 'GLITCH GRID') throw new Error(`Deck shortcut assignments failed: ${results.deckA}, ${results.deckB}`)
  await page.locator('input[aria-label="Crossfader"]').fill('0')
  await page.waitForTimeout(250)
  const fingerprint = () => page.locator('.preview-frame canvas').evaluate(canvas => {
    const ctx = canvas.getContext('2d')
    const data = ctx.getImageData(200, 150, 800, 400).data
    let r = 0, g = 0, b = 0
    for (let i = 0; i < data.length; i += 160) { r += data[i]; g += data[i + 1]; b += data[i + 2] }
    return [r, g, b]
  })
  const deckAVisual = await fingerprint()
  await page.locator('input[aria-label="Crossfader"]').fill('100')
  await page.waitForTimeout(250)
  const deckBVisual = await fingerprint()
  results.crossfadeColorDelta = Math.round(deckAVisual.reduce((sum, value, i) => sum + Math.abs(value - deckBVisual[i]), 0))
  if (results.crossfadeColorDelta < 1000) throw new Error('Crossfader did not alter the output')

  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: /OPEN OUTPUT/ }).click()
  const popup = await popupPromise
  popup.on('pageerror', error => errors.push(`output: ${error.message}`))
  await popup.locator('video').waitFor()
  await popup.waitForFunction(() => document.querySelector('video')?.videoWidth === 1280)
  results.outputResolution = await popup.locator('video').evaluate(video => `${video.videoWidth}x${video.videoHeight}`)
  await popup.getByRole('button', { name: 'ENTER FULLSCREEN' }).click()
  results.fullscreen = await popup.evaluate(() => Boolean(document.fullscreenElement))

  const duration = 35, sampleRate = 11025, samples = duration * sampleRate
  const wav = Buffer.alloc(44 + samples * 2)
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28)
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate
    const sample = .38 * Math.sin(t * Math.PI * 2 * 85) + .15 * Math.sin(t * Math.PI * 2 * 3000)
    wav.writeInt16LE(Math.round(sample * 32767), 44 + i * 2)
  }
  await page.getByRole('button', { name: /MUSIC FILE/ }).click()
  await page.locator('input[type="file"]').setInputFiles({ name: 'smoke-tone.wav', mimeType: 'audio/wav', buffer: wav })
  await page.locator('.track-name').waitFor()
  await page.waitForTimeout(1000)
  results.audioMeter = await page.locator('.meter-track span').first().evaluate(element => element.style.width)
  if (parseInt(results.audioMeter) <= 0) throw new Error('Audio meter did not respond')

  await page.getByRole('button', { name: /START RECORDING/ }).click()
  await page.waitForTimeout(1000)
  await page.keyboard.press('a'); await page.keyboard.press('2')
  await page.keyboard.press('b'); await page.keyboard.press('6')
  await page.keyboard.press('x'); await page.waitForTimeout(300); await page.keyboard.press('x')
  await page.keyboard.press('f'); await page.waitForTimeout(300); await page.keyboard.press('f')
  await page.keyboard.down('Space'); await page.waitForTimeout(120); await page.keyboard.up('Space')
  await page.waitForTimeout(process.argv.includes('--short') ? 3000 : 30000)
  results.recordSeconds = await page.locator('.record-display strong').innerText()
  await page.getByRole('button', { name: /STOP RECORDING/ }).click()
  await page.getByRole('link', { name: /DOWNLOAD WEBM/ }).waitFor({ timeout: 15000 })
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('link', { name: /DOWNLOAD WEBM/ }).click()
  const download = await downloadPromise
  const file = await download.path()
  results.webmBytes = (await stat(file)).size
  if (results.webmBytes < 100000) throw new Error('Recorded WebM is unexpectedly small')
  results.playback = await page.getByRole('link', { name: /DOWNLOAD WEBM/ }).evaluate(async link => {
    const video = document.createElement('video')
    video.src = link.href
    video.muted = true
    await video.play()
    await new Promise(resolve => setTimeout(resolve, 300))
    const result = { width: video.videoWidth, height: video.videoHeight, time: video.currentTime }
    video.pause()
    return result
  })
  if (results.playback.width !== 1280 || results.playback.time <= 0) throw new Error('Downloaded video did not play')
  await mkdir(path.resolve('artifacts'), { recursive: true })
  await download.saveAs(path.resolve('artifacts', 'acceptance.webm'))
  await page.screenshot({ path: path.resolve('artifacts', 'interface.png'), fullPage: true })
  results.errors = errors
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`)
  console.log(JSON.stringify(results, null, 2))
} finally {
  await browser.close()
}
