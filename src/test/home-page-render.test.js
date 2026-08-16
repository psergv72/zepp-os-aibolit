import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

let pageOpts = null
globalThis.Page = (opts) => { pageOpts = opts }

const { __getRegistry, __getRedrawCount, __reset, deleteWidget, event, widget } = await import('./helpers/stubs/zos-ui.mjs')

const storage = await import('./helpers/stubs/zos-storage.mjs')
const fs = await import('./helpers/stubs/zos-fs.mjs')

const router = await import('./helpers/stubs/zos-router.mjs')

const device = await import('./helpers/stubs/zos-device.mjs')

await import('../page/home/index.js')

function seed() {
  storage.__resetStorage()
  fs.__resetFs()
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

test('кнопка «Полный план» использует replace вместо push', () => {
  const page = instance()
  page.refreshView()
  const btn = __getRegistry().find(w => w.props.text === 'Полный план')
  assert.ok(btn, 'кнопка «Полный план» должна существовать')
  btn.listeners[event.CLICK_UP]()

  const calls = router.__getCalls()
  assert.ok(calls.length > 0, 'должен быть вызов роутера')
  assert.ok(!calls.some(c => c.method === 'push'), 'не должен использовать push')
  const last = calls[calls.length - 1]
  assert.equal(last.method, 'replace', 'должен использовать replace')
  assert.equal(last.opts.url, 'page/plan/index')
})

test('повторный refreshView удаляет виджеты предыдущей отрисовки', () => {
  const page = instance()
  page.refreshView()
  const first = __getRegistry().slice()
  assert.ok(first.length > 0, 'первая отрисовка должна создать виджеты')

  page.refreshView()
  const registry = __getRegistry()
  const firstStillAlive = first.filter(w => !w.deleted)
  assert.equal(firstStillAlive.length, 0, 'все виджеты первой отрисовки должны быть удалены')
  assert.ok(registry.length > 0, 'вторая отрисовка должна создать новые виджеты')
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

test('refreshView после takeIntake не накапливает виджеты', () => {
  const page = instance()
  page.refreshView()
  const first = __getRegistry().slice()

  page.takeIntake({ id: 'i1', time: '23:59', items: [{ medicationId: 'm1', amount: '1' }] })

  const firstStillAlive = first.filter(w => !w.deleted)
  assert.equal(firstStillAlive.length, 0, 'все виджеты первой отрисовки должны быть удалены')
  const alive = __getRegistry().filter(w => !w.deleted)
  assert.ok(alive.length > 0, 'после takeIntake должен отобразиться обновлённый список')
})

test('заголовок времени блока рисуется как текст + линия FILL_RECT', () => {
  const page = instance()
  page.refreshView()

  const time = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === '23:59')
  assert.ok(time, 'время должно быть текстом')

  const line = __getRegistry().find(w => w.type === widget.FILL_RECT)
  assert.ok(line, 'должна быть линия-разделитель FILL_RECT')
  assert.ok(line.props.x >= time.props.x + time.props.w, 'линия начинается после времени')
})

test('чекбокс слева от лекарств и по центру первой строки', () => {
  const page = instance()
  page.refreshView()

  const check = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === '\u2610')
  assert.ok(check, 'чекбокс должен существовать')
  assert.equal(check.props.x, 70, 'чекбокс на левом краю контента (круглая форма)')

  const med = __getRegistry().find(w => w.type === widget.TEXT && w.props.text.startsWith('Аспирин'))
  assert.ok(med, 'строка лекарства должна существовать')
  assert.equal(
    check.props.y + check.props.h / 2,
    med.props.y + med.props.h / 2,
    'чекбокс выровнен по центру первой строки лекарства'
  )
})

test('круглая форма: все виджеты в пределах безопасной зоны', () => {
  const page = instance()
  page.refreshView()

  const alive = __getRegistry().filter(w => !w.deleted)
  assert.ok(alive.length > 0)
  for (const w of alive) {
    assert.ok(w.props.x >= 70, 'x >= 70: ' + (w.props.text || w.props.x))
    assert.ok(w.props.x + w.props.w <= 410, 'x + w <= 410: ' + (w.props.text || w.props.x))
  }
})

test('приём отображается при крупном шрифте и включается скролл', () => {
  storage.__stores().get('aibolit-data.json').set('settings', { minFontSize: 40, snoozeOptions: [30, 45, 60, 90] })
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
    assert.ok(meds.length >= 1, 'приём должен отображаться даже при крупном шрифте')

    assert.ok(calls.length > 0, 'должен быть вызван setScrollView')
    assert.equal(calls[0][0], true, 'скролл включён')
    assert.ok(calls[0][1] > 480, 'высота контента больше экрана')
  } finally {
    delete globalThis.hmUI
  }
})

test('кнопка перехода — со скруглённым фоном', () => {
  const page = instance()
  page.refreshView()

  const bg = __getRegistry().find(w => w.type === widget.FILL_RECT && w.props.x === 70 && w.props.w === 340)
  assert.ok(bg, 'фон кнопки FILL_RECT должен существовать')
  assert.ok(bg.props.radius > 0, 'у фона кнопки должны быть скругления')

  const btn = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === 'Полный план')
  assert.ok(btn, 'текст кнопки должен существовать')
  assert.equal(btn.props.x, 70, 'текст кнопки в границах контента')
})

test('отступ между заголовком и первым приёмом компактный', () => {
  const page = instance()
  page.refreshView()

  const time = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === '23:59')
  assert.ok(time, 'время первого приёма должно существовать')
  assert.ok(time.props.y < 160, 'первый приём начинается близко к заголовку (было ~178)')
})

test('под кнопкой есть прокладка для отступа', () => {
  const page = instance()
  page.refreshView()

  const btn = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === 'Полный план')
  assert.ok(btn, 'кнопка должна существовать')

  const spacer = __getRegistry().find(
    w => w.type === widget.FILL_RECT && w.props.y === btn.props.y + btn.props.h
  )
  assert.ok(spacer, 'под кнопкой должна быть прокладка')
  assert.ok(spacer.props.h >= 40, 'высота прокладки заметная')
})

test('заголовок страницы — «Сегодня»', () => {
  const page = instance()
  page.refreshView()

  const header = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === 'Сегодня')
  assert.ok(header, 'заголовок «Сегодня» должен существовать')
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

  const check = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === '\u2610')
  assert.equal(
    check.props.y + check.props.h / 2,
    first.props.y + first.props.h / 2,
    'чекбокс выровнен по центру первой строки лекарства'
  )
  assert.equal(first.props.x - (check.props.x + check.props.w), 4, 'отступ между чекбоксом и названием уменьшен')
})

test('пропущенный приём не показывается на домашней странице', () => {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  storage.__stores().get('aibolit-data.json').set('takeLogs', [{ intakeId: 'i1', date: todayStr, status: 'skipped' }])
  const page = instance()
  page.refreshView()
  const texts = __getRegistry().map(w => w.props.text).filter(Boolean)
  assert.ok(!texts.includes('23:59'), 'пропущенный приём не должен отображаться')
  assert.ok(texts.includes('Нет предстоящих приёмов'), 'должен быть пустой список')
})

test('приёмы на странице «Сегодня» отсортированы по времени (23:59 после 23:50)', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '23:59', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
    { id: 'i2', time: '23:50', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  const page = instance()
  page.refreshView()

  const time1 = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === '23:50')
  const time2 = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === '23:59')
  assert.ok(time1 && time2, 'оба приёма должны отображаться')
  assert.ok(time1.props.y < time2.props.y, '23:50 должен идти раньше 23:59')
})
