import { test, afterEach } from 'node:test'
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

function findByPlaceholder(tree, type, placeholder) {
  let found = null
  walk(tree, (n) => {
    if (!found && n.type === type && n.props && n.props.placeholder === placeholder) found = n
  })
  return found
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

function findByRowControl(tree, label) {
  let found = null
  walk(tree, (n) => {
    if (found) return
    if (n && n.type === 'View' && Array.isArray(n.children)) {
      const hasLabel = n.children.some(c => c && c.type === 'Text' && Array.isArray(c.children) && c.children.some(x => typeof x === 'string' && x === label))
      if (hasLabel) {
        let control = null
        walk(n, (c) => {
          if (!control && c && (c.type === 'TextInput' || c.type === 'Toggle' || c.type === 'Select')) control = c
        })
        if (control) found = control
      }
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
  options.state.debugWaiting = false
  options.state.debugTimedOut = false
  options.state.debugPollTimer = null
  options.state.debugLastRaw = null
  options.state.debugRequestedAt = 0
  options._renderSeq = 0
  options.build({ settingsStorage: storage })
}

afterEach(() => {
  if (options) options.stopDebugPolling()
})

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
  const input = findByPlaceholder(tree, 'TextInput', 'Название')
  assert.ok(input, 'поле Название должно существовать')
  assertRefresh(storage, () => input.props.onChange('Аспирин'))
})

test('изменение дозировки лекарства вызывает перерисовку', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('edit', { medication: null })
  const tree = options.build({ settingsStorage: storage })
  const input = findByPlaceholder(tree, 'TextInput', 'Дозировка')
  assert.ok(input)
  assertRefresh(storage, () => input.props.onChange('100 мг'))
})

test('переключение "Активно" вызывает перерисовку', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('edit', { medication: null })
  const tree = options.build({ settingsStorage: storage })
  const toggle = findByRowControl(tree, 'Активно')
  assert.ok(toggle)
  assertRefresh(storage, () => toggle.props.onChange(false))
})

test('изменение времени приёма вызывает перерисовку', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('intakeEdit', { intake: null })
  const tree = options.build({ settingsStorage: storage })
  const input = findByPlaceholder(tree, 'TextInput', 'Время')
  assert.ok(input)
  assertRefresh(storage, () => input.props.onChange('08:00'))
})

test('переключение "Каждый день" вызывает перерисовку', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('intakeEdit', { intake: null })
  const tree = options.build({ settingsStorage: storage })
  const toggle = findByRowControl(tree, 'Каждый день')
  assert.ok(toggle)
  assertRefresh(storage, () => toggle.props.onChange(true))
})

test('изменение дней недели вызывает перерисовку', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('intakeEdit', { intake: null })
  const tree = options.build({ settingsStorage: storage })
  const select = findByRowControl(tree, 'Дни недели')
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
  const select = findByRowControl(tree, 'Лекарство')
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
  const input = findByPlaceholder(tree, 'TextInput', 'Количество')
  assert.ok(input)
  assertRefresh(storage, () => input.props.onChange('2 таблетки'))
})

test('изменение интервала повтора вызывает перерисовку', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('settings')
  const tree = options.build({ settingsStorage: storage })
  const input = findByPlaceholder(tree, 'TextInput', 'Интервал повтора (мин)')
  assert.ok(input)
  assertRefresh(storage, () => input.props.onChange('90'))
})

test('изменение минимального размера шрифта вызывает перерисовку', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('settings')
  const tree = options.build({ settingsStorage: storage })
  const input = findByPlaceholder(tree, 'TextInput', 'Минимальный размер шрифта (16-40)')
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

function collectTexts(tree) {
  const out = []
  walk(tree, (n) => {
    if (n && n.type === 'Text' && Array.isArray(n.children)) {
      n.children.forEach(c => { if (typeof c === 'string') out.push(c) })
    }
  })
  return out
}

test('список приёмов сортируется по времени и дням недели', () => {
  const storage = createStorage()
  storage.setItem('medications', JSON.stringify([{ id: 'm1', name: 'Аспирин', dosage: '100 мг', comments: '', enabled: true }]))
  storage.setItem('intakes', JSON.stringify([
    { id: 'i1', time: '09:00', weekDays: null, label: 'День', items: [{ medicationId: 'm1', amount: '1' }] },
    { id: 'i2', time: '08:00', weekDays: [5], label: 'Вечер', items: [{ medicationId: 'm1', amount: '1' }] },
    { id: 'i3', time: '08:00', weekDays: [1], label: 'Утро', items: [{ medicationId: 'm1', amount: '1' }] },
  ]))
  setup(storage)
  options.navigateTo('intakes')
  const tree = options.build({ settingsStorage: storage })
  const texts = collectTexts(tree)
  const idx = t => texts.indexOf(t)
  assert.ok(idx('Утро — 08:00, Пн') >= 0, 'Утро должно быть в списке')
  assert.ok(idx('Утро — 08:00, Пн') < idx('Вечер — 08:00, Пт'), 'сначала Пн, затем Пт при одинаковом времени')
  assert.ok(idx('Вечер — 08:00, Пт') < idx('День — 09:00, каждый день'), 'приёмы раньше времени идут раньше')
})

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
  assert.ok(findByTextContent(tree, 'Режим приема лекарств'), 'должен быть пункт Режим приема лекарств')
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

test('в списке лекарств показываются времена приёмов с днями недели', () => {
  const storage = createStorage()
  storage.setItem('medications', JSON.stringify([{ id: 'm1', name: 'Аспирин', dosage: '100 мг', comments: '', enabled: true }]))
  storage.setItem('intakes', JSON.stringify([
    { id: 'i1', time: '09:00', weekDays: null, label: '', items: [{ medicationId: 'm1', amount: '2 таблетки' }] },
    { id: 'i2', time: '08:00', weekDays: [5, 1], label: '', items: [{ medicationId: 'm1', amount: '1 таблетка' }] },
  ]))
  setup(storage)
  options.navigateTo('medications')
  const tree = options.build({ settingsStorage: storage })
  const texts = collectTexts(tree)
  assert.ok(texts.includes('• 08:00 Пн, Пт, 1 таблетка'), 'дни должны быть отсортированы по порядку')
  assert.ok(texts.includes('• 09:00, 2 таблетки'), 'для каждого дня дни не пишутся, но количество есть')
})

test('сохранение приёма со временем «8:00» сохраняет «08:00»', () => {
  const storage = createStorage()
  storage.setItem('medications', JSON.stringify([{ id: 'm1', name: 'Аспирин', dosage: '100 мг', comments: '', enabled: true }]))
  setup(storage)
  options.navigateTo('intakeEdit', { intake: null })
  let tree = options.build({ settingsStorage: storage })

  const timeInput = findByPlaceholder(tree, 'TextInput', 'Время')
  timeInput.props.onChange('8:00')

  const addBtn = findByLink(tree, '+ Добавить лекарство')
  addBtn.props.onClick()
  tree = options.build({ settingsStorage: storage })
  const select = findByRowControl(tree, 'Лекарство')
  select.props.onChange(['m1'])

  tree = options.build({ settingsStorage: storage })
  const saveItem = findByButton(tree, 'Сохранить')
  saveItem.props.onClick()

  tree = options.build({ settingsStorage: storage })
  const saveIntake = findByButton(tree, 'Сохранить')
  saveIntake.props.onClick()

  const saved = JSON.parse(storage.getItem('intakes'))
  assert.equal(saved.length, 1, 'приём должен сохраниться')
  assert.equal(saved[0].time, '08:00', 'время должно быть нормализовано к HH:MM')
})

// ── Отладка ──

test('страница Настройки содержит переключатель «Отладочный режим»', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('settings')
  const tree = options.build({ settingsStorage: storage })
  const toggle = findByRowControl(tree, 'Отладочный режим')
  assert.ok(toggle, 'должен быть переключатель Отладочный режим')
  assertRefresh(storage, () => toggle.props.onChange(true))
})

test('отладочный режим выключен по умолчанию', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('settings')
  const tree = options.build({ settingsStorage: storage })
  const toggle = findByRowControl(tree, 'Отладочный режим')
  assert.equal(toggle.props.value, false, 'по умолчанию отладочный режим выключен')
})

test('при выключенной отладке пункт «Отладка» скрыт в управлении', () => {
  const storage = createStorage()
  setup(storage)
  const tree = options.build({ settingsStorage: storage })
  assert.equal(findByTextContent(tree, 'Отладка'), null, 'пункт Отладка не должен быть виден без отладочного режима')
})

test('при включённой отладке пункт «Отладка» появляется в управлении', () => {
  const storage = createStorage()
  storage.setItem('settings', JSON.stringify({ debugMode: true }))
  setup(storage)
  const tree = options.build({ settingsStorage: storage })
  assert.ok(findByTextContent(tree, 'Отладка'), 'пункт Отладка должен быть виден при включённой отладке')
})

test('страница Отладка показывает подробные сведения о таймерах на часах', () => {
  const storage = createStorage()
  storage.setItem('debugInfo', JSON.stringify({
    timers: [
      { id: 1, type: 'intake', time: '08:00', weekDays: [1, 3, 5], label: 'Утро', items: 'Парацетамол \u00d7 1 таб', next: 1750000000 },
      { id: 3, type: 'sync', interval: 60, next: 1750000000 },
    ],
    log: [],
  }))
  setup(storage)
  options.navigateTo('debug')
  const tree = options.build({ settingsStorage: storage })
  assert.ok(findByTextContent(tree, 'Таймеры на часах'), 'должен быть заголовок Таймеры на часах')
  const texts = collectTexts(tree)
  assert.ok(texts.some(t => t.includes('08:00') && t.includes('Парацетамол')), 'приём показывается с временем и лекарством')
  assert.ok(texts.some(t => t.includes('Пн, Ср, Пт')), 'дни недели показываются')
  assert.ok(texts.some(t => t.includes('Синхронизация')), 'sync-таймер описан')
})

test('страница Отладка показывает отладочные сообщения из лога', () => {
  const storage = createStorage()
  storage.setItem('debugInfo', JSON.stringify({
    timers: [],
    log: [
      { ts: 1700000000000, message: 'добавлен таймер id=1 приёма i1 на 08:00' },
      { ts: 1700000060000, message: 'удалён таймер id=1 при перестройке расписания' },
    ],
  }))
  setup(storage)
  options.navigateTo('debug')
  const tree = options.build({ settingsStorage: storage })
  assert.ok(findByTextContent(tree, 'Отладочные сообщения'), 'должен быть заголовок Отладочные сообщения')
  const texts = collectTexts(tree)
  assert.ok(texts.some(t => t.includes('добавлен таймер id=1 приёма i1 на 08:00')), 'сообщение о добавлении таймера должно отображаться')
  assert.ok(texts.some(t => t.includes('удалён таймер id=1 при перестройке расписания')), 'сообщение об удалении таймера должно отображаться')
})

test('страница Отладка показывает заглушку при отсутствии данных', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('debug')
  const tree = options.build({ settingsStorage: storage })
  assert.ok(findByTextContent(tree, 'Нет активных таймеров'), 'заглушка таймеров')
  assert.ok(findByTextContent(tree, 'Нет отладочных сообщений'), 'заглушка лога')
})

test('кнопка «Обновить» на странице Отладка запрашивает свежие данные', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('debug')
  const tree = options.build({ settingsStorage: storage })
  const before = storage.getItem('debugRefresh')
  const btn = findByButton(tree, 'Обновить')
  assert.ok(btn, 'должна быть кнопка Обновить')
  btn.props.onClick()
  const after = storage.getItem('debugRefresh')
  assert.ok(after && after !== before, 'должен обновиться debugRefresh')
  assert.equal(options.state.debugWaiting, true, 'после нажатия ожидается ответ часов')
})

test('кнопка «Очистить» присутствует на странице Отладка', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('debug')
  const tree = options.build({ settingsStorage: storage })
  const btn = findByButton(tree, 'Очистить')
  assert.ok(btn, 'должна быть кнопка Очистить')
})

test('клик по «Очистить» очищает снимок, пишет debugClear и не ждёт ответа часов', () => {
  const storage = createStorage()
  setup(storage)
  storage.setItem('debugInfo', JSON.stringify({ ts: 1, timers: [], log: [{ ts: 2, message: 'x' }] }))
  options.navigateTo('debug')
  assert.equal(options.state.debugWaiting, true, 'после входа в отладку идёт запрос')
  const tree = options.build({ settingsStorage: storage })
  const btn = findByButton(tree, 'Очистить')
  assert.ok(btn)

  btn.props.onClick()

  assert.equal(storage.getItem('debugInfo'), null, 'снимок очищен на телефоне')
  assert.ok(storage.getItem('debugClear'), 'записан debugClear для side service')
  assert.equal(options.state.debugWaiting, false, 'очистка не запускает ожидание ответа часов')
})

test('страница Отладка показывает статус ожидания ответа часов', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('debug')
  const tree = options.build({ settingsStorage: storage })
  assert.equal(options.state.debugWaiting, true, 'после входа в отладку идёт запрос')
  const texts = collectTexts(tree)
  assert.ok(texts.some(t => t.includes('Запрос отправлен на часы')), 'статус ожидания виден')
})

test('страница Отладка показывает время данных часов из снимка', () => {
  const storage = createStorage()
  storage.setItem('debugInfo', JSON.stringify({ ts: 1700000000000, timers: [], log: [] }))
  setup(storage)
  options.navigateTo('debug')
  options.state.debugWaiting = false
  const tree = options.build({ settingsStorage: storage })
  const texts = collectTexts(tree)
  assert.ok(texts.some(t => t.includes('Данные часов от')), 'статус с временем данных виден')
})

test('debugPollTick обновляет статус при появлении свежего снимка', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('debug')
  options.state.debugLastRaw = storage.getItem('debugInfo')
  storage.setItem('debugInfo', JSON.stringify({ ts: 1700000000000, timers: [], log: [] }))
  const before = storage.getItem('__ui_render')
  options.debugPollTick()
  assert.equal(options.state.debugWaiting, false, 'ожидание снимается при свежем снимке')
  assert.equal(options.state.debugTimedOut, false, 'таймаута нет')
  assert.notEqual(storage.getItem('__ui_render'), before, 'происходит перерисовка')
  const tree = options.build({ settingsStorage: storage })
  assert.ok(collectTexts(tree).some(t => t.includes('Данные часов от')), 'статус показывает свежие данные')
})

test('debugPollTick помечает таймаут, если часы не ответили', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('debug')
  options.state.debugRequestedAt = Date.now() - 20000
  options.debugPollTick()
  assert.equal(options.state.debugWaiting, false)
  assert.equal(options.state.debugTimedOut, true)
  const tree = options.build({ settingsStorage: storage })
  assert.ok(collectTexts(tree).some(t => t.includes('Часы не ответили')), 'сообщение о таймауте видно')
})
