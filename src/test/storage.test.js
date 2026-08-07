import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const storage = await import('./helpers/stubs/zos-storage.mjs')
const {
  getConfigRevision,
  setConfigRevision,
  getSyncAlarmId,
  setSyncAlarmId,
  clearSyncAlarmId,
  getPendingNotification,
  setPendingNotification,
  clearPendingNotification,
} = await import('../utils/storage.js')

function seed() {
  storage.__resetStorage()
  new storage.ShareLocalStorage('aibolit-data.json')
}

beforeEach(() => {
  seed()
})

test('getConfigRevision возвращает 0, если ревизия не задана', () => {
  assert.equal(getConfigRevision(), 0)
})

test('setConfigRevision сохраняет число, getConfigRevision его возвращает', () => {
  setConfigRevision(7)
  assert.equal(getConfigRevision(), 7)
})

test('getSyncAlarmId возвращает null, если id не задан', () => {
  assert.equal(getSyncAlarmId(), null)
})

test('setSyncAlarmId сохраняет id, clearSyncAlarmId сбрасывает в null', () => {
  setSyncAlarmId(42)
  assert.equal(getSyncAlarmId(), 42)
  clearSyncAlarmId()
  assert.equal(getSyncAlarmId(), null)
})

test('getPendingNotification возвращает null, если pending не задан', () => {
  assert.equal(getPendingNotification(), null)
})

test('setPendingNotification сохраняет объект, getPendingNotification его возвращает', () => {
  const pending = { intakeId: 'i1', date: '2026-08-07' }
  setPendingNotification(pending)
  assert.deepEqual(getPendingNotification(), pending)
})

test('clearPendingNotification сбрасывает pending в null', () => {
  setPendingNotification({ intakeId: 'i1', date: '2026-08-07' })
  clearPendingNotification()
  assert.equal(getPendingNotification(), null)
})
