import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

let serviceOpts = null
globalThis.AppService = (opts) => { serviceOpts = opts }

const notification = await import('./helpers/stubs/zos-notification.mjs')
const storage = await import('./helpers/stubs/zos-storage.mjs')
const fs = await import('./helpers/stubs/zos-fs.mjs')
const alarm = await import('./helpers/stubs/zos-alarm.mjs')
const syncModule = await import('../utils/sync.js')

await import('../app-service/reminder.js')
const lifecycle = await import('../utils/notification-lifecycle.js')

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
  delete globalThis.settings
  seed()
  notification.__reset()
  alarm.__reset()
  fs.__resetFs()
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

test('mode sync применяет настройки, обновляет будильники и ретраит очередь без уведомления', () => {
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

  const sent = []
  syncModule.initSync({
    request(payload) {
      sent.push(payload)
      return Promise.resolve({ success: true, count: payload.params.records.length })
    },
  })
  const store = storage.__stores().get('aibolit-data.json')
  store.set('syncQueue', [{ id: 'log_q', intakeId: 'i1', status: 'taken' }])

  serviceOpts.onInit(JSON.stringify({ mode: 'sync' }))

  delete globalThis.settings
  assert.equal(notification.__calls.length, 0)
  assert.equal(store.get('configRevision'), 2)
  assert.deepEqual(store.get('medications'), [{ id: 'm2', name: 'Ибупрофен', enabled: true }])
  const syncSet = alarm.__getCalls().filter(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'sync')
  assert.ok(syncSet.length > 0, 'refreshAlarms пересоздал sync-alarm (режим sync вызван)')
  assert.ok(sent.some(p => p.method === 'sync_intake'), 'retrySync отправил очередь на телефон')
})

test('mode sync игнорирует intakeId', () => {
  serviceOpts.onInit(JSON.stringify({ mode: 'sync', intakeId: 'i1' }))
  assert.equal(notification.__calls.length, 0)
})

test('RETRY_TICK не шлёт уведомление без pending и перевыдаёт после интервала', () => {
  serviceOpts.onInit(JSON.stringify({ mode: 'retry_tick' }))
  assert.equal(notification.__calls.length, 0)

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const store = storage.__stores().get('aibolit-data.json')
  store.set('settings', { retryInterval: 2, syncInterval: 60, snoozeOptions: [30], minFontSize: 16 })
  store.set('pendingNotification', { intakeId: 'i1', date: todayStr, issuedAt: Date.now() - 3 * 60 * 1000 })

  serviceOpts.onInit(JSON.stringify({ mode: 'retry_tick' }))

  assert.equal(notification.__calls.length, 1, 'тик перевыдаёт уведомление после интервала')
  assert.equal(notification.__calls[0].title, 'Пора принимать лекарства')
})

test('уведомление содержит кнопку Отменить', () => {
  serviceOpts.onInit(JSON.stringify({ mode: 'reminder', intakeId: 'i1' }))
  assert.equal(notification.__calls.length, 1)
  const cancelAction = notification.__calls[0].actions.find(a => a.text === 'Отменить')
  assert.ok(cancelAction, 'в уведомлении есть кнопка Отменить')
  assert.equal(cancelAction.file, 'page/cancel/index')
  assert.equal(cancelAction.param, JSON.stringify({ intakeId: 'i1' }))
})

test('REMINDER не создаёт ретрай-будильник из AppService, pending сохраняется с issuedAt', () => {
  serviceOpts.onInit(JSON.stringify({ mode: 'reminder', intakeId: 'i1' }))
  assert.equal(notification.__calls.length, 1)
  const retry = alarm.__getCalls().filter(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'retry')
  assert.equal(retry.length, 0, 'ретрай-будильник не должен создаваться из AppService')
  const pending = storage.__stores().get('aibolit-data.json').get('pendingNotification')
  assert.equal(pending.intakeId, 'i1')
  assert.ok(typeof pending.issuedAt === 'number')
})

test('чужой pending помечается пропущенным при выдаче нового уведомления', () => {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const store = storage.__stores().get('aibolit-data.json')
  store.set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
    { id: 'i2', time: '09:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  store.set('pendingNotification', { intakeId: 'i1', date: todayStr })
  serviceOpts.onInit(JSON.stringify({ mode: 'reminder', intakeId: 'i2' }))
  const logs = store.get('takeLogs')
  assert.equal(logs.length, 1)
  assert.equal(logs[0].intakeId, 'i1')
  assert.equal(logs[0].status, 'skipped')
})

test('тот же intake не помечается пропущенным', () => {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const store = storage.__stores().get('aibolit-data.json')
  store.set('pendingNotification', { intakeId: 'i1', date: todayStr })
  serviceOpts.onInit(JSON.stringify({ mode: 'reminder', intakeId: 'i1' }))
  const logs = store.get('takeLogs')
  assert.equal(!logs || logs.length === 0, true)
})

test('onInit пропускает пропущенный intake', () => {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  storage.__stores().get('aibolit-data.json').set('takeLogs', [{ intakeId: 'i1', date: todayStr, status: 'skipped' }])
  serviceOpts.onInit(JSON.stringify({ mode: 'reminder', intakeId: 'i1' }))
  assert.equal(notification.__calls.length, 0)
})

test('RETRY с датой прошлого дня игнорируется', () => {
  serviceOpts.onInit(JSON.stringify({ mode: 'retry', intakeId: 'i1', date: '2000-01-01' }))
  assert.equal(notification.__calls.length, 0)
})

test('срабатывание snooze-будильника очищает сохранённый snoozeAlarmId', () => {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const store = storage.__stores().get('aibolit-data.json')
  store.set('snoozeAlarmId', 42)

  serviceOpts.onInit(JSON.stringify({ mode: 'snooze', intakeId: 'i1', date: todayStr }))

  assert.equal(store.get('snoozeAlarmId'), undefined, 'snoozeAlarmId должен быть очищен после срабатывания')
  assert.equal(notification.__calls.length, 1)
})
