/*
 * Reads the largest icon embedded in a Windows executable or DLL, as the shell does for its
 * jumbo icons. The PE resource section is parsed directly; PNG images are returned as PNG and
 * bitmap images are wrapped in a single-entry .ico, which Chromium decodes.
 */
const fsp = require('node:fs/promises')

const RT_ICON = 3
const RT_GROUP_ICON = 14
const MAX_RESOURCES = 64 * 1024 * 1024

async function readAt(fh, position, length) {
  const buf = Buffer.alloc(length)
  const { bytesRead } = await fh.read(buf, 0, length, position)
  return buf.subarray(0, bytesRead)
}

// The resource section as a buffer plus a function mapping RVAs into it, or null.
async function resourceSection(fh) {
  const dos = await readAt(fh, 0, 64)
  if (dos.length < 64 || dos.toString('latin1', 0, 2) !== 'MZ') return null
  const pe = dos.readUInt32LE(0x3c)
  const head = await readAt(fh, pe, 24 + 240)
  if (head.length < 24 || head.readUInt32LE(0) !== 0x4550) return null
  const sections = head.readUInt16LE(6)
  const optSize = head.readUInt16LE(20)
  const magic = head.readUInt16LE(24)
  const dirOffset = 24 + (magic === 0x20b ? 128 : 112)
  if (dirOffset + 8 > head.length) return null
  const rva = head.readUInt32LE(dirOffset)
  if (!rva) return null

  const table = await readAt(fh, pe + 24 + optSize, sections * 40)
  for (let i = 0; i + 40 <= table.length; i += 40) {
    const va = table.readUInt32LE(i + 12)
    const span = Math.max(table.readUInt32LE(i + 8), table.readUInt32LE(i + 16))
    if (rva < va || rva >= va + span) continue
    const rawSize = table.readUInt32LE(i + 16)
    if (rawSize > MAX_RESOURCES) return null
    const data = await readAt(fh, table.readUInt32LE(i + 20), rawSize)
    return { data, root: rva - va, toOffset: r => r - va }
  }
  return null
}

// Entries of a resource directory: { id (null when named), offset, isDir }, in Windows order.
function entries(data, at) {
  const count = data.readUInt16LE(at + 12) + data.readUInt16LE(at + 14)
  const list = []
  for (let i = 0; i < count; i++) {
    const name = data.readUInt32LE(at + 16 + i * 8)
    const target = data.readUInt32LE(at + 20 + i * 8)
    list.push({ id: name & 0x80000000 ? null : name, offset: target & 0x7fffffff, isDir: !!(target & 0x80000000) })
  }
  return list
}

// Bytes of the first language variant below a resource name entry.
// A resource tree has three levels (type, name, language); deeper means a corrupt or looping file.
function leaf(section, entry) {
  const { data, root, toOffset } = section
  for (let depth = 0; entry?.isDir; depth++) {
    if (depth === 3) return null
    entry = entries(data, root + entry.offset)[0]
  }
  if (!entry) return null
  const at = root + entry.offset
  const start = toOffset(data.readUInt32LE(at))
  return data.subarray(start, start + data.readUInt32LE(at + 4))
}

// index >= 0 is the position among icon groups, index < 0 the resource id, as in IconLocation.
async function exeIcon(file, index = 0) {
  let fh
  try {
    fh = await fsp.open(file)
    const section = await resourceSection(fh)
    if (!section) return null
    const { data, root } = section
    const types = entries(data, root)
    const groupType = types.find(t => t.id === RT_GROUP_ICON && t.isDir)
    const iconType = types.find(t => t.id === RT_ICON && t.isDir)
    if (!groupType || !iconType) return null
    const groups = entries(data, root + groupType.offset)
    const group = index < 0 ? groups.find(g => g.id === -index) : groups[index]
    const dir = group && leaf(section, group)
    if (!dir || dir.length < 6) return null

    let best = null
    for (let i = 0, n = dir.readUInt16LE(4); i < n && 6 + i * 14 + 14 <= dir.length; i++) {
      const e = 6 + i * 14
      const candidate = { width: dir[e] || 256, bits: dir.readUInt16LE(e + 6), id: dir.readUInt16LE(e + 12), entry: dir.subarray(e, e + 8) }
      if (!best || candidate.width > best.width || (candidate.width === best.width && candidate.bits > best.bits)) best = candidate
    }
    const iconEntry = best && entries(data, root + iconType.offset).find(x => x.id === best.id)
    const image = iconEntry && leaf(section, iconEntry)
    if (!image?.length) return null
    // PNG icons are returned as they are: some declare a size in the group that differs from the
    // image (512px icons stored as 256), which the ico decoder rejects.
    if (image.readUInt32BE(0) === 0x89504e47) return 'data:image/png;base64,' + image.toString('base64')

    const header = Buffer.alloc(22)
    header.writeUInt16LE(1, 2)
    header.writeUInt16LE(1, 4)
    best.entry.copy(header, 6)
    header.writeUInt32LE(image.length, 14)
    header.writeUInt32LE(22, 18)
    return 'data:image/x-icon;base64,' + Buffer.concat([header, image]).toString('base64')
  } catch {
    return null
  } finally {
    await fh?.close()
  }
}

module.exports = { exeIcon }
