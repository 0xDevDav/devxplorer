const test = require('node:test')
const assert = require('node:assert/strict')
const { parseIndex } = require('../src/main/recycle')

function indexRecord(version, original) {
  const text = Buffer.from(original + '\0', 'utf16le')
  const header = Buffer.alloc(version === 2 ? 28 : 24)
  header.writeBigUInt64LE(BigInt(version), 0)
  header.writeBigUInt64LE(1234n, 8) // size
  header.writeBigUInt64LE(5678n, 16) // deletion time
  if (version === 2) return Buffer.concat([header, (header.writeUInt32LE(original.length + 1, 24), text)])
  return Buffer.concat([header, text, Buffer.alloc(520 - text.length)])
}

test('reads the original path from Windows 10+ records', () => {
  assert.deepEqual(parseIndex(indexRecord(2, 'C:\\Users\\me\\photo.jpg')), { original: 'C:\\Users\\me\\photo.jpg', deletedAt: 5678n })
})

test('reads the original path from older fixed-size records', () => {
  assert.equal(parseIndex(indexRecord(1, 'D:\\Work\\notes.txt')).original, 'D:\\Work\\notes.txt')
})

test('rejects unknown records', () => {
  assert.equal(parseIndex(Buffer.alloc(30)), null)
})
