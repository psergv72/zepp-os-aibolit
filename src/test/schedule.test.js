import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const alarm = await import('./helpers/stubs/zos-alarm.mjs')
const storage = await import('./helpers/stubs/zos-storage.mjs')
const fs = await import('./helpers/stubs/zos-fs.mjs')

const { refreshAlarms, createSyncAlarm, createSnoozeAlarm, createRetryTickAlarm } = await import('../utils/schedule.js')
const syncModule = await import('../utils/sync.js')

function seed() {
  storage.__resetStorage()
  fs.__resetFs()
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

test('refreshAlarms не отменяет intake-таймер при пустых медикаментах (неполная конфигурация)', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  refreshAlarms()
  const first = intakeSets()[0]
  assert.ok(first, 'intake-таймер создан при загруженных лекарствах')

  storage.__stores().get('aibolit-data.json').set('medications', [])

  refreshAlarms()

  const cancels = alarm.__getCalls().filter(c => c.method === 'cancel' && c.id === first.id)
  assert.equal(cancels.length, 0, 'intake-таймер не должен быть отменён при пустых медикаментах')
})

test('refreshAlarms не отменяет intake-таймер при полностью сброшенной конфигурации', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  refreshAlarms()
  const first = intakeSets()[0]
  assert.ok(first, 'intake-таймер создан')

  storage.__stores().get('aibolit-data.json').set('medications', [])
  storage.__stores().get('aibolit-data.json').set('intakes', [])

  refreshAlarms()

  const cancels = alarm.__getCalls().filter(c => c.method === 'cancel' && c.id === first.id)
  assert.equal(cancels.length, 0, 'intake-таймер не должен быть отменён при сброшенной конфигурации')
})

test('refreshAlarms логирует сброс конфигурации при сохранении таймеров', () => {
  storage.__stores().get('aibolit-data.json').set('settings', { debugMode: true, syncInterval: 60 })
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  refreshAlarms()

  storage.__stores().get('aibolit-data.json').set('medications', [])
  storage.__stores().get('aibolit-data.json').set('intakes', [])

  refreshAlarms()

  const log = storage.__stores().get('aibolit-data.json').get('debugLog')
  assert.ok(log.some(e => /конфигурация сброшена/.test(e.message)), 'в логе сброс конфигурации')
})

test('refreshAlarms создаёт intake-таймер при пустых медикаментах, если его нет', () => {
  storage.__stores().get('aibolit-data.json').set('medications', [])
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])

  refreshAlarms()

  const sets = intakeSets()
  assert.equal(sets.length, 1, 'intake-таймер создан даже при пустых медикаментах')
})

test('refreshAlarms пишет в лог снимок таймеров в начале перестройки', () => {
  storage.__stores().get('aibolit-data.json').set('settings', { debugMode: true, syncInterval: 60 })
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])

  refreshAlarms()

  const log = storage.__stores().get('aibolit-data.json').get('debugLog')
  assert.ok(log.some(e => /перестройка расписания: активных таймеров/.test(e.message)), 'в логе снимок таймеров в начале перестройки')
  assert.ok(log.some(e => /лекарств в конфиге 3/.test(e.message)), 'в логе количество лекарств')
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
  assert.equal(syncSet.option.repeat_period, 30)
  assert.equal(syncSet.option.repeat_duration, 1)
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

test('refreshAlarms не отменяет активный snooze-будильник', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  const snoozeId = createSnoozeAlarm('i1', 30, '2026-08-08')

  refreshAlarms()

  const cancels = alarm.__getCalls().filter(c => c.method === 'cancel')
  assert.ok(!cancels.some(c => c.id === snoozeId), 'snooze-будильник не должен быть отменён refreshAlarms')
})

test('createSnoozeAlarm сохраняет id будильника в storage', () => {
  const id = createSnoozeAlarm('i1', 30, '2026-08-08')
  assert.equal(storage.__stores().get('aibolit-data.json').get('snoozeAlarmId'), id)
})

test('createSnoozeAlarm планирует по абсолютному времени time = now + delay', () => {
  const before = Math.floor(Date.now() / 1000)
  createSnoozeAlarm('i1', 2, '2026-08-08')
  const set = alarm.__getCalls().find(c => c.method === 'set')
  assert.ok(set, 'должен быть создан будильник')
  assert.equal(set.option.delay, undefined, 'delay не должен использоваться')
  assert.ok(set.option.time >= before + 110 && set.option.time <= before + 130, `time ${set.option.time} должен быть ≈ now + 120 сек`)
})

test('createRetryTickAlarm создаёт периодический будильник REPEAT_MINUTE и сохраняет id', () => {
  createRetryTickAlarm()
  const sets = alarm.__getCalls().filter(c => c.method === 'set')
  const tick = sets.find(c => JSON.parse(c.option.param).mode === 'retry_tick')
  assert.ok(tick, 'тик-будильник создан')
  assert.equal(tick.option.url, 'app-service/reminder')
  assert.equal(tick.option.repeat_type, 1, 'REPEAT_MINUTE')
  assert.equal(tick.option.repeat_period, 1)
  assert.equal(tick.option.repeat_duration, 1, 'период тика 1 мин')
  const storedId = storage.__stores().get('aibolit-data.json').get('retryTickAlarmId')
  assert.ok(storedId > 0, 'id тик-будильника сохранён в storage')
})

test('refreshAlarms создаёт тик-будильник один раз и не отменяет его', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  refreshAlarms()
  refreshAlarms()
  const tickSets = alarm.__getCalls().filter(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'retry_tick')
  assert.equal(tickSets.length, 1, 'тик-будильник создаётся один раз')
  const tickId = tickSets[0].id
  const cancels = alarm.__getCalls().filter(c => c.method === 'cancel')
  assert.ok(!cancels.some(c => c.id === tickId), 'тик-будильник не должен быть отменён')
})

test('createRetryTickAlarm задаёт окно повтора start_time/end_time до конца дня', () => {
  createRetryTickAlarm()
  const sets = alarm.__getCalls().filter(c => c.method === 'set')
  const tick = sets.find(c => JSON.parse(c.option.param).mode === 'retry_tick')
  assert.ok(tick, 'тик-будильник создан')
  assert.equal(typeof tick.option.start_time, 'number', 'start_time задан')
  assert.equal(typeof tick.option.end_time, 'number', 'end_time задан')
  assert.ok(tick.option.end_time > tick.option.time, 'end_time позже первого срабатывания')
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  assert.equal(tick.option.end_time, Math.floor(tomorrow.getTime() / 1000), 'end_time = конец текущего дня')
  const storedId = storage.__stores().get('aibolit-data.json').get('retryTickAlarmId')
  const registry = storage.__stores().get('aibolit-data.json').get('alarmRegistry')
  assert.equal(registry[storedId].endTime, tick.option.end_time, 'endTime сохранён в реестре')
})

test('refreshAlarms пересоздаёт тик-будильник с истёкшим окном повтора', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  refreshAlarms()
  const tickSets = alarm.__getCalls().filter(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'retry_tick')
  assert.equal(tickSets.length, 1, 'первый тик-будильник создан')
  const tickId = tickSets[0].id
  const registry = storage.__stores().get('aibolit-data.json').get('alarmRegistry')
  registry[tickId].endTime = Math.floor(Date.now() / 1000) - 60
  storage.__stores().get('aibolit-data.json').set('alarmRegistry', registry)

  refreshAlarms()

  const setsAfter = alarm.__getCalls().filter(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'retry_tick')
  assert.equal(setsAfter.length, 2, 'тик-будильник пересоздан при истёкшем окне')
  const cancels = alarm.__getCalls().filter(c => c.method === 'cancel' && c.id === tickId)
  assert.equal(cancels.length, 1, 'старый тик-будильник отменён')
})

test('refreshAlarms пересоздаёт тик-будильник старого формата без endTime', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  refreshAlarms()
  const tickSets = alarm.__getCalls().filter(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'retry_tick')
  assert.equal(tickSets.length, 1, 'первый тик-будильник создан')
  const tickId = tickSets[0].id
  const registry = storage.__stores().get('aibolit-data.json').get('alarmRegistry')
  registry[tickId] = { type: 'retryTick', scheduleVersion: 2 }
  storage.__stores().get('aibolit-data.json').set('alarmRegistry', registry)

  refreshAlarms()

  const setsAfter = alarm.__getCalls().filter(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'retry_tick')
  assert.equal(setsAfter.length, 2, 'тик-будильник без endTime пересоздаётся')
})

test('refreshAlarms пересоздаёт тик-будильник, когда до конца окна осталось меньше часа', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  refreshAlarms()
  const tickSets = alarm.__getCalls().filter(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'retry_tick')
  assert.equal(tickSets.length, 1, 'первый тик-будильник создан')
  const tickId = tickSets[0].id
  const registry = storage.__stores().get('aibolit-data.json').get('alarmRegistry')
  registry[tickId].endTime = Math.floor(Date.now() / 1000) + 30 * 60
  storage.__stores().get('aibolit-data.json').set('alarmRegistry', registry)

  refreshAlarms()

  const setsAfter = alarm.__getCalls().filter(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'retry_tick')
  assert.equal(setsAfter.length, 2, 'тик пересоздан при малом остатке окна')
})

test('createSyncAlarm задаёт окно повтора start_time/end_time и сохраняет endTime в реестре', () => {
  createSyncAlarm(60)
  const set = alarm.__getCalls().find(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'sync')
  assert.ok(set, 'sync-таймер создан')
  assert.equal(typeof set.option.start_time, 'number', 'start_time задан')
  assert.equal(typeof set.option.end_time, 'number', 'end_time задан')
  assert.ok(set.option.end_time > set.option.time, 'end_time позже первого срабатывания')
  const storedId = storage.__stores().get('aibolit-data.json').get('syncAlarmId')
  const registry = storage.__stores().get('aibolit-data.json').get('alarmRegistry')
  assert.equal(registry[storedId].endTime, set.option.end_time, 'endTime сохранён в реестре')
})

test('refreshAlarms пересоздаёт sync-таймер, если до конца окна осталось мало времени', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [])
  refreshAlarms()
  const firstSync = alarm.__getCalls().find(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'sync')
  assert.ok(firstSync, 'sync-таймер создан')
  const syncId = firstSync.id
  const registry = storage.__stores().get('aibolit-data.json').get('alarmRegistry')
  registry[syncId].endTime = Math.floor(Date.now() / 1000) + 60 * 60
  storage.__stores().get('aibolit-data.json').set('alarmRegistry', registry)

  refreshAlarms()

  const syncSets = alarm.__getCalls().filter(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'sync')
  assert.equal(syncSets.length, 2, 'sync пересоздан при малом остатке окна')
})

test('refreshAlarms логирует причину пропуска приёма без активных лекарств', () => {
  storage.__stores().get('aibolit-data.json').set('settings', { debugMode: true, syncInterval: 60 })
  storage.__stores().get('aibolit-data.json').set('medications', [
    { id: 'm2', name: 'Другое', enabled: true },
  ])
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])

  refreshAlarms()

  const log = storage.__stores().get('aibolit-data.json').get('debugLog')
  assert.ok(log.some(e => /приём i1 пропущен: нет активных лекарств/.test(e.message)), 'в логе причина пропуска приёма')
  const sets = intakeSets()
  assert.equal(sets.length, 0, 'таймер пропущенного приёма не создан')
})

test('createSnoozeAlarm передаёт date в параметр будильника', () => {
  createSnoozeAlarm('i1', 30, '2026-08-07')
  const set = alarm.__getCalls().find(c => c.method === 'set')
  assert.ok(set, 'должен быть создан будильник')
  const param = JSON.parse(set.option.param)
  assert.equal(param.mode, 'snooze')
  assert.equal(param.intakeId, 'i1')
  assert.equal(param.date, '2026-08-07')
})

test('createIntakeAlarm пишет отладочное сообщение при включённой отладке', () => {
  storage.__stores().get('aibolit-data.json').set('settings', { debugMode: true, syncInterval: 60 })
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])

  refreshAlarms()

  const log = storage.__stores().get('aibolit-data.json').get('debugLog')
  assert.ok(Array.isArray(log) && log.length > 0, 'debugLog должен быть заполнен')
  assert.ok(log.some(e => /добавлен таймер/.test(e.message)), 'есть запись о добавлении таймера')
  assert.ok(log.some(e => /sync-таймер/.test(e.message)), 'есть запись о sync-таймере')
})

test('sync-таймер отражает настроенный интервал 2 мин в реестре и логе', () => {
  storage.__stores().get('aibolit-data.json').set('settings', { debugMode: true, syncInterval: 2, minFontSize: 16 })
  refreshAlarms()
  const registry = storage.__stores().get('aibolit-data.json').get('alarmRegistry')
  const syncEntry = Object.values(registry).find(e => e.type === 'sync')
  assert.equal(syncEntry.interval, 2, 'в реестре настроенный интервал')
  const log = storage.__stores().get('aibolit-data.json').get('debugLog')
  assert.ok(log.some(e => /sync-таймер.*период 2 мин/.test(e.message)), 'в логе настроенный интервал')
})

test('sync-таймер с интервалом 1 мин отражает интервал 1', () => {
  storage.__stores().get('aibolit-data.json').set('settings', { debugMode: true, syncInterval: 1, minFontSize: 16 })
  refreshAlarms()
  const registry = storage.__stores().get('aibolit-data.json').get('alarmRegistry')
  const syncEntry = Object.values(registry).find(e => e.type === 'sync')
  assert.equal(syncEntry.interval, 1, 'в реестре интервал 1 мин')
  const log = storage.__stores().get('aibolit-data.json').get('debugLog')
  assert.ok(log.some(e => /sync-таймер.*период 1 мин/.test(e.message)), 'в логе интервал 1 мин')
})

test('sync-таймер задаёт repeat_period равный настроенному интервалу', () => {
  storage.__stores().get('aibolit-data.json').set('settings', { syncInterval: 1, minFontSize: 16 })
  refreshAlarms()
  let syncSet = alarm.__getCalls().find(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'sync')
  assert.equal(syncSet.option.repeat_period, 1, 'интервал 1 мин → repeat_period 1')

  alarm.__reset()
  storage.__stores().get('aibolit-data.json').set('settings', { syncInterval: 2, minFontSize: 16 })
  refreshAlarms()
  syncSet = alarm.__getCalls().find(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'sync')
  assert.equal(syncSet.option.repeat_period, 2, 'интервал 2 мин → repeat_period 2')
})

test('createIntakeAlarm не пишет в debugLog при выключенной отладке', () => {
  storage.__stores().get('aibolit-data.json').set('settings', { debugMode: false, syncInterval: 60 })
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])

  refreshAlarms()

  const log = storage.__stores().get('aibolit-data.json').get('debugLog')
  assert.equal(log, undefined, 'debugLog не должен заполняться без отладки')
})

test('refreshAlarms при включённой отладке отправляет снимок на телефон', async () => {
  const sent = []
  syncModule.initSync({
    request(payload) {
      sent.push(payload)
      return Promise.resolve({ success: true })
    },
  })
  storage.__stores().get('aibolit-data.json').set('settings', { debugMode: true, syncInterval: 60 })
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])

  refreshAlarms()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.ok(sent.some(p => p.method === 'debug_sync'), 'при отладке отправляется debug_sync')
  assert.ok(sent.some(p => p.method === 'debug_sync' && Array.isArray(p.params.snapshot.timers)), 'снимок содержит список таймеров')
  syncModule.initSync(null)
})

test('createIntakeAlarm регистрирует таймер в реестре с данными приёма', () => {
  storage.__stores().get('aibolit-data.json').set('medications', [
    { id: 'm1', name: 'Парацетамол', dosage: '500 мг', enabled: true },
  ])
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: [1, 3, 5], label: 'Утро', items: [{ medicationId: 'm1', amount: '1 таб' }] },
  ])

  refreshAlarms()

  const registry = storage.__stores().get('aibolit-data.json').get('alarmRegistry')
  assert.ok(registry, 'реестр таймеров должен существовать')
  const intakeEntry = Object.values(registry).find(e => e.type === 'intake')
  assert.ok(intakeEntry, 'intake-таймер должен быть в реестре')
  assert.equal(intakeEntry.intakeId, 'i1')
  assert.equal(intakeEntry.time, '08:00')
  assert.deepEqual(intakeEntry.weekDays, [1, 3, 5])
})

test('refreshAlarms вычищает из реестра таймер при изменении параметров приёма', () => {
  storage.__stores().get('aibolit-data.json').set('settings', { debugMode: false, syncInterval: 60 })
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  const staleAlarmId = alarm.set({ url: 'app-service/reminder' })
  storage.__stores().get('aibolit-data.json').set('alarmRegistry', {
    [staleAlarmId]: { type: 'intake', intakeId: 'i1', time: '09:00', weekDays: null },
  })

  refreshAlarms()

  const registry = storage.__stores().get('aibolit-data.json').get('alarmRegistry')
  assert.equal(registry[staleAlarmId], undefined, 'таймер с изменившимися параметрами должен быть вычищен из реестра')
})

test('refreshAlarms не пересоздаёт таймер приёма при неизменных параметрах', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])

  refreshAlarms()
  const firstSets = intakeSets()
  assert.equal(firstSets.length, 1)
  const firstId = firstSets[0].id

  refreshAlarms()

  const sets = intakeSets()
  assert.equal(sets.length, 1, 'повторный refresh не должен создавать новый таймер приёма')
  const cancels = alarm.__getCalls().filter(c => c.method === 'cancel' && c.id === firstId)
  assert.equal(cancels.length, 0, 'неизменный таймер приёма не отменяется')
})

test('refreshAlarms пересоздаёт таймер приёма при изменении времени', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])

  refreshAlarms()
  const first = intakeSets()[0]

  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '09:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  refreshAlarms()

  const sets = intakeSets()
  assert.equal(sets.length, 2, 'изменение времени → создаётся новый таймер')
  assert.notEqual(sets[1].id, first.id, 'новый таймер имеет другой id')
  const cancels = alarm.__getCalls().filter(c => c.method === 'cancel' && c.id === first.id)
  assert.equal(cancels.length, 1, 'старый таймер приёма отменён')
})

test('refreshAlarms пересоздаёт таймер приёма при изменении дней недели', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])

  refreshAlarms()
  const first = intakeSets()[0]

  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: [1, 3, 5], items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  refreshAlarms()

  const sets = intakeSets()
  assert.equal(sets.length, 2, 'изменение дней недели → создаётся новый таймер')
  assert.notEqual(sets[1].id, first.id)
  const cancels = alarm.__getCalls().filter(c => c.method === 'cancel' && c.id === first.id)
  assert.equal(cancels.length, 1, 'старый таймер приёма отменён')
})

test('refreshAlarms не пересоздаёт sync-таймер при неизменном интервале', () => {
  storage.__stores().get('aibolit-data.json').set('settings', { retryInterval: 60, syncInterval: 30, snoozeOptions: [30, 45, 60, 90], minFontSize: 16 })
  storage.__stores().get('aibolit-data.json').set('intakes', [])

  refreshAlarms()
  refreshAlarms()

  const syncSets = alarm.__getCalls().filter(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'sync')
  assert.equal(syncSets.length, 1, 'повторный refresh не должен создавать новый sync-таймер')
})

test('refreshAlarms пересоздаёт sync-таймер при изменении интервала', () => {
  storage.__stores().get('aibolit-data.json').set('settings', { syncInterval: 30, minFontSize: 16 })
  storage.__stores().get('aibolit-data.json').set('intakes', [])

  refreshAlarms()
  const firstSync = alarm.__getCalls().find(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'sync')
  const firstSyncId = firstSync.id

  storage.__stores().get('aibolit-data.json').set('settings', { syncInterval: 60, minFontSize: 16 })
  refreshAlarms()

  const syncSets = alarm.__getCalls().filter(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'sync')
  assert.equal(syncSets.length, 2, 'изменение интервала → создаётся новый sync-таймер')
  const cancels = alarm.__getCalls().filter(c => c.method === 'cancel' && c.id === firstSyncId)
  assert.equal(cancels.length, 1, 'старый sync-таймер отменён')
})

test('refreshAlarms пересоздаёт таймер приёма, если система сняла его', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])

  refreshAlarms()
  const first = intakeSets()[0]

  alarm.cancel(first.id)

  refreshAlarms()

  const sets = intakeSets()
  assert.equal(sets.length, 2, 'снятый системой таймер приёма создаётся заново')
})

test('createRetryTickAlarm не переиспользует сохранённый id, если таймера нет в реестре', () => {
  storage.__stores().get('aibolit-data.json').set('retryTickAlarmId', 500)

  const id = createRetryTickAlarm()

  assert.notEqual(id, 500, 'устаревший id не переиспользуется')
  const tickSets = alarm.__getCalls().filter(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'retry_tick')
  assert.equal(tickSets.length, 1, 'создан новый тик-таймер')
})

test('refreshAlarms пересоздаёт sync-таймер, если в реестре устаревшая версия расписания', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  storage.__stores().get('aibolit-data.json').set('settings', { syncInterval: 2, minFontSize: 16 })

  refreshAlarms()
  const firstSync = alarm.__getCalls().find(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'sync')
  const syncId = firstSync.id

  const registry = storage.__stores().get('aibolit-data.json').get('alarmRegistry')
  registry[syncId].scheduleVersion = 1
  storage.__stores().get('aibolit-data.json').set('alarmRegistry', registry)

  refreshAlarms()

  const syncSets = alarm.__getCalls().filter(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'sync')
  assert.equal(syncSets.length, 2, 'sync пересоздан при устаревшей версии')
  const cancels = alarm.__getCalls().filter(c => c.method === 'cancel' && c.id === syncId)
  assert.equal(cancels.length, 1, 'старый sync-таймер отменён')
})

test('refreshAlarms отменяет системный таймер без записи в реестре', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [])
  const strayId = alarm.set({ url: 'app-service/reminder' })

  refreshAlarms()

  const cancels = alarm.__getCalls().filter(c => c.method === 'cancel' && c.id === strayId)
  assert.equal(cancels.length, 1, 'таймер без записи в реестре отменяется')
})

test('refreshAlarms отменяет таймер удалённого приёма', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
    { id: 'i2', time: '12:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  refreshAlarms()
  const i2 = intakeSets().find(c => JSON.parse(c.option.param).intakeId === 'i2')
  assert.ok(i2, 'таймер i2 создан')

  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  refreshAlarms()

  const cancels = alarm.__getCalls().filter(c => c.method === 'cancel' && c.id === i2.id)
  assert.equal(cancels.length, 1, 'таймер удалённого приёма отменяется')
})
