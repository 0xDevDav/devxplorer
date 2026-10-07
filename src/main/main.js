const { app, BrowserWindow, ipcMain, shell, nativeImage, nativeTheme, Menu, dialog, clipboard } = require('electron')
const fs = require('fs')
const os = require('os')
const fsp = fs.promises
const { execFile, spawn } = require('child_process')
const path = require('path')
const library = require('./library')
const exif = require('./exif')
const icons = require('./icons')
const recycle = require('./recycle')
const shellIntegration = require('./shell-integration')
const { powershell, zip, unzip } = require('./powershell')
const { validName, uniquePath } = require('./paths')
const log = require('./log')
const updates = require('./updates')
const fileOps = require('./fileops')
const { pickLanguage, translator } = require('../shared/messages')

const DATA_DIR = app.getPath('userData')
const WINDOW_FILE = path.join(DATA_DIR, 'window.json')

// Unexpected errors are written to the log instead of stopping the app with an error box.
log.init(path.join(DATA_DIR, 'logs'))
process.on('uncaughtException', error => log.error('main:', error))
process.on('unhandledRejection', reason => log.error('main, unhandled rejection:', reason))
const BG = '#0d0d10'
const SYMBOLS = '#c9c9d4'

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|heic)$/i
const VIDEO_EXT = /\.(mp4|mov|webm|mkv|avi|m4v)$/i
const HIDDEN = /^(\$|\.)|^(desktop\.ini|thumbs\.db|system volume information|config\.msi|recovery|pagefile\.sys|hiberfil\.sys|swapfile\.sys|dumpstack\.log(\.tmp)?|nul)$/i
/*
 * Windows programs cannot create a file named "nul": it is the output of a "2>nul" redirection
 * run in a Unix shell (Git Bash, WSL), so it is hidden and deleted. Larger files are left alone
 * in case one was made on purpose.
 */
const STRAY_NUL = /^nul$/i
const STRAY_NUL_MAX = 1024 * 1024

async function removeStrayNul(p) {
  const stat = await fsp.lstat(p).catch(() => null)
  if (stat?.isFile() && stat.size <= STRAY_NUL_MAX) await fsp.unlink(p).catch(() => {})
}

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

function checkName(name) {
  if (!validName(name)) throw new Error(t('error.invalidName', { name }))
}

// Starts a program on its own, outside the app's process tree and environment quirks.
function launch(file, args, options = {}) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(file, args, { detached: true, stdio: 'ignore', env, ...options })
  child.on('error', () => {})
  child.unref()
}

const VS_CODE = [
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'Code.exe'),
  path.join(process.env.ProgramFiles || '', 'Microsoft VS Code', 'Code.exe'),
].find(p => fs.existsSync(p))

async function describe(p) {
  const stat = await fsp.stat(p).catch(() => null)
  if (!stat) return null
  const name = path.basename(p)
  return {
    name,
    path: p,
    isDir: stat.isDirectory(),
    mtime: stat.mtimeMs,
    created: stat.birthtimeMs,
    size: stat.isDirectory() ? 0 : stat.size,
    type: IMAGE_EXT.test(name) ? 'img' : VIDEO_EXT.test(name) ? 'video' : 'file',
    meta: await library.metaFor(p, stat).catch(() => null),
  }
}

let lastWindow = null // the window to reuse when the app is launched again
let chrome = null
let quitting = false
app.on('before-quit', () => { quitting = true })
// Error messages and dialogs follow the language the renderer reports (system locale until then).
let t = translator('en')
let currentLanguage = null
let appearance = null

const FOLDER_SIZE_TTL = 60000
const folderSizes = new Map()

// At most this many file system calls at once: sizing a whole drive must not flood the disk.
const SIZE_CONCURRENCY = 32
let sizeCalls = 0
const sizeQueue = []
async function throttled(fn) {
  if (sizeCalls >= SIZE_CONCURRENCY) await new Promise(resolve => sizeQueue.push(resolve))
  sizeCalls++
  try { return await fn() } finally { sizeCalls--; sizeQueue.shift()?.() }
}

async function walkSize(dir) {
  const entries = await throttled(() => fsp.readdir(dir, { withFileTypes: true })).catch(() => [])
  const sizes = await Promise.all(entries.map(async entry => {
    if (entry.isSymbolicLink()) return 0
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) return walkSize(p)
    return (await throttled(() => fsp.stat(p)).catch(() => null))?.size ?? 0
  }))
  return sizes.reduce((sum, size) => sum + size, 0)
}

const ops = fileOps({ t: (...args) => t(...args), relocate: (from, to) => library.relocate(from, to) })

const libraryFilter = () => [{ name: t('library.fileType'), extensions: ['db'] }]

// Drive letters in use, probed in parallel. A drive that is slow to answer (a mapped network share
// waking up) is listed rather than waited for.
const DRIVE_PROBE_MS = 800
async function connectedDrives() {
  const probe = d => Promise.race([
    fsp.access(d).then(() => d, () => null),
    new Promise(resolve => setTimeout(() => resolve(d), DRIVE_PROBE_MS)),
  ])
  return (await Promise.all([...'CDEFGHIJKLMNOPQRSTUVWXYZ'].map(c => probe(c + ':\\')))).filter(Boolean)
}

/*
 * Search by name in a folder and everything below it, level by level so nearer matches come first.
 * A newer search cancels the one running; results stop at SEARCH_LIMIT.
 */
const SEARCH_LIMIT = 500
let searchGeneration = 0

async function searchTree(dir, query, showHidden) {
  const generation = ++searchGeneration
  const needle = query.toLowerCase()
  const found = []
  let level = [dir]
  while (level.length && found.length < SEARCH_LIMIT) {
    if (generation !== searchGeneration) return null
    const next = []
    await Promise.all(level.map(async d => {
      const entries = await throttled(() => fsp.readdir(d, { withFileTypes: true })).catch(() => [])
      for (const entry of entries) {
        if (STRAY_NUL.test(entry.name) || (!showHidden && HIDDEN.test(entry.name))) continue
        const p = path.join(d, entry.name)
        if (entry.name.toLowerCase().includes(needle)) found.push(p)
        if (entry.isDirectory() && !entry.isSymbolicLink()) next.push(p)
      }
    }))
    level = next
  }
  if (generation !== searchGeneration) return null
  const items = (await Promise.all(found.slice(0, SEARCH_LIMIT).map(describe))).filter(Boolean)
  return { items, truncated: found.length >= SEARCH_LIMIT }
}

/*
 * OneDrive "online-only" files have no local content: reading them (for a text preview, a model
 * thumbnail) would download them. Windows marks them with the recall-on-access, recall-on-open or
 * offline attributes, which Node cannot read, so folders under a OneDrive root are asked once
 * through PowerShell.
 */
const CLOUD_ROOTS = [process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial].filter(Boolean)
const CLOUD_ATTRIBUTES = 0x400000 | 0x40000 | 0x1000
const CLOUD_SCRIPT = `Get-ChildItem -LiteralPath $env:DX_DIR -Force | Where-Object { [int]$_.Attributes -band ${CLOUD_ATTRIBUTES} } | ForEach-Object { $_.Name }`

async function onlineOnlyNames(dir) {
  if (!CLOUD_ROOTS.some(root => lower(dir) === lower(root) || lower(dir).startsWith(lower(root) + path.sep))) return new Set()
  const output = await powershell(CLOUD_SCRIPT, { DIR: dir }).catch(() => '')
  return new Set(output.split(/\r?\n/).filter(Boolean))
}

/*
 * Long file operations tell their window how far they are (at most ten times a second) and can be
 * cancelled from it. kind names the operation for the renderer; total is 0 when unknown.
 */
const operations = new Map()
let operationIds = 0

async function runOperation(win, kind, count, work) {
  const id = ++operationIds
  const controller = new AbortController()
  operations.set(id, controller)
  const send = message => { if (!win.isDestroyed()) win.webContents.send('progress', { id, kind, count, ...message }) }
  let last = 0
  const onProgress = (done, total) => {
    if (Date.now() - last < 100 && done < total) return
    last = Date.now()
    send({ done, total })
  }
  send({ done: 0, total: 0 })
  try {
    return await work({ onProgress, signal: controller.signal })
  } finally {
    operations.delete(id)
    send({ finished: true })
  }
}

const handlers = {
  // Windows opened from another one (Ctrl+N) are secondary: they skip the setup assistant.
  async init() {
    return {
    secondary: !!this.startFolder,
    supportsGlass: SUPPORTS_MICA,
    start: this.startFolder ?? folderArgument(process.argv),
    places: ['desktop', 'pictures', 'videos', 'documents', 'downloads'].map(kind => ({ path: app.getPath(kind), kind })),
    drives: await connectedDrives(),
    }
  },

  // Watches only the window's current folder: a recursive watch on a whole drive is too expensive.
  watch(dir) {
    const win = this
    win.watcher?.close()
    try {
      // The folder going away (deleted, drive removed) shows up as an error or as a flood of events
      // naming the folder itself; watching stops and the renderer moves to a folder that exists.
      const gone = () => {
        current.close()
        if (win.watcher !== current) return
        win.watcher = null
        clearTimeout(win.watchTimer)
        if (!win.isDestroyed()) win.webContents.send('changed')
      }
      const current = win.watcher = fs.watch(dir, (event, name) => {
        if (name && path.isAbsolute(name)) return gone()
        clearTimeout(win.watchTimer)
        win.watchTimer = setTimeout(() => { if (!win.isDestroyed()) win.webContents.send('changed') }, 300)
      })
      current.on('error', gone)
    } catch { win.watcher = null }
  },

  // The folder itself or its closest existing parent; the home folder when the whole drive is gone.
  async nearestFolder(dir) {
    for (let p = dir; ; p = path.dirname(p)) {
      if ((await fsp.stat(p).catch(() => null))?.isDirectory()) return p
      if (path.dirname(p) === p) return os.homedir()
    }
  },

  // denied: the folder exists but Windows refuses to list it (system folders, other users' files).
  // showHidden lists dot files and system entries too, flagged as hidden.
  async list(dir, showHidden = false) {
    let denied = false
    const names = await fsp.readdir(dir).catch(e => { denied = e.code === 'EPERM' || e.code === 'EACCES'; return [] })
    names.filter(n => STRAY_NUL.test(n)).forEach(n => removeStrayNul(path.join(dir, n)))
    const shown = names.filter(n => !STRAY_NUL.test(n) && (showHidden || !HIDDEN.test(n)))
    const cloud = await onlineOnlyNames(dir)
    const items = (await Promise.all(shown.map(async n => {
      const item = await describe(path.join(dir, n))
      return item && { ...item, ...(HIDDEN.test(n) && { hidden: true }), ...(cloud.has(n) && { cloud: true }) }
    }))).filter(Boolean)
    return { folders: items.filter(i => i.isDir), files: items.filter(i => !i.isDir), denied }
  },

  items: async paths => (await Promise.all(paths.map(describe))).filter(Boolean),

  // { items, truncated }, or null when a newer search replaced this one.
  search: (dir, query, showHidden) => searchTree(dir, query, showHidden),

  // Typed path -> existing folder, expanding %VARIABLES% and surrounding quotes; null otherwise.
  async resolveFolder(text) {
    const expanded = text.trim().replace(/^"(.*)"$/, '$1').replace(/%([^%]+)%/g, (m, name) => process.env[name] ?? m)
    if (!path.isAbsolute(expanded)) return null
    const folder = path.normalize(expanded)
    const stat = await fsp.stat(folder).catch(() => null)
    if (!stat?.isDirectory()) return null
    return folder.length > 3 ? folder.replace(/\\+$/, '') : folder
  },

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
    const r = await dialog.showSaveDialog(this, { defaultPath: t('library.defaultName'), filters: libraryFilter() })
    if (r.canceled) return null
    return library.exportTo(r.filePath)
  },

  async importLibrary() {
    const r = await dialog.showOpenDialog(this, { properties: ['openFile'], filters: libraryFilter() })
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

  /*
   * Icon of a program or shortcut, as Windows shows it: a .lnk uses its icon location or its
   * target. Executables give their largest embedded icon; anything else falls back to the shell icon.
   */
  async appIcon(p) {
    let source = p
    let index = 0
    if (/\.lnk$/i.test(p)) {
      try {
        const link = shell.readShortcutLink(p)
        source = link.icon || link.target || p
        index = link.icon ? link.iconIndex : 0
      } catch {}
      source = source.replace(/%([^%]+)%/g, (m, name) => process.env[name] ?? m)
    }
    if (/\.ico$/i.test(source)) {
      const data = await fsp.readFile(source).catch(() => null)
      if (data) return 'data:image/x-icon;base64,' + data.toString('base64')
    }
    if (/\.(exe|dll)$/i.test(source)) {
      const url = await icons.exeIcon(source, index)
      if (url) return url
    }
    try {
      const img = await app.getFileIcon(source, { size: 'large' })
      return img.isEmpty() ? null : img.toDataURL()
    } catch { return null }
  },

  // Whole file as bytes, or null when it is larger than max (used for 3D models).
  async readBinary(p, max) {
    const stat = await fsp.stat(p).catch(() => null)
    if (!stat || stat.size > max) return null
    return fsp.readFile(p)
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
    this.setTitleBarOverlay({ color, symbolColor })
    if (remember) chrome = { color, symbolColor }
  },

  // Keeps system-drawn surfaces (Mica, native dialogs) in the app's theme and toggles the glass material.
  setViewerOpen(open) { this.viewerOpen = !!open },

  copyText: text => clipboard.writeText(text),

  // Errors of the page end up in the same log as the main process ones.
  logError: message => log.error('renderer:', String(message).slice(0, 4000)),

  // Shows the log file in File Explorer, for attaching it to a bug report.
  async showLog() {
    if (!fs.existsSync(log.file())) fs.writeFileSync(log.file(), '')
    shell.showItemInFolder(log.file())
  },

  shellIntegration: () => shellIntegration.isEnabled(),
  defaultFileManager: () => shellIntegration.isDefault(),

  async setDefaultFileManager(enabled) {
    if (enabled) await shellIntegration.setDefault(t('shell.openIn'), launchCommand())
    else await shellIntegration.unsetDefault()
    return shellIntegration.isDefault()
  },

  async setShellIntegration(enabled) {
    if (enabled) {
      await shellIntegration.enable(t('shell.openIn'), launchCommand())
      installModernMenu()
    } else {
      await shellIntegration.disable()
      removeModernMenu()
    }
    return shellIntegration.isEnabled()
  },

  appearance({ theme, glass, language }) {
    if (language && language !== currentLanguage) {
      currentLanguage = language
      t = translator(language)
      // keep the File Explorer entry in the app language
      shellIntegration.isDefault().then(async isDefault => {
        if (isDefault) await shellIntegration.setDefault(t('shell.openIn'), launchCommand())
        else if (await shellIntegration.isEnabled()) await shellIntegration.enable(t('shell.openIn'), launchCommand())
      }).catch(error => log.error('shell integration:', error))
    }
    appearance = { theme, glass: SUPPORTS_MICA && glass }
    nativeTheme.themeSource = theme
    if (!SUPPORTS_MICA) return
    for (const win of BrowserWindow.getAllWindows()) {
      if (appearance.glass) win.setBackgroundColor(TRANSPARENT)
      win.setBackgroundMaterial(appearance.glass ? 'mica' : 'none')
    }
  },

  // Another window on a folder, next to this one.
  newWindow(dir) { createWindow(dir, this) },

  open: p => shell.openPath(p),
  about: () => ({ version: app.getVersion(), url: PROJECT_URL }),
  openProjectPage: () => shell.openExternal(PROJECT_URL),

  // Always File Explorer, even when DevXplorer is the default for folders.
  openInExplorer: dir => launch('explorer.exe', [dir]),
  reveal: p => shell.showItemInFolder(p),

  // The Windows "Open with" chooser.
  openWith: p => launch('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', p]),

  runAsAdmin: p => powershell('Start-Process -LiteralPath $env:DX_P -Verb RunAs', { P: p }).catch(() => null),

  /*
   * Windows Terminal when installed, otherwise the classic command prompt. wt.exe is an app
   * execution alias that only starts through the shell, hence Start-Process. Its -d argument is
   * quoted by hand: a root like C:\ becomes C:\. so the closing quote is not escaped, and ";"
   * is escaped because wt reads it as a command separator.
   */
  openTerminal(dir) {
    const args = `-d "${dir.replace(/\\$/, '\\.').replace(/;/g, '\\;')}"`
    return powershell('try { Start-Process wt.exe -ArgumentList $env:DX_ARGS -ErrorAction Stop } catch { Start-Process cmd.exe -WorkingDirectory $env:DX_DIR }',
      { ARGS: args, DIR: dir }).then(() => null)
  },

  hasVsCode: () => !!VS_CODE,
  openInVsCode: paths => VS_CODE && launch(VS_CODE, paths),

  // A .lnk next to the item, named as Windows names new shortcuts.
  async createShortcut(p) {
    const name = t('shortcut.name', { name: path.basename(p, path.extname(p)) })
    const link = uniquePath(path.join(path.dirname(p), name + '.lnk'))
    if (!shell.writeShortcutLink(link, { target: p })) throw new Error(t('error.shortcut'))
    return link
  },

  // Zips the items into the folder of the first one: "name.zip" for one item, "Archive.zip" for more.
  // Cancelling leaves nothing behind and resolves to null.
  compress(paths) {
    const dir = path.dirname(paths[0])
    const base = paths.length === 1 ? path.basename(paths[0], fs.statSync(paths[0]).isDirectory() ? '' : path.extname(paths[0])) : t('zip.archive')
    const dest = uniquePath(path.join(dir, base + '.zip'))
    return runOperation(this, 'zip', paths.length, async ({ signal }) => {
      try {
        await zip(paths, dest, signal)
        return dest
      } catch (e) {
        if (!signal.aborted) throw e
        await fsp.rm(dest, { force: true }).catch(() => {})
        return null
      }
    })
  },

  // Extracts a .zip into a new folder named after it.
  extract(p) {
    const dest = uniquePath(path.join(path.dirname(p), path.basename(p, path.extname(p))))
    return runOperation(this, 'unzip', 1, async ({ signal }) => {
      try {
        await unzip(p, dest, signal)
        return dest
      } catch (e) {
        if (!signal.aborted) throw e
        await fsp.rm(dest, { recursive: true, force: true }).catch(() => {})
        return null
      }
    })
  },

  cancelOperation(id) { operations.get(id)?.abort() },

  checkForUpdates: () => updates.check(),
  updateState: () => updates.state(),
  // Restarts into the downloaded version; an open preview must not hold the window back.
  installUpdate() {
    quitting = true
    updates.install()
  },

  // Batches return { done: [[from, to]], error | cancelled }, so a partly completed batch can still be undone.
  move(paths, dest) { return runOperation(this, 'move', paths.length, options => ops.move(paths, dest, options)) },
  moveTo: pairs => ops.moveTo(pairs),
  copy(paths, dest) { return runOperation(this, 'copy', paths.length, options => ops.copy(paths, dest, options)) },

  restore: paths => recycle.restore(paths),

  renameMany: pairs => ops.renameMany(pairs),

  // Annotations are kept: a file restored from the Recycle Bin gets its status back.
  async trash(paths) {
    const done = []
    for (const p of paths) {
      try { await shell.trashItem(p) } catch (e) { return { done, error: e.message } }
      done.push(p)
    }
    return { done }
  },

  async mkdir(dir, name) {
    checkName(name)
    const target = uniquePath(path.join(dir, name))
    await fsp.mkdir(target)
    return target
  },

  // An empty file; never replaces an existing one.
  async newFile(dir, name) {
    checkName(name)
    const target = uniquePath(path.join(dir, name))
    await fsp.writeFile(target, '', { flag: 'wx' })
    return target
  },
}

// Handlers run with `this` set to the window that called them.
for (const [name, fn] of Object.entries(handlers)) ipcMain.handle(name, (e, ...args) => fn.apply(BrowserWindow.fromWebContents(e.sender), args))

// A folder passed on the command line (e.g. from a shell "Open with" entry) wins over the last session.
// Explorer passes a drive root as "C:\", whose \" Windows reads as an escaped quote: C:" comes
// back to C:\.
function folderArgument(argv) {
  const appPath = lower(app.getAppPath())
  return argv.slice(1).map(a => a.replace(/^([a-z]:)"\s*$/i, '$1\\')).find(a =>
    !a.startsWith('-') && a !== '.' && lower(path.resolve(a)) !== appPath &&
    fs.existsSync(a) && fs.statSync(a).isDirectory())
}

// The Windows 11 menu package: shipped with the installed app, built into assets/shellext in a checkout.
const MODERN_MENU = app.isPackaged ? path.join(process.resourcesPath, 'shellext') : path.join(__dirname, '..', '..', 'assets', 'shellext')
// Registering and removing the package run one after the other, so a quick off after on never
// leaves it behind.
let modernMenuQueue = Promise.resolve()
// Only the installed app manages it: a development run would replace the installed app's package.
const queueModernMenu = work => app.isPackaged
  ? (modernMenuQueue = modernMenuQueue.then(work).catch(error => log.error('context menu package:', error)))
  : modernMenuQueue
const installModernMenu = () => queueModernMenu(() => shellIntegration.installModernMenu(MODERN_MENU, path.join(DATA_DIR, 'shellext'), app.getVersion()))
const removeModernMenu = () => queueModernMenu(() => shellIntegration.removeModernMenu())

// The project's home, shown in the About section and the listing.
const PROJECT_URL = require('../../package.json').homepage

// How Windows should start the app: the packaged executable, or Electron with the project path.
const launchCommand = () => app.isPackaged ? [process.execPath] : [process.execPath, app.getAppPath()]

// One app instance: launching again (e.g. from File Explorer) opens the folder in a new tab of the
// window used last.
if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', (e, argv) => {
  const win = BrowserWindow.getFocusedWindow() || lastWindow
  if (!win || win.isDestroyed()) return
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

const CRASH_LIMIT = 3
const CRASH_WINDOW_MS = 60000

/*
 * Opens a window on startFolder (null: the folder passed on the command line, or the Desktop). A window
 * opened from another one cascades from its position.
 */
function createWindow(startFolder = null, from = null) {
  const saved = readJson(WINDOW_FILE, {})
  const bounds = from ? { ...from.getNormalBounds(), x: from.getNormalBounds().x + 30, y: from.getNormalBounds().y + 30 } : saved.bounds
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    ...bounds,
    title: app.getName(),
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    backgroundColor: appearance.glass ? TRANSPARENT : chrome.color,
    ...(appearance.glass && { backgroundMaterial: 'mica' }),
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...chrome, height: 40 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  })
  win.startFolder = startFolder
  lastWindow = win
  win.on('focus', () => { lastWindow = win })
  if (!from && saved.maximized) win.maximize()
  // The window only ever shows the app: no new windows, and no navigation away (a file dropped
  // outside a drop zone would otherwise replace the page). Reloading the app itself is allowed.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', e => { if (e.url !== win.webContents.getURL()) e.preventDefault() })
  // While a preview is open, the window's close button (or Alt+F4) closes the preview instead:
  // users read the X in the corner as "close what I am looking at". Quitting the app or ending the
  // Windows session must never be held back by this.
  win.on('session-end', () => { quitting = true })
  win.on('close', e => {
    if (win.viewerOpen && !quitting) {
      e.preventDefault()
      win.webContents.send('close-viewer')
      return
    }
    win.watcher?.close()
    writeJson(WINDOW_FILE, { bounds: win.getNormalBounds(), maximized: win.isMaximized(), chrome, appearance })
  })
  // A page that crashes is reloaded; if it keeps crashing the user is told instead of looping.
  const crashes = []
  win.webContents.on('render-process-gone', (e, details) => {
    log.error('renderer gone:', details.reason, 'exit code', details.exitCode)
    if (details.reason === 'clean-exit' || win.isDestroyed()) return
    const now = Date.now()
    crashes.push(now)
    if (crashes.filter(at => now - at < CRASH_WINDOW_MS).length < CRASH_LIMIT) return win.reload()
    dialog.showMessageBox(win, { type: 'error', message: t('crash.title'), detail: t('crash.detail', { file: log.file() }) })
  })
  win.on('unresponsive', () => log.error('window not responding'))
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
  return win
}

app.whenReady().then(() => {
  t = translator(pickLanguage(app.getLocale()))
  fs.mkdirSync(DATA_DIR, { recursive: true })
  library.open(path.join(DATA_DIR, 'library.db'))
  Menu.setApplicationMenu(null)
  const saved = readJson(WINDOW_FILE, {})
  chrome = saved.chrome ?? { color: BG, symbolColor: SYMBOLS }
  appearance = saved.appearance ?? { theme: 'system', glass: SUPPORTS_MICA }
  nativeTheme.themeSource = appearance.theme
  createWindow().webContents.once('did-finish-load', () => library.prune().catch(() => {}))
  updates.start()
  // An update brings a new menu package: register it if the integration is on.
  shellIntegration.isEnabled().then(on => on && installModernMenu())
})

app.on('window-all-closed', () => {
  library.close()
  app.quit()
})
