const test = require('node:test')
const assert = require('node:assert/strict')
const zlib = require('zlib')
const { parseMesh } = require('../src/renderer/mesh')

const TRIANGLE = [0, 0, 0, 10, 0, 0, 0, 20, 5]
const bytes = text => new TextEncoder().encode(text)
const close = (actual, expected) => assert.deepEqual([...actual].map(v => Math.round(v * 1000) / 1000), expected)

function binaryStl(coords) {
  const buf = Buffer.alloc(84 + 50)
  buf.write('solid but actually binary', 0, 'latin1')
  buf.writeUInt32LE(1, 80)
  coords.forEach((v, i) => buf.writeFloatLE(v, 84 + 12 + i * 4))
  return new Uint8Array(buf)
}

// A ZIP with one deflated entry, as 3MF files are.
function zip(name, content) {
  const data = zlib.deflateRawSync(Buffer.from(content))
  const nameBytes = Buffer.from(name)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(8, 8)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt16LE(nameBytes.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(8, 10)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt16LE(nameBytes.length, 28)
  central.writeUInt32LE(0, 42)
  const cdOffset = local.length + nameBytes.length + data.length
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length + nameBytes.length, 12)
  end.writeUInt32LE(cdOffset, 16)
  return new Uint8Array(Buffer.concat([local, nameBytes, data, central, nameBytes, end]))
}

test('reads binary STL even when the header says "solid"', async () => {
  close((await parseMesh('part.stl', binaryStl(TRIANGLE))).positions, TRIANGLE)
})

test('reads ASCII STL', async () => {
  const text = 'solid x\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 10 0 0\nvertex 0 20 5\nendloop\nendfacet\nendsolid x'
  close((await parseMesh('part.stl', bytes(text))).positions, TRIANGLE)
})

test('triangulates OBJ polygons and resolves texture/normal indices', async () => {
  const text = 'v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1/1/1 2/2/2 3/3/3 4/4/4\n'
  const { positions, zUp } = await parseMesh('quad.obj', bytes(text))
  assert.equal(positions.length, 18)
  assert.equal(zUp, false)
})

test('reads ASCII PLY', async () => {
  const text = 'ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n10 0 0\n0 20 5\n3 0 1 2\n'
  close((await parseMesh('scan.ply', bytes(text))).positions, TRIANGLE)
})

test('reads compressed 3MF and applies build transforms', async () => {
  const model = `<?xml version="1.0"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources><object id="1" type="model"><mesh>
    <vertices><vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="20" z="5"/></vertices>
    <triangles><triangle v1="0" v2="1" v3="2"/></triangles>
  </mesh></object></resources>
  <build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 100 0 0"/></build>
</model>`
  const { positions } = await parseMesh('plate.3mf', zip('3D/3dmodel.model', model))
  close(positions, [100, 0, 0, 110, 0, 0, 100, 20, 5])
})
