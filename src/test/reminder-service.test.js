import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

let serviceOpts = null
globalThis.AppService = (opts) => { serviceOpts = opts }

const notification = await import('./helpers/stubs/zos-notification.mjs')
const storage = await import('./helpers/stubs/zos-storage.mjs')

await import('../app-service/reminder.js')

function seed() {
  storage.__resetStorage()
  new storage.ShareLocalStorage('aibolit-data.json')
  storage.__stores().get('aibolit-data.json').set('medications', [
    { id: 'm1', name: 'Парацетамол', enabled: true },
  ])
  storage.__stores().get('aibolit-data.json').set('intakes', [{
    id: 'i1',
    time: '08:00',
    weekDays: null,
    items: [{ medicationId: 'm1', amount: '1 таблетка' }],
  }])
}

beforeEach(() => {
  seed()
  notification.__reset()
})

test('onInit при срабатывании alarm вызывает notify', () => {
  const params = JSON.stringify({ mode: 'reminder', intakeId: 'i1' })
  serviceOpts.onInit(params)

  assert.equal(notification.__calls.length, 1)
  assert.equal(notification.__calls[0].title, '08:00')
  assert.match(notification.__calls[0].content, /Парацетамол/)
})

test('onInit пропускает уже принятый intake', () => {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  storage.__stores().get('aibolit-data.json').set('takeLogs', [{
    intakeId: 'i1',
    date: todayStr,
    status: 'taken',
  }])

  serviceOpts.onInit(JSON.stringify({ mode: 'reminder', intakeId: 'i1' }))
  assert.equal(notification.__calls.length, 0)
})

test('onInit пропускает отменённый intake', () => {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  storage.__stores().get('aibolit-data.json').set('cancellations', [{
    intakeId: 'i1',
    date: todayStr,
  }])

  serviceOpts.onInit(JSON.stringify({ mode: 'reminder', intakeId: 'i1' }))
  assert.equal(notification.__calls.length, 0)
})

test('onInit игнорирует битый JSON', () => {
  serviceOpts.onInit('not-json')
  assert.equal(notification.__calls.length, 0)
})
