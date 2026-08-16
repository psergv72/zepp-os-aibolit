import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { parseNdJson } from '../utils/ndjson.js'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

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
  getSyncQueue,
  setSyncQueue,
  getCancellations,
  setCancellations,
  addCancellation,
  isIntakeCancelled,
  clearAll,
  saveAndQuit,
} = await import('../utils/storage.js')

beforeEach(() => {
  clearAll()
  fs.__resetFs()
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

test('конфиг (медикаменты, приёмы, настройки) читается через кэш сразу после записи', () => {
  setMedications([{ id: 'm1', name: 'Парацетамол', enabled: true }])
  setIntakes([{ id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] }])
  setSettings({ minFontSize: 20 })
  setConfigRevision(7)

  assert.deepEqual(getMedications(), [{ id: 'm1', name: 'Парацетамол', enabled: true }])
  assert.deepEqual(getIntakes(), [{ id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] }])
  assert.deepEqual(getSettings(), { minFontSize: 20 })
  assert.equal(getConfigRevision(), 7)
})

test('данные записываются в по-ключевые файлы после saveAndQuit и читаются через parseNdJson', () => {
  setMedications([{ id: 'm1', name: 'Парацетамол', enabled: true }])
  setSyncAlarmId(42)
  saveAndQuit()

  const fsFiles = fs.__fsFiles()
  const medFile = fsFiles['aibolit-key-medications.json']
  const alarmFile = fsFiles['aibolit-key-sync-alarm-id.json']
  assert.ok(medFile, 'файл медикаментов создан')
  assert.ok(alarmFile, 'файл sync-alarm id создан')
  // saveAndQuit пишет обычный JSON синхронно (NDJSON формирует асинхронный путь
  // AsyncStorage); parseNdJson умеет читать оба формата, поэтому данные переживают рестарт.
  assert.deepEqual(parseNdJson(medFile), { medications: [{ id: 'm1', name: 'Парацетамол', enabled: true }] })
  assert.deepEqual(parseNdJson(alarmFile), { syncAlarmId: 42 })
})

test('чтение из файла после сброса кэша (имитация другого контекста)', () => {
  setMedications([{ id: 'm1' }])
  saveAndQuit()
  // сбрасываем кэш и файлы (удаляем), затем вручную пишем NDJSON-файл
  clearAll()
  fs.__resetFs()
  const { writeFileSync } = fs
  writeFileSync({ path: 'aibolit-key-medications.json', data: '{"T":"meta","A":["medications"],"medications":1}\n{"T":"medications","D":{"id":"m1"}}\n' })
  // кэш пуст: getMedications читает с диска
  assert.deepEqual(getMedications(), [{ id: 'm1' }])
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

test('syncQueue сохраняется и очищается', () => {
  setSyncQueue([{ id: 'a', intakeId: 'i1' }])
  assert.deepEqual(getSyncQueue(), [{ id: 'a', intakeId: 'i1' }])
  setSyncQueue([])
  assert.deepEqual(getSyncQueue(), [])
})

test('addCancellation: добавление, проверка, повторное добавление не дублирует', () => {
  clearAll()
  addCancellation('i1', '2026-08-07')
  addCancellation('i1', '2026-08-07')
  assert.equal(isIntakeCancelled('i1', '2026-08-07'), true)
  assert.equal(isIntakeCancelled('i2', '2026-08-07'), false)
  assert.deepEqual(getCancellations(), [{ intakeId: 'i1', date: '2026-08-07' }])
})
