import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

let pageOpts = null
globalThis.Page = (opts) => { pageOpts = opts }

const { __reset } = await import('./helpers/stubs/zos-ui.mjs')
const storage = await import('./helpers/stubs/zos-storage.mjs')
const fs = await import('./helpers/stubs/zos-fs.mjs')
const router = await import('./helpers/stubs/zos-router.mjs')
const device = await import('./helpers/stubs/zos-device.mjs')
const alarm = await import('./helpers/stubs/zos-alarm.mjs')

await import('../page/snooze/index.js')

function instance() {
  const obj = Object.create(pageOpts)
  obj.state = {
    intakeId: 'i1',
    intake: { id: 'i1', time: '08:00', items: [{ medicationId: 'm1', amount: '1 таблетка' }] },
  }
  return obj
}

function seed() {
  storage.__resetStorage()
  fs.__resetFs()
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
  __reset()
  router.__reset()
  alarm.__reset()
  device.__setShape('round')
  seed()
})

test('confirmSnooze создаёт будильник, записывает отложку и закрывает приложение', () => {
  const page = instance()
  page.confirmSnooze(30)

  const sets = alarm.__getCalls().filter(c => c.method === 'set')
  assert.equal(sets.length, 1, 'должен быть создан будильник')
  assert.equal(sets[0].option.url, 'app-service/reminder')
  const param = JSON.parse(sets[0].option.param)
  assert.equal(param.mode, 'snooze')
  assert.equal(param.intakeId, 'i1')

  const logs = storage.__stores().get('aibolit-data.json').get('takeLogs')
  assert.equal(logs.length, 1)
  assert.equal(logs[0].intakeId, 'i1')
  assert.equal(logs[0].status, 'snoozed')
  assert.equal(logs[0].date, todayStr())

  const exits = router.__getCalls().filter(c => c.method === 'exit')
  assert.equal(exits.length, 1, 'приложение должно закрыться через exit')
})

test('confirmSnooze не дублирует отложку уже принятого приёма', () => {
  storage.__stores().get('aibolit-data.json').set('takeLogs', [{
    intakeId: 'i1',
    date: todayStr(),
    status: 'taken',
  }])

  const page = instance()
  page.confirmSnooze(30)

  const sets = alarm.__getCalls().filter(c => c.method === 'set')
  assert.equal(sets.length, 0, 'не должен создавать будильник для принятого приёма')
  const logs = storage.__stores().get('aibolit-data.json').get('takeLogs')
  assert.equal(logs.length, 1, 'не должен дублировать запись')
})

test('confirmSnooze снимает pending-уведомление и передаёт дату в будильник', () => {
  storage.__stores().get('aibolit-data.json').set('pendingNotification', { intakeId: 'i1', date: todayStr() })
  const page = instance()
  page.confirmSnooze(30)
  const set = alarm.__getCalls().find(c => c.method === 'set')
  assert.ok(set, 'должен быть создан будильник')
  assert.equal(JSON.parse(set.option.param).date, todayStr())
  assert.equal(storage.__stores().get('aibolit-data.json').get('pendingNotification'), undefined)
})

test('confirmSnooze без intakeId просто закрывает приложение', () => {
  const page = instance()
  page.state.intakeId = null
  page.state.intake = null
  page.confirmSnooze(30)

  const sets = alarm.__getCalls().filter(c => c.method === 'set')
  assert.equal(sets.length, 0)
  const exits = router.__getCalls().filter(c => c.method === 'exit')
  assert.equal(exits.length, 1)
})
