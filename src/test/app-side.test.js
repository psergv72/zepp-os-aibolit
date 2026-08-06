import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

let sideOpts = null
globalThis.AppSideService = (opts) => { sideOpts = opts }

await import('../app-side/index.js')

const storageMap = new Map()

function fakeSettingsStorage() {
  return {
    getItem(key) {
      return storageMap.has(key) ? storageMap.get(key) : null
    },
    setItem(key, value) {
      storageMap.set(key, value)
    },
  }
}

function seed() {
  storageMap.clear()
  const ss = fakeSettingsStorage()
  ss.setItem('medications', JSON.stringify([{ id: 'm1', name: 'Парацетамол' }]))
  ss.setItem('intakes', JSON.stringify([{ id: 'i1', time: '08:00' }]))
  ss.setItem('settings', JSON.stringify({ retryInterval: 60 }))
  ss.setItem('configRevision', '2')
  globalThis.settings = { settingsStorage: ss }
  sideOpts.settings = {
    getItem: (k) => ss.getItem(k),
    setItem: (k, v) => ss.setItem(k, v),
  }
}

beforeEach(() => {
  seed()
})

test('buildConfig включает актуальную ревизию', () => {
  const config = sideOpts.buildConfig()
  assert.equal(config.revision, 2)
  assert.equal(config.medications[0].id, 'm1')
})

test('onRun инициализирует отсутствующую ревизию и пушит конфиг', () => {
  storageMap.delete('configRevision')
  const calls = []
  sideOpts.call = (payload) => { calls.push(payload) }

  sideOpts.onRun()

  assert.equal(JSON.parse(storageMap.get('configRevision')), 1)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].params.config.revision, 1)
})

test('onSettingsChange для CONFIG_KEYS увеличивает ревизию и пушит конфиг', () => {
  const calls = []
  sideOpts.call = (payload) => { calls.push(payload) }

  sideOpts.onSettingsChange({ key: 'intakes' })

  assert.equal(JSON.parse(storageMap.get('configRevision')), 3)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'config_synced')
  assert.equal(calls[0].params.config.revision, 3)
})

test('onSettingsChange для прочих ключей не трогает ревизию и не пушит', () => {
  const calls = []
  sideOpts.call = (payload) => { calls.push(payload) }

  sideOpts.onSettingsChange({ key: 'history_2026-08-06' })

  assert.equal(JSON.parse(storageMap.get('configRevision')), 2)
  assert.equal(calls.length, 0)
})

test('onRequest SYNC_INTAKE дедуплицирует записи по id', () => {
  let res = null
  sideOpts.onRequest({
    method: 'sync_intake',
    params: { records: [
      { id: 'log_1', intakeId: 'i1', date: '2026-08-06', status: 'taken' },
    ] },
  }, (err, data) => { res = data })

  assert.deepEqual(res, { success: true, count: 1 })

  sideOpts.onRequest({
    method: 'sync_intake',
    params: { records: [
      { id: 'log_1', intakeId: 'i1', date: '2026-08-06', status: 'taken' },
      { id: 'log_2', intakeId: 'i2', date: '2026-08-06', status: 'snoozed' },
    ] },
  }, () => {})

  const history = JSON.parse(storageMap.get('history_2026-08-06'))
  assert.equal(history.length, 2)
  assert.ok(history.some(r => r.id === 'log_1'))
  assert.ok(history.some(r => r.id === 'log_2'))
})

test('onRequest SYNC_INTAKE заменяет предыдущую запись по (intakeId, date)', () => {
  sideOpts.onRequest({
    method: 'sync_intake',
    params: { records: [
      { id: 'log_1', intakeId: 'i1', date: '2026-08-06', status: 'taken' },
    ] },
  }, () => {})

  sideOpts.onRequest({
    method: 'sync_intake',
    params: { records: [
      { id: 'cancel_1', intakeId: 'i1', date: '2026-08-06', status: 'cancelled' },
    ] },
  }, () => {})

  const history = JSON.parse(storageMap.get('history_2026-08-06'))
  assert.equal(history.length, 1)
  assert.equal(history[0].id, 'cancel_1')
  assert.equal(history[0].status, 'cancelled')
})

test('onRequest SYNC_INTAKE с status undone удаляет taken-запись пары (intakeId, date)', () => {
  sideOpts.onRequest({
    method: 'sync_intake',
    params: { records: [
      { id: 'log_1', intakeId: 'i1', date: '2026-08-06', status: 'taken', takenTime: '08:05' },
    ] },
  }, () => {})

  sideOpts.onRequest({
    method: 'sync_intake',
    params: { records: [
      { id: 'undo_1', intakeId: 'i1', date: '2026-08-06', status: 'undone' },
    ] },
  }, () => {})

  const history = JSON.parse(storageMap.get('history_2026-08-06'))
  assert.equal(history.length, 0)
})

test('onRequest SYNC_INTAKE с status undone не затирает записи других пар', () => {
  sideOpts.onRequest({
    method: 'sync_intake',
    params: { records: [
      { id: 'log_1', intakeId: 'i1', date: '2026-08-06', status: 'taken' },
      { id: 'log_2', intakeId: 'i2', date: '2026-08-06', status: 'taken' },
    ] },
  }, () => {})

  sideOpts.onRequest({
    method: 'sync_intake',
    params: { records: [
      { id: 'undo_1', intakeId: 'i1', date: '2026-08-06', status: 'undone' },
    ] },
  }, () => {})

  const history = JSON.parse(storageMap.get('history_2026-08-06'))
  assert.equal(history.length, 1)
  assert.equal(history[0].id, 'log_2')
})
