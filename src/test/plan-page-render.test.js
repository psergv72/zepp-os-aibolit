import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

let pageOpts = null
globalThis.Page = (opts) => { pageOpts = opts }

const { __getRegistry, __reset, event, widget, text_style } = await import('./helpers/stubs/zos-ui.mjs')

const storage = await import('./helpers/stubs/zos-storage.mjs')

const router = await import('./helpers/stubs/zos-router.mjs')

const device = await import('./helpers/stubs/zos-device.mjs')

await import('../page/plan/index.js')

function seed() {
  storage.__resetStorage()
  new storage.ShareLocalStorage('aibolit-data.json')
  const meds = [{ id: 'm1', name: 'Аспирин', enabled: true }]
  const intakes = [{
    id: 'i1',
    time: '23:59',
    weekDays: null,
    items: [{ medicationId: 'm1', amount: '1' }],
  }]
  storage.__stores().get('aibolit-data.json').set('medications', meds)
  storage.__stores().get('aibolit-data.json').set('intakes', intakes)
}

function instance() {
  const obj = Object.create(pageOpts)
  obj.state = { intakes: [] }
  return obj
}

beforeEach(() => {
  __reset()
  router.__reset()
  device.__setShape('round')
  seed()
})

test('кнопка «На главную» использует replace вместо push', () => {
  const page = instance()
  page.refreshView()
  const btn = __getRegistry().find(w => w.props.text === '[На главную]')
  assert.ok(btn, 'кнопка «На главную» должна существовать')
  btn.listeners[event.CLICK_UP]()

  const calls = router.__getCalls()
  assert.ok(calls.length > 0, 'должен быть вызов роутера')
  assert.ok(!calls.some(c => c.method === 'push'), 'не должен использовать push')
  const last = calls[calls.length - 1]
  assert.equal(last.method, 'replace', 'должен использовать replace')
  assert.equal(last.opts.url, 'page/home/index')
})

test('повторный refreshView удаляет виджеты предыдущей отрисовки', () => {
  const page = instance()
  page.refreshView()
  const first = __getRegistry().slice()
  assert.ok(first.length > 0, 'первая отрисовка должна создать виджеты')

  page.refreshView()
  const firstStillAlive = first.filter(w => !w.deleted)
  assert.equal(firstStillAlive.length, 0, 'все виджеты первой отрисовки должны быть удалены')
  assert.ok(__getRegistry().filter(w => !w.deleted).length > 0, 'вторая отрисовка должна создать новые виджеты')
})

test('refreshView после takeIntake/undo/cancel не накапливает виджеты', () => {
  const page = instance()
  page.refreshView()
  const first = __getRegistry().slice()

  page.takeIntake({ id: 'i1', time: '23:59', items: [{ medicationId: 'm1', amount: '1' }] })
  let firstStillAlive = first.filter(w => !w.deleted)
  assert.equal(firstStillAlive.length, 0, 'после takeIntake старые виджеты удалены')

  const second = __getRegistry().slice()
  page.undoIntake({ id: 'i1', time: '23:59' })
  const secondStillAlive = second.filter(w => !w.deleted)
  assert.equal(secondStillAlive.length, 0, 'после undoIntake старые виджеты удалены')

  page.cancelIntake({ id: 'i1', time: '23:59' })
  const thirdStillAlive = __getRegistry().filter(w => !w.deleted)
  assert.ok(thirdStillAlive.length > 0, 'после cancelIntake должен отобразиться обновлённый список')
})

test('время блока — без текстовых тире', () => {
  const page = instance()
  page.refreshView()

  const dashTexts = __getRegistry().filter(
    w => w.type === widget.TEXT && typeof w.props.text === 'string' && w.props.text.includes('\u2500')
  )
  assert.equal(dashTexts.length, 0, 'не должно быть текстовых тире в заголовках времени')
})

test('контрол приёма слева и по верхнему краю первой строки', () => {
  const page = instance()
  page.refreshView()

  const ctrl = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === '\u2610')
  assert.ok(ctrl, 'контрол ☐ должен существовать')
  assert.equal(ctrl.props.x, 70, 'контрол на левом краю контента (круглая форма)')

  const med = __getRegistry().find(w => w.type === widget.TEXT && w.props.text.startsWith('Аспирин'))
  assert.ok(med, 'строка лекарства должна существовать')
  assert.equal(ctrl.props.y, med.props.y, 'контрол по верхнему краю первой строки')
})

test('заголовок отменённого приёма перечёркнут', async () => {
  const { getTodayDateStr } = await import('../utils/storage.js')
  const date = getTodayDateStr()
  storage.__stores().get('aibolit-data.json').set('cancellations', [{ intakeId: 'i1', date: date }])

  const page = instance()
  page.refreshView()

  const time = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === '23:59')
  assert.ok(time, 'заголовок времени отменённого приёма должен существовать')
  assert.equal(time.props.text_style, text_style.STRIKETHROUGH, 'заголовок должен быть перечёркнут')
})

test('все приёмы отображаются без обрыва при крупном шрифте и включается скролл', () => {
  storage.__stores().get('aibolit-data.json').set('settings', { minFontSize: 40, snoozeOptions: [30, 45, 60, 90] })
  const store = storage.__stores().get('aibolit-data.json')
  const intakes = []
  for (let i = 0; i < 5; i++) {
    intakes.push({ id: 'i' + i, time: '0' + i + ':00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] })
  }
  store.set('intakes', intakes)

  const calls = []
  globalThis.hmUI = { setScrollView: (...args) => { calls.push(args); return true } }
  try {
    const page = instance()
    page.refreshView()

    const meds = __getRegistry().filter(w => w.type === widget.TEXT && w.props.text && w.props.text.startsWith('Аспирин'))
    assert.equal(meds.length, 5, 'все 5 приёмов должны быть отрисованы')

    assert.ok(calls.length > 0, 'должен быть вызван setScrollView')
    assert.equal(calls[0][0], true, 'скролл включён')
    assert.ok(calls[0][1] > 480, 'высота контента больше экрана')
  } finally {
    delete globalThis.hmUI
  }
})
