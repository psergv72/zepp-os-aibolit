import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

let pageOpts = null
globalThis.Page = (opts) => { pageOpts = opts }

const { __getRegistry, __getRedrawCount, __reset, event, widget, text_style } = await import('./helpers/stubs/zos-ui.mjs')

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
  const btn = __getRegistry().find(w => w.props.text === 'На главную')
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

test('повторный refreshView вызывает redraw для принудительной перерисовки', () => {
  const page = instance()
  page.refreshView()
  const afterFirst = __getRedrawCount()
  assert.ok(afterFirst >= 1, 'первая отрисовка должна вызывать redraw')

  page.refreshView()
  assert.ok(__getRedrawCount() > afterFirst, 'повторная отрисовка должна снова вызывать redraw')
})

test('onDestroy очищает виджеты страницы', () => {
  const page = instance()
  page.refreshView()
  assert.ok(__getRegistry().filter(w => !w.deleted).length > 0, 'до onDestroy виджеты живы')

  page.onDestroy()

  assert.equal(__getRegistry().filter(w => !w.deleted).length, 0, 'onDestroy должен удалить все виджеты')
})

test('refreshView после onDestroy не создаёт новых виджетов', () => {
  const page = instance()
  page.refreshView()
  page.onDestroy()

  page.refreshView()

  assert.equal(__getRegistry().filter(w => !w.deleted).length, 0, 'уничтоженная страница не должна рисовать')
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

test('контрол приёма слева и по центру первой строки', () => {
  const page = instance()
  page.refreshView()

  const ctrl = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === '\u2610')
  assert.ok(ctrl, 'контрол ☐ должен существовать')
  assert.equal(ctrl.props.x, 70, 'контрол на левом краю контента (круглая форма)')

  const med = __getRegistry().find(w => w.type === widget.TEXT && w.props.text.startsWith('Аспирин'))
  assert.ok(med, 'строка лекарства должна существовать')
  assert.equal(
    ctrl.props.y + ctrl.props.h / 2,
    med.props.y + med.props.h / 2,
    'контрол выровнен по центру первой строки лекарства'
  )
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

test('быстрый тап по ☐ не приводит к отмене приёма через 1 секунду', async () => {
  const page = instance()
  page.refreshView()

  const ctrl = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === '\u2610')
  assert.ok(ctrl, 'контрол ☐ должен существовать')

  ctrl.listeners[event.CLICK_DOWN]()
  ctrl.listeners[event.CLICK_UP]()

  const store = storage.__stores().get('aibolit-data.json')
  assert.ok((store.get('takeLogs') || []).length > 0, 'приём отмечен как принятый')
  assert.equal((store.get('cancellations') || []).length, 0, 'отмена ещё не создана')

  await new Promise(resolve => setTimeout(resolve, 1100))

  assert.equal((store.get('cancellations') || []).length, 0, 'таймер отмены не должен сработать после быстрого тапа')
  assert.equal((store.get('takeLogs') || []).length, 1, 'запись о приёме сохраняется')
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

    const S = 40 / 16
    const medX = 70 + (40 + 4) * S
    const meds = __getRegistry().filter(
      w => w.type === widget.TEXT && w.props.x === medX && typeof w.props.text === 'string' && w.props.text.length > 0
    )
    assert.ok(meds.length >= 5, 'все 5 приёмов должны быть отрисованы')

    assert.ok(calls.length > 0, 'должен быть вызван setScrollView')
    assert.equal(calls[0][0], true, 'скролл включён')
    assert.ok(calls[0][1] > 480, 'высота контента больше экрана')
  } finally {
    delete globalThis.hmUI
  }
})

test('длинное название лекарства переносится по словам', () => {
  storage.__stores().get('aibolit-data.json').set('medications', [
    { id: 'm1', name: 'Ацетилсалициловая кислота', dosage: '500 мг', enabled: true },
    { id: 'm2', name: 'Панадол', dosage: '500 мг', enabled: true },
  ])
  storage.__stores().get('aibolit-data.json').set('intakes', [{
    id: 'i1',
    time: '23:59',
    weekDays: null,
    items: [{ medicationId: 'm1', amount: '1' }, { medicationId: 'm2', amount: '1' }],
  }])

  const page = instance()
  page.refreshView()

  const first = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === 'Ацетилсалициловая')
  const second = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === 'кислота (500 мг), 1')
  const ibu = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === 'Панадол (500 мг), 1')
  assert.ok(first && second && ibu, 'все строки лекарств должны существовать')
  assert.equal(second.props.y - first.props.y, 28, 'строки внутри названия расположены плотно')
  assert.equal(ibu.props.y - second.props.y, 40, 'между лекарствами сохранён прежний интервал')

  const ctrl = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === '\u2610')
  assert.equal(
    ctrl.props.y + ctrl.props.h / 2,
    first.props.y + first.props.h / 2,
    'контрол выровнен по центру первой строки лекарства'
  )
  assert.equal(first.props.x - (ctrl.props.x + ctrl.props.w), 4, 'отступ между контролом и названием уменьшен')
})

test('пропущенный приём отображается с отметкой ☒ и текстом «пропущено»', () => {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  storage.__stores().get('aibolit-data.json').set('takeLogs', [{ intakeId: 'i1', date: todayStr, status: 'skipped' }])
  const page = instance()
  page.refreshView()
  const texts = __getRegistry().map(w => w.props.text).filter(Boolean)
  assert.ok(texts.includes('пропущено'), 'должен быть текст «пропущено»')
  assert.ok(texts.some(t => t.includes('\u2612')), 'должна быть отметка ☒')
})

test('тап по пропущенному приёму помечает его принятым', () => {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  storage.__stores().get('aibolit-data.json').set('takeLogs', [{ intakeId: 'i1', date: todayStr, status: 'skipped' }])
  const page = instance()
  page.refreshView()
  const ctrl = __getRegistry().find(w => w.props.text === '\u2612')
  assert.ok(ctrl, 'должна быть тапабельная отметка ☒')
  ctrl.listeners[event.CLICK_UP]()
  const logs = storage.__stores().get('aibolit-data.json').get('takeLogs')
  assert.ok(logs.some(l => l.intakeId === 'i1' && l.status === 'taken'), 'приём должен стать принятым')
})

test('takeIntake сбрасывает pending-уведомление', () => {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  storage.__stores().get('aibolit-data.json').set('pendingNotification', { intakeId: 'i1', date: todayStr })
  const page = instance()
  page.takeIntake({ id: 'i1', time: '23:59', items: [{ medicationId: 'm1', amount: '1' }] })
  assert.equal(storage.__stores().get('aibolit-data.json').get('pendingNotification'), undefined)
})

test('приёмы на плане отсортированы по времени: 8:00 раньше 10:00', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '10:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
    { id: 'i2', time: '8:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  const page = instance()
  page.refreshView()

  const time8 = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === '8:00')
  const time10 = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === '10:00')
  assert.ok(time8 && time10, 'оба приёма должны отображаться')
  assert.ok(time8.props.y < time10.props.y, '8:00 должен идти раньше 10:00')
})
