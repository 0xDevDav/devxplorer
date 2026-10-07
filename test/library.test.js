const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const library = require('../src/main/library')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devxplorer-test-'))
const at = (...parts) => path.join(root, ...parts)
const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data) }
const metaOf = async p => library.metaFor(p, fs.statSync(p))

test.after(() => {
  library.close()
  fs.rmSync(root, { recursive: true, force: true })
})

test('file annotations follow content across moves, renames and copies', async () => {
  library.open(at('library.db'))
  const photo = crypto.randomBytes(300 * 1024)
  write(at('a', 'photo.jpg'), photo)
  await library.annotate(at('a', 'photo.jpg'), fs.statSync(at('a', 'photo.jpg')), { status: 'done' })
  await library.annotate(at('a', 'photo.jpg'), fs.statSync(at('a', 'photo.jpg')), { add: 'summer' })

  write(at('b', 'renamed.jpg'), photo)
  fs.rmSync(at('a', 'photo.jpg'))
  assert.deepEqual(await metaOf(at('b', 'renamed.jpg')), { tags: ['summer'], status: 'done' })

  write(at('c', 'copy.jpg'), photo)
  assert.equal((await metaOf(at('c', 'copy.jpg'))).status, 'done')

  const other = Buffer.from(photo)
  other[150 * 1024] ^= 0xff
  write(at('c', 'same-size.jpg'), other)
  assert.equal(await metaOf(at('c', 'same-size.jpg')), null)
})

test('empty files do not share annotations', async () => {
  write(at('empty', 'a.txt'), '')
  write(at('empty', 'b.txt'), '')
  await library.annotate(at('empty', 'a.txt'), fs.statSync(at('empty', 'a.txt')), { status: 'drop' })
  assert.equal((await metaOf(at('empty', 'a.txt'))).status, 'drop')
  assert.equal(await metaOf(at('empty', 'b.txt')), null)
})

test('folder annotations follow moves made through the app', async () => {
  fs.mkdirSync(at('set', 'carousel'), { recursive: true })
  await library.annotate(at('set', 'carousel'), fs.statSync(at('set', 'carousel')), { status: 'todo' })
  fs.renameSync(at('set'), at('archive'))
  library.relocate(at('set'), at('archive'))
  assert.equal((await metaOf(at('archive', 'carousel'))).status, 'todo')
})

test('export shares file annotations only, import merges them', async () => {
  const exported = at('shared.db')
  assert.equal(library.exportTo(exported), 1)

  library.open(at('other.db'))
  assert.equal(await metaOf(at('b', 'renamed.jpg')), null)
  assert.equal(library.importFrom(exported), 1)
  assert.equal((await metaOf(at('b', 'renamed.jpg'))).status, 'done')
  assert.equal(await metaOf(at('archive', 'carousel')), null)
})
