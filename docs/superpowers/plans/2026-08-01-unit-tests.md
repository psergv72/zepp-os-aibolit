# Unit-тесты и хелпер-модуль intake-logic — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить unit-тесты (node:test, ноль зависимостей) и выделить чистую SDK-независимую логику в `src/utils/intake-logic.js`, устранив дублирование в watch-коде.

**Architecture:** `"type": "module"` в `src/package.json` позволяет node:test импортировать ESM-исходники; `src/test/*.test.js` тестируют чистый модуль `intake-logic.js`; watch-потребители (schedule.js, reminder.js, home, plan) рефакторятся на хелперы. Спека: `docs/superpowers/specs/2026-08-01-unit-tests-design.md`.

**Tech Stack:** Node 24 (встроенный `node:test`, `node:assert/strict`), ESM, ZeppOS SDK (сборка через `zeus`).

---

### Task 1: Настройка тест-раннера (`src/package.json`)

**Files:**
- Modify: `src/package.json`

- [ ] **Step 1: Добавить `"type": "module"` и скрипт `test`**

Заменить содержимое `src/package.json` на:

```json
{
  "name": "medication-reminder",
  "version": "1.0.0",
  "description": "Medication reminder for Amazfit Balance 2",
  "main": "app.js",
  "scripts": {
    "test": "node --test test/"
  },
  "author": "",
  "license": "Apache-2.0",
  "type": "module",
  "devDependencies": {
    "@zeppos/device-types": "^3.0.0"
  },
  "dependencies": {
    "@zeppos/zml": "^0.0.38"
  }
}
```

ВАЖНО: файл должен быть без BOM (символ U+FEFF в начале ломает JSON-парсинг zeus). Инструмент Write пишет без BOM — используйте его. НЕ используйте PowerShell `Set-Content -Encoding UTF8`.

- [ ] **Step 2: Проверить, что сборка zeus не сломалась**

Run (из `src`): `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" build -t "Amazfit Balance 2"`
Expected: `[QJSC] Compiling JS files... done!` без ошибок.

- [ ] **Step 3: Проверить, что тест-раннер стартует**

Создать временный тест `src/test/_smoke.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'

test('smoke', () => {
  assert.equal(1 + 1, 2)
})
```

Run (из `src`): `node --test test/`
Expected: `pass 1` / `fail 0`.

Затем удалить `src/test/_smoke.test.js` (каталог `src/test` оставить).

- [ ] **Step 4: Commit**

```bash
git add src/package.json
git commit -m "test: add node test runner setup"
```

---

### Task 2: Написать падающие тесты (`src/test/intake-logic.test.js`)

**Files:**
- Create: `src/test/intake-logic.test.js`

- [ ] **Step 1: Создать тест-файл**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getWeekDayBit,
  getWeekDaysBitmask,
  isIntakeOnDay,
  getEnabledMedItems,
  getIntakeEntries,
  isIntakeTakenToday,
  isIntakeCancelledToday,
  getIntakeStatus,
  getTakenTime,
  buildItemsSummary,
} from '../utils/intake-logic.js'

const MEDS = [
  { id: 'm1', name: 'Парацетамол', enabled: true },
  { id: 'm2', name: 'Аспирин', enabled: true },
  { id: 'm3', name: 'Отключён', enabled: false },
]

test('getWeekDayBit maps valid days', () => {
  assert.equal(getWeekDayBit(1), 1)
  assert.equal(getWeekDayBit(2), 2)
  assert.equal(getWeekDayBit(3), 4)
  assert.equal(getWeekDayBit(4), 8)
  assert.equal(getWeekDayBit(5), 16)
  assert.equal(getWeekDayBit(6), 32)
  assert.equal(getWeekDayBit(7), 64)
})

test('getWeekDayBit returns 0 for unknown day', () => {
  assert.equal(getWeekDayBit(0), 0)
  assert.equal(getWeekDayBit(8), 0)
})

test('getWeekDaysBitmask empty or null means every day', () => {
  assert.equal(getWeekDaysBitmask([]), 127)
  assert.equal(getWeekDaysBitmask(null), 127)
  assert.equal(getWeekDaysBitmask(undefined), 127)
})

test('getWeekDaysBitmask combines bits', () => {
  assert.equal(getWeekDaysBitmask([1]), 1)
  assert.equal(getWeekDaysBitmask([1, 3, 5]), 21)
  assert.equal(getWeekDaysBitmask([2, 7]), 66)
})

test('isIntakeOnDay: null weekDays = every day', () => {
  const intake = { weekDays: null }
  assert.equal(isIntakeOnDay(intake, 1), true)
  assert.equal(isIntakeOnDay(intake, 7), true)
})

test('isIntakeOnDay matches or not', () => {
  const intake = { weekDays: [1, 3, 5] }
  assert.equal(isIntakeOnDay(intake, 3), true)
  assert.equal(isIntakeOnDay(intake, 4), false)
})

test('getEnabledMedItems filters disabled and missing meds', () => {
  const intake = {
    items: [
      { medicationId: 'm1', amount: '2 таблетки' },
      { medicationId: 'm2', amount: '1 таблетка' },
      { medicationId: 'm3', amount: '3' },
      { medicationId: 'missing', amount: '1' },
    ],
  }
  assert.deepEqual(getEnabledMedItems(intake, MEDS), [
    { medicationId: 'm1', amount: '2 таблетки' },
    { medicationId: 'm2', amount: '1 таблетка' },
  ])
})

test('getIntakeEntries keeps enabled meds with med object, drops empty intakes', () => {
  const intakes = [
    { id: 'i1', time: '08:00', weekDays: null, items: [
      { medicationId: 'm1', amount: '2 таблетки' },
      { medicationId: 'm3', amount: '3' },
    ] },
    { id: 'i2', time: '12:00', weekDays: null, items: [
      { medicationId: 'm3', amount: '3' },
    ] },
    { id: 'i3', time: '20:00', weekDays: null, items: [] },
  ]
  const result = getIntakeEntries(intakes, MEDS)
  assert.equal(result.length, 1)
  assert.equal(result[0].intake.id, 'i1')
  assert.deepEqual(result[0].items, [
    { med: MEDS[0], amount: '2 таблетки' },
  ])
})

test('isIntakeTakenToday checks taken status by intakeId and date', () => {
  const logs = [
    { intakeId: 'i1', date: '2026-08-01', status: 'taken' },
    { intakeId: 'i1', date: '2026-08-01', status: 'snoozed' },
  ]
  assert.equal(isIntakeTakenToday('i1', '2026-08-01', logs), true)
  assert.equal(isIntakeTakenToday('i2', '2026-08-01', logs), false)
  assert.equal(isIntakeTakenToday('i1', '2026-08-02', logs), false)
})

test('isIntakeCancelledToday checks pair intakeId+date', () => {
  const cancellations = [{ intakeId: 'i1', date: '2026-08-01' }]
  assert.equal(isIntakeCancelledToday('i1', '2026-08-01', cancellations), true)
  assert.equal(isIntakeCancelledToday('i2', '2026-08-01', cancellations), false)
})

test('getIntakeStatus: taken wins over cancelled, else cancelled, else pending', () => {
  const logs = [{ intakeId: 'i1', date: 'd', status: 'taken' }]
  const cancellations = [{ intakeId: 'i1', date: 'd' }]
  assert.equal(getIntakeStatus('i1', 'd', logs, cancellations), 'taken')
  assert.equal(getIntakeStatus('i2', 'd', logs, cancellations), 'cancelled')
  assert.equal(getIntakeStatus('i3', 'd', logs, cancellations), 'pending')
})

test('getTakenTime returns takenTime of taken log or null', () => {
  const logs = [
    { intakeId: 'i1', date: 'd', status: 'taken', takenTime: '08:05' },
    { intakeId: 'i2', date: 'd', status: 'snoozed', takenTime: '08:07' },
  ]
  assert.equal(getTakenTime('i1', 'd', logs), '08:05')
  assert.equal(getTakenTime('i2', 'd', logs), null)
  assert.equal(getTakenTime('i3', 'd', logs), null)
})

test('buildItemsSummary joins name × amount, skips disabled and missing', () => {
  const items = [
    { medicationId: 'm1', amount: '2 таблетки' },
    { medicationId: 'm2', amount: '' },
    { medicationId: 'm3', amount: '3' },
    { medicationId: 'missing', amount: '1' },
  ]
  assert.equal(buildItemsSummary(items, MEDS), 'Парацетамол \u00d7 2 таблетки, Аспирин')
  assert.equal(buildItemsSummary([], MEDS), '')
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run (из `src`): `node --test test/intake-logic.test.js`
Expected: FAIL — ошибка `Cannot find module '../utils/intake-logic.js'`.

---

### Task 3: Реализовать `src/utils/intake-logic.js`

**Files:**
- Create: `src/utils/intake-logic.js`

- [ ] **Step 1: Создать модуль**

```js
export function getWeekDayBit(dayOfWeek) {
  const bits = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16, 6: 32, 7: 64 }
  return bits[dayOfWeek] || 0
}

export function getWeekDaysBitmask(weekDays) {
  if (!weekDays || weekDays.length === 0) return 127
  let mask = 0
  for (const day of weekDays) {
    mask |= getWeekDayBit(day)
  }
  return mask
}

export function isIntakeOnDay(intake, dayOfWeek) {
  if (!intake.weekDays || intake.weekDays.length === 0) return true
  return intake.weekDays.includes(dayOfWeek)
}

function medIsEnabled(med) {
  return !!med && med.enabled
}

export function getEnabledMedItems(intake, medications) {
  const meds = medications || []
  return (intake.items || []).filter(item => {
    const med = meds.find(m => m.id === item.medicationId)
    return medIsEnabled(med)
  })
}

export function getIntakeEntries(intakes, medications) {
  const meds = medications || []
  return (intakes || [])
    .map(intake => ({
      intake,
      items: (intake.items || [])
        .map(item => ({ med: meds.find(m => m.id === item.medicationId), amount: item.amount }))
        .filter(({ med }) => medIsEnabled(med)),
    }))
    .filter(({ items }) => items.length > 0)
}

export function isIntakeTakenToday(intakeId, date, takeLogs) {
  return (takeLogs || []).some(i => i.intakeId === intakeId && i.date === date && i.status === 'taken')
}

export function isIntakeCancelledToday(intakeId, date, cancellations) {
  return (cancellations || []).some(c => c.intakeId === intakeId && c.date === date)
}

export function getIntakeStatus(intakeId, date, takeLogs, cancellations) {
  if (isIntakeTakenToday(intakeId, date, takeLogs)) return 'taken'
  if (isIntakeCancelledToday(intakeId, date, cancellations)) return 'cancelled'
  return 'pending'
}

export function getTakenTime(intakeId, date, takeLogs) {
  const log = (takeLogs || []).find(i => i.intakeId === intakeId && i.date === date && i.status === 'taken')
  return log ? log.takenTime : null
}

export function buildItemsSummary(items, medications) {
  const meds = medications || []
  const lines = []
  for (const item of items || []) {
    const med = meds.find(m => m.id === item.medicationId)
    if (!medIsEnabled(med)) continue
    lines.push((med.name || '') + (item.amount ? ' \u00d7 ' + item.amount : ''))
  }
  return lines.join(', ')
}
```

- [ ] **Step 2: Запустить тесты**

Run (из `src`): `node --test test/intake-logic.test.js`
Expected: `pass 13` / `fail 0`.

- [ ] **Step 3: Проверить сборку zeus**

Run (из `src`): `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" build -t "Amazfit Balance 2"`
Expected: `[QJSC] ... done!`.

- [ ] **Step 4: Commit**

```bash
git add src/test/intake-logic.test.js src/utils/intake-logic.js
git commit -m "feat: add intake-logic helpers with unit tests"
```

---

### Task 4: Рефакторинг `src/utils/schedule.js`

**Files:**
- Modify: `src/utils/schedule.js`

- [ ] **Step 1: Проверить потребителей битовых функций**

Run (из корня репозитория): `git grep -n "getWeekDayBit\|getWeekDaysBitmask" -- "src/**/*.js"`
Expected: совпадения только в `src/utils/schedule.js` (и в `docs/`, `src/test/` — допустимо). Если есть другие импорты из `schedule.js` — добавить re-export (шаг 2).

- [ ] **Step 2: Заменить определения и локальный хелпер**

В `src/utils/schedule.js`:
1. Удалить определения `getWeekDayBit` и `getWeekDaysBitmask`.
2. Удалить функцию `getEnabledItems`.
3. Добавить импорт:

```js
import { getWeekDayBit, getWeekDaysBitmask, getEnabledMedItems } from './intake-logic.js'
```

4. Если на шаге 1 нашлись внешние импорты `getWeekDayBit`/`getWeekDaysBitmask` из `schedule.js`, добавить re-export сразу после импортов:

```js
export { getWeekDayBit, getWeekDaysBitmask } from './intake-logic.js'
```

5. В `refreshAlarms()` заменить строку:

```js
    if (getEnabledItems(intake).length === 0) continue
```

на:

```js
    if (getEnabledMedItems(intake, getMedications()).length === 0) continue
```

`createIntakeAlarm`, `createRetryAlarm`, `createSnoozeAlarm`, `cancelAlarmById` не меняются.

- [ ] **Step 3: Проверить тесты и сборку**

Run (из `src`): `node --test test/`
Expected: `pass 13` / `fail 0`.

Run (из `src`): `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" build -t "Amazfit Balance 2"`
Expected: сборка без ошибок.

- [ ] **Step 4: Commit**

```bash
git add src/utils/schedule.js
git commit -m "refactor: use intake-logic helpers in alarm scheduler"
```

---

### Task 5: Рефакторинг `src/app-service/reminder.js`

**Files:**
- Modify: `src/app-service/reminder.js`

- [ ] **Step 1: Заменить buildContent**

В `src/app-service/reminder.js`:
1. Удалить функцию `buildContent(intake)`.
2. Добавить импорт:

```js
import { buildItemsSummary } from '../utils/intake-logic.js'
```

3. Заменить строку `const content = buildContent(intake)` на:

```js
    const content = buildItemsSummary(intake.items || [], getMedications()) || 'Примите лекарство'
```

Импорт `getMedications` из `../utils/storage` уже есть. Остальной код не меняется.

- [ ] **Step 2: Проверить тесты и сборку**

Run (из `src`): `node --test test/`
Expected: `pass 13` / `fail 0`.

Run (из `src`): `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" build -t "Amazfit Balance 2"`
Expected: сборка без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/app-service/reminder.js
git commit -m "refactor: use buildItemsSummary helper in reminder"
```

---

### Task 6: Рефакторинг `src/page/home/index.js`

**Files:**
- Modify: `src/page/home/index.js`

- [ ] **Step 1: Заменить построение entries в `refreshView`**

В `src/page/home/index.js`:
1. Добавить импорт (после существующих импортов storage/sync):

```js
import { getIntakeEntries, isIntakeOnDay, isIntakeTakenToday, isIntakeCancelledToday } from '../../utils/intake-logic.js'
```

2. В `refreshView()` удалить блок построения `enabledMedMap` и заменить всю цепочку (от `const enabledMedMap = {}` до `const sorted = ...`) на:

```js
    const dayOfWeek = currentTime.getDay() === 0 ? 7 : currentTime.getDay()

    const relevant = getIntakeEntries(intakes, medications)
      .filter(({ intake }) => {
        const [h, m] = intake.time.split(':').map(Number)
        const intakeMinutes = h * 60 + m
        return intakeMinutes >= currentMinutes
      })
      .filter(({ intake }) => isIntakeOnDay(intake, dayOfWeek))
      .filter(({ intake }) => !isIntakeTakenToday(intake.id, todayDateStr, takeLogs))
      .filter(({ intake }) => !isIntakeCancelledToday(intake.id, todayDateStr, cancellations))
      .sort((a, b) => a.intake.time.localeCompare(b.intake.time))
```

Переменные `medications`, `intakes`, `takeLogs`, `cancellations`, `todayDateStr` уже объявлены выше в `refreshView` — их определения сохраняются. `this.state.intakes = sorted` и `this.renderUpcoming(sorted)` — заменить `sorted` на `relevant`.

- [ ] **Step 2: Проверить тесты и сборку**

Run (из `src`): `node --test test/`
Expected: `pass 13` / `fail 0`.

Run (из `src`): `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" build -t "Amazfit Balance 2"`
Expected: сборка без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/page/home/index.js
git commit -m "refactor: use intake-logic helpers on home page"
```

---

### Task 7: Рефакторинг `src/page/plan/index.js`

**Files:**
- Modify: `src/page/plan/index.js`

- [ ] **Step 1: Заменить построение entries и статусов в `refreshView`**

В `src/page/plan/index.js`:
1. Добавить импорт (после существующих импортов):

```js
import { getIntakeEntries, isIntakeOnDay, getIntakeStatus, getTakenTime } from '../../utils/intake-logic.js'
```

2. В `refreshView()` удалить блок построения `enabledMedMap` и заменить цепочку построения `today` на:

```js
    const dayOfWeek = new Date().getDay() === 0 ? 7 : new Date().getDay()

    const today = getIntakeEntries(intakes, medications)
      .filter(({ intake }) => isIntakeOnDay(intake, dayOfWeek))
      .sort((a, b) => a.intake.time.localeCompare(b.intake.time))
```

3. Заменить цикл вычисления статусов на:

```js
    for (const entry of today) {
      const intake = entry.intake
      const status = getIntakeStatus(intake.id, todayDateStr, takeLogs, cancellations)

      entry._taken = status === 'taken'
      entry._takenTime = getTakenTime(intake.id, todayDateStr, takeLogs)
      entry._cancelled = status === 'cancelled'
    }
```

Переменные `medications`, `intakes`, `takeLogs`, `cancellations`, `todayDateStr` уже объявлены — сохраняются.

- [ ] **Step 2: Проверить тесты и сборку**

Run (из `src`): `node --test test/`
Expected: `pass 13` / `fail 0`.

Run (из `src`): `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" build -t "Amazfit Balance 2"`
Expected: сборка без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/page/plan/index.js
git commit -m "refactor: use intake-logic helpers on plan page"
```

---

### Task 8: Финальная проверка

**Files:**
- none (верификация)

- [ ] **Step 1: Запустить все тесты**

Run (из `src`): `node --test test/`
Expected: `pass 13` / `fail 0`.

- [ ] **Step 2: Полная сборка**

Run (из `src`): `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" build -t "Amazfit Balance 2"`
Expected: `[QJSC] Compiling JS files... done!` без ошибок.

- [ ] **Step 3: Smoke-проверка рефакторинга**

Run (из корня репозитория): `git grep -n "getEnabledItems\|buildContent\|enabledMedMap" -- "src/**/*.js"`
Expected: совпадений в коде `src/` нет (в `docs/`, `src/test/` допустимо).

- [ ] **Step 4: Ручная проверка сценария (устройство/эмулятор)**

Run: `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" preview --target "Amazfit Balance 2"` из `src`.

Проверить: создание приёма с двумя лекарствами; отображение на home/plan состава `name × amount`; take/undo/cancel; snooze; уведомление с составом приёма; история на телефоне.

- [ ] **Step 5: Commit при изменениях по итогам проверки**

```bash
git add -A
git commit -m "fix: adjustments after unit tests verification"
```

---
