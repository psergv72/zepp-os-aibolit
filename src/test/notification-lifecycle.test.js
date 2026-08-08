import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const notification = await import('./helpers/stubs/zos-notification.mjs')
const storage = await import('./helpers/stubs/zos-storage.mjs')
const fs = await import('./helpers/stubs/zos-fs.mjs')
const alarm = await import('./helpers/stubs/zos-alarm.mjs')

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

function todayStr() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

function store() {
  return storage.__stores().get('aibolit-data.json')
}

beforeEach(() => {
  seed()
  notification.__reset()
  alarm.__reset()
  fs.__resetFs()
})

test('issueNotification выдаёт уведомление и сохраняет pending без ретрай-будильника', () => {
  lifecycle.issueNotification('i1')
  assert.equal(notification.__calls.length, 1)
  const pending = store().get('pendingNotification')
  assert.equal(pending.intakeId, 'i1')
  assert.equal(pending.date, todayStr())
  assert.equal(pending.retryAlarmId, undefined, 'ретрай-будильник не создаётся из AppService')
  const retry = alarm.__getCalls().filter(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'retry')
  assert.equal(retry.length, 0)
})

test('issueNotification содержит кнопку Отменить', () => {
  lifecycle.issueNotification('i1')
  const cancelAction = notification.__calls[0].actions.find(a => a.text === 'Отменить')
  assert.ok(cancelAction, 'в уведомлении есть кнопка Отменить')
  assert.equal(cancelAction.file, 'page/cancel/index')
})

test('issueNotification не выдаёт уведомление для принятого приёма', () => {
  store().set('takeLogs', [{ intakeId: 'i1', date: todayStr(), status: 'taken' }])
  lifecycle.issueNotification('i1')
  assert.equal(notification.__calls.length, 0)
})

test('issueNotification не выдаёт уведомление для пропущенного приёма', () => {
  store().set('takeLogs', [{ intakeId: 'i1', date: todayStr(), status: 'skipped' }])
  lifecycle.issueNotification('i1')
  assert.equal(notification.__calls.length, 0)
})

test('issueNotification помечает чужой pending приём как пропущенный', () => {
  store().set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
    { id: 'i2', time: '09:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  store().set('pendingNotification', { intakeId: 'i1', date: todayStr() })
  lifecycle.issueNotification('i2')
  const logs = store().get('takeLogs')
  assert.equal(logs.length, 1)
  assert.equal(logs[0].intakeId, 'i1')
  assert.equal(logs[0].status, 'skipped')
  assert.equal(logs[0].date, todayStr())
  assert.equal(notification.__calls.length, 1)
})

test('issueNotification не помечает уже принятый чужой pending как пропущенный', () => {
  store().set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
    { id: 'i2', time: '09:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  store().set('takeLogs', [{ intakeId: 'i1', date: todayStr(), status: 'taken' }])
  store().set('pendingNotification', { intakeId: 'i1', date: todayStr() })
  lifecycle.issueNotification('i2')
  const logs = store().get('takeLogs')
  assert.equal(logs.length, 1, 'не должно быть новой skipped записи')
  assert.equal(logs[0].status, 'taken')
  const pending = store().get('pendingNotification')
  assert.equal(pending.intakeId, 'i2')
  assert.equal(pending.date, todayStr())
})

test('issueNotification не помечает pending на удалённый intake как пропущенный', () => {
  store().set('intakes', [
    { id: 'i2', time: '09:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  store().set('pendingNotification', { intakeId: 'deleted', date: todayStr() })
  lifecycle.issueNotification('i2')
  const logs = store().get('takeLogs')
  assert.equal(!logs || logs.length === 0, true)
  const pending = store().get('pendingNotification')
  assert.equal(pending.intakeId, 'i2')
  assert.equal(pending.date, todayStr())
})

test('issueNotification не помечает тот же intake как пропущенный', () => {
  store().set('pendingNotification', { intakeId: 'i1', date: todayStr() })
  lifecycle.issueNotification('i1')
  const logs = store().get('takeLogs')
  assert.equal(!logs || logs.length === 0, true)
  assert.equal(notification.__calls.length, 1)
})

test('issueNotification сбрасывает stale pending другого дня без пометки skipped', () => {
  store().set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
    { id: 'i2', time: '09:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  store().set('pendingNotification', { intakeId: 'i1', date: '2000-01-01' })
  lifecycle.issueNotification('i2')
  const logs = store().get('takeLogs')
  assert.equal(!logs || logs.length === 0, true)
  const pending = store().get('pendingNotification')
  assert.equal(pending.intakeId, 'i2')
  assert.equal(pending.date, todayStr())
})

test('clearPendingForIntake отменяет уведомления и сбрасывает pending для своего intake', () => {
  store().set('pendingNotification', { intakeId: 'i1', date: todayStr() })
  notification.notify({ title: 't', content: 'c', actions: [] })
  lifecycle.clearPendingForIntake('i1')
  assert.ok(notification.__cancelCalls.length >= 1, 'должны быть вызовы cancel')
  assert.equal(lifecycle.getPendingIntake(), null)
})

test('clearPendingForIntake игнорирует чужой pending', () => {
  store().set('pendingNotification', { intakeId: 'i1', date: todayStr() })
  lifecycle.clearPendingForIntake('i2')
  assert.equal(notification.__cancelCalls.length, 0)
  const pending = lifecycle.getPendingIntake()
  assert.equal(pending.intakeId, 'i1')
  assert.equal(pending.date, todayStr())
})

test('clearPendingForIntake при наличии старого retryAlarmId отменяет его', () => {
  store().set('pendingNotification', { intakeId: 'i1', date: todayStr(), retryAlarmId: 42 })
  lifecycle.clearPendingForIntake('i1')
  const cancels = alarm.__getCalls().filter(c => c.method === 'cancel')
  assert.ok(cancels.some(c => c.id === 42), 'старый ретрай-будильник отменяется при резолве')
  assert.equal(lifecycle.getPendingIntake(), null)
})

test('замена pending отменяет ретрай-будильник старого приёма', () => {
  store().set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
    { id: 'i2', time: '09:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  store().set('pendingNotification', { intakeId: 'i1', date: todayStr(), retryAlarmId: 42 })
  lifecycle.issueNotification('i2')
  const cancels = alarm.__getCalls().filter(c => c.method === 'cancel')
  assert.ok(cancels.some(c => c.id === 42), 'ретрай-будильник старого pending должен быть отменён')
})

test('markSkipped добавляет запись skipped и кладёт её в очередь синхронизации', () => {
  lifecycle.markSkipped('i1', todayStr())
  const logs = store().get('takeLogs')
  assert.equal(logs.length, 1)
  assert.equal(logs[0].intakeId, 'i1')
  assert.equal(logs[0].status, 'skipped')
  const queue = store().get('syncQueue')
  assert.equal(queue.length, 1)
  assert.equal(queue[0].status, 'skipped')
})

test('nextRetryIsToday учитывает пересечение полуночи', () => {
  const morning = new Date(2026, 7, 7, 10, 0, 0)
  assert.equal(lifecycle.nextRetryIsToday(morning, 5), true)
  const nearMidnight = new Date(2026, 7, 7, 23, 58, 0)
  assert.equal(lifecycle.nextRetryIsToday(nearMidnight, 5), false)
  const beforeMidnight = new Date(2026, 7, 7, 23, 0, 0)
  assert.equal(lifecycle.nextRetryIsToday(beforeMidnight, 60), false)
})

test('issueNotification сохраняет issuedAt в pending', () => {
  lifecycle.issueNotification('i1')
  const pending = store().get('pendingNotification')
  assert.ok(typeof pending.issuedAt === 'number', 'pending содержит issuedAt')
  assert.ok(pending.issuedAt <= Date.now())
})

test('maybeRetryPending не выдаёт повтор, если интервал ещё не прошёл', () => {
  store().set('settings', { retryInterval: 2, syncInterval: 60, snoozeOptions: [30], minFontSize: 16 })
  store().set('pendingNotification', { intakeId: 'i1', date: todayStr(), issuedAt: Date.now() - 60 * 1000 })
  lifecycle.maybeRetryPending()
  assert.equal(notification.__calls.length, 0)
})

test('maybeRetryPending выдаёт повтор, если интервал прошёл', () => {
  store().set('settings', { retryInterval: 2, syncInterval: 60, snoozeOptions: [30], minFontSize: 16 })
  store().set('pendingNotification', { intakeId: 'i1', date: todayStr(), issuedAt: Date.now() - 3 * 60 * 1000 })
  lifecycle.maybeRetryPending()
  assert.equal(notification.__calls.length, 1)
  const pending = store().get('pendingNotification')
  assert.ok(pending.issuedAt >= Date.now() - 1000, 'issuedAt обновлён после повтора')
})

test('maybeRetryPending игнорирует отсутствующий pending', () => {
  lifecycle.maybeRetryPending()
  assert.equal(notification.__calls.length, 0)
})

test('maybeRetryPending игнорирует уже обработанный приём', () => {
  store().set('settings', { retryInterval: 2, syncInterval: 60, snoozeOptions: [30], minFontSize: 16 })
  store().set('takeLogs', [{ intakeId: 'i1', date: todayStr(), status: 'taken' }])
  store().set('pendingNotification', { intakeId: 'i1', date: todayStr(), issuedAt: Date.now() - 3 * 60 * 1000 })
  lifecycle.maybeRetryPending()
  assert.equal(notification.__calls.length, 0)
})
