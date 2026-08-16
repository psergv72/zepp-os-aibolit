import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const storage = await import('./helpers/stubs/zos-storage.mjs')
const fs = await import('./helpers/stubs/zos-fs.mjs')
const {
  getConfigRevision,
  setConfigRevision,
  getSyncAlarmId,
  setSyncAlarmId,
  clearSyncAlarmId,
  getPendingNotification,
  setPendingNotification,
  clearPendingNotification,
  getDebugLog,
  setDebugLog,
  getAlarmRegistry,
  setAlarmRegistry,
  registerAlarm,
  unregisterAlarm,
  getMedications,
  setMedications,
  getIntakes,
  setIntakes,
  getSettings,
  setSettings,
} = await import('../utils/storage.js')

function seed() {
  storage.__resetStorage()
  fs.__resetFs()
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

test('syncAlarmId персистится в fs и переживает сброс ShareLocalStorage (контекст app-service)', () => {
  setSyncAlarmId(42)
  storage.__resetStorage()
  new storage.ShareLocalStorage('aibolit-data.json')
  assert.equal(getSyncAlarmId(), 42)
})

test('конфиг (медикаменты, приёмы, настройки) переносится в fs и переживает сброс ShareLocalStorage', () => {
  setMedications([{ id: 'm1', name: 'Парацетамол', enabled: true }])
  setIntakes([{ id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] }])
  setSettings({ minFontSize: 20 })
  setConfigRevision(7)
  storage.__resetStorage()
  new storage.ShareLocalStorage('aibolit-data.json')

  assert.deepEqual(getMedications(), [{ id: 'm1', name: 'Парацетамол', enabled: true }], 'лекарства не потеряны')
  assert.deepEqual(getIntakes(), [{ id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] }], 'приёмы не потеряны')
  assert.deepEqual(getSettings(), { minFontSize: 20 }, 'настройки не потеряны')
  assert.equal(getConfigRevision(), 7, 'ревизия не потеряна')
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

test('getDebugLog возвращает пустой массив, если лог не задан', () => {
  assert.deepEqual(getDebugLog(), [])
})

test('setDebugLog сохраняет массив, getDebugLog его возвращает', () => {
  setDebugLog([{ ts: 1, message: 'x' }])
  assert.deepEqual(getDebugLog(), [{ ts: 1, message: 'x' }])
})

test('setDebugLog игнорирует не-массив и сбрасывает в пустой', () => {
  setDebugLog('oops')
  assert.deepEqual(getDebugLog(), [])
})

test('debugLog персистится в fs и переживает сброс ShareLocalStorage (контекст app-service)', () => {
  setDebugLog([{ ts: 1, message: 'из app-service' }])
  storage.__resetStorage()
  new storage.ShareLocalStorage('aibolit-data.json')
  assert.deepEqual(getDebugLog(), [{ ts: 1, message: 'из app-service' }])
})

test('getAlarmRegistry возвращает пустой объект, если реестр не задан', () => {
  assert.deepEqual(getAlarmRegistry(), {})
})

test('setAlarmRegistry сохраняет объект, getAlarmRegistry его возвращает', () => {
  setAlarmRegistry({ 1: { type: 'intake', intakeId: 'i1' } })
  assert.deepEqual(getAlarmRegistry(), { 1: { type: 'intake', intakeId: 'i1' } })
})

test('setAlarmRegistry игнорирует не-объект и сбрасывает в пустой', () => {
  setAlarmRegistry('oops')
  assert.deepEqual(getAlarmRegistry(), {})
})

test('registerAlarm добавляет запись в реестр', () => {
  registerAlarm(7, { type: 'sync', interval: 60 })
  assert.deepEqual(getAlarmRegistry(), { 7: { type: 'sync', interval: 60 } })
})

test('alarmRegistry персистится в fs и переживает сброс ShareLocalStorage (контекст app-service)', () => {
  registerAlarm(7, { type: 'sync', interval: 60 })
  storage.__resetStorage()
  new storage.ShareLocalStorage('aibolit-data.json')
  assert.deepEqual(getAlarmRegistry(), { 7: { type: 'sync', interval: 60 } })
})

test('registerAlarm не меняет реестр при отсутствии id', () => {
  setAlarmRegistry({ 7: { type: 'sync' } })
  registerAlarm(null, { type: 'sync' })
  registerAlarm(undefined, { type: 'sync' })
  assert.deepEqual(getAlarmRegistry(), { 7: { type: 'sync' } })
})

test('unregisterAlarm удаляет запись из реестра', () => {
  registerAlarm(7, { type: 'sync' })
  registerAlarm(9, { type: 'intake' })
  unregisterAlarm(7)
  assert.deepEqual(getAlarmRegistry(), { 9: { type: 'intake' } })
})

test('unregisterAlarm не ломает реестр при отсутствии id', () => {
  registerAlarm(7, { type: 'sync' })
  unregisterAlarm(null)
  unregisterAlarm(99)
  assert.deepEqual(getAlarmRegistry(), { 7: { type: 'sync' } })
})
