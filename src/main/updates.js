/*
 * Updates from the GitHub releases of the project. The app checks shortly after starting and on
 * request, downloads a new version in the background and installs it on restart (or on quit).
 * Every window is told the current state: idle, checking, latest, downloading (percent), ready,
 * error, dev when running from source, or store when the Microsoft Store updates the app.
 */
const { app, BrowserWindow } = require('electron')
const { autoUpdater } = require('electron-updater')
const log = require('./log')

const FIRST_CHECK_MS = 5000
let state = { status: 'idle' }

function set(next) {
  state = { ...next, current: app.getVersion() }
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('update', state)
}

function check() {
  if (process.windowsStore) return set({ status: 'store' })
  if (!app.isPackaged) return set({ status: 'dev' })
  autoUpdater.checkForUpdates().catch(error => log.error('update check:', error))
}

function start() {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = { info: () => {}, warn: message => log.info('update:', message), error: message => log.error('update:', message), debug: () => {} }
  autoUpdater.on('checking-for-update', () => set({ status: 'checking' }))
  autoUpdater.on('update-not-available', () => set({ status: 'latest' }))
  autoUpdater.on('update-available', info => set({ status: 'downloading', version: info.version, percent: 0 }))
  autoUpdater.on('download-progress', progress => set({ ...state, status: 'downloading', percent: Math.round(progress.percent) }))
  autoUpdater.on('update-downloaded', info => set({ status: 'ready', version: info.version }))
  autoUpdater.on('error', () => set({ status: 'error' }))
  setTimeout(check, FIRST_CHECK_MS)
}

module.exports = {
  start,
  check,
  state: () => ({ ...state, current: app.getVersion() }),
  install: () => autoUpdater.quitAndInstall(),
}
