import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

let pageOpts = null
globalThis.Page = (opts) => { pageOpts = opts }

const { __getRegistry, __reset, deleteWidget, event } = await import('./helpers/stubs/zos-ui.mjs')

const storage = await import('./helpers/stubs/zos-storage.mjs')

const router = await import('./helpers/stubs/zos-router.mjs')

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
