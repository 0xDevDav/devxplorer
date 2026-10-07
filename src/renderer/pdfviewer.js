/*
 * PDF viewer built on pdf.js: the pages in one scrolling column, each drawn when it comes near the
 * view, at the screen's pixel density, with a selectable text layer. A pill bar at the bottom shows
 * the current page and the zoom controls. pdf.js is loaded on first use.
 */
// Absolute, since the worker resolves resource URLs against its own location.
const PDFJS_DIR = new URL('../../node_modules/pdfjs-dist/', location.href).href
const PDF_LIMIT = 512 * 1024 * 1024
const PDF_ZOOM_STEP = 1.2
const PDF_MAX_FIT = 1.6 // fitting to a very wide window would make the text huge
const PDF_GAP = 16

let pdfjs = null
async function loadPdfjs() {
  if (!pdfjs) {
    pdfjs = await import(PDFJS_DIR + 'build/pdf.min.mjs')
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_DIR + 'build/pdf.worker.min.mjs'
  }
  return pdfjs
}

// Fills container with the document; stops and frees everything when signal aborts.
async function openPdf(container, file, isCurrent, signal) {
  const status = el('div', 'mesh-status', t('pdf.loading'))
  container.append(status)
  let task = null
  signal.addEventListener('abort', () => task?.destroy())
  try {
    const lib = await loadPdfjs()
    const bytes = await call('readBinary', file.path, PDF_LIMIT)
    if (!isCurrent() || signal.aborted) return
    if (!bytes) return void (status.textContent = t('pdf.tooLarge'))
    task = lib.getDocument({
      data: bytes,
      cMapUrl: PDFJS_DIR + 'cmaps/',
      cMapPacked: true,
      standardFontDataUrl: PDFJS_DIR + 'standard_fonts/',
      wasmUrl: PDFJS_DIR + 'wasm/',
      isEvalSupported: false,
    })
    const doc = await task.promise
    if (!isCurrent() || signal.aborted) return
    status.remove()
    showPdf(container, lib, doc, signal)
  } catch {
    if (isCurrent() && !signal.aborted) status.textContent = t('pdf.failed')
  }
}

async function showPdf(container, lib, doc, signal) {
  const scroller = el('div', 'pdf-scroll')
  const column = el('div', 'pdf-column')
  scroller.append(column)
  container.append(scroller)

  // Page sizes at scale 1, read up front so the column has its full height before drawing.
  const pages = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    if (signal.aborted) return
    const node = el('div', 'pdf-page')
    node.dataset.page = n
    column.append(node)
    pages.push({ page, node, base: page.getViewport({ scale: 1 }), drawn: 0 })
  }

  const fitScale = () => Math.min(PDF_MAX_FIT, (scroller.clientWidth - PDF_GAP * 4) / pages[0].base.width)
  let scale = fitScale()

  // Drawing happens for pages near the view; a zoom changes the scale and redraws on demand.
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) draw(pages[entry.target.dataset.page - 1])
  }), { root: scroller, rootMargin: '100% 0px' })
  signal.addEventListener('abort', () => observer.disconnect())

  function layout() {
    for (const p of pages) {
      const viewport = p.page.getViewport({ scale })
      p.node.style.width = viewport.width + 'px'
      p.node.style.height = viewport.height + 'px'
      p.node.style.setProperty('--total-scale-factor', scale)
    }
  }

  async function draw(p) {
    if (p.drawn === scale || signal.aborted) return
    p.drawn = scale
    const viewport = p.page.getViewport({ scale })
    const ratio = devicePixelRatio || 1
    const canvas = el('canvas')
    canvas.width = Math.floor(viewport.width * ratio)
    canvas.height = Math.floor(viewport.height * ratio)
    const text = el('div', 'textLayer')
    try {
      await p.page.render({ canvas, viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] }).promise
      if (p.drawn !== scale || signal.aborted) return
      p.node.replaceChildren(canvas, text)
      await new lib.TextLayer({ textContentSource: p.page.streamTextContent(), container: text, viewport }).render()
    } catch {
      p.drawn = 0
    }
  }

  function zoom(next) {
    // Keep the same point of the document at the top of the view.
    const anchor = scroller.scrollTop / scroller.scrollHeight
    scale = Math.max(0.25, Math.min(6, next))
    layout()
    scroller.scrollTop = anchor * scroller.scrollHeight
    for (const p of pages) { observer.unobserve(p.node); observer.observe(p.node) }
    zoomLabel.textContent = Math.round(scale * 100) + '%'
  }

  // Pill bar: page counter, zoom out / level / zoom in, fit to width.
  const bar = el('div', 'media-controls pdf-bar')
  const pageLabel = el('span', 'mc-time', `1 / ${pages.length}`)
  const zoomLabel = el('span', 'mc-time', '')
  const button = (iconName, tip, run) => {
    const b = el('button')
    b.append(icon(iconName))
    b.dataset.tip = tip
    b.setAttribute('aria-label', tip)
    b.onclick = run
    return b
  }
  bar.append(
    pageLabel,
    el('span', 'pdf-sep'),
    button('minus', t('pdf.zoomOut'), () => zoom(scale / PDF_ZOOM_STEP)),
    zoomLabel,
    button('plus', t('pdf.zoomIn'), () => zoom(scale * PDF_ZOOM_STEP)),
    button('fitWidth', t('pdf.fit'), () => zoom(fitScale())),
  )
  container.append(bar)

  scroller.addEventListener('scroll', () => {
    const middle = scroller.scrollTop + scroller.clientHeight / 3
    const current = pages.findIndex(p => p.node.offsetTop + p.node.offsetHeight > middle)
    pageLabel.textContent = `${(current < 0 ? pages.length - 1 : current) + 1} / ${pages.length}`
  }, { signal })

  layout()
  zoom(scale)
  activePdf = { zoomBy: factor => zoom(scale * factor) }
  signal.addEventListener('abort', () => { activePdf = null })
}

let activePdf = null
