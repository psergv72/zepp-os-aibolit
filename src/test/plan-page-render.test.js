import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

let pageOpts = null
globalThis.Page = (opts) => { pageOpts = opts }

const { __getRegistry, __reset } = await import('./helpers/stubs/zos-ui.mjs')

const storage = await import('./helpers/stubs/zos-storage.mjs')

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
  seed()
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
