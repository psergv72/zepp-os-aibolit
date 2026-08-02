import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

let pageOpts = null
globalThis.Page = (opts) => { pageOpts = opts }

const { __getRegistry, __reset, deleteWidget, event, widget } = await import('./helpers/stubs/zos-ui.mjs')

const storage = await import('./helpers/stubs/zos-storage.mjs')

const router = await import('./helpers/stubs/zos-router.mjs')

const device = await import('./helpers/stubs/zos-device.mjs')

await import('../page/home/index.js')

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

test('кнопка «Полный план» использует replace вместо push', () => {
  const page = instance()
  page.refreshView()
  const btn = __getRegistry().find(w => w.props.text === '[Полный план \u2192]')
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

test('чекбокс слева от лекарств и по верхнему краю первой строки', () => {
  const page = instance()
  page.refreshView()

  const check = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === '\u2610')
  assert.ok(check, 'чекбокс должен существовать')
  assert.equal(check.props.x, 70, 'чекбокс на левом краю контента (круглая форма)')

  const med = __getRegistry().find(w => w.type === widget.TEXT && w.props.text.startsWith('Аспирин'))
  assert.ok(med, 'строка лекарства должна существовать')
  assert.equal(check.props.y, med.props.y, 'чекбокс по верхнему краю первой строки лекарств')
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

    const meds = __getRegistry().filter(w => w.type === widget.TEXT && w.props.text && w.props.text.startsWith('Аспирин'))
    assert.equal(meds.length, 1, 'приём должен отображаться даже при крупном шрифте')

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

  const btn = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === '[Полный план \u2192]')
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
