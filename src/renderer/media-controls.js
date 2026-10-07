/*
 * Minimal media controls in the style of Quick Look: a translucent bar with play/pause, elapsed
 * time, a scrubber, duration and mute. Over a video the bar floats on the picture and, while the
 * video plays, fades out together with the cursor when the pointer rests.
 */
const CONTROLS_IDLE_MS = 2000

// overlay: float over a video (with auto-hide); otherwise a static bar, used for audio.
function mediaControls(media, { overlay = false, signal } = {}) {
  const bar = el('div', 'media-controls' + (overlay ? ' overlay' : ''))
  const play = el('button', 'mc-play')
  const elapsed = el('span', 'mc-time', '0:00')
  const track = el('div', 'mc-track')
  const fill = el('div', 'mc-fill')
  const knob = el('div', 'mc-knob')
  const total = el('span', 'mc-time', '0:00')
  const mute = el('button', 'mc-mute')
  track.append(fill, knob)
  bar.append(play, elapsed, track, total, mute)

  const paint = () => {
    play.replaceChildren(icon(media.paused ? 'play' : 'pause'))
    play.dataset.tip = t(media.paused ? 'media.play' : 'media.pause')
    const silent = media.muted || media.volume === 0
    mute.replaceChildren(icon(silent ? 'speakerOff' : 'speaker'))
    mute.dataset.tip = t(silent ? 'media.unmute' : 'media.mute')
    const ratio = media.duration ? media.currentTime / media.duration : 0
    fill.style.width = ratio * 100 + '%'
    knob.style.left = ratio * 100 + '%'
    elapsed.textContent = formatDuration(media.currentTime || 0)
    total.textContent = Number.isFinite(media.duration) ? formatDuration(media.duration) : '0:00'
  }
  for (const type of ['play', 'pause', 'timeupdate', 'durationchange', 'volumechange', 'loadedmetadata']) media.addEventListener(type, paint)

  const toggle = () => { media.paused ? media.play() : media.pause() }
  play.onclick = toggle
  mute.onclick = () => { media.muted = !media.muted }

  track.addEventListener('pointerdown', e => {
    track.setPointerCapture(e.pointerId)
    const seek = ev => {
      const r = track.getBoundingClientRect()
      media.currentTime = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * (media.duration || 0)
    }
    seek(e)
    const up = () => {
      track.removeEventListener('pointermove', seek)
      track.removeEventListener('pointerup', up)
    }
    track.addEventListener('pointermove', seek)
    track.addEventListener('pointerup', up)
  })

  if (overlay) {
    media.addEventListener('click', toggle)
    const box = $('#viewer')
    let idleTimer = null
    const wake = () => {
      bar.classList.remove('idle')
      box.classList.remove('controls-idle')
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        if (media.paused || bar.matches(':hover')) return
        bar.classList.add('idle')
        box.classList.add('controls-idle')
      }, CONTROLS_IDLE_MS)
    }
    box.addEventListener('pointermove', wake, { signal })
    media.addEventListener('play', wake)
    media.addEventListener('pause', wake)
    signal?.addEventListener('abort', () => { clearTimeout(idleTimer); box.classList.remove('controls-idle') })
    wake()
  }

  paint()
  return bar
}
