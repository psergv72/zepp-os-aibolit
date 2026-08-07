# Жизненный цикл уведомлений Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Уведомления о приёме лекарств нельзя удалить обычным способом; каждое уведомление разрешается переносом, «Принято» или «Отменено», необработанное автоматически переносится на новое время, в центре уведомлений всегда одно уведомление, а вытесненный приём помечается «Пропущено».

**Architecture:** Центральный модуль `src/utils/notification-lifecycle.js` владеет жизненным циклом уведомлений: pending-состояние в ShareLocalStorage (ключ `pendingNotification`), выдача/замена/сброс уведомлений, пометка «Пропущено» и автоперенос через `retryInterval` (по умолчанию 5 мин). `reminder.js` становится тонким обработчиком; страницы take/snooze/cancel/plan сбрасывают pending при резолве приёма. Статус `skipped` учитывается в `intake-logic.js`, план-страница отображает его отметкой `☒` + текст «пропущено» и позволяет принять приём.

**Tech Stack:** Zepp OS (API 4.2), `@zos/notification` (notify/cancel/getAllNotifications), `@zos/alarm`, ShareLocalStorage, node:test + модульные стабы `@zos/*`.

**Спека:** `docs/superpowers/specs/2026-08-07-notification-lifecycle-design.md`

**Все команды тестов выполняются из каталога `src/`.**

---

### Task 1: retryInterval по умолчанию = 5

**Files:**
- Modify: `src/utils/constants.js:21`
- Modify: `src/setting/index.js:7`
- Modify: `src/setting/index.js:598`
- Test: `src/test/constants.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `src/test/constants.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS } from '../utils/constants.js'

test('DEFAULT_SETTINGS.retryInterval равен 5', () => {
  assert.equal(DEFAULT_SETTINGS.retryInterval, 5)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/constants.test.js`
Expected: FAIL — `DEFAULT_SETTINGS.retryInterval` равен 60.

- [ ] **Step 3: Implement**

In `src/utils/constants.js`, change line 21:

```js
  retryInterval: 60,
```
→
```js
  retryInterval: 5,
```

In `src/setting/index.js` line 7:

```js
const DEFAULT_SETTINGS = { retryInterval: 60, syncInterval: 60, snoozeOptions: [30, 45, 60, 90], minFontSize: 16 }
```
→
```js
const DEFAULT_SETTINGS = { retryInterval: 5, syncInterval: 60, snoozeOptions: [30, 45, 60, 90], minFontSize: 16 }
```

In `src/setting/index.js` line 598:

```js
        textField('Интервал повтора (мин)', String(draft.retryInterval), v => { draft.retryInterval = parseInt(v, 10) || 60; this.forceRender() }),
```
→
```js
        textField('Интервал повтора (мин)', String(draft.retryInterval), v => { draft.retryInterval = parseInt(v, 10) || 5; this.forceRender() }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/constants.test.js`
Expected: PASS.

- [ ] **Step 5: Run related settings test**

Run: `node --test test/settings-render.test.js`
Expected: PASS (тест не проверяет конкретное значение по умолчанию).

- [ ] **Step 6: Commit**

```bash
git add src/utils/constants.js src/setting/index.js src/test/constants.test.js
git commit -m "feat: retryInterval default 5 minutes"
```

---

### Task 2: Хранилище pending-уведомления

**Files:**
- Modify: `src/utils/constants.js:9` (STORAGE_KEYS)
- Modify: `src/utils/storage.js`
- Test: `src/test/storage.test.js`

- [ ] **Step 1: Write the failing test**

Add to `src/test/storage.test.js` — расширить импорт:

```js
const {
  getConfigRevision,
  setConfigRevision,
  getSyncAlarmId,
  setSyncAlarmId,
  clearSyncAlarmId,
  getPendingNotification,
  setPendingNotification,
  clearPendingNotification,
} = await import('../utils/storage.js')
```

Add tests at the end of the file:

```js
test('getPendingNotification возвращает null, если pending не задан', () => {
  assert.equal(getPendingNotification(), null)
})

test('setPendingNotification сохраняет объект, getPendingNotification его возвращает', () => {
  const pending = { intakeId: 'i1', date: '2026-08-07' }
  setPendingNotification(pending)
  assert.deepEqual(getPendingNotification(), pending)
})

test('clearPendingNotification сбрасывает pending в null', () => {
  setPendingNotification({ intakeId: 'i1', date: '2026-08-07' })
  clearPendingNotification()
  assert.equal(getPendingNotification(), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/storage.test.js`
Expected: FAIL — `getPendingNotification is not a function`.

- [ ] **Step 3: Implement**

In `src/utils/constants.js`, add to `STORAGE_KEYS`:

```js
export const STORAGE_KEYS = {
  MEDICATIONS: 'medications',
  INTAKES: 'intakes',
  TAKE_LOGS: 'takeLogs',
  CANCELLATIONS: 'cancellations',
  SETTINGS: 'settings',
  SYNC_QUEUE: 'syncQueue',
  CONFIG_REVISION: 'configRevision',
  SYNC_ALARM_ID: 'syncAlarmId',
  PENDING_NOTIFICATION: 'pendingNotification',
}
```

In `src/utils/storage.js`, add after `clearSyncAlarmId()`:

```js
export function getPendingNotification() {
  const value = getItem(STORAGE_KEYS.PENDING_NOTIFICATION, null)
  return value && typeof value === 'object' ? value : null
}

export function setPendingNotification(pending) {
  setItem(STORAGE_KEYS.PENDING_NOTIFICATION, pending)
}

export function clearPendingNotification() {
  removeItem(STORAGE_KEYS.PENDING_NOTIFICATION)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/storage.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/constants.js src/utils/storage.js src/test/storage.test.js
git commit -m "feat: add pending notification storage helpers"
```

---

### Task 3: Статус skipped в intake-logic

**Files:**
- Modify: `src/utils/intake-logic.js`
- Test: `src/test/intake-logic.test.js`

- [ ] **Step 1: Write the failing test**

Add to `src/test/intake-logic.test.js` — расширить импорт:

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
} from '../utils/intake-logic.js'
```

Add tests at the end of the file:

```js
test('isIntakeSkippedToday проверяет пару intakeId+date по статусу skipped', () => {
  const logs = [
    { intakeId: 'i1', date: 'd', status: 'skipped' },
    { intakeId: 'i2', date: 'd', status: 'snoozed' },
  ]
  assert.equal(isIntakeSkippedToday('i1', 'd', logs), true)
  assert.equal(isIntakeSkippedToday('i2', 'd', logs), false)
  assert.equal(isIntakeSkippedToday('i1', 'd2', logs), false)
})

test('getIntakeStatus: приоритет taken > cancelled > skipped > pending', () => {
  const logs = [{ intakeId: 'i1', date: 'd', status: 'skipped' }]
  assert.equal(getIntakeStatus('i1', 'd', logs, []), 'skipped')

  const logsTaken = [
    { intakeId: 'i2', date: 'd', status: 'skipped' },
    { intakeId: 'i2', date: 'd', status: 'taken' },
  ]
  assert.equal(getIntakeStatus('i2', 'd', logsTaken, []), 'taken')

  const cancellations = [{ intakeId: 'i3', date: 'd' }]
  const logsCancelled = [{ intakeId: 'i3', date: 'd', status: 'skipped' }]
  assert.equal(getIntakeStatus('i3', 'd', logsCancelled, cancellations), 'cancelled')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/intake-logic.test.js`
Expected: FAIL — `isIntakeSkippedToday is not a function`.

- [ ] **Step 3: Implement**

In `src/utils/intake-logic.js`, add after `isIntakeCancelledToday`:

```js
export function isIntakeSkippedToday(intakeId, date, takeLogs) {
  return (takeLogs || []).some(i => i.intakeId === intakeId && i.date === date && i.status === 'skipped')
}
```

Replace `getIntakeStatus`:

```js
export function getIntakeStatus(intakeId, date, takeLogs, cancellations) {
  if (isIntakeTakenToday(intakeId, date, takeLogs)) return 'taken'
  if (isIntakeCancelledToday(intakeId, date, cancellations)) return 'cancelled'
  if (isIntakeSkippedToday(intakeId, date, takeLogs)) return 'skipped'
  return 'pending'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/intake-logic.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/intake-logic.js src/test/intake-logic.test.js
git commit -m "feat: add skipped status to intake logic"
```

---

### Task 4: Стаб @zos/notification — cancel и getAllNotifications

**Files:**
- Modify: `src/test/helpers/stubs/zos-notification.mjs`

- [ ] **Step 1: Replace stub content**

Rewrite `src/test/helpers/stubs/zos-notification.mjs` entirely:

```js
export const __calls = []
export const __cancelCalls = []
const activeIds = new Set()
let nextId = 1

export function notify(options) {
  __calls.push(options)
  const id = nextId++
  activeIds.add(id)
  return id
}

export function cancel(ids) {
  const list = Array.isArray(ids) ? ids : [ids]
  for (const id of list) activeIds.delete(id)
  __cancelCalls.push(list)
}

export function getAllNotifications() {
  return Array.from(activeIds)
}

export function __reset() {
  __calls.length = 0
  __cancelCalls.length = 0
  activeIds.clear()
  nextId = 1
}
```

- [ ] **Step 2: Run existing reminder tests to verify no regression**

Run: `node --test test/reminder-service.test.js`
Expected: PASS — стаб сохраняет прежний экспорт `__calls`.

- [ ] **Step 3: Commit**

```bash
git add src/test/helpers/stubs/zos-notification.mjs
git commit -m "test: extend notification stub with cancel and getAllNotifications"
```

---

### Task 5: Дата в параметрах ретрай/snooze будильников

**Files:**
- Modify: `src/utils/schedule.js:48-86`
- Test: `src/test/schedule.test.js`

- [ ] **Step 1: Write the failing test**

In `src/test/schedule.test.js` — расширить импорт:

```js
const { refreshAlarms, createSyncAlarm, createRetryAlarm, createSnoozeAlarm } = await import('../utils/schedule.js')
```

Add tests at the end of the file:

```js
test('createRetryAlarm передаёт date в параметр будильника', () => {
  createRetryAlarm('i1', 5, '2026-08-07')
  const set = alarm.__getCalls().find(c => c.method === 'set')
  assert.ok(set, 'должен быть создан будильник')
  const param = JSON.parse(set.option.param)
  assert.equal(param.mode, 'retry')
  assert.equal(param.intakeId, 'i1')
  assert.equal(param.date, '2026-08-07')
})

test('createSnoozeAlarm передаёт date в параметр будильника', () => {
  createSnoozeAlarm('i1', 30, '2026-08-07')
  const set = alarm.__getCalls().find(c => c.method === 'set')
  assert.ok(set, 'должен быть создан будильник')
  const param = JSON.parse(set.option.param)
  assert.equal(param.mode, 'snooze')
  assert.equal(param.intakeId, 'i1')
  assert.equal(param.date, '2026-08-07')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/schedule.test.js`
Expected: FAIL — `param.date` равен `undefined`.

- [ ] **Step 3: Implement**

In `src/utils/schedule.js`, replace `createRetryAlarm`:

```js
export function createRetryAlarm(intakeId, delayMinutes, date) {
  const delaySeconds = delayMinutes * 60
  const param = JSON.stringify({
    mode: ALARM_MODES.RETRY,
    intakeId: intakeId,
    date: date,
  })

  const option = {
    url: 'app-service/reminder',
    delay: delaySeconds,
    repeat_type: REPEAT_ONCE,
    param: param,
    store: false,
  }

  const id = setAlarm(option)
  logger.log(`Created retry alarm id=${id} for intake ${intakeId} in ${delayMinutes}min`)
  return id
}
```

Replace `createSnoozeAlarm`:

```js
export function createSnoozeAlarm(intakeId, delayMinutes, date) {
  const delaySeconds = delayMinutes * 60
  const param = JSON.stringify({
    mode: ALARM_MODES.SNOOZE,
    intakeId: intakeId,
    date: date,
  })

  const option = {
    url: 'app-service/reminder',
    delay: delaySeconds,
    repeat_type: REPEAT_ONCE,
    param: param,
    store: false,
  }

  const id = setAlarm(option)
  logger.log(`Created snooze alarm id=${id} for intake ${intakeId} in ${delayMinutes}min`)
  return id
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/schedule.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/schedule.js src/test/schedule.test.js
git commit -m "feat: carry target date in retry and snooze alarm params"
```

---

### Task 6: Модуль жизненного цикла уведомлений

**Files:**
- Create: `src/utils/notification-lifecycle.js`
- Test: `src/test/notification-lifecycle.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `src/test/notification-lifecycle.test.js`:

```js
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const notification = await import('./helpers/stubs/zos-notification.mjs')
const storage = await import('./helpers/stubs/zos-storage.mjs')
const alarm = await import('./helpers/stubs/zos-alarm.mjs')

const lifecycle = await import('../utils/notification-lifecycle.js')

function seed() {
  storage.__resetStorage()
  new storage.ShareLocalStorage('aibolit-data.json')
  storage.__stores().get('aibolit-data.json').set('medications', [
    { id: 'm1', name: 'Парацетамол', enabled: true },
  ])
  storage.__stores().get('aibolit-data.json').set('intakes', [{
    id: 'i1',
    time: '08:00',
    weekDays: null,
    items: [{ medicationId: 'm1', amount: '1 таблетка' }],
  }])
}

function todayStr() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

function store() {
  return storage.__stores().get('aibolit-data.json')
}

beforeEach(() => {
  seed()
  notification.__reset()
  alarm.__reset()
})

test('issueNotification выдаёт уведомление, сохраняет pending и планирует ретрай', () => {
  lifecycle.issueNotification('i1')
  assert.equal(notification.__calls.length, 1)
  assert.deepEqual(store().get('pendingNotification'), { intakeId: 'i1', date: todayStr() })
  const retry = alarm.__getCalls().filter(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'retry')
  assert.equal(retry.length, 1)
  assert.equal(retry[0].option.url, 'app-service/reminder')
  assert.equal(JSON.parse(retry[0].option.param).intakeId, 'i1')
  assert.equal(JSON.parse(retry[0].option.param).date, todayStr())
})

test('issueNotification содержит кнопку Отменить', () => {
  lifecycle.issueNotification('i1')
  const cancelAction = notification.__calls[0].actions.find(a => a.text === 'Отменить')
  assert.ok(cancelAction, 'в уведомлении есть кнопка Отменить')
  assert.equal(cancelAction.file, 'page/cancel/index')
})

test('issueNotification не выдаёт уведомление для принятого приёма', () => {
  store().set('takeLogs', [{ intakeId: 'i1', date: todayStr(), status: 'taken' }])
  lifecycle.issueNotification('i1')
  assert.equal(notification.__calls.length, 0)
})

test('issueNotification не выдаёт уведомление для пропущенного приёма', () => {
  store().set('takeLogs', [{ intakeId: 'i1', date: todayStr(), status: 'skipped' }])
  lifecycle.issueNotification('i1')
  assert.equal(notification.__calls.length, 0)
})

test('issueNotification помечает чужой pending приём как пропущенный', () => {
  store().set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
    { id: 'i2', time: '09:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  store().set('pendingNotification', { intakeId: 'i1', date: todayStr() })
  lifecycle.issueNotification('i2')
  const logs = store().get('takeLogs')
  assert.equal(logs.length, 1)
  assert.equal(logs[0].intakeId, 'i1')
  assert.equal(logs[0].status, 'skipped')
  assert.equal(logs[0].date, todayStr())
  assert.equal(notification.__calls.length, 1)
})

test('issueNotification не помечает тот же intake как пропущенный', () => {
  store().set('pendingNotification', { intakeId: 'i1', date: todayStr() })
  lifecycle.issueNotification('i1')
  const logs = store().get('takeLogs')
  assert.equal(!logs || logs.length === 0, true)
  assert.equal(notification.__calls.length, 1)
})

test('issueNotification сбрасывает stale pending другого дня без пометки skipped', () => {
  store().set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
    { id: 'i2', time: '09:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  store().set('pendingNotification', { intakeId: 'i1', date: '2000-01-01' })
  lifecycle.issueNotification('i2')
  const logs = store().get('takeLogs')
  assert.equal(!logs || logs.length === 0, true)
  assert.deepEqual(store().get('pendingNotification'), { intakeId: 'i2', date: todayStr() })
})

test('clearPendingForIntake отменяет уведомления и сбрасывает pending для своего intake', () => {
  store().set('pendingNotification', { intakeId: 'i1', date: todayStr() })
  notification.notify({ title: 't', content: 'c', actions: [] })
  lifecycle.clearPendingForIntake('i1')
  assert.ok(notification.__cancelCalls.length >= 1, 'должны быть вызовы cancel')
  assert.equal(lifecycle.getPendingIntake(), null)
})

test('clearPendingForIntake игнорирует чужой pending', () => {
  store().set('pendingNotification', { intakeId: 'i1', date: todayStr() })
  lifecycle.clearPendingForIntake('i2')
  assert.equal(notification.__cancelCalls.length, 0)
  assert.deepEqual(lifecycle.getPendingIntake(), { intakeId: 'i1', date: todayStr() })
})

test('markSkipped добавляет запись skipped и кладёт её в очередь синхронизации', () => {
  lifecycle.markSkipped('i1', todayStr())
  const logs = store().get('takeLogs')
  assert.equal(logs.length, 1)
  assert.equal(logs[0].intakeId, 'i1')
  assert.equal(logs[0].status, 'skipped')
  const queue = store().get('syncQueue')
  assert.equal(queue.length, 1)
  assert.equal(queue[0].status, 'skipped')
})

test('nextRetryIsToday учитывает пересечение полуночи', () => {
  const morning = new Date(2026, 7, 7, 10, 0, 0)
  assert.equal(lifecycle.nextRetryIsToday(morning, 5), true)
  const nearMidnight = new Date(2026, 7, 7, 23, 58, 0)
  assert.equal(lifecycle.nextRetryIsToday(nearMidnight, 5), false)
  const beforeMidnight = new Date(2026, 7, 7, 23, 0, 0)
  assert.equal(lifecycle.nextRetryIsToday(beforeMidnight, 60), false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/notification-lifecycle.test.js`
Expected: FAIL — `Cannot find module` / `issueNotification is not a function`.

- [ ] **Step 3: Implement**

Create `src/utils/notification-lifecycle.js`:

```js
import { log as Logger } from '@zos/utils'
import { notify, cancel, getAllNotifications } from '@zos/notification'
import {
  getIntakes,
  getMedications,
  getTakeLogs,
  getCancellations,
  getTodayDateStr,
  getSettings,
  getPendingNotification,
  setPendingNotification,
  clearPendingNotification,
  addTakeLog,
} from './storage'
import { createRetryAlarm } from './schedule'
import { INTAKE_STATUS } from './constants'
import { buildItemsSummary, isIntakeTakenToday, isIntakeCancelledToday, isIntakeSkippedToday } from './intake-logic.js'
import { sendTakeLogToPhone } from './sync'

const logger = Logger.getLogger('aibolit-notif-lifecycle')

export function cancelAllNotifications() {
  try {
    const ids = getAllNotifications()
    if (ids && ids.length > 0) cancel(ids)
  } catch (e) {
    logger.log('cancelAllNotifications failed: ' + e)
  }
}

export function getPendingIntake() {
  const pending = getPendingNotification()
  if (!pending || typeof pending !== 'object') return null
  return { intakeId: pending.intakeId, date: pending.date }
}

function isResolvedToday(intakeId, date) {
  const takeLogs = getTakeLogs()
  if (isIntakeTakenToday(intakeId, date, takeLogs)) return true
  if (isIntakeCancelledToday(intakeId, date, getCancellations())) return true
  if (isIntakeSkippedToday(intakeId, date, takeLogs)) return true
  return false
}

export function markSkipped(intakeId, date) {
  const intake = getIntakes().find(i => i.id === intakeId)
  const record = {
    id: 'skip_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    intakeId: intakeId,
    date: date,
    time: intake ? intake.time : null,
    status: INTAKE_STATUS.SKIPPED,
    items: intake ? (intake.items || []).map(item => ({ ...item })) : [],
  }
  addTakeLog(record)
  sendTakeLogToPhone(record)
  logger.log('Intake ' + intakeId + ' marked skipped for ' + date)
  return record
}

export function clearPendingForIntake(intakeId) {
  const pending = getPendingIntake()
  if (!pending || pending.intakeId !== intakeId) return
  cancelAllNotifications()
  clearPendingNotification()
  logger.log('Cleared pending notification for ' + intakeId)
}

export function issueNotification(intakeId) {
  const intake = getIntakes().find(i => i.id === intakeId)
  if (!intake) return

  const todayDateStr = getTodayDateStr()
  if (isResolvedToday(intakeId, todayDateStr)) return

  const pending = getPendingIntake()
  if (pending && pending.date === todayDateStr && pending.intakeId !== intakeId) {
    markSkipped(pending.intakeId, todayDateStr)
  }

  cancelAllNotifications()

  const title = 'Пора принимать лекарства'
  const content = buildItemsSummary(intake.items || [], getMedications()) || 'Примите лекарство'

  const id = notify({
    title: title,
    content: content,
    vibrate: 1,
    actions: [
      { text: 'Принял', file: 'page/take/index', param: JSON.stringify({ intakeId }) },
      { text: 'Отложить', file: 'page/snooze/index', param: JSON.stringify({ intakeId }) },
      { text: 'Отменить', file: 'page/cancel/index', param: JSON.stringify({ intakeId }) },
    ],
  })

  setPendingNotification({ intakeId: intakeId, date: todayDateStr })
  scheduleRetry(intakeId)

  logger.log('Notification issued for ' + intakeId + ' id=' + id)
}

function dateStrOf(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

export function nextRetryIsToday(now, delayMinutes) {
  const next = new Date(now.getTime() + delayMinutes * 60 * 1000)
  return dateStrOf(next) === dateStrOf(now)
}

function scheduleRetry(intakeId) {
  const settings = getSettings()
  const delay = Number(settings && settings.retryInterval)
  if (!Number.isFinite(delay) || delay <= 0) return
  if (!nextRetryIsToday(new Date(), delay)) {
    logger.log('Retry would cross midnight, skipping')
    return
  }
  createRetryAlarm(intakeId, delay, getTodayDateStr())
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/notification-lifecycle.test.js`
Expected: PASS.

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: PASS (все существующие тесты не регрессировали).

- [ ] **Step 6: Commit**

```bash
git add src/utils/notification-lifecycle.js src/test/notification-lifecycle.test.js
git commit -m "feat: add notification lifecycle module"
```

---

### Task 7: reminder.js — тонкий обработчик

**Files:**
- Modify: `src/app-service/reminder.js`
- Test: `src/test/reminder-service.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `src/test/reminder-service.test.js` (после существующих тестов):

```js
test('уведомление содержит кнопку Отменить', () => {
  serviceOpts.onInit(JSON.stringify({ mode: 'reminder', intakeId: 'i1' }))
  assert.equal(notification.__calls.length, 1)
  const cancelAction = notification.__calls[0].actions.find(a => a.text === 'Отменить')
  assert.ok(cancelAction, 'в уведомлении есть кнопка Отменить')
  assert.equal(cancelAction.file, 'page/cancel/index')
  assert.equal(cancelAction.param, JSON.stringify({ intakeId: 'i1' }))
})

test('REMINDER планирует ретрай-будильник с датой сегодня', () => {
  serviceOpts.onInit(JSON.stringify({ mode: 'reminder', intakeId: 'i1' }))
  const retry = alarm.__getCalls().filter(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'retry')
  assert.equal(retry.length, 1)
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  assert.equal(JSON.parse(retry[0].option.param).date, todayStr)
})

test('чужой pending помечается пропущенным при выдаче нового уведомления', () => {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const store = storage.__stores().get('aibolit-data.json')
  store.set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
    { id: 'i2', time: '09:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  store.set('pendingNotification', { intakeId: 'i1', date: todayStr })
  serviceOpts.onInit(JSON.stringify({ mode: 'reminder', intakeId: 'i2' }))
  const logs = store.get('takeLogs')
  assert.equal(logs.length, 1)
  assert.equal(logs[0].intakeId, 'i1')
  assert.equal(logs[0].status, 'skipped')
})

test('тот же intake не помечается пропущенным', () => {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const store = storage.__stores().get('aibolit-data.json')
  store.set('pendingNotification', { intakeId: 'i1', date: todayStr })
  serviceOpts.onInit(JSON.stringify({ mode: 'reminder', intakeId: 'i1' }))
  const logs = store.get('takeLogs')
  assert.equal(!logs || logs.length === 0, true)
})

test('onInit пропускает пропущенный intake', () => {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  storage.__stores().get('aibolit-data.json').set('takeLogs', [{ intakeId: 'i1', date: todayStr, status: 'skipped' }])
  serviceOpts.onInit(JSON.stringify({ mode: 'reminder', intakeId: 'i1' }))
  assert.equal(notification.__calls.length, 0)
})

test('RETRY с датой прошлого дня игнорируется', () => {
  serviceOpts.onInit(JSON.stringify({ mode: 'retry', intakeId: 'i1', date: '2000-01-01' }))
  assert.equal(notification.__calls.length, 0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/reminder-service.test.js`
Expected: FAIL — нет кнопки «Отменить», ретрай не несёт дату.

- [ ] **Step 3: Implement**

Rewrite `src/app-service/reminder.js` entirely:

```js
import { log as Logger } from '@zos/utils'
import { applyConfigFromSettings } from '../utils/watch-config'
import { refreshAlarms } from '../utils/schedule'
import { retrySync } from '../utils/sync'
import { ALARM_MODES } from '../utils/constants'
import { getTodayDateStr } from '../utils/storage'
import { issueNotification } from '../utils/notification-lifecycle'

const logger = Logger.getLogger('aibolit-reminder')

function handleEvent(e) {
  logger.log('reminder handleEvent: ' + e)

  let params
  try {
    params = JSON.parse(e)
  } catch (err) {
    logger.log('Failed to parse event params: ' + e)
    return
  }

  const { mode, intakeId, date } = params

  if (mode === ALARM_MODES.SYNC) {
    logger.log('sync tick: apply config, refresh alarms, retry queue')
    applyConfigFromSettings()
    refreshAlarms()
    retrySync()
    return
  }

  if (!intakeId) return

  if ((mode === ALARM_MODES.RETRY || mode === ALARM_MODES.SNOOZE) && date && date !== getTodayDateStr()) {
    logger.log('stale ' + mode + ' event for a past day, skip')
    return
  }

  issueNotification(intakeId)
}

AppService({
  onInit(e) {
    logger.log('reminder onInit(' + e + ')')
    handleEvent(e)
  },

  onEvent(e) {
    logger.log('reminder onEvent: ' + e)
    handleEvent(e)
  },

  onDestroy() {
    logger.log('reminder onDestroy')
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/reminder-service.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app-service/reminder.js src/test/reminder-service.test.js
git commit -m "refactor: reminder service delegates to notification lifecycle"
```

---

### Task 8: Страница take сбрасывает pending

**Files:**
- Modify: `src/page/take/index.js`
- Test: `src/test/take-page.test.js`

- [ ] **Step 1: Write the failing test**

Add to `src/test/take-page.test.js`:

```js
test('onInit снимает pending-уведомление для принятого приёма', () => {
  storage.__stores().get('aibolit-data.json').set('pendingNotification', { intakeId: 'i1', date: todayStr() })
  instance(JSON.stringify({ intakeId: 'i1' }))
  assert.equal(storage.__stores().get('aibolit-data.json').get('pendingNotification'), undefined)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/take-page.test.js`
Expected: FAIL — pending не сброшен.

- [ ] **Step 3: Implement**

In `src/page/take/index.js`, add import after `import { isIntakeTakenToday } from '../../utils/intake-logic'`:

```js
import { clearPendingForIntake } from '../../utils/notification-lifecycle'
```

In `takeIntake`, after `sendTakeLogToPhone(takeLog)`:

```js
    addTakeLog(takeLog)
    sendTakeLogToPhone(takeLog)
    clearPendingForIntake(intakeId)
    logger.log('Intake ' + intakeId + ' taken at ' + takenTime)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/take-page.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/page/take/index.js src/test/take-page.test.js
git commit -m "feat: clear pending notification on take"
```

---

### Task 9: Страница snooze сбрасывает pending и передаёт дату

**Files:**
- Modify: `src/page/snooze/index.js`
- Test: `src/test/snooze-page.test.js`

- [ ] **Step 1: Write the failing test**

Add to `src/test/snooze-page.test.js`:

```js
test('confirmSnooze снимает pending-уведомление и передаёт дату в будильник', () => {
  storage.__stores().get('aibolit-data.json').set('pendingNotification', { intakeId: 'i1', date: todayStr() })
  const page = instance()
  page.confirmSnooze(30)
  const set = alarm.__getCalls().find(c => c.method === 'set')
  assert.ok(set, 'должен быть создан будильник')
  assert.equal(JSON.parse(set.option.param).date, todayStr())
  assert.equal(storage.__stores().get('aibolit-data.json').get('pendingNotification'), undefined)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/snooze-page.test.js`
Expected: FAIL — date отсутствует, pending не сброшен.

- [ ] **Step 3: Implement**

In `src/page/snooze/index.js`, add import:

```js
import { clearPendingForIntake } from '../../utils/notification-lifecycle'
```

In `confirmSnooze`, replace:

```js
    createSnoozeAlarm(intakeId, delayMinutes)
```
→
```js
    createSnoozeAlarm(intakeId, delayMinutes, todayDateStr)
    clearPendingForIntake(intakeId)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/snooze-page.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/page/snooze/index.js src/test/snooze-page.test.js
git commit -m "feat: clear pending notification and carry date on snooze"
```

---

### Task 10: Страница отмены приёма

**Files:**
- Create: `src/page/cancel/index.js`
- Modify: `src/app.json` (pages list)
- Test: `src/test/cancel-page.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `src/test/cancel-page.test.js`:

```js
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

let pageOpts = null
globalThis.Page = (opts) => { pageOpts = opts }

const { __getRegistry, __reset, event } = await import('./helpers/stubs/zos-ui.mjs')
const storage = await import('./helpers/stubs/zos-storage.mjs')
const router = await import('./helpers/stubs/zos-router.mjs')
const device = await import('./helpers/stubs/zos-device.mjs')

await import('../page/cancel/index.js')

function seed() {
  storage.__resetStorage()
  new storage.ShareLocalStorage('aibolit-data.json')
  storage.__stores().get('aibolit-data.json').set('intakes', [{
    id: 'i1',
    time: '08:00',
    weekDays: null,
    items: [{ medicationId: 'm1', amount: '1 таблетка' }],
  }])
}

function todayStr() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

function instance(params) {
  const obj = Object.create(pageOpts)
  obj.state = { intakeId: null, intake: null }
  obj.onInit(params)
  return obj
}

function store() {
  return storage.__stores().get('aibolit-data.json')
}

beforeEach(() => {
  __reset()
  router.__reset()
  device.__setShape('round')
  seed()
})

test('onInit рисует вопрос и кнопки Да/Нет', () => {
  instance(JSON.stringify({ intakeId: 'i1' }))
  const texts = __getRegistry().map(w => w.props.text).filter(Boolean)
  assert.ok(texts.includes('Отменить приём на сегодня?'), 'должен быть вопрос об отмене')
  assert.ok(texts.includes('Да'), 'должна быть кнопка Да')
  assert.ok(texts.includes('Нет'), 'должна быть кнопка Нет')
})

test('confirmCancel отменяет приём, сбрасывает pending и закрывает приложение', () => {
  store().set('pendingNotification', { intakeId: 'i1', date: todayStr() })
  const page = instance(JSON.stringify({ intakeId: 'i1' }))
  page.confirmCancel()
  assert.deepEqual(store().get('cancellations'), [{ intakeId: 'i1', date: todayStr() }])
  assert.equal(store().get('pendingNotification'), undefined)
  const exits = router.__getCalls().filter(c => c.method === 'exit')
  assert.equal(exits.length, 1)
})

test('кнопка Нет закрывает приложение без отмены', () => {
  const page = instance(JSON.stringify({ intakeId: 'i1' }))
  const noBtn = __getRegistry().find(w => w.props.text === 'Нет')
  assert.ok(noBtn, 'должна быть кнопка Нет')
  noBtn.listeners[event.CLICK_UP]()
  const cancellations = store().get('cancellations')
  assert.equal(!cancellations || cancellations.length === 0, true)
  const exits = router.__getCalls().filter(c => c.method === 'exit')
  assert.equal(exits.length, 1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/cancel-page.test.js`
Expected: FAIL — модуль `../page/cancel/index.js` не найден.

- [ ] **Step 3: Implement**

Create `src/page/cancel/index.js`:

```js
import { log as Logger } from '@zos/utils'
import { createWidget, widget, event, align, text_style } from '@zos/ui'
import { exit as routerExit } from '@zos/router'
import { getIntakes, getMedications, addCancellation, getTodayDateStr } from '../../utils/storage'
import { sendCancellationToPhone } from '../../utils/sync'
import { clearPendingForIntake } from '../../utils/notification-lifecycle'
import { sysText, getUiScale } from '../../utils/ui-scale'
import { getContentBounds } from '../../utils/screen-layout'

const logger = Logger.getLogger('aibolit-cancel-page')

Page({
  state: {
    intakeId: null,
    intake: null,
  },

  build() {
    logger.log('cancel page build')
  },

  onInit(params) {
    logger.log('cancel page onInit: ' + params)

    let parsed
    try {
      parsed = JSON.parse(params)
    } catch (e) {
      logger.log('Failed to parse params: ' + params)
      return
    }

    const intakeId = parsed.intakeId || parsed.intakeID
    this.state.intakeId = intakeId
    this.state.intake = getIntakes().find(i => i.id === intakeId) || null

    this.renderCancel()
  },

  onDestroy() {
    logger.log('cancel page onDestroy')
  },

  renderCancel() {
    const S = getUiScale()
    const bounds = getContentBounds()
    const centerX = 480 / 2
    let y = bounds.top

    const intake = this.state.intake

    const medications = getMedications()
    const medMap = {}
    for (const med of medications) medMap[med.id] = med

    const itemsText = (intake && intake.items ? intake.items : [])
      .map(item => {
        const med = medMap[item.medicationId]
        return med ? med.name + ' \u00d7 ' + (item.amount || '') : null
      })
      .filter(Boolean)
      .join(', ')

    createWidget(widget.TEXT, {
      x: bounds.left,
      y: y,
      w: bounds.width,
      h: 40 * S,
      color: 0xffffff,
      text_size: sysText(28),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: intake ? (intake.label || intake.time) : '',
    })
    y += 48 * S

    if (itemsText) {
      createWidget(widget.TEXT, {
        x: bounds.left,
        y: y,
        w: bounds.width,
        h: 28 * S,
        color: 0x888888,
        text_size: sysText(22),
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: itemsText,
      })
      y += 30 * S
    }

    createWidget(widget.TEXT, {
      x: bounds.left,
      y: y,
      w: bounds.width,
      h: 32 * S,
      color: 0xffffff,
      text_size: sysText(26),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: 'Отменить приём на сегодня?',
    })
    y += 44 * S

    const gap = 20 * S
    const btnH = 72 * S
    const btnW = (bounds.width - gap) / 2
    const gridX = centerX - (btnW * 2 + gap) / 2

    const noBtn = createWidget(widget.TEXT, {
      x: gridX,
      y: y,
      w: btnW,
      h: btnH,
      color: 0x4fc3f7,
      text_size: sysText(32),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: 'Нет',
    })
    noBtn.addEventListener(event.CLICK_UP, () => {
      routerExit()
    })

    const yesBtn = createWidget(widget.TEXT, {
      x: gridX + btnW + gap,
      y: y,
      w: btnW,
      h: btnH,
      color: 0xff6b6b,
      text_size: sysText(32),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: 'Да',
    })
    yesBtn.addEventListener(event.CLICK_UP, () => {
      this.confirmCancel()
    })
  },

  confirmCancel() {
    const intakeId = this.state.intakeId
    if (!intakeId) {
      routerExit()
      return
    }

    const todayDateStr = getTodayDateStr()
    addCancellation(intakeId, todayDateStr)
    sendCancellationToPhone(intakeId, todayDateStr)
    clearPendingForIntake(intakeId)
    logger.log('Cancelled intake ' + intakeId + ' for ' + todayDateStr)

    routerExit()
  },
})
```

In `src/app.json`, add `"page/cancel/index"` to `page.pages`:

```json
        "page": {
          "pages": [
            "page/home/index",
            "page/plan/index",
            "page/snooze/index",
            "page/take/index",
            "page/cancel/index"
          ]
        },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/cancel-page.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/page/cancel/index.js src/app.json src/test/cancel-page.test.js
git commit -m "feat: add cancel intake confirmation page"
```

---

### Task 11: План-страница — статус «Пропущено» и сброс pending

**Files:**
- Modify: `src/page/plan/index.js`
- Test: `src/test/plan-page-render.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `src/test/plan-page-render.test.js`:

```js
test('пропущенный приём отображается с отметкой ☒ и текстом «пропущено»', () => {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  storage.__stores().get('aibolit-data.json').set('takeLogs', [{ intakeId: 'i1', date: todayStr, status: 'skipped' }])
  const page = instance()
  page.refreshView()
  const texts = __getRegistry().map(w => w.props.text).filter(Boolean)
  assert.ok(texts.includes('пропущено'), 'должен быть текст «пропущено»')
  assert.ok(texts.some(t => t.includes('\u2612')), 'должна быть отметка ☒')
})

test('тап по пропущенному приёму помечает его принятым', () => {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  storage.__stores().get('aibolit-data.json').set('takeLogs', [{ intakeId: 'i1', date: todayStr, status: 'skipped' }])
  const page = instance()
  page.refreshView()
  const ctrl = __getRegistry().find(w => w.props.text === '\u2612')
  assert.ok(ctrl, 'должна быть тапабельная отметка ☒')
  ctrl.listeners[event.CLICK_UP]()
  const logs = storage.__stores().get('aibolit-data.json').get('takeLogs')
  assert.ok(logs.some(l => l.intakeId === 'i1' && l.status === 'taken'), 'приём должен стать принятым')
})

test('takeIntake сбрасывает pending-уведомление', () => {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  storage.__stores().get('aibolit-data.json').set('pendingNotification', { intakeId: 'i1', date: todayStr })
  const page = instance()
  page.takeIntake({ id: 'i1', time: '23:59', items: [{ medicationId: 'm1', amount: '1' }] })
  assert.equal(storage.__stores().get('aibolit-data.json').get('pendingNotification'), undefined)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/plan-page-render.test.js`
Expected: FAIL — нет «пропущено», нет отметки ☒, pending не сбрасывается.

- [ ] **Step 3: Implement**

In `src/page/plan/index.js`:

Add import after `import { sendTakeLogToPhone, sendCancellationToPhone, sendUndoTakeToPhone, fetchTakesFromPhone, mergeTakeRecords } from '../../utils/sync'`:

```js
import { clearPendingForIntake } from '../../utils/notification-lifecycle'
```

In `refreshView`, after `entry._cancelled = status === 'cancelled'` add:

```js
      entry._skipped = status === 'skipped'
```

In `renderPlan`, change `statusHOf`:

```js
    const statusHOf = (entry) => (entry._takenTime ? 32 : 0) + (entry._cancelled ? 32 : 0) + (entry._skipped ? 32 : 0)
```

In `renderPlan`, change `textColor` and `statusIcon`:

```js
      const textColor = entry._cancelled ? 0x666666 : (entry._taken ? 0x4caf50 : (entry._skipped ? 0x999999 : 0xffffff))
      const statusIcon = entry._taken ? ' \u2713' : (entry._skipped ? ' \u2612' : '')
      const headerText = intake.time + statusIcon
```

In `renderPlan`, change `medColor`/`medDecor`:

```js
        const medColor = entry._cancelled ? 0x555555 : (entry._taken ? 0x888888 : (entry._skipped ? 0x777777 : 0xffffff))
        const medDecor = entry._cancelled ? text_style.STRIKETHROUGH : text_style.NONE
```

In `renderPlan`, after the cancelled block (`if (entry._cancelled) { ... }`) and before the checkbox block, add:

```js
      if (entry._skipped) {
        this.ui.create(widget.TEXT, {
          x: medX,
          y: y,
          w: medW,
          h: 32 * S,
          color: 0x666666,
          text_size: sysText(20),
          align_h: align.LEFT,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: 'пропущено',
        })
        y += 32 * S
      }
```

In `renderPlan`, change the checkbox block symbol/color and long-press guard:

```js
      if (!entry._cancelled) {
        const symbol = entry._taken ? '\u2713' : (entry._skipped ? '\u2612' : '\u2610')
        const color = entry._taken ? 0x4caf50 : (entry._skipped ? 0x888888 : 0xffffff)
        const ctrl = this.ui.create(widget.TEXT, {
          x: bounds.left,
          y: firstMedY + (lineH - medGap) / 2,
          w: checkColW,
          h: medGap,
          color: color,
          text_size: sysText(36),
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: symbol,
        })
        ctrl.addEventListener(event.CLICK_UP, () => {
          if (this._pressTimer) {
            clearTimeout(this._pressTimer)
            this._pressTimer = null
          }
          if (entry._taken) {
            this.undoIntake(intake)
          } else {
            this.takeIntake(intake)
          }
        })
        if (!entry._taken && !entry._skipped) {
          ctrl.addEventListener(event.CLICK_DOWN, () => {
            this._pressTimer = setTimeout(() => {
              this.cancelIntake(intake)
            }, 1000)
          })
        }
      }
```

In `takeIntake`, after `sendTakeLogToPhone(takeLog)` add `clearPendingForIntake(intake.id)`:

```js
    addTakeLog(takeLog)
    sendTakeLogToPhone(takeLog)
    clearPendingForIntake(intake.id)
```

In `cancelIntake`, after `sendCancellationToPhone(intake.id, todayDateStr)` add `clearPendingForIntake(intake.id)`:

```js
    addCancellation(intake.id, todayDateStr)
    sendCancellationToPhone(intake.id, todayDateStr)
    clearPendingForIntake(intake.id)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/plan-page-render.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/page/plan/index.js src/test/plan-page-render.test.js
git commit -m "feat: show skipped status on plan page and allow retake"
```

---

### Task 12: Домашняя страница исключает «Пропущено»

**Files:**
- Modify: `src/page/home/index.js`
- Test: `src/test/home-page-render.test.js`

- [ ] **Step 1: Write the failing test**

Add to `src/test/home-page-render.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/home-page-render.test.js`
Expected: FAIL — приём с skipped отображается.

- [ ] **Step 3: Implement**

In `src/page/home/index.js`, change the import:

```js
import { getIntakeEntries, isIntakeOnDay, isIntakeTakenToday, isIntakeCancelledToday, isIntakeSkippedToday, medItemText } from '../../utils/intake-logic.js'
```

In `refreshView`, after the cancelled filter add:

```js
      .filter(({ intake }) => !isIntakeSkippedToday(intake.id, todayDateStr, takeLogs))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/home-page-render.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/page/home/index.js src/test/home-page-render.test.js
git commit -m "feat: hide skipped intakes on home page"
```

---

### Task 13: Финальная проверка и документация

**Files:**
- Modify: `docs/phone-watch-communication.md:192`

- [ ] **Step 1: Update docs**

In `docs/phone-watch-communication.md`, update the example settings object on line 192:

```json
{ "retryInterval": 60, "syncInterval": 60, "snoozeOptions": [30,45,60,90], "minFontSize": 16 }
```
→
```json
{ "retryInterval": 5, "syncInterval": 60, "snoozeOptions": [30,45,60,90], "minFontSize": 16 }
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: PASS — все тесты зелёные.

- [ ] **Step 3: Verify app.json valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('app.json','utf8')); console.log('app.json ok')"`
Expected: `app.json ok`.

- [ ] **Step 4: Commit**

```bash
git add docs/phone-watch-communication.md
git commit -m "docs: update retry interval default to 5 minutes"
```
