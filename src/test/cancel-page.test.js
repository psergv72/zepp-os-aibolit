import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

let pageOpts = null
globalThis.Page = (opts) => { pageOpts = opts }

const { __getRegistry, __reset, event } = await import('./helpers/stubs/zos-ui.mjs')
const storage = await import('./helpers/stubs/zos-storage.mjs')
const router = await import('./helpers/stubs/zos-router.mjs')
const device = await import('./helpers/stubs/zos-device.mjs')

await import('../page/cancel/index.js')

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
  obj.state = { intakeId: null, intake: null }
  obj.onInit(params)
  return obj
}

function store() {
  return storage.__stores().get('aibolit-data.json')
}

beforeEach(() => {
  __reset()
  router.__reset()
  device.__setShape('round')
  seed()
})

test('onInit рисует вопрос и кнопки Да/Нет', () => {
  instance(JSON.stringify({ intakeId: 'i1' }))
  const texts = __getRegistry().map(w => w.props.text).filter(Boolean)
  assert.ok(texts.includes('Отменить приём на сегодня?'), 'должен быть вопрос об отмене')
  assert.ok(texts.includes('Да'), 'должна быть кнопка Да')
  assert.ok(texts.includes('Нет'), 'должна быть кнопка Нет')
})

test('confirmCancel отменяет приём, сбрасывает pending и закрывает приложение', () => {
  store().set('pendingNotification', { intakeId: 'i1', date: todayStr() })
  const page = instance(JSON.stringify({ intakeId: 'i1' }))
  page.confirmCancel()
  assert.deepEqual(store().get('cancellations'), [{ intakeId: 'i1', date: todayStr() }])
  assert.equal(store().get('pendingNotification'), undefined)
  const exits = router.__getCalls().filter(c => c.method === 'exit')
  assert.equal(exits.length, 1)
})

test('кнопка Нет закрывает приложение без отмены', () => {
  const page = instance(JSON.stringify({ intakeId: 'i1' }))
  const noBtn = __getRegistry().find(w => w.props.text === 'Нет')
  assert.ok(noBtn, 'должна быть кнопка Нет')
  noBtn.listeners[event.CLICK_UP]()
  const cancellations = store().get('cancellations')
  assert.equal(!cancellations || cancellations.length === 0, true)
  const exits = router.__getCalls().filter(c => c.method === 'exit')
  assert.equal(exits.length, 1)
})

test('confirmCancel не отменяет уже принятый приём', () => {
  store().set('takeLogs', [{ intakeId: 'i1', date: todayStr(), status: 'taken' }])
  const page = instance(JSON.stringify({ intakeId: 'i1' }))
  page.confirmCancel()
  const cancellations = store().get('cancellations')
  assert.equal(!cancellations || cancellations.length === 0, true, 'не должно быть отмены принятого приёма')
  const exits = router.__getCalls().filter(c => c.method === 'exit')
  assert.equal(exits.length, 1)
})

test('кнопки остаются в пределах безопасной зоны при minFontSize 40', () => {
  store().set('settings', { minFontSize: 40, retryInterval: 5, syncInterval: 60, snoozeOptions: [30, 45, 60, 90] })
  store().set('medications', [{ id: 'm1', name: 'Аспирин', enabled: true }])
  instance(JSON.stringify({ intakeId: 'i1' }))
  const btns = __getRegistry().filter(w => w.props.text === 'Да' || w.props.text === 'Нет')
  assert.equal(btns.length, 2)
  for (const b of btns) {
    assert.ok(b.props.x >= 70 && b.props.x + b.props.w <= 410, 'кнопка в пределах горизонтальной безопасной зоны')
    assert.ok(b.props.y >= 70 && b.props.y + b.props.h <= 410, 'кнопка в пределах вертикальной безопасной зоны')
    assert.ok(b.props.text_size <= b.props.h, 'текст кнопки влезает по высоте')
  }
})
