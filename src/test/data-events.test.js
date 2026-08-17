import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const storage = await import('./helpers/stubs/zos-storage.mjs')
const fs = await import('./helpers/stubs/zos-fs.mjs')
const { subscribeToData, emitDataChanged } = await import('../utils/data-events.js')

function seed() {
  storage.__resetStorage()
  fs.__resetFs()
  new storage.LocalStorage('aibolit-data.json')
}

beforeEach(() => {
  seed()
})

test('подписка: эмит вызывает слушателя', () => {
  let called = 0
  const off = subscribeToData(() => { called++ })
  emitDataChanged()
  assert.equal(called, 1)
  off()
})

test('отписка: после off эмит не вызывает слушателя', () => {
  let called = 0
  const off = subscribeToData(() => { called++ })
  off()
  emitDataChanged()
  assert.equal(called, 0)
})

test('ошибка в одном слушателе не ломает остальных', () => {
  const calls = []
  const off1 = subscribeToData(() => { throw new Error('boom') })
  const off2 = subscribeToData(() => { calls.push('ok') })
  emitDataChanged()
  assert.deepEqual(calls, ['ok'])
  off1()
  off2()
})
