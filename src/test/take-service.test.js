import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

let serviceOpts = null
globalThis.AppService = (opts) => { serviceOpts = opts }

const storage = await import('./helpers/stubs/zos-storage.mjs')

await import('../app-service/take.js')

function seed() {
  storage.__resetStorage()
  new storage.ShareLocalStorage('aibolit-data.json')
  storage.__stores().get('aibolit-data.json').set('intakes', [{
    id: 'i1',
    time: '08:00',
    weekDays: null,
    items: [{ medicationId: 'm1', amount: '1 таблетка' }],
  }])
}

function todayStr() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

beforeEach(() => {
  seed()
})

test('onInit регистрирует принятый intake и синхронизирует с телефоном', () => {
  serviceOpts.onInit(JSON.stringify({ intakeId: 'i1' }))

  const logs = storage.__stores().get('aibolit-data.json').get('takeLogs')
  assert.equal(logs.length, 1)
  assert.equal(logs[0].intakeId, 'i1')
  assert.equal(logs[0].status, 'taken')
  assert.equal(logs[0].date, todayStr())
})

test('onInit игнорирует неизвестный intake', () => {
  serviceOpts.onInit(JSON.stringify({ intakeId: 'missing' }))
  const logs = storage.__stores().get('aibolit-data.json').get('takeLogs')
  assert.equal(logs, undefined)
})

test('onInit игнорирует битый JSON', () => {
  serviceOpts.onInit('not-json')
  const logs = storage.__stores().get('aibolit-data.json').get('takeLogs')
  assert.equal(logs, undefined)
})
