import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const storage = await import('./helpers/stubs/zos-storage.mjs')
const fs = await import('./helpers/stubs/zos-fs.mjs')
const alarm = await import('./helpers/stubs/zos-alarm.mjs')
const syncModule = await import('../utils/sync.js')
const { setAlarmRegistry } = await import('../utils/storage.js')

const {
  isDebugModeEnabled,
  addDebugEntry,
  clearDebugLog,
  getCurrentAlarmIds,
  buildDebugSnapshot,
  buildTimerList,
  pushDebugSnapshot,
} = await import('../utils/debug-log.js')

function store() {
  return storage.__stores().get('aibolit-data.json')
}

function seed() {
  storage.__resetStorage()
  fs.__resetFs()
  alarm.__reset()
  new storage.ShareLocalStorage('aibolit-data.json')
}

beforeEach(() => {
  seed()
})

test('isDebugModeEnabled выключен, если настройки отсутствуют', () => {
  assert.equal(isDebugModeEnabled(), false)
})

test('isDebugModeEnabled выключен по умолчанию (debugMode=false)', () => {
  store().set('settings', { debugMode: false, minFontSize: 16 })
  assert.equal(isDebugModeEnabled(), false)
})

test('isDebugModeEnabled включён при debugMode=true', () => {
  store().set('settings', { debugMode: true, minFontSize: 16 })
  assert.equal(isDebugModeEnabled(), true)
})

test('addDebugEntry не пишет в лог, когда отладка выключена', () => {
  addDebugEntry('добавлен таймер id=1')
  assert.deepEqual(store().get('debugLog') || [], [])
})

test('addDebugEntry пишет сообщение с меткой времени, когда отладка включена', () => {
  store().set('settings', { debugMode: true })
  addDebugEntry('добавлен таймер id=1')

  const log = store().get('debugLog')
  assert.equal(log.length, 1)
  assert.equal(log[0].message, 'добавлен таймер id=1')
  assert.equal(typeof log[0].ts, 'number')
})

test('addDebugEntry хранит только последние 100 записей', () => {
  store().set('settings', { debugMode: true })
  for (let i = 0; i < 120; i++) addDebugEntry('сообщение ' + i)

  const log = store().get('debugLog')
  assert.equal(log.length, 100)
  assert.equal(log[0].message, 'сообщение 20')
  assert.equal(log[log.length - 1].message, 'сообщение 119')
})

test('clearDebugLog очищает лог', () => {
  store().set('settings', { debugMode: true })
  addDebugEntry('один')
  clearDebugLog()
  assert.deepEqual(store().get('debugLog'), [])
})

test('getCurrentAlarmIds возвращает активные таймеры с часов', () => {
  alarm.set({ url: 'app-service/reminder' })
  alarm.set({ url: 'app-service/reminder' })
  assert.deepEqual(getCurrentAlarmIds(), [1, 2])
})

test('buildDebugSnapshot возвращает подробные сведения о таймерах и лог', () => {
  store().set('settings', { debugMode: true })
  alarm.set({ url: 'app-service/reminder' })
  addDebugEntry('добавлен таймер id=1')

  const snapshot = buildDebugSnapshot()
  assert.equal(snapshot.timers.length, 1)
  assert.equal(snapshot.timers[0].id, 1)
  assert.equal(snapshot.timers[0].type, 'unknown')
  assert.equal(snapshot.log.length, 1)
})

test('buildDebugSnapshot описывает intake-таймер с названием лекарства', () => {
  store().set('settings', { debugMode: true })
  store().set('medications', [{ id: 'm1', name: 'Парацетамол', dosage: '500 мг', enabled: true }])
  store().set('intakes', [{ id: 'i1', time: '08:00', weekDays: [1, 3, 5], label: 'Утро', items: [{ medicationId: 'm1', amount: '1 таб' }] }])
  alarm.set({ url: 'app-service/reminder' })
  setAlarmRegistry({
    1: { type: 'intake', intakeId: 'i1', time: '08:00', weekDays: [1, 3, 5], label: 'Утро', next: 1000 },
  })

  const timers = buildTimerList()
  assert.equal(timers.length, 1)
  assert.equal(timers[0].type, 'intake')
  assert.equal(timers[0].time, '08:00')
  assert.equal(timers[0].items, 'Парацетамол (500 мг) \u00d7 1 таб')
})

test('pushDebugSnapshot отправляет snapshot на телефон через messaging', async () => {
  store().set('settings', { debugMode: true })
  alarm.set({ url: 'app-service/reminder' })

  let sent = null
  globalThis.getApp = () => ({
    _options: {
      globalData: {
        messaging: {
          request(payload) {
            sent = payload
            return Promise.resolve({ success: true })
          },
        },
      },
    },
  })

  pushDebugSnapshot()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.ok(sent, 'запрос должен уйти на телефон')
  assert.equal(sent.method, 'debug_sync')
  assert.equal(sent.params.snapshot.timers[0].id, 1)

  delete globalThis.getApp
})

test('pushDebugSnapshot не делает ничего без messaging', () => {
  assert.doesNotThrow(() => pushDebugSnapshot())
})

test('pushDebugSnapshot использует messaging, переданный через initSync', async () => {
  store().set('settings', { debugMode: true })
  alarm.set({ url: 'app-service/reminder' })

  const sent = []
  syncModule.initSync({
    request(payload) {
      sent.push(payload)
      return Promise.resolve({ success: true })
    },
  })

  pushDebugSnapshot()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(sent.length, 1, 'снимок отправлен через sideService из initSync')
  assert.equal(sent[0].method, 'debug_sync')
  assert.equal(sent[0].params.snapshot.timers[0].id, 1)

  syncModule.initSync(null)
})
