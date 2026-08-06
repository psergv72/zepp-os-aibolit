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
  assert.equal(notification.__calls[0].title, 'Пора принимать лекарства')
  assert.match(notification.__calls[0].content, /Парацетамол, 1 таблетка/)
})

test('action Принял открывает страницу take', () => {
  serviceOpts.onInit(JSON.stringify({ mode: 'reminder', intakeId: 'i1' }))

  assert.equal(notification.__calls.length, 1)
  const takeAction = notification.__calls[0].actions.find(a => a.text === 'Принял')
  assert.ok(takeAction, 'в уведомлении есть кнопка Принял')
  assert.equal(takeAction.file, 'page/take/index')
  assert.equal(takeAction.param, JSON.stringify({ intakeId: 'i1' }))
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

test('mode sync применяет настройки и не шлёт уведомление', () => {
  const settingsMap = {
    configRevision: JSON.stringify(2),
    medications: JSON.stringify([{ id: 'm2', name: 'Ибупрофен', enabled: true }]),
    intakes: JSON.stringify([{ id: 'i2', time: '09:00', weekDays: null, items: [{ medicationId: 'm2', amount: '1' }] }]),
  }
  globalThis.settings = {
    settingsStorage: {
      getItem(key) {
        return settingsMap[key] !== undefined ? settingsMap[key] : null
      },
    },
  }

  serviceOpts.onInit(JSON.stringify({ mode: 'sync' }))

  delete globalThis.settings
  assert.equal(notification.__calls.length, 0)
  const store = storage.__stores().get('aibolit-data.json')
  assert.equal(store.get('configRevision'), 2)
  assert.deepEqual(store.get('medications'), [{ id: 'm2', name: 'Ибупрофен', enabled: true }])
})

test('mode sync игнорирует intakeId', () => {
  serviceOpts.onInit(JSON.stringify({ mode: 'sync', intakeId: 'i1' }))
  assert.equal(notification.__calls.length, 0)
})
