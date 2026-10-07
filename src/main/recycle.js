/*
 * Restores items from the Windows Recycle Bin, used to undo a deletion.
 *
 * Each deleted item lives in <drive>\$Recycle.Bin\<user SID>\ as a pair of entries with the same
 * suffix: "$R…" is the item itself and "$I…" records its original path and deletion time.
 * Restoring moves "$R…" back to the original path and removes "$I…", as Windows does.
 */
const fsp = require('fs').promises
const path = require('path')

// Parses an "$I" record: version 1 (Windows Vista to 8.1) or 2 (Windows 10 and later).
function parseIndex(buf) {
  if (buf.length < 24) return null
  const version = Number(buf.readBigUInt64LE(0))
  const deletedAt = buf.readBigUInt64LE(16)
  let original
  if (version === 2 && buf.length >= 28) original = buf.toString('utf16le', 28, 28 + buf.readUInt32LE(24) * 2)
  else if (version === 1) original = buf.toString('utf16le', 24, 24 + 520)
  else return null
  return { original: original.replace(/\0.*$/s, ''), deletedAt }
}

// Moves the most recently deleted copy of each path back to its original location.
// The bin can hold thousands of records, so they are scanned once and read in parallel.
async function restore(paths) {
  const wanted = new Set(paths.map(p => p.toLowerCase()))
  const latest = new Map()
  for (const root of new Set(paths.map(p => path.parse(p).root))) {
    const bin = path.join(root, '$Recycle.Bin')
    for (const sid of await fsp.readdir(bin).catch(() => [])) {
      const dir = path.join(bin, sid)
      const names = (await fsp.readdir(dir).catch(() => [])).filter(n => n.startsWith('$I'))
      await Promise.all(names.map(async name => {
        const record = parseIndex(await fsp.readFile(path.join(dir, name)).catch(() => Buffer.alloc(0)))
        const key = record?.original.toLowerCase()
        if (!record || !wanted.has(key)) return
        if (!latest.has(key) || record.deletedAt > latest.get(key).deletedAt) latest.set(key, { ...record, dir, suffix: name.slice(2) })
      }))
    }
  }

  const restored = []
  for (const { original, dir, suffix } of latest.values()) {
    await fsp.mkdir(path.dirname(original), { recursive: true })
    await fsp.rename(path.join(dir, '$R' + suffix), original)
    await fsp.rm(path.join(dir, '$I' + suffix), { force: true })
    restored.push(original)
  }
  return restored
}

module.exports = { restore, parseIndex }
