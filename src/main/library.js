/*
 * Annotation store backed by SQLite.
 *
 * Files are identified by content: key = "file:<size>:<hash>", where the hash covers the whole
 * file when small, or three 64 KB samples (start, middle, end) otherwise. Annotations therefore
 * follow a file wherever it is moved or renamed, by any program, and identical copies share them.
 * Folders have no stable content, so they are identified by path ("dir:<path>") and followed
 * when moved or renamed through this app.
 *
 * Tables
 *   annotations (key, field, value)       one row per value; "tag" is multi-valued, other fields single-valued
 *   locations   (path, size, mtime, key)  last known path of each key, also used as fingerprint cache
 */
const { DatabaseSync } = require('node:sqlite')
const crypto = require('crypto')
const fs = require('fs')
const fsp = fs.promises
const path = require('path')

const SAMPLE = 64 * 1024
const MULTI_VALUED = new Set(['tag'])
const ANNOTATIONS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS annotations (
    key   TEXT NOT NULL,
    field TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (key, field, value)
  );`

let db = null
let q = null
// Only files whose size matches an annotated file can carry annotations, so all others skip hashing.
let annotatedSizes = new Set()

const isUnder = (p, dir) => {
  const a = p.toLowerCase()
  const b = dir.toLowerCase().replace(/\\$/, '')
  return a === b || a.startsWith(b + path.sep)
}

function transaction(fn) {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

function close() {
  db?.close()
  db = null
}

function open(file) {
  close()
  db = new DatabaseSync(file)
  db.exec(`
    PRAGMA journal_mode = WAL;
    ${ANNOTATIONS_SCHEMA}
    CREATE TABLE IF NOT EXISTS locations (
      path  TEXT PRIMARY KEY,
      size  INTEGER NOT NULL,
      mtime REAL NOT NULL,
      key   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS locations_key ON locations (key);
  `)
  q = {
    location: db.prepare('SELECT size, mtime, key FROM locations WHERE path = ?'),
    putLocation: db.prepare('INSERT OR REPLACE INTO locations (path, size, mtime, key) VALUES (?, ?, ?, ?)'),
    dropLocation: db.prepare('DELETE FROM locations WHERE path = ?'),
    allLocations: db.prepare('SELECT path, size, mtime, key FROM locations'),
    annotatedLocations: db.prepare('SELECT path FROM locations WHERE key IN (SELECT key FROM annotations)'),
    values: db.prepare('SELECT field, value FROM annotations WHERE key = ?'),
    all: db.prepare('SELECT key, field, value FROM annotations ORDER BY key'),
    fileKeys: db.prepare("SELECT DISTINCT key FROM annotations WHERE key LIKE 'file:%'"),
    add: db.prepare('INSERT OR IGNORE INTO annotations (key, field, value) VALUES (?, ?, ?)'),
    remove: db.prepare('DELETE FROM annotations WHERE key = ? AND field = ? AND value = ?'),
    clearField: db.prepare('DELETE FROM annotations WHERE key = ? AND field = ?'),
    rekey: db.prepare('UPDATE OR REPLACE annotations SET key = ? WHERE key = ?'),
  }
  transaction(() => {
    for (const row of q.allLocations.all()) if (!fs.existsSync(row.path)) q.dropLocation.run(row.path)
  })
  loadSizes()
}

function loadSizes() {
  annotatedSizes = new Set(q.fileKeys.all().map(r => Number(r.key.split(':')[1])))
}

async function fingerprint(p, size) {
  const hash = crypto.createHash('sha256')
  const fh = await fsp.open(p)
  try {
    if (size <= SAMPLE * 3) {
      hash.update(await fh.readFile())
    } else {
      for (const offset of [0, Math.floor((size - SAMPLE) / 2), size - SAMPLE]) {
        const buffer = Buffer.alloc(SAMPLE)
        await fh.read(buffer, 0, SAMPLE, offset)
        hash.update(buffer)
      }
    }
  } finally {
    await fh.close()
  }
  return `file:${size}:${hash.digest('hex').slice(0, 32)}`
}

async function keyFor(p, stat, force = false) {
  if (stat.isDirectory()) return 'dir:' + p.toLowerCase()
  if (!force && !annotatedSizes.has(stat.size)) return null
  const known = q.location.get(p)
  if (known && known.size === stat.size && known.mtime === stat.mtimeMs) return known.key
  const key = await fingerprint(p, stat.size)
  q.putLocation.run(p, stat.size, stat.mtimeMs, key)
  return key
}

function toMeta(rows) {
  if (!rows.length) return null
  const meta = { tags: [] }
  for (const { field, value } of rows) {
    if (field === 'tag') meta.tags.push(value)
    else meta[field] = value
  }
  return meta
}

async function metaFor(p, stat) {
  const key = await keyFor(p, stat)
  return key ? toMeta(q.values.all(key)) : null
}

// op: { status } sets or clears the status, { add } / { remove } edit tags.
async function annotate(p, stat, op) {
  const key = await keyFor(p, stat, true)
  if (stat.isDirectory()) q.putLocation.run(p, 0, 0, key)
  transaction(() => {
    if ('status' in op) {
      q.clearField.run(key, 'status')
      if (op.status) q.add.run(key, 'status', op.status)
    }
    if (op.add) q.add.run(key, 'tag', op.add)
    if (op.remove) q.remove.run(key, 'tag', op.remove)
  })
  loadSizes()
}

// Keeps locations and folder keys in sync after a move or rename made by this app.
function relocate(from, to) {
  transaction(() => {
    for (const row of q.allLocations.all()) {
      if (!isUnder(row.path, from)) continue
      const next = to + row.path.slice(from.length)
      const key = row.key.startsWith('dir:') ? 'dir:' + next.toLowerCase() : row.key
      q.dropLocation.run(row.path)
      q.putLocation.run(next, row.size, row.mtime, key)
      if (key !== row.key) q.rekey.run(key, row.key)
    }
  })
}

const knownLocations = () => q.annotatedLocations.all().map(r => r.path)

function allMeta() {
  const byKey = new Map()
  for (const row of q.all.all()) {
    if (!byKey.has(row.key)) byKey.set(row.key, [])
    byKey.get(row.key).push(row)
  }
  return [...byKey.values()].map(toMeta)
}

/*
 * Exports file annotations only: folder keys are local paths, meaningless on another PC,
 * and would disclose the local folder structure to whoever receives the file.
 */
function exportTo(file) {
  fs.rmSync(file, { force: true })
  const out = new DatabaseSync(file)
  try {
    out.exec(ANNOTATIONS_SCHEMA)
    const insert = out.prepare('INSERT OR IGNORE INTO annotations (key, field, value) VALUES (?, ?, ?)')
    const rows = q.all.all().filter(r => r.key.startsWith('file:'))
    out.exec('BEGIN')
    for (const r of rows) insert.run(r.key, r.field, r.value)
    out.exec('COMMIT')
    return new Set(rows.map(r => r.key)).size
  } finally {
    out.close()
  }
}

// Merges another library: imported single-valued fields win, tags are added.
function importFrom(file) {
  const source = new DatabaseSync(file, { readOnly: true })
  try {
    const rows = source.prepare('SELECT key, field, value FROM annotations').all()
      .filter(r => /^file:\d+:[0-9a-f]{32}$/.test(r.key))
    transaction(() => {
      for (const r of rows) if (!MULTI_VALUED.has(r.field)) q.clearField.run(r.key, r.field)
      for (const r of rows) q.add.run(r.key, r.field, r.value)
    })
    loadSizes()
    return new Set(rows.map(r => r.key)).size
  } finally {
    source.close()
  }
}

module.exports = { open, close, metaFor, annotate, relocate, knownLocations, allMeta, exportTo, importFrom }
