const { app, BrowserWindow, ipcMain, shell, nativeImage, Menu, dialog } = require('electron')
const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const library = require('./library')

const DATA_DIR = app.getPath('userData')
const WINDOW_FILE = path.join(DATA_DIR, 'window.json')
const BG = '#0d0d10'
const SYMBOLS = '#c9c9d4'

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|heic)$/i
const VIDEO_EXT = /\.(mp4|mov|webm|mkv|avi|m4v)$/i
const HIDDEN = /^(\$|\.)|^(desktop\.ini|thumbs\.db|system volume information|config\.msi|recovery|pagefile\.sys|hiberfil\.sys|swapfile\.sys|dumpstack\.log(\.tmp)?)$/i
const INVALID_NAME = /[<>:"/\\|?*]|[. ]$/
const LIBRARY_FILTER = [{ name: 'Libreria Explorer', extensions: ['db'] }]

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}

// Write through a temp file so a crash never leaves a truncated JSON behind.
function writeJson(file, value) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(file + '.tmp', JSON.stringify(value))
  fs.renameSync(file + '.tmp', file)
}

const lower = p => p.toLowerCase()
const isUnder = (p, dir) => lower(p) === lower(dir) || lower(p).startsWith(lower(dir).replace(/\\$/, '') + path.sep)

function checkName(name) {
  if (!name || INVALID_NAME.test(name)) throw new Error(`Nome non valido: ${name}`)
}

async function uniquePath(p) {
  const ext = path.extname(p)
  const stem = p.slice(0, p.length - ext.length)
  for (let i = 2; fs.existsSync(p); i++) p = `${stem} (${i})${ext}`
  return p
}

async function describe(p) {
  const stat = await fsp.stat(p).catch(() => null)
  if (!stat) return null
  const name = path.basename(p)
  return {
    name,
    path: p,
    isDir: stat.isDirectory(),
    mtime: stat.mtimeMs,
    type: IMAGE_EXT.test(name) ? 'img' : VIDEO_EXT.test(name) ? 'video' : 'file',
    meta: await library.metaFor(p, stat).catch(() => null),
  }
}

let win = null
let chrome = null
let watcher = null
let watchTimer = null

const handlers = {
  init: () => ({
    start: startFolder(),
    places: [['Desktop', 'desktop'], ['Immagini', 'pictures'], ['Video', 'videos'], ['Documenti', 'documents'], ['Download', 'downloads']]
      .map(([name, key]) => ({ name, path: app.getPath(key), kind: key })),
    drives: [...'CDEFGHIJKLMNOPQRSTUVWXYZ'].map(c => c + ':\\').filter(d => fs.existsSync(d)),
  }),

  // Watches only the current folder: a recursive watch on a whole drive is too expensive.
  watch(dir) {
    watcher?.close()
    try {
      watcher = fs.watch(dir, () => {
        clearTimeout(watchTimer)
        watchTimer = setTimeout(() => win?.webContents.send('changed'), 300)
      })
    } catch { watcher = null }
  },

  async list(dir) {
    const names = await fsp.readdir(dir).catch(() => [])
    const items = (await Promise.all(names.filter(n => !HIDDEN.test(n)).map(n => describe(path.join(dir, n))))).filter(Boolean)
    return { folders: items.filter(i => i.isDir), files: items.filter(i => !i.isDir) }
  },

  items: async paths => (await Promise.all(paths.map(describe))).filter(Boolean),

  annotated: async () => (await Promise.all(library.knownLocations().map(describe))).filter(i => i?.meta),

  allMeta: () => library.allMeta(),

  async setMeta(paths, op) {
    for (const p of paths) await library.annotate(p, await fsp.stat(p), op)
  },

  async exportLibrary() {
    const r = await dialog.showSaveDialog(win, { defaultPath: 'explorer-libreria.db', filters: LIBRARY_FILTER })
    if (r.canceled) return null
    return library.exportTo(r.filePath)
  },

  async importLibrary() {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: LIBRARY_FILTER })
    if (r.canceled) return null
    return library.importFrom(r.filePaths[0])
  },

  // Windows shell thumbnails: cached by the OS and available for video and HEIC too.
  async thumb(p, size = 480) {
    try {
      const img = await nativeImage.createThumbnailFromPath(p, { width: size, height: size })
      return img.isEmpty() ? null : 'data:image/jpeg;base64,' + img.toJPEG(82).toString('base64')
    } catch { return null }
  },

  // Returns the file content when it looks like text (no NUL bytes), otherwise null.
  async readText(p, max = 4000) {
    let fh
    try {
      fh = await fsp.open(p)
      const { buffer, bytesRead } = await fh.read(Buffer.alloc(max), 0, max, 0)
      const bytes = buffer.subarray(0, bytesRead)
      return bytes.includes(0) ? null : bytes.toString('utf8')
    } catch { return null } finally { await fh?.close() }
  },

  icon: async p => (await app.getFileIcon(p, { size: 'large' }).catch(() => null))?.toDataURL() ?? null,

  /*
   * The window controls are painted by Windows above the page, so the renderer recolors them
   * for the theme and the viewer. Theme colors are remembered to open the next window without a flash.
   */
  overlay({ color, symbolColor, remember }) {
    win.setTitleBarOverlay({ color, symbolColor })
    if (remember) chrome = { color, symbolColor }
  },

  open: p => shell.openPath(p),
  reveal: p => shell.showItemInFolder(p),

  async move(paths, dest) {
    for (const p of paths) {
      if (lower(path.dirname(p)) === lower(dest) || isUnder(dest, p)) continue
      const to = await uniquePath(path.join(dest, path.basename(p)))
      try {
        await fsp.rename(p, to)
      } catch (e) {
        if (e.code !== 'EXDEV') throw e
        await fsp.cp(p, to, { recursive: true })
        await fsp.rm(p, { recursive: true })
      }
      library.relocate(p, to)
    }
  },

  /*
   * pairs: [[path, newName]]. Renames go through temporary names first so that swaps and
   * renumbering within the same folder never collide; on failure the first phase is rolled back.
   */
  async renameMany(pairs) {
    const sources = new Set(pairs.map(([p]) => lower(p)))
    const targets = pairs.map(([p, name]) => { checkName(name); return path.join(path.dirname(p), name) })
    if (new Set(targets.map(lower)).size !== targets.length) throw new Error('Nomi duplicati')
    for (const t of targets) {
      if (fs.existsSync(t) && !sources.has(lower(t))) throw new Error(`Esiste già: ${path.basename(t)}`)
    }
    const staged = []
    try {
      for (const [i, [p]] of pairs.entries()) {
        const tmp = path.join(path.dirname(p), `.~ren${Date.now()}_${i}`)
        await fsp.rename(p, tmp)
        staged.push([tmp, p])
      }
    } catch (e) {
      for (const [tmp, p] of staged) await fsp.rename(tmp, p).catch(() => {})
      throw e
    }
    for (const [i, [tmp, p]] of staged.entries()) {
      await fsp.rename(tmp, targets[i])
      library.relocate(p, targets[i])
    }
  },

  // Annotations are kept: a file restored from the Recycle Bin gets its status back.
  async trash(paths) {
    for (const p of paths) await shell.trashItem(p)
  },

  async mkdir(dir, name) {
    checkName(name)
    await fsp.mkdir(await uniquePath(path.join(dir, name)))
  },
}

for (const [name, fn] of Object.entries(handlers)) ipcMain.handle(name, (e, ...args) => fn(...args))

// A folder passed on the command line (e.g. from a shell "Open with" entry) wins over the last session.
function startFolder() {
  const appPath = lower(app.getAppPath())
  return process.argv.slice(1).find(a =>
    !a.startsWith('-') && a !== '.' && lower(path.resolve(a)) !== appPath &&
    fs.existsSync(a) && fs.statSync(a).isDirectory())
}

// Native drag lets files be dropped into other apps (Explorer, browsers) as well as back into this window.
const EMPTY_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
ipcMain.on('drag', (e, paths, icon) => {
  const img = icon ? nativeImage.createFromDataURL(icon).resize({ width: 96 }) : nativeImage.createFromDataURL(EMPTY_ICON)
  e.sender.startDrag({ file: paths[0], files: paths, icon: img })
})

app.whenReady().then(() => {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  library.open(path.join(DATA_DIR, 'library.db'))
  Menu.setApplicationMenu(null)
  const saved = readJson(WINDOW_FILE, {})
  chrome = saved.chrome ?? { color: BG, symbolColor: SYMBOLS }
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    ...saved.bounds,
    title: app.getName(),
    backgroundColor: chrome.color,
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...chrome, height: 40 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      plugins: true, // built-in PDF viewer
    },
  })
  if (saved.maximized) win.maximize()
  win.on('close', () => writeJson(WINDOW_FILE, { bounds: win.getNormalBounds(), maximized: win.isMaximized(), chrome }))
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
})

app.on('window-all-closed', () => {
  library.close()
  app.quit()
})
