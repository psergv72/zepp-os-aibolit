import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const { __getRegistry, __reset, widget, createWidget, deleteWidget } = await import('./helpers/stubs/zos-ui.mjs')
const device = await import('./helpers/stubs/zos-device.mjs')
const storage = await import('./helpers/stubs/zos-storage.mjs')
const fs = await import('./helpers/stubs/zos-fs.mjs')

const { createViewManager } = await import('../utils/view-manager.js')
const { renderTimeHeader, getContentBounds } = await import('../utils/screen-layout.js')

function ui() {
  return createViewManager(createWidget, deleteWidget)
}

beforeEach(() => {
  __reset()
  device.__setShape('round')
  storage.__resetStorage()
  fs.__resetFs()
  new storage.LocalStorage('aibolit-data.json')
})

test('создаёт текст времени и линию FILL_RECT правее текста', () => {
  const b = getContentBounds()
  renderTimeHeader(ui(), { text: '08:00', x: b.left, y: 100, right: b.right, color: 0x4fc3f7, sizeSp: 26, rowH: 44 })

  const time = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === '08:00')
  assert.ok(time, 'время должно быть текстом')

  const line = __getRegistry().find(w => w.type === widget.FILL_RECT)
  assert.ok(line, 'должна быть линия-разделитель FILL_RECT')
  assert.ok(line.props.x >= time.props.x + time.props.w, 'линия начинается после времени')
  assert.ok(line.props.w > 0, 'линия имеет ненулевую ширину')
  assert.ok(line.props.x + line.props.w <= b.right, 'линия не выходит за правый край контента')
})

test('длинное время не создаёт линию за пределами контента', () => {
  const b = getContentBounds()
  renderTimeHeader(ui(), { text: '23:59:59', x: b.left, y: 100, right: b.right, color: 0xffffff, sizeSp: 26, rowH: 44 })
  const line = __getRegistry().find(w => w.type === widget.FILL_RECT)
  if (line) {
    assert.ok(line.props.x + line.props.w <= b.right, 'линия в пределах контента')
  }
})
