/*
 * Moving, copying and renaming files. Batches report what they completed even when an item fails
 * halfway, so the completed part can still be undone; nothing is ever overwritten.
 *
 * Built with the translator (for error messages) and a relocate(from, to) hook that keeps
 * annotations attached to moved items.
 *
 * Copies (and moves across drives) go file by file, so they can report progress through
 * onProgress(doneBytes, totalBytes) and stop when signal aborts; a batch stopped this way reports
 * cancelled: true and leaves no partial copy behind.
 */
const fsp = require('fs').promises
const fs = require('fs')
const path = require('path')
const { pipeline } = require('stream/promises')
const { validName, uniquePath } = require('./paths')

const lower = p => p.toLowerCase()
const isUnder = (p, dir) => lower(p) === lower(dir) || lower(p).startsWith(lower(dir).replace(/\\$/, '') + path.sep)
const sameDrive = (a, b) => lower(path.parse(a).root) === lower(path.parse(b).root)

// Total bytes of files and folder trees; links are not followed.
async function treeSize(p) {
  const stat = await fsp.lstat(p).catch(() => null)
  if (!stat?.isDirectory()) return stat?.size ?? 0
  const sizes = await Promise.all((await fsp.readdir(p).catch(() => [])).map(name => treeSize(path.join(p, name))))
  return sizes.reduce((a, b) => a + b, 0)
}

// Copies a file or folder tree with its dates, calling tick(bytes) as data is written.
async function copyTree(from, to, tick, signal) {
  signal?.throwIfAborted()
  const stat = await fsp.lstat(from)
  if (stat.isSymbolicLink()) return fsp.cp(from, to, { errorOnExist: true, force: false, verbatimSymlinks: true })
  if (stat.isDirectory()) {
    await fsp.mkdir(to)
    for (const name of await fsp.readdir(from)) await copyTree(path.join(from, name), path.join(to, name), tick, signal)
  } else {
    const source = fs.createReadStream(from)
    source.on('data', chunk => tick(chunk.length))
    await pipeline(source, fs.createWriteStream(to, { flags: 'wx' }), ...(signal ? [{ signal }] : []))
  }
  await fsp.utimes(to, stat.atimeMs / 1000, stat.mtimeMs / 1000)
}

// The copy is removed when it fails or is cancelled halfway.
async function copyOrClean(from, to, tick, signal) {
  try {
    await copyTree(from, to, tick, signal)
  } catch (e) {
    await fsp.rm(to, { recursive: true, force: true }).catch(() => {})
    throw e
  }
}

module.exports = function fileOps({ t, relocate = () => {} }) {
  const checkName = name => { if (!validName(name)) throw new Error(t('error.invalidName', { name })) }

  // Across drives a rename is impossible: the item is copied with its dates, then the original is
  // removed. A copy that fails halfway is removed so no partial tree is left behind.
  async function moveItem(from, to, tick = () => {}, signal = null) {
    try {
      await fsp.rename(from, to)
    } catch (e) {
      if (e.code !== 'EXDEV') throw e
      await copyOrClean(from, to, tick, signal)
      await fsp.rm(from, { recursive: true })
    }
    relocate(from, to)
  }

  /*
   * Runs step(item, tick) for each item; returns { done: [results], error } or { done, cancelled }
   * instead of throwing midway. measure: whether progress is worth sizing the items up front.
   */
  async function batch(items, step, { onProgress, signal, measure = true } = {}) {
    let total = 0
    let copied = 0
    if (onProgress && measure) total = (await Promise.all(items.map(item => treeSize(Array.isArray(item) ? item[0] : item)))).reduce((a, b) => a + b, 0)
    const tick = bytes => { copied += bytes; onProgress?.(copied, total) }
    const done = []
    for (const item of items) {
      try {
        signal?.throwIfAborted()
        const result = await step(item, tick, signal)
        if (result) done.push(result)
      } catch (e) {
        if (signal?.aborted) return { done, cancelled: true }
        return { done, error: e.message }
      }
    }
    return { done }
  }

  return {
    moveItem,

    // done: [[from, to]] for every item actually moved. Only moves across drives copy data.
    move: (paths, dest, options = {}) => batch(paths, async (p, tick, signal) => {
      if (lower(path.dirname(p)) === lower(dest) || isUnder(dest, p)) return null
      const to = uniquePath(path.join(dest, path.basename(p)))
      await moveItem(p, to, tick, signal)
      return [p, to]
    }, { ...options, measure: paths.some(p => !sameDrive(p, dest)) }),

    // Moves each item to an exact path, used to undo moves.
    moveTo: pairs => batch(pairs, async ([from, to]) => {
      if (fs.existsSync(to)) throw new Error(t('error.exists', { name: path.basename(to) }))
      await moveItem(from, to)
      return [from, to]
    }),

    // Copies next to the destination's existing items ("name (2)" on clashes); done: [[from, to]].
    copy: (paths, dest, options = {}) => batch(paths, async (p, tick, signal) => {
      if (isUnder(dest, p) && lower(path.dirname(p)) !== lower(dest)) return null
      const to = uniquePath(path.join(dest, path.basename(p)))
      await copyOrClean(p, to, tick, signal)
      return [p, to]
    }, options),

    /*
     * pairs: [[path, newName]]. Items first get temporary names so that swaps and renumbering
     * within a folder never collide. If any step fails, every item gets its original name back.
     */
    async renameMany(pairs) {
      const sources = new Set(pairs.map(([p]) => lower(p)))
      const targets = pairs.map(([p, name]) => { checkName(name); return path.join(path.dirname(p), name) })
      if (new Set(targets.map(lower)).size !== targets.length) throw new Error(t('error.duplicateNames'))
      for (const target of targets) {
        if (fs.existsSync(target) && !sources.has(lower(target))) throw new Error(t('error.exists', { name: path.basename(target) }))
      }
      const stamp = Date.now()
      const staged = [] // [temporary, original]
      const renamed = [] // indexes already at their target
      try {
        for (const [i, [p]] of pairs.entries()) {
          const tmp = path.join(path.dirname(p), `.~ren${stamp}_${i}`)
          await fsp.rename(p, tmp)
          staged.push([tmp, p])
        }
        for (const [i, [tmp]] of staged.entries()) {
          await fsp.rename(tmp, targets[i])
          renamed.push(i)
        }
      } catch (e) {
        // Back to temporary names first, so no original name is still taken by a renamed item.
        for (const i of renamed) await fsp.rename(targets[i], staged[i][0]).catch(() => {})
        for (const [tmp, p] of staged) await fsp.rename(tmp, p).catch(() => {})
        throw e
      }
      pairs.forEach(([p], i) => relocate(p, targets[i]))
      return true
    },
  }
}
