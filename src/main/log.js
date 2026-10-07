/*
 * Error log in the app's data folder, for diagnosing problems reported by users. The file is
 * capped: past LIMIT it becomes devxplorer.old.log (replacing the previous one) and a new one starts.
 */
const fs = require('fs')
const path = require('path')

const LIMIT = 1024 * 1024
let file = null

function init(dir) {
  fs.mkdirSync(dir, { recursive: true })
  file = path.join(dir, 'devxplorer.log')
}

function write(level, message) {
  if (!file) return
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > LIMIT) fs.renameSync(file, file.replace(/\.log$/, '.old.log'))
    fs.appendFileSync(file, `${new Date().toISOString()} ${level} ${message}\n`)
  } catch {
    // logging must never take the app down
  }
}

const describe = value => value instanceof Error ? value.stack || value.message : String(value)

module.exports = {
  init,
  error: (...parts) => write('ERROR', parts.map(describe).join(' ')),
  info: (...parts) => write('INFO', parts.map(describe).join(' ')),
  file: () => file,
}
