/*
 * Moving, copying and renaming files. Batches report what they completed even when an item fails
 * halfway, so the completed part can still be undone; nothing is ever overwritten.
 *
 * Built with the translator (for error messages) and a relocate(from, to) hook that keeps
 * annotations attached to moved items.
 */
const fsp = require('fs').promises
const fs = require('fs')
const path = require('path')
const { validName, uniquePath } = require('./paths')

const lower = p => p.toLowerCase()
const isUnder = (p, dir) => lower(p) === lower(dir) || lower(p).startsWith(lower(dir).replace(/\\$/, '') + path.sep)

module.exports = function fileOps({ t, relocate = () => {} }) {
  const checkName = name => { if (!validName(name)) throw new Error(t('error.invalidName', { name })) }

  // Across drives a rename is impossible: the item is copied with its dates, then the original is
  // removed. A copy that fails halfway is removed so no partial tree is left behind.
  async function moveItem(from, to) {
    try {
      await fsp.rename(from, to)
    } catch (e) {
      if (e.code !== 'EXDEV') throw e
      try {
        await fsp.cp(from, to, { recursive: true, preserveTimestamps: true, errorOnExist: true, force: false })
      } catch (copyError) {
        await fsp.rm(to, { recursive: true, force: true }).catch(() => {})
        throw copyError
      }
      await fsp.rm(from, { recursive: true })
    }
    relocate(from, to)
  }

  // Runs step(item) for each item; returns { done: [results], error } instead of throwing midway.
  async function batch(items, step) {
    const done = []
    for (const item of items) {
      try {
        const result = await step(item)
        if (result) done.push(result)
      } catch (e) {
        return { done, error: e.message }
      }
    }
    return { done }
  }

  return {
    moveItem,

    // done: [[from, to]] for every item actually moved.
    move: (paths, dest) => batch(paths, async p => {
      if (lower(path.dirname(p)) === lower(dest) || isUnder(dest, p)) return null
      const to = uniquePath(path.join(dest, path.basename(p)))
      await moveItem(p, to)
      return [p, to]
    }),

    // Moves each item to an exact path, used to undo moves.
    moveTo: pairs => batch(pairs, async ([from, to]) => {
      if (fs.existsSync(to)) throw new Error(t('error.exists', { name: path.basename(to) }))
      await moveItem(from, to)
      return [from, to]
    }),

    // Copies next to the destination's existing items ("name (2)" on clashes); done: [[from, to]].
    copy: (paths, dest) => batch(paths, async p => {
      if (isUnder(dest, p) && lower(path.dirname(p)) !== lower(dest)) return null
      const to = uniquePath(path.join(dest, path.basename(p)))
      await fsp.cp(p, to, { recursive: true, preserveTimestamps: true, errorOnExist: true, force: false })
      return [p, to]
    }),

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
