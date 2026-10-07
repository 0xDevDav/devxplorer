const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const log = require('../src/main/log')

test('writes errors with their stack and rotates past the size limit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dx-log-'))
  try {
    log.init(dir)
    log.error('boom', new Error('broken'))
    const text = fs.readFileSync(log.file(), 'utf8')
    assert.match(text, /ERROR boom Error: broken\n\s+at /)

    fs.appendFileSync(log.file(), 'x'.repeat(1024 * 1024 + 1))
    log.info('after rotation')
    assert.ok(fs.existsSync(path.join(dir, 'devxplorer.old.log')))
    assert.match(fs.readFileSync(log.file(), 'utf8'), /^\S+ INFO after rotation\n$/)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
