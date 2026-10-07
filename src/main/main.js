const { app, BrowserWindow, ipcMain, shell, nativeImage, nativeTheme, Menu, dialog } = require('electron')
const fs = require('fs')
const os = require('os')
const fsp = fs.promises
const path = require('path')
const library = require('./library')
const exif = require('./exif')
const recycle = require('./recycle')
const shellIntegration = require('./shell-integration')
const { pickLanguage, translator } = require('../shared/messages')

const DATA_DIR = app.getPath('userData')
const WINDOW_FILE = path.join(DATA_DIR, 'window.json')
const BG = '#0d0d10'
const SYMBOLS = '#c9c9d4'

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|heic)$/i
const VIDEO_EXT = /\.(mp4|mov|webm|mkv|avi|m4v)$/i
const HIDDEN = /^(\$|\.)|^(desktop\.ini|thumbs\.db|system volume information|config\.msi|recovery|pagefile\.sys|hiberfil\.sys|swapfile\.sys|dumpstack\.log(\.tmp)?)$/i
const INVALID_NAME = /[<>:"/\\|?*]|[. ]$/
const TRANSPARENT = '#00000000'
// The Mica material needs Windows 11 22H2 (build 22621) or later.
const SUPPORTS_MICA = process.platform === 'win32' && Number(os.release().split('.')[2]) >= 22621

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
  if (!name || INVALID_NAME.test(name)) throw new Error(t('error.invalidName', { name }))
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
    size: stat.isDirectory() ? 0 : stat.size,
    type: IMAGE_EXT.test(name) ? 'img' : VIDEO_EXT.test(name) ? 'video' : 'file',
    meta: await library.metaFor(p, stat).catch(() => null),
  }
}

let win = null
let chrome = null
// Error messages and dialogs follow the language the renderer reports (system locale until then).
let t = translator('en')
let currentLanguage = null
let appearance = null
let watcher = null
let watchTimer = null

// Rename when possible; across drives fall back to copy and delete.
async function moveItem(from, to) {
  try {
    await fsp.rename(from, to)
  } catch (e) {
    if (e.code !== 'EXDEV') throw e
    await fsp.cp(from, to, { recursive: true })
    await fsp.rm(from, { recursive: true })
  }
  library.relocate(from, to)
}

const FOLDER_SIZE_TTL = 60000
const folderSizes = new Map()

async function walkSize(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
  const sizes = await Promise.all(entries.map(async entry => {
    if (entry.isSymbolicLink()) return 0
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) return walkSize(p)
    return (await fsp.stat(p).catch(() => null))?.size ?? 0
  }))
  return sizes.reduce((sum, size) => sum + size, 0)
}

const libraryFilter = () => [{ name: t('library.fileType'), extensions: ['db'] }]

const handlers = {
  init: () => ({
    supportsGlass: SUPPORTS_MICA,
    start: folderArgument(process.argv),
    places: ['desktop', 'pictures', 'videos', 'documents', 'downloads'].map(kind => ({ path: app.getPath(kind), kind })),
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

  // Recursive size of a folder, cached for a minute because large trees take a while to walk.
  folderSize(dir) {
    const key = lower(dir)
    const cached = folderSizes.get(key)
    if (cached && Date.now() - cached.at < FOLDER_SIZE_TTL) return cached.size
    const size = walkSize(dir)
    folderSizes.set(key, { at: Date.now(), size })
    return size
  },

  async photoInfo(p) {
    const stat = await fsp.stat(p).catch(() => null)
    return stat && exif.photoInfo(p, stat.mtimeMs)
  },

  // items: [[path, mtime]] -> capture time of each photo, or null when it has none.
  photoDates: items => Promise.all(items.map(([p, mtime]) => exif.photoInfo(p, mtime).then(info => info?.taken ?? null))),

  async diskSpace(p) {
    const s = await fsp.statfs(path.parse(p).root).catch(() => null)
    return s && { free: s.bavail * s.bsize, total: s.blocks * s.bsize }
  },

  annotated: async () => (await Promise.all(library.knownLocations().map(describe))).filter(i => i?.meta),

  allMeta: () => library.allMeta(),

  async setMeta(paths, op) {
    for (const p of paths) await library.annotate(p, await fsp.stat(p), op)
  },

  async exportLibrary() {
    const r = await dialog.showSaveDialog(win, { defaultPath: t('library.defaultName'), filters: libraryFilter() })
    if (r.canceled) return null
    return library.exportTo(r.filePath)
  },

  async importLibrary() {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: libraryFilter() })
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
  // The byte order mark some Windows editors write is dropped so parsers see the first line intact.
  async readText(p, max = 4000) {
    let fh
    try {
      fh = await fsp.open(p)
      const { buffer, bytesRead } = await fh.read(Buffer.alloc(max), 0, max, 0)
      const bytes = buffer.subarray(0, bytesRead)
      return bytes.includes(0) ? null : bytes.toString('utf8').replace(/^﻿/, '')
    } catch { return null } finally { await fh?.close() }
  },

  /*
   * The window controls are painted by Windows above the page, so the renderer recolors them
   * for the theme and the viewer. Theme colors are remembered to open the next window without a flash.
   */
  overlay({ color, symbolColor, remember }) {
    win.setTitleBarOverlay({ color, symbolColor })
    if (remember) chrome = { color, symbolColor }
  },

  // Keeps system-drawn surfaces (Mica, native dialogs) in the app's theme and toggles the glass material.
  shellIntegration: () => shellIntegration.isEnabled(),

  async setShellIntegration(enabled) {
    if (enabled) await shellIntegration.enable(t('shell.openIn'), launchCommand())
    else await shellIntegration.disable()
    return shellIntegration.isEnabled()
  },

  appearance({ theme, glass, language }) {
    if (language && language !== currentLanguage) {
      currentLanguage = language
      t = translator(language)
      // keep the File Explorer entry in the app language
      shellIntegration.isEnabled().then(on => on && shellIntegration.enable(t('shell.openIn'), launchCommand()))
    }
    appearance = { theme, glass: SUPPORTS_MICA && glass }
    nativeTheme.themeSource = theme
    if (!SUPPORTS_MICA) return
    if (appearance.glass) win.setBackgroundColor(TRANSPARENT)
    win.setBackgroundMaterial(appearance.glass ? 'mica' : 'none')
  },

  open: p => shell.openPath(p),
  reveal: p => shell.showItemInFolder(p),

  // Returns [[from, to]] for every item actually moved, so the move can be undone.
  async move(paths, dest) {
    const moved = []
    for (const p of paths) {
      if (lower(path.dirname(p)) === lower(dest) || isUnder(dest, p)) continue
      const to = await uniquePath(path.join(dest, path.basename(p)))
      await moveItem(p, to)
      moved.push([p, to])
    }
    return moved
  },

  // Moves each item to an exact path; used to undo moves. Never overwrites.
  async moveTo(pairs) {
    for (const [from, to] of pairs) {
      if (fs.existsSync(to)) throw new Error(t('error.exists', { name: path.basename(to) }))
      await moveItem(from, to)
    }
  },

  // Copies next to the destination's existing items ("name (2)" on clashes); returns [[from, to]].
  async copy(paths, dest) {
    const copied = []
    for (const p of paths) {
      if (isUnder(dest, p) && lower(path.dirname(p)) !== lower(dest)) continue
      const to = await uniquePath(path.join(dest, path.basename(p)))
      await fsp.cp(p, to, { recursive: true, errorOnExist: true, force: false })
      copied.push([p, to])
    }
    return copied
  },

  restore: paths => recycle.restore(paths),

  /*
   * pairs: [[path, newName]]. Renames go through temporary names first so that swaps and
   * renumbering within the same folder never collide; on failure the first phase is rolled back.
   */
  async renameMany(pairs) {
    const sources = new Set(pairs.map(([p]) => lower(p)))
    const targets = pairs.map(([p, name]) => { checkName(name); return path.join(path.dirname(p), name) })
    if (new Set(targets.map(lower)).size !== targets.length) throw new Error(t('error.duplicateNames'))
    for (const target of targets) {
      if (fs.existsSync(target) && !sources.has(lower(target))) throw new Error(t('error.exists', { name: path.basename(target) }))
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
    return true
  },

  // Annotations are kept: a file restored from the Recycle Bin gets its status back.
  async trash(paths) {
    for (const p of paths) await shell.trashItem(p)
    return true
  },

  async mkdir(dir, name) {
    checkName(name)
    const target = await uniquePath(path.join(dir, name))
    await fsp.mkdir(target)
    return target
  },
}

for (const [name, fn] of Object.entries(handlers)) ipcMain.handle(name, (e, ...args) => fn(...args))

// A folder passed on the command line (e.g. from a shell "Open with" entry) wins over the last session.
function folderArgument(argv) {
  const appPath = lower(app.getAppPath())
  return argv.slice(1).find(a =>
    !a.startsWith('-') && a !== '.' && lower(path.resolve(a)) !== appPath &&
    fs.existsSync(a) && fs.statSync(a).isDirectory())
}

// How Windows should start the app: the packaged executable, or Electron with the project path.
const launchCommand = () => app.isPackaged ? [process.execPath] : [process.execPath, app.getAppPath()]

// A single window: launching again (e.g. from File Explorer) opens the folder in a new tab.
if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', (e, argv) => {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
  const folder = folderArgument(argv)
  if (folder) win.webContents.send('open-folder', folder)
})

// Native drag lets files be dropped into other apps (File Explorer, browsers) as well as back into this window.
const EMPTY_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
ipcMain.on('drag', (e, paths, icon) => {
  const img = icon ? nativeImage.createFromDataURL(icon).resize({ width: 96 }) : nativeImage.createFromDataURL(EMPTY_ICON)
  e.sender.startDrag({ file: paths[0], files: paths, icon: img })
})

app.whenReady().then(() => {
  t = translator(pickLanguage(app.getLocale()))
  fs.mkdirSync(DATA_DIR, { recursive: true })
  library.open(path.join(DATA_DIR, 'library.db'))
  Menu.setApplicationMenu(null)
  const saved = readJson(WINDOW_FILE, {})
  chrome = saved.chrome ?? { color: BG, symbolColor: SYMBOLS }
  appearance = saved.appearance ?? { theme: 'system', glass: SUPPORTS_MICA }
  nativeTheme.themeSource = appearance.theme
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    ...saved.bounds,
    title: app.getName(),
    backgroundColor: appearance.glass ? TRANSPARENT : chrome.color,
    ...(appearance.glass && { backgroundMaterial: 'mica' }),
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...chrome, height: 40 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      plugins: true, // built-in PDF viewer
    },
  })
  if (saved.maximized) win.maximize()
  win.on('close', () => writeJson(WINDOW_FILE, { bounds: win.getNormalBounds(), maximized: win.isMaximized(), chrome, appearance }))
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
})

app.on('window-all-closed', () => {
  library.close()
  app.quit()
})
