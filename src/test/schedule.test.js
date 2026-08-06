import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const alarm = await import('./helpers/stubs/zos-alarm.mjs')
const storage = await import('./helpers/stubs/zos-storage.mjs')

const { refreshAlarms, createSyncAlarm } = await import('../utils/schedule.js')

function seed() {
  storage.__resetStorage()
  new storage.ShareLocalStorage('aibolit-data.json')
  storage.__stores().get('aibolit-data.json').set('medications', [
    { id: 'm1', name: 'Парацетамол', enabled: true },
    { id: 'm2', name: 'Аспирин', enabled: true },
    { id: 'm3', name: 'Отключён', enabled: false },
  ])
}

function intakeSets() {
  return alarm.__getCalls().filter(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'reminder')
}

beforeEach(() => {
  seed()
  alarm.__reset()
})

test('refreshAlarms создаёт alarm для каждого активного приёма, включая приёмы не на сегодняшний день', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: [1, 3, 5], items: [{ medicationId: 'm1', amount: '1' }] },
    { id: 'i2', time: '12:00', weekDays: [2, 4], items: [{ medicationId: 'm2', amount: '1' }] },
  ])

  refreshAlarms()

  const sets = intakeSets()
  assert.equal(sets.length, 2)
  const ids = sets.map(c => JSON.parse(c.option.param).intakeId)
  assert.deepEqual(ids.sort(), ['i1', 'i2'])
})

test('refreshAlarms не создаёт alarm для приёма без включённых лекарств', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm3', amount: '1' }] },
  ])

  refreshAlarms()

  const sets = intakeSets()
  assert.equal(sets.length, 0)
})

test('refreshAlarms создаёт alarm для уже принятого сегодня приёма (для будущих недель)', () => {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  storage.__stores().get('aibolit-data.json').set('takeLogs', [{
    intakeId: 'i1',
    date: todayStr,
    status: 'taken',
  }])

  refreshAlarms()

  const sets = intakeSets()
  assert.equal(sets.length, 1)
})

test('refreshAlarms создаёт alarm с REPEAT_WEEK и правильными week_days', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: [1, 4], items: [{ medicationId: 'm1', amount: '1' }] },
  ])

  refreshAlarms()

  const set = intakeSets()[0]
  assert.equal(set.option.repeat_type, 4)
  assert.equal(set.option.week_days, 2 | 16)
  assert.equal(set.option.url, 'app-service/reminder')
})

test('refreshAlarms всё равно создаёт alarm для отменённого сегодня приёма: решение принимает reminder при срабатывании', () => {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  storage.__stores().get('aibolit-data.json').set('cancellations', [{
    intakeId: 'i1',
    date: todayStr,
  }])

  refreshAlarms()

  const sets = intakeSets()
  assert.equal(sets.length, 1)
})

test('createIntakeAlarm задаёт time строго в будущем, даже если время приёма уже прошло сегодня', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '00:01', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])

  refreshAlarms()

  const nowSeconds = Math.floor(Date.now() / 1000)
  const sets = intakeSets()
  assert.equal(sets.length, 1)
  assert.ok(sets[0].option.time > nowSeconds, `time ${sets[0].option.time} должен быть в будущем`)
})

test('refreshAlarms создаёт sync-alarm с REPEAT_MINUTE и repeat_period из настроек', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  storage.__stores().get('aibolit-data.json').set('settings', { retryInterval: 60, syncInterval: 30, snoozeOptions: [30, 45, 60, 90], minFontSize: 16 })

  refreshAlarms()

  const syncSet = alarm.__getCalls().find(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'sync')
  assert.ok(syncSet, 'sync-alarm создан')
  assert.equal(syncSet.option.url, 'app-service/reminder')
  assert.equal(syncSet.option.repeat_type, 1)
  assert.equal(syncSet.option.repeat_period, 29)
  assert.equal(syncSet.option.repeat_period + syncSet.option.repeat_duration, 30)
})

test('createSyncAlarm отменяет предыдущий sync-alarm и сохраняет новый id', () => {
  createSyncAlarm(60)
  const firstId = storage.__stores().get('aibolit-data.json').get('syncAlarmId')
  assert.ok(firstId > 0, 'первый sync-alarm id сохранён')

  createSyncAlarm(60)
  const cancels = alarm.__getCalls().filter(c => c.method === 'cancel')
  assert.ok(cancels.some(c => c.id === firstId), 'старый sync-alarm отменён')
  const newId = storage.__stores().get('aibolit-data.json').get('syncAlarmId')
  assert.notEqual(newId, firstId)
})
