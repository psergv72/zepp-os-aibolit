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

test('applyConfigToStorage эмитит событие при применении', async () => {
  const { applyConfigToStorage } = await import('../utils/watch-config.js')
  let called = 0
  const off = subscribeToData(() => { called++ })
  try {
    const applied = applyConfigToStorage({ revision: 5, medications: [{ id: 'm1' }] })
    assert.equal(applied, true)
    assert.equal(called, 1)
  } finally {
    off()
  }
})

test('applyConfigToStorage не эмитит при старой ревизии', async () => {
  const { applyConfigToStorage } = await import('../utils/watch-config.js')
  applyConfigToStorage({ revision: 5, medications: [{ id: 'm1' }] })
  let called = 0
  const off = subscribeToData(() => { called++ })
  try {
    applyConfigToStorage({ revision: 4, medications: [{ id: 'm2' }] })
    assert.equal(called, 0)
  } finally {
    off()
  }
})

test('applyConfigFromSettings эмитит событие при применении', async () => {
  const { applyConfigFromSettings } = await import('../utils/watch-config.js')
  globalThis.settings = {
    settingsStorage: {
      getItem(key) {
        const map = { configRevision: '3', medications: JSON.stringify([{ id: 'm1' }]) }
        return map[key] !== undefined ? map[key] : null
      },
    },
  }
  let called = 0
  const off = subscribeToData(() => { called++ })
  try {
    const applied = applyConfigFromSettings()
    assert.equal(applied, true)
    assert.equal(called, 1)
  } finally {
    off()
    delete globalThis.settings
  }
})

test('mergeTakeRecords эмитит событие при добавлении записей', async () => {
  const { mergeTakeRecords } = await import('../utils/sync.js')
  let called = 0
  const off = subscribeToData(() => { called++ })
  try {
    const changed = mergeTakeRecords([{ id: 'log_1', intakeId: 'i1', status: 'taken' }])
    assert.equal(changed, true)
    assert.equal(called, 1)
  } finally {
    off()
  }
})

test('mergeTakeRecords не эмитит при пустом списке', async () => {
  const { mergeTakeRecords } = await import('../utils/sync.js')
  let called = 0
  const off = subscribeToData(() => { called++ })
  try {
    mergeTakeRecords([])
    assert.equal(called, 0)
  } finally {
    off()
  }
})
