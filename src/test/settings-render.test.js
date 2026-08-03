import { test } from 'node:test'
import assert from 'node:assert/strict'

const node = (type) => (props, children) => ({ type, props, children })

globalThis.View = node('View')
globalThis.Text = node('Text')
globalThis.Button = node('Button')
globalThis.TextInput = node('TextInput')
globalThis.Toggle = node('Toggle')
globalThis.Select = node('Select')
globalThis.Section = node('Section')

let options = null
globalThis.AppSettingsPage = (opts) => { options = opts }

function createStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
  }
}

await import('../setting/index.js')

function walk(node, visit) {
  if (!node) return
  if (Array.isArray(node)) { node.forEach((n) => walk(n, visit)); return }
  visit(node)
  if (Array.isArray(node.children)) node.children.forEach((n) => walk(n, visit))
}

function findByLabel(tree, type, label) {
  let found = null
  walk(tree, (n) => {
    if (!found && n.type === type && n.props && n.props.label === label) found = n
  })
  return found
}

function findByButton(tree, label) {
  return findByLabel(tree, 'Button', label)
}

function findByLink(tree, text) {
  let found = null
  walk(tree, (n) => {
    if (found) return
    if (n && n.type === 'View' && n.props && typeof n.props.onClick === 'function' && Array.isArray(n.children)) {
      const hit = n.children.some(c => c && c.type === 'Text' && Array.isArray(c.children) && c.children.some(x => typeof x === 'string' && x === text))
      if (hit) found = n
    }
  })
  return found
}

function setup(storage) {
  options.state.page = 'list'
  options.state.props = null
  options.state.editDraft = null
  options.state.intakeDraft = null
  options.state.itemDraft = null
  options.state.editingItemIndex = -1
  options.state.viewHistoryDate = null
  options.state.settingsDraft = null
  options._renderSeq = 0
  options.build({ settingsStorage: storage })
}

function assertRefresh(storage, action, message) {
  const before = storage.getItem('__ui_render')
  action()
  const after = storage.getItem('__ui_render')
  assert.notEqual(after, before, message || 'изменение параметра должно вызывать перерисовку (запись в settingsStorage)')
}

test('изменение названия лекарства вызывает перерисовку', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('edit', { medication: null })
  const tree = options.build({ settingsStorage: storage })
  const input = findByLabel(tree, 'TextInput', 'Название')
  assert.ok(input, 'поле Название должно существовать')
  assertRefresh(storage, () => input.props.onChange('Аспирин'))
})

test('изменение дозировки лекарства вызывает перерисовку', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('edit', { medication: null })
  const tree = options.build({ settingsStorage: storage })
  const input = findByLabel(tree, 'TextInput', 'Дозировка')
  assert.ok(input)
  assertRefresh(storage, () => input.props.onChange('100 мг'))
})

test('переключение "Активно" вызывает перерисовку', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('edit', { medication: null })
  const tree = options.build({ settingsStorage: storage })
  const toggle = findByLabel(tree, 'Toggle', 'Активно')
  assert.ok(toggle)
  assertRefresh(storage, () => toggle.props.onChange(false))
})

test('изменение времени приёма вызывает перерисовку', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('intakeEdit', { intake: null })
  const tree = options.build({ settingsStorage: storage })
  const input = findByLabel(tree, 'TextInput', 'Время')
  assert.ok(input)
  assertRefresh(storage, () => input.props.onChange('08:00'))
})

test('переключение "Каждый день" вызывает перерисовку', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('intakeEdit', { intake: null })
  const tree = options.build({ settingsStorage: storage })
  const toggle = findByLabel(tree, 'Toggle', 'Каждый день')
  assert.ok(toggle)
  assertRefresh(storage, () => toggle.props.onChange(true))
})

test('изменение дней недели вызывает перерисовку', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('intakeEdit', { intake: null })
  const tree = options.build({ settingsStorage: storage })
  const select = findByLabel(tree, 'Select', 'Дни недели')
  assert.ok(select)
  assertRefresh(storage, () => select.props.onChange(['1', '2']))
})

test('изменение лекарства в приёме вызывает перерисовку', () => {
  const storage = createStorage()
  storage.setItem('medications', JSON.stringify([{ id: 'm1', name: 'Аспирин', dosage: '100 мг', comments: '', enabled: true }]))
  setup(storage)
  options.navigateTo('intakeEdit', { intake: null })
  let tree = options.build({ settingsStorage: storage })
  const addBtn = findByLink(tree, '+ Добавить лекарство')
  assert.ok(addBtn)
  addBtn.props.onClick()
  tree = options.build({ settingsStorage: storage })
  const select = findByLabel(tree, 'Select', 'Лекарство')
  assert.ok(select, 'Select Лекарство должен существовать')
  assertRefresh(storage, () => select.props.onChange(['m1']))
})

test('изменение количества в приёме вызывает перерисовку', () => {
  const storage = createStorage()
  storage.setItem('medications', JSON.stringify([{ id: 'm1', name: 'Аспирин', dosage: '100 мг', comments: '', enabled: true }]))
  setup(storage)
  options.navigateTo('intakeEdit', { intake: null })
  let tree = options.build({ settingsStorage: storage })
  const addBtn = findByLink(tree, '+ Добавить лекарство')
  addBtn.props.onClick()
  tree = options.build({ settingsStorage: storage })
  const input = findByLabel(tree, 'TextInput', 'Количество')
  assert.ok(input)
  assertRefresh(storage, () => input.props.onChange('2 таблетки'))
})

test('изменение интервала повтора вызывает перерисовку', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('settings')
  const tree = options.build({ settingsStorage: storage })
  const input = findByLabel(tree, 'TextInput', 'Интервал повтора (мин)')
  assert.ok(input)
  assertRefresh(storage, () => input.props.onChange('90'))
})

test('изменение минимального размера шрифта вызывает перерисовку', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('settings')
  const tree = options.build({ settingsStorage: storage })
  const input = findByLabel(tree, 'TextInput', 'Минимальный размер шрифта (16-40)')
  assert.ok(input)
  assertRefresh(storage, () => input.props.onChange('18'))
})

function findByTextContent(tree, text) {
  let found = null
  walk(tree, (n) => {
    if (!found && n && n.type === 'Text' && Array.isArray(n.children) && n.children.some(c => typeof c === 'string' && c === text)) found = n
  })
  return found
}

test('страница Настройки группирует параметры в группы', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('settings')
  const tree = options.build({ settingsStorage: storage })
  assert.ok(findByTextContent(tree, 'Напоминания'), 'должен быть заголовок группы Напоминания')
  assert.ok(findByTextContent(tree, 'Отображение'), 'должен быть заголовок группы Отображение')
})

test('первая страница — меню управления', () => {
  const storage = createStorage()
  setup(storage)
  const tree = options.build({ settingsStorage: storage })
  assert.ok(findByTextContent(tree, 'Управление'), 'должна быть группа Управление')
  assert.ok(findByTextContent(tree, 'Лекарства'), 'должен быть пункт Лекарства')
  assert.ok(findByTextContent(tree, 'Приёмы'), 'должен быть пункт Приёмы')
  assert.ok(findByTextContent(tree, 'История'), 'должен быть пункт История')
  assert.ok(findByTextContent(tree, 'Настройки'), 'должен быть пункт Настройки')
})

test('список лекарств группирует содержимое в карточки', () => {
  const storage = createStorage()
  storage.setItem('medications', JSON.stringify([{ id: 'm1', name: 'Аспирин', dosage: '100 мг', comments: '', enabled: true }]))
  setup(storage)
  options.navigateTo('medications')
  const tree = options.build({ settingsStorage: storage })
  assert.ok(findByTextContent(tree, 'Лекарства'), 'должен быть заголовок группы Лекарства')
})
