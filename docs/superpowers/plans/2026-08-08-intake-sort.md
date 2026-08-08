# Устойчивая сортировка приёмов по времени — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать сортировку приёмов по времени на экранах «Сегодня» и «План на сегодня» числовой, устойчивой к формату времени без ведущего нуля.

**Architecture:** Общий хелпер `timeToMinutes()` в `intake-logic.js` сравнивает время числовыми минутами. Обе страницы сортируют через `sortIntakeEntriesByTime()`. На телефоне время нормализуется к `HH:MM` при сохранении приёма.

**Tech Stack:** Zepp OS (часы — vanilla JS, страницы на `Page`), Zepp OS Side Service (телефон — `AppSettingsPage`), тесты на `node:test`.

---

### Task 1: Хелперы `timeToMinutes` и `sortIntakeEntriesByTime` в intake-logic

**Files:**
- Modify: `src/utils/intake-logic.js`
- Test: `src/test/intake-logic.test.js`

- [ ] **Step 1: Write the failing test**

Добавить в конец `src/test/intake-logic.test.js` (после существующего теста `medItemText`, строка 174) и добавить импорт:

```js
import {
  getWeekDayBit,
  getWeekDaysBitmask,
  isIntakeOnDay,
  getEnabledMedItems,
  getIntakeEntries,
  isIntakeTakenToday,
  isIntakeCancelledToday,
  isIntakeSkippedToday,
  getIntakeStatus,
  getTakenTime,
  buildItemsSummary,
  medItemText,
  timeToMinutes,
  sortIntakeEntriesByTime,
} from '../utils/intake-logic.js'
```

```js
test('timeToMinutes парсит HH:MM и H:MM в минуты', () => {
  assert.equal(timeToMinutes('08:00'), 480)
  assert.equal(timeToMinutes('8:00'), 480)
  assert.equal(timeToMinutes('23:59'), 1439)
  assert.equal(timeToMinutes('00:00'), 0)
  assert.equal(timeToMinutes(''), 0)
  assert.equal(timeToMinutes('abc'), 0)
})

test('sortIntakeEntriesByTime сортирует по времени, устойчив к формату без нуля', () => {
  const mk = (time) => ({ intake: { time } })
  const result = sortIntakeEntriesByTime([mk('10:00'), mk('8:00'), mk('09:30')])
  assert.deepEqual(result.map(e => e.intake.time), ['8:00', '09:30', '10:00'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/intake-logic.test.js`
Expected: FAIL — `timeToMinutes is not a function`

- [ ] **Step 3: Write minimal implementation**

В `src/utils/intake-logic.js` в конец файла добавить:

```js
export function timeToMinutes(time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time || '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}

export function sortIntakeEntriesByTime(entries) {
  return entries.slice().sort((a, b) => timeToMinutes(a.intake.time) - timeToMinutes(b.intake.time))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/intake-logic.test.js`
Expected: PASS (все тесты, включая новые)

- [ ] **Step 5: Commit**

```bash
git add src/utils/intake-logic.js src/test/intake-logic.test.js
git commit -m "feat: numeric time sorting helpers in intake-logic"
```

---

### Task 2: Сортировка на странице «Сегодня»

**Files:**
- Modify: `src/page/home/index.js:6` (import), `src/page/home/index.js:75` (sort)
- Test: `src/test/home-page-render.test.js`

- [ ] **Step 1: Write the failing test**

В `src/test/home-page-render.test.js` добавить тест. Страница «Сегодня» показывает только будущие приёмы, поэтому в тесте два времени сегодня вечером — `23:50` и `23:59` (всегда в будущем относительно любого времени суток). Добавить тест в конец файла (после строки 266):

```js
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
```

Примечание: этот тест проверяет применение сортировки на странице. Числовая устойчивость к формату `H:MM` покрыта юнит-тестом `sortIntakeEntriesByTime` в Task 1.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/home-page-render.test.js`
Expected: FAIL — `time1` или `time2` равно `undefined` (приёмы отфильтрованы фильтром будущего времени из-за сломанного порядка при `localeCompare`? нет — они оба в будущем). Если сортировка не применяется, `23:59` из `getIntakes()` первым попадёт в фильтр и порядок неверен — тест упадёт на `time1.props.y < time2.props.y`.

Замечание: если текущий код уже показывает `23:50` раньше `23:59` (localeCompare сработал), тест пройдёт и до фикса — это допустимо; красным тест станет после Task 1, когда страница начнёт использовать `sortIntakeEntriesByTime` и можно проверить настоящий красный цикл. Если тест прошёл — продолжаем, он станет регрессионной защитой.

- [ ] **Step 3: Write minimal implementation**

В `src/page/home/index.js`:
1. В строке 6 импорт дополнить:
```js
import { getIntakeEntries, isIntakeOnDay, isIntakeTakenToday, isIntakeCancelledToday, isIntakeSkippedToday, medItemText, sortIntakeEntriesByTime } from '../../utils/intake-logic.js'
```
2. В `refreshView()` заменить строку 75 `.sort((a, b) => a.intake.time.localeCompare(b.intake.time))` на:
```js
    const relevant = sortIntakeEntriesByTime(
      getIntakeEntries(intakes, medications)
        .filter(({ intake }) => {
          const [h, m] = intake.time.split(':').map(Number)
          const intakeMinutes = h * 60 + m
          return intakeMinutes >= currentMinutes
        })
        .filter(({ intake }) => isIntakeOnDay(intake, dayOfWeek))
        .filter(({ intake }) => !isIntakeTakenToday(intake.id, todayDateStr, takeLogs))
        .filter(({ intake }) => !isIntakeCancelledToday(intake.id, todayDateStr, cancellations))
        .filter(({ intake }) => !isIntakeSkippedToday(intake.id, todayDateStr, takeLogs))
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/home-page-render.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/page/home/index.js src/test/home-page-render.test.js
git commit -m "feat: sort home page intakes by time numerically"
```

---

### Task 3: Сортировка на странице «План на сегодня»

**Files:**
- Modify: `src/page/plan/index.js:17` (import), `src/page/plan/index.js:74-76` (sort)
- Test: `src/test/plan-page-render.test.js`

- [ ] **Step 1: Write the failing test**

В `src/test/plan-page-render.test.js` добавить тест в конец файла (после строки 275). План-страница показывает все приёмы дня, поэтому можно использовать времена с форматом без ведущего нуля:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/plan-page-render.test.js`
Expected: FAIL — `time8.props.y < time10.props.y` ложно (при `localeCompare` строка `'10:00'` < `'8:00'`, поэтому 10:00 отрисуется первым).

- [ ] **Step 3: Write minimal implementation**

В `src/page/plan/index.js`:
1. В строке 17 импорт дополнить `sortIntakeEntriesByTime`:
```js
import { getIntakeEntries, isIntakeOnDay, getIntakeStatus, getTakenTime, medItemText, sortIntakeEntriesByTime } from '../../utils/intake-logic.js'
```
2. В `refreshView()` заменить строки 74-76:
```js
    const today = sortIntakeEntriesByTime(
      getIntakeEntries(intakes, medications)
        .filter(({ intake }) => isIntakeOnDay(intake, dayOfWeek))
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/plan-page-render.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/page/plan/index.js src/test/plan-page-render.test.js
git commit -m "feat: sort plan page intakes by time numerically"
```

---

### Task 4: Нормализация времени приёма на телефоне

**Files:**
- Modify: `src/setting/index.js`
- Test: `src/test/settings-render.test.js`

- [ ] **Step 1: Write the failing test**

В `src/test/settings-render.test.js` добавить тест в конец файла (после строки 292):

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/settings-render.test.js`
Expected: FAIL — `saved[0].time` равно `'8:00'`, не `'08:00'`

- [ ] **Step 3: Write minimal implementation**

В `src/setting/index.js`:
1. Добавить функцию `normalizeTime` рядом с `timeMinutes` (после строки 87):
```js
function normalizeTime(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((str || '').trim())
  return m
    ? String(Number(m[1])).padStart(2, '0') + ':' + m[2]
    : (str || '').trim()
}
```
2. В `renderIntakeEdit()` в onClick кнопки «Сохранить» (строки 436-448) перед сохранением нормализовать время. Заменить блок:
```js
            if (!draft.time.trim() || draft.items.length === 0) return
            draft.time = normalizeTime(draft.time)
            const intakes = this.getIntakes()
```
на месте `if (!draft.time.trim() || draft.items.length === 0) return` добавить строку `draft.time = normalizeTime(draft.time)` сразу после проверки.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/settings-render.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/setting/index.js src/test/settings-render.test.js
git commit -m "feat: normalize intake time to HH:MM on save"
```

---

### Task 5: Полный прогон тестов

**Files:** (нет)

- [ ] **Step 1: Run the full test suite**

Run: `node --test "test/*.test.js"`
Expected: все 192+ теста проходят, 0 fail

- [ ] **Step 2: Verify no leftover `localeCompare` for times**

Run: `rg "localeCompare" src/page`
Expected: пустой вывод (обе страницы используют `sortIntakeEntriesByTime`)

- [ ] **Step 3: Commit (если остались незакоммиченные изменения)**

```bash
git add -A
git commit -m "test: verify full suite green"
```
