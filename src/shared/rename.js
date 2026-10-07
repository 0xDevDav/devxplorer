/*
 * New names for a batch rename, like the Finder's "Rename items" sheet. The extension is never
 * touched: every mode works on the part of the name before it.
 *
 *   { mode: 'replace', find, replace }        replaces every occurrence of find (case-insensitive)
 *   { mode: 'add', text, where: 'before' | 'after' }
 *   { mode: 'format', name, start, where: 'after' | 'before' }
 *     after:  "Holiday 1", "Holiday 2"…   before: "01 Holiday", "02 Holiday"… (sorts in order)
 */
function splitName(name) {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
}

function batchNames(names, options) {
  const start = Number.isFinite(options.start) ? options.start : 1
  const digits = Math.max(2, String(start + names.length - 1).length)
  return names.map((name, i) => {
    const [stem, ext] = splitName(name)
    if (options.mode === 'replace') {
      if (!options.find) return name
      const pattern = new RegExp(options.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      return stem.replace(pattern, () => options.replace ?? '') + ext
    }
    if (options.mode === 'add') {
      return (options.where === 'before' ? options.text + stem : stem + options.text) + ext
    }
    const number = String(start + i)
    const base = options.name?.trim() || stem
    return (options.where === 'before' ? number.padStart(digits, '0') + ' ' + base : base + ' ' + number) + ext
  })
}

if (typeof module !== 'undefined') module.exports = { batchNames }
