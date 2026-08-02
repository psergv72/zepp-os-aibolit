import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createViewManager } from '../utils/view-manager.js'

function makeFakes() {
  const created = []
  const deleted = []
  const createWidget = (type, props) => {
    const w = { type, props, id: created.length }
    created.push(w)
    return w
  }
  const deleteWidget = (w) => deleted.push(w)
  const manager = createViewManager(createWidget, deleteWidget)
  return { created, deleted, manager }
}

test('clear удаляет все ранее созданные виджеты в порядке создания', () => {
  const { created, deleted, manager } = makeFakes()
  manager.create('TEXT', { text: 'a' })
  manager.create('TEXT', { text: 'b' })
  manager.clear()
  assert.equal(deleted.length, 2)
  assert.deepEqual(deleted, created)
})

test('create возвращает созданный виджет и пробрасывает параметры', () => {
  const { manager, created } = makeFakes()
  const w = manager.create('TEXT', { x: 10, text: 'hi' })
  assert.equal(w.props.text, 'hi')
  assert.equal(created.length, 1)
})

test('повторный вызов clear не удаляет виджеты, созданные после предыдущего clear', () => {
  const { deleted, manager } = makeFakes()
  manager.create('TEXT', { text: 'old' })
  manager.clear()
  deleted.length = 0
  manager.create('TEXT', { text: 'new' })
  manager.clear()
  assert.equal(deleted.length, 1)
  assert.equal(deleted[0].props.text, 'new')
})

test('clear не оставляет ссылок: следующий create после clear не удаляется повторно', () => {
  const { deleted, manager } = makeFakes()
  manager.create('TEXT', { text: 'a' })
  manager.create('TEXT', { text: 'b' })
  manager.clear()
  manager.create('TEXT', { text: 'c' })
  manager.clear()
  assert.equal(deleted.length, 3)
})
