import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

let pageOpts = null
globalThis.Page = (opts) => { pageOpts = opts }

const { __getRegistry, __reset, widget } = await import('./helpers/stubs/zos-ui.mjs')
const storage = await import('./helpers/stubs/zos-storage.mjs')
const device = await import('./helpers/stubs/zos-device.mjs')

await import('../page/snooze/index.js')

function instance() {
  const obj = Object.create(pageOpts)
  obj.state = {
    intakeId: 'i1',
    intake: { id: 'i1', time: '08:00', items: [{ medicationId: 'm1', amount: '1' }] },
  }
  return obj
}

function seed() {
  storage.__resetStorage()
  new storage.ShareLocalStorage('aibolit-data.json')
  storage.__stores().get('aibolit-data.json').set('medications', [{ id: 'm1', name: 'Аспирин', enabled: true }])
  storage.__stores().get('aibolit-data.json').set('intakes', [{ id: 'i1', time: '08:00', items: [{ medicationId: 'm1', amount: '1' }] }])
}

beforeEach(() => {
  __reset()
  device.__setShape('round')
  seed()
})

function buttonAreas() {
  return __getRegistry()
    .filter(w => w.type === widget.TEXT && w.props.text === '')
    .sort((a, b) => a.props.y - b.props.y || a.props.x - b.props.x)
}

test('сетка 2x2: зазор между столбцами равен зазору между строками', () => {
  const page = instance()
  page.renderSnoozeOptions()

  const btns = buttonAreas()
  assert.equal(btns.length, 4, 'должно быть 4 кнопки')
  const [b00, b01, b10] = btns
  const colGap = b01.props.x - (b00.props.x + b00.props.w)
  const rowGap = b10.props.y - (b00.props.y + b00.props.h)
  assert.ok(colGap > 0, 'горизонтальный зазор положительный')
  assert.equal(colGap, rowGap, 'горизонтальный зазор равен вертикальному')
  assert.equal(b00.props.x, 70, 'сетка начинается на левом краю контента (круглая форма)')
})

test('круглая форма: кнопки в пределах безопасной зоны', () => {
  const page = instance()
  page.renderSnoozeOptions()

  for (const b of buttonAreas()) {
    assert.ok(b.props.x >= 70, 'x >= 70')
    assert.ok(b.props.x + b.props.w <= 410, 'x + w <= 410')
    assert.ok(b.props.y >= 70, 'y >= 70')
    assert.ok(b.props.y + b.props.h <= 410, 'y + h <= 410')
  }
})

test('прямоугольная форма: кнопки от левого края контента и в пределах зоны', () => {
  device.__setShape('square')
  const page = instance()
  page.renderSnoozeOptions()

  const btns = buttonAreas()
  assert.equal(btns.length, 4, 'должно быть 4 кнопки')
  assert.equal(btns[0].props.x, 20, 'сетка начинается на левом краю контента (прямоугольная форма)')
  for (const b of btns) {
    assert.ok(b.props.x >= 20, 'x >= 20')
    assert.ok(b.props.x + b.props.w <= 460, 'x + w <= 460')
    assert.ok(b.props.y >= 20, 'y >= 20')
    assert.ok(b.props.y + b.props.h <= 460, 'y + h <= 460')
  }
})
