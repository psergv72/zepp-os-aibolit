# Сущность «Прием лекарства» (intakes) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перестроить модель данных приложения Айболит: лекарство перестаёт иметь расписание, вместо него вводится сущность «Прием лекарства» (`intakes`) — время + дни недели + список лекарств с количеством.

**Architecture:** Массив `schedule` (слот на одно лекарство) заменяется массивом `intakes` (приём со списком `items: [{medicationId, amount}]`). Записи факта приёма переименовываются из `intakes` в `takeLogs` (одна запись на приём, со снимком состава). Все сервисы (алarмы, уведомления, snooze) и страницы (home/plan/snooze) переходят на работу с приёмами. Спека: `docs/superpowers/specs/2026-08-01-intake-groups-design.md`.

**Tech Stack:** ZeppOS 4.2, JS (ES2015), `@zeppos/zml`, `@zos/*` SDK, settings-компаньон через `AppSettingsPage`.

**Testing note:** В проекте нет unit-тестов и тест-раннера. Верификация — компиляция через `zeus build -t "Amazfit Balance 2"` из `src` (QJSC ловит синтаксические/import-ошибки; отсутствие проверки типов при `checkJs: false` означает, что промежуточные состояния собираются, но логику проверяют финальные ручные сценарии). Финальное поведение проверяется на устройстве/эмуляторе.

---

### Task 1: Константы (`utils/constants.js`)

**Files:**
- Modify: `src/utils/constants.js`

- [ ] **Step 1: Обновить `STORAGE_KEYS` и `ZML_METHODS`**

Заменить блок `STORAGE_KEYS`:

```js
export const STORAGE_KEYS = {
  MEDICATIONS: 'medications',
  INTAKES: 'intakes',
  TAKE_LOGS: 'takeLogs',
  CANCELLATIONS: 'cancellations',
  SETTINGS: 'settings',
  SYNC_QUEUE: 'syncQueue',
}
```

Заменить блок `ZML_METHODS`:

```js
export const ZML_METHODS = {
  SYNC_INTAKE: 'sync_intake',
  SYNC_CANCELLATION: 'sync_cancellation',
  UNDO_TAKE: 'undo_take',
  RESTORE_INTAKE: 'restore_intake',
}
```

Остальное (`INTAKE_STATUS`, `DEFAULT_SETTINGS`, `WEEK_DAYS`, `DAY_NAMES_RU`, `ALARM_MODES`) не меняется.

- [ ] **Step 2: Проверить сборку**

Run (из `src`): `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" build -t "Amazfit Balance 2"`
Expected: `[QJSC] Compiling JS files... done!` без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/utils/constants.js
git commit -m "refactor: rename storage keys to intakes/takeLogs"
```

---

### Task 2: Хранилище (`utils/storage.js`)

**Files:**
- Modify: `src/utils/storage.js`

- [ ] **Step 1: Переименовать функции**

Заменить секцию «schedule» на «intakes» (сущность приёма):

```js
export function getIntakes() {
  return getItem(STORAGE_KEYS.INTAKES, [])
}

export function setIntakes(intakes) {
  setItem(STORAGE_KEYS.INTAKES, intakes)
}
```

Заменить секцию «intakes» (записи факта) на «takeLogs»:

```js
export function getTakeLogs() {
  return getItem(STORAGE_KEYS.TAKE_LOGS, [])
}

export function setTakeLogs(takeLogs) {
  setItem(STORAGE_KEYS.TAKE_LOGS, takeLogs)
}

export function addTakeLog(takeLog) {
  const takeLogs = getTakeLogs()
  takeLogs.push(takeLog)
  setTakeLogs(takeLogs)
  return takeLog
}

export function removeTakeLog(takeLogId) {
  const takeLogs = getTakeLogs()
  const filtered = takeLogs.filter(i => i.id !== takeLogId)
  setTakeLogs(filtered)
  return filtered
}
```

В секции cancellations переименовать параметр и предикат:

```js
export function addCancellation(intakeId, date) {
  const cancellations = getCancellations()
  const existing = cancellations.find(c => c.intakeId === intakeId && c.date === date)
  if (!existing) {
    cancellations.push({ intakeId, date })
    setCancellations(cancellations)
  }
}

export function removeCancellation(intakeId, date) {
  const cancellations = getCancellations()
  const filtered = cancellations.filter(c => !(c.intakeId === intakeId && c.date === date))
  setCancellations(filtered)
}

export function isIntakeCancelled(intakeId, date) {
  const cancellations = getCancellations()
  return cancellations.some(c => c.intakeId === intakeId && c.date === date)
}
```

Переименовать `pruneOldIntakes` → `pruneOldTakeLogs`, тело с новыми именами:

```js
export function pruneOldTakeLogs() {
  const today = getTodayDateStr()
  const yesterday = getYesterdayDateStr()
  const takeLogs = getTakeLogs()
  const filtered = takeLogs.filter(i => i.date === today || i.date === yesterday)
  setTakeLogs(filtered)
}
```

- [ ] **Step 2: Проверить сборку**

Run (из `src`): `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" build -t "Amazfit Balance 2"`
Expected: сборка без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/utils/storage.js
git commit -m "refactor: storage functions for intakes/takeLogs"
```

---

### Task 3: Синхронизация и app-side (`utils/sync.js`, `app-side/index.js`)

**Files:**
- Modify: `src/utils/sync.js`
- Modify: `src/app-side/index.js`

- [ ] **Step 1: Обновить `utils/sync.js`**

Полное новое содержимое файла:

```js
import { log as Logger } from '@zos/utils'
import { ZML_METHODS } from './constants'
import { getSyncQueue, addToSyncQueue, clearSyncedItems, pruneOldTakeLogs } from './storage'

const logger = Logger.getLogger('aibolit-sync')

let sideService = null

export function initSync(zmlSideService) {
  sideService = zmlSideService
  logger.log('Sync module initialized')
}

export function sendTakeLogToPhone(takeLog) {
  addToSyncQueue(takeLog)
  trySyncNow()
}

function trySyncNow() {
  if (!sideService) return

  const queue = getSyncQueue()
  if (queue.length === 0) return

  const payload = {
    method: ZML_METHODS.SYNC_INTAKE,
    params: {
      records: queue,
    },
  }

  try {
    sideService.call(payload)
    const ids = queue.map(item => item.id)
    clearSyncedItems(ids)
    pruneOldTakeLogs()
    logger.log(`Synced ${ids.length} records to phone`)
  } catch (error) {
    logger.log(`Sync failed: ${error}, will retry later`)
  }
}

export function sendCancellationToPhone(intakeId, date) {
  if (!sideService) return

  const payload = {
    method: ZML_METHODS.SYNC_CANCELLATION,
    params: {
      intakeId,
      date,
    },
  }

  try {
    sideService.call(payload)
    logger.log(`Cancellation synced for ${intakeId} on ${date}`)
  } catch (error) {
    logger.log(`Cancellation sync failed: ${error}`)
  }
}

export function retrySync() {
  trySyncNow()
}
```

- [ ] **Step 2: Обновить `app-side/index.js`**

Полное новое содержимое файла:

```js
import { BaseSideService } from '@zeppos/zml/base-side'
import { ZML_METHODS } from '../utils/constants'

AppSideService(
  BaseSideService({
    onInit() {
      console.log('Side Service onInit')
    },

    onRun() {
      console.log('Side Service onRun')
    },

    onDestroy() {
      console.log('Side Service onDestroy')
    },

    onRequest(req, res) {
      console.log(`onRequest method: ${req.method}`)

      if (req.method === ZML_METHODS.SYNC_INTAKE) {
        const { records } = req.params
        if (records && records.length > 0) {
          for (const record of records) {
            const dateKey = `history_${record.date}`
            const existing = settings.settingsStorage.getItem(dateKey)
            const history = existing ? JSON.parse(existing) : []
            history.push(record)
            settings.settingsStorage.setItem(dateKey, JSON.stringify(history))
          }
          res(null, { success: true, count: records.length })
        } else {
          res(null, { success: true, count: 0 })
        }
        return
      }

      if (req.method === ZML_METHODS.SYNC_CANCELLATION) {
        const { intakeId, date } = req.params
        const dateKey = `history_${date}`
        const existing = settings.settingsStorage.getItem(dateKey)
        const history = existing ? JSON.parse(existing) : []
        history.push({
          intakeId,
          date,
          status: 'cancelled',
          syncedAt: new Date().toISOString(),
        })
        settings.settingsStorage.setItem(dateKey, JSON.stringify(history))
        res(null, { success: true })
        return
      }

      res('unknown method', null)
    },

    onCall(data) {
      console.log(`onCall method: ${data.method}`)
    },
  })
)
```

- [ ] **Step 3: Проверить сборку**

Run (из `src`): `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" build -t "Amazfit Balance 2"`
Expected: сборка без ошибок.

- [ ] **Step 4: Commit**

```bash
git add src/utils/sync.js src/app-side/index.js
git commit -m "refactor: sync takeLogs and intakes to phone"
```

---

### Task 4: Алarmы (`utils/schedule.js`)

**Files:**
- Modify: `src/utils/schedule.js`

- [ ] **Step 1: Полное новое содержимое файла**

```js
import { set as setAlarm, cancel as cancelAlarm, getAllAlarms, REPEAT_WEEK, REPEAT_ONCE } from '@zos/alarm'
import { log as Logger } from '@zos/utils'
import { ALARM_MODES } from './constants'
import { getMedications, getIntakes, getTakeLogs, getTodayDateStr, isIntakeCancelled } from './storage'

const logger = Logger.getLogger('aibolit-schedule')

function getUTCSeconds(hours, minutes) {
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0)
  return Math.floor(target.getTime() / 1000)
}

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

export function createIntakeAlarm(intake) {
  const [hours, minutes] = intake.time.split(':').map(Number)
  const utcTime = getUTCSeconds(hours, minutes)
  const weekDaysMask = getWeekDaysBitmask(intake.weekDays)
  const param = JSON.stringify({
    mode: ALARM_MODES.REMINDER,
    intakeId: intake.id,
  })

  const option = {
    url: 'app-service/reminder',
    time: utcTime,
    repeat_type: REPEAT_WEEK,
    week_days: weekDaysMask,
    param: param,
    store: true,
  }

  const id = setAlarm(option)
  logger.log(`Created alarm id=${id} for intake ${intake.id} at ${intake.time}`)
  return id
}

export function createRetryAlarm(intakeId, delayMinutes) {
  const delaySeconds = delayMinutes * 60
  const param = JSON.stringify({
    mode: ALARM_MODES.RETRY,
    intakeId: intakeId,
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

export function createSnoozeAlarm(intakeId, delayMinutes) {
  const delaySeconds = delayMinutes * 60
  const param = JSON.stringify({
    mode: ALARM_MODES.SNOOZE,
    intakeId: intakeId,
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

function getEnabledItems(intake) {
  const medications = getMedications()
  return (intake.items || []).filter(item => {
    const med = medications.find(m => m.id === item.medicationId)
    return med && med.enabled
  })
}

export function refreshAlarms() {
  const intakes = getIntakes()
  const todayDateStr = getTodayDateStr()
  const dayOfWeek = new Date().getDay() === 0 ? 7 : new Date().getDay()

  const allAlarms = getAllAlarms()
  if (allAlarms && allAlarms.length > 0) {
    for (const alarm of allAlarms) {
      cancelAlarm(alarm.id)
    }
  }

  for (const intake of intakes) {
    if (getEnabledItems(intake).length === 0) continue

    if (intake.weekDays && intake.weekDays.length > 0 && !intake.weekDays.includes(dayOfWeek)) continue

    if (isIntakeCancelled(intake.id, todayDateStr)) continue

    const todayLogs = getTakeLogs().filter(i => i.intakeId === intake.id && i.date === todayDateStr)
    const isTaken = todayLogs.some(i => i.status === 'taken')
    if (isTaken) continue

    createIntakeAlarm(intake)
  }

  logger.log('Alarms refreshed')
}

export function cancelAlarmById(alarmId) {
  cancelAlarm(alarmId)
}
```

- [ ] **Step 2: Проверить сборку**

Run (из `src`): `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" build -t "Amazfit Balance 2"`
Expected: сборка без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/utils/schedule.js
git commit -m "refactor: alarms operate on intakes"
```

---

### Task 5: Сервисы уведомлений (`app-service/reminder.js`, `take.js`, `snooze-handler.js`)

**Files:**
- Modify: `src/app-service/reminder.js`
- Modify: `src/app-service/take.js`
- Modify: `src/app-service/snooze-handler.js`

- [ ] **Step 1: Полное новое содержимое `reminder.js`**

```js
import { log as Logger } from '@zos/utils'
import { notify } from '@zos/notification'
import { getSettings, getIntakes, getMedications, getTakeLogs, isIntakeCancelled, getTodayDateStr } from '../utils/storage'
import { createRetryAlarm } from '../utils/schedule'
import { ALARM_MODES } from '../utils/constants'

const logger = Logger.getLogger('aibolit-reminder')

function buildContent(intake) {
  const medications = getMedications()
  const lines = []
  for (const item of intake.items || []) {
    const med = medications.find(m => m.id === item.medicationId)
    if (!med || !med.enabled) continue
    lines.push((med.name || '') + (item.amount ? ' \u00d7 ' + item.amount : ''))
  }
  return lines.join(', ') || 'Примите лекарство'
}

AppService({
  onEvent(e) {
    logger.log('reminder onEvent: ' + e)

    let params
    try {
      params = JSON.parse(e)
    } catch (err) {
      logger.log('Failed to parse event params: ' + e)
      return
    }

    const { mode, intakeId } = params
    if (!intakeId) return

    const intake = getIntakes().find(i => i.id === intakeId)
    if (!intake) return

    const todayDateStr = getTodayDateStr()

    if (isIntakeCancelled(intakeId, todayDateStr)) return

    const takeLogs = getTakeLogs()
    const alreadyTaken = takeLogs.some(i => i.intakeId === intakeId && i.date === todayDateStr && i.status === 'taken')
    if (alreadyTaken) return

    const title = intake.label || intake.time
    const content = buildContent(intake)

    notify({
      title: title,
      content: content,
      vibrate: 1,
      actions: [
        {
          text: 'Принял',
          file: 'app-service/take',
          param: JSON.stringify({ intakeId }),
        },
        {
          text: 'Отложить',
          file: 'page/snooze/index',
          param: JSON.stringify({ intakeId }),
        },
      ],
    })

    if (mode === ALARM_MODES.REMINDER) {
      const settings = getSettings()
      createRetryAlarm(intakeId, settings.retryInterval)
    }

    logger.log('Notification sent for ' + title)
  },

  onInit(e) {
    logger.log('reminder onInit(' + e + ')')
  },

  onDestroy() {
    logger.log('reminder onDestroy')
  },
})
```

- [ ] **Step 2: Полное новое содержимое `take.js`**

```js
import { log as Logger } from '@zos/utils'
import { addTakeLog, getIntakes, getTodayDateStr } from '../utils/storage'
import { sendTakeLogToPhone } from '../utils/sync'
import { INTAKE_STATUS } from '../utils/constants'

const logger = Logger.getLogger('aibolit-take')

AppService({
  onEvent(e) {
    logger.log('take onEvent: ' + e)

    let params
    try {
      params = JSON.parse(e)
    } catch (err) {
      logger.log('Failed to parse: ' + e)
      return
    }

    const { intakeId } = params
    if (!intakeId) return

    const intake = getIntakes().find(i => i.id === intakeId)
    if (!intake) return

    const todayDateStr = getTodayDateStr()
    const now = new Date()
    const takenTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')

    const takeLog = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      intakeId: intakeId,
      date: todayDateStr,
      time: intake.time,
      takenTime: takenTime,
      status: INTAKE_STATUS.TAKEN,
      items: (intake.items || []).map(item => ({ ...item })),
    }

    addTakeLog(takeLog)
    sendTakeLogToPhone(takeLog)
    logger.log('Intake ' + intakeId + ' taken at ' + takenTime)
  },

  onInit(e) {
    logger.log('take onInit')
  },

  onDestroy() {
    logger.log('take onDestroy')
  },
})
```

- [ ] **Step 3: Полное новое содержимое `snooze-handler.js`**

```js
import { log as Logger } from '@zos/utils'
import { createSnoozeAlarm } from '../utils/schedule'
import { addTakeLog, getIntakes, getTodayDateStr } from '../utils/storage'
import { INTAKE_STATUS } from '../utils/constants'

const logger = Logger.getLogger('aibolit-snooze')

AppService({
  onEvent(e) {
    logger.log('snooze-handler onEvent: ' + e)

    let params
    try {
      params = JSON.parse(e)
    } catch (err) {
      logger.log('Failed to parse: ' + e)
      return
    }

    const { intakeId, delayMinutes } = params
    if (!intakeId || !delayMinutes) return

    const intake = getIntakes().find(i => i.id === intakeId)
    if (!intake) return

    createSnoozeAlarm(intakeId, delayMinutes)

    const todayDateStr = getTodayDateStr()
    const now = new Date()
    const snoozeRecord = {
      id: 'snooze_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      intakeId: intakeId,
      date: todayDateStr,
      time: intake.time,
      takenTime: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
      status: INTAKE_STATUS.SNOOZED,
      items: (intake.items || []).map(item => ({ ...item })),
    }

    addTakeLog(snoozeRecord)
    logger.log('Snoozed intake ' + intakeId + ' for ' + delayMinutes + 'min')
  },

  onInit(e) {
    logger.log('snooze-handler onInit')
  },

  onDestroy() {
    logger.log('snooze-handler onDestroy')
  },
})
```

- [ ] **Step 4: Проверить сборку**

Run (из `src`): `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" build -t "Amazfit Balance 2"`
Expected: сборка без ошибок.

- [ ] **Step 5: Commit**

```bash
git add src/app-service/reminder.js src/app-service/take.js src/app-service/snooze-handler.js
git commit -m "refactor: services operate on intake groups"
```

---

### Task 6: Страница Snooze (`page/snooze/index.js`)

**Files:**
- Modify: `src/page/snooze/index.js`

- [ ] **Step 1: Полное новое содержимое файла**

```js
import { log as Logger } from '@zos/utils'
import { createWidget, widget, align, text_style } from '@zos/ui'
import { push as routerPush } from '@zos/router'
import { getSettings, getIntakes } from '../../utils/storage'

const logger = Logger.getLogger('aibolit-snooze-page')

Page({
  state: {
    intakeId: null,
    intake: null,
  },

  build() {
    logger.log('snooze page build')
  },

  onInit(params) {
    logger.log('snooze page onInit: ' + params)

    let parsed
    try {
      parsed = JSON.parse(params)
    } catch (e) {
      logger.log('Failed to parse params: ' + params)
      return
    }

    this.state.intakeId = parsed.intakeId
    this.state.intake = getIntakes().find(i => i.id === parsed.intakeId) || null

    this.renderSnoozeOptions()
  },

  onDestroy() {
    logger.log('snooze page onDestroy')
  },

  renderSnoozeOptions() {
    const screenWidth = 480
    const settings = getSettings()
    const options = settings.snoozeOptions || [30, 45, 60, 90]
    const intake = this.state.intake
    let y = 40

    createWidget(widget.TEXT, {
      x: 0,
      y: y,
      w: screenWidth,
      h: 30,
      color: 0xffffff,
      text_size: 18,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: intake ? (intake.label || intake.time) : '',
    })
    y += 45

    createWidget(widget.TEXT, {
      x: 0,
      y: y,
      w: screenWidth,
      h: 24,
      color: 0x888888,
      text_size: 14,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: 'Отложить на:',
    })
    y += 40

    const btnWidth = 140
    const btnHeight = 80
    const gap = 20
    const startX = Math.floor((screenWidth - btnWidth * 2 - gap) / 2)
    let col = 0
    let row = 0

    for (const minutes of options) {
      const bx = startX + col * (btnWidth + gap)
      const by = y + row * (btnHeight + gap)

      createWidget(widget.TEXT, {
        x: bx,
        y: by + Math.floor(btnHeight / 2) - 15,
        w: btnWidth,
        h: 40,
        color: 0x4fc3f7,
        text_size: 28,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: String(minutes),
      })

      createWidget(widget.TEXT, {
        x: bx,
        y: by + Math.floor(btnHeight / 2) + 15,
        w: btnWidth,
        h: 20,
        color: 0x888888,
        text_size: 14,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: 'мин',
      })

      const btnArea = createWidget(widget.TEXT, {
        x: bx,
        y: by,
        w: btnWidth,
        h: btnHeight,
        color: 0xFFFFFF,
        text_size: 1,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: '',
      })
      btnArea.addEventListener(widget.CLICK_EVENT, () => {
        this.confirmSnooze(minutes)
      })

      col++
      if (col >= 2) {
        col = 0
        row++
      }
    }
  },

  confirmSnooze(delayMinutes) {
    const intakeId = this.state.intakeId

    const param = JSON.stringify({
      intakeId: intakeId,
      delayMinutes: delayMinutes,
    })

    routerPush({ url: 'app-service/snooze-handler', param: param })
  },
})
```

- [ ] **Step 2: Проверить сборку**

Run (из `src`): `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" build -t "Amazfit Balance 2"`
Expected: сборка без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/page/snooze/index.js
git commit -m "refactor: snooze page for intake groups"
```

---

### Task 7: Страница Home (`page/home/index.js`)

**Files:**
- Modify: `src/page/home/index.js`

- [ ] **Step 1: Полное новое содержимое файла**

```js
import { log as Logger } from '@zos/utils'
import { createWidget, widget, align, text_style } from '@zos/ui'
import { push as routerPush } from '@zos/router'
import { getMedications, getIntakes, getTakeLogs, getCancellations, addTakeLog, getTodayDateStr } from '../../utils/storage'
import { sendTakeLogToPhone } from '../../utils/sync'

const logger = Logger.getLogger('aibolit-home')

Page({
  state: {
    intakes: [],
  },

  build() {
    logger.log('home page build')
    this.refreshView()
  },

  onInit() {
    logger.log('home page onInit')
  },

  onDestroy() {
    logger.log('home page onDestroy')
  },

  refreshView() {
    const medications = getMedications()
    const intakes = getIntakes()
    const takeLogs = getTakeLogs()
    const cancellations = getCancellations()
    const todayDateStr = getTodayDateStr()
    const currentTime = new Date()
    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes()

    const enabledMedMap = {}
    for (const med of medications) {
      if (med.enabled) enabledMedMap[med.id] = med
    }

    const relevant = intakes
      .map(intake => ({
        intake,
        items: (intake.items || [])
          .map(item => ({ med: enabledMedMap[item.medicationId], amount: item.amount }))
          .filter(({ med }) => med),
      }))
      .filter(({ items }) => items.length > 0)
      .filter(({ intake }) => {
        const [h, m] = intake.time.split(':').map(Number)
        const intakeMinutes = h * 60 + m
        return intakeMinutes >= currentMinutes
      })
      .filter(({ intake }) => {
        const dayOfWeek = currentTime.getDay() === 0 ? 7 : currentTime.getDay()
        if (intake.weekDays && intake.weekDays.length > 0 && !intake.weekDays.includes(dayOfWeek)) return false
        return true
      })
      .filter(({ intake }) => {
        const taken = takeLogs.some(i => i.intakeId === intake.id && i.date === todayDateStr && i.status === 'taken')
        return !taken
      })
      .filter(({ intake }) => {
        return !cancellations.some(c => c.intakeId === intake.id && c.date === todayDateStr)
      })

    const sorted = relevant.sort((a, b) => a.intake.time.localeCompare(b.intake.time))

    this.state.intakes = sorted
    this.renderUpcoming(sorted)
  },

  renderUpcoming(entries) {
    const screenWidth = 480
    let y = 20

    createWidget(widget.TEXT, {
      x: 0,
      y: y,
      w: screenWidth,
      h: 36,
      color: 0xffffff,
      text_size: 20,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: 'Ближайшие приёмы',
    })
    y += 50

    if (entries.length === 0) {
      createWidget(widget.TEXT, {
        x: 0,
        y: y,
        w: screenWidth,
        h: 36,
        color: 0x888888,
        text_size: 16,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: 'Нет предстоящих приёмов',
      })
      return
    }

    for (const entry of entries) {
      if (y > 440) break

      const intake = entry.intake

      createWidget(widget.TEXT, {
        x: 20,
        y: y,
        w: screenWidth - 60,
        h: 30,
        color: 0x4fc3f7,
        text_size: 16,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: '───── ' + intake.time + ' ────',
      })
      y += 35

      for (const item of entry.items) {
        createWidget(widget.TEXT, {
          x: 40,
          y: y,
          w: screenWidth - 90,
          h: 28,
          color: 0xffffff,
          text_size: 15,
          align_h: align.LEFT,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: item.med.name + ' \u00d7 ' + (item.amount || ''),
        })
        y += 30
      }

      const checkboxX = screenWidth - 50
      const checkboxY = y - (entry.items.length * 30) - 5
      const checkboxH = entry.items.length * 30 + 10

      const takeAllBtn = createWidget(widget.TEXT, {
        x: checkboxX,
        y: checkboxY,
        w: 40,
        h: checkboxH,
        color: 0x4fc3f7,
        text_size: 22,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: '\u2610',
      })
      takeAllBtn.addEventListener(widget.CLICK_EVENT, () => {
        this.takeIntake(intake)
      })

      y += 10
    }

    const planBtnY = y + 10
    const planBtn = createWidget(widget.TEXT, {
      x: 0,
      y: planBtnY,
      w: screenWidth,
      h: 36,
      color: 0x888888,
      text_size: 16,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: '[Полный план \u2192]',
    })
    planBtn.addEventListener(widget.CLICK_EVENT, () => {
      routerPush({ url: 'page/plan/index' })
    })
  },

  takeIntake(intake) {
    const todayDateStr = getTodayDateStr()
    const now = new Date()
    const takenTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')

    const takeLog = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      intakeId: intake.id,
      date: todayDateStr,
      time: intake.time,
      takenTime: takenTime,
      status: 'taken',
      items: (intake.items || []).map(item => ({ ...item })),
    }
    addTakeLog(takeLog)
    sendTakeLogToPhone(takeLog)

    this.refreshView()
  },
})
```

- [ ] **Step 2: Проверить сборку**

Run (из `src`): `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" build -t "Amazfit Balance 2"`
Expected: сборка без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/page/home/index.js
git commit -m "refactor: home page for intake groups"
```

---

### Task 8: Страница Plan (`page/plan/index.js`)

**Files:**
- Modify: `src/page/plan/index.js`

- [ ] **Step 1: Полное новое содержимое файла**

```js
import { log as Logger } from '@zos/utils'
import { createWidget, widget, align, text_style } from '@zos/ui'
import { push as routerPush } from '@zos/router'
import {
  getMedications,
  getIntakes,
  getTakeLogs,
  getCancellations,
  addCancellation,
  removeCancellation,
  getTodayDateStr,
  addTakeLog,
  removeTakeLog,
} from '../../utils/storage'
import { sendTakeLogToPhone, sendCancellationToPhone } from '../../utils/sync'

const logger = Logger.getLogger('aibolit-plan')

Page({
  state: {
    intakes: [],
  },

  build() {
    logger.log('plan page build')
    this.refreshView()
  },

  onInit() {
    logger.log('plan page onInit')
  },

  onDestroy() {
    logger.log('plan page onDestroy')
  },

  refreshView() {
    const medications = getMedications()
    const intakes = getIntakes()
    const takeLogs = getTakeLogs()
    const cancellations = getCancellations()
    const todayDateStr = getTodayDateStr()

    const enabledMedMap = {}
    for (const med of medications) {
      if (med.enabled) enabledMedMap[med.id] = med
    }

    const dayOfWeek = new Date().getDay() === 0 ? 7 : new Date().getDay()

    const today = intakes
      .map(intake => ({
        intake,
        items: (intake.items || [])
          .map(item => ({ med: enabledMedMap[item.medicationId], amount: item.amount }))
          .filter(({ med }) => med),
      }))
      .filter(({ items }) => items.length > 0)
      .filter(({ intake }) => {
        if (intake.weekDays && intake.weekDays.length > 0 && !intake.weekDays.includes(dayOfWeek)) return false
        return true
      })
      .sort((a, b) => a.intake.time.localeCompare(b.intake.time))

    for (const entry of today) {
      const intake = entry.intake
      const intakeLogs = takeLogs.filter(i => i.intakeId === intake.id && i.date === todayDateStr)
      const takenLog = intakeLogs.find(i => i.status === 'taken')
      const isCancelled = cancellations.some(c => c.intakeId === intake.id && c.date === todayDateStr)

      entry._taken = !!takenLog
      entry._takenTime = takenLog ? takenLog.takenTime : null
      entry._cancelled = isCancelled
    }

    this.state.intakes = today
    this.renderPlan(today)
  },

  renderPlan(entries) {
    const screenWidth = 480
    let y = 20

    createWidget(widget.TEXT, {
      x: 0,
      y: y,
      w: screenWidth,
      h: 36,
      color: 0xffffff,
      text_size: 20,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: 'План на сегодня',
    })
    y += 50

    if (entries.length === 0) {
      createWidget(widget.TEXT, {
        x: 0,
        y: y,
        w: screenWidth,
        h: 36,
        color: 0x888888,
        text_size: 16,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: 'Нет приёмов на сегодня',
      })
      return
    }

    for (const entry of entries) {
      if (y > 440) break

      const intake = entry.intake
      const textColor = entry._cancelled ? 0x666666 : (entry._taken ? 0x4caf50 : 0xffffff)
      const headerDecor = entry._cancelled ? text_style.STRIKETHROUGH : text_style.NONE
      const statusIcon = entry._taken ? ' \u2713' : ''
      const headerText = '───── ' + intake.time + ' ────' + statusIcon

      createWidget(widget.TEXT, {
        x: 20,
        y: y,
        w: screenWidth - 40,
        h: 30,
        color: textColor,
        text_size: 16,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
        text_style: headerDecor,
        text: headerText,
      })
      y += 35

      for (const item of entry.items) {
        const medColor = entry._cancelled ? 0x555555 : (entry._taken ? 0x888888 : 0xffffff)
        const medDecor = entry._cancelled ? text_style.STRIKETHROUGH : text_style.NONE
        const checkMark = entry._taken ? '\u2713 ' : '  '
        createWidget(widget.TEXT, {
          x: 40,
          y: y,
          w: screenWidth - 80,
          h: 28,
          color: medColor,
          text_size: 15,
          align_h: align.LEFT,
          align_v: align.CENTER_V,
          text_style: medDecor,
          text: checkMark + item.med.name + ' \u00d7 ' + (item.amount || ''),
        })
        y += 28
      }

      if (entry._taken && entry._takenTime) {
        createWidget(widget.TEXT, {
          x: 40,
          y: y,
          w: screenWidth - 80,
          h: 22,
          color: 0x666666,
          text_size: 13,
          align_h: align.LEFT,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: 'приняты в ' + entry._takenTime,
        })
        y += 25
      }

      if (entry._cancelled) {
        const restoreBtn = createWidget(widget.TEXT, {
          x: 40,
          y: y,
          w: screenWidth - 80,
          h: 22,
          color: 0x4fc3f7,
          text_size: 13,
          align_h: align.LEFT,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: 'вернуть прием',
        })
        restoreBtn.addEventListener(widget.CLICK_EVENT, () => {
          this.restoreIntake(intake)
        })
        y += 25
      }

      const indicatorX = screenWidth - 50
      const medAreaH = entry.items.length * 28 + (entry._takenTime ? 25 : 0)
      const indicatorY = y - medAreaH - 5
      const indicatorH = medAreaH + 10

      if (!entry._cancelled && !entry._taken) {
        const checkBtn = createWidget(widget.TEXT, {
          x: indicatorX,
          y: indicatorY,
          w: 40,
          h: indicatorH,
          color: 0xffffff,
          text_size: 22,
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: '\u2610',
        })
        checkBtn.addEventListener(widget.CLICK_EVENT, () => {
          this.takeIntake(intake)
        })
        checkBtn.addEventListener(widget.LONGPRESS_EVENT, () => {
          this.cancelIntake(intake)
        })
      }

      if (entry._taken) {
        const undoBtn = createWidget(widget.TEXT, {
          x: indicatorX,
          y: indicatorY,
          w: 40,
          h: indicatorH,
          color: 0x4caf50,
          text_size: 22,
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: '\u2713',
        })
        undoBtn.addEventListener(widget.CLICK_EVENT, () => {
          this.undoIntake(intake)
        })
      }

      y += 15
    }

    const backBtnY = y + 10
    const backBtn = createWidget(widget.TEXT, {
      x: 0,
      y: backBtnY,
      w: screenWidth,
      h: 36,
      color: 0x888888,
      text_size: 16,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: '[На главную]',
    })
    backBtn.addEventListener(widget.CLICK_EVENT, () => {
      routerPush({ url: 'page/home/index' })
    })
  },

  takeIntake(intake) {
    const todayDateStr = getTodayDateStr()
    const now = new Date()
    const takenTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')

    const takeLog = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      intakeId: intake.id,
      date: todayDateStr,
      time: intake.time,
      takenTime: takenTime,
      status: 'taken',
      items: (intake.items || []).map(item => ({ ...item })),
    }
    addTakeLog(takeLog)
    sendTakeLogToPhone(takeLog)

    this.refreshView()
  },

  undoIntake(intake) {
    const todayDateStr = getTodayDateStr()
    const takeLogs = getTakeLogs()
    const toRemove = takeLogs.filter(i => i.intakeId === intake.id && i.date === todayDateStr && i.status === 'taken')
    for (const takeLog of toRemove) {
      removeTakeLog(takeLog.id)
    }
    this.refreshView()
  },

  cancelIntake(intake) {
    const todayDateStr = getTodayDateStr()
    addCancellation(intake.id, todayDateStr)
    sendCancellationToPhone(intake.id, todayDateStr)
    this.refreshView()
  },

  restoreIntake(intake) {
    const todayDateStr = getTodayDateStr()
    removeCancellation(intake.id, todayDateStr)
    this.refreshView()
  },
})
```

- [ ] **Step 2: Проверить сборку**

Run (из `src`): `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" build -t "Amazfit Balance 2"`
Expected: сборка без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/page/plan/index.js
git commit -m "refactor: plan page for intake groups"
```

---

### Task 9: Настройки-компаньон (`setting/index.js`)

**Files:**
- Modify: `src/setting/index.js`

- [ ] **Step 1: Полное новое содержимое файла**

```js
const STORAGE_KEYS = {
  medications: 'medications',
  intakes: 'intakes',
  settings: 'settings',
}

const DEFAULT_SETTINGS = { retryInterval: 60, syncInterval: 60, snoozeOptions: [30, 45, 60, 90] }

const DAY_NAMES = [
  { name: 'Пн', value: '1' },
  { name: 'Вт', value: '2' },
  { name: 'Ср', value: '3' },
  { name: 'Чт', value: '4' },
  { name: 'Пт', value: '5' },
  { name: 'Сб', value: '6' },
  { name: 'Вс', value: '7' },
]

const S = {
  page: { padding: '12px 20px' },
  title: { fontSize: '18px', marginBottom: '8px' },
  field: { marginBottom: '12px' },
  row: { padding: '10px 0', borderBottom: '1px solid #eaeaea' },
  rowTitle: { fontSize: '15px' },
  rowSub: { fontSize: '12px', color: '#888' },
  hint: { fontSize: '13px', color: '#888', marginTop: '10px' },
  btn: { marginTop: '10px' },
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function todayDateStr() {
  const t = new Date()
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0')
}

function dayName(d) {
  const found = DAY_NAMES.find(x => x.value === String(d))
  return found ? found.name : String(d)
}

AppSettingsPage({
  state: {
    props: null,
    page: 'list',
    editDraft: null,
    intakeDraft: null,
    itemDraft: null,
    editingItemIndex: -1,
    viewHistoryDate: null,
    settingsDraft: null,
  },

  storage() {
    return this.state.props.settingsStorage
  },

  getItem(key, defaultValue) {
    const val = this.storage().getItem(key)
    return val !== null && val !== undefined ? JSON.parse(val) : defaultValue
  },

  setItem(key, value) {
    this.storage().setItem(key, JSON.stringify(value))
  },

  getMedications() {
    return this.getItem(STORAGE_KEYS.medications, [])
  },

  setMedications(meds) {
    this.setItem(STORAGE_KEYS.medications, meds)
  },

  getIntakes() {
    return this.getItem(STORAGE_KEYS.intakes, [])
  },

  setIntakes(intakes) {
    this.setItem(STORAGE_KEYS.intakes, intakes)
  },

  getAppSettings() {
    return this.getItem(STORAGE_KEYS.settings, { ...DEFAULT_SETTINGS })
  },

  setAppSettings(s) {
    this.setItem(STORAGE_KEYS.settings, s)
  },

  getHistoryForDate(dateStr) {
    const data = this.storage().getItem('history_' + dateStr)
    return data ? JSON.parse(data) : []
  },

  forceRender() {
    this.storage().setItem('__ui_render', String(Date.now()))
  },

  navigateTo(page, params) {
    this.state.page = page
    if (page === 'edit') {
      this.state.editDraft = params && params.medication
        ? { ...params.medication }
        : { name: '', dosage: '', comments: '', enabled: true, id: null }
    } else if (page === 'intakeEdit') {
      this.state.intakeDraft = params && params.intake
        ? { ...params.intake, items: (params.intake.items || []).map(i => ({ ...i })) }
        : { time: '08:00', weekDays: null, label: '', items: [], id: null }
    } else if (page === 'itemEdit') {
      const draft = this.state.intakeDraft
      const index = params && params.index !== undefined ? params.index : -1
      this.state.editingItemIndex = index
      this.state.itemDraft = index >= 0 && draft.items[index]
        ? { ...draft.items[index] }
        : { medicationId: null, amount: '' }
    } else if (page === 'history') {
      if (params && params.date !== undefined) this.state.viewHistoryDate = params.date
    } else if (page === 'settings') {
      this.state.settingsDraft = this.getAppSettings()
    }
    this.forceRender()
  },

  build(props) {
    this.state.props = props
    switch (this.state.page) {
      case 'edit':
        return this.renderMedicationEdit()
      case 'intakes':
        return this.renderIntakeList()
      case 'intakeEdit':
        return this.renderIntakeEdit()
      case 'itemEdit':
        return this.renderItemEdit()
      case 'history':
        return this.renderHistory()
      case 'settings':
        return this.renderSettingsPage()
      default:
        return this.renderMedicationList()
    }
  },

  // ── Medication List Page ──

  renderMedicationList() {
    const medications = this.getMedications()
    const intakes = this.getIntakes()

    const rows = []
    for (const med of medications) {
      const intakeCount = intakes.filter(x => (x.items || []).some(item => item.medicationId === med.id)).length
      const subText = intakeCount > 0 ? 'в ' + intakeCount + ' приёмах' : ''
      rows.push(
        View(
          { style: S.row, onClick: () => this.navigateTo('edit', { medication: med }) },
          [
            Text({ style: S.rowTitle }, [med.name + ' (' + med.dosage + ')' + (!med.enabled ? ' [OFF]' : '')]),
            subText ? Text({ style: S.rowSub }, [subText]) : null,
          ],
        ),
      )
    }
    if (rows.length === 0) {
      rows.push(Text({ style: S.hint }, ['Нет лекарств. Добавьте первое.']))
    }

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, ['Лекарства']),
      ...rows,
      Button({ label: '+ Добавить лекарство', color: 'primary', style: S.btn, onClick: () => this.navigateTo('edit', { medication: null }) }),
      Button({ label: 'Приёмы', color: 'default', style: S.btn, onClick: () => this.navigateTo('intakes') }),
      Button({ label: 'История', color: 'default', style: S.btn, onClick: () => this.navigateTo('history') }),
      Button({ label: 'Настройки', color: 'default', style: S.btn, onClick: () => this.navigateTo('settings') }),
    ])
  },

  // ── Medication Edit Page ──

  renderMedicationEdit() {
    const draft = this.state.editDraft
    const isNew = !draft.id

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, [isNew ? 'Добавить лекарство' : 'Редактировать лекарство']),
      View({ style: S.field }, [TextInput({ label: 'Название', placeholder: 'Название', value: draft.name, onChange: v => { draft.name = v } })]),
      View({ style: S.field }, [TextInput({ label: 'Дозировка', placeholder: 'Дозировка', value: draft.dosage, onChange: v => { draft.dosage = v } })]),
      View({ style: S.field }, [TextInput({ label: 'Комментарии', placeholder: 'Комментарии', value: draft.comments, onChange: v => { draft.comments = v } })]),
      View({ style: S.field }, [Toggle({ label: 'Активно', value: draft.enabled, onChange: v => { draft.enabled = v } })]),
      Button({
        label: 'Сохранить',
        color: 'primary',
        style: S.btn,
        onClick: () => {
          if (!draft.name.trim()) return
          const medications = this.getMedications()
          if (isNew) {
            draft.id = generateId()
            medications.push(draft)
          } else {
            const idx = medications.findIndex(m => m.id === draft.id)
            if (idx >= 0) medications[idx] = draft
          }
          this.setMedications(medications)
          this.navigateTo('list')
        },
      }),
      Button({ label: 'Назад', color: 'default', style: S.btn, onClick: () => this.navigateTo('list') }),
    ])
  },

  // ── Intake List Page ──

  renderIntakeList() {
    const intakes = this.getIntakes()
    const medications = this.getMedications()
    const medMap = {}
    for (const med of medications) medMap[med.id] = med

    const rows = []
    for (const intake of intakes) {
      const daysText = intake.weekDays && intake.weekDays.length
        ? intake.weekDays.map(d => dayName(d)).join(', ')
        : 'Каждый день'
      const itemsText = (intake.items || []).map(item => {
        const med = medMap[item.medicationId]
        const name = med ? med.name : '?'
        return name + ' \u00d7 ' + (item.amount || '')
      }).join(', ')

      rows.push(
        View(
          { style: S.row, onClick: () => this.navigateTo('intakeEdit', { intake }) },
          [
            Text({ style: S.rowTitle }, [(intake.label || intake.time) + ' — ' + intake.time]),
            Text({ style: S.rowSub }, [daysText + (itemsText ? ' · ' + itemsText : '')]),
          ],
        ),
      )
    }
    if (rows.length === 0) {
      rows.push(Text({ style: S.hint }, ['Нет приёмов. Добавьте первый.']))
    }

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, ['Приёмы']),
      ...rows,
      Button({ label: '+ Добавить приём', color: 'primary', style: S.btn, onClick: () => this.navigateTo('intakeEdit', { intake: null }) }),
      Button({ label: 'Назад', color: 'default', style: S.btn, onClick: () => this.navigateTo('list') }),
    ])
  },

  // ── Intake Edit Page ──

  renderIntakeEdit() {
    const draft = this.state.intakeDraft
    const isNew = !draft.id
    const medications = this.getMedications()
    const medMap = {}
    for (const med of medications) medMap[med.id] = med
    const everyDay = !draft.weekDays || draft.weekDays.length === 0
    const weekDaysValue = everyDay ? [] : draft.weekDays.map(d => String(d))

    const itemRows = []
    for (let i = 0; i < draft.items.length; i++) {
      const item = draft.items[i]
      const med = medMap[item.medicationId]
      const name = med ? med.name : '?'
      itemRows.push(
        View(
          { style: S.row, onClick: () => this.navigateTo('itemEdit', { index: i }) },
          [Text({ style: S.rowTitle }, [name + ' \u00d7 ' + (item.amount || '')])],
        ),
      )
    }
    if (itemRows.length === 0) {
      itemRows.push(Text({ style: S.hint }, ['Нет лекарств в приёме']))
    }

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, [isNew ? 'Добавить приём' : 'Редактировать приём']),
      View({ style: S.field }, [TextInput({ label: 'Время', placeholder: 'ЧЧ:ММ', value: draft.time, onChange: v => { draft.time = v } })]),
      View({ style: S.field }, [TextInput({ label: 'Метка (утро/день/вечер)', placeholder: 'Метка', value: draft.label, onChange: v => { draft.label = v } })]),
      View({ style: S.field }, [Toggle({ label: 'Каждый день', value: everyDay, onChange: v => { draft.weekDays = v ? null : [] } })]),
      View({ style: S.field }, [
        Select({
          label: 'Дни недели',
          title: 'Дни недели',
          options: DAY_NAMES,
          multiple: true,
          value: weekDaysValue,
          onChange: v => {
            const arr = Array.isArray(v) ? v : [v]
            draft.weekDays = arr.map(x => Number(x))
          },
        }),
      ]),
      Text({ style: S.title, bold: true }, ['Лекарства']),
      ...itemRows,
      Button({ label: '+ Добавить лекарство', color: 'primary', style: S.btn, onClick: () => this.navigateTo('itemEdit', { index: -1 }) }),
      Button({
        label: 'Сохранить',
        color: 'primary',
        style: S.btn,
        onClick: () => {
          if (!draft.time.trim() || draft.items.length === 0) return
          const intakes = this.getIntakes()
          if (isNew) {
            draft.id = generateId()
            intakes.push(draft)
          } else {
            const idx = intakes.findIndex(x => x.id === draft.id)
            if (idx >= 0) intakes[idx] = draft
          }
          this.setIntakes(intakes)
          this.navigateTo('intakes')
        },
      }),
      !isNew && Button({
        label: 'Удалить',
        color: 'default',
        style: S.btn,
        onClick: () => {
          const intakes = this.getIntakes().filter(x => x.id !== draft.id)
          this.setIntakes(intakes)
          this.navigateTo('intakes')
        },
      }),
      Button({ label: 'Назад', color: 'default', style: S.btn, onClick: () => this.navigateTo('intakes') }),
    ])
  },

  // ── Item Edit Page ──

  renderItemEdit() {
    const draft = this.state.itemDraft
    const medications = this.getMedications()
    const index = this.state.editingItemIndex
    const isEditing = index >= 0

    const options = medications.map(m => ({ name: m.name + (m.dosage ? ' (' + m.dosage + ')' : ''), value: m.id }))
    const selectedValue = draft.medicationId ? [draft.medicationId] : []

    const rows = []
    if (medications.length === 0) {
      rows.push(Text({ style: S.hint }, ['Нет лекарств. Сначала добавьте лекарство.']))
    } else {
      rows.push(
        View({ style: S.field }, [
          Select({
            label: 'Лекарство',
            title: 'Лекарство',
            options: options,
            value: selectedValue,
            onChange: v => {
              const arr = Array.isArray(v) ? v : [v]
              draft.medicationId = arr[0] || null
            },
          }),
        ]),
      )
      rows.push(
        View({ style: S.field }, [
          TextInput({ label: 'Количество', placeholder: '2 таблетки', value: draft.amount, onChange: v => { draft.amount = v } }),
        ]),
      )
      rows.push(
        Button({
          label: 'Сохранить',
          color: 'primary',
          style: S.btn,
          onClick: () => {
            if (!draft.medicationId) return
            const intake = this.state.intakeDraft
            if (isEditing) {
              intake.items[index] = { ...draft }
            } else {
              intake.items.push({ ...draft })
            }
            this.navigateTo('intakeEdit', { intake })
          },
        }),
      )
      if (isEditing) {
        rows.push(
          Button({
            label: 'Удалить из приёма',
            color: 'default',
            style: S.btn,
            onClick: () => {
              this.state.intakeDraft.items.splice(index, 1)
              this.navigateTo('intakeEdit', { intake: this.state.intakeDraft })
            },
          }),
        )
      }
    }

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, ['Лекарство в приёме']),
      ...rows,
      Button({ label: 'Назад', color: 'default', style: S.btn, onClick: () => this.navigateTo('intakeEdit', { intake: this.state.intakeDraft }) }),
    ])
  },

  // ── History Page ──

  renderHistory() {
    const dateStr = this.state.viewHistoryDate || todayDateStr()
    const records = this.getHistoryForDate(dateStr)
    const medications = this.getMedications()
    const medMap = {}
    for (const med of medications) medMap[med.id] = med

    const rows = []
    for (const rec of records) {
      const statusText = rec.status === 'taken'
        ? 'Принято в ' + (rec.takenTime || rec.time)
        : (rec.status === 'cancelled' ? 'Отменено' : rec.status)
      const itemsText = (rec.items || []).map(item => {
        const med = medMap[item.medicationId]
        const name = med ? med.name : '?'
        return name + ' \u00d7 ' + (item.amount || '')
      }).join(', ')
      rows.push(View({ style: S.row }, [
        Text({ style: S.rowTitle }, [(rec.time || '') + ' — ' + statusText]),
        itemsText ? Text({ style: S.rowSub }, [itemsText]) : null,
      ]))
    }
    if (rows.length === 0) {
      rows.push(Text({ style: S.hint }, ['Нет данных за эту дату']))
    }

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, ['История']),
      View({ style: S.field }, [
        TextInput({
          label: 'Дата (ГГГГ-ММ-ДД)',
          value: dateStr,
          onChange: v => {
            this.state.viewHistoryDate = v
            this.forceRender()
          },
        }),
      ]),
      ...rows,
      Button({
        label: 'Назад',
        color: 'default',
        style: S.btn,
        onClick: () => {
          this.state.viewHistoryDate = null
          this.navigateTo('list')
        },
      }),
    ])
  },

  // ── Settings Page ──

  renderSettingsPage() {
    const draft = this.state.settingsDraft

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, ['Настройки']),
      View({ style: S.field }, [
        TextInput({ label: 'Интервал повтора (мин)', value: String(draft.retryInterval), onChange: v => { draft.retryInterval = parseInt(v, 10) || 60 } }),
      ]),
      View({ style: S.field }, [
        TextInput({ label: 'Интервал синхронизации (мин)', value: String(draft.syncInterval), onChange: v => { draft.syncInterval = parseInt(v, 10) || 60 } }),
      ]),
      View({ style: S.field }, [
        TextInput({
          label: 'Варианты отложки (мин, через запятую)',
          value: draft.snoozeOptions.join(', '),
          onChange: v => { draft.snoozeOptions = v.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)) },
        }),
      ]),
      Button({
        label: 'Сохранить',
        color: 'primary',
        style: S.btn,
        onClick: () => {
          this.setAppSettings(draft)
          this.navigateTo('list')
        },
      }),
      Button({ label: 'Назад', color: 'default', style: S.btn, onClick: () => this.navigateTo('list') }),
    ])
  },
})
```

- [ ] **Step 2: Проверить сборку**

Run (из `src`): `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" build -t "Amazfit Balance 2"`
Expected: сборка без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/setting/index.js
git commit -m "feat: settings UI for intake groups with items"
```

---

### Task 10: Финальная сборка и проверка

**Files:**
- none (верификация)

- [ ] **Step 1: Полная сборка**

Run (из `src`): `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" build -t "Amazfit Balance 2"`
Expected: `[QJSC] Compiling JS files... done!` без ошибок.

- [ ] **Step 2: Смоок-проверка целостности**

Run: `git grep -e "getSchedule" -e "setSchedule" -e "isSlotCancelled" -e "pruneOldIntakes" -e "sendIntakeToPhone" -e "addIntake" -e "removeIntake" -e "scheduleId"` из корня проекта.
Expected: совпадений в `src/` нет (в `docs/` допустимы).

- [ ] **Step 3: Ручные сценарии на устройстве/эмуляторе**

Run: `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" preview --target "Amazfit Balance 2"` из `src`.

Проверить:
1. Companion: создать лекарства «Парацетамол» (дозировка 500мг) и «Аспирин» (100мг).
2. Companion: «Приёмы» → «+ Добавить приём» → время 08:00, каждый день, метка «утро», добавить оба лекарства с количеством («1 таблетка», «2 таблетки»). Сохранить.
3. Companion: список приёмов показывает состав и дни.
4. Home: приём 08:00 отображается с `Название × количество`.
5. Plan: take → приём отмечен ✓ с временем принятия; undo → сброс; long-press → отмена; restore → возврат.
6. Alarm (если возможно эмулировать): уведомление с заголовком «утро» и составом; «Принял» → одна запись; «Отложить» → страница snooze, выбор задержки.
7. Companion: История за дату показывает `08:00 — Принято в ЧЧ:ММ` и состав.
8. Medication edit: кнопки «Расписание» больше нет.

- [ ] **Step 4: Commit при изменениях по итогам проверки**

```bash
git add -A
git commit -m "fix: adjust intake-groups after device verification"
```

---
