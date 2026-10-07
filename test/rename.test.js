const test = require('node:test')
const assert = require('node:assert/strict')
const { batchNames } = require('../src/shared/rename')

const names = ['IMG_001.jpg', 'IMG_002.JPG', 'notes', '.env']

test('replaces text in the name, never in the extension', () => {
  assert.deepEqual(batchNames(names, { mode: 'replace', find: 'img_', replace: 'Trip ' }), ['Trip 001.jpg', 'Trip 002.JPG', 'notes', '.env'])
  assert.deepEqual(batchNames(['a.b.c.txt'], { mode: 'replace', find: '.', replace: '-' }), ['a-b-c.txt'])
  assert.deepEqual(batchNames(['$1 cost.txt'], { mode: 'replace', find: 'cost', replace: '$&$&' }), ['$1 $&$&.txt'])
})

test('adds text before or after the name', () => {
  assert.deepEqual(batchNames(['a.txt', 'b'], { mode: 'add', text: '_old', where: 'after' }), ['a_old.txt', 'b_old'])
  assert.deepEqual(batchNames(['a.txt'], { mode: 'add', text: 'new ', where: 'before' }), ['new a.txt'])
})

test('formats a name with a counter', () => {
  assert.deepEqual(batchNames(['x.jpg', 'y.png'], { mode: 'format', name: 'Holiday', start: 1, where: 'after' }), ['Holiday 1.jpg', 'Holiday 2.png'])
  assert.deepEqual(batchNames(['x.jpg', 'y.png'], { mode: 'format', name: 'Holiday', start: 9, where: 'before' }), ['09 Holiday.jpg', '10 Holiday.png'])
  assert.deepEqual(batchNames(['x.jpg'], { mode: 'format', name: ' ', start: 1, where: 'after' }), ['x 1.jpg'])
})
