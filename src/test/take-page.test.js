import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

let pageOpts = null
globalThis.Page = (opts) => { pageOpts = opts }

const { __getRegistry, __reset, event, widget } = await import('./helpers/stubs/zos-ui.mjs')
const storage = await import('./helpers/stubs/zos-storage.mjs')
const router = await import('./helpers/stubs/zos-router.mjs')
const device = await import('./helpers/stubs/zos-device.mjs')
const { PRAISE_MESSAGES } = await import('../utils/praise-messages.js')

await import('../page/take/index.js')

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

function instance(params) {
  const obj = Object.create(pageOpts)
  obj.state = { message: '' }
  obj.onInit(params)
  return obj
}

function rawLogs() {
  return storage.__stores().get('aibolit-data.json').get('takeLogs')
}

beforeEach(() => {
  __reset()
  router.__reset()
  device.__setShape('round')
  seed()
})

test('onInit отмечает intake принятым по JSON-строке', () => {
  instance(JSON.stringify({ intakeId: 'i1' }))

  const logs = rawLogs()
  assert.equal(logs.length, 1)
  assert.equal(logs[0].intakeId, 'i1')
  assert.equal(logs[0].status, 'taken')
  assert.equal(logs[0].date, todayStr())
})

test('onInit отмечает приём, если ключ пришёл как intakeID', () => {
  instance(JSON.stringify({ intakeID: 'i1' }))

  const logs = rawLogs()
  assert.equal(logs.length, 1)
  assert.equal(logs[0].status, 'taken')
})

test('onInit не дублирует уже принятый сегодня intake', () => {
  storage.__stores().get('aibolit-data.json').set('takeLogs', [{
    intakeId: 'i1',
    date: todayStr(),
    status: 'taken',
  }])

  instance(JSON.stringify({ intakeId: 'i1' }))

  const logs = rawLogs()
  assert.equal(logs.length, 1)
})

test('onInit записывает приём по intakeId, даже если intake не найден в хранилище', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [])
  const page = instance(JSON.stringify({ intakeId: 'i1' }))

  const logs = rawLogs()
  assert.equal(logs.length, 1)
  assert.equal(logs[0].intakeId, 'i1')
  assert.equal(logs[0].status, 'taken')
  assert.ok(PRAISE_MESSAGES.includes(page.state.message), 'сообщение должно быть из списка похвалы')
})

test('onInit задаёт случайное сообщение из списка похвалы', () => {
  const page = instance(JSON.stringify({ intakeId: 'i1' }))
  assert.ok(PRAISE_MESSAGES.includes(page.state.message), 'сообщение должно быть из списка похвалы')
})

test('onInit снимает pending-уведомление для принятого приёма', () => {
  storage.__stores().get('aibolit-data.json').set('pendingNotification', { intakeId: 'i1', date: todayStr() })
  instance(JSON.stringify({ intakeId: 'i1' }))
  assert.equal(storage.__stores().get('aibolit-data.json').get('pendingNotification'), undefined)
})

test('build рисует заголовок, сообщение и кнопку «Готово»', () => {
  const page = instance(JSON.stringify({ intakeId: 'i1' }))
  page.build()

  const texts = __getRegistry().map(w => w.props.text).filter(Boolean)
  assert.ok(texts.includes('Принято \u2713'), 'должен быть заголовок «Принято ✓»')
  assert.ok(texts.includes('Готово'), 'должна быть кнопка «Готово»')
  assert.ok(PRAISE_MESSAGES.includes(page.state.message))
})

test('кнопка «Готово» закрывает приложение через exit', () => {
  const page = instance(JSON.stringify({ intakeId: 'i1' }))
  page.build()

  const btn = __getRegistry().find(w => w.props.text === 'Готово')
  assert.ok(btn, 'кнопка «Готово» должна существовать')
  btn.listeners[event.CLICK_UP]()

  const calls = router.__getCalls()
  assert.ok(calls.some(c => c.method === 'exit'), 'должен быть вызов exit')
})
