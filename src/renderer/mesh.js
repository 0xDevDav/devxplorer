/*
 * 3D mesh loading for previews: STL (binary and ASCII), OBJ, PLY and 3MF, with no dependencies.
 * Every format is reduced to a flat Float32Array of triangle vertices (x, y, z for each corner),
 * plus whether the format is conventionally Z-up (3D printing) so the viewer can stand it upright.
 * Shared with the tests through CommonJS when loaded in Node.
 */
const MESH_EXT = /\.(stl|obj|ply|3mf)$/i

const decodeText = bytes => new TextDecoder().decode(bytes)
const dataView = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

async function parseMesh(name, bytes) {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  if (ext === 'stl') return { positions: parseStl(bytes), zUp: true, units: 'mm' }
  if (ext === '3mf') return { positions: await parse3mf(bytes), zUp: true, units: 'mm' }
  if (ext === 'ply') return { positions: parsePly(bytes), zUp: true, units: '' }
  if (ext === 'obj') return { positions: parseObj(decodeText(bytes)), zUp: false, units: '' }
  throw new Error('Unsupported mesh format: ' + ext)
}

/* ---------- STL ---------- */

// Binary STL is recognised by its exact size (84-byte header + 50 bytes per triangle), since some
// binary files still start with the word "solid" used by the ASCII flavour.
function parseStl(bytes) {
  if (bytes.byteLength >= 84) {
    const view = dataView(bytes)
    const count = view.getUint32(80, true)
    if (84 + count * 50 === bytes.byteLength) {
      const out = new Float32Array(count * 9)
      for (let i = 0; i < count; i++) {
        const offset = 84 + i * 50 + 12 // skip the stored normal, recomputed later
        for (let k = 0; k < 9; k++) out[i * 9 + k] = view.getFloat32(offset + k * 4, true)
      }
      return out
    }
  }
  const values = []
  for (const m of decodeText(bytes).matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) values.push(+m[1], +m[2], +m[3])
  return new Float32Array(values)
}

/* ---------- OBJ ---------- */

function parseObj(text) {
  const vertices = []
  const out = []
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.trim().split(/\s+/)
      vertices.push(+x, +y, +z)
    } else if (line.startsWith('f ')) {
      // "f a/b/c ...": only the vertex index matters; negative indices count from the end
      const corners = line.trim().split(/\s+/).slice(1).map(token => {
        const i = parseInt(token, 10)
        return i < 0 ? vertices.length / 3 + i : i - 1
      })
      for (let k = 1; k + 1 < corners.length; k++) {
        for (const i of [corners[0], corners[k], corners[k + 1]]) out.push(vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2])
      }
    }
  }
  return new Float32Array(out)
}

/* ---------- PLY ---------- */

const PLY_TYPES = {
  char: ['Int8', 1], int8: ['Int8', 1], uchar: ['Uint8', 1], uint8: ['Uint8', 1],
  short: ['Int16', 2], int16: ['Int16', 2], ushort: ['Uint16', 2], uint16: ['Uint16', 2],
  int: ['Int32', 4], int32: ['Int32', 4], uint: ['Uint32', 4], uint32: ['Uint32', 4],
  float: ['Float32', 4], float32: ['Float32', 4], double: ['Float64', 8], float64: ['Float64', 8],
}

function parsePly(bytes) {
  const head = decodeText(bytes.subarray(0, Math.min(bytes.length, 65536)))
  const end = head.indexOf('end_header')
  if (!head.startsWith('ply') || end < 0) throw new Error('Not a PLY file')
  const elements = []
  let format = 'ascii'
  for (const line of head.slice(0, end).split(/\r?\n/)) {
    const words = line.trim().split(/\s+/)
    if (words[0] === 'format') format = words[1]
    else if (words[0] === 'element') elements.push({ name: words[1], count: +words[2], props: [] })
    else if (words[0] === 'property') {
      const props = elements.at(-1).props
      props.push(words[1] === 'list' ? { name: words[4], list: [words[2], words[3]] } : { name: words[2], type: words[1] })
    }
  }
  let offset = end + 'end_header'.length
  offset += head[offset] === '\r' ? 2 : 1

  const vertices = []
  const out = []
  const takeVertex = values => vertices.push(values.x, values.y, values.z)
  const takeFace = indices => {
    for (let k = 1; k + 1 < indices.length; k++) {
      for (const i of [indices[0], indices[k], indices[k + 1]]) out.push(vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2])
    }
  }

  if (format === 'ascii') {
    const tokens = decodeText(bytes.subarray(offset)).trim().split(/\s+/).map(Number)
    let t = 0
    for (const element of elements) {
      for (let n = 0; n < element.count; n++) {
        const values = {}
        let list = null
        for (const prop of element.props) {
          if (prop.list) { const count = tokens[t++]; list = tokens.slice(t, t + count); t += count } else values[prop.name] = tokens[t++]
        }
        if (element.name === 'vertex') takeVertex(values)
        else if (element.name === 'face' && list) takeFace(list)
      }
    }
  } else {
    const little = format === 'binary_little_endian'
    const view = dataView(bytes)
    const read = type => {
      const [kind, size] = PLY_TYPES[type]
      const value = view['get' + kind](offset, little)
      offset += size
      return value
    }
    for (const element of elements) {
      for (let n = 0; n < element.count; n++) {
        const values = {}
        let list = null
        for (const prop of element.props) {
          if (prop.list) {
            const count = read(prop.list[0])
            list = Array.from({ length: count }, () => read(prop.list[1]))
          } else values[prop.name] = read(prop.type)
        }
        if (element.name === 'vertex') takeVertex(values)
        else if (element.name === 'face' && list) takeFace(list)
      }
    }
  }
  return new Float32Array(out)
}

/* ---------- 3MF (a ZIP archive holding XML models) ---------- */

async function inflateRaw(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function zipEntries(bytes) {
  const view = dataView(bytes)
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Not a ZIP archive')
  const entries = []
  let p = view.getUint32(eocd + 16, true)
  for (let n = view.getUint16(eocd + 10, true); n > 0; n--) {
    const nameLength = view.getUint16(p + 28, true)
    const entry = {
      name: decodeText(bytes.subarray(p + 46, p + 46 + nameLength)),
      method: view.getUint16(p + 10, true),
      size: view.getUint32(p + 20, true),
      local: view.getUint32(p + 42, true),
    }
    entry.read = async () => {
      const start = entry.local + 30 + view.getUint16(entry.local + 26, true) + view.getUint16(entry.local + 28, true)
      const data = bytes.subarray(start, start + entry.size)
      return entry.method === 8 ? inflateRaw(data) : data
    }
    entries.push(entry)
    p += 46 + nameLength + view.getUint16(p + 30, true) + view.getUint16(p + 32, true)
  }
  return entries
}

const xmlAttributes = tag => {
  const out = {}
  for (const m of tag.matchAll(/([\w:]+)="([^"]*)"/g)) out[m[1]] = m[2]
  return out
}

// 3MF transforms are 3x4 row-major matrices applied to row vectors: p' = [x y z 1] * M.
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]
const parseTransform = text => text ? text.trim().split(/\s+/).map(Number) : IDENTITY
const applyTransform = (m, x, y, z) => [
  x * m[0] + y * m[3] + z * m[6] + m[9],
  x * m[1] + y * m[4] + z * m[7] + m[10],
  x * m[2] + y * m[5] + z * m[8] + m[11],
]
const composeTransforms = (inner, outer) => {
  const [x0, y0, z0] = applyTransform(outer, inner[0], inner[1], inner[2]).map((v, i) => v - outer[9 + i])
  const [x1, y1, z1] = applyTransform(outer, inner[3], inner[4], inner[5]).map((v, i) => v - outer[9 + i])
  const [x2, y2, z2] = applyTransform(outer, inner[6], inner[7], inner[8]).map((v, i) => v - outer[9 + i])
  const t = applyTransform(outer, inner[9], inner[10], inner[11])
  return [x0, y0, z0, x1, y1, z1, x2, y2, z2, ...t]
}

async function parse3mf(bytes) {
  const objects = new Map()
  let items = []
  for (const entry of zipEntries(bytes).filter(e => /\.model$/i.test(e.name))) {
    const xml = decodeText(await entry.read())
    for (const m of xml.matchAll(/<(?:\w+:)?object\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?object>/g)) {
      const body = m[2]
      const vertices = []
      for (const v of body.matchAll(/<(?:\w+:)?vertex\b([^>]*)>/g)) {
        const a = xmlAttributes(v[1])
        vertices.push(+a.x, +a.y, +a.z)
      }
      const triangles = []
      for (const tr of body.matchAll(/<(?:\w+:)?triangle\b([^>]*)>/g)) {
        const a = xmlAttributes(tr[1])
        triangles.push(+a.v1, +a.v2, +a.v3)
      }
      const components = [...body.matchAll(/<(?:\w+:)?component\b([^>]*)>/g)].map(c => {
        const a = xmlAttributes(c[1])
        return { id: a.objectid, transform: parseTransform(a.transform) }
      })
      objects.set(xmlAttributes(m[1]).id, { vertices, triangles, components })
    }
    const build = xml.match(/<(?:\w+:)?build\b[^>]*>([\s\S]*?)<\/(?:\w+:)?build>/)
    if (build) {
      items = [...build[1].matchAll(/<(?:\w+:)?item\b([^>]*)>/g)].map(it => {
        const a = xmlAttributes(it[1])
        return { id: a.objectid, transform: parseTransform(a.transform) }
      })
    }
  }

  const out = []
  const emit = (id, transform, depth = 0) => {
    const object = objects.get(id)
    if (!object || depth > 16) return
    const { vertices: v, triangles } = object
    for (const i of triangles) out.push(...applyTransform(transform, v[i * 3], v[i * 3 + 1], v[i * 3 + 2]))
    for (const c of object.components) emit(c.id, composeTransforms(c.transform, transform), depth + 1)
  }
  for (const item of items.length ? items : [...objects.keys()].map(id => ({ id, transform: IDENTITY }))) emit(item.id, item.transform)
  return new Float32Array(out)
}

/* ---------- preparation ---------- */

/*
 * Re-orients Z-up models to the viewer's Y-up, centres them and computes face normals. Works on
 * the flat arrays directly: models can have millions of vertices.
 */
function prepareMesh(mesh) {
  const src = mesh.positions
  const positions = new Float32Array(src.length)
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i], y = mesh.zUp ? src[i + 2] : src[i + 1], z = mesh.zUp ? -src[i + 1] : src[i + 2]
    positions[i] = x; positions[i + 1] = y; positions[i + 2] = z
    if (x < min[0]) min[0] = x; if (x > max[0]) max[0] = x
    if (y < min[1]) min[1] = y; if (y > max[1]) max[1] = y
    if (z < min[2]) min[2] = z; if (z > max[2]) max[2] = z
  }
  const center = min.map((v, k) => (v + max[k]) / 2)
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] -= center[0]; positions[i + 1] -= center[1]; positions[i + 2] -= center[2]
  }

  const normals = new Float32Array(positions.length)
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i + 3] - positions[i], ay = positions[i + 4] - positions[i + 1], az = positions[i + 5] - positions[i + 2]
    const bx = positions[i + 6] - positions[i], by = positions[i + 7] - positions[i + 1], bz = positions[i + 8] - positions[i + 2]
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx
    const length = Math.hypot(nx, ny, nz) || 1
    nx /= length; ny /= length; nz /= length
    for (let v = 0; v < 9; v += 3) { normals[i + v] = nx; normals[i + v + 1] = ny; normals[i + v + 2] = nz }
  }

  const extent = max.map((v, k) => v - min[k])
  // The size as stored in the file: Z-up models swap their Y and Z extents back.
  const size = mesh.zUp ? [extent[0], extent[2], extent[1]] : extent
  return {
    positions,
    normals,
    triangles: positions.length / 9,
    radius: Math.max(Math.hypot(...extent) / 2, 1e-6),
    ground: -extent[1] / 2,
    size,
    units: mesh.units,
  }
}

// Parses and prepares a model; null when the file holds no triangles (e.g. a compiler ".obj").
async function loadMesh(name, bytes) {
  const mesh = await parseMesh(name, bytes)
  return mesh.positions.length ? prepareMesh(mesh) : null
}

if (typeof module !== 'undefined') module.exports = { MESH_EXT, parseMesh, prepareMesh, loadMesh, parseStl, parseObj, parsePly, parse3mf }
